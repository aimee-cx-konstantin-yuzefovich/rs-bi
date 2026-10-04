import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import {
  getCachedSamples,
  setCachedSamples,
  clearSamplesCache,
  fetchSamplesWithDeduplication,
  syncAuthPrincipal,
} from "@/lib/samples/samples-cache";
import type { SampleSummary } from "@/lib/samples/types";

const mockSummary = (id: string, title: string): SampleSummary => ({
  companyId: id,
  companyTitle: title,
  productFamilies: ["Гель"],
  grades: [],
  quantities: [],
  sentDates: ["2026-09-01"],
  sampleIndicators: ["Переданы"],
  processStatuses: [],
  normalizedResult: "positive",
  relatedDeals: [],
  sourceQuality: "structured",
  dataIssues: [],
});

describe("Samples Session Cache (C1 .. C8)", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    fetchMock.mockReset();
    clearSamplesCache();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    clearSamplesCache();
    vi.restoreAllMocks();
  });

  it("TEST C1: Cold load stores complete dataset on success", async () => {
    expect(getCachedSamples("user-1")).toBeNull();

    const mockData = [mockSummary("10", "Альфа")];
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ success: true, samples: mockData, orphanDealCount: 0 }), {
        status: 200,
        headers: { "content-type": "application/json" },
      })
    );

    const res = await fetchSamplesWithDeduplication("user-1");
    expect(res.success).toBe(true);
    if (res.success) {
      expect(res.samples).toEqual(mockData);
    }

    const cached = getCachedSamples("user-1");
    expect(cached).not.toBeNull();
    expect(cached?.samples).toEqual(mockData);
  });

  it("TEST C2: Warm revisit retrieves cached samples immediately without waiting", () => {
    const mockData = [mockSummary("20", "Бета")];
    setCachedSamples("user-1", {
      samples: mockData,
      meta: null,
      orphanDealCount: 1,
    });

    const cached = getCachedSamples("user-1");
    expect(cached).not.toBeNull();
    expect(cached?.samples).toEqual(mockData);
    expect(cached?.orphanDealCount).toBe(1);
  });

  it("TEST C3: In-flight deduplication issues only ONE backend POST", async () => {
    let resolveFetch: ((res: Response) => void) | null = null;
    const pendingPromise = new Promise<Response>((resolve) => {
      resolveFetch = resolve;
    });

    fetchMock.mockReturnValue(pendingPromise);

    // Two concurrent requests for the same principal
    const p1 = fetchSamplesWithDeduplication("user-1");
    const p2 = fetchSamplesWithDeduplication("user-1");

    expect(fetchMock).toHaveBeenCalledTimes(1);

    const mockData = [mockSummary("30", "Гамма")];
    resolveFetch!(
      new Response(JSON.stringify({ success: true, samples: mockData }), {
        status: 200,
        headers: { "content-type": "application/json" },
      })
    );

    const [r1, r2] = await Promise.all([p1, p2]);
    expect(r1).toBe(r2);
    expect(r1.success).toBe(true);
  });

  it("TEST C4: Successful background refresh atomically replaces cache", async () => {
    const dataA = [mockSummary("1", "Snapshot A")];
    const dataB = [mockSummary("2", "Snapshot B")];

    setCachedSamples("user-1", {
      samples: dataA,
      meta: null,
      orphanDealCount: 0,
    });

    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ success: true, samples: dataB, orphanDealCount: 2 }), {
        status: 200,
        headers: { "content-type": "application/json" },
      })
    );

    const res = await fetchSamplesWithDeduplication("user-1", { force: true });
    expect(res.success).toBe(true);

    const cached = getCachedSamples("user-1");
    expect(cached?.samples).toEqual(dataB);
    expect(cached?.orphanDealCount).toBe(2);
  });

  it("TEST C5: Failed background refresh preserves previous complete snapshot", async () => {
    const dataA = [mockSummary("1", "Snapshot A")];
    setCachedSamples("user-1", {
      samples: dataA,
      meta: null,
      orphanDealCount: 0,
    });

    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ success: false, error: "CRM network timeout" }), {
        status: 502,
        headers: { "content-type": "application/json" },
      })
    );

    const res = await fetchSamplesWithDeduplication("user-1", { force: true });
    expect(res.success).toBe(false);

    // Old complete snapshot A must still be preserved in cache!
    const cached = getCachedSamples("user-1");
    expect(cached).not.toBeNull();
    expect(cached?.samples).toEqual(dataA);
  });

  it("TEST C6: Cold failure shows error and does not store corrupted cache", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ success: false, error: "Server error" }), {
        status: 500,
        headers: { "content-type": "application/json" },
      })
    );

    const res = await fetchSamplesWithDeduplication("user-1");
    expect(res.success).toBe(false);
    expect(getCachedSamples("user-1")).toBeNull();
  });

  it("TEST C7: Auth principal change isolates cache between users", () => {
    const dataUserA = [mockSummary("1", "Private Company of A")];
    setCachedSamples("user-A", {
      samples: dataUserA,
      meta: null,
      orphanDealCount: 0,
    });

    expect(getCachedSamples("user-A")?.samples).toEqual(dataUserA);

    // Switch principal to user-B
    syncAuthPrincipal("user-B");
    expect(getCachedSamples("user-B")).toBeNull();
    expect(getCachedSamples("user-A")).toBeNull();
  });

  it("TEST C8: Logout clears cache completely", () => {
    const data = [mockSummary("1", "Test")];
    setCachedSamples("user-1", {
      samples: data,
      meta: null,
      orphanDealCount: 0,
    });

    expect(getCachedSamples("user-1")).not.toBeNull();
    clearSamplesCache();
    expect(getCachedSamples("user-1")).toBeNull();
  });

  // ─── Phase A closure: empty successful dataset is a valid snapshot ───

  it("CACHE-EMPTY-1: successful response with samples: [] creates a complete cache entry", async () => {
    expect(getCachedSamples("user-1")).toBeNull();

    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({ success: true, samples: [], orphanDealCount: 0 }),
        { status: 200, headers: { "content-type": "application/json" } }
      )
    );

    const res = await fetchSamplesWithDeduplication("user-1");
    expect(res.success).toBe(true);
    if (res.success) {
      expect(res.samples).toEqual([]);
    }

    // The empty successful dataset IS a complete snapshot — cache hit.
    const cached = getCachedSamples("user-1");
    expect(cached).not.toBeNull();
    expect(cached?.samples).toEqual([]);
  });

  it("CACHE-EMPTY-2: revisit with cached empty dataset returns it immediately (no cold state)", async () => {
    setCachedSamples("user-1", {
      samples: [],
      meta: null,
      orphanDealCount: 0,
    });

    // Cache hit must be non-null so the hook renders the empty registry
    // immediately and starts a warm refresh instead of a cold spinner.
    const cached = getCachedSamples("user-1");
    expect(cached).not.toBeNull();
    expect(cached?.samples).toEqual([]);
  });

  it("CACHE-EMPTY-3: failed refresh preserves the cached empty successful snapshot", async () => {
    setCachedSamples("user-1", {
      samples: [],
      meta: null,
      orphanDealCount: 0,
    });

    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ success: false, error: "SP down" }), {
        status: 502,
        headers: { "content-type": "application/json" },
      })
    );

    const res = await fetchSamplesWithDeduplication("user-1");
    expect(res.success).toBe(false);

    // The empty successful snapshot remains authoritative — never
    // treated as "no cache" and never replaced by the failure.
    const cached = getCachedSamples("user-1");
    expect(cached).not.toBeNull();
    expect(cached?.samples).toEqual([]);
  });

  // ─── Out-of-order commit protection (request-generation guard) ───

  it("RACE-S1: late-resolving older request A can never overwrite newer request B in cache", async () => {
    // Deferred responses: A starts first and resolves LAST.
    let resolveA: ((res: Response) => void) | null = null;
    let resolveB: ((res: Response) => void) | null = null;
    const promiseA = new Promise<Response>((resolve) => { resolveA = resolve; });
    const promiseB = new Promise<Response>((resolve) => { resolveB = resolve; });

    fetchMock.mockReturnValueOnce(promiseA).mockReturnValueOnce(promiseB);

    const pA = fetchSamplesWithDeduplication("user-1", { force: true }); // generation 1
    const pB = fetchSamplesWithDeduplication("user-1", { force: true }); // generation 2
    expect(fetchMock).toHaveBeenCalledTimes(2);

    const dataA = [mockSummary("1", "Snapshot A (stale)")];
    const dataB = [mockSummary("2", "Snapshot B (latest)")];

    // B (newer) succeeds first
    resolveB!(
      new Response(JSON.stringify({ success: true, samples: dataB, orphanDealCount: 0 }), {
        status: 200,
        headers: { "content-type": "application/json" },
      })
    );
    const resB = await pB;
    expect(resB.success).toBe(true);

    const cachedAfterB = getCachedSamples("user-1");
    expect(cachedAfterB?.samples).toEqual(dataB);
    const timestampB = cachedAfterB?.timestamp;

    // A (older) succeeds last — must NOT overwrite B in the shared cache
    resolveA!(
      new Response(JSON.stringify({ success: true, samples: dataA, orphanDealCount: 9 }), {
        status: 200,
        headers: { "content-type": "application/json" },
      })
    );
    const resA = await pA;
    expect(resA.success).toBe(true); // A still resolves to its own caller

    const cached = getCachedSamples("user-1");
    expect(cached?.samples).toEqual(dataB); // B's payload survives
    expect(cached?.orphanDealCount).toBe(0); // B's metadata survives
    expect(cached?.timestamp).toBe(timestampB); // timestamp still belongs to B
  });

  it("RACE-S2: principal switch prevents an old-principal completion from committing", async () => {
    let resolveA: ((res: Response) => void) | null = null;
    const promiseA = new Promise<Response>((resolve) => { resolveA = resolve; });
    fetchMock.mockReturnValueOnce(promiseA);

    const pA = fetchSamplesWithDeduplication("user-A", { force: true });

    // Principal switches mid-flight → cache cleared, generations invalidated
    syncAuthPrincipal("user-B");
    expect(getCachedSamples("user-A")).toBeNull();

    const dataA = [mockSummary("1", "Data of user A")];
    resolveA!(
      new Response(JSON.stringify({ success: true, samples: dataA, orphanDealCount: 0 }), {
        status: 200,
        headers: { "content-type": "application/json" },
      })
    );

    const resA = await pA;
    expect(resA.success).toBe(true); // A resolves to its caller...

    // ...but commits nothing: neither user-A's cache (invalidated) nor
    // user-B's fresh cache may receive the old-principal snapshot.
    expect(getCachedSamples("user-A")).toBeNull();
    expect(getCachedSamples("user-B")).toBeNull();
  });

  it("RACE-S3: in-flight deduplication is preserved (joined request shares one generation)", async () => {
    let resolveFetch: ((res: Response) => void) | null = null;
    const pendingPromise = new Promise<Response>((resolve) => { resolveFetch = resolve; });
    fetchMock.mockReturnValue(pendingPromise);

    const p1 = fetchSamplesWithDeduplication("user-1"); // dedup join of p2
    const p2 = fetchSamplesWithDeduplication("user-1");
    expect(fetchMock).toHaveBeenCalledTimes(1); // ONE real request

    const data = [mockSummary("1", "Единый снимок")];
    resolveFetch!(
      new Response(JSON.stringify({ success: true, samples: data, orphanDealCount: 0 }), {
        status: 200,
        headers: { "content-type": "application/json" },
      })
    );

    const [r1, r2] = await Promise.all([p1, p2]);
    expect(r1).toBe(r2); // dedup share preserved
    expect(r1.success).toBe(true);
    expect(getCachedSamples("user-1")?.samples).toEqual(data);
  });

  it("RACE-S4: force still performs a real network request after a successful load", async () => {
    const dataA = [mockSummary("1", "Snapshot A")];
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ success: true, samples: dataA, orphanDealCount: 0 }), {
        status: 200,
        headers: { "content-type": "application/json" },
      })
    );
    await fetchSamplesWithDeduplication("user-1");
    expect(getCachedSamples("user-1")?.samples).toEqual(dataA);

    const dataB = [mockSummary("2", "Snapshot B")];
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ success: true, samples: dataB, orphanDealCount: 0 }), {
        status: 200,
        headers: { "content-type": "application/json" },
      })
    );
    const res = await fetchSamplesWithDeduplication("user-1", { force: true });
    expect(fetchMock).toHaveBeenCalledTimes(2); // force bypasses dedup + cache
    expect(res.success).toBe(true);
    expect(getCachedSamples("user-1")?.samples).toEqual(dataB);
  });
});
