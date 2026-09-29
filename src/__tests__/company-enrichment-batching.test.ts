import { describe, it, expect, vi, beforeEach } from "vitest";
import { useDashboardStore } from "@/store/dashboard-store";

describe("Company Enrichment Batching (526 IDs & Partial Failure)", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    useDashboardStore.setState({
      allDeals: [],
      companiesData: {},
      companiesDataFetchedAt: {},
      companiesDataCoverage: null,
      companiesDataLoading: false,
      selectedColumns: ["TITLE", "COMPANY_TITLE"],
    });
  });

  it("splits 526 unique company IDs into requests of <=500 and merges complete results", async () => {
    const totalCount = 526;
    const deals = Array.from({ length: totalCount }, (_, i) => ({
      ID: String(i + 1),
      TITLE: `Deal ${i + 1}`,
      COMPANY_ID: String(1000 + i + 1),
    }));

    useDashboardStore.setState({
      allDeals: deals,
      selectedColumns: ["COMPANY_TITLE"],
    });

    const requestsPayloads: Array<{ ids: string[]; select: string[] }> = [];

    global.fetch = vi.fn(async (input: any, init?: any) => {
      const url = String(input);
      if (url.includes("/api/bitrix/companies") && !url.includes("list")) {
        const body = JSON.parse(init?.body || "{}");
        requestsPayloads.push(body);

        const companies: Record<string, any> = {};
        for (const id of body.ids) {
          companies[id] = { ID: id, TITLE: `Company ${id}` };
        }

        return new Response(
          JSON.stringify({
            success: true,
            partial: false,
            companies,
            fetchedCompanyIds: body.ids,
            unresolvedCompanyIds: [],
          }),
          { status: 200 }
        );
      }
      return new Response(JSON.stringify({ success: true }), { status: 200 });
    }) as unknown as typeof global.fetch;

    await useDashboardStore.getState().fetchCompaniesData();

    // Verification:
    // 1. Exactly 2 requests for 526 IDs
    expect(requestsPayloads).toHaveLength(2);
    // 2. Each request has <= 500 IDs
    expect(requestsPayloads[0].ids.length).toBe(500);
    expect(requestsPayloads[1].ids.length).toBe(26);
    expect(requestsPayloads[0].ids.length).toBeLessThanOrEqual(500);
    expect(requestsPayloads[1].ids.length).toBeLessThanOrEqual(500);

    // 3. Merged state contains all 526 companies
    const state = useDashboardStore.getState();
    expect(Object.keys(state.companiesData).length).toBe(526);
    expect(state.companiesData["1001"]?.TITLE).toBe("Company 1001");
    expect(state.companiesData[String(1000 + 526)]?.TITLE).toBe(`Company ${1000 + 526}`);

    // 4. Coverage is COMPLETE
    expect(state.companiesDataCoverage?.status).toBe("COMPLETE");
    expect(state.companiesDataCoverage?.fetched).toBe(526);
    expect(state.companiesDataCoverage?.total).toBe(526);
    expect((state.companiesDataCoverage as any)?.warning).toBeUndefined();
  });

  it("preserves successful batch when second batch fails (partial coverage)", async () => {
    const totalCount = 526;
    const deals = Array.from({ length: totalCount }, (_, i) => ({
      ID: String(i + 1),
      TITLE: `Deal ${i + 1}`,
      COMPANY_ID: String(2000 + i + 1),
    }));

    useDashboardStore.setState({
      allDeals: deals,
      selectedColumns: ["COMPANY_TITLE"],
    });

    let callCount = 0;
    global.fetch = vi.fn(async (input: any, init?: any) => {
      const url = String(input);
      if (url.includes("/api/bitrix/companies") && !url.includes("list")) {
        callCount++;
        const body = JSON.parse(init?.body || "{}");

        if (callCount === 1) {
          // Batch 1 (500 IDs) succeeds
          const companies: Record<string, any> = {};
          for (const id of body.ids) {
            companies[id] = { ID: id, TITLE: `Company ${id}` };
          }
          return new Response(
            JSON.stringify({
              success: true,
              partial: false,
              companies,
              fetchedCompanyIds: body.ids,
              unresolvedCompanyIds: [],
            }),
            { status: 200 }
          );
        } else {
          // Batch 2 (26 IDs) fails with 500 error
          return new Response(
            JSON.stringify({
              success: false,
              error: "Bitrix error on batch 2",
            }),
            { status: 500 }
          );
        }
      }
      return new Response(JSON.stringify({ success: true }), { status: 200 });
    }) as unknown as typeof global.fetch;

    await useDashboardStore.getState().fetchCompaniesData();

    const state = useDashboardStore.getState();
    // First 500 companies are retained in store
    expect(Object.keys(state.companiesData).length).toBe(500);
    expect(state.companiesData["2001"]?.TITLE).toBe("Company 2001");

    // Coverage is PARTIAL with truthful unresolved count (26 out of 526)
    expect(state.companiesDataCoverage?.status).toBe("PARTIAL");
    expect(state.companiesDataCoverage?.fetched).toBe(500);
    expect(state.companiesDataCoverage?.total).toBe(526);
    expect((state.companiesDataCoverage as any)?.warning).toContain("26 из 526");
  });

  it("truthfully produces total failure if every batch fails", async () => {
    const deals = Array.from({ length: 526 }, (_, i) => ({
      ID: String(i + 1),
      TITLE: `Deal ${i + 1}`,
      COMPANY_ID: String(3000 + i + 1),
    }));

    useDashboardStore.setState({
      allDeals: deals,
      selectedColumns: ["COMPANY_TITLE"],
    });

    global.fetch = vi.fn(async () => {
      return new Response(
        JSON.stringify({ success: false, error: "Network error" }),
        { status: 500 }
      );
    }) as unknown as typeof global.fetch;

    await useDashboardStore.getState().fetchCompaniesData();

    const state = useDashboardStore.getState();
    expect(Object.keys(state.companiesData).length).toBe(0);
    expect(state.companiesDataCoverage?.status).toBe("PARTIAL");
    expect(state.companiesDataCoverage?.fetched).toBe(0);
    expect(state.companiesDataCoverage?.total).toBe(526);
    expect((state.companiesDataCoverage as any)?.warning).toContain("526 из 526");
  });
});
