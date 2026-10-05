import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { POST } from "@/app/api/bitrix/companies/route";
import * as bitrix from "@/lib/bitrix";
import * as authGuard from "@/lib/auth-guard";
import { BitrixTransientError } from "@/lib/bitrix";
import { useDashboardStore } from "@/store/dashboard-store";
import {
  buildEnrichmentUiWarnings,
  buildEnrichmentExtraWarnings,
  WARNING_COMPANY_REFERENCES_UI,
  WARNING_COMPANIES_PARTIAL_UI,
} from "@/lib/enrichment-disclosure";
import type { CompanyEnrichmentDiagnostics } from "@/lib/enrichment-coverage";

vi.mock("@/lib/auth-guard", () => ({
  requireAuth: vi.fn().mockResolvedValue({ id: "1", email: "t@r.ru", role: "admin" }),
  isAuthError: vi.fn().mockReturnValue(false),
}));

function makeRequest(body: unknown): NextRequest {
  return new NextRequest("http://localhost:3000/api/bitrix/companies", {
    method: "POST",
    headers: new Headers({ "Content-Type": "application/json" }),
    body: JSON.stringify(body),
  });
}

const ids = (n: number, start = 1) => Array.from({ length: n }, (_, i) => String(start + i));

describe("companies route: unresolved references vs transport failure", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(authGuard, "requireAuth").mockResolvedValue({ id: "1" } as any);
    vi.spyOn(authGuard, "isAuthError").mockReturnValue(false);
  });

  it("all reads succeed, some IDs never returned -> UNRESOLVED_REFERENCES, zero failed batches, no fake rows", async () => {
    const all = ids(500); // route max; the client splits larger sets
    const missing = new Set(all.slice(0, 202)); // consistently not returned
    const spy = vi.spyOn(bitrix, "bitrixPost").mockImplementation(async (_m, params: any) => {
      const chunk: string[] = params.FILTER["@ID"];
      return { result: chunk.filter((i) => !missing.has(i)).map((i) => ({ ID: i, TITLE: `C${i}` })) } as any;
    });
    const res = await POST(makeRequest({ ids: all }));
    const data = await res.json();
    const d = data.diagnostics;
    expect(d.classification).toBe("UNRESOLVED_REFERENCES");
    expect(d.requestedCount).toBe(500);
    expect(d.resolvedPrimaryCount).toBe(298);
    expect(d.unresolvedAfterPrimaryCount).toBe(202);
    expect(d.resolvedRecoveryCount).toBe(0);
    expect(d.unresolvedFinalCount).toBe(202);
    expect(d.failedPrimaryBatchCount).toBe(0);
    expect(d.failedRecoveryBatchCount).toBe(0);
    expect(data.failedFetchIds).toEqual([]);
    expect(data.unresolvedReferenceIds.length).toBe(202);
    // Diagnostics are aggregate-only.
    expect(JSON.stringify(d)).not.toMatch(/C\d+/);
    // Unresolved references stay untitled: no fabricated company rows.
    expect(data.companies["1"].TITLE).toBe("");
    // Bounded: 10 primary + ceil(202/15)=14 recovery, never crm.company.get storm.
    expect(spy.mock.calls.filter(([m]) => m === "crm.company.get").length).toBe(0);
    expect(spy.mock.calls.length).toBe(10 + 14);
  });

  it("failed primary batch recovered by recovery -> COMPLETE, counted as failedPrimary", async () => {
    let n = 0;
    vi.spyOn(bitrix, "bitrixPost").mockImplementation(async (_m, params: any) => {
      n++;
      if (n === 1) throw new BitrixTransientError("503", 503);
      return { result: (params.FILTER["@ID"] as string[]).map((i) => ({ ID: i, TITLE: `C${i}` })) } as any;
    });
    const data = await (await POST(makeRequest({ ids: ids(60) }))).json();
    expect(data.diagnostics.classification).toBe("COMPLETE");
    expect(data.diagnostics.failedPrimaryBatchCount).toBe(1);
    expect(data.diagnostics.resolvedRecoveryCount).toBe(50);
    expect(data.partial).toBe(false);
  });

  it("recovery chunk failures are counted and IDs are failed fetches (TRANSIENT_FETCH_FAILURE)", async () => {
    vi.spyOn(bitrix, "bitrixPost").mockImplementation(async (_m, params: any) => {
      const chunk: string[] = params.FILTER["@ID"];
      if (chunk.length <= 15) throw new BitrixTransientError("503", 503);
      return { result: [] } as any; // primary answers, returns nothing
    });
    const data = await (await POST(makeRequest({ ids: ids(30) }))).json();
    expect(data.diagnostics.classification).toBe("TRANSIENT_FETCH_FAILURE");
    expect(data.diagnostics.failedRecoveryBatchCount).toBe(2);
    expect(data.failedFetchIds.length).toBe(30);
    expect(data.unresolvedReferenceIds).toEqual([]);
  });

  it("MIXED: one recovery chunk fails while another confirms absence", async () => {
    let recoveryCall = 0;
    vi.spyOn(bitrix, "bitrixPost").mockImplementation(async (_m, params: any) => {
      const chunk: string[] = params.FILTER["@ID"];
      if (chunk.length === 30) return { result: [] } as any; // primary
      recoveryCall++;
      if (recoveryCall === 1) throw new BitrixTransientError("503", 503);
      return { result: [] } as any;
    });
    const data = await (await POST(makeRequest({ ids: ids(30) }))).json();
    expect(data.diagnostics.classification).toBe("MIXED");
    expect(data.failedFetchIds.length).toBe(15);
    expect(data.unresolvedReferenceIds.length).toBe(15);
  });
});

