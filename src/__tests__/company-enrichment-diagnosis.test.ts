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
  const diag = (over: Partial<CompanyEnrichmentDiagnostics>): CompanyEnrichmentDiagnostics => ({
    requestedCount: 527, resolvedCount: 325, failedFetchCount: 0, unresolvedReferenceCount: 0,
    failedPrimaryBatchCount: 0, failedRecoveryBatchCount: 0, classification: "COMPLETE", ...over,
  });
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
});
