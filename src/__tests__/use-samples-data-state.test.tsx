// @vitest-environment jsdom
// src/__tests__/use-samples-data-state.test.tsx
// ─────────────────────────────────────────────────────────────────────
// PROBE I — SAMPLES CLIENT STATE (deterministic hook regression harness).
//
// Proves, using the REAL useSamplesData hook and the REAL samples-cache
// module (with only the global fetch stubbed), that a successful
// production-shaped response transitions the client state machine to:
//
//   loading=false, error=null, samples.length>0 (when summaries exist),
//   dataState consistent with success, isStale=false on initial success
//
// and that a failure without a cached snapshot transitions to
// dataState="failed" with a non-null error. No production refactoring:
// the hook and the cache are consumed exactly as shipped.
// ─────────────────────────────────────────────────────────────────────
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";
import type { SampleSummary } from "@/lib/samples/types";

// ─── Authenticated session mock (hook consumes useSession) ───
vi.mock("next-auth/react", () => ({
  useSession: () => ({
    data: { user: { id: "principal-1", email: "admin@test" } },
    status: "authenticated",
  }),
}));

import { useSamplesData } from "@/components/dashboard/samples/use-samples-data";
import { clearSamplesCache } from "@/lib/samples/samples-cache";

const mkSummary = (companyId: string): SampleSummary => ({
  companyId,
  companyTitle: `Компания ${companyId}`,
  productFamilies: ["Гель"],
  grades: [],
  quantities: [],
  sentDates: ["2026-10-01"],
  sampleIndicators: [],
  processStatuses: [],
  normalizedResult: "pending",
  relatedDeals: [],
  sourceQuality: "structured",
  dataIssues: [],
});

/** The EXACT shape POST /api/bitrix/samples returns on success. */
function productionShapedPayload(summaryCount: number) {
  const samples = Array.from({ length: summaryCount }, (_, i) => mkSummary(String(i + 1)));
  return {
    success: true,
    samples,
    total: samples.length,
    orphanDealCount: 0,
    metadataPartial: false,
    smartProcess: {
      qualityCounts: {
        orphanSmartProcessItemCount: 0,
        relationConflictCount: 0,
        sentStageWithoutDateCount: 0,
        multipleActiveCount: 0,
        stageResultConflictCount: 0,
      },
    },
    meta: { statusLabels: {} },
    issueLabels: {},
  };
}

const okResponse = (payload: unknown) =>
  ({
    ok: true,
    status: 200,
    json: async () => payload,
  }) as unknown as Response;

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn());
  clearSamplesCache();
});

afterEach(() => {
  clearSamplesCache();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("PROBE I — useSamplesData client state machine", () => {
  it("successful production-shaped response with summaries → READY", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      okResponse(productionShapedPayload(2))
    );

    const { result } = renderHook(() => useSamplesData());

    // Initial cold state: loading=true, dataState="loading".
    expect(result.current.loading).toBe(true);
    expect(result.current.dataState).toBe("loading");

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.error).toBeNull();
    expect(result.current.samples.length).toBe(2);
    expect(result.current.dataState).toBe("ready");
    expect(result.current.isStale).toBe(false);
    expect(result.current.metadataPartial).toBe(false);
    expect(result.current.loadedAt).not.toBeNull();
    expect(result.current.refreshing).toBe(false);
    expect(result.current.isDemoMode).toBe(false);
  });

  it("successful production-shaped EMPTY dataset (samples: []) → READY with zero rows (not failure)", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      okResponse(productionShapedPayload(0))
    );

    const { result } = renderHook(() => useSamplesData());
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.error).toBeNull();
    expect(result.current.samples).toEqual([]);
    expect(result.current.dataState).toBe("ready");
    expect(result.current.isStale).toBe(false);
  });

  it("partial metadata success → dataState 'partial', metadataPartial disclosed", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      okResponse({ ...productionShapedPayload(1), metadataPartial: true })
    );

    const { result } = renderHook(() => useSamplesData());
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.error).toBeNull();
    expect(result.current.samples.length).toBe(1);
    expect(result.current.dataState).toBe("partial");
    expect(result.current.metadataPartial).toBe(true);
    expect(result.current.isStale).toBe(false);
  });

  it("HTTP failure without cached snapshot → ERROR (failed state, non-null error)", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: false,
      status: 502,
      json: async () => ({ success: false, error: "Не удалось загрузить данные по образцам. Попробуйте ещё раз." }),
    } as unknown as Response);

    const { result } = renderHook(() => useSamplesData());
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.error).not.toBeNull();
    expect(result.current.samples).toEqual([]);
    expect(result.current.dataState).toBe("failed");
    expect(result.current.isStale).toBe(false);
  });

  it("non-ok response with contract-invalid success payload → ERROR via the shared contract (no parse bypass)", async () => {
    // Adversarial: HTTP 200 but success:false — must land in the failed
    // state through the SAME shared validator, never a side channel.
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      okResponse({ success: false, error: "x" })
    );

    const { result } = renderHook(() => useSamplesData());
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.error).not.toBeNull();
    expect(result.current.dataState).toBe("failed");
  });

  it("failed refresh after prior success preserves snapshot (stale disclosure, isStale=true)", async () => {
    const fetchMock = fetch as ReturnType<typeof vi.fn>;
    fetchMock.mockResolvedValueOnce(okResponse(productionShapedPayload(1)));

    const { result, rerender } = renderHook(() => useSamplesData());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.dataState).toBe("ready");
    const firstLoadedAt = result.current.loadedAt;

    // Warm snapshot exists → subsequent mount refreshes in background.
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 502,
      json: async () => ({ success: false }),
    } as unknown as Response);

    act(() => {
      result.current.reload();
    });
    rerender();

    await waitFor(() => expect(result.current.dataState).toBe("refresh_failed"));

    // Snapshot preserved truthfully; stale disclosure visible.
    expect(result.current.samples.length).toBe(1);
    expect(result.current.refreshError).not.toBeNull();
    expect(result.current.isStale).toBe(true);
    expect(result.current.loadedAt).toBe(firstLoadedAt);
  });
});
