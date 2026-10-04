// @vitest-environment node
// src/__tests__/smart-process-client-cache-race.test.ts
// ─────────────────────────────────────────────────────────────────────
// Out-of-order commit protection + dedup + scope isolation for the
// full-scope Smart Process client cache (request-generation guard):
//
// - a late-resolving OLDER full-scope request must never overwrite a
//   newer one's snapshot or timestamp in the shared cache;
// - principal switch must prevent an old-principal completion from
//   committing (no cross-user leakage);
// - company-scoped requests never commit to (nor corrupt) the
//   full-scope cache;
// - in-flight deduplication and `force` semantics are preserved.
// ─────────────────────────────────────────────────────────────────────
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  getCachedSmartProcessItems,
  setCachedSmartProcessItems,
  clearSmartProcessCache,
  fetchSmartProcessItemsWithDeduplication,
  syncSmartProcessPrincipal,
  type SmartProcessCacheSnapshot,
} from "@/lib/samples/smart-process-client-cache";
import type { SmartProcessItemView } from "@/lib/samples/smart-process-view";

const mockItem = (id: string, title: string): SmartProcessItemView => ({
  processItemId: id,
  title,
  companyId: "10",
  linkedDealId: "505",
  stageId: "DT1032_15:CLIENT",
  stageLabel: "Образцы на испытании",
  isActive: true,
  isTerminal: false,
  sentDates: ["2026-03-10"],
  grades: [],
  quantities: [],
  normalizedResult: "pending",
  dataIssues: [],
} as SmartProcessItemView);

const successBody = (item: SmartProcessItemView) => ({
  success: true,
  items: [item],
  byDealId: { "505": [] },
  byCompanyId: { "10": [] },
  stageDirectoryAvailable: true,
  total: 1,
});

