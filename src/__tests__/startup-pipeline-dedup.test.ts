import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { useDashboardStore } from '@/store/dashboard-store';

describe('Startup Pipeline & Entity Fetch Deduplication', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    // Reset Zustand store state
    useDashboardStore.setState({
      allDeals: [
        { ID: "1", id: "1", TITLE: "Сделка 1", COMPANY_ID: "100", STAGE_ID: "NEW" },
        { ID: "2", id: "2", TITLE: "Сделка 2", COMPANY_ID: "200", STAGE_ID: "PREPARATION" },
      ] as any,
      selectedColumns: ["TITLE", "COMPANY_TITLE", "ACTIVITY_LAST"],
      companiesData: {},
      companiesDataFetchedAt: {},
      companiesDataLoading: false,
      activitiesData: {},
      activitiesDataFetchedAt: {},
      activitiesDataLoading: false,
      userNames: {},
      userNamesLoading: false,
      isDemoMode: false,
    });
  });

  afterEach(() => {
    global.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it('TC-DEDUP-01: fetchCompaniesData coalesces concurrent calls into a single HTTP request', async () => {
    let callCount = 0;
    let resolveFetch!: (res: Response) => void;
    const fetchPromise = new Promise<Response>((r) => {
      resolveFetch = r;
    });

    global.fetch = vi.fn().mockImplementation((url: string) => {
      if (url === '/api/bitrix/companies') {
        callCount++;
        return fetchPromise;
      }
      return Promise.resolve(new Response(JSON.stringify({ success: true })));
    });

    // Fire two calls concurrently (as happened between fetchDeals and fetchRelated)
    const p1 = useDashboardStore.getState().fetchCompaniesData();
    const p2 = useDashboardStore.getState().fetchCompaniesData();

    // Verify loading state is active
    expect(useDashboardStore.getState().companiesDataLoading).toBe(true);
    // Verify only ONE HTTP call was made
    expect(callCount).toBe(1);

    // Resolve the HTTP call
    resolveFetch(
      new Response(
        JSON.stringify({
          success: true,
          companies: {
            "100": { ID: "100", TITLE: "Компания 100" },
            "200": { ID: "200", TITLE: "Компания 200" },
          },
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      )
    );

    // Both promises should resolve
    await Promise.all([p1, p2]);

    // Check store state: data populated and loading set to false
    expect(useDashboardStore.getState().companiesDataLoading).toBe(false);
    expect(useDashboardStore.getState().companiesData["100"]?.TITLE).toBe("Компания 100");
    expect(useDashboardStore.getState().companiesData["200"]?.TITLE).toBe("Компания 200");
  });

  it('TC-DEDUP-02: fetchActivitiesData coalesces concurrent calls into a single HTTP request', async () => {
    let callCount = 0;
    let resolveFetch!: (res: Response) => void;
    const fetchPromise = new Promise<Response>((r) => {
      resolveFetch = r;
    });

    global.fetch = vi.fn().mockImplementation((url: string) => {
      if (url === '/api/bitrix/activities') {
        callCount++;
        return fetchPromise;
      }
      return Promise.resolve(new Response(JSON.stringify({ success: true })));
    });

    const p1 = useDashboardStore.getState().fetchActivitiesData();
    const p2 = useDashboardStore.getState().fetchActivitiesData();

    expect(useDashboardStore.getState().activitiesDataLoading).toBe(true);
    expect(callCount).toBe(1);

    resolveFetch(
      new Response(
        JSON.stringify({
          success: true,
          activities: {
            "1": { last: { ID: "a1", SUBJECT: "Звонок" }, all: [] },
          },
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      )
    );

    await Promise.all([p1, p2]);

    expect(useDashboardStore.getState().activitiesDataLoading).toBe(false);
    expect(useDashboardStore.getState().activitiesData["1"]?.last?.SUBJECT).toBe("Звонок");
  });

  it('TC-DEDUP-03: fetchUserNames coalesces concurrent calls into a single HTTP request', async () => {
    let callCount = 0;
    let resolveFetch!: (res: Response) => void;
    const fetchPromise = new Promise<Response>((r) => {
      resolveFetch = r;
    });

    global.fetch = vi.fn().mockImplementation((url: string) => {
      if (url === '/api/bitrix/users') {
        callCount++;
        return fetchPromise;
      }
      return Promise.resolve(new Response(JSON.stringify({ success: true })));
    });

    const p1 = useDashboardStore.getState().fetchUserNames();
    const p2 = useDashboardStore.getState().fetchUserNames();

    expect(useDashboardStore.getState().userNamesLoading).toBe(true);
    expect(callCount).toBe(1);

    resolveFetch(
      new Response(
        JSON.stringify({
          success: true,
          users: { "1": "Иван Иванов" },
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      )
    );

    await Promise.all([p1, p2]);

    expect(useDashboardStore.getState().userNamesLoading).toBe(false);
    expect(useDashboardStore.getState().userNames["1"]).toBe("Иван Иванов");
  });

  it('TC-DEDUP-04: fetchDeals with skipRelated: true does NOT fire background related fetches', async () => {
    const fetchedUrls: string[] = [];

    global.fetch = vi.fn().mockImplementation((url: string) => {
      fetchedUrls.push(url);
      if (url === '/api/bitrix/deals') {
        return Promise.resolve(
          new Response(
            JSON.stringify({
              success: true,
              deals: [{ ID: "10", TITLE: "Сделка 10", COMPANY_ID: "500" }],
              total: 1,
            }),
            { status: 200, headers: { 'Content-Type': 'application/json' } }
          )
        );
      }
      return Promise.resolve(new Response(JSON.stringify({ success: true })));
    });

    await useDashboardStore.getState().fetchDeals({ skipRelated: true });

    // Wait a tick for any non-blocking promises
    await new Promise((r) => setTimeout(r, 20));

    // Only /api/bitrix/deals should have been called
    expect(fetchedUrls).toEqual(['/api/bitrix/deals']);
    expect(fetchedUrls).not.toContain('/api/bitrix/companies');
    expect(fetchedUrls).not.toContain('/api/bitrix/activities');
    expect(fetchedUrls).not.toContain('/api/bitrix/users');
  });

  it('TC-DEDUP-05: fetchDeals without skipRelated triggers background related fetches', async () => {
    const fetchedUrls: string[] = [];

    global.fetch = vi.fn().mockImplementation((url: string) => {
      fetchedUrls.push(url);
      if (url === '/api/bitrix/deals') {
        return Promise.resolve(
          new Response(
            JSON.stringify({
              success: true,
              deals: [{ ID: "10", TITLE: "Сделка 10", COMPANY_ID: "500" }],
              total: 1,
            }),
            { status: 200, headers: { 'Content-Type': 'application/json' } }
          )
        );
      }
      return Promise.resolve(new Response(JSON.stringify({ success: true })));
    });

    await useDashboardStore.getState().fetchDeals();

    // Wait a tick for non-blocking promises to fire
    await new Promise((r) => setTimeout(r, 20));

    expect(fetchedUrls).toContain('/api/bitrix/deals');
    expect(fetchedUrls).toContain('/api/bitrix/users');
    expect(fetchedUrls).toContain('/api/bitrix/companies');
  });
});
