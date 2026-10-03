// src/lib/samples/smart-process-client-cache.ts
// ─────────────────────────────────────────────────────────────────────
// In-memory session cache and request deduplicator for the canonical
// Smart Process item views (client side).
//
// Invariants (mirrors samples-cache.ts):
// 1. Strictly in-memory: no localStorage, IndexedDB, DB, or persisted Zustand.
// 2. Auth principal isolation: scoped to the authenticated identity;
//    invalidated on logout or principal change; never shared across users.
// 3. In-flight deduplication: concurrent consumers (Deals table, Deal
//    Preview, Company Preview) share ONE active backend request — the Deals
//    table never issues one request per row and simultaneous loads never
//    duplicate full Smart Process pagination.
// 4. Detached navigation: an in-flight request continues even if a hook
//    unmounts, populating the session cache on success.
// 5. Atomic snapshot: only complete successful datasets are cached. A failed
//    refresh PRESERVES the previous complete snapshot (stale disclosure is
//    the caller's responsibility via the returned state).
// 6. Initial failure is explicit (no cached snapshot → failed state).
// ─────────────────────────────────────────────────────────────────────

import type { SmartProcessItemView } from "./smart-process-view";

export type SmartProcessDataState =
  | "loading"
  | "ready"
  | "refresh_failed"
  | "failed";

export interface SmartProcessCacheSnapshot {
  items: SmartProcessItemView[];
  byDealId: Record<string, SmartProcessItemView[]>;
  byCompanyId: Record<string, SmartProcessItemView[]>;
  stageDirectoryAvailable: boolean;
  timestamp: number;
}

export interface SmartProcessFetchSuccess {
  success: true;
  items: SmartProcessItemView[];
  byDealId: Record<string, SmartProcessItemView[]>;
  byCompanyId: Record<string, SmartProcessItemView[]>;
  stageDirectoryAvailable: boolean;
  total: number;
  timestamp: number;
}

export interface SmartProcessFetchFailure {
  success: false;
  error: string;
}

export type SmartProcessFetchResult =
  | SmartProcessFetchSuccess
  | SmartProcessFetchFailure;

// Module-level in-memory state
let currentPrincipal: string | null = null;
let currentCache: SmartProcessCacheSnapshot | null = null;
let activeInFlightPromise: Promise<SmartProcessFetchResult> | null = null;
let activeInFlightPrincipal: string | null = null;
let activeInFlightRequestId: symbol | null = null;

const CLIENT_FETCH_TIMEOUT_MS = 180_000;

/** Retrieves the current cached complete snapshot if the principal matches. */
export function getCachedSmartProcessItems(
  principal: string
): SmartProcessCacheSnapshot | null {
  if (!principal || principal !== currentPrincipal) return null;
  return currentCache;
}

/** Atomically updates the in-memory cache for the given principal. */
export function setCachedSmartProcessItems(
  principal: string,
  data: {
    items: SmartProcessItemView[];
    byDealId: Record<string, SmartProcessItemView[]>;
    byCompanyId: Record<string, SmartProcessItemView[]>;
    stageDirectoryAvailable: boolean;
    timestamp?: number;
  }
): void {
  if (!principal) return;
  currentPrincipal = principal;
  currentCache = {
    items: data.items,
    byDealId: data.byDealId,
    byCompanyId: data.byCompanyId,
    stageDirectoryAvailable: data.stageDirectoryAvailable,
    timestamp: data.timestamp ?? Date.now(),
  };
}

/** Clears all in-memory cache and in-flight state (logout / principal change). */
export function clearSmartProcessCache(): void {
  currentPrincipal = null;
  currentCache = null;
  activeInFlightPromise = null;
  activeInFlightPrincipal = null;
  activeInFlightRequestId = null;
}

/** Handles auth principal change; resets cache when the principal differs. */
export function syncSmartProcessPrincipal(principal: string | null): void {
  if (!principal) {
    clearSmartProcessCache();
    return;
  }
  if (currentPrincipal !== null && currentPrincipal !== principal) {
    clearSmartProcessCache();
  }
  currentPrincipal = principal;
}

/**
 * Performs a network fetch to POST /api/bitrix/smart-process-items with
 * in-flight deduplication. Concurrent consumers share one active request.
 */
export async function fetchSmartProcessItemsWithDeduplication(
  principal: string,
  options?: { force?: boolean; companyId?: string }
): Promise<SmartProcessFetchResult> {
  syncSmartProcessPrincipal(principal);

  // Single-company scopes are never deduplicated against the full snapshot.
  const isFullScope = !options?.companyId;
  if (
    isFullScope &&
    !options?.force &&
    activeInFlightPromise &&
    activeInFlightPrincipal === principal
  ) {
    return activeInFlightPromise;
  }

  const requestId = Symbol("smart-process-request");
  if (isFullScope) {
    activeInFlightPrincipal = principal;
    activeInFlightRequestId = requestId;
  }

  const promise = (async (): Promise<SmartProcessFetchResult> => {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), CLIENT_FETCH_TIMEOUT_MS);

    try {
      const response = await fetch("/api/bitrix/smart-process-items", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(options?.companyId ? { companyId: options.companyId } : {}),
        signal: controller.signal,
        cache: "no-store",
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        const message =
          payload?.error ||
          (response.status === 401
            ? "Требуется авторизация"
            : "Не удалось загрузить процессы тестирования. Попробуйте ещё раз.");
        return { success: false, error: message };
      }

      const data = await response.json();
      if (!data.success || !Array.isArray(data.items)) {
        return { success: false, error: "Некорректный ответ сервера. Попробуйте ещё раз." };
      }

      const nowTs = Date.now();
      const result: SmartProcessFetchSuccess = {
        success: true,
        items: data.items as SmartProcessItemView[],
        byDealId: (data.byDealId as Record<string, SmartProcessItemView[]>) ?? {},
        byCompanyId: (data.byCompanyId as Record<string, SmartProcessItemView[]>) ?? {},
        stageDirectoryAvailable: Boolean(data.stageDirectoryAvailable),
        total: Number(data.total ?? data.items.length),
        timestamp: nowTs,
      };

      // Atomically store into the full-scope cache only for matching principal.
      if (isFullScope && currentPrincipal === principal) {
        setCachedSmartProcessItems(principal, result);
      }

      return result;
    } catch {
      return {
        success: false,
        error: "Не удалось загрузить процессы тестирования. Попробуйте ещё раз.",
      };
    } finally {
      clearTimeout(timeoutId);
      if (isFullScope && activeInFlightRequestId === requestId) {
        activeInFlightPromise = null;
        activeInFlightPrincipal = null;
        activeInFlightRequestId = null;
      }
    }
  })();

  if (isFullScope) {
    activeInFlightPromise = promise;
  }
  return promise;
}