function setupDeals(count: number, cols = ["COMPANY_TITLE"]) {
  useDashboardStore.setState({
    allDeals: Array.from({ length: count }, (_, i) => ({ ID: String(i + 1), COMPANY_ID: String(1000 + i) })) as any,
    companiesData: {},
    companiesDataFetchedAt: {},
    companiesUnresolvedRefs: {},
    companiesDataCoverage: null,
    companiesEnrichmentDiagnostics: null,
    companiesDataLoading: false,
    selectedColumns: cols,
    isDemoMode: false,
  });
}

function companyResponse(body: any, opts: { unresolvedRefs?: Set<string>; fail?: boolean } = {}) {
  if (opts.fail) return new Response("{}", { status: 500 });
  const refs = body.ids.filter((i: string) => opts.unresolvedRefs?.has(i));
  const ok = body.ids.filter((i: string) => !opts.unresolvedRefs?.has(i));
  return new Response(
    JSON.stringify({
      success: true,
      partial: refs.length > 0,
      companies: Object.fromEntries(ok.map((i: string) => [i, { ID: i, TITLE: `C${i}` }])),
      fetchedCompanyIds: ok,
      unresolvedCompanyIds: refs,
      failedFetchIds: [],
      unresolvedReferenceIds: refs,
      diagnostics: { failedPrimaryBatchCount: 0, failedRecoveryBatchCount: 0 },
    }),
    { status: 200 }
  );
}

describe("fetchCompaniesData coverage semantics", () => {
  beforeEach(() => vi.restoreAllMocks());

  it(">500 unique IDs split into <=500 requests, all success -> COMPLETE, no N+1", async () => {
    setupDeals(1100);
    const sizes: number[] = [];
    global.fetch = vi.fn(async (_u: any, init: any) => {
      const body = JSON.parse(init.body);
      sizes.push(body.ids.length);
      return companyResponse(body);
    }) as any;
    await useDashboardStore.getState().fetchCompaniesData();
    expect(sizes).toEqual([500, 500, 100]);
    const s = useDashboardStore.getState();
    expect(s.companiesDataCoverage?.status).toBe("COMPLETE");
    expect(s.companiesEnrichmentDiagnostics?.classification).toBe("COMPLETE");
  });

  it("one transport batch fails -> PARTIAL counts only the failed batch; successful data preserved; retry completes", async () => {
    setupDeals(1100);
    let call = 0;
    global.fetch = vi.fn(async (_u: any, init: any) => {
      const body = JSON.parse(init.body);
      return companyResponse(body, { fail: ++call === 2 });
    }) as any;
    await useDashboardStore.getState().fetchCompaniesData();
    let s = useDashboardStore.getState();
    expect(s.companiesDataCoverage?.status).toBe("PARTIAL");
    expect((s.companiesDataCoverage as any).warning).toContain("500 из 1100");
    expect(Object.keys(s.companiesData).length).toBe(600);
    expect(s.companiesEnrichmentDiagnostics?.classification).toBe("TRANSIENT_FETCH_FAILURE");
    expect(s.companiesEnrichmentDiagnostics?.failedPrimaryBatchCount).toBe(1);

    const sizes: number[] = [];
    global.fetch = vi.fn(async (_u: any, init: any) => {
      const body = JSON.parse(init.body);
      sizes.push(body.ids.length);
      return companyResponse(body);
    }) as any;
    await useDashboardStore.getState().fetchCompaniesData();
    s = useDashboardStore.getState();
    expect(sizes).toEqual([500]); // only the unresolved IDs
    expect(s.companiesDataCoverage?.status).toBe("COMPLETE");
  });

  it("unresolved references after successful reads: transport COMPLETE, references counted separately, no fake rows, not re-requested within TTL", async () => {
    setupDeals(527);
    const refs = new Set(Array.from({ length: 202 }, (_, i) => String(1000 + i)));
    const requested: string[][] = [];
    global.fetch = vi.fn(async (_u: any, init: any) => {
      const body = JSON.parse(init.body);
      requested.push(body.ids);
      return companyResponse(body, { unresolvedRefs: refs });
    }) as any;
    await useDashboardStore.getState().fetchCompaniesData();
    let s = useDashboardStore.getState();
    expect(s.companiesDataCoverage?.status).toBe("COMPLETE");
    expect(s.companiesEnrichmentDiagnostics?.classification).toBe("UNRESOLVED_REFERENCES");
    expect(s.companiesEnrichmentDiagnostics?.unresolvedReferenceCount).toBe(202);
    expect(s.companiesEnrichmentDiagnostics?.failedFetchCount).toBe(0);
    expect(Object.keys(s.companiesData).length).toBe(325);
    expect(s.companiesDataFetchedAt["1000"]).toBeUndefined();

    // Second refresh: nothing re-requested (references remembered within TTL).
    requested.length = 0;
    await useDashboardStore.getState().fetchCompaniesData();
    expect(requested).toEqual([]);
    s = useDashboardStore.getState();
    expect(s.companiesEnrichmentDiagnostics?.unresolvedReferenceCount).toBe(202);
  });

  it("cached usable enrichment is not counted as current refresh success and survives a failed refresh", async () => {
    setupDeals(10);
    const stale = Date.now() - 10 * 60 * 1000;
    useDashboardStore.setState({
      companiesData: Object.fromEntries(Array.from({ length: 6 }, (_, i) => [String(1000 + i), { ID: String(1000 + i), TITLE: "cached" }])),
      companiesDataFetchedAt: Object.fromEntries(Array.from({ length: 6 }, (_, i) => [String(1000 + i), stale])),
    });
    global.fetch = vi.fn(async () => new Response("{}", { status: 500 })) as any;
    await useDashboardStore.getState().fetchCompaniesData();
    const s = useDashboardStore.getState();
    // All 10 requested (6 stale + 4 missing) failed this refresh; cache retained.
    expect(Object.keys(s.companiesData).length).toBe(6);
    expect(s.companiesDataCoverage?.status).toBe("PARTIAL");
    expect((s.companiesDataCoverage as any).warning).toContain("10 из 10");
  });
});

