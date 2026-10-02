// src/lib/commercial-funnel/commercial-funnel-cache.ts
// ─────────────────────────────────────────────────────────────────────
// In-memory session cache and request deduplicator for Commercial Funnel.
//
// Invariants (Section 4.3 & 4.4):
// 1. Strictly in-memory: no localStorage, IndexedDB, DB, or persistent Zustand.
// 2. Auth principal isolation: scoped to authenticated user identity;
//    invalidated on logout or principal change; never shared across users.
// 3. TTL = 60 seconds: warm cache avoids duplicate backend requests while fresh.
// 4. In-flight request deduplication: concurrent loads for the same principal
//    share one active backend Promise.
// 5. Atomic snapshot: only complete successful datasets are cached.
//    Failed refresh preserves the previous complete snapshot.
// 6. Manual refresh (force: true) bypasses cache and hits the CRM backend.
// ─────────────────────────────────────────────────────────────────────

import type { CommercialCompany, CommercialDeal } from "./types";

export interface CommercialFunnelSnapshotData {
  companies: CommercialCompany[];
  deals: CommercialDeal[];
  userNames: Record<string, string>;
  statusLabels: Record<string, Record<string, string>>;
  isDemoMode: boolean;
  partial?: boolean;
  activityPartial?: boolean;
  activityWarning?: string;
  failedActivityDealIds?: string[];
  incompleteActivityDealIds?: string[];
  totalCompanies?: number;
  totalDeals?: number;
  smartProcess?: { qualityCounts?: Record<string, number> };
}

export interface CommercialFunnelSnapshot extends CommercialFunnelSnapshotData {
  timestamp: number;
}

export interface CommercialFunnelFetchSuccess {
  success: true;
  data: CommercialFunnelSnapshotData;
}

export interface CommercialFunnelFetchFailure {
  success: false;
  error: string;
  isDemoMode: boolean;
}

export type CommercialFunnelFetchResult =
  | CommercialFunnelFetchSuccess
  | CommercialFunnelFetchFailure;

export const COMMERCIAL_FUNNEL_CACHE_TTL_MS = 60_000;
export const LARGE_DATASET_CLIENT_TIMEOUT_MS = 180_000;
const CLIENT_FETCH_TIMEOUT_MS = LARGE_DATASET_CLIENT_TIMEOUT_MS;

// Module-level in-memory state
let currentPrincipal: string | null = null;
let currentCache: CommercialFunnelSnapshot | null = null;
let activeInFlightPromise: Promise<CommercialFunnelFetchResult> | null = null;
let activeInFlightPrincipal: string | null = null;
let activeInFlightRequestId: symbol | null = null;

/**
 * Retrieves the current cached complete snapshot for the principal.
 * By default returns null if the snapshot is older than the TTL.
 * Pass { allowStale: true } to access the last good snapshot (e.g. after a failed refresh).
 */
export function getCachedCommercialFunnel(
  principal: string,
  options?: { allowStale?: boolean }
): CommercialFunnelSnapshot | null {
  if (!principal || principal !== currentPrincipal || !currentCache) return null;
  if (!options?.allowStale && Date.now() - currentCache.timestamp >= COMMERCIAL_FUNNEL_CACHE_TTL_MS) {
    return null;
  }
  return currentCache;
}

/** Atomically updates the in-memory cache for the given principal. */
export function setCachedCommercialFunnel(
  principal: string,
  data: CommercialFunnelSnapshotData
): void {
  if (!principal) return;
  currentPrincipal = principal;
  currentCache = {
    ...data,
    timestamp: Date.now(),
  };
}

/** Clears all in-memory cache and in-flight state (e.g. on logout). */
export function clearCommercialFunnelCache(): void {
  currentPrincipal = null;
  currentCache = null;
  activeInFlightPromise = null;
  activeInFlightPrincipal = null;
  activeInFlightRequestId = null;
}

/** Handles auth principal change. If principal changed, resets the cache. */
export function syncCommercialFunnelPrincipal(principal: string | null): void {
  if (!principal) {
    clearCommercialFunnelCache();
    return;
  }
  if (currentPrincipal !== null && currentPrincipal !== principal) {
    clearCommercialFunnelCache();
  }
  currentPrincipal = principal;
}

/**
 * Performs a network fetch to POST /api/bitrix/commercial-funnel with
 * in-flight deduplication and 60s session caching.
 */
export async function fetchCommercialFunnelWithDeduplication(
  principal: string,
  options?: { force?: boolean }
): Promise<CommercialFunnelFetchResult> {
  syncCommercialFunnelPrincipal(principal);

  // Return fresh cache immediately if not forced
  if (!options?.force) {
    const cached = getCachedCommercialFunnel(principal);
    if (cached) {
      return {
        success: true,
        data: cached,
      };
    }
  }

  // Deduplicate in-flight requests for the same principal
  if (!options?.force && activeInFlightPromise && activeInFlightPrincipal === principal) {
    return activeInFlightPromise;
  }

  const requestId = Symbol("commercial-funnel-request");
  activeInFlightPrincipal = principal;
  activeInFlightRequestId = requestId;

  const promise = (async (): Promise<CommercialFunnelFetchResult> => {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), CLIENT_FETCH_TIMEOUT_MS);

    try {
      const response = await fetch("/api/bitrix/commercial-funnel", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
        cache: "no-store",
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        const message =
          payload?.error ||
          (response.status === 401
            ? "Требуется авторизация"
            : "Не удалось загрузить данные коммерческой воронки. Попробуйте ещё раз.");
        return {
          success: false,
          error: message,
          isDemoMode: message.includes("not configured"),
        };
      }

      const data = await response.json();
      if (!data.success || !Array.isArray(data.companies)) {
        return {
          success: false,
          error: "Некорректный ответ сервера. Попробуйте обновить страницу.",
          isDemoMode: false,
        };
      }

      const snapshotData: CommercialFunnelSnapshotData = {
        companies: data.companies as CommercialCompany[],
        deals: (data.deals || []) as CommercialDeal[],
        userNames: data.userNames || {},
        statusLabels: data.statusLabels || {},
        isDemoMode: Boolean(data.isDemoMode),
        partial: Boolean(data.partial),
        activityPartial: Boolean(data.activityPartial),
        activityWarning: data.activityWarning,
        failedActivityDealIds: data.failedActivityDealIds,
        incompleteActivityDealIds: data.incompleteActivityDealIds,
        totalCompanies: data.totalCompanies,
        totalDeals: data.totalDeals,
        smartProcess: data.smartProcess,
      };

      // Store in cache only if principal is still active
      if (currentPrincipal === principal) {
        setCachedCommercialFunnel(principal, snapshotData);
      }

      return {
        success: true,
        data: snapshotData,
      };
    } catch (err) {
      const message =
        err instanceof Error && err.message.includes("not configured")
          ? err.message
          : "Не удалось загрузить данные коммерческой воронки. Попробуйте ещё раз.";
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
