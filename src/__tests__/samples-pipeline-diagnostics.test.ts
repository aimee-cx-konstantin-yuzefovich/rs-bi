// @vitest-environment node
// src/__tests__/samples-pipeline-diagnostics.test.ts
// ─────────────────────────────────────────────────────────────────────
// Focused tests for the Samples pipeline diagnostic engine
// (src/lib/samples-pipeline-diagnostics.ts) and its admin route
// (GET /api/bitrix/diagnostics/samples-pipeline) — the SECOND,
// diagnostic-only patch. Required matrix (task §11):
//
//  1. metadata fails          → FIELDS_METADATA_FAILED
//  2. companies fail          → COMPANIES_FETCH_FAILED
//  3. deals fail              → DEALS_FETCH_FAILED
//  4. SP production helper fails → SMART_PROCESS_HELPER_FAILED
//  5. relation map fails      → DEAL_COMPANY_MAP_FAILED
//  6. aggregation throws      → SAMPLES_AGGREGATION_FAILED
//  7. zero summaries          → valid PASS (not failure)
//  8. summaries present       → counts only returned
//  9. client contract rejects → SAMPLES_RESPONSE_CONTRACT_FAILED
// 10. client contract accepts actual production-shaped response
// 11. no business rows in the diagnostic response
// 12. no raw IDs in the diagnostic response
// 13. no credentials / error_description leakage
// 14. no Bitrix mutations (read-only method set + source scan)
// 15. no retry-policy changes (probe D uses the real helper; retries
//     exercised at transport level by the existing suites)
// 16. no second Samples parser (source scan)
// 17. (hook-level — samples-client-contract + use-samples-data-state)
// 18. Commercial Funnel probe SKIPPED when Samples upstream fails
// 19. Commercial Funnel input probe PASS on valid canonical fixture
// 20. existing Smart Process transport diagnostic remains unchanged
//     (its own suite stays green; engine imports nothing from it)
// ─────────────────────────────────────────────────────────────────────
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { readFileSync } from "node:fs";
import { NextResponse } from "next/server";

// ─── Auth mock (route-level) ───
const auth = vi.hoisted(() => ({
  requireAdmin: vi.fn(),
  isAuthError: (value: unknown) => value instanceof Response,
}));
vi.mock("@/lib/auth-guard", () => auth);

// ─── Transport mock: bitrixPost intercepted at the transport seam so the
// REAL production helpers (fetchAllPages, fetchSampleCompanies, …) run
// against realistic envelopes. Safe metadata helpers stay real. ───
const bitrixPostMock = vi.hoisted(() => vi.fn());
vi.mock("@/lib/bitrix", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/bitrix")>();
  return {
    ...actual,
    bitrixPost: bitrixPostMock,
  };
});

// ─── PROBE J isolation: the CF user directory + batch activities are
// independent production services; stubbed ONLY so CF-input failures
// can be simulated deterministically. Their internals are exercised by
// their own suites. ───
const cfHelpers = vi.hoisted(() => ({
  fetchUserDirectory: vi.fn(async () => ({ "1": "Иван Иванов" })),
  fetchDealsActivities: vi.fn(async () => ({
    byDealId: {},
    fetchedDealIds: [],
    failedDealIds: [],
    incompleteDealIds: [],
    failedBatches: 0,
    incompleteBatches: 0,
    partial: false,
  })),
}));
vi.mock("@/app/api/bitrix/commercial-funnel/route", async (importOriginal) => {
  const actual = await importOriginal<
    typeof import("@/app/api/bitrix/commercial-funnel/route")
  >();
  return {
    ...actual,
    fetchUserDirectory: cfHelpers.fetchUserDirectory,
  };
});
vi.mock("@/lib/bitrix-activities", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/bitrix-activities")>();
  return {
    ...actual,
    fetchDealsActivities: cfHelpers.fetchDealsActivities,
  };
});

import { GET } from "@/app/api/bitrix/diagnostics/samples-pipeline/route";
import {
  runSamplesPipelineDiagnostics,
  diagnoseSamplesPipeline,
} from "@/lib/samples-pipeline-diagnostics";
import {
  COMPANY_SAMPLES_FIELD_ID,
  COMPANY_SAMPLES_DATE_SINGLE_FIELD_ID,
  COMPANY_TEST_RESULT_FIELD_ID,
  DEAL_SAMPLE_TRANSFER_FIELD_ID,
  DEAL_SAMPLE_SENT_DATE_FIELD_ID,
} from "@/lib/crm-constants";
import {
  SMART_PROCESS_SENT_DATE_FIELD_ID,
  SMART_PROCESS_TEST_RESULT_FIELD_ID,
} from "@/lib/samples/smart-process-contract";

