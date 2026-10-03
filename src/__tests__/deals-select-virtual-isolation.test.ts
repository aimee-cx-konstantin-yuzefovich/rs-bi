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
});
