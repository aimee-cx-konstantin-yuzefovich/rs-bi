import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { useDashboardStore } from "@/store/dashboard-store";

describe("fetchDeals Request Authority & Concurrency Suite", () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    // Reset store state
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
      selectedColumns: ["TITLE", "STAGE_ID", "OPPORTUNITY", "CURRENCY_ID"],
      dateFilter: { preset: "all" },
    });
  });

  afterEach(() => {
    global.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it("TEST A — stale success: Request A succeeding after Request B does NOT overwrite B data", async () => {
    let resolveA!: (res: Response) => void;
    let resolveB!: (res: Response) => void;

    const promiseA = new Promise<Response>((r) => {
      resolveA = r;
    });
    const promiseB = new Promise<Response>((r) => {
      resolveB = r;
    });

    let invocation = 0;
    global.fetch = vi.fn().mockImplementation((url: string) => {
      if (url.includes("/api/bitrix/deals")) {
        invocation++;
        return invocation === 1 ? promiseA : promiseB;
      }
      return Promise.resolve(new Response(JSON.stringify({ success: true })));
    });

    // Start request A
    const reqA = useDashboardStore.getState().fetchDeals({ skipRelated: true });
    // Start request B
    const reqB = useDashboardStore.getState().fetchDeals({ skipRelated: true });

    // Request B succeeds first with deal "Deal B"
    const dealB = { ID: "200", id: "200", TITLE: "Deal B", STAGE_ID: "WON", OPPORTUNITY: 5000, CURRENCY_ID: "RUB" };
    resolveB(
      new Response(
        JSON.stringify({
          success: true,
          deals: [dealB],
          total: 1,
          fetched: 1,
        }),
        { status: 200 }
      )
    );
    await reqB;

    // Verify B data is committed
    expect(useDashboardStore.getState().dealsTotal).toBe(1);
    expect(useDashboardStore.getState().allDeals[0]?.TITLE).toBe("Deal B");
    expect(useDashboardStore.getState().connectionStatus).toBe("connected");
    expect(useDashboardStore.getState().dealsLoading).toBe(false);

    // Request A finishes later with deal "Deal A"
    const dealA = { ID: "100", id: "100", TITLE: "Deal A", STAGE_ID: "NEW", OPPORTUNITY: 1000, CURRENCY_ID: "RUB" };
    resolveA(
      new Response(
        JSON.stringify({
          success: true,
          deals: [dealA],
          total: 1,
          fetched: 1,
        }),
        { status: 200 }
      )
    );
    await reqA;

    // State MUST remain B data only; A must NOT overwrite B
    expect(useDashboardStore.getState().dealsTotal).toBe(1);
    expect(useDashboardStore.getState().allDeals[0]?.TITLE).toBe("Deal B");
    expect(useDashboardStore.getState().connectionStatus).toBe("connected");
    expect(useDashboardStore.getState().dealsLoading).toBe(false);
  });

  it("TEST B — stale HTTP failure: Request A returning HTTP 500 later does NOT overwrite B state", async () => {
    let resolveA!: (res: Response) => void;
    let resolveB!: (res: Response) => void;

    const promiseA = new Promise<Response>((r) => {
      resolveA = r;
    });
    const promiseB = new Promise<Response>((r) => {
      resolveB = r;
    });

    let invocation = 0;
    global.fetch = vi.fn().mockImplementation((url: string) => {
      if (url.includes("/api/bitrix/deals")) {
        invocation++;
        return invocation === 1 ? promiseA : promiseB;
      }
      return Promise.resolve(new Response(JSON.stringify({ success: true })));
    });

    const reqA = useDashboardStore.getState().fetchDeals({ skipRelated: true });
    const reqB = useDashboardStore.getState().fetchDeals({ skipRelated: true });

    // B succeeds
    const dealB = { ID: "200", id: "200", TITLE: "Deal B", STAGE_ID: "WON", OPPORTUNITY: 5000, CURRENCY_ID: "RUB" };
    resolveB(
      new Response(
        JSON.stringify({
          success: true,
          deals: [dealB],
          total: 1,
          fetched: 1,
        }),
        { status: 200 }
      )
    );
    await reqB;

    expect(useDashboardStore.getState().allDeals[0]?.TITLE).toBe("Deal B");
    expect(useDashboardStore.getState().dealsError).toBeNull();
    expect(useDashboardStore.getState().connectionStatus).toBe("connected");

    // A fails with HTTP 500 later
    resolveA(new Response("Internal Server Error", { status: 500 }));
    await reqA;

    // Invariant: B data remains, dealsError remains null, connectionStatus remains connected, dealsLoading false
    expect(useDashboardStore.getState().allDeals[0]?.TITLE).toBe("Deal B");
    expect(useDashboardStore.getState().dealsError).toBeNull();
    expect(useDashboardStore.getState().connectionStatus).toBe("connected");
    expect(useDashboardStore.getState().dealsLoading).toBe(false);
  });

  it("TEST C — stale network rejection: Request A rejecting later does NOT overwrite B state", async () => {
    let rejectA!: (err: Error) => void;
    let resolveB!: (res: Response) => void;

    const promiseA = new Promise<Response>((_, rej) => {
      rejectA = rej;
    });
    const promiseB = new Promise<Response>((r) => {
      resolveB = r;
    });

    let invocation = 0;
    global.fetch = vi.fn().mockImplementation((url: string) => {
      if (url.includes("/api/bitrix/deals")) {
        invocation++;
        return invocation === 1 ? promiseA : promiseB;
      }
      return Promise.resolve(new Response(JSON.stringify({ success: true })));
    });

    const reqA = useDashboardStore.getState().fetchDeals({ skipRelated: true });
    const reqB = useDashboardStore.getState().fetchDeals({ skipRelated: true });

    // B succeeds
    const dealB = { ID: "200", id: "200", TITLE: "Deal B", STAGE_ID: "WON", OPPORTUNITY: 5000, CURRENCY_ID: "RUB" };
    resolveB(
      new Response(
        JSON.stringify({
          success: true,
          deals: [dealB],
          total: 1,
          fetched: 1,
        }),
        { status: 200 }
      )
    );
    await reqB;

    // A rejects with network error
    rejectA(new Error("Network connection lost"));
    await reqA;

    // Invariant: B data remains authoritative, no disconnected state, no stale error
    expect(useDashboardStore.getState().allDeals[0]?.TITLE).toBe("Deal B");
    expect(useDashboardStore.getState().dealsError).toBeNull();
    expect(useDashboardStore.getState().connectionStatus).toBe("connected");
    expect(useDashboardStore.getState().dealsLoading).toBe(false);
  });

  it("TEST D — stale failure while newest request is still pending: stale failure does NOT clear dealsLoading", async () => {
    let rejectA!: (err: Error) => void;
    let resolveB!: (res: Response) => void;

    const promiseA = new Promise<Response>((_, rej) => {
      rejectA = rej;
    });
    const promiseB = new Promise<Response>((r) => {
      resolveB = r;
    });

    let invocation = 0;
    global.fetch = vi.fn().mockImplementation((url: string) => {
      if (url.includes("/api/bitrix/deals")) {
        invocation++;
        return invocation === 1 ? promiseA : promiseB;
      }
      return Promise.resolve(new Response(JSON.stringify({ success: true })));
    });

    const reqA = useDashboardStore.getState().fetchDeals({ skipRelated: true });
    const reqB = useDashboardStore.getState().fetchDeals({ skipRelated: true });

    expect(useDashboardStore.getState().dealsLoading).toBe(true);

    // Stale A fails while B is still pending
    rejectA(new Error("Timeout in request A"));
    await reqA;

    // Invariant: dealsLoading must REMAIN true because B is still authoritative and pending
    expect(useDashboardStore.getState().dealsLoading).toBe(true);
    expect(useDashboardStore.getState().dealsError).toBeNull();

    // Now B succeeds
    const dealB = { ID: "200", id: "200", TITLE: "Deal B", STAGE_ID: "WON", OPPORTUNITY: 5000, CURRENCY_ID: "RUB" };
    resolveB(
      new Response(
        JSON.stringify({
          success: true,
          deals: [dealB],
          total: 1,
          fetched: 1,
        }),
        { status: 200 }
      )
    );
    await reqB;

    // Now dealsLoading is false and state is connected
    expect(useDashboardStore.getState().dealsLoading).toBe(false);
    expect(useDashboardStore.getState().dealsError).toBeNull();
    expect(useDashboardStore.getState().connectionStatus).toBe("connected");
    expect(useDashboardStore.getState().allDeals[0]?.TITLE).toBe("Deal B");
  });

  it("TEST E — latest request genuinely fails: B failure IS authoritative and populates error", async () => {
    let resolveA!: (res: Response) => void;
    let rejectB!: (err: Error) => void;

    const promiseA = new Promise<Response>((r) => {
      resolveA = r;
    });
    const promiseB = new Promise<Response>((_, rej) => {
      rejectB = rej;
    });

    let invocation = 0;
    global.fetch = vi.fn().mockImplementation((url: string) => {
      if (url.includes("/api/bitrix/deals")) {
        invocation++;
        return invocation === 1 ? promiseA : promiseB;
      }
      return Promise.resolve(new Response(JSON.stringify({ success: true })));
    });

    const reqA = useDashboardStore.getState().fetchDeals({ skipRelated: true });
    const reqB = useDashboardStore.getState().fetchDeals({ skipRelated: true });

    // B fails
    rejectB(new Error("Bitrix upstream down"));
    await reqB;

    // Authoritative failure is set
    expect(useDashboardStore.getState().dealsLoading).toBe(false);
    expect(useDashboardStore.getState().dealsError).toBe("Bitrix upstream down");
    expect(useDashboardStore.getState().connectionStatus).toBe("disconnected");

    // Stale A resolves later with success
    resolveA(
      new Response(
        JSON.stringify({
          success: true,
          deals: [{ ID: "100", id: "100", TITLE: "Deal A" }],
        }),
        { status: 200 }
      )
    );
    await reqA;

    // Stale A must NOT overwrite the error from authoritative B
    expect(useDashboardStore.getState().dealsError).toBe("Bitrix upstream down");
    expect(useDashboardStore.getState().connectionStatus).toBe("disconnected");
  });

  it("Side-effects: stale successful request does NOT trigger related fetches", async () => {
    const fetchUserNamesSpy = vi.spyOn(useDashboardStore.getState(), "fetchUserNames");
    const fetchCompaniesDataSpy = vi.spyOn(useDashboardStore.getState(), "fetchCompaniesData");
    const fetchActivitiesDataSpy = vi.spyOn(useDashboardStore.getState(), "fetchActivitiesData");

    let resolveA!: (res: Response) => void;
    let resolveB!: (res: Response) => void;

    const promiseA = new Promise<Response>((r) => {
      resolveA = r;
    });
    const promiseB = new Promise<Response>((r) => {
      resolveB = r;
    });

    let invocation = 0;
    global.fetch = vi.fn().mockImplementation((url: string) => {
      if (url.includes("/api/bitrix/deals")) {
        invocation++;
        return invocation === 1 ? promiseA : promiseB;
      }
      return Promise.resolve(new Response(JSON.stringify({ success: true })));
    });

    // A and B both run with skipRelated = false (default)
    const reqA = useDashboardStore.getState().fetchDeals();
    const reqB = useDashboardStore.getState().fetchDeals();

    // B succeeds first
    resolveB(
      new Response(
        JSON.stringify({
          success: true,
          deals: [{ ID: "200", id: "200", TITLE: "Deal B" }],
          total: 1,
        }),
        { status: 200 }
      )
    );
    await reqB;

    // B should have triggered related fetches once
    expect(fetchUserNamesSpy).toHaveBeenCalledTimes(1);
    expect(fetchCompaniesDataSpy).toHaveBeenCalledTimes(1);
    expect(fetchActivitiesDataSpy).toHaveBeenCalledTimes(1);

    // Stale A succeeds later
    resolveA(
      new Response(
        JSON.stringify({
          success: true,
          deals: [{ ID: "100", id: "100", TITLE: "Deal A" }],
          total: 1,
        }),
        { status: 200 }
      )
    );
    await reqA;

    // Related fetches must NOT have been called a second time by stale A
    expect(fetchUserNamesSpy).toHaveBeenCalledTimes(1);
    expect(fetchCompaniesDataSpy).toHaveBeenCalledTimes(1);
    expect(fetchActivitiesDataSpy).toHaveBeenCalledTimes(1);
  });
});
