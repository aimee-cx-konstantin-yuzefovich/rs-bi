// src/__tests__/deal-activities-store.test.ts
// Store contract for the scoped per-deal activities fetch (Deal Preview).
// The API response shape is the REAL production shape `{ last, next, all }` —
// tests must NOT inject synthetic `dataKnown`. Explicit per-deal request
// state drives the UI: success includes truthful empty `all: []`.
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { useDashboardStore } from "@/store/dashboard-store";

describe("fetchDealActivities per-deal request state", () => {
  const fetchSpy = vi.fn();

  beforeEach(() => {
    vi.stubGlobal("fetch", fetchSpy);
    useDashboardStore.setState({
      isDemoMode: false,
      activitiesData: {},
      activitiesDataFetchedAt: {},
      activitiesRequestState: {},
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    fetchSpy.mockReset();
  });

  it("successful response → state success, entry stored, dataKnown never required", async () => {
    fetchSpy.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        success: true,
        partial: false,
        fetchedDealIds: ["101"],
        activities: {
          "101": { last: undefined, next: undefined, all: [] },
        },
      }),
    } as any);

    await useDashboardStore.getState().fetchDealActivities("101");

    const state = useDashboardStore.getState();
    expect(state.activitiesRequestState["101"]).toBe("success");
    expect(state.activitiesData["101"]).toEqual({ last: undefined, next: undefined, all: [] });
    expect(state.activitiesDataFetchedAt["101"]).toBeDefined();
  });

  it("200 response without the requesting deal in fetchedDealIds → error, previous valid data preserved", async () => {
    useDashboardStore.setState({
      activitiesData: { "101": { last: { SUBJECT: "Earlier" }, all: [{ ID: "1" }] } },
      activitiesDataFetchedAt: { "101": Date.now() - 10 * 60 * 1000 }, // stale
      activitiesRequestState: { "101": "success" },
    });

    fetchSpy.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ success: true, partial: true, fetchedDealIds: [], activities: {} }),
    } as any);

    await useDashboardStore.getState().fetchDealActivities("101", { force: true });

    const state = useDashboardStore.getState();
    expect(state.activitiesRequestState["101"]).toBe("error");
    // Failed refresh must NOT erase prior valid data.
    expect(state.activitiesData["101"]).toEqual({ last: { SUBJECT: "Earlier" }, all: [{ ID: "1" }] });
  });

  it("HTTP failure → state error (not infinite loading); previous valid data preserved", async () => {
    useDashboardStore.setState({
      activitiesData: { "102": { last: { SUBJECT: "Cached" }, all: [{ ID: "9" }] } },
      activitiesDataFetchedAt: { "102": Date.now() - 10 * 60 * 1000 },
      activitiesRequestState: { "102": "success" },
    });

    fetchSpy.mockResolvedValueOnce({ ok: false, status: 500, json: async () => ({}) } as any);

    await useDashboardStore.getState().fetchDealActivities("102", { force: true });

    const state = useDashboardStore.getState();
    expect(state.activitiesRequestState["102"]).toBe("error");
    expect(state.activitiesData["102"]).toEqual({ last: { SUBJECT: "Cached" }, all: [{ ID: "9" }] });
  });

  it("network exception → state error, not loading", async () => {
    fetchSpy.mockRejectedValueOnce(new TypeError("fetch failed"));

    await useDashboardStore.getState().fetchDealActivities("103");

    expect(useDashboardStore.getState().activitiesRequestState["103"]).toBe("error");
  });

  it("concurrent duplicate triggers coalesce into one scoped request", async () => {
    let resolveFetch!: (v: unknown) => void;
    fetchSpy.mockReturnValueOnce(
      new Promise((done) => {
        resolveFetch = done;
      })
    );

    const p1 = useDashboardStore.getState().fetchDealActivities("104");
    const p2 = useDashboardStore.getState().fetchDealActivities("104");
    resolveFetch({
      ok: true,
      status: 200,
      json: async () => ({
        success: true,
        partial: false,
        fetchedDealIds: ["104"],
        activities: { "104": { all: [], last: undefined, next: undefined } },
      }),
    });
    await Promise.all([p1, p2]);

    // Exactly one HTTP request body sent for the deal.
    const activityCalls = fetchSpy.mock.calls.filter(([url]) => String(url).includes("/activities"));
    expect(activityCalls).toHaveLength(1);
    expect(JSON.parse(activityCalls[0][1].body).dealIds).toEqual(["104"]);
    expect(useDashboardStore.getState().activitiesRequestState["104"]).toBe("success");
  });

  it("force retry refetches even when fresh cached data exists", async () => {
    useDashboardStore.setState({
      activitiesData: { "105": { all: [] } },
      activitiesDataFetchedAt: { "105": Date.now() },
      activitiesRequestState: { "105": "success" },
    });

    fetchSpy.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        success: true,
        partial: false,
        fetchedDealIds: ["105"],
        activities: { "105": { all: [{ ID: "7", SUBJECT: "Новое дело", COMPLETED: "N" }] } },
      }),
    } as any);

    await useDashboardStore.getState().fetchDealActivities("105", { force: true });

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(useDashboardStore.getState().activitiesData["105"].all).toHaveLength(1);
  });
});
