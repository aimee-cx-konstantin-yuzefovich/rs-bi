// @vitest-environment node
// src/__tests__/smart-process-company-scope.test.ts
// ─────────────────────────────────────────────────────────────────────
// §7.1–7.6 — company-scoped Smart Process attribution regressions.
//
// Covers the ONE shared trustworthy company-scope mechanism used by BOTH
// /api/bitrix/samples { companyId } and /api/bitrix/smart-process-items
// { companyId }:
//   1. direct company X → included;
//   2. no direct company + exact parentId2 → Deal of X → included in X
//      (fallback-by-Deal must never be lost);
//   3. direct company X + linked Deal of Y → REAL relation conflict from
//      canonical adapter input (directCompanyId ≠ linked Deal COMPANY_ID,
//      issue code `smart_process_relation_conflict`) → excluded from BOTH
//      company aggregates;
//   4. the scoped route has COMPLETE Deal relation evidence (the foreign Y
//      deal arrives via the bounded bulk {"@ID":[...]} map — not from the
//      scoped deal subset);
//   5. both scoped routes agree on Company attribution;
//   6. no per-SP-item Deal requests / no N+1 (bounded chunk counts only).
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
}));

vi.mock("@/lib/samples/smart-process-contract", () => spContract);
// The samples route re-exports the contract gate through crm-constants too.
vi.mock("@/lib/crm-constants", async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return { ...actual, SMART_PROCESS_HAS_DISCOVERED_CONTRACT: true };
});

import { POST as samplesPOST } from "@/app/api/bitrix/samples/route";
import { POST as spItemsPOST } from "@/app/api/bitrix/smart-process-items/route";
import {
  collectCompanyScopedSmartProcessCandidates,
} from "@/lib/samples/smart-process-service";

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

const spItemsRequest = (body?: unknown) =>
  spItemsPOST(
    new Request("http://localhost/api/bitrix/smart-process-items", {
      method: "POST",
      body: body === undefined ? undefined : JSON.stringify(body),
      headers: body === undefined ? undefined : { "content-type": "application/json" },
    })
  );

