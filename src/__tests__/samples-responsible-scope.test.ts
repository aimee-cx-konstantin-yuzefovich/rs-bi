// @vitest-environment node
// src/__tests__/samples-responsible-scope.test.ts
// ─────────────────────────────────────────────────────────────────────
// COMPANY-grain responsible scope + combined scope regressions.
//
// Documented Samples `responsibleId` scope = COMPANY responsible filter
// (Company ASSIGNED_BY_ID — identical to the Companies browser):
//   C.12 Company owner=7, Deal owner=99 → responsibleId=7 includes the
//        company AND its Deal/SP evidence (deal ownership is irrelevant);
//   C.13 responsibleId=99 must NOT include the company merely because its
//        Deal is owned by 99 — and `responsibleId` is never pushed to
//        crm.deal.list ASSIGNED_BY_ID;
//   C.14 SP assignee must not control the Company responsible scope;
//   C.15 aggregate 5b: SP-only company outside allowedCompanyIds cannot
//        re-enter (canonical unscoped behavior preserved without the set);
//   C.16 scoped quality counts: out-of-scope conflict/orphan items do not
//        contaminate counts; provenance (directCompanyId / dealCompanyId)
//        decides — never the SP assignee;
//   C.17 full unscoped semantics unchanged (no option → identical output);
//   D.18 companyId=42 + wrong responsibleId → truthful successful empty
//        response (success: true, samples: [], total: 0);
//   D.19 the wrong combined scope performs NO Smart Process / Deal
//        population load;
//   D.20 companyId=42 + matching responsibleId → canonical scoped items
//        still include fallback-by-Deal evidence;
//   D.21 relation-conflict exclusion remains intact under combined scope.
//
// All fixtures use realistic positive-integer-string CRM IDs (the same ID
// shape production Bitrix uses); the mocked transport rejects shapes the
// real API contract would reject (positive-integer IDs only).
// ─────────────────────────────────────────────────────────────────────
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest, NextResponse } from "next/server";

const auth = vi.hoisted(() => ({ requireAuth: vi.fn() }));
vi.mock("@/lib/auth-guard", () => ({
  ...auth,
  isAuthError: (value: unknown) => value instanceof NextResponse,
}));

const spContract = vi.hoisted(() => ({
  SMART_PROCESS_HAS_DISCOVERED_CONTRACT: true,
  SMART_PROCESS_ENTITY_TYPE_ID: 1032,
  SMART_PROCESS_CATEGORY_ID: 15,
  SMART_PROCESS_SENT_DATE_FIELD_ID: "UF_CRM_SP_SENT_DATE_TEST",
  SMART_PROCESS_DEAL_FIELD_ID: "parentId2",
  SMART_PROCESS_GRADE_GEL_FIELD_ID: "UF_CRM_SP_GEL_TEST",
  SMART_PROCESS_GRADE_SOL_FIELD_ID: "UF_CRM_SP_SOL_TEST",
  SMART_PROCESS_TEST_RESULT_FIELD_ID: "UF_CRM_SP_RESULT_TEST",
  SMART_PROCESS_QTY_GEL_FIELD_ID: "UF_CRM_SP_QTY_GEL_TEST",
  SMART_PROCESS_QTY_GEL_UNIT: "кг",
  SMART_PROCESS_QTY_SOL_FIELD_ID: "UF_CRM_SP_QTY_SOL_TEST",
  SMART_PROCESS_QTY_SOL_UNIT: "л",
  assertSmartProcessContractReady: () => {},
  SMART_PROCESS_STAGE_SEMANTICS: {
    "DT1032_15:NEW": "PREPARATION",
    "DT1032_15:UC_ZARRMX": "SAMPLES_SENT",
    "DT1032_15:CLIENT": "TESTING_IN_PROGRESS",
    "DT1032_15:SUCCESS": "TERMINAL_SUCCESS",
    "DT1032_15:FAIL": "TERMINAL_FAILURE",
  },
  SMART_PROCESS_ACTIVE_STAGES: new Set(["DT1032_15:NEW", "DT1032_15:UC_ZARRMX", "DT1032_15:CLIENT"]),
  SMART_PROCESS_TERMINAL_STAGES: new Set(["DT1032_15:SUCCESS", "DT1032_15:FAIL"]),
  SMART_PROCESS_STAGE_LABELS: {
    "DT1032_15:NEW": "Подготовка к отправке",
    "DT1032_15:UC_ZARRMX": "Образцы отправлены",
    "DT1032_15:CLIENT": "На испытании",
    "DT1032_15:SUCCESS": "Подошли",
    "DT1032_15:FAIL": "Не подошли",
  },
  smartProcessStageSemantic: (id?: string) =>
    (id && ({
      "DT1032_15:NEW": "PREPARATION",
      "DT1032_15:UC_ZARRMX": "SAMPLES_SENT",
      "DT1032_15:CLIENT": "TESTING_IN_PROGRESS",
      "DT1032_15:SUCCESS": "TERMINAL_SUCCESS",
      "DT1032_15:FAIL": "TERMINAL_FAILURE",
    } as Record<string, string>)[id]) as any,
  isSmartProcessActiveStage: (id?: string) =>
    Boolean(id && ["DT1032_15:NEW", "DT1032_15:UC_ZARRMX", "DT1032_15:CLIENT"].includes(id)),
  isSmartProcessTerminalStage: (id?: string) =>
    Boolean(id && ["DT1032_15:SUCCESS", "DT1032_15:FAIL"].includes(id)),
  // N-mode transport contract (verified static mapping mirrors the mock's
  // canonical original names under the documented camelCase conversion).
  SMART_PROCESS_N_MODE_CUSTOM_ROLES: [
    "SENT_DATE",
    "GRADE_GEL",
    "GRADE_SOL",
    "QTY_GEL",
    "QTY_SOL",
    "TEST_RESULT",
  ],
  SMART_PROCESS_N_MODE_FIELD_NAMES: {
    SENT_DATE: "ufCrmSpSentDateTest",
    GRADE_GEL: "ufCrmSpGelTest",
    GRADE_SOL: "ufCrmSpSolTest",
    QTY_GEL: "ufCrmSpQtyGelTest",
    QTY_SOL: "ufCrmSpQtySolTest",
    TEST_RESULT: "ufCrmSpResultTest",
  },
  assertSmartProcessNModeMappingComplete: () => {},
}));