// ─── Realistic Bitrix envelopes (transport shape, minimal fields) ───

const fieldsEnvelope = (fields: Record<string, unknown>) => ({
  result: fields,
});

/** crm.company.fields / crm.deal.fields / crm.item.fields metadata. */
const emptyFields = fieldsEnvelope({});

const sampleActivityCompany = (id: string) => ({
  ID: id,
  TITLE: `ООО Тестовая Компания ${id}`,
  ASSIGNED_BY_ID: "7",
  [COMPANY_SAMPLES_FIELD_ID]: ["5"], // enum: «Переданы»
  [COMPANY_SAMPLES_DATE_SINGLE_FIELD_ID]: "2026-09-10",
  [COMPANY_TEST_RESULT_FIELD_ID]: "Образцы соответствуют ТУ",
});

const sampleDeal = (id: string, companyId: string) => ({
  ID: id,
  TITLE: `Сделка ${id}`,
  STAGE_ID: "NEW",
  COMPANY_ID: companyId,
  ASSIGNED_BY_ID: "7",
  [DEAL_SAMPLE_TRANSFER_FIELD_ID]: ["5"],
  [DEAL_SAMPLE_SENT_DATE_FIELD_ID]: "2026-09-12",
});

const spItem = (id: number, companyId: string, dealId: string) => ({
  id,
  title: `Элемент образца ${id}`,
  stageId: "DT1032_15:CLIENT",
  assignedById: 7,
  createdTime: "2026-09-09T10:00:00+03:00",
  companyId,
  parentId2: dealId,
  [SMART_PROCESS_SENT_DATE_FIELD_ID]: "2026-09-11",
  [SMART_PROCESS_TEST_RESULT_FIELD_ID]: "подошло",
});

/**
 * Programmes the transport mock for the full happy-path probe sequence:
 * A (3×fields) + status resolution (crm.status.list) + B (companies) +
 * C (deals) + D (items) + E (stage directory) + F (relation chunks).
 * The crm.deal.list mock is filter-aware: relation-map chunks use the
 * production `{"@ID": [...]}` IN filter and receive exactly the
 * requested rows, mirroring the real bounded-bulk behavior.
 */
function mockFullHappyPath(opts: {
  companies: number;
  deals: number;
  spItems: number;
  companyFactory?: (i: number) => Record<string, unknown>;
  dealFactory?: (i: number) => Record<string, unknown>;
  spFactory?: (i: number) => Record<string, unknown>;
}) {
  const companies = Array.from({ length: opts.companies }, (_, i) =>
    (opts.companyFactory ?? ((i: number) => sampleActivityCompany(String(i + 1))))(i)
  );
  const deals = Array.from({ length: opts.deals }, (_, i) =>
    (opts.dealFactory ?? ((i: number) => sampleDeal(String(i + 1), String((i % Math.max(1, opts.companies)) + 1))))(i)
  );
  const spItems = Array.from({ length: opts.spItems }, (_, i) =>
    (opts.spFactory ?? ((i: number) => spItem(i + 1, String((i % Math.max(1, opts.companies)) + 1), String(i + 1))))(i)
  );
  const dealById = new Map(deals.map((d) => [String(d.ID), d]));

  bitrixPostMock.mockImplementation(async (method: string, params?: Record<string, unknown>) => {
    switch (method) {
      case "crm.company.fields":
      case "crm.deal.fields":
      case "crm.item.fields":
        return emptyFields;
      case "crm.company.list":
        return { result: companies, total: companies.length };
      case "crm.deal.list": {
        const filter = params?.FILTER as { "@ID"?: string[] } | undefined;
        if (filter && Array.isArray(filter["@ID"])) {
          const chunk = filter["@ID"].map(String);
          const rows = chunk.map((id) => dealById.get(id)).filter(Boolean);
          return { result: rows, total: rows.length };
        }
        return { result: deals, total: deals.length };
      }
      case "crm.item.list":
        return { result: spItems, total: spItems.length };
      case "crm.status.list":
        return { result: [] };
      default:
        throw new Error(`Unexpected method ${method}`);
    }
  });
  return { companies, deals, spItems };
}