// ─── Fixture: company X=42, company Y=77 ──────────────────────────────
// Deals:
//   501 → X (X's own deal)
//   777 → Y (Y's own deal — FOREIGN to X; never inside X's scoped deal rows)
// SP items (complete population):
//   9001 direct companyId=42, no deal                → included for X
//   9002 no direct company, parentId2=501 (→ X)      → included for X (fallback-by-Deal)
//   9003 direct companyId=42, parentId2=777 (→ Y)    → RELATION CONFLICT, excluded from both
//   9004 direct companyId=77                        → Y only, never X
//   9005 no relations at all                        → orphan, excluded
const DEAL_ROWS = [
  { ID: "501", TITLE: "Сделка X-1", STAGE_ID: "NEW", COMPANY_ID: "42", ASSIGNED_BY_ID: "7" },
  { ID: "777", TITLE: "Сделка Y-1", STAGE_ID: "NEW", COMPANY_ID: "77", ASSIGNED_BY_ID: "7" },
];
const SP_ROWS = [
  { id: "9001", title: "SP 9001", stageId: "DT1032_15:CLIENT", companyId: "42", assignedById: "7" },
  { id: "9002", title: "SP 9002", stageId: "DT1032_15:CLIENT", companyId: "0", parentId2: "501", assignedById: "7" },
  { id: "9003", title: "SP 9003", stageId: "DT1032_15:CLIENT", companyId: "42", parentId2: "777", assignedById: "7" },
  { id: "9004", title: "SP 9004", stageId: "DT1032_15:CLIENT", companyId: "77", assignedById: "7" },
  { id: "9005", title: "SP 9005", stageId: "DT1032_15:CLIENT", companyId: "0", assignedById: "7" },
];
const COMPANY_ROWS = [
  { ID: "42", TITLE: "Компания X", ASSIGNED_BY_ID: "7" },
  { ID: "77", TITLE: "Компания Y", ASSIGNED_BY_ID: "7" },
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
      return Promise.resolve(listPage(COMPANY_ROWS, { total: COMPANY_ROWS.length }));
    }
    if (url.endsWith("crm.deal.list")) {
      const body = parseBody();
      if (body.FILTER && body.FILTER.COMPANY_ID) {
        // Company-scoped deal read: only that company's deals.
        const scoped = DEAL_ROWS.filter((d) => d.COMPANY_ID === body.FILTER.COMPANY_ID);
        return Promise.resolve(listPage(scoped, { total: scoped.length }));
      }
      if (body.FILTER && body.FILTER["@ID"]) {
        // Bounded bulk relation map: returns the referenced deals REGARDLESS
        // of the requesting company (this is where the foreign Y deal must
        // come from for conflict detection).
        const ids: string[] = body.FILTER["@ID"];
        const matched = DEAL_ROWS.filter((d) => ids.includes(d.ID));
        return Promise.resolve(listPage(matched, { total: matched.length }));
      }
      // Unscoped deal read: everything.
      return Promise.resolve(listPage(DEAL_ROWS, { total: DEAL_ROWS.length }));
    }
    if (url.endsWith("crm.item.list")) {
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

/** SP item IDs visible for company X from a /samples scoped response. */
async function samplesCompanyItemIds(companyId: string): Promise<{
  processItemIds: string[];
  status: number;
}> {
  const response = await samplesRequest({ companyId });
  const body = await response.json();
  const summary = (body.samples ?? []).find((s: { companyId: string }) => s.companyId === companyId);
  return {
    processItemIds: (summary?.smartProcessItems ?? []).map((v: { processItemId: string }) => v.processItemId),
    status: response.status,
  };
}

/** SP item IDs attributed to company X from the /smart-process-items scoped response. */
async function spItemsCompanyItemIds(companyId: string): Promise<{
  processItemIds: string[];
  status: number;
}> {
  const response = await spItemsRequest({ companyId });
  const body = await response.json();
  const byCompany = body.byCompanyId?.[companyId] ?? [];
  const fromIndex = (byCompany as Array<{ processItemId: string }>).map((v) => v.processItemId);
  // Canonical ground truth inside the route: byCompanyId index.
  return { processItemIds: fromIndex, status: response.status };
}

describe("ONE shared company-scope mechanism — candidate collection", () => {
  it("case 1+2: includes direct-company items AND fallback-by-Deal items for X", async () => {
    const scoped = await collectCompanyScopedSmartProcessCandidates("42");
    const ids = scoped.rows.map((r) => String(r.id));
    expect(ids).toContain("9001"); // direct
    expect(ids).toContain("9002"); // fallback-by-Deal (no direct company, Deal of X)
  });

  it("case 2: never relies on a direct-company-only SP filter (complete population read)", async () => {
    await collectCompanyScopedSmartProcessCandidates("42").then(() => {});
    const itemBodies = fetchMock.mock.calls
      .filter(([u]) => String(u).endsWith("crm.item.list"))
      .map(([, init]) => JSON.parse(String(init?.body ?? "{}")));
    expect(itemBodies.length).toBeGreaterThan(0);
    for (const body of itemBodies) {
      // A direct-company-only filter would silently drop the fallback-by-Deal case.
      expect(body.filter).not.toHaveProperty("companyId");
    }
  });

  it("case 4: fetches the COMPLETE Deal→Company map including the foreign Y deal via bounded @ID bulk chunks", async () => {
    const scoped = await collectCompanyScopedSmartProcessCandidates("42");
    // The map must contain the foreign deal 777→Y (needed to detect item 9003's conflict)
    // even though X's own scoped deal rows never include 777.
    expect(scoped.dealCompanyById.get("501")).toBe("42");
    expect(scoped.dealCompanyById.get("777")).toBe("77");
    // Bulk chunk contract: uppercase "@ID" IN filter, bounded chunk (≤50).
    const bulkCalls = fetchMock.mock.calls.filter(([u, init]) => {
      if (!String(u).endsWith("crm.deal.list")) return false;
      const body = JSON.parse(String((init as { body?: string })?.body ?? "{}"));
      return Boolean(body.FILTER && body.FILTER["@ID"]);
    });
    expect(bulkCalls.length).toBeGreaterThan(0);
    for (const [, init] of bulkCalls) {
      const body = JSON.parse(String((init as { body?: string })?.body ?? "{}"));
      expect(body.FILTER["@ID"].length).toBeLessThanOrEqual(50);
    }
  });

  it("case 6: no per-SP-item Deal requests — one scoped deal read + bounded bulk chunks only", async () => {
    await collectCompanyScopedSmartProcessCandidates("42");
    const dealListCalls = fetchMock.mock.calls.filter(([u]) => String(u).endsWith("crm.deal.list"));
    // 1 scoped read + 1 bulk chunk (2 referenced deals in one 50-sized chunk).
    expect(dealListCalls.length).toBe(2);
    const itemCalls = fetchMock.mock.calls.filter(([u]) => String(u).endsWith("crm.item.list"));
    // Partitioned production contract: one complete population read per
    // committed partition (2), still no per-item requests anywhere.
    expect(itemCalls.length).toBe(2);
  });

  it("rejects an invalid companyId before any Bitrix work", async () => {
    await expect(collectCompanyScopedSmartProcessCandidates("0")).rejects.toThrow();
    await expect(collectCompanyScopedSmartProcessCandidates("-5")).rejects.toThrow();
    await expect(collectCompanyScopedSmartProcessCandidates("abc")).rejects.toThrow();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("scoped routes agree on Company attribution", () => {
  it("case 5: /samples { companyId } and /smart-process-items { companyId } agree for X and for Y", async () => {
    const fromSamples = await samplesCompanyItemIds("42");
    expect(fromSamples.status).toBe(200);
    const fromSpItems = await spItemsCompanyItemIds("42");
    expect(fromSpItems.status).toBe(200);
    expect(fromSpItems.processItemIds.sort()).toEqual(fromSamples.processItemIds.sort());

    // Mirror check for Y.
    const ySamples = await samplesCompanyItemIds("77");
    const ySpItems = await spItemsCompanyItemIds("77");
    expect(ySpItems.processItemIds.sort()).toEqual(ySamples.processItemIds.sort());
  });

  it("case 1+2: X sees 9001 (direct) and 9002 (fallback-by-Deal)", async () => {
    const { processItemIds } = await samplesCompanyItemIds("42");
    expect(processItemIds).toContain("9001");
    expect(processItemIds).toContain("9002");
    expect(processItemIds).toHaveLength(2);
  });

  it("case 3: relation-conflicted 9003 is excluded from BOTH X and Y aggregates (real adapter conflict)", async () => {
    const x = await samplesCompanyItemIds("42");
    expect(x.processItemIds).not.toContain("9003");
    const y = await samplesCompanyItemIds("77");
    expect(y.processItemIds).not.toContain("9003");
    expect(y.processItemIds).toContain("9004");

    // Canonical adapter input check: the conflict originates from
    // directCompanyId (42) ≠ linked Deal COMPANY_ID (77) — the REAL
    // canonical issue code, not a test-invented issue string.
    const { adaptSmartProcessSampleEvidence } = await import("@/lib/samples/adapters/smart-process");
    const identity = (fieldId: string, val: string) => (fieldId === "id" ? val : val);
    const unit = adaptSmartProcessSampleEvidence(SP_ROWS[2], identity, {
      dealCompanyById: new Map([["777", "77"]]),
    })!;
    expect(unit.directCompanyId).toBe("42");
    expect(unit.dealCompanyId).toBe("77");
    expect(unit.issues).toContain("smart_process_relation_conflict");
    expect(unit.companyId).toBe("");

    // Canonical conflict still stays visible under its exact linked Deal in
    // Deal context (byDealId), but never inside Company aggregation.
    const { loadSmartProcessItemViews } = await import("@/lib/samples/smart-process-service");
    const load = await loadSmartProcessItemViews({ companyId: "42" });
    const byDeal = (load.indexes.byDealId.get("777") ?? []).map((v) => v.processItemId);
    expect(byDeal).toContain("9003");
    const byCompanyIds = (load.indexes.byCompanyId.get("42") ?? []).map((v) => v.processItemId);
    expect(byCompanyIds).not.toContain("9003");
  });

  it("case 6 (routes): scoped /samples issues exactly one scoped deal read and no per-item deal requests", async () => {
    await samplesRequest({ companyId: "42" });
    const scopedDealCalls = fetchMock.mock.calls.filter(([u, init]) => {
      if (!String(u).endsWith("crm.deal.list")) return false;
      const body = JSON.parse(String((init as { body?: string })?.body ?? "{}"));
      return Boolean(body.FILTER && body.FILTER.COMPANY_ID === "42");
    });
    expect(scopedDealCalls).toHaveLength(1);
    // Bulk @ID chunk reads stay bounded (1 chunk for 2 referenced deals).
    const bulkCalls = fetchMock.mock.calls.filter(([u, init]) => {
      if (!String(u).endsWith("crm.deal.list")) return false;
      const body = JSON.parse(String((init as { body?: string })?.body ?? "{}"));
      return Boolean(body.FILTER && body.FILTER["@ID"]);
    });
    expect(bulkCalls.length).toBeLessThanOrEqual(1);
  });

  it("empty candidate population → truthful empty response (no masquerade)", async () => {
    fetchMock.mockImplementation((url: string, init?: { body?: string }) => {
      const parseBody = () => JSON.parse(String(init?.body ?? "{}"));
      if (url.endsWith("crm.company.fields") || url.endsWith("crm.deal.fields")) {
        return Promise.resolve(listPage({ result: {} } as any));
      }
      if (url.endsWith("crm.company.list")) {
        return Promise.resolve(listPage([COMPANY_ROWS[0]], { total: 1 }));
      }
      if (url.endsWith("crm.deal.list")) {
        return Promise.resolve(listPage([], { total: 0 }));
      }
      if (url.endsWith("crm.item.list")) {
        return Promise.resolve(listPage([], { total: 0 }));
      }
      return Promise.resolve(listPage([], { total: 0 }));
    });
    const response = await samplesRequest({ companyId: "42" });
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.samples).toHaveLength(0);
  });
});
