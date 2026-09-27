// src/__tests__/responsible-filter-user-flow.test.ts
// ─────────────────────────────────────────────────────────────────────
// COV-5 user-flow regression: the interactive responsible filter must
// trigger an actual upstream filtered fetch.
//
// Fixture: Bitrix logical total = 1200 deals; the initial capped window
// returns D1..D1000, none assigned to M2; the user directory includes M2;
// the upstream filtered response for ASSIGNED_BY_ID=M2 returns D1200.
//
// This executes the REAL store path used by the UI
// (ResponsibleFilter → setResponsibleFilter) — not the API route directly.
// ─────────────────────────────────────────────────────────────────────

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { useDashboardStore } from "@/store/dashboard-store";

const originalFetch = global.fetch;

/** Build a deal with a unique ID and a non-M2 responsible. */
function windowDeal(i: number) {
  return {
    ID: String(i),
    id: String(i),
    TITLE: `Deal ${i}`,
    STAGE_ID: "NEW",
    OPPORTUNITY: 1000,
    CURRENCY_ID: "RUB",
    ASSIGNED_BY_ID: "101",
    ASSIGNED_BY_NAME: "Иванов",
    DATE_CREATE: "2026-01-01T00:00:00",
    DATE_MODIFY: "2026-01-01T00:00:00",
    COMPANY_ID: "0",
    COMPANY_TITLE: "",
  };
}

/** The M2 deal living OUTSIDE the initial capped window. */
const D1200 = {
  ID: "1200",
  id: "1200",
  TITLE: "Deal 1200 (M2)",
  STAGE_ID: "NEW",
  OPPORTUNITY: 7000,
  CURRENCY_ID: "RUB",
  ASSIGNED_BY_ID: "M2",
  ASSIGNED_BY_NAME: "Менеджер Два",
  DATE_CREATE: "2026-02-01T00:00:00",
  DATE_MODIFY: "2026-02-01T00:00:00",
  COMPANY_ID: "0",
  COMPANY_TITLE: "",
};

const CAPPED_WINDOW = Array.from({ length: 1000 }, (_, i) => windowDeal(i + 1));