beforeEach(() => {
  auth.requireAdmin.mockReset();
  auth.requireAdmin.mockResolvedValue({
    userId: "admin@test",
    email: "admin@test",
    name: "Admin",
    role: "admin",
  });
  bitrixPostMock.mockReset();
  cfHelpers.fetchUserDirectory.mockClear();
  cfHelpers.fetchDealsActivities.mockClear();
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

const GET_REQUEST = () => GET();

// ─── Auth ───
describe("GET /api/bitrix/diagnostics/samples-pipeline — auth", () => {
  it("requires admin before any Bitrix work", async () => {
    auth.requireAdmin.mockResolvedValue(
      NextResponse.json({ success: false }, { status: 401 })
    );
    const response = await GET_REQUEST();
    expect(response.status).toBe(401);
    expect(bitrixPostMock).not.toHaveBeenCalled();
  });

  it("non-admin role is rejected with 403 before probes", async () => {
    auth.requireAdmin.mockResolvedValue(
      NextResponse.json({ success: false }, { status: 403 })
    );
    const response = await GET_REQUEST();
    expect(response.status).toBe(403);
    expect(bitrixPostMock).not.toHaveBeenCalled();
  });

  it("response is no-store and never reads request parameters", async () => {
    mockFullHappyPath({ companies: 1, deals: 1, spItems: 1 });
    const response = await GET_REQUEST();
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
  });
});

// ─── Full happy path (cases 8, 10, 19, 20-adjacent) ───
describe("case 8/10/19: full pipeline PASS", () => {
  it("all probes PASS with counts only and SAMPLES_PIPELINE_OK", async () => {
    mockFullHappyPath({ companies: 3, deals: 3, spItems: 2 });
    const response = await GET_REQUEST();
    expect(response.status).toBe(200);
    const body = await response.json();

    expect(body.success).toBe(true);
    expect(body.probes.fieldMetadata).toEqual({
      status: "PASS",
      labelCount: 0,
      partial: false,
    });
    expect(body.probes.companies).toEqual({ status: "PASS", count: 3 });
    expect(body.probes.deals).toEqual({ status: "PASS", count: 3 });
    expect(body.probes.smartProcess).toEqual({ status: "PASS", count: 2 });
    expect(body.probes.stageDirectory).toEqual({
      status: "PASS",
      available: true,
      knownStageLabelCount: 5,
    });
    expect(body.probes.dealCompanyMap).toEqual({
      status: "PASS",
      referencedDealCount: 2,
      resolvedRelationCount: 2,
    });
    expect(body.probes.aggregation).toMatchObject({
      status: "PASS",
      summaryCount: 3,
      orphanDealCount: 0,
    });
    expect(body.probes.aggregation.qualityCounts).toEqual({
      orphanSmartProcessItemCount: 0,
      relationConflictCount: 0,
      sentStageWithoutDateCount: 0,
      multipleActiveCount: 0,
      stageResultConflictCount: 0,
    });
    expect(body.probes.clientContract).toEqual({ status: "PASS" });
    expect(body.probes.commercialFunnelInput).toEqual({
      status: "PASS",
      companyCount: 3,
      dealCount: 3,
    });
    expect(body.diagnosis).toBe("SAMPLES_PIPELINE_OK");

    // Case 8: counts only — no SampleSummary objects anywhere.
    const serialized = JSON.stringify(body);
    expect(serialized).not.toContain("companyTitle");
    expect(serialized).not.toContain("samples:");
  });
});

// ─── Layer-by-layer failures (cases 1–6) ───
describe("case 1: field metadata failure", () => {
  it("diagnosis FIELDS_METADATA_FAILED with safe metadata only", async () => {
    // fetchFieldLabelMaps is non-fatal by production contract and never
    // throws internally — a hard metadata failure is simulated at the
    // helper seam (this patch must not weaken the production helper).
    const bitrixFetch = await import("@/lib/samples/bitrix-fetch");
    const spy = vi
      .spyOn(bitrixFetch, "fetchFieldLabelMaps")
      .mockRejectedValue(
        Object.assign(new Error("metadata sub-fetch failed"), {
          method: "crm.company.fields",
        })
      );
    try {
      const body = await (await GET_REQUEST()).json();
      expect(body.probes.fieldMetadata).toEqual({
        status: "FAIL",
        method: "crm.company.fields",
      });
      expect(body.probes.companies).toEqual({ status: "SKIPPED", reason: "NOT_RUN" });
      expect(body.probes.commercialFunnelInput).toEqual({
        status: "SKIPPED",
        reason: "UPSTREAM_SAMPLES_FAILED",
      });
      expect(body.diagnosis).toBe("FIELDS_METADATA_FAILED");
      expect(bitrixPostMock).not.toHaveBeenCalled();
    } finally {
      spy.mockRestore();
    }
  });

  it("partial metadata (failed sub-fetch) is DEGRADED, not FAIL", async () => {
    bitrixPostMock.mockImplementation(async (method: string) => {
      if (method === "crm.company.fields" || method === "crm.deal.fields") {
        throw new Error("metadata sub-fetch failed");
      }
      if (method === "crm.status.list") return { result: [] };
      if (method === "crm.company.list") return { result: [], total: 0 };
      if (method === "crm.deal.list") return { result: [], total: 0 };
      if (method === "crm.item.list") return { result: [], total: 0 };
      throw new Error(`Unexpected method ${method}`);
    });
    const body = await (await GET_REQUEST()).json();
    expect(body.probes.fieldMetadata).toEqual({
      status: "DEGRADED",
      labelCount: 0,
      partial: true,
    });
    expect(body.probes.companies.status).toBe("PASS");
    expect(body.diagnosis).toBe("SAMPLES_PIPELINE_OK");
  });
});

describe("case 2: companies failure", () => {
  it("diagnosis COMPANIES_FETCH_FAILED; later probes skipped", async () => {
    const { BitrixTransientError } = await import("@/lib/bitrix");
    bitrixPostMock.mockImplementation(async (method: string) => {
      if (method === "crm.company.fields" || method === "crm.deal.fields" || method === "crm.item.fields") {
        return emptyFields;
      }
      if (method === "crm.status.list") return { result: [] };
      if (method === "crm.company.list") {
        throw new BitrixTransientError("API returned status 403", 403, undefined, "crm.company.list");
      }
      throw new Error(`Unexpected method ${method}`);
    });
    const body = await (await GET_REQUEST()).json();
    expect(body.probes.companies).toEqual({
      status: "FAIL",
      method: "crm.company.list",
      httpStatus: 403,
    });
    expect(body.probes.deals).toEqual({ status: "SKIPPED", reason: "NOT_RUN" });
    expect(body.probes.aggregation).toEqual({ status: "SKIPPED", reason: "NOT_RUN" });
    expect(body.probes.commercialFunnelInput).toEqual({
      status: "SKIPPED",
      reason: "UPSTREAM_SAMPLES_FAILED",
    });
    expect(body.diagnosis).toBe("COMPANIES_FETCH_FAILED");
  });
});

describe("case 3: deals failure", () => {
  it("diagnosis DEALS_FETCH_FAILED", async () => {
    const { BitrixApiError } = await import("@/lib/bitrix");
    bitrixPostMock.mockImplementation(async (method: string) => {
      if (method === "crm.company.fields" || method === "crm.deal.fields" || method === "crm.item.fields") {
        return emptyFields;
      }
      if (method === "crm.status.list") return { result: [] };
      if (method === "crm.company.list") return { result: [], total: 0 };
      if (method === "crm.deal.list") {
        throw new BitrixApiError("API request failed", "crm.deal.list", "ACCESS_DENIED");
      }
      throw new Error(`Unexpected method ${method}`);
    });
    const body = await (await GET_REQUEST()).json();
    expect(body.probes.deals).toEqual({
      status: "FAIL",
      method: "crm.deal.list",
      bitrixCode: "ACCESS_DENIED",
    });
    expect(body.probes.smartProcess).toEqual({ status: "SKIPPED", reason: "NOT_RUN" });
    expect(body.diagnosis).toBe("DEALS_FETCH_FAILED");
  });
});

describe("case 4: SP production helper failure", () => {
  it("diagnosis SMART_PROCESS_HELPER_FAILED", async () => {
    const { BitrixTransientError } = await import("@/lib/bitrix");
    bitrixPostMock.mockImplementation(async (method: string) => {
      if (method === "crm.company.fields" || method === "crm.deal.fields" || method === "crm.item.fields") {
        return emptyFields;
      }
      if (method === "crm.status.list") return { result: [] };
      if (method === "crm.company.list") return { result: [], total: 0 };
      if (method === "crm.deal.list") return { result: [], total: 0 };
      if (method === "crm.item.list") {
        throw new BitrixTransientError("API returned status 500", 500, undefined, "crm.item.list");
      }
      throw new Error(`Unexpected method ${method}`);
    });
    const body = await (await GET_REQUEST()).json();
    expect(body.probes.smartProcess).toEqual({
      status: "FAIL",
      method: "crm.item.list",
      httpStatus: 500,
    });
    expect(body.probes.dealCompanyMap).toEqual({ status: "SKIPPED", reason: "NOT_RUN" });
    expect(body.diagnosis).toBe("SMART_PROCESS_HELPER_FAILED");
  });
});

describe("case 5: relation map failure", () => {
  it("diagnosis DEAL_COMPANY_MAP_FAILED; aggregation never runs", async () => {
    const { BitrixApiError } = await import("@/lib/bitrix");
    bitrixPostMock.mockImplementation(async (method: string, params?: Record<string, unknown>) => {
      if (method === "crm.company.fields" || method === "crm.deal.fields" || method === "crm.item.fields") {
        return emptyFields;
      }
      if (method === "crm.status.list") return { result: [] };
      if (method === "crm.company.list") return { result: [], total: 0 };
      // Full-scope deals fetch succeeds (empty); the bounded relation
      // chunk (IN filter) fails — exactly the PROBE F layer.
      if (method === "crm.deal.list") {
        const filter = params?.FILTER as { "@ID"?: string[] } | undefined;
        if (filter && Array.isArray(filter["@ID"])) {
          throw new BitrixApiError("API request failed", "crm.deal.list", "ACCESS_DENIED");
        }
        return { result: [], total: 0 };
      }
      if (method === "crm.item.list") {
        return { result: [spItem(1, "10", "20")], total: 1 };
      }
      throw new Error(`Unexpected method ${method}`);
    });
    const body = await (await GET_REQUEST()).json();
    expect(body.probes.dealCompanyMap).toEqual({
      status: "FAIL",
      method: "crm.deal.list",
      bitrixCode: "ACCESS_DENIED",
    });
    expect(body.probes.aggregation).toEqual({ status: "SKIPPED", reason: "NOT_RUN" });
    expect(body.probes.commercialFunnelInput).toEqual({
      status: "SKIPPED",
      reason: "UPSTREAM_SAMPLES_FAILED",
    });
    expect(body.diagnosis).toBe("DEAL_COMPANY_MAP_FAILED");
    // Production retry semantics are reused exactly (task §9): the chunk
    // failure goes through the real fetchAllPages bounded restart
    // (MAX_PAGINATION_ATTEMPTS = 2) — the probe reports the FINAL
    // outcome, never a masked retry state.
    const dealCalls = bitrixPostMock.mock.calls.filter(([m]) => m === "crm.deal.list");
    expect(dealCalls.length).toBe(3); // 1 full-scope + 2 bounded chunk attempts
    expect(
      dealCalls.filter(([, p]) => {
        const filter = (p as { FILTER?: { "@ID"?: string[] } }).FILTER;
        return Array.isArray(filter?.["@ID"]);
      }).length
    ).toBe(2);
  });
});

describe("case 6: aggregation throws", () => {
  it("diagnosis SAMPLES_AGGREGATION_FAILED with safe stage name only", async () => {
    // Force buildSampleSummaries to throw via a corrupt row the loader
    // itself would have rejected — here we instead spy on the aggregate.
    const aggregate = await import("@/lib/samples/aggregate");
    const spy = vi.spyOn(aggregate, "buildSampleSummaries").mockImplementation(() => {
      throw new Error("synthetic aggregation failure");
    });
    try {
      mockFullHappyPath({ companies: 2, deals: 2, spItems: 1 });
      const body = await (await GET_REQUEST()).json();
      expect(body.probes.aggregation).toEqual({
        status: "FAIL",
        method: "buildSampleSummaries",
      });
      expect(body.probes.clientContract).toEqual({ status: "SKIPPED", reason: "NOT_RUN" });
      expect(body.probes.commercialFunnelInput).toEqual({
        status: "SKIPPED",
        reason: "UPSTREAM_SAMPLES_FAILED",
      });
      expect(body.diagnosis).toBe("SAMPLES_AGGREGATION_FAILED");
    } finally {
      spy.mockRestore();
    }
  });
});

// ─── Case 7: zero summaries is a valid PASS ───
describe("case 7: zero summaries", () => {
  it("aggregation PASS with summaryCount 0 — valid empty dataset, not failure", async () => {
    // Companies/deals exist but carry NO sample evidence → truthful 0.
    bitrixPostMock.mockImplementation(async (method: string) => {
      if (method === "crm.company.fields" || method === "crm.deal.fields" || method === "crm.item.fields") {
        return emptyFields;
      }
      if (method === "crm.status.list") return { result: [] };
      if (method === "crm.company.list") {
        return { result: [{ ID: "1", TITLE: "ООО Без Образцов", ASSIGNED_BY_ID: "7" }], total: 1 };
      }
      if (method === "crm.deal.list") return { result: [], total: 0 };
      if (method === "crm.item.list") return { result: [], total: 0 };
      throw new Error(`Unexpected method ${method}`);
    });
    const body = await (await GET_REQUEST()).json();
    expect(body.probes.aggregation).toEqual({
      status: "PASS",
      summaryCount: 0,
      orphanDealCount: 0,
      qualityCounts: {
        orphanSmartProcessItemCount: 0,
        relationConflictCount: 0,
        sentStageWithoutDateCount: 0,
        multipleActiveCount: 0,
        stageResultConflictCount: 0,
      },
    });
    expect(body.probes.clientContract).toEqual({ status: "PASS" });
    expect(body.diagnosis).toBe("SAMPLES_PIPELINE_OK");
  });
});

// ─── Case 9: client contract rejects → SAMPLES_RESPONSE_CONTRACT_FAILED ───
describe("case 9: client contract rejection", () => {
  it("valid production rows but contract validator fails → SAMPLES_RESPONSE_CONTRACT_FAILED", async () => {
    const clientContract = await import("@/lib/samples/client-contract");
    const spy = vi
      .spyOn(clientContract, "validateSamplesClientPayload")
      .mockReturnValue({ ok: false, reason: "SAMPLES_NOT_ARRAY" });
    try {
      mockFullHappyPath({ companies: 2, deals: 2, spItems: 1 });
      const body = await (await GET_REQUEST()).json();
      expect(body.probes.clientContract).toEqual({
        status: "FAIL",
        reason: "SAMPLES_NOT_ARRAY",
      });
      expect(body.probes.commercialFunnelInput).toEqual({
        status: "SKIPPED",
        reason: "UPSTREAM_SAMPLES_FAILED",
      });
      expect(body.diagnosis).toBe("SAMPLES_RESPONSE_CONTRACT_FAILED");
    } finally {
      spy.mockRestore();
    }
  });
});

// ─── Cases 11–13: safety of the diagnostic response ───
describe("cases 11-13: no business data / IDs / credentials in the response", () => {
  it("adversarial business content never appears in the serialized report", async () => {
    const SECRET = "ООО Совершенно Секретная Компания";
    bitrixPostMock.mockImplementation(async (method: string) => {
      if (method === "crm.company.fields" || method === "crm.deal.fields" || method === "crm.item.fields") {
        return emptyFields;
      }
      if (method === "crm.status.list") return { result: [] };
      if (method === "crm.company.list") {
        return { result: [sampleActivityCompany("777")], total: 1 };
      }
      if (method === "crm.deal.list") {
        return { result: [sampleDeal("888", "777")], total: 1 };
      }
      if (method === "crm.item.list") {
        return {
          result: [spItem(999, "777", "888")],
          total: 1,
        };
      }
      throw new Error(`Unexpected method ${method}`);
    });
    const response = await GET_REQUEST();
    const serialized = JSON.stringify({
      headers: Object.fromEntries(response.headers.entries()),
      body: await response.json(),
    });

    expect(serialized).not.toContain("Секретная Компания");
    expect(serialized).not.toContain("Тестовая Компания");
    expect(serialized).not.toContain("Элемент образца");
    expect(serialized).not.toContain("подошло");
    expect(serialized).not.toContain("соответствуют ТУ");
    // Case 12: raw IDs of the mocked entities never leak.
    expect(serialized).not.toContain("777");
    expect(serialized).not.toContain("888");
    expect(serialized).not.toContain("999");
    // Case 13: credentials / error_description never appear.
    expect(serialized).not.toContain("error_description");
    expect(serialized).not.toMatch(/webhook/i);
    expect(serialized).not.toMatch(/\/rest\/\d+\//);
    expect(serialized).not.toContain("BITRIX_WEBHOOK_URL");
    expect(response.headers.get("cache-control")).toBe("no-store");
  });

  it("aggregation failure never echoes the thrown business payload", async () => {
    const aggregate = await import("@/lib/samples/aggregate");
    const spy = vi.spyOn(aggregate, "buildSampleSummaries").mockImplementation(() => {
      const err = new Error("boom");
      (err as Error & { payload?: unknown }).payload = { companyTitle: "ООО Утечка" };
      throw err;
    });
    try {
      mockFullHappyPath({ companies: 1, deals: 1, spItems: 1 });
      const serialized = JSON.stringify(await (await GET_REQUEST()).json());
      expect(serialized).not.toContain("Утечка");
      expect(serialized).not.toContain("payload");
    } finally {
      spy.mockRestore();
    }
  });
});

// ─── Case 14: read-only invariant ───
describe("case 14: read-only Bitrix invariant", () => {
  it("the routine only calls allowlisted read methods", async () => {
    mockFullHappyPath({ companies: 2, deals: 2, spItems: 2 });
    await runSamplesPipelineDiagnostics();

    const methods = new Set(bitrixPostMock.mock.calls.map((c: unknown[]) => c[0]));
    for (const method of methods) {
      expect([
        "crm.company.fields",
        "crm.deal.fields",
        "crm.item.fields",
        "crm.company.list",
        "crm.deal.list",
        "crm.item.list",
        "crm.status.list",
        "user.get",
      ]).toContain(method);
    }
  });

  it("route and engine sources contain no mutation capability and no duplicated selects", () => {
    const engineSource = readFileSync(
      new URL("../lib/samples-pipeline-diagnostics.ts", import.meta.url),
      "utf8"
    );
    const routeSource = readFileSync(
      new URL("../app/api/bitrix/diagnostics/samples-pipeline/route.ts", import.meta.url),
      "utf8"
    );
    for (const forbidden of [
      "crm.item.add",
      "crm.item.update",
      "crm.item.delete",
      "crm.deal.add",
      "crm.company.add",
      "crm.item.get",
    ]) {
      expect(engineSource).not.toContain(forbidden);
      expect(routeSource).not.toContain(forbidden);
    }
    // No duplicated select arrays (selects are imported, never retyped).
    expect(engineSource).not.toMatch(/SELECT:\s*\[\s*"/);
    expect(engineSource).not.toMatch(/select:\s*\[\s*"/);
    expect(routeSource).not.toContain("bitrixPost");
    // Production selects must be imported by name from their canonical modules.
    expect(engineSource).toContain("COMMERCIAL_COMPANY_SELECT");
    expect(engineSource).toContain("COMMERCIAL_DEAL_SELECT");
    // The probe D helper is the real one, not a reimplementation.
    expect(engineSource).toContain("fetchSmartProcessSampleItems");
  });
});

// ─── Case 16: single Samples parser invariant ───
describe("case 16: no second Samples parser", () => {
  it("engine uses the shared validator and never re-parses response shape", () => {
    const engineSource = readFileSync(
      new URL("../lib/samples-pipeline-diagnostics.ts", import.meta.url),
      "utf8"
    );
    expect(engineSource).toContain("validateSamplesClientPayload");
    expect(engineSource).not.toMatch(/Array\.isArray\(.*samples/);
  });
});

// ─── Case 18: CF probe skipped on upstream Samples failure ───
describe("case 18: Commercial Funnel probe skipped on upstream failure", () => {
  it("aggregation failure → commercialFunnelInput SKIPPED UPSTREAM_SAMPLES_FAILED", async () => {
    const aggregate = await import("@/lib/samples/aggregate");
    const spy = vi
      .spyOn(aggregate, "buildSampleSummaries")
      .mockImplementation(() => {
        throw new Error("synthetic");
      });
    try {
      mockFullHappyPath({ companies: 1, deals: 1, spItems: 1 });
      const body = await (await GET_REQUEST()).json();
      expect(body.probes.commercialFunnelInput).toEqual({
        status: "SKIPPED",
        reason: "UPSTREAM_SAMPLES_FAILED",
      });
      expect(cfHelpers.fetchDealsActivities).not.toHaveBeenCalled();
      expect(cfHelpers.fetchUserDirectory).not.toHaveBeenCalled();
    } finally {
      spy.mockRestore();
    }
  });
});

// ─── Case 19 (CF-input failure path): CF helper failure is measured, not hidden ───
describe("case 19: Commercial Funnel input failure", () => {
  it("CF helper throws → probe FAIL, diagnosis COMMERCIAL_FUNNEL_INPUT_FAILED", async () => {
    cfHelpers.fetchDealsActivities.mockRejectedValueOnce(
      new Error("synthetic activities failure")
    );
    mockFullHappyPath({ companies: 2, deals: 2, spItems: 1 });
    const body = await (await GET_REQUEST()).json();
    expect(body.probes.commercialFunnelInput.status).toBe("FAIL");
    expect(body.probes.commercialFunnelInput.method).toBe("commercial-funnel-input");
    expect(body.diagnosis).toBe("COMMERCIAL_FUNNEL_INPUT_FAILED");
    // Samples probes remain PASS — CF is downstream.
    expect(body.probes.aggregation.status).toBe("PASS");
    expect(body.probes.clientContract).toEqual({ status: "PASS" });
  });
});

// ─── Case 20: existing Smart Process transport diagnostic untouched ───
describe("case 20: Smart Process transport diagnostic independence", () => {
  it("engine does not import the first diagnostic routine", () => {
    const engineSource = readFileSync(
      new URL("../lib/samples-pipeline-diagnostics.ts", import.meta.url),
      "utf8"
    );
    expect(engineSource).not.toContain("bitrix-diagnostics");
    expect(engineSource).not.toContain("runSmartProcessDiagnostics");
  });

  it("first diagnostic route source is unmodified by this engine (no shared mutable state)", () => {
    const firstRouteSource = readFileSync(
      new URL("../app/api/bitrix/diagnostics/smart-process/route.ts", import.meta.url),
      "utf8"
    );
    expect(firstRouteSource).not.toContain("samples-pipeline-diagnostics");
  });
});

// ─── diagnoseSamplesPipeline truth table (pure) ───
describe("diagnosis mapping (pure function)", () => {
  const base = () => ({
    fieldMetadata: { status: "PASS", labelCount: 1, partial: false } as const,
    companies: { status: "PASS", count: 1 } as const,
    deals: { status: "PASS", count: 1 } as const,
    smartProcess: { status: "PASS", count: 1 } as const,
    stageDirectory: { status: "PASS", available: true, knownStageLabelCount: 5 } as const,
    dealCompanyMap: { status: "PASS", referencedDealCount: 1, resolvedRelationCount: 1 } as const,
    aggregation: {
      status: "PASS",
      summaryCount: 1,
      orphanDealCount: 0,
      qualityCounts: {
        orphanSmartProcessItemCount: 0,
        relationConflictCount: 0,
        sentStageWithoutDateCount: 0,
        multipleActiveCount: 0,
        stageResultConflictCount: 0,
      },
    } as const,
    clientContract: { status: "PASS" } as const,
    commercialFunnelInput: { status: "PASS", companyCount: 1, dealCount: 1 } as const,
  });

  it("maps each failing layer to exactly one diagnosis", () => {
    expect(
      diagnoseSamplesPipeline({ ...base(), fieldMetadata: { status: "FAIL", method: "m" } })
    ).toBe("FIELDS_METADATA_FAILED");
    expect(
      diagnoseSamplesPipeline({ ...base(), companies: { status: "FAIL", method: "m" } })
    ).toBe("COMPANIES_FETCH_FAILED");
    expect(
      diagnoseSamplesPipeline({ ...base(), deals: { status: "FAIL", method: "m" } })
    ).toBe("DEALS_FETCH_FAILED");
    expect(
      diagnoseSamplesPipeline({ ...base(), smartProcess: { status: "FAIL", method: "m" } })
    ).toBe("SMART_PROCESS_HELPER_FAILED");
    expect(
      diagnoseSamplesPipeline({
        ...base(),
        dealCompanyMap: { status: "FAIL", method: "m" },
      })
    ).toBe("DEAL_COMPANY_MAP_FAILED");
    expect(
      diagnoseSamplesPipeline({ ...base(), aggregation: { status: "FAIL", method: "m" } })
    ).toBe("SAMPLES_AGGREGATION_FAILED");
    expect(
      diagnoseSamplesPipeline({
        ...base(),
        clientContract: { status: "FAIL", reason: "INVALID_SUCCESS_FLAG" },
      })
    ).toBe("SAMPLES_RESPONSE_CONTRACT_FAILED");
    expect(
      diagnoseSamplesPipeline({
        ...base(),
        commercialFunnelInput: { status: "FAIL", method: "m" },
      })
    ).toBe("COMMERCIAL_FUNNEL_INPUT_FAILED");
    expect(diagnoseSamplesPipeline(base())).toBe("SAMPLES_PIPELINE_OK");
  });

  it("zero-summary aggregation is PASS, not failure", () => {
    expect(
      diagnoseSamplesPipeline({
        ...base(),
        aggregation: {
          status: "PASS",
          summaryCount: 0,
          orphanDealCount: 0,
          qualityCounts: {
            orphanSmartProcessItemCount: 0,
            relationConflictCount: 0,
            sentStageWithoutDateCount: 0,
            multipleActiveCount: 0,
            stageResultConflictCount: 0,
          },
        },
      })
    ).toBe("SAMPLES_PIPELINE_OK");
  });

  it("NOT_RUN probes yield DIAGNOSTIC_INCOMPLETE (no invented outcomes)", () => {
    const incomplete = base();
    // The stage directory is a display-only non-fatal side probe; the
    // diagnosis never gates on it, so it is excluded from the NOT_RUN
    // sweep (its DEGRADED fallback is legitimate in every state).
    const gatedKeys = [
      "fieldMetadata",
      "companies",
      "deals",
      "smartProcess",
      "dealCompanyMap",
      "aggregation",
      "clientContract",
      "commercialFunnelInput",
    ] as const;
    for (const key of gatedKeys) {
      const probes = {
        ...incomplete,
        [key]: { status: "SKIPPED", reason: "NOT_RUN" },
      } as typeof incomplete;
      expect(diagnoseSamplesPipeline(probes)).toBe("DIAGNOSTIC_INCOMPLETE");
    }
  });
});

// ─── Production helper identity (case 15: no fake equivalents) ───
describe("production helper identity", () => {
  it("probe D consumes the real fetchSmartProcessSampleItems (crm.item.list with production contract)", async () => {
    mockFullHappyPath({ companies: 1, deals: 1, spItems: 1 });
    await runSamplesPipelineDiagnostics();

    const itemCalls = bitrixPostMock.mock.calls.filter(([m]) => m === "crm.item.list");
    expect(itemCalls.length).toBeGreaterThanOrEqual(1);
    const probeDCall = itemCalls[0];
    const params = probeDCall[1] as Record<string, unknown>;
    expect(params.entityTypeId).toBe(1032);
    expect(params.useOriginalUfNames).toBe("Y");
    expect(params.filter).toEqual({ categoryId: 15 });
  });
});