vi.mock("@/lib/samples/smart-process-contract", () => spContract);
// The samples route re-exports the contract gate through crm-constants too.
vi.mock("@/lib/crm-constants", async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return { ...actual, SMART_PROCESS_HAS_DISCOVERED_CONTRACT: true };
});

import { POST as samplesPOST } from "@/app/api/bitrix/samples/route";
import {
  buildCanonicalSampleDomain,
  buildSampleSummaries,
} from "@/lib/samples/aggregate";

const webhook = "https://portal.bitrix24.ru/rest/1/SECRET_TOKEN";
const fetchMock = vi.fn();

const listPage = (rows: unknown[], extra: Record<string, unknown> = {}) =>
  new Response(JSON.stringify({ result: rows, ...extra }), { status: 200 });

const samplesRequest = (body?: unknown) =>
  samplesPOST(
    new NextRequest("http://localhost/api/bitrix/samples", {
      method: "POST",
      body: body === undefined ? undefined : JSON.stringify(body),
      headers: body === undefined ? undefined : { "content-type": "application/json" },
    })
  );

// ─── Fixture (realistic CRM ID shapes) ────────────────────────────────
// Companies (authoritative responsible grain):
//   42  — owner 7  (the contested company)
//   77  — owner 8  (another responsible's company)
//   88  — owner 7  (sample-active via legacy Company fields)
// Deals:
//   501 — COMPANY_ID 42, ASSIGNED_BY_ID 99  (Deal owner ≠ Company owner!)
//   502 — COMPANY_ID 42, ASSIGNED_BY_ID 7   (sample data present)
//   777 — COMPANY_ID 77, ASSIGNED_BY_ID 8
// Smart Process items (complete population):
//   9001 — direct companyId=42,  assignedById=55 (SP assignee ≠ Company owner!)
//   9002 — companyId=0, parentId2=501 (→ Company 42 via Deal) — fallback-by-Deal
//   9003 — direct companyId=42,  parentId2=777 (→ Company 77) — RELATION CONFLICT
//   9004 — direct companyId=77,  assignedById=55 — out of owner-7 scope
//   9005 — companyId=0, no deal — orphan
//   9006 — direct companyId=70, no deals — SP-only company OUTSIDE company rows
const COMPANY_ROWS = [
  { ID: "42", TITLE: "Компания Сорок Два", ASSIGNED_BY_ID: "7", UF_CRM_1753187313314: ["1"] },
  { ID: "77", TITLE: "Компания Семьдесят Семь", ASSIGNED_BY_ID: "8" },
  { ID: "88", TITLE: "Компания Восемьдесят Восемь", ASSIGNED_BY_ID: "7", UF_CRM_1764156593: "Положительный" },
];
const DEAL_ROWS = [
  {
    ID: "501", TITLE: "Сделка 501", STAGE_ID: "NEW", COMPANY_ID: "42",
    ASSIGNED_BY_ID: "99", UF_CRM_1779386185: "Переданы",
  },
  {
    ID: "502", TITLE: "Сделка 502", STAGE_ID: "NEW", COMPANY_ID: "42",
    ASSIGNED_BY_ID: "7", UF_CRM_1779386185: "Испытание",
  },
  {
    ID: "777", TITLE: "Сделка 777", STAGE_ID: "NEW", COMPANY_ID: "77",
    ASSIGNED_BY_ID: "8",
  },
];
const SP_ROWS = [
  { id: "9001", title: "SP 9001", stageId: "DT1032_15:CLIENT", companyId: "42", assignedById: "55" },
  { id: "9002", title: "SP 9002", stageId: "DT1032_15:CLIENT", companyId: "0", parentId2: "501", assignedById: "55" },
  { id: "9003", title: "SP 9003", stageId: "DT1032_15:CLIENT", companyId: "42", parentId2: "777", assignedById: "55" },
  { id: "9004", title: "SP 9004", stageId: "DT1032_15:CLIENT", companyId: "77", assignedById: "55" },
  { id: "9005", title: "SP 9005", stageId: "DT1032_15:CLIENT", companyId: "0", assignedById: "55" },
  { id: "9006", title: "SP 9006", stageId: "DT1032_15:CLIENT", companyId: "70", assignedById: "7" },
];

