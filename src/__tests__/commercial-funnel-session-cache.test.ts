import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import {
  getCachedCommercialFunnel,
  setCachedCommercialFunnel,
  clearCommercialFunnelCache,
  fetchCommercialFunnelWithDeduplication,
  syncCommercialFunnelPrincipal,
  COMMERCIAL_FUNNEL_CACHE_TTL_MS,
  type CommercialFunnelSnapshotData,
} from "@/lib/commercial-funnel/commercial-funnel-cache";
import type { CommercialCompany, CommercialDeal } from "@/lib/commercial-funnel/types";

const mockCompany = (id: string, title: string): CommercialCompany => ({
  id,
  title,
  responsibleId: "1",
  responsibleName: "Менеджер 1",
  companyFactsIncluded: true,
  dateCreate: "2026-01-01",
  industry: "Химия",
  direction: ["Продажи"],
  productType: ["Гель"],
  gradeGel: [],
  gradeSol: [],
  sampleStatus: "—",
  sampleStatusSource: "NONE",
  sampleAllDates: [],
  deals: [],
  hasAttention: false,
  attentionReasons: [],
});

const mockDeal = (id: string, title: string): CommercialDeal => ({
  id,
  title,
  companyId: "1",
  responsibleId: "1",
  stageId: "NEW",
  categoryId: "0",
  opportunity: 100000,
  currencyId: "RUB",
  productType: ["Гель"],
  industry: ["Химия"],
  direction: ["Продажи"],
});

const createMockData = (compTitle = "Компания 1"): CommercialFunnelSnapshotData => ({
  companies: [mockCompany("1", compTitle)],
  deals: [mockDeal("10", "Сделка 10")],
  userNames: { "1": "Менеджер 1" },
  statusLabels: {},
  isDemoMode: false,
  totalCompanies: 1,
  totalDeals: 1,
});