describe("warning semantics", () => {
  const diag = (over: Partial<CompanyEnrichmentDiagnostics>): CompanyEnrichmentDiagnostics => {
    const unref = over.activeUnresolvedReferenceCount ?? over.unresolvedReferenceCount ?? 0;
    const failed = over.refreshFailedFetchCount ?? over.failedFetchCount ?? 0;
    const req = over.refreshRequestedCount ?? over.requestedCount ?? 527;
    const res = over.refreshResolvedCount ?? over.resolvedCount ?? 325;
    return {
      scopeCount: 527,
      refreshRequestedCount: req,
      refreshResolvedCount: res,
      refreshFailedFetchCount: failed,
      activeUnresolvedReferenceCount: unref,
      requestedCount: req,
      resolvedCount: res,
      failedFetchCount: failed,
      unresolvedReferenceCount: unref,
      failedPrimaryBatchCount: 0,
      failedRecoveryBatchCount: 0,
      classification: "COMPLETE",
      ...over,
    };
  };
  const complete = { status: "COMPLETE", fetched: 1647, total: 1647 } as const;

  it("complete activities and complete companies -> no warning", () => {
    expect(buildEnrichmentUiWarnings({
      selectedColumns: ["ACTIVITY_LAST", "COMPANY_TITLE"],
      activitiesCoverage: complete,
      companiesDataCoverage: { status: "COMPLETE", fetched: 527, total: 527 },
      companiesEnrichmentDiagnostics: diag({}),
    })).toEqual([]);
  });

  it("real partial activities -> warning", () => {
    const w = buildEnrichmentUiWarnings({
      selectedColumns: ["ACTIVITY_LAST"],
      activitiesCoverage: { status: "PARTIAL", fetched: 1, total: 2, warning: "x" },
    });
    expect(w.length).toBe(1);
  });

  it("company transport failure -> warning", () => {
    const w = buildEnrichmentUiWarnings({
      selectedColumns: ["COMPANY_TITLE"],
      companiesDataCoverage: { status: "PARTIAL", fetched: 325, total: 527, warning: "w" },
      companiesEnrichmentDiagnostics: diag({ failedFetchCount: 202, classification: "TRANSIENT_FETCH_FAILURE" }),
    });
    expect(w).toEqual([WARNING_COMPANIES_PARTIAL_UI]);
  });

  it("references-only -> muted line, no technical failure text, no counts in UI", () => {
    const input = {
      selectedColumns: ["COMPANY_TITLE"],
      companiesDataCoverage: { status: "COMPLETE", fetched: 527, total: 527 } as const,
      companiesEnrichmentDiagnostics: diag({ unresolvedReferenceCount: 202, classification: "UNRESOLVED_REFERENCES" }),
    };
    expect(buildEnrichmentUiWarnings(input)).toEqual([WARNING_COMPANY_REFERENCES_UI]);
    const xl = buildEnrichmentExtraWarnings(input).join(" ");
    expect(xl).toContain("202");
    expect(xl).not.toContain("Не удалось");
  });

  it("no dependent COMPANY_* column -> no company warning", () => {
    const input = {
      selectedColumns: ["TITLE"],
      companiesDataCoverage: { status: "PARTIAL", fetched: 1, total: 2, warning: "w" } as const,
      companiesEnrichmentDiagnostics: diag({ unresolvedReferenceCount: 202, failedFetchCount: 5, classification: "MIXED" }),
    };
    expect(buildEnrichmentUiWarnings(input)).toEqual([]);
    expect(buildEnrichmentExtraWarnings(input)).toEqual([]);
  });

  it("critical regression: canonical zero wins over deprecated alias (activeUnresolvedReferenceCount = 0, unresolvedReferenceCount = 202)", () => {
    const input = {
      selectedColumns: ["COMPANY_TITLE"],
      companiesDataCoverage: { status: "COMPLETE", fetched: 527, total: 527 } as const,
      companiesEnrichmentDiagnostics: {
        ...diag({ classification: "COMPLETE" }),
        activeUnresolvedReferenceCount: 0,
        unresolvedReferenceCount: 202,
      },
    };
    expect(buildEnrichmentUiWarnings(input)).toEqual([]);
    expect(buildEnrichmentExtraWarnings(input)).toEqual([]);
  });

  it("canonical non-zero wins over deprecated alias: activeUnresolvedReferenceCount = 202, legacy alias = 0", () => {
    const input = {
      selectedColumns: ["COMPANY_TITLE"],
      companiesDataCoverage: { status: "COMPLETE", fetched: 527, total: 527 } as const,
      companiesEnrichmentDiagnostics: {
        ...diag({ classification: "UNRESOLVED_REFERENCES" }),
        activeUnresolvedReferenceCount: 202,
        unresolvedReferenceCount: 0,
      },
    };
    expect(buildEnrichmentUiWarnings(input)).toEqual([WARNING_COMPANY_REFERENCES_UI]);
    const xl = buildEnrichmentExtraWarnings(input).join(" ");
    expect(xl).toContain("202");
  });

  it("backward compatibility: deprecated unresolvedReferenceCount used when activeUnresolvedReferenceCount is undefined", () => {
    const input = {
      selectedColumns: ["COMPANY_TITLE"],
      companiesDataCoverage: { status: "COMPLETE", fetched: 527, total: 527 } as const,
      companiesEnrichmentDiagnostics: {
        ...diag({ classification: "UNRESOLVED_REFERENCES" }),
        activeUnresolvedReferenceCount: undefined as any,
        unresolvedReferenceCount: 202,
      },
    };
    expect(buildEnrichmentUiWarnings(input)).toEqual([WARNING_COMPANY_REFERENCES_UI]);
    const xl = buildEnrichmentExtraWarnings(input).join(" ");
    expect(xl).toContain("202");
  });

  it("defaults to 0 when both activeUnresolvedReferenceCount and unresolvedReferenceCount are undefined", () => {
    const input = {
      selectedColumns: ["COMPANY_TITLE"],
      companiesDataCoverage: { status: "COMPLETE", fetched: 527, total: 527 } as const,
      companiesEnrichmentDiagnostics: {
        ...diag({ classification: "COMPLETE" }),
        activeUnresolvedReferenceCount: undefined as any,
        unresolvedReferenceCount: undefined,
      },
    };
    expect(buildEnrichmentUiWarnings(input)).toEqual([]);
    expect(buildEnrichmentExtraWarnings(input)).toEqual([]);
  });
});

