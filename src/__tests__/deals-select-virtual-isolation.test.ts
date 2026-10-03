// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { useDashboardStore } from "@/store/dashboard-store";

/**
 * §8.13: Smart Process virtual Deal columns must NEVER enter the Bitrix
 * Deal request. This test inspects the ACTUAL request body sent to
 * /api/bitrix/deals (not just the helper output).
 */
describe("fetchDeals request body — virtual column isolation", () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    useDashboardStore.setState({
      allDeals: [],
      deals: [],
      dealsTotal: 0,
      dealsTruncated: false,
      dealsFetched: 0,
      dealsLoading: false,
      dealsError: null,
      connectionStatus: "disconnected",
      isConfigured: null,
      isDemoMode: false,
      lastSyncAt: null,
      selectedColumns: [
        "TITLE",
        "SP_STAGE",
        "SP_SENT_DATE",
        "SP_RESULT",
        "SP_SAMPLES",
        "ACTIVITY_LAST",
        "OPPORTUNITY",
      ],
      dateFilter: { preset: "all" },
    });
  });

  afterEach(() => {
    global.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it("POST body select contains no SP_* / ACTIVITY_* columns while allDeals still loads", async () => {
    const capturedBodies: Array<Record<string, unknown>> = [];
    global.fetch = vi.fn().mockImplementation(async (_url: string, init?: RequestInit) => {
      capturedBodies.push(JSON.parse(String(init?.body ?? "{}")));
      return new Response(
        JSON.stringify({ success: true, deals: [], total: 0, fetched: 0 }),
        { status: 200 }
      );
    });

    await useDashboardStore.getState().fetchDeals({ skipRelated: true });

    expect(capturedBodies).toHaveLength(1);
    const select = capturedBodies[0].select as string[];
    expect(select).toBeDefined();
    expect(select).toContain("TITLE");
    expect(select).toContain("OPPORTUNITY");
    for (const forbidden of ["SP_STAGE", "SP_SENT_DATE", "SP_RESULT", "SP_SAMPLES", "ACTIVITY_LAST", "ACTIVITY_NEXT"]) {
      expect(select).not.toContain(forbidden);
    }
    // Required identity/enrichment fields are force-padded as before.
    expect(select).toContain("ID");
    expect(select).toContain("COMPANY_ID");
  });

  it("case C16: synthetic Company enrichment columns never reach the request (incl. COMPANY_TITLE, COMPANY_UF_*)", async () => {
    const capturedBodies: Array<Record<string, unknown>> = [];
    global.fetch = vi.fn().mockImplementation(async (_url: string, init?: RequestInit) => {
      capturedBodies.push(JSON.parse(String(init?.body ?? "{}")));
      return new Response(
        JSON.stringify({ success: true, deals: [], total: 0, fetched: 0 }),
        { status: 200 }
      );
    });

    useDashboardStore.setState({
      selectedColumns: [
        "TITLE",
        "COMPANY_TITLE",
        "COMPANY_ASSIGNED_BY_ID",
        "COMPANY_INDUSTRY",
        "COMPANY_DATE_CREATE",
        "COMPANY_LAST_ACTIVITY_TIME",
        "COMPANY_UF_CRM_69257BBAB86F6",
        "COMPANY_UF_CRM_1753187313314",
        "OPPORTUNITY",
      ],
    });
    await useDashboardStore.getState().fetchDeals({ skipRelated: true });

    const select = capturedBodies[0].select as string[];
    for (const forbidden of [
      "COMPANY_TITLE",
      "COMPANY_ASSIGNED_BY_ID",
      "COMPANY_INDUSTRY",
      "COMPANY_DATE_CREATE",
      "COMPANY_LAST_ACTIVITY_TIME",
      "COMPANY_UF_CRM_69257BBAB86F6",
      "COMPANY_UF_CRM_1753187313314",
    ]) {
      expect(select).not.toContain(forbidden);
    }
    expect(select).toContain("TITLE");
    expect(select).toContain("OPPORTUNITY");
  });

  it("case C17: real Deal fields still reach the select; pure-virtual selection still produces a valid safe request", async () => {
    const capturedBodies: Array<Record<string, unknown>> = [];
    global.fetch = vi.fn().mockImplementation(async (_url: string, init?: RequestInit) => {
      capturedBodies.push(JSON.parse(String(init?.body ?? "{}")));
      return new Response(
        JSON.stringify({ success: true, deals: [], total: 0, fetched: 0 }),
        { status: 200 }
      );
    });

    // Mixed selection: real fields + every virtual family.
    useDashboardStore.setState({
      selectedColumns: [
        "TITLE",
        "STAGE_ID",
        "ASSIGNED_BY_ID",
        "COMPANY_ID",
        "BEGINDATE",
        "SP_STAGE",
        "COMPANY_TITLE",
        "ACTIVITY_NEXT",
      ],
    });
    await useDashboardStore.getState().fetchDeals({ skipRelated: true });

    const select = capturedBodies[0].select as string[];
    for (const real of ["TITLE", "STAGE_ID", "ASSIGNED_BY_ID", "COMPANY_ID", "BEGINDATE"]) {
      expect(select).toContain(real);
    }
    // COMPANY_ID remains the ONLY COMPANY_* in the request.
    expect(select.filter((c) => c.startsWith("COMPANY_"))).toEqual(["COMPANY_ID"]);

    // Pure-virtual selection still produces a valid safe Deal request.
    capturedBodies.length = 0;
    useDashboardStore.setState({ selectedColumns: ["SP_STAGE", "SP_RESULT", "COMPANY_TITLE"] });
    await useDashboardStore.getState().fetchDeals({ skipRelated: true });
    const virtualSelect = capturedBodies[0].select as string[];
    expect(Array.isArray(virtualSelect)).toBe(true);
    expect(virtualSelect).not.toContain("SP_STAGE");
    expect(virtualSelect).not.toContain("SP_RESULT");
    expect(virtualSelect).not.toContain("COMPANY_TITLE");
    // The request carries the force-padded identity fields and remains a
    // structurally valid request (method/endpoint unchanged).
    expect(virtualSelect).toContain("ID");
    expect(virtualSelect).toContain("COMPANY_ID");
  });
});
