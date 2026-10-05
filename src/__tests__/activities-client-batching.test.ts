import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  chunkDealIdsForActivities,
  ACTIVITIES_CHUNK_MAX_IDS,
} from "@/lib/activities-request-chunks";
import {
  useDashboardStore,
  ACTIVITIES_ENRICHMENT_FETCH_TIMEOUT_MS,
  LARGE_DATASET_CLIENT_TIMEOUT_MS,
} from "@/store/dashboard-store";

const SERVER_MAX_IDS = 1000;
const SERVER_MAX_BODY = 10_000;

function makeIds(n: number, start = 1_000_000): string[] {
  return Array.from({ length: n }, (_, i) => String(start + i));
}

function setupDeals(ids: string[]) {
  useDashboardStore.setState({
    allDeals: ids.map((ID) => ({ ID })) as any,
    selectedColumns: ["ACTIVITY_LAST"],
    activitiesData: {},
    activitiesDataFetchedAt: {},
    activitiesRequestState: {},
    activitiesCoverage: null,
    isDemoMode: false,
  });
}

/** Mock of the real route contract: enforces body/ID limits. */
function contractFetch(opts: { failChunkIndex?: number[]; partialChunkIndex?: number[] } = {}) {
  const calls: string[][] = [];
  const bodies: number[] = [];
  const fn = vi.fn(async (_url: any, init: any) => {
    const raw = String(init.body);
    bodies.push(raw.length);
    const ids: string[] = JSON.parse(raw).dealIds;
    const idx = calls.length;
    calls.push(ids);
    if (raw.length > SERVER_MAX_BODY) return { ok: false, status: 413, json: async () => ({}) } as any;
    if (ids.length > SERVER_MAX_IDS) return { ok: false, status: 400, json: async () => ({}) } as any;
    if (opts.failChunkIndex?.includes(idx)) return { ok: false, status: 500, json: async () => ({}) } as any;
    const partial = opts.partialChunkIndex?.includes(idx);
    const fetched = partial ? ids.slice(0, ids.length - 1) : ids;
    return {
      ok: true,
      status: 200,
      json: async () => ({
        success: true,
        partial: !!partial,
        fetchedDealIds: fetched,
        activities: Object.fromEntries(fetched.map((id) => [id, { all: [], last: undefined, next: undefined }])),
      }),
    } as any;
  });
  return { fn, calls, bodies };
}

describe("chunkDealIdsForActivities", () => {
  it("1647 IDs: every chunk within server count and body limits, nothing lost", () => {
    const ids = makeIds(1647);
    const chunks = chunkDealIdsForActivities(ids);
    expect(chunks.length).toBeGreaterThan(1);
    for (const c of chunks) {
      expect(c.length).toBeLessThanOrEqual(ACTIVITIES_CHUNK_MAX_IDS);
      expect(c.length).toBeLessThanOrEqual(SERVER_MAX_IDS);
      expect(JSON.stringify({ dealIds: c }).length).toBeLessThan(SERVER_MAX_BODY);
    }
    expect(chunks.flat()).toEqual(ids);
  });

  it("long IDs are chunked by body size, not just count", () => {
    const ids = makeIds(900, 1_000_000_000_000_000);
    const chunks = chunkDealIdsForActivities(ids, { maxIds: 1000 });
    for (const c of chunks) {
      expect(JSON.stringify({ dealIds: c }).length).toBeLessThanOrEqual(8000);
    }
    expect(chunks.flat()).toEqual(ids);
  });

  it("dedups and drops non-numeric IDs; empty gives no chunks", () => {
    expect(chunkDealIdsForActivities(["1", "1", "x", " 2 "]).flat()).toEqual(["1", "2"]);
    expect(chunkDealIdsForActivities([])).toEqual([]);
  });
});