describe("Commercial Funnel Session Cache (CF-CACHE-1 .. CF-CACHE-8)", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    fetchMock.mockReset();
    clearCommercialFunnelCache();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    clearCommercialFunnelCache();
    vi.restoreAllMocks();
  });

  it("CF-CACHE-1: Cold load stores complete dataset on success", async () => {
    expect(getCachedCommercialFunnel("user-1")).toBeNull();

    const mockPayload = createMockData();
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ success: true, ...mockPayload }), {
        status: 200,
        headers: { "content-type": "application/json" },
      })
    );

    const res = await fetchCommercialFunnelWithDeduplication("user-1");
    expect(res.success).toBe(true);
    if (res.success) {
      expect(res.data.companies).toHaveLength(1);
      expect(res.data.companies[0].title).toBe("Компания 1");
    }

    const cached = getCachedCommercialFunnel("user-1");
    expect(cached).not.toBeNull();
    expect(cached?.companies[0].title).toBe("Компания 1");
  });

  it("CF-CACHE-2: Fresh cache retrieves snapshot immediately without backend fetch", async () => {
    const mockData = createMockData("Кэшированная Компания");
    setCachedCommercialFunnel("user-1", mockData);

    const cached = getCachedCommercialFunnel("user-1");
    expect(cached).not.toBeNull();
    expect(cached?.companies[0].title).toBe("Кэшированная Компания");

    // Fetch call with fresh cache should NOT invoke backend fetch
    const res = await fetchCommercialFunnelWithDeduplication("user-1");
    expect(res.success).toBe(true);
    expect(fetchMock).not.toHaveBeenCalled();
    if (res.success) {
      expect(res.data.companies[0].title).toBe("Кэшированная Компания");
    }
  });

  it("CF-CACHE-3: In-flight deduplication issues only ONE backend POST for concurrent requests", async () => {
    let resolveFetch: ((res: Response) => void) | null = null;
    const pendingPromise = new Promise<Response>((resolve) => {
      resolveFetch = resolve;
    });

    fetchMock.mockReturnValue(pendingPromise);

    // Two concurrent requests for the same principal
    const p1 = fetchCommercialFunnelWithDeduplication("user-1");
    const p2 = fetchCommercialFunnelWithDeduplication("user-1");

    expect(fetchMock).toHaveBeenCalledTimes(1);

    const mockData = createMockData("Параллельная Компания");
    resolveFetch!(
      new Response(JSON.stringify({ success: true, ...mockData }), {
        status: 200,
        headers: { "content-type": "application/json" },
      })
    );

    const [r1, r2] = await Promise.all([p1, p2]);
    expect(r1).toBe(r2);
    expect(r1.success).toBe(true);
  });

  it("CF-CACHE-4: Force refresh bypasses cache and hits backend POST", async () => {
    const dataA = createMockData("Snapshot A");
    const dataB = createMockData("Snapshot B");

    setCachedCommercialFunnel("user-1", dataA);

    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ success: true, ...dataB }), {
        status: 200,
        headers: { "content-type": "application/json" },
      })
    );

    const res = await fetchCommercialFunnelWithDeduplication("user-1", { force: true });
    expect(res.success).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    const cached = getCachedCommercialFunnel("user-1");
    expect(cached?.companies[0].title).toBe("Snapshot B");
  });

  it("CF-CACHE-5: Expired TTL triggers a fresh backend fetch", async () => {
    const dataA = createMockData("Старый снимок");
    setCachedCommercialFunnel("user-1", dataA);

    // Artificially age the cache past TTL
    const cachedEntry = getCachedCommercialFunnel("user-1");
    expect(cachedEntry).not.toBeNull();
    if (cachedEntry) {
      cachedEntry.timestamp = Date.now() - (COMMERCIAL_FUNNEL_CACHE_TTL_MS + 5000);
    }

    // getCachedCommercialFunnel without allowStale returns null for expired cache
    expect(getCachedCommercialFunnel("user-1")).toBeNull();
    // with allowStale it returns the last good snapshot
    expect(getCachedCommercialFunnel("user-1", { allowStale: true })).not.toBeNull();

    const dataB = createMockData("Новый снимок после TTL");
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ success: true, ...dataB }), {
        status: 200,
        headers: { "content-type": "application/json" },
      })
    );

    const res = await fetchCommercialFunnelWithDeduplication("user-1");
    expect(res.success).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    if (res.success) {
      expect(res.data.companies[0].title).toBe("Новый снимок после TTL");
    }
  });

  it("CF-CACHE-6: Failed background refresh preserves previous complete snapshot", async () => {
    const dataA = createMockData("Snapshot A");
    setCachedCommercialFunnel("user-1", dataA);

    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ success: false, error: "CRM network timeout" }), {
        status: 502,
        headers: { "content-type": "application/json" },
      })
    );

    const res = await fetchCommercialFunnelWithDeduplication("user-1", { force: true });
    expect(res.success).toBe(false);

    // Old complete snapshot A must still be preserved in cache!
    const cached = getCachedCommercialFunnel("user-1", { allowStale: true });
    expect(cached).not.toBeNull();
    expect(cached?.companies[0].title).toBe("Snapshot A");
  });

  it("CF-CACHE-7: Cold failure shows error and does not store corrupted cache", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ success: false, error: "Server error" }), {
        status: 500,
        headers: { "content-type": "application/json" },
      })
    );

    const res = await fetchCommercialFunnelWithDeduplication("user-1");
    expect(res.success).toBe(false);
    expect(getCachedCommercialFunnel("user-1")).toBeNull();
  });

  it("CF-CACHE-8: Auth principal change isolates cache between users (no cross-user leakage)", () => {
    const dataUserA = createMockData("Private Company of A");
    setCachedCommercialFunnel("user-A", dataUserA);

    expect(getCachedCommercialFunnel("user-A")?.companies[0].title).toBe("Private Company of A");

    // Switch principal to user-B
    syncCommercialFunnelPrincipal("user-B");
    expect(getCachedCommercialFunnel("user-B")).toBeNull();
    expect(getCachedCommercialFunnel("user-A")).toBeNull();
  });

  it("CF-CACHE-9: Logout clears cache completely", () => {
    const data = createMockData("Test");
    setCachedCommercialFunnel("user-1", data);

    expect(getCachedCommercialFunnel("user-1")).not.toBeNull();
    clearCommercialFunnelCache();
    expect(getCachedCommercialFunnel("user-1")).toBeNull();
  });

  // ─── Out-of-order commit protection (request-generation guard) ───

  it("CF-RACE-1: late-resolving older request A can never overwrite newer request B in cache", async () => {
    let resolveA: ((res: Response) => void) | null = null;
    let resolveB: ((res: Response) => void) | null = null;
    const promiseA = new Promise<Response>((resolve) => { resolveA = resolve; });
    const promiseB = new Promise<Response>((resolve) => { resolveB = resolve; });

    fetchMock.mockReturnValueOnce(promiseA).mockReturnValueOnce(promiseB);

    const pA = fetchCommercialFunnelWithDeduplication("user-1", { force: true }); // generation 1
    const pB = fetchCommercialFunnelWithDeduplication("user-1", { force: true }); // generation 2
    expect(fetchMock).toHaveBeenCalledTimes(2);

    // B (newer) succeeds first
    resolveB!(
      new Response(JSON.stringify({ success: true, ...createMockData("Snapshot B (latest)") }), {
        status: 200,
        headers: { "content-type": "application/json" },
      })
    );
    const resB = await pB;
    expect(resB.success).toBe(true);

    const cachedAfterB = getCachedCommercialFunnel("user-1");
    expect(cachedAfterB?.companies[0].title).toBe("Snapshot B (latest)");
    const timestampB = cachedAfterB?.timestamp;

    // A (older) succeeds last — must NOT overwrite B in the shared cache
    resolveA!(
      new Response(JSON.stringify({ success: true, ...createMockData("Snapshot A (stale)") }), {
        status: 200,
        headers: { "content-type": "application/json" },
      })
    );
    const resA = await pA;
    expect(resA.success).toBe(true); // A still resolves to its own caller

    const cached = getCachedCommercialFunnel("user-1");
    expect(cached?.companies[0].title).toBe("Snapshot B (latest)"); // B survives
    expect(cached?.timestamp).toBe(timestampB); // timestamp still belongs to B
  });

  it("CF-RACE-2: principal switch prevents an old-principal completion from committing", async () => {
    let resolveA: ((res: Response) => void) | null = null;
    const promiseA = new Promise<Response>((resolve) => { resolveA = resolve; });
    fetchMock.mockReturnValueOnce(promiseA);

    const pA = fetchCommercialFunnelWithDeduplication("user-A", { force: true });

    // Principal switches mid-flight → cache cleared, generations invalidated
    syncCommercialFunnelPrincipal("user-B");
    expect(getCachedCommercialFunnel("user-A")).toBeNull();

    resolveA!(
      new Response(JSON.stringify({ success: true, ...createMockData("Data of user A") }), {
        status: 200,
        headers: { "content-type": "application/json" },
      })
    );

    const resA = await pA;
    expect(resA.success).toBe(true); // A resolves to its caller...

    // ...but commits nothing: no cross-user leakage into user-B's cache.
    expect(getCachedCommercialFunnel("user-A")).toBeNull();
    expect(getCachedCommercialFunnel("user-B")).toBeNull();
  });

  it("CF-RACE-3: failure of a newer request never clears the last successful snapshot", async () => {
    const dataA = createMockData("Snapshot A");
    setCachedCommercialFunnel("user-1", dataA);

    // Two forced refreshes both fail
    fetchMock
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ success: false, error: "down 1" }), {
          status: 502,
          headers: { "content-type": "application/json" },
        })
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ success: false, error: "down 2" }), {
          status: 502,
          headers: { "content-type": "application/json" },
        })
      );

    const r1 = await fetchCommercialFunnelWithDeduplication("user-1", { force: true });
    const r2 = await fetchCommercialFunnelWithDeduplication("user-1", { force: true });
    expect(r1.success).toBe(false);
    expect(r2.success).toBe(false);

    // Repeated failures NEVER discard the last successful snapshot.
    const cached = getCachedCommercialFunnel("user-1", { allowStale: true });
    expect(cached).not.toBeNull();
    expect(cached?.companies[0].title).toBe("Snapshot A");
  });
});
