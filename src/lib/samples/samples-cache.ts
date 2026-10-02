// src/lib/samples/samples-cache.ts
// ─────────────────────────────────────────────────────────────────────
// In-memory session cache and request deduplicator for Samples data.
//
// Invariants (Phase A):
// 1. Strictly in-memory: no localStorage, IndexedDB, DB, or persistent Zustand.
// 2. Auth principal isolation: scoped to authenticated user identity;
//    invalidated on logout or principal change; never shared across users.
// 3. In-flight request deduplication: concurrent loads for the same principal
//    share one active backend Promise.
// 4. Detached navigation: in-flight request continues even if hook unmounts,
//    populating the session cache upon success.
// 5. Atomic snapshot: only complete successful datasets are cached.
//    Refresh failure preserves previous complete snapshot.
// ─────────────────────────────────────────────────────────────────────

import type { SampleSummary, SamplesResponseMeta } from "./types";

export interface SamplesCacheSnapshot {
  samples: SampleSummary[];
  meta: SamplesResponseMeta | null;
  orphanDealCount: number;
  timestamp: number;
}

export interface SamplesFetchSuccess {
  success: true;
  samples: SampleSummary[];
  meta: SamplesResponseMeta | null;
  orphanDealCount: number;
  timestamp: number;
}

export interface SamplesFetchFailure {
  success: false;
  error: string;
  isDemoMode: boolean;
}

export type SamplesFetchResult = SamplesFetchSuccess | SamplesFetchFailure;

// Module-level in-memory state
let currentPrincipal: string | null = null;
let currentCache: SamplesCacheSnapshot | null = null;
let activeInFlightPromise: Promise<SamplesFetchResult> | null = null;
let activeInFlightPrincipal: string | null = null;
let activeInFlightRequestId: symbol | null = null;

export const LARGE_DATASET_CLIENT_TIMEOUT_MS = 180_000;
const CLIENT_FETCH_TIMEOUT_MS = LARGE_DATASET_CLIENT_TIMEOUT_MS;

/** Retrieves the current cached complete snapshot if the principal matches. */
export function getCachedSamples(principal: string): SamplesCacheSnapshot | null {
  if (!principal || principal !== currentPrincipal) return null;
  return currentCache;
}

/** Atomically updates the in-memory cache for the given principal. */
export function setCachedSamples(
  principal: string,
  data: {
    samples: SampleSummary[];
    meta: SamplesResponseMeta | null;
    orphanDealCount: number;
    timestamp?: number;
  }
): void {
  if (!principal) return;
  currentPrincipal = principal;
  currentCache = {
    samples: data.samples,
    meta: data.meta,
    orphanDealCount: data.orphanDealCount,
    timestamp: data.timestamp ?? Date.now(),
  };
}

/** Clears all in-memory cache and in-flight state (e.g. on logout or principal change). */
export function clearSamplesCache(): void {
  currentPrincipal = null;
  currentCache = null;
  activeInFlightPromise = null;
  activeInFlightPrincipal = null;
  activeInFlightRequestId = null;
}

/** Handles auth principal change. If principal changed, resets the cache. */
export function syncAuthPrincipal(principal: string | null): void {
  if (!principal) {
    clearSamplesCache();
    return;
  }
  if (currentPrincipal !== null && currentPrincipal !== principal) {
    clearSamplesCache();
  }
  currentPrincipal = principal;
}

/**
 * Performs a network fetch to POST /api/bitrix/samples with in-flight deduplication.
 * If a request is already running for the same principal and force is false,
 * reuses the active promise.
 *
 * This detached loader continues running even if React components unmount,
 * guaranteeing the response populates the cache for subsequent visits.
 */
export async function fetchSamplesWithDeduplication(
  principal: string,
  options?: { force?: boolean }
): Promise<SamplesFetchResult> {
  syncAuthPrincipal(principal);

  if (!options?.force && activeInFlightPromise && activeInFlightPrincipal === principal) {
    return activeInFlightPromise;
  }

  const requestId = Symbol("samples-request");
  activeInFlightPrincipal = principal;
  activeInFlightRequestId = requestId;

  const promise = (async (): Promise<SamplesFetchResult> => {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), CLIENT_FETCH_TIMEOUT_MS);

    try {
      const response = await fetch("/api/bitrix/samples", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "{}",
        signal: controller.signal,
        cache: "no-store",
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        const message =
          payload?.error ||
          (response.status === 401
            ? "Требуется авторизация"
            : "Не удалось загрузить данные по образцам. Попробуйте ещё раз.");
        return {
          success: false,
          error: message,
          isDemoMode: message.includes("not configured"),
        };
      }

      const data = await response.json();
      if (!data.success || !Array.isArray(data.samples)) {
        return {
          success: false,
          error: "Некорректный ответ сервера. Попробуйте ещё раз.",
          isDemoMode: false,
        };
      }

      const nowTs = Date.now();
      const result: SamplesFetchSuccess = {
        success: true,
        samples: data.samples as SampleSummary[],
        meta: (data.meta as SamplesResponseMeta) ?? null,
        orphanDealCount: Number(data.orphanDealCount ?? 0),
        timestamp: nowTs,
      };

      // Atomically store into cache only for matching principal
      if (currentPrincipal === principal) {
        setCachedSamples(principal, result);
      }

      return result;
    } catch (err) {
      const message =
        err instanceof Error && err.message.includes("not configured")
          ? err.message
          : "Не удалось загрузить данные по образцам. Попробуйте ещё раз.";
      return {
        success: false,
        error: message,
        isDemoMode: message.includes("not configured"),
      };
    } finally {
      clearTimeout(timeoutId);
      if (activeInFlightRequestId === requestId) {
        activeInFlightPromise = null;
        activeInFlightPrincipal = null;
        activeInFlightRequestId = null;
      }
    }
  })();

  activeInFlightPromise = promise;
  return promise;
}