describe("Regression Matrix: Stale Cache, TTL consistency, and Top-Level Failure", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("A. STALE CACHE + CURRENT UNRESOLVED REFERENCE: stale cache preserved, unresolvedReferenceCount includes it, classification = UNRESOLVED_REFERENCES", async () => {
    const id = "1001";
    const oldFetchedAt = Date.now() - 10 * 60 * 1000; // 10 minutes ago
    setupDeals(1);
    useDashboardStore.setState({
      allDeals: [{ ID: "1", COMPANY_ID: id }] as any,
      companiesData: { [id]: { ID: id, TITLE: "Old Stale Company" } },
      companiesDataFetchedAt: { [id]: oldFetchedAt },
      companiesUnresolvedRefs: {},
    });

    global.fetch = vi.fn(async (_u: any, init: any) => {
      const body = JSON.parse(init.body);
      // API call succeeds, but CRM confirms company is not returned
      return companyResponse(body, { unresolvedRefs: new Set([id]) });
    }) as any;

    await useDashboardStore.getState().fetchCompaniesData();

    const s = useDashboardStore.getState();
    // Stale cache preserved
    expect(s.companiesData[id]?.TITLE).toBe("Old Stale Company");
    // Old fetchedAt not updated to fresh timestamp
    expect(s.companiesDataFetchedAt[id]).toBe(oldFetchedAt);
    // Unresolved reference marker set
    expect(s.companiesUnresolvedRefs[id]).toBeDefined();
    // Diagnostics truthful
    expect(s.companiesEnrichmentDiagnostics?.unresolvedReferenceCount).toBe(1);
    expect(s.companiesEnrichmentDiagnostics?.failedFetchCount).toBe(0);
    expect(s.companiesEnrichmentDiagnostics?.classification).toBe("UNRESOLVED_REFERENCES");
    // Old fetchedAt does NOT make it COMPLETE
    expect(s.companiesEnrichmentDiagnostics?.classification).not.toBe("COMPLETE");
    expect(s.companiesDataCoverage?.status).toBe("COMPLETE");
  });

  it("B. TTL SUPPRESSION WITH STALE CACHE PRESENT: confirmed unresolved ID is NOT requested again inside TTL", async () => {
    const id = "1001";
    const oldFetchedAt = Date.now() - 10 * 60 * 1000;
    const now = Date.now();
    setupDeals(1);
    useDashboardStore.setState({
      allDeals: [{ ID: "1", COMPANY_ID: id }] as any,
      companiesData: { [id]: { ID: id, TITLE: "Old Stale Company" } },
      companiesDataFetchedAt: { [id]: oldFetchedAt },
      companiesUnresolvedRefs: { [id]: now }, // confirmed recently
      companiesEnrichmentDiagnostics: {
        scopeCount: 1,
        refreshRequestedCount: 1,
        refreshResolvedCount: 0,
        refreshFailedFetchCount: 0,
        activeUnresolvedReferenceCount: 1,
        requestedCount: 1,
        resolvedCount: 0,
        failedFetchCount: 0,
        unresolvedReferenceCount: 1,
        failedPrimaryBatchCount: 0,
        failedRecoveryBatchCount: 0,
        classification: "UNRESOLVED_REFERENCES",
      },
    });

    const fetchSpy = vi.fn();
    global.fetch = fetchSpy as any;

    await useDashboardStore.getState().fetchCompaniesData();

    // ID is suppressed from re-requesting because unresolved ref marker is active
    expect(fetchSpy).not.toHaveBeenCalled();
    const s = useDashboardStore.getState();
    expect(s.companiesData[id]?.TITLE).toBe("Old Stale Company");
    expect(s.companiesEnrichmentDiagnostics?.unresolvedReferenceCount).toBe(1);
    expect(s.companiesEnrichmentDiagnostics?.classification).toBe("UNRESOLVED_REFERENCES");
  });

  describe("C. TTL EXPIRY", () => {
    it("C1. TTL expiry: retry resolves company -> marker removed, fetchedAt refreshed, classification recovers to COMPLETE", async () => {
      const id = "1001";
      const expiredMarker = Date.now() - 6 * 60 * 1000; // 6 mins ago (expired)
      setupDeals(1);
      useDashboardStore.setState({
        allDeals: [{ ID: "1", COMPANY_ID: id }] as any,
        companiesData: {},
        companiesDataFetchedAt: {},
        companiesUnresolvedRefs: { [id]: expiredMarker },
      });

      // Retry succeeds and resolves company
      global.fetch = vi.fn(async (_u: any, init: any) => {
        const body = JSON.parse(init.body);
        return companyResponse(body);
      }) as any;

      await useDashboardStore.getState().fetchCompaniesData();

      const s = useDashboardStore.getState();
      expect(s.companiesData[id]?.TITLE).toBe(`C${id}`);
      expect(s.companiesUnresolvedRefs[id]).toBeUndefined(); // marker removed
      expect(s.companiesDataFetchedAt[id]).toBeDefined();
      expect(s.companiesEnrichmentDiagnostics?.resolvedCount).toBe(1);
      expect(s.companiesEnrichmentDiagnostics?.unresolvedReferenceCount).toBe(0);
      expect(s.companiesEnrichmentDiagnostics?.classification).toBe("COMPLETE");
    });

    it("C2. TTL expiry: retry transport-fails -> expired reference marker does NOT cause false MIXED; classified as TRANSIENT_FETCH_FAILURE", async () => {
      const id = "1001";
      const expiredMarker = Date.now() - 6 * 60 * 1000;
      setupDeals(1);
      useDashboardStore.setState({
        allDeals: [{ ID: "1", COMPANY_ID: id }] as any,
        companiesData: {},
        companiesDataFetchedAt: {},
        companiesUnresolvedRefs: { [id]: expiredMarker },
      });

      // Retry encounters transport failure (HTTP 500)
      global.fetch = vi.fn(async () => new Response("{}", { status: 500 })) as any;

      await useDashboardStore.getState().fetchCompaniesData();

      const s = useDashboardStore.getState();
      expect(s.companiesDataCoverage?.status).toBe("PARTIAL");
      expect(s.companiesEnrichmentDiagnostics?.failedFetchCount).toBe(1);
      expect(s.companiesEnrichmentDiagnostics?.unresolvedReferenceCount).toBe(0);
      expect(s.companiesEnrichmentDiagnostics?.classification).toBe("TRANSIENT_FETCH_FAILURE");
      expect(s.companiesEnrichmentDiagnostics?.classification).not.toBe("MIXED");
    });

    it("C3. TTL expiry: retry again confirms absence -> marker timestamp refreshed, classification = UNRESOLVED_REFERENCES", async () => {
      const id = "1001";
      const expiredMarker = Date.now() - 6 * 60 * 1000;
      setupDeals(1);
      useDashboardStore.setState({
        allDeals: [{ ID: "1", COMPANY_ID: id }] as any,
        companiesData: {},
        companiesDataFetchedAt: {},
        companiesUnresolvedRefs: { [id]: expiredMarker },
      });

      // Retry again confirms absence
      global.fetch = vi.fn(async (_u: any, init: any) => {
        const body = JSON.parse(init.body);
        return companyResponse(body, { unresolvedRefs: new Set([id]) });
      }) as any;

      await useDashboardStore.getState().fetchCompaniesData();

      const s = useDashboardStore.getState();
      expect(s.companiesUnresolvedRefs[id]).toBeGreaterThan(expiredMarker); // refreshed
      expect(s.companiesEnrichmentDiagnostics?.unresolvedReferenceCount).toBe(1);
      expect(s.companiesEnrichmentDiagnostics?.classification).toBe("UNRESOLVED_REFERENCES");
    });
  });

  it("D. TOP-LEVEL FAILURE DIAGNOSTICS: previous COMPLETE/UNRESOLVED_REFERENCES replaced by current transport failure; cached data preserved", async () => {
    const id = "1001";
    setupDeals(1);
    useDashboardStore.setState({
      allDeals: [{ ID: "1", COMPANY_ID: id }] as any,
      companiesData: { [id]: { ID: id, TITLE: "Useful Cached Company" } },
      companiesDataFetchedAt: { [id]: Date.now() - 10 * 60 * 1000 },
      companiesEnrichmentDiagnostics: {
        scopeCount: 1,
        refreshRequestedCount: 1,
        refreshResolvedCount: 1,
        refreshFailedFetchCount: 0,
        activeUnresolvedReferenceCount: 0,
        requestedCount: 1,
        resolvedCount: 1,
        failedFetchCount: 0,
        unresolvedReferenceCount: 0,
        failedPrimaryBatchCount: 0,
        failedRecoveryBatchCount: 0,
        classification: "COMPLETE", // previous state
      },
      companiesDataCoverage: { status: "COMPLETE", fetched: 1, total: 1 },
    });

    // Outer fetch throws / rejects
    global.fetch = vi.fn(async () => {
      throw new Error("Network offline");
    }) as any;

    await useDashboardStore.getState().fetchCompaniesData();

    const s = useDashboardStore.getState();
    // 1. Cached enrichment is preserved
    expect(s.companiesData[id]?.TITLE).toBe("Useful Cached Company");
    // 2. Coverage is PARTIAL
    expect(s.companiesDataCoverage?.status).toBe("PARTIAL");
    // 3. Diagnostics now describe CURRENT transport failure, NOT previous COMPLETE
    expect(s.companiesEnrichmentDiagnostics?.classification).toBe("TRANSIENT_FETCH_FAILURE");
    expect(s.companiesEnrichmentDiagnostics?.failedFetchCount).toBe(1);
    expect(s.companiesEnrichmentDiagnostics?.resolvedCount).toBe(0);
    expect(s.companiesDataLoading).toBe(false);
  });
});

