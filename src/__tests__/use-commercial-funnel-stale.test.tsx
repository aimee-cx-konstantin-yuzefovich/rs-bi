// @vitest-environment jsdom
// src/__tests__/use-commercial-funnel-stale.test.tsx
// ─────────────────────────────────────────────────────────────────────
// Data-trust invariant C regression: the Commercial Funnel hook renders an
// EXPIRED-but-successful snapshot immediately and, when the background
// refresh fails, preserves that snapshot as refresh_failed / isStale with
// the ORIGINAL loadedAt — never downgraded to a hard cold `failed`.
//
// Uses the REAL hook (src/components/commercial-funnel/
// use-commercial-funnel-data.ts) and the REAL commercial-funnel-cache
// module with only the global fetch stubbed.
// ─────────────────────────────────────────────────────────────────────
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";

// ─── Authenticated session mock (hook consumes useSession) ───
vi.mock("next-auth/react", () => ({
  useSession: () => ({
    data: { user: { id: "principal-1", email: "admin@test" } },
    status: "authenticated",
  }),
}));

import { useCommercialFunnelData } from "@/components/commercial-funnel/use-commercial-funnel-data";
import {
  clearCommercialFunnelCache,
  setCachedCommercialFunnel,
  getCachedCommercialFunnel,
  COMMERCIAL_FUNNEL_CACHE_TTL_MS,
  type CommercialFunnelSnapshotData,
} from "@/lib/commercial-funnel/commercial-funnel-cache";
import type { CommercialCompany } from "@/lib/commercial-funnel/types";

const mkCompany = (title: string): CommercialCompany =>
  ({
    id: "1",
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
  }) as CommercialCompany;

const snapshotData = (title: string): CommercialFunnelSnapshotData => ({
  companies: [mkCompany(title)],
  deals: [],
  userNames: { "1": "Менеджер 1" },
  statusLabels: {},
  isDemoMode: false,
  totalCompanies: 1,
  totalDeals: 0,
});

/** Seed a SUCCESSFUL snapshot and age it past the cache TTL. */
function seedExpiredSuccessfulSnapshot(title: string): number {
  setCachedCommercialFunnel("principal-1", snapshotData(title));
  const cached = getCachedCommercialFunnel("principal-1", { allowStale: true });
  if (!cached) throw new Error("fixture: snapshot was not seeded");
  const originalLoadedAt = Date.now() - (COMMERCIAL_FUNNEL_CACHE_TTL_MS + 5_000);
  cached.timestamp = originalLoadedAt;
  return originalLoadedAt;
}

const failResponse = (status: number) =>
  ({
    ok: false,
    status,
    json: async () => ({ success: false, error: "CRM недоступен" }),
  }) as unknown as Response;

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn());
  clearCommercialFunnelCache();
});

