// src/__tests__/enrichment-coverage.test.ts
// ─────────────────────────────────────────────────────────────────────
// ENR matrix: partial lookup API → Zustand coverage → UI provenance.
// ENR-1 users partial, ENR-2 users complete, ENR-4 companies partial,
// ENR-5 fields partial, ENR-6 complete sources emit no warnings.
// (ENR-3 activities partial lives in excel-enrichment-disclosure.test.ts
// where it can assert the cross-layer Excel disclosure end-to-end.)
// ─────────────────────────────────────────────────────────────────────

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { useDashboardStore } from "@/store/dashboard-store";
import {
  resolveResponsibleDisplay,
  RESPONSIBLE_NOT_FOUND_LABEL,
  RESPONSIBLE_DIRECTORY_INCOMPLETE_LABEL,
} from "@/lib/enrichment-coverage";

const originalFetch = global.fetch;

describe("ENR — enrichment coverage → provenance", () => {
  beforeEach(() => {
    useDashboardStore.setState({
      isDemoMode: false,
      userNames: {},
      usersCoverage: null,
      fieldsCoverage: null,
      activitiesCoverage: null,
      companiesDataCoverage: null,
      userNamesLoading: false,
      fields: [],
      fieldsLoading: false,
      fieldsError: null,
      selectedColumns: ["TITLE"],
      allDeals: [],
      companiesData: {},
      companiesDataFetchedAt: {},
      activitiesData: {},
      activitiesDataFetchedAt: {},
    });
  });

  afterEach(() => {
    global.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it("ENR-1 — users partial (100 expected, 50 fetched, one page fails) → usersCoverage PARTIAL; missing ID shows directory-incomplete label", async () => {
    const users = Object.fromEntries(
      Array.from({ length: 50 }, (_, i) => [String(i + 1), `User ${i + 1}`])
    );
    global.fetch = vi.fn(async (input: any) => {
      const url = String(input);
      if (url.includes("/api/bitrix/users")) {
        return new Response(
          JSON.stringify({
            success: true,
            users,
            total: 100,
            fetched: 50,
            partial: true,
            failedBatches: 1,
            cappedByLimit: false,
            truncated: true,
          }),
          { status: 200 }
        );
      }
      return new Response(JSON.stringify({ success: true }), { status: 200 });
    }) as unknown as typeof global.fetch;

    await useDashboardStore.getState().fetchUserNames();

    const coverage = useDashboardStore.getState().usersCoverage;
    expect(coverage?.status).toBe("PARTIAL");

    // Missing responsible ID with a PARTIAL directory must NOT claim the
    // employee does not exist — the directory itself is incomplete.
    const display = resolveResponsibleDisplay(
      "777",
      useDashboardStore.getState().userNames,
      coverage
    );
    expect(display).toBe(RESPONSIBLE_DIRECTORY_INCOMPLETE_LABEL);
    expect(display).not.toBe(RESPONSIBLE_NOT_FOUND_LABEL);
  });

  it("ENR-2 — users complete + missing ID → 'Сотрудник не найден'", async () => {
    global.fetch = vi.fn(async (input: any) => {
      const url = String(input);
      if (url.includes("/api/bitrix/users")) {
        return new Response(
          JSON.stringify({
            success: true,
            users: { "1": "Анна" },
            total: 1,
            fetched: 1,
            partial: false,
            failedBatches: 0,
            cappedByLimit: false,
            truncated: false,
          }),
          { status: 200 }
        );
      }
      return new Response(JSON.stringify({ success: true }), { status: 200 });
    }) as unknown as typeof global.fetch;

    await useDashboardStore.getState().fetchUserNames();

    const state = useDashboardStore.getState();
    expect(state.usersCoverage?.status).toBe("COMPLETE");
    expect(
      resolveResponsibleDisplay("777", state.userNames, state.usersCoverage)
    ).toBe(RESPONSIBLE_NOT_FOUND_LABEL);
    // Known ID resolves to the real name.
    expect(
      resolveResponsibleDisplay("1", state.userNames, state.usersCoverage)
    ).toBe("Анна");
  });

  it("ENR-1b — users endpoint non-2xx → usersCoverage PARTIAL (never stale COMPLETE)", async () => {
    useDashboardStore.setState({
      usersCoverage: { status: "COMPLETE", fetched: 10, total: 10 },
    });
    global.fetch = vi.fn(async () => new Response("{}", { status: 500 })) as unknown as typeof global.fetch;

    await useDashboardStore.getState().fetchUserNames();

    const coverage = useDashboardStore.getState().usersCoverage;
    expect(coverage?.status).toBe("PARTIAL");
  });

  it("ENR-1c — users capped by directory limit → usersCoverage CAPPED", async () => {
    const users = Object.fromEntries(
      Array.from({ length: 2500 }, (_, i) => [String(i + 1), `User ${i + 1}`])
    );
    global.fetch = vi.fn(async (input: any) => {
      const url = String(input);
      if (url.includes("/api/bitrix/users")) {
        return new Response(
          JSON.stringify({
            success: true,
            users,
            total: 3000,
            fetched: 2500,
            partial: false,
            failedBatches: 0,
            cappedByLimit: true,
            truncated: true,
          }),
          { status: 200 }
        );
      }
      return new Response(JSON.stringify({ success: true }), { status: 200 });
    }) as unknown as typeof global.fetch;

    await useDashboardStore.getState().fetchUserNames();

    const coverage = useDashboardStore.getState().usersCoverage;
    expect(coverage?.status).toBe("CAPPED");
    expect((coverage as any)?.cap).toBe(2500);
  });

  it("ENR-4 — one requested company unresolved → companiesDataCoverage PARTIAL, unresolved ID stays retryable", async () => {
    useDashboardStore.setState({
      allDeals: [
        {
          ID: "1",
          id: "1",
          TITLE: "Deal",
          COMPANY_ID: "42",
          ASSIGNED_BY_ID: "1",
          ASSIGNED_BY_NAME: "A",
          STAGE_ID: "NEW",
          OPPORTUNITY: 1,
          CURRENCY_ID: "RUB",
          DATE_CREATE: "2026-01-01T00:00:00",
          DATE_MODIFY: "2026-01-01T00:00:00",
          COMPANY_TITLE: "",
        },
        {
          ID: "2",
          id: "2",
          TITLE: "Deal 2",
          COMPANY_ID: "43",
          ASSIGNED_BY_ID: "1",
          ASSIGNED_BY_NAME: "A",
          STAGE_ID: "NEW",
          OPPORTUNITY: 1,
          CURRENCY_ID: "RUB",
          DATE_CREATE: "2026-01-01T00:00:00",
          DATE_MODIFY: "2026-01-01T00:00:00",
          COMPANY_TITLE: "",
        },
      ],
      selectedColumns: ["COMPANY_TITLE", "COMPANY_INDUSTRY"],
    });

    let requestedIdsSeen: string[] = [];
    global.fetch = vi.fn(async (input: any, init?: any) => {
      const url = String(input);
      if (url.includes("/api/bitrix/companies") && !url.includes("list")) {
        const body = JSON.parse(init?.body || "{}");
        requestedIdsSeen = body.ids;
        return new Response(
          JSON.stringify({
            success: true,
            partial: true,
            warning: "Не удалось загрузить данные для 1 компаний.",
            companies: { "42": { ID: "42", TITLE: "Компания 42", INDUSTRY: "IT" } },
            fetchedCompanyIds: ["42"],
            unresolvedCompanyIds: ["43"],
          }),
          { status: 200 }
        );
      }
      return new Response(JSON.stringify({ success: true }), { status: 200 });
    }) as unknown as typeof global.fetch;

    await useDashboardStore.getState().fetchCompaniesData();

    expect(requestedIdsSeen.sort()).toEqual(["42", "43"]);
    const state = useDashboardStore.getState();
    expect(state.companiesDataCoverage?.status).toBe("PARTIAL");
    expect(state.companiesDataCoverage?.fetched).toBe(1);
    expect(state.companiesDataCoverage?.total).toBe(2);

    // Resolved company cached; unresolved ID NOT marked fetched → retry-eligible.
    expect(state.companiesData["42"]?.TITLE).toBe("Компания 42");
    expect(state.companiesDataFetchedAt["42"]).toBeDefined();
    expect(state.companiesDataFetchedAt["43"]).toBeUndefined();
  });

  it("ENR-5 — crm.company.fields fails while deal fields load → fieldsCoverage PARTIAL with per-source warning", async () => {
    global.fetch = vi.fn(async (input: any) => {
      const url = String(input);
      if (url.includes("/api/bitrix/fields")) {
        return new Response(
          JSON.stringify({
            success: true,
            fields: [
              { id: "TITLE", title: "Название сделки", type: "string", isMultiple: false, isSortable: true },
            ],
            total: 1,
            partial: true,
            missingSources: ["crm.company.fields", "crm.status.list:INDUSTRY"],
          }),
          { status: 200 }
        );
      }
      return new Response(JSON.stringify({ success: true }), { status: 200 });
    }) as unknown as typeof global.fetch;

    await useDashboardStore.getState().fetchFields();

    const state = useDashboardStore.getState();
    expect(state.fieldsCoverage?.status).toBe("PARTIAL");
    const warning = state.fieldsCoverage?.status === "PARTIAL" ? state.fieldsCoverage.warning : "";
    expect(warning).toContain("crm.company.fields");
    expect(warning).toContain("crm.status.list:INDUSTRY");
    // Receiving SOME fields must not pretend the metadata directory is complete.
    expect(state.fields.length).toBe(1);
  });
});
