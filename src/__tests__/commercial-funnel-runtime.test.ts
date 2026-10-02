// @vitest-environment node
// src/__tests__/commercial-funnel-runtime.test.ts
// Commercial Funnel successful runtime path through the real POST handler:
// - corrected Smart Process request contract (lowercase-only crm.item.list);
// - shared safe Samples label resolver (unknown dictionary enum IDs fail
//   closed to «Не классифицировано», never raw IDs);
// - metadata/activity partial disclosures preserved;
// - authoritative source failure still fails closed after retries exhausted.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest, NextResponse } from "next/server";

const auth = vi.hoisted(() => ({ requireAuth: vi.fn() }));
vi.mock("@/lib/auth-guard", () => ({
  ...auth,
  isAuthError: (value: unknown) => value instanceof NextResponse,
}));

// Contract verified for tests; the production gate stays real and is covered
// by its own fail-closed tests.
const spContract = vi.hoisted(() => ({
  SMART_PROCESS_HAS_DISCOVERED_CONTRACT: true,
  SMART_PROCESS_ENTITY_TYPE_ID: 1032,
  SMART_PROCESS_CATEGORY_ID: 15,
  SMART_PROCESS_SENT_DATE_FIELD_ID: "UF_CRM_SP_SENT_DATE_TEST",
  SMART_PROCESS_DEAL_FIELD_ID: "UF_CRM_SP_DEAL_TEST",
  SMART_PROCESS_GRADE_GEL_FIELD_ID: "UF_CRM_SP_GEL_TEST",
  SMART_PROCESS_GRADE_SOL_FIELD_ID: "UF_CRM_SP_SOL_TEST",
  SMART_PROCESS_TEST_RESULT_FIELD_ID: "UF_CRM_SP_RESULT_TEST",
  SMART_PROCESS_QTY_GEL_FIELD_ID: "UF_CRM_SP_QTY_GEL_TEST",
  SMART_PROCESS_QTY_GEL_UNIT: "кг",
  SMART_PROCESS_QTY_SOL_FIELD_ID: "UF_CRM_SP_QTY_SOL_TEST",
  SMART_PROCESS_QTY_SOL_UNIT: "л",
  SMART_PROCESS_DEAL_UF_FIELD_ID: null,
  SMART_PROCESS_COMPANY_FIELD_ID: "companyId",
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

import { POST } from "@/app/api/bitrix/commercial-funnel/route";

const webhook = "https://portal.bitrix24.ru/rest/1/SECRET_TOKEN";
const fetchMock = vi.fn();

const listPage = (rows: unknown[], extra: Record<string, unknown> = {}) =>
  new Response(JSON.stringify({ result: rows, ...extra }), { status: 200 });

const emptyFieldsMeta = () => new Response(JSON.stringify({ result: {} }), { status: 200 });

// crm.item.list envelope: object with items array (universal items contract).
const emptySpPage = () => new Response(JSON.stringify({ result: { items: [] }, total: 0 }), { status: 200 });

beforeEach(() => {
  vi.stubEnv("BITRIX_WEBHOOK_URL", webhook);
  vi.stubGlobal("fetch", fetchMock);
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "log").mockImplementation(() => {});
  auth.requireAuth.mockResolvedValue({ userId: "user" });
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  fetchMock.mockReset();
});

const COMPANY_SELECT_FIELD = "UF_CRM_1753187313314"; // dictionary-backed «Образцы»

describe("POST /api/bitrix/commercial-funnel — successful runtime path", () => {
  it("200 with companies/deals and fail-closed enum labels for unknown dictionary IDs", async () => {
    fetchMock.mockImplementation((url: string) => {
      if (url.endsWith("crm.company.list")) {
        return Promise.resolve(
          listPage([
            {
              ID: "42",
              TITLE: "ООО Воронка",
              ASSIGNED_BY_ID: "7",
              [COMPANY_SELECT_FIELD]: ["99"], // unknown enum ID, metadata empty
            },
          ], { total: 1 })
        );
      }
      if (url.endsWith("crm.deal.list")) {
        return Promise.resolve(
          listPage(
            [{ ID: "101", TITLE: "Сделка", COMPANY_ID: "42", STAGE_ID: "NEW", CATEGORY_ID: "0", OPPORTUNITY: "1000|RUB", CURRENCY_ID: "RUB" }],
            { total: 1 }
          )
        );
      }
      if (url.endsWith("crm.activity.list")) {
        return Promise.resolve(listPage([], {}));
      }
      if (url.endsWith("user.get")) {
        return Promise.resolve(listPage([{ ID: "7", NAME: "Анна", LAST_NAME: "Смирнова" }]));
      }
      if (url.endsWith("crm.item.list")) {
        return Promise.resolve(emptySpPage());
      }
      return Promise.resolve(emptyFieldsMeta());
    });

    const res = await POST();
    expect(res.status).toBe(200);
    const body = await res.json();

    expect(body.success).toBe(true);
    expect(body.isDemoMode).toBe(false);
    expect(body.companies).toHaveLength(1);
    expect(body.deals).toHaveLength(1);
    expect(body.userNames["7"]).toBe("Смирнова Анна");
  });

  it("sends the corrected lowercase-only Smart Process contract in the real payload", async () => {
    fetchMock.mockImplementation((url: string) => {
      if (url.endsWith("crm.company.list") || url.endsWith("crm.deal.list") || url.endsWith("crm.activity.list") || url.endsWith("user.get")) {
        return Promise.resolve(listPage([], { total: 0 }));
      }
      if (url.endsWith("crm.item.list")) {
        return Promise.resolve(emptySpPage());
      }
      return Promise.resolve(emptyFieldsMeta());
    });

    await POST();

    const spCall = fetchMock.mock.calls.find((c) => String(c[0]).endsWith("crm.item.list"));
    expect(spCall).toBeDefined();
    const spBody = JSON.parse(spCall![1].body);
    expect(Object.keys(spBody).sort()).toEqual([
      "entityTypeId",
      "filter",
      "order",
      "select",
      "start",
      "useOriginalUfNames",
    ]);
    expect(spBody.entityTypeId).toBe(1032);
    expect(spBody.filter).toEqual({ categoryId: 15 });
    for (const key of ["SELECT", "FILTER", "ORDER"]) {
      expect(Object.keys(spBody)).not.toContain(key);
    }
  });

  it("preserves activity/metadata partial disclosures on success", async () => {
    fetchMock.mockImplementation((url: string) => {
      if (url.endsWith("crm.company.list")) {
        return Promise.resolve(listPage([{ ID: "42", TITLE: "ООО Частичное", ASSIGNED_BY_ID: "7" }], { total: 1 }));
      }
      if (url.endsWith("crm.deal.list")) {
        return Promise.resolve(
          listPage([{ ID: "101", TITLE: "Сделка", COMPANY_ID: "42", STAGE_ID: "NEW", CATEGORY_ID: "0", OPPORTUNITY: "1000|RUB", CURRENCY_ID: "RUB" }], { total: 1 })
        );
      }
      if (url.endsWith("crm.activity.list")) {
        return Promise.reject(new Error("activities down"));
      }
      if (url.endsWith("user.get")) {
        return Promise.resolve(listPage([]));
      }
      if (url.endsWith("crm.item.list")) {
        return Promise.resolve(emptySpPage());
      }
      return Promise.resolve(emptyFieldsMeta());
    });

    const res = await POST();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.activityPartial).toBe(true);
    expect(body.partial).toBe(true);
    expect(body.metadataPartial).toBe(false);
    expect(body.activityWarning).toBeTruthy();
  });

  it("authoritative company fetch failure (retries exhausted) fails closed with 502", async () => {
    fetchMock.mockImplementation((url: string) => {
      if (url.endsWith("crm.company.list")) {
        // Transient 503 — exhausts all transport retries.
        return Promise.resolve(new Response(JSON.stringify({ error: "unavailable" }), { status: 503 }));
      }
      if (url.endsWith("crm.item.list")) {
        return Promise.resolve(emptySpPage());
      }
      return Promise.resolve(listPage([], { total: 0 }));
    });

    const res = await POST();
    expect(res.status).toBe(502);
    const body = await res.json();
    expect(body.success).toBe(false);
    // Credentials never leak.
    expect(JSON.stringify(body)).not.toContain("SECRET_TOKEN");
  });
});