describe("Diagnostic Denominators & Scope Contract (Section 8)", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("1. 202 active refs + 1 refreshed/resolved -> scope=203, refreshRequested=1, refreshResolved=1, refreshFailed=0, activeUnresolved=202, UNRESOLVED_REFERENCES", async () => {
    const now = Date.now();
    const activeRefs: Record<string, number> = {};
    for (let i = 1; i <= 202; i++) {
      activeRefs[String(1000 + i)] = now;
    }
    const deals = [
      ...Array.from({ length: 202 }, (_, i) => ({ ID: String(i + 1), COMPANY_ID: String(1000 + i + 1) })),
      { ID: "203", COMPANY_ID: "2000" },
    ];
    useDashboardStore.setState({
      allDeals: deals as any,
      companiesData: {},
      companiesDataFetchedAt: {},
      companiesUnresolvedRefs: activeRefs,
      companiesDataCoverage: null,
      companiesEnrichmentDiagnostics: null,
      companiesDataLoading: false,
      selectedColumns: ["COMPANY_TITLE"],
      isDemoMode: false,
    });

    const requestedBodies: any[] = [];
    global.fetch = vi.fn(async (_u: any, init: any) => {
      const body = JSON.parse(init.body);
      requestedBodies.push(body);
      return companyResponse(body);
    }) as any;

    await useDashboardStore.getState().fetchCompaniesData();

    expect(requestedBodies.length).toBe(1);
    expect(requestedBodies[0].ids).toEqual(["2000"]);

    const s = useDashboardStore.getState();
    const diag = s.companiesEnrichmentDiagnostics!;
    expect(diag.scopeCount).toBe(203);
    expect(diag.refreshRequestedCount).toBe(1);
    expect(diag.refreshResolvedCount).toBe(1);
    expect(diag.refreshFailedFetchCount).toBe(0);
    expect(diag.activeUnresolvedReferenceCount).toBe(202);
    expect(diag.classification).toBe("UNRESOLVED_REFERENCES");
  });

  it("2. 202 active refs + transport failure in current refresh -> MIXED", async () => {
    const now = Date.now();
    const activeRefs: Record<string, number> = {};
    for (let i = 1; i <= 202; i++) {
      activeRefs[String(1000 + i)] = now;
    }
    const deals = [
      ...Array.from({ length: 202 }, (_, i) => ({ ID: String(i + 1), COMPANY_ID: String(1000 + i + 1) })),
      { ID: "203", COMPANY_ID: "2000" },
    ];
    useDashboardStore.setState({
      allDeals: deals as any,
      companiesData: {},
      companiesDataFetchedAt: {},
      companiesUnresolvedRefs: activeRefs,
      companiesDataCoverage: null,
      companiesEnrichmentDiagnostics: null,
      companiesDataLoading: false,
      selectedColumns: ["COMPANY_TITLE"],
      isDemoMode: false,
    });

    global.fetch = vi.fn(async () => new Response("{}", { status: 500 })) as any;

    await useDashboardStore.getState().fetchCompaniesData();

    const s = useDashboardStore.getState();
    const diag = s.companiesEnrichmentDiagnostics!;
    expect(diag.scopeCount).toBe(203);
    expect(diag.refreshRequestedCount).toBe(1);
    expect(diag.refreshResolvedCount).toBe(0);
    expect(diag.refreshFailedFetchCount).toBe(1);
    expect(diag.activeUnresolvedReferenceCount).toBe(202);
    expect(diag.classification).toBe("MIXED");
  });

  it("3. expired unresolved refs are NOT counted in activeUnresolvedReferenceCount", async () => {
    const expired = Date.now() - 10 * 60 * 1000;
    const deals = [
      { ID: "1", COMPANY_ID: "1001" },
      { ID: "2", COMPANY_ID: "1002" },
    ];
    useDashboardStore.setState({
      allDeals: deals as any,
      companiesData: {},
      companiesDataFetchedAt: {},
      companiesUnresolvedRefs: { "1001": expired },
      companiesDataCoverage: null,
      companiesEnrichmentDiagnostics: null,
      companiesDataLoading: false,
      selectedColumns: ["COMPANY_TITLE"],
      isDemoMode: false,
    });

    global.fetch = vi.fn(async (_u: any, init: any) => {
      const body = JSON.parse(init.body);
      return companyResponse(body);
    }) as any;

    await useDashboardStore.getState().fetchCompaniesData();

    const s = useDashboardStore.getState();
    const diag = s.companiesEnrichmentDiagnostics!;
    expect(diag.scopeCount).toBe(2);
    expect(diag.activeUnresolvedReferenceCount).toBe(0);
    expect(diag.classification).toBe("COMPLETE");
  });

  it("4. later successful resolution of an ID removes its unresolved marker", async () => {
    useDashboardStore.setState({
      allDeals: [{ ID: "1", COMPANY_ID: "1001" }] as any,
      companiesData: {},
      companiesDataFetchedAt: {},
      companiesUnresolvedRefs: { "1001": Date.now() - 6 * 60 * 1000 }, // expired so eligible
      companiesDataCoverage: null,
      companiesEnrichmentDiagnostics: null,
      companiesDataLoading: false,
      selectedColumns: ["COMPANY_TITLE"],
      isDemoMode: false,
    });

    global.fetch = vi.fn(async (_u: any, init: any) => {
      const body = JSON.parse(init.body);
      return companyResponse(body);
    }) as any;

    await useDashboardStore.getState().fetchCompaniesData();

    const s = useDashboardStore.getState();
    expect(s.companiesUnresolvedRefs["1001"]).toBeUndefined();
    expect(s.companiesEnrichmentDiagnostics?.activeUnresolvedReferenceCount).toBe(0);
    expect(s.companiesEnrichmentDiagnostics?.classification).toBe("COMPLETE");
  });

  it("5. active TTL prevents redundant re-request of known unresolved reference", async () => {
    const now = Date.now();
    useDashboardStore.setState({
      allDeals: [{ ID: "1", COMPANY_ID: "1001" }] as any,
      companiesData: {},
      companiesDataFetchedAt: {},
      companiesUnresolvedRefs: { "1001": now },
      companiesDataCoverage: null,
      companiesEnrichmentDiagnostics: null,
      companiesDataLoading: false,
      selectedColumns: ["COMPANY_TITLE"],
      isDemoMode: false,
    });

    const fetchSpy = vi.fn();
    global.fetch = fetchSpy as any;

    await useDashboardStore.getState().fetchCompaniesData();

    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("6. UI / Excel warning shows the active scope unresolved count (202), not current-refresh requested count", () => {
    const diag: CompanyEnrichmentDiagnostics = {
      scopeCount: 203,
      refreshRequestedCount: 1,
      refreshResolvedCount: 1,
      refreshFailedFetchCount: 0,
      activeUnresolvedReferenceCount: 202,
      failedPrimaryBatchCount: 0,
      failedRecoveryBatchCount: 0,
      classification: "UNRESOLVED_REFERENCES",
    };
    const input = {
      selectedColumns: ["COMPANY_TITLE"],
      companiesDataCoverage: { status: "COMPLETE" as const, fetched: 203, total: 203 },
      companiesEnrichmentDiagnostics: diag,
    };
    const uiWarnings = buildEnrichmentUiWarnings(input);
    const xlWarnings = buildEnrichmentExtraWarnings(input);

    expect(uiWarnings).toEqual([WARNING_COMPANY_REFERENCES_UI]);
    expect(xlWarnings.some((w) => w.includes("202 связанных компаний"))).toBe(true);
    expect(xlWarnings.some((w) => w.includes(" 1 связанных компаний"))).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────
// No-request scope reconciliation (C1–C4).
//
// "Nothing needs fetching" is NOT the same as "the existing diagnostics
// already describe the current scope": when the current Deal scope requires
// zero network work (fresh cache, TTL-suppressed markers, or empty scope),
// enrichment diagnostics and transport coverage must still be reconciled to
// the CURRENT scope locally — with zero HTTP calls.
// ─────────────────────────────────────────────────────────────────────
describe("No-request scope reconciliation (C1–C4)", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("C1. scope shrink clears previous transport failure with zero network", async () => {
    const now = Date.now();
    // Current scope: company A only, fresh cached enrichment.
    useDashboardStore.setState({
      allDeals: [{ ID: "1", COMPANY_ID: "1001" }] as any,
      companiesData: { "1001": { ID: "1001", TITLE: "Company A" } },
      companiesDataFetchedAt: { "1001": now - 60_000 }, // fresh, inside TTL
      companiesUnresolvedRefs: {},
      // Stale diagnostics from the PREVIOUS scope A+B where B transport-failed.
      companiesDataCoverage: {
        status: "PARTIAL",
        fetched: 1,
        total: 2,
        warning: "Не удалось получить данные 1 из 2 компаний из CRM.",
      },
      companiesEnrichmentDiagnostics: {
        scopeCount: 2,
        refreshRequestedCount: 2,
        refreshResolvedCount: 1,
        refreshFailedFetchCount: 1,
        activeUnresolvedReferenceCount: 0,
        requestedCount: 2,
        resolvedCount: 1,
        failedFetchCount: 1,
        unresolvedReferenceCount: 0,
        failedPrimaryBatchCount: 1,
        failedRecoveryBatchCount: 0,
        classification: "TRANSIENT_FETCH_FAILURE",
      },
      companiesDataLoading: false,
      selectedColumns: ["COMPANY_TITLE"],
      isDemoMode: false,
    });

    const fetchSpy = vi.fn();
    global.fetch = fetchSpy as any;

    await useDashboardStore.getState().fetchCompaniesData();

    // ZERO network requests: A is already fresh.
    expect(fetchSpy).not.toHaveBeenCalled();

    const s = useDashboardStore.getState();
    const diag = s.companiesEnrichmentDiagnostics!;
    expect(diag.scopeCount).toBe(1);
    expect(diag.refreshRequestedCount).toBe(0);
    expect(diag.refreshResolvedCount).toBe(0);
    expect(diag.refreshFailedFetchCount).toBe(0);
    expect(diag.activeUnresolvedReferenceCount).toBe(0);
    expect(diag.failedPrimaryBatchCount).toBe(0);
    expect(diag.failedRecoveryBatchCount).toBe(0);
    expect(diag.classification).toBe("COMPLETE");
    // Deprecated aliases agree with the canonical semantics.
    expect(diag.requestedCount).toBe(0);
    expect(diag.resolvedCount).toBe(0);
    expect(diag.failedFetchCount).toBe(0);
    expect(diag.unresolvedReferenceCount).toBe(0);
    // Coverage describes the CURRENT transport scope (COMPLETE 1/1), not
    // the historical A+B failure.
    expect(s.companiesDataCoverage?.status).toBe("COMPLETE");
    expect(s.companiesDataCoverage).toMatchObject({ fetched: 1, total: 1 });
    // Valid cached enrichment preserved; no loading flag left behind.
    expect(s.companiesData["1001"]?.TITLE).toBe("Company A");
    expect(s.companiesDataLoading).toBe(false);
  });

  it("C2. unresolved refs shrink 202 → 1 with zero network; disclosure uses 1, not 202", async () => {
    const now = Date.now();
    const activeRefs: Record<string, number> = {};
    for (let i = 1; i <= 202; i++) activeRefs[String(1000 + i)] = now;
    // Previous scope held 202 active unresolved markers; the current scope
    // contains only ONE of them (still inside TTL).
    useDashboardStore.setState({
      allDeals: [{ ID: "1", COMPANY_ID: "1001" }] as any,
      companiesData: { "1001": { ID: "1001", TITLE: "Company A" } },
      companiesDataFetchedAt: { "1001": now - 60_000 },
      companiesUnresolvedRefs: activeRefs,
      companiesDataCoverage: { status: "COMPLETE", fetched: 203, total: 203 },
      companiesEnrichmentDiagnostics: {
        scopeCount: 203,
        refreshRequestedCount: 0,
        refreshResolvedCount: 0,
        refreshFailedFetchCount: 0,
        activeUnresolvedReferenceCount: 202,
        requestedCount: 0,
        resolvedCount: 0,
        failedFetchCount: 0,
        unresolvedReferenceCount: 202,
        failedPrimaryBatchCount: 0,
        failedRecoveryBatchCount: 0,
        classification: "UNRESOLVED_REFERENCES",
      },
      companiesDataLoading: false,
      selectedColumns: ["COMPANY_TITLE"],
      isDemoMode: false,
    });

    const fetchSpy = vi.fn();
    global.fetch = fetchSpy as any;

    await useDashboardStore.getState().fetchCompaniesData();

    // ZERO network requests: TTL suppression must remain intact.
    expect(fetchSpy).not.toHaveBeenCalled();

    const s = useDashboardStore.getState();
    const diag = s.companiesEnrichmentDiagnostics!;
    expect(diag.scopeCount).toBe(1);
    expect(diag.refreshRequestedCount).toBe(0);
    expect(diag.refreshResolvedCount).toBe(0);
    expect(diag.refreshFailedFetchCount).toBe(0);
    expect(diag.activeUnresolvedReferenceCount).toBe(1);
    expect(diag.failedPrimaryBatchCount).toBe(0);
    expect(diag.failedRecoveryBatchCount).toBe(0);
    expect(diag.classification).toBe("UNRESOLVED_REFERENCES");
    expect(diag.unresolvedReferenceCount).toBe(1);
    // The in-scope marker survives; out-of-scope markers are pruned.
    expect(s.companiesUnresolvedRefs["1001"]).toBe(now);
    expect(Object.keys(s.companiesUnresolvedRefs)).toEqual(["1001"]);
    // Coverage stays transport-only COMPLETE for the current scope.
    expect(s.companiesDataCoverage?.status).toBe("COMPLETE");
    expect(s.companiesDataCoverage).toMatchObject({ fetched: 1, total: 1 });

    // The disclosure layer must operate on 1, not the historical 202.
    const xl = buildEnrichmentExtraWarnings({
      selectedColumns: ["COMPANY_TITLE"],
      companiesDataCoverage: s.companiesDataCoverage,
      companiesEnrichmentDiagnostics: s.companiesEnrichmentDiagnostics,
    });
    expect(xl.join(" ")).toContain("1 связанных компаний");
    expect(xl.join(" ")).not.toContain("202");
  });

  it("C3. empty current Company scope clears stale diagnostics with zero network", async () => {
    useDashboardStore.setState({
      // Current scope contains zero valid Company IDs.
      allDeals: [
        { ID: "1", COMPANY_ID: "0" },
        { ID: "2", COMPANY_ID: "" },
      ] as any,
      companiesData: { "1001": { ID: "1001", TITLE: "Leftover" } },
      companiesDataFetchedAt: { "1001": Date.now() },
      companiesUnresolvedRefs: { "1002": Date.now() },
      // Stale previous-scope diagnostics: PARTIAL + TRANSIENT + unresolved.
      companiesDataCoverage: {
        status: "PARTIAL",
        fetched: 1,
        total: 2,
        warning: "Не удалось получить данные 1 из 2 компаний из CRM.",
      },
      companiesEnrichmentDiagnostics: {
        scopeCount: 2,
        refreshRequestedCount: 2,
        refreshResolvedCount: 1,
        refreshFailedFetchCount: 1,
        activeUnresolvedReferenceCount: 1,
        requestedCount: 2,
        resolvedCount: 1,
        failedFetchCount: 1,
        unresolvedReferenceCount: 1,
        failedPrimaryBatchCount: 1,
        failedRecoveryBatchCount: 0,
        classification: "TRANSIENT_FETCH_FAILURE",
      },
      companiesDataLoading: false,
      selectedColumns: ["COMPANY_TITLE"],
      isDemoMode: false,
    });

    const fetchSpy = vi.fn();
    global.fetch = fetchSpy as any;

    await useDashboardStore.getState().fetchCompaniesData();

    expect(fetchSpy).not.toHaveBeenCalled();

    const s = useDashboardStore.getState();
    const diag = s.companiesEnrichmentDiagnostics!;
    expect(diag.scopeCount).toBe(0);
    expect(diag.refreshRequestedCount).toBe(0);
    expect(diag.refreshResolvedCount).toBe(0);
    expect(diag.refreshFailedFetchCount).toBe(0);
    expect(diag.activeUnresolvedReferenceCount).toBe(0);
    expect(diag.failedPrimaryBatchCount).toBe(0);
    expect(diag.failedRecoveryBatchCount).toBe(0);
    expect(diag.classification).toBe("COMPLETE");
    expect(diag.unresolvedReferenceCount).toBe(0);
    // Zero-scope DatasetCoverage convention: COMPLETE 0/0.
    expect(s.companiesDataCoverage).toEqual({ status: "COMPLETE", fetched: 0, total: 0 });
    // Out-of-scope unresolved marker must not survive.
    expect(Object.keys(s.companiesUnresolvedRefs)).toEqual([]);
    // No stale old-scope warning remains for the empty scope.
    const ui = buildEnrichmentUiWarnings({
      selectedColumns: ["COMPANY_TITLE"],
      companiesDataCoverage: s.companiesDataCoverage,
      companiesEnrichmentDiagnostics: s.companiesEnrichmentDiagnostics,
    });
    expect(ui).toEqual([]);
  });

  it("C4. active in-TTL unresolved reference still suppresses the request; reconciliation issues no CRM call", async () => {
    const now = Date.now();
    useDashboardStore.setState({
      allDeals: [{ ID: "1", COMPANY_ID: "1001" }] as any,
      companiesData: { "1001": { ID: "1001", TITLE: "Old Stale Company" } },
      companiesDataFetchedAt: { "1001": now - 10 * 60 * 1000 }, // stale — only the marker suppresses the read
      companiesUnresolvedRefs: { "1001": now },
      companiesDataCoverage: null,
      companiesEnrichmentDiagnostics: null,
      companiesDataLoading: false,
      selectedColumns: ["COMPANY_TITLE"],
      isDemoMode: false,
    });

    const fetchSpy = vi.fn();
    global.fetch = fetchSpy as any;

    await useDashboardStore.getState().fetchCompaniesData();

    // Reconciliation of diagnostics must NOT create a CRM request.
    expect(fetchSpy).not.toHaveBeenCalled();

    const s = useDashboardStore.getState();
    const diag = s.companiesEnrichmentDiagnostics!;
    expect(diag.scopeCount).toBe(1);
    expect(diag.refreshRequestedCount).toBe(0);
    expect(diag.refreshResolvedCount).toBe(0);
    expect(diag.refreshFailedFetchCount).toBe(0);
    expect(diag.activeUnresolvedReferenceCount).toBe(1);
    expect(diag.failedPrimaryBatchCount).toBe(0);
    expect(diag.failedRecoveryBatchCount).toBe(0);
    expect(diag.classification).toBe("UNRESOLVED_REFERENCES");
    expect(diag.unresolvedReferenceCount).toBe(1);
    // Cached enrichment preserved.
    expect(s.companiesData["1001"]?.TITLE).toBe("Old Stale Company");
  });
});