afterEach(() => {
  clearCommercialFunnelCache();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("Commercial Funnel stale-snapshot contract (data-trust invariant C)", () => {
  it("STALE-1: expired successful snapshot renders immediately (no cold loading)", async () => {
    seedExpiredSuccessfulSnapshot("Снимок до истечения TTL");
    const fetchMock = fetch as ReturnType<typeof vi.fn>;
    // Hold the background refresh pending — rows must still render.
    fetchMock.mockReturnValue(new Promise<Response>(() => {}));

    const { result } = renderHook(() => useCommercialFunnelData());

    // Rendered immediately from the expired snapshot — not a cold spinner.
    expect(result.current.loading).toBe(false);
    expect(result.current.companies[0].title).toBe("Снимок до истечения TTL");
    expect(result.current.dataState).toBe("ready");
    // Background refresh disclosure while revalidation is in flight.
    expect(result.current.refreshing).toBe(true);
  });

  it("STALE-2: failed background refresh → refresh_failed with isStale", async () => {
    seedExpiredSuccessfulSnapshot("Снимок A");
    const fetchMock = fetch as ReturnType<typeof vi.fn>;
    fetchMock.mockResolvedValue(failResponse(502));

    const { result } = renderHook(() => useCommercialFunnelData());

    await waitFor(() => expect(result.current.dataState).toBe("refresh_failed"));
    expect(result.current.isStale).toBe(true);
    expect(result.current.refreshError).toBe("CRM недоступен");
    expect(result.current.error).toBeNull(); // refresh error exposed separately
  });

  it("STALE-3: old rows remain visible after the failed refresh", async () => {
    seedExpiredSuccessfulSnapshot("Снимок A");
    const fetchMock = fetch as ReturnType<typeof vi.fn>;
    fetchMock.mockResolvedValue(failResponse(502));

    const { result } = renderHook(() => useCommercialFunnelData());

    await waitFor(() => expect(result.current.dataState).toBe("refresh_failed"));
    expect(result.current.companies).toHaveLength(1);
    expect(result.current.companies[0].title).toBe("Снимок A");
  });

  it("STALE-4: original loadedAt remains unchanged after failed refresh", async () => {
    const originalLoadedAt = seedExpiredSuccessfulSnapshot("Снимок A");
    const fetchMock = fetch as ReturnType<typeof vi.fn>;
    fetchMock.mockResolvedValue(failResponse(502));

    const { result } = renderHook(() => useCommercialFunnelData());

    await waitFor(() => expect(result.current.dataState).toBe("refresh_failed"));
    expect(result.current.loadedAt).toBe(originalLoadedAt);
  });

  it("STALE-5: repeated failed refreshes keep the same snapshot and loadedAt", async () => {
    const originalLoadedAt = seedExpiredSuccessfulSnapshot("Снимок A");
    const fetchMock = fetch as ReturnType<typeof vi.fn>;
    fetchMock.mockResolvedValue(failResponse(502));

    const { result, rerender } = renderHook(() => useCommercialFunnelData());

    await waitFor(() => expect(result.current.dataState).toBe("refresh_failed"));
    expect(result.current.loadedAt).toBe(originalLoadedAt);

    // Second attempt (manual reload path): failure again must STILL keep
    // the very same successful snapshot and its original loadedAt.
    const snapshotBefore = getCachedCommercialFunnel("principal-1", { allowStale: true });
    expect(snapshotBefore).not.toBeNull();

    await rerender(); // attempt increments internally via reload; rerender exercises effect re-run
    await waitFor(() => expect(result.current.dataState).toBe("refresh_failed"));
    expect(result.current.companies[0].title).toBe("Снимок A");
    expect(result.current.loadedAt).toBe(originalLoadedAt);

    const snapshotAfter = getCachedCommercialFunnel("principal-1", { allowStale: true });
    expect(snapshotAfter?.timestamp).toBe(snapshotBefore?.timestamp);
  });

  it("STALE-6: cold failure (no snapshot at all) still → failed", async () => {
    const fetchMock = fetch as ReturnType<typeof vi.fn>;
    fetchMock.mockResolvedValue(failResponse(500));

    const { result } = renderHook(() => useCommercialFunnelData());

    await waitFor(() => expect(result.current.dataState).toBe("failed"));
    expect(result.current.error).toBe("CRM недоступен");
    expect(result.current.isStale).toBe(false);
    expect(result.current.loadedAt).toBeNull();
    expect(result.current.companies).toHaveLength(0);
  });

  it("STALE-7: successful refresh replaces the expired snapshot normally", async () => {
    seedExpiredSuccessfulSnapshot("Снимок A (старый)");
    const fetchMock = fetch as ReturnType<typeof vi.fn>;
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ success: true, ...snapshotData("Снимок B (свежий)") }),
    } as unknown as Response);

    const { result } = renderHook(() => useCommercialFunnelData());

    await waitFor(() => expect(result.current.companies[0].title).toBe("Снимок B (свежий)"));
    expect(result.current.dataState).toBe("ready");
    expect(result.current.isStale).toBe(false);
    expect(result.current.refreshError).toBeNull();
  });
});