describe("COV-5 — interactive responsible filter drives an upstream filtered fetch", () => {
  let dealsRequests: Array<{ url: string; body: any }> = [];
  let fetchImpl: typeof global.fetch;

  beforeEach(() => {
    dealsRequests = [];
    useDashboardStore.setState({
      allDeals: [],
      deals: [],
      dealsTotal: 0,
      dealsTruncated: false,
      dealsFetched: 0,
      dealsLoading: false,
      dealsError: null,
      dealsCoverage: null,
      dealsFailedPages: [],
      connectionStatus: "disconnected",
      isConfigured: null,
      isDemoMode: false,
      lastSyncAt: null,
      responsibleFilter: "all",
      currentPage: 1,
      pageSize: 50,
      dateFilter: { preset: "all" },
      selectedColumns: ["TITLE", "STAGE_ID", "OPPORTUNITY", "CURRENCY_ID"],
      userNames: { M2: "Менеджер Два", "101": "Иванов" },
      usersCoverage: { status: "COMPLETE", fetched: 2, total: 2 },
      searchQuery: "",
    });

    fetchImpl = vi.fn(async (input: any, init?: any) => {
      const url = String(input);
      let body: any = undefined;
      if (init?.body) {
        body = JSON.parse(init.body);
      }

      if (url.includes("/api/bitrix/deals")) {
        dealsRequests.push({ url, body });
        const isM2Filtered = body?.filter?.ASSIGNED_BY_ID === "M2";
        if (isM2Filtered) {
          // Upstream filtered response: the M2 deal outside the capped window.
          return new Response(
            JSON.stringify({
              success: true,
              deals: [D1200],
              total: 1,
              fetched: 1,
              truncated: false,
              coverage: { status: "COMPLETE", fetched: 1, total: 1 },
            }),
            { status: 200 }
          );
        }
        // Unfiltered initial capped window: D1..D1000, none M2.
        return new Response(
          JSON.stringify({
            success: true,
            deals: CAPPED_WINDOW,
            total: 1200,
            fetched: 1000,
            truncated: true,
            coverage: {
              status: "CAPPED",
              fetched: 1000,
              total: 1200,
              cap: 1000,
              warning: "Данные усечены.",
            },
          }),
          { status: 200 }
        );
      }

      // Related lookups: minimal truthful responses.
      if (url.includes("/api/bitrix/users")) {
        return new Response(
          JSON.stringify({
            success: true,
            users: { M2: "Менеджер Два", "101": "Иванов" },
            total: 2,
            fetched: 2,
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
    global.fetch = fetchImpl;
  });

  afterEach(() => {
    global.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it("selecting M2 issues a SECOND deals request with upstream ASSIGNED_BY_ID=M2 and shows D1200", async () => {
    // ── Initial fetch (capped window, no M2 inside) ──
    await useDashboardStore.getState().fetchDeals({ skipRelated: true });
    expect(dealsRequests.length).toBe(1);
    expect(dealsRequests[0].body.filter.ASSIGNED_BY_ID).toBeUndefined();
    expect(useDashboardStore.getState().dealsTotal).toBe(1200);
    expect(useDashboardStore.getState().dealsCoverage?.status).toBe("CAPPED");

    // ── 1. M2 is selectable even though absent from the capped allDeals ──
    // The store's authoritative user directory contains M2; the dropdown
    // builds its universe from that directory, not from the window.
    const store = useDashboardStore.getState();
    expect(store.userNames["M2"]).toBe("Менеджер Два");
    const m2InWindow = store.allDeals.some((d) => String(d.ASSIGNED_BY_ID) === "M2");
    expect(m2InWindow).toBe(false); // precondition: M2 NOT in the loaded window

    // ── 2. Execute the REAL filter path the UI calls ──
    await store.setResponsibleFilter("M2");

    // A second /api/bitrix/deals request must have been issued.
    expect(dealsRequests.length).toBe(2);

    // ── 3. The second request carries the upstream filter (+ date filter) ──
    expect(dealsRequests[1].body.filter.ASSIGNED_BY_ID).toBe("M2");
    expect(dealsRequests[1].body.filter).toEqual({ ASSIGNED_BY_ID: "M2" });

    // ── 4. D1200 appears in the store/table population ──
    const state = useDashboardStore.getState();
    expect(state.allDeals.some((d) => d.ID === "1200")).toBe(true);
    expect(state.deals.some((d) => d.ID === "1200")).toBe(true);
    expect(state.responsibleFilter).toBe("M2");

    // ── 5. The old capped window never became the authoritative result ──
    // The store was replaced by the filtered response (1 deal), not merged
    // with stale window rows.
    expect(state.allDeals.length).toBe(1);
    expect(state.allDeals[0].ID).toBe("1200");

    // ── 6. Coverage comes from the filtered server response ──
    expect(state.dealsCoverage?.status).toBe("COMPLETE");
    expect(state.dealsCoverage?.fetched).toBe(1);
    expect(state.dealsCoverage?.total).toBe(1);
  });

  it("reverting M2 → all triggers the correct unfiltered fetch again", async () => {
    await useDashboardStore.getState().fetchDeals({ skipRelated: true });
    await useDashboardStore.getState().setResponsibleFilter("M2");
    expect(dealsRequests.length).toBe(2);
    expect(dealsRequests[1].body.filter.ASSIGNED_BY_ID).toBe("M2");

    // Revert to "all": third request WITHOUT the upstream responsible filter.
    await useDashboardStore.getState().setResponsibleFilter("all");
    expect(dealsRequests.length).toBe(3);
    expect(dealsRequests[2].body.filter.ASSIGNED_BY_ID).toBeUndefined();

    // The restored dataset is the unfiltered capped window again.
    const state = useDashboardStore.getState();
    expect(state.allDeals.length).toBe(1000);
    expect(state.dealsTotal).toBe(1200);
    expect(state.responsibleFilter).toBe("all");
  });

  it("demo mode keeps client-side filtering without extra upstream requests", async () => {
    // Demo dataset: a single M2 deal loaded locally (no upstream calls).
    useDashboardStore.setState({
      isDemoMode: true,
      allDeals: [D1200],
      deals: [D1200],
      responsibleFilter: "all",
    });
    // Warm the demo fetch path is unnecessary — applyClientFilters is the
    // demo authority. Drive the real interactive path:
    await useDashboardStore.getState().setResponsibleFilter("M2");

    // No upstream request was issued at all.
    expect(dealsRequests.length).toBe(0);
    // Client-side filtering applied the M2 filter to the local dataset.
    const state = useDashboardStore.getState();
    expect(state.responsibleFilter).toBe("M2");
    expect(state.deals.some((d) => d.ID === "1200")).toBe(true);
  });

  it("stale in-flight filtered responses never overwrite a newer selection (request-sequence)", async () => {
    // Make the M2-filtered response hang until we release it.
    let releaseFiltered!: (res: Response) => void;
    const gatedFiltered = new Promise<Response>((r) => { releaseFiltered = r; });

    let call = 0;
    global.fetch = vi.fn(async (input: any, init?: any) => {
      const url = String(input);
      if (url.includes("/api/bitrix/deals")) {
        call++;
        const body = JSON.parse(init?.body || "{}");
        if (body.filter?.ASSIGNED_BY_ID === "M2") {
          return call === 1 ? gatedFiltered : new Response(
            JSON.stringify({
              success: true,
              deals: [D1200],
              total: 1,
              fetched: 1,
              coverage: { status: "COMPLETE", fetched: 1, total: 1 },
            }),
            { status: 200 }
          );
        }
        return new Response(
          JSON.stringify({
            success: true,
            deals: CAPPED_WINDOW,
            total: 1200,
            fetched: 1000,
            truncated: true,
            coverage: { status: "CAPPED", fetched: 1000, total: 1200, cap: 1000, warning: "Данные усечены." },
          }),
          { status: 200 }
        );
      }
      return new Response(JSON.stringify({ success: true }), { status: 200 });
    }) as unknown as typeof global.fetch;

    await useDashboardStore.getState().fetchDeals({ skipRelated: true });
    const first = useDashboardStore.getState().setResponsibleFilter("M2"); // filtered req #1 — hangs
    // User changes their mind quickly → new selection supersedes.
    await useDashboardStore.getState().setResponsibleFilter("all");
    await first;

    // Release the stale M2 response — it must NOT overwrite the "all" state.
    releaseFiltered(
      new Response(
        JSON.stringify({
          success: true,
          deals: [D1200],
          total: 1,
          fetched: 1,
          coverage: { status: "COMPLETE", fetched: 1, total: 1 },
        }),
        { status: 200 }
      )
    );
    await new Promise((r) => setTimeout(r, 0));

    const state = useDashboardStore.getState();
    expect(state.responsibleFilter).toBe("all");
    expect(state.allDeals.length).toBe(1000);
    expect(state.allDeals.some((d) => d.ID === "1200")).toBe(false);
  });
});
