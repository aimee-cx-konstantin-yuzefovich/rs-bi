// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest, NextResponse } from "next/server";
const auth = vi.hoisted(() => ({ requireAuth: vi.fn() }));
vi.mock("@/lib/auth-guard", () => ({ ...auth, isAuthError: (v: unknown) => v instanceof NextResponse }));
const spContract = vi.hoisted(() => ({
  SMART_PROCESS_HAS_DISCOVERED_CONTRACT: true,
  SMART_PROCESS_ENTITY_TYPE_ID: 1032,
  SMART_PROCESS_CATEGORY_ID: 15,
  SMART_PROCESS_SENT_DATE_FIELD_ID: "UF_CRM_SP_SENT_DATE_TEST",
  SMART_PROCESS_DEAL_FIELD_ID: "UF_CRM_SP_DEAL_TEST",
  SMART_PROCESS_GRADE_GEL_FIELD_ID: "UF_CRM_SP_GEL_TEST",
  SMART_PROCESS_GRADE_SOL_FIELD_ID: "UF_CRM_SP_SOL_TEST",
  SMART_PROCESS_TEST_RESULT_FIELD_ID: "UF_CRM_SP_RESULT_TEST",
  SMART_PROCESS_COMPANY_FIELD_ID: null,
  assertSmartProcessContractReady: () => {},
  SMART_PROCESS_STAGE_SEMANTICS: {},
  SMART_PROCESS_ACTIVE_STAGES: new Set(),
  SMART_PROCESS_TERMINAL_STAGES: new Set(),
  SMART_PROCESS_STAGE_LABELS: {},
  smartProcessStageSemantic: () => undefined as any,
  isSmartProcessActiveStage: () => false,
  isSmartProcessTerminalStage: () => false,
}));
vi.mock("@/lib/samples/smart-process-contract", () => spContract);
import { POST } from "@/app/api/bitrix/samples/route";
const webhook = "https://portal.bitrix24.ru/rest/1/SECRET_TOKEN";
const fetchMock = vi.fn();
beforeEach(() => {
  vi.stubEnv("BITRIX_WEBHOOK_URL", webhook);
  vi.stubGlobal("fetch", fetchMock);
  fetchMock.mockImplementation(() => Promise.resolve(new Response(JSON.stringify({ result: [], total: 0 }), { status: 200 })));
});
describe("probe2", () => {
  it("dumps crm.item.list body", async () => {
    await POST(new NextRequest("http://localhost/api/bitrix/samples", { method: "POST", body: JSON.stringify({ companyId: "42" }), headers: { "content-type": "application/json" } }));
    const spCall = fetchMock.mock.calls.find((c) => String(c[0]).endsWith("crm.item.list"));
    console.log("SPBODY:", spCall ? spCall[1].body : "NO CALL");
    expect(true).toBe(true);
  });
});