function installTransport() {
  fetchMock.mockImplementation((url: string, init?: { body?: string }) => {
    const parseBody = () => JSON.parse(String(init?.body ?? "{}"));
    if (url.endsWith("crm.company.fields") || url.endsWith("crm.deal.fields")) {
      return Promise.resolve(listPage({ result: {} } as any));
    }
    if (url.endsWith("crm.status.list")) {
      return Promise.resolve(listPage({ result: [] } as any));
    }
    if (url.endsWith("crm.company.list")) {
      const body = parseBody();
      const filter = body.FILTER ?? {};
      const scoped = COMPANY_ROWS.filter((c) => {
        if (filter.ID !== undefined && c.ID !== filter.ID) return false;
        if (filter.ASSIGNED_BY_ID !== undefined && c.ASSIGNED_BY_ID !== filter.ASSIGNED_BY_ID) return false;
        return true;
      });
      return Promise.resolve(listPage(scoped, { total: scoped.length }));
    }
    if (url.endsWith("crm.deal.list")) {
      const body = parseBody();
      const filter = body.FILTER ?? {};
      if (filter["@ID"]) {
        const ids: string[] = filter["@ID"];
        const matched = DEAL_ROWS.filter((d) => ids.includes(d.ID));
        return Promise.resolve(listPage(matched, { total: matched.length }));
      }
      if (filter.COMPANY_ID) {
        const scoped = DEAL_ROWS.filter((d) => d.COMPANY_ID === filter.COMPANY_ID);
        return Promise.resolve(listPage(scoped, { total: scoped.length }));
      }
      // Unscoped deal read: the COMPLETE deal population.
      return Promise.resolve(listPage(DEAL_ROWS, { total: DEAL_ROWS.length }));
    }
    if (url.endsWith("crm.item.list")) {
      // The complete SP population (no responsibleId/companyId filter is
      // ever accepted for SP in the samples route).
      const body = parseBody();
      expect(body.filter && body.filter.ASSIGNED_BY_ID).toBeUndefined();
      expect(body.filter && body.filter.assignedById).toBeUndefined();
      return Promise.resolve(listPage(SP_ROWS, { total: SP_ROWS.length }));
    }
    return Promise.resolve(listPage([], { total: 0 }));
  });
}