describe("fetchActivitiesData client batching", () => {
  beforeEach(() => vi.restoreAllMocks());
  afterEach(() => vi.restoreAllMocks());

  it("timeout constant uses the large-dataset timeout", () => {
    expect(ACTIVITIES_ENRICHMENT_FETCH_TIMEOUT_MS).toBe(LARGE_DATASET_CLIENT_TIMEOUT_MS);
  });

  it("1647 Deals: multiple bounded requests, COMPLETE, known-empty valid, no N+1", async () => {
    const ids = makeIds(1647);
    setupDeals(ids);
    const { fn, calls, bodies } = contractFetch();
    vi.spyOn(global, "fetch").mockImplementation(fn as any);

    await useDashboardStore.getState().fetchActivitiesData();

    const s = useDashboardStore.getState();
    expect(calls.length).toBeGreaterThan(1);
    expect(calls.length).toBeLessThan(20); // no per-deal N+1
    expect(Math.max(...bodies)).toBeLessThan(SERVER_MAX_BODY);
    expect(calls.flat().sort()).toEqual([...ids].sort());
    expect(s.activitiesCoverage?.status).toBe("COMPLETE");
    expect(Object.keys(s.activitiesDataFetchedAt).length).toBe(1647);
    expect(s.activitiesRequestState[ids[0]]).toBe("success");
    expect(s.activitiesData[ids[0]]).toEqual({ all: [], last: undefined, next: undefined });
    expect(s.activitiesDataLoading).toBe(false);
  });

  it("one failed chunk: PARTIAL, successful chunks preserved, retry requests only unresolved IDs", async () => {
    const ids = makeIds(1647);
    setupDeals(ids);
    const first = contractFetch({ failChunkIndex: [1] });
    vi.spyOn(global, "fetch").mockImplementation(first.fn as any);

    await useDashboardStore.getState().fetchActivitiesData();

    let s = useDashboardStore.getState();
    const failedChunk = first.calls[1];
    expect(s.activitiesCoverage?.status).toBe("PARTIAL");
    expect(Object.keys(s.activitiesDataFetchedAt).length).toBe(1647 - failedChunk.length);
    for (const id of failedChunk) {
      expect(s.activitiesDataFetchedAt[id]).toBeUndefined();
      expect(s.activitiesRequestState[id]).toBe("error");
    }
    expect(s.activitiesRequestState[first.calls[0][0]]).toBe("success");

    // Retry: only the unresolved IDs are requested; coverage recovers.
    vi.restoreAllMocks();
    const second = contractFetch();
    vi.spyOn(global, "fetch").mockImplementation(second.fn as any);
    await useDashboardStore.getState().fetchActivitiesData();

    s = useDashboardStore.getState();
    expect(second.calls.flat().sort()).toEqual([...failedChunk].sort());
    expect(s.activitiesCoverage?.status).toBe("COMPLETE");
    expect(Object.keys(s.activitiesDataFetchedAt).length).toBe(1647);
  });

  it("a chunk reporting partial never yields COMPLETE", async () => {
    const ids = makeIds(1200);
    setupDeals(ids);
    const { fn } = contractFetch({ partialChunkIndex: [0] });
    vi.spyOn(global, "fetch").mockImplementation(fn as any);
    await useDashboardStore.getState().fetchActivitiesData();
    const s = useDashboardStore.getState();
    expect(s.activitiesCoverage?.status).toBe("PARTIAL");
    expect(Object.keys(s.activitiesDataFetchedAt).length).toBe(1199);
  });

  it("small request: single call, COMPLETE", async () => {
    setupDeals(["5", "6"]);
    const { fn, calls } = contractFetch();
    vi.spyOn(global, "fetch").mockImplementation(fn as any);
    await useDashboardStore.getState().fetchActivitiesData();
    expect(calls).toEqual([["5", "6"]]);
    expect(useDashboardStore.getState().activitiesCoverage?.status).toBe("COMPLETE");
  });

  it("concurrent triggers coalesce into one run", async () => {
    setupDeals(makeIds(1647));
    const { fn, calls } = contractFetch();
    vi.spyOn(global, "fetch").mockImplementation(fn as any);
    const a = useDashboardStore.getState().fetchActivitiesData();
    const b = useDashboardStore.getState().fetchActivitiesData();
    await Promise.all([a, b]);
    expect(calls.flat().length).toBe(1647);
  });
});