describe("Smart Process full-scope cache — out-of-order commit protection", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    fetchMock.mockReset();
    clearSmartProcessCache();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    clearSmartProcessCache();
    vi.restoreAllMocks();
  });

  it("SP-RACE-1: late-resolving older full-scope request A can never overwrite newer B", async () => {
    let resolveA: ((res: Response) => void) | null = null;
    let resolveB: ((res: Response) => void) | null = null;
    const promiseA = new Promise<Response>((resolve) => { resolveA = resolve; });
    const promiseB = new Promise<Response>((resolve) => { resolveB = resolve; });

    fetchMock
      .mockReturnValueOnce(promiseA) // A: full scope, generation 1
      .mockReturnValueOnce(promiseB); // B: full scope, generation 2

    const pA = fetchSmartProcessItemsWithDeduplication("user-1", { force: true });
    const pB = fetchSmartProcessItemsWithDeduplication("user-1", { force: true });
    expect(fetchMock).toHaveBeenCalledTimes(2);

    // B (newer) succeeds first
    const itemB = mockItem("9002", "Цикл B (latest)");
    resolveB!(
      new Response(JSON.stringify(successBody(itemB)), {
        status: 200,
        headers: { "content-type": "application/json" },
      })
    );
    const resB = await pB;
    expect(resB.success).toBe(true);

    const cachedAfterB = getCachedSmartProcessItems("user-1");
    expect(cachedAfterB?.items[0].processItemId).toBe("9002");
    const timestampB = cachedAfterB?.timestamp;

    // A (older) succeeds last — must NOT overwrite B in the shared cache
    const itemA = mockItem("9001", "Цикл A (stale)");
    resolveA!(
      new Response(JSON.stringify(successBody(itemA)), {
        status: 200,
        headers: { "content-type": "application/json" },
      })
    );
    const resA = await pA;
    expect(resA.success).toBe(true); // A still resolves to its own caller

    const cached = getCachedSmartProcessItems("user-1");
    expect(cached?.items[0].processItemId).toBe("9002"); // B survives
    expect(cached?.items[0].title).toBe("Цикл B (latest)");
    expect(cached?.timestamp).toBe(timestampB); // timestamp still belongs to B
  });

  it("SP-RACE-2: principal switch prevents an old-principal completion from committing", async () => {
    let resolveA: ((res: Response) => void) | null = null;
    const promiseA = new Promise<Response>((resolve) => { resolveA = resolve; });
    fetchMock.mockReturnValueOnce(promiseA);

    const pA = fetchSmartProcessItemsWithDeduplication("user-A", { force: true });

    // Principal switches mid-flight → cache cleared, generations invalidated
    syncSmartProcessPrincipal("user-B");
    expect(getCachedSmartProcessItems("user-A")).toBeNull();

    const itemA = mockItem("9001", "Данные пользователя A");
    resolveA!(
      new Response(JSON.stringify(successBody(itemA)), {
        status: 200,
        headers: { "content-type": "application/json" },
      })
    );

    const resA = await pA;
    expect(resA.success).toBe(true); // A resolves to its caller...

    // ...but commits nothing: no cross-user leakage into user-B's cache.
    expect(getCachedSmartProcessItems("user-A")).toBeNull();
    expect(getCachedSmartProcessItems("user-B")).toBeNull();
  });

  it("SP-RACE-3: company-scoped requests never commit to (nor corrupt) the full-scope cache", async () => {
    const fullItem = mockItem("9001", "Полный скоуп");
    setCachedSmartProcessItems("user-1", {
      items: [fullItem],
      byDealId: { "505": [] },
      byCompanyId: { "10": [] },
      stageDirectoryAvailable: true,
    } as Omit<SmartProcessCacheSnapshot, "timestamp">);
    const before = getCachedSmartProcessItems("user-1");

    const scopedItem = mockItem("9003", "Скоуп одной компании");
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify(successBody(scopedItem)), {
        status: 200,
        headers: { "content-type": "application/json" },
      })
    );

    const res = await fetchSmartProcessItemsWithDeduplication("user-1", {
      companyId: "10",
    });
    expect(res.success).toBe(true); // scoped caller gets its own data
    if (res.success) {
      expect(res.items[0].processItemId).toBe("9003");
    }

    // Full-scope cache untouched: same snapshot object, same timestamp.
    const after = getCachedSmartProcessItems("user-1");
    expect(after).toBe(before);
  });

  it("SP-RACE-4: in-flight dedup preserved — concurrent full-scope loads share ONE request", async () => {
    let resolveFetch: ((res: Response) => void) | null = null;
    const pendingPromise = new Promise<Response>((resolve) => { resolveFetch = resolve; });
    fetchMock.mockReturnValue(pendingPromise);

    const p1 = fetchSmartProcessItemsWithDeduplication("user-1"); // dedup join of p2
    const p2 = fetchSmartProcessItemsWithDeduplication("user-1");
    expect(fetchMock).toHaveBeenCalledTimes(1); // ONE real request

    const item = mockItem("9001", "Единый снимок");
    resolveFetch!(
      new Response(JSON.stringify(successBody(item)), {
        status: 200,
        headers: { "content-type": "application/json" },
      })
    );

    const [r1, r2] = await Promise.all([p1, p2]);
    expect(r1).toBe(r2); // dedup share preserved
    expect(r1.success).toBe(true);
    expect(getCachedSmartProcessItems("user-1")?.items[0].processItemId).toBe("9001");
  });

  it("SP-RACE-5: force still performs a real full-scope network request", async () => {
    const itemA = mockItem("9001", "Снимок A");
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify(successBody(itemA)), { status: 200 })
    );
    await fetchSmartProcessItemsWithDeduplication("user-1");
    expect(getCachedSmartProcessItems("user-1")?.items[0].title).toBe("Снимок A");

    const itemB = mockItem("9002", "Снимок B");
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify(successBody(itemB)), { status: 200 })
    );
    const res = await fetchSmartProcessItemsWithDeduplication("user-1", { force: true });
    expect(fetchMock).toHaveBeenCalledTimes(2); // force bypasses dedup + cache
    expect(res.success).toBe(true);
    expect(getCachedSmartProcessItems("user-1")?.items[0].title).toBe("Снимок B");
  });
});