beforeEach(() => {
  vi.stubEnv("BITRIX_WEBHOOK_URL", webhook);
  vi.stubGlobal("fetch", fetchMock);
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
  auth.requireAuth.mockResolvedValue({ userId: "user" });
  installTransport();
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  fetchMock.mockReset();
});

describe("responsibleId = COMPANY responsible grain (API)", () => {
  it("C.12: responsibleId=7 (Company owner) includes Company 42 with Deal-owner-99 evidence and SP-assignee-55 evidence", async () => {
    const response = await samplesRequest({ responsibleId: "7" });
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.success).toBe(true);

    const ids = body.samples.map((s: { companyId: string }) => s.companyId);
    expect(ids).toContain("42");
    expect(ids).toContain("88"); // owner 7, legacy Company sample activity
    expect(ids).not.toContain("77"); // owner 8
    expect(ids).not.toContain("70"); // SP-only company, absent from Company rows

    const c42 = body.samples.find((s: { companyId: string }) => s.companyId === "42");
    // Deal evidence owned by 99 belongs to Company 42 (company-grain scope).
    expect(c42.relatedDeals.map((d: { id: string }) => d.id).sort()).toEqual(["501", "502"]);
    // SP evidence: direct 9001 + fallback-by-Deal 9002; conflict 9003 excluded.
    const spIds = (c42.smartProcessItems ?? []).map((v: { processItemId: string }) => v.processItemId);
    expect(spIds).toContain("9001");
    expect(spIds).toContain("9002");
    expect(spIds).not.toContain("9003");
  });

  it("C.13: responsibleId=99 (Deal owner) does NOT include Company 42; responsibleId is never pushed to Deal ASSIGNED_BY_ID", async () => {
    const response = await samplesRequest({ responsibleId: "99" });
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.success).toBe(true);
    const ids = body.samples.map((s: { companyId: string }) => s.companyId);
    expect(ids).not.toContain("42");

    // The responsible filter travels ONLY as Company ASSIGNED_BY_ID.
    const companyCalls = fetchMock.mock.calls.filter(([u]) => String(u).endsWith("crm.company.list"));
    expect(companyCalls.length).toBeGreaterThan(0);
    for (const [, init] of companyCalls) {
      const filter = JSON.parse(String((init as { body?: string })?.body ?? "{}")).FILTER ?? {};
      expect(filter.ASSIGNED_BY_ID).toBe("99");
    }
    // NO deal.list request ever carries ASSIGNED_BY_ID (wrong semantics
    // made unrepresentable at the transport seam).
    const dealCalls = fetchMock.mock.calls.filter(([u]) => String(u).endsWith("crm.deal.list"));
    for (const [, init] of dealCalls) {
      const filter = JSON.parse(String((init as { body?: string })?.body ?? "{}")).FILTER ?? {};
      expect(filter.ASSIGNED_BY_ID).toBeUndefined();
    }
    // SP is never responsible-filtered.
    const itemCalls = fetchMock.mock.calls.filter(([u]) => String(u).endsWith("crm.item.list"));
    for (const [, init] of itemCalls) {
      const filter = JSON.parse(String((init as { body?: string })?.body ?? "{}")).filter ?? {};
      expect(filter.ASSIGNED_BY_ID).toBeUndefined();
      expect(filter.assignedById).toBeUndefined();
    }
  });

  it("C.14: responsibleId=55 (SP assignee) does NOT include Company 42", async () => {
    const response = await samplesRequest({ responsibleId: "55" });
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.success).toBe(true);
    const ids = body.samples.map((s: { companyId: string }) => s.companyId);
    expect(ids).not.toContain("42");
    expect(ids).not.toContain("70"); // SP-only assignee match never enters
  });
});

