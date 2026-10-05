// src/__tests__/company-coverage.test.ts
// ─────────────────────────────────────────────────────────────────────
// COMP-COV-1 to COMP-COV-5: Company coverage matrix verification suite.
// ─────────────────────────────────────────────────────────────────────

import { describe, it, expect, vi, beforeEach } from "vitest";
import { useDashboardStore } from "@/store/dashboard-store";
import { buildEnrichmentUiWarnings, buildEnrichmentExtraWarnings } from "@/lib/enrichment-disclosure";

describe("Company Coverage Matrix (COMP-COV-1 .. COMP-COV-5)", () => {
  beforeEach(() => {
    useDashboardStore.setState({
      allDeals: [
        {
          ID: "1",
          id: "1",
          TITLE: "Сделка 1",
          COMPANY_ID: "100",
          STAGE_ID: "NEW",
          OPPORTUNITY: 100000,
          CURRENCY_ID: "RUB",
          DATE_CREATE: "2026-01-01",
          COMPANY_TITLE: "",
        },
        {
          ID: "2",
          id: "2",
          TITLE: "Сделка 2",
          COMPANY_ID: "200",
          STAGE_ID: "NEW",
          OPPORTUNITY: 200000,
          CURRENCY_ID: "RUB",
          DATE_CREATE: "2026-01-02",
          COMPANY_TITLE: "",
        },
        {
          ID: "3",
          id: "3",
          TITLE: "Сделка 3",
          COMPANY_ID: "300",
          STAGE_ID: "NEW",
          OPPORTUNITY: 300000,
          CURRENCY_ID: "RUB",
          DATE_CREATE: "2026-01-03",
          COMPANY_TITLE: "",
        },
      ],
      selectedColumns: ["TITLE", "COMPANY_TITLE", "COMPANY_INDUSTRY"],
      companiesData: {},
      companiesDataFetchedAt: {},
      companiesDataCoverage: null,
      companiesDataLoading: false,
    });
    vi.restoreAllMocks();
  });

  it("COMP-COV-1: All companies resolved -> status COMPLETE, warning is undefined", async () => {
    global.fetch = vi.fn(async () => {
      return new Response(
        JSON.stringify({
          success: true,
          partial: false,
          companies: {
            "100": { ID: "100", TITLE: "Компания 100" },
            "200": { ID: "200", TITLE: "Компания 200" },
            "300": { ID: "300", TITLE: "Компания 300" },
          },
          fetchedCompanyIds: ["100", "200", "300"],
          unresolvedCompanyIds: [],
        }),
        { status: 200 }
      );
    }) as unknown as typeof global.fetch;

    await useDashboardStore.getState().fetchCompaniesData();

    const state = useDashboardStore.getState();
    expect(state.companiesDataCoverage?.status).toBe("COMPLETE");
    expect(state.companiesDataCoverage?.fetched).toBe(3);
    expect(state.companiesDataCoverage?.total).toBe(3);
    expect((state.companiesDataCoverage as any)?.warning).toBeUndefined();

    // UI and Excel warnings emit nothing when complete
    const uiWarnings = buildEnrichmentUiWarnings({
      selectedColumns: state.selectedColumns,
      companiesDataCoverage: state.companiesDataCoverage,
    });
    expect(uiWarnings).toEqual([]);
  });

  it("COMP-COV-2: Partial resolution -> status PARTIAL, warning contains exact numbers (X из Y)", async () => {
    global.fetch = vi.fn(async () => {
      return new Response(
        JSON.stringify({
          success: true,
          partial: true,
          warning: "Не удалось загрузить данные для 1 из 3 компаний.",
          companies: {
            "100": { ID: "100", TITLE: "Компания 100" },
            "200": { ID: "200", TITLE: "Компания 200" },
          },
          fetchedCompanyIds: ["100", "200"],
          unresolvedCompanyIds: ["300"],
        }),
        { status: 200 }
      );
    }) as unknown as typeof global.fetch;

    await useDashboardStore.getState().fetchCompaniesData();

    const state = useDashboardStore.getState();
    expect(state.companiesDataCoverage?.status).toBe("PARTIAL");
    expect(state.companiesDataCoverage?.fetched).toBe(2);
    expect(state.companiesDataCoverage?.total).toBe(3);
    if (state.companiesDataCoverage?.status === "PARTIAL") {
      expect(state.companiesDataCoverage.warning).toContain("1 из 3 компаний");
    }

    // UI banner formatting — restrained wording for the optional
    // enrichment source (no raw counts to ordinary users; detailed
    // provenance stays in the coverage state and Excel disclosure).
    const uiWarnings = buildEnrichmentUiWarnings({
      selectedColumns: state.selectedColumns,
      companiesDataCoverage: state.companiesDataCoverage,
    });
    expect(uiWarnings.length).toBe(1);
    expect(uiWarnings[0]).toBe("Часть дополнительных данных компаний недоступна");

    // Excel extraWarnings formatting
    const excelWarnings = buildEnrichmentExtraWarnings({
      selectedColumns: state.selectedColumns,
      companiesDataCoverage: state.companiesDataCoverage,
    });
    expect(excelWarnings.length).toBe(1);
    expect(excelWarnings[0]).toContain("Не удалось получить данные 1 из 3 компаний из CRM.");
    expect(excelWarnings[0]).toContain("данные компаний загружены частично");
  });

  it("COMP-COV-3: Upstream transient failure (HTTP 500) -> status PARTIAL with truthful warning", async () => {
    global.fetch = vi.fn(async () => {
      return new Response(JSON.stringify({ error: "Internal Server Error" }), {
        status: 500,
      });
    }) as unknown as typeof global.fetch;

    await useDashboardStore.getState().fetchCompaniesData();

    const state = useDashboardStore.getState();
    expect(state.companiesDataCoverage?.status).toBe("PARTIAL");
    expect(state.companiesDataCoverage?.fetched).toBe(0);
    expect(state.companiesDataCoverage?.total).toBe(3);
    if (state.companiesDataCoverage?.status === "PARTIAL") {
      expect(state.companiesDataCoverage.warning).toContain("3 из 3 компаний");
    }
  });

  it("COMP-COV-4: Retry request after partial failure -> successful resolution upgrades status to COMPLETE", async () => {
    // 1. Initial partial fetch (100 and 200 loaded, 300 unresolved)
    global.fetch = vi.fn(async () => {
      return new Response(
        JSON.stringify({
          success: true,
          partial: true,
          companies: {
            "100": { ID: "100", TITLE: "Компания 100" },
            "200": { ID: "200", TITLE: "Компания 200" },
          },
          fetchedCompanyIds: ["100", "200"],
          unresolvedCompanyIds: ["300"],
        }),
        { status: 200 }
      );
    }) as unknown as typeof global.fetch;

    await useDashboardStore.getState().fetchCompaniesData();
    expect(useDashboardStore.getState().companiesDataCoverage?.status).toBe("PARTIAL");

    // 2. Retry fetch where 300 is now resolved
    global.fetch = vi.fn(async () => {
      return new Response(
        JSON.stringify({
          success: true,
          partial: false,
          companies: {
            "300": { ID: "300", TITLE: "Компания 300" },
          },
          fetchedCompanyIds: ["300"],
          unresolvedCompanyIds: [],
        }),
        { status: 200 }
      );
    }) as unknown as typeof global.fetch;

    await useDashboardStore.getState().fetchCompaniesData();

    const state = useDashboardStore.getState();
    expect(state.companiesDataCoverage?.status).toBe("COMPLETE");
    expect(state.companiesDataCoverage?.fetched).toBe(3);
    expect(state.companiesDataCoverage?.total).toBe(3);
    expect((state.companiesDataCoverage as any)?.warning).toBeUndefined();
  });

  it("COMP-COV-5: Unresolved company IDs are NOT timestamped in companiesDataFetchedAt and remain retryable", async () => {
    global.fetch = vi.fn(async () => {
      return new Response(
        JSON.stringify({
          success: true,
          partial: true,
          companies: {
            "100": { ID: "100", TITLE: "Компания 100" },
          },
          fetchedCompanyIds: ["100"],
          unresolvedCompanyIds: ["200", "300"],
        }),
        { status: 200 }
      );
    }) as unknown as typeof global.fetch;

    await useDashboardStore.getState().fetchCompaniesData();

    const state = useDashboardStore.getState();
    expect(state.companiesDataFetchedAt["100"]).toBeDefined();
    expect(state.companiesDataFetchedAt["200"]).toBeUndefined();
    expect(state.companiesDataFetchedAt["300"]).toBeUndefined();
  });
});