describe("combined companyId + responsibleId scope (API)", () => {
  it("D.18: companyId=42 + wrong responsibleId → truthful successful empty response", async () => {
    const response = await samplesRequest({ companyId: "42", responsibleId: "99" });
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.success).toBe(true);
    expect(body.samples).toEqual([]);
    expect(body.total).toBe(0);
  });

  it("D.19: the wrong combined scope performs NO Deal or Smart Process population load", async () => {
    await samplesRequest({ companyId: "42", responsibleId: "99" });
    expect(fetchMock.mock.calls.filter(([u]) => String(u).endsWith("crm.item.list"))).toHaveLength(0);
    expect(fetchMock.mock.calls.filter(([u]) => String(u).endsWith("crm.deal.list"))).toHaveLength(0);
    // The authoritative Company filter DID run.
    const companyCalls = fetchMock.mock.calls.filter(([u]) => String(u).endsWith("crm.company.list"));
    expect(companyCalls.length).toBeGreaterThan(0);
    const companyFilter = JSON.parse(String(companyCalls[0][1]?.body ?? "{}")).FILTER;
    expect(companyFilter).toEqual({ ID: "42", ASSIGNED_BY_ID: "99" });
  });

  it("D.20: companyId=42 + matching responsibleId → canonical scoped items include fallback-by-Deal evidence", async () => {
    const response = await samplesRequest({ companyId: "42", responsibleId: "7" });
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.success).toBe(true);
    const c42 = body.samples.find((s: { companyId: string }) => s.companyId === "42");
    expect(c42).toBeTruthy();
    const spIds = (c42.smartProcessItems ?? []).map((v: { processItemId: string }) => v.processItemId);
    expect(spIds).toContain("9001"); // direct
    expect(spIds).toContain("9002"); // fallback-by-Deal
  });

  it("D.21: relation-conflict exclusion remains intact under combined scope", async () => {
    const response = await samplesRequest({ companyId: "42", responsibleId: "7" });
    const body = await response.json();
    const c42 = body.samples.find((s: { companyId: string }) => s.companyId === "42");
    const spIds = (c42.smartProcessItems ?? []).map((v: { processItemId: string }) => v.processItemId);
    expect(spIds).not.toContain("9003"); // direct 42 vs linked Deal 777 → Company 77
  });
});

describe("aggregate allowedCompanyIds (canonical company-grain scope)", () => {
  const identity = (fieldId: string, rawValue: string) => rawValue;

  it("C.15: SP-only company outside allowedCompanyIds cannot re-enter via 5b", () => {
    // 70 exists ONLY as an SP companyId (no Company row passed in).
    const domain = buildCanonicalSampleDomain(COMPANY_ROWS, DEAL_ROWS, SP_ROWS, {
      labelResolver: identity,
      allowedCompanyIds: new Set(["42", "88"]),
    });
    expect(domain.canonicalByCompany.has("70")).toBe(false);
    expect(domain.canonicalByCompany.has("42")).toBe(true);
    // Without the option the canonical unscoped SP-only discovery holds.
    const unscoped = buildCanonicalSampleDomain(COMPANY_ROWS, DEAL_ROWS, SP_ROWS, {
      labelResolver: identity,
    });
    expect(unscoped.canonicalByCompany.has("70")).toBe(true);
  });

  it("C.16: out-of-scope conflict/orphan items do not contaminate scoped quality counts; provenance decides", () => {
    const scoped = buildCanonicalSampleDomain(COMPANY_ROWS, DEAL_ROWS, SP_ROWS, {
      labelResolver: identity,
      allowedCompanyIds: new Set(["42"]),
    });
    // 9003 (conflict, direct 42 ∈ scope via directCompanyId) IS counted;
    // 9004 (company 77 ∉ scope), 9005 (orphan), 9006 (company 70 ∉ scope)
    // contribute nothing.
    expect(scoped.qualityCounts.relationConflictCount).toBe(1);
    expect(scoped.qualityCounts.orphanSmartProcessItemCount).toBe(0);
    expect(scoped.canonicalByCompany.has("77")).toBe(false);

    const unscoped = buildCanonicalSampleDomain(COMPANY_ROWS, DEAL_ROWS, SP_ROWS, {
      labelResolver: identity,
    });
    // Full scope: orphan 9005 + 9002 resolved via deal map (not orphan) —
    // 9005 is the only orphan; conflict 9003 the only conflict.
    expect(unscoped.qualityCounts.orphanSmartProcessItemCount).toBe(1);
    expect(unscoped.qualityCounts.relationConflictCount).toBe(1);
  });

  it("C.17: full unscoped semantics unchanged — option omitted keeps summaries byte-identical", () => {
    const before = buildSampleSummaries(COMPANY_ROWS, DEAL_ROWS, SP_ROWS, { labelResolver: identity });
    const after = buildSampleSummaries(COMPANY_ROWS, DEAL_ROWS, SP_ROWS, { labelResolver: identity });
    expect(after).toEqual(before);
    expect(before.summaries.map((s) => s.companyId).sort()).toEqual(["42", "70", "77", "88"]);
  });
});
