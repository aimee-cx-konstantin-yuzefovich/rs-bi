"use client";

// src/components/dashboard/samples/use-smart-process-data.ts
// Client-side loader hook for the canonical Smart Process item views.
// Mirrors use-samples-data.ts semantics: in-memory session cache,
// in-flight deduplication, cold loading vs warm background refresh,
// truthful empty vs failed states, stale disclosure on failed refresh.
// Exactly ONE fetch owner per scope — concurrent consumers coalesce.

import { useCallback, useEffect, useRef, useState } from "react";
import { useSession } from "next-auth/react";
import type { SmartProcessItemView } from "@/lib/samples/smart-process-view";
import {
  getCachedSmartProcessItems,
  isSmartProcessCacheFresh,
  fetchSmartProcessItemsWithDeduplication,
  syncSmartProcessPrincipal,
  clearSmartProcessCache,
  type SmartProcessDataState,
} from "@/lib/samples/smart-process-client-cache";

export type { SmartProcessDataState };

export interface SmartProcessLoadState {
  items: SmartProcessItemView[];
  byDealId: Record<string, SmartProcessItemView[]>;
  byCompanyId: Record<string, SmartProcessItemView[]>;
  loading: boolean;
  refreshing: boolean;
  error: string | null;
  refreshError: string | null;
  dataState: SmartProcessDataState;
  loadedAt: number | null;
  isStale: boolean;
  stageDirectoryAvailable: boolean;
  reload: () => void;
}

export function useSmartProcessData(): SmartProcessLoadState {
  const { data: session, status } = useSession();
  const principal =
    status === "authenticated"
      ? session?.user?.id || session?.user?.email || session?.user?.name || "authenticated"
      : null;
  const [items, setItems] = useState<SmartProcessItemView[]>([]);
  const [byDealId, setByDealId] = useState<Record<string, SmartProcessItemView[]>>({});
  const [byCompanyId, setByCompanyId] = useState<Record<string, SmartProcessItemView[]>>({});
  const [loading, setLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [refreshError, setRefreshError] = useState<string | null>(null);
  const [loadedAt, setLoadedAt] = useState<number | null>(null);
  const [isStale, setIsStale] = useState<boolean>(false);
  const [stageDirectoryAvailable, setStageDirectoryAvailable] = useState<boolean>(true);
  const [dataState, setDataState] = useState<SmartProcessDataState>("loading");

  const [attempt, setAttempt] = useState<number>(0);
  const isMountedRef = useRef<boolean>(true);
  const previousPrincipalRef = useRef<string | null>(null);

  // Manual retry performs a REAL request (bypasses in-flight dedup).
  const reload = useCallback(() => {
    setAttempt((n) => n + 1);
  }, []);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    // No authenticated principal (unauthenticated, or an isolated test
    // environment without a SessionProvider): truthful empty state, no fetch.
    if (!principal) {
      if (status === "unauthenticated") {
        clearSmartProcessCache();
      }
      if (isMountedRef.current) {
        setItems([]);
        setByDealId({});
        setByCompanyId({});
        setLoading(false);
        setRefreshing(false);
        setError(null);
        setRefreshError(null);
      }
      return;
    }

    if (previousPrincipalRef.current && previousPrincipalRef.current !== principal) {
      syncSmartProcessPrincipal(principal);
      setItems([]);
      setByDealId({});
      setByCompanyId({});
    }
    previousPrincipalRef.current = principal;

    const cached = getCachedSmartProcessItems(principal);
    // Cache hit = stored snapshot exists. A successful authoritative response
    // with items: [] is a truthful empty snapshot (never a cold spinner loop).
    const hasCachedData = cached !== null;
    // ONE named freshness policy (smart-process-client-cache): a FRESH
    // complete snapshot is reused WITHOUT any fetch — mounting another
    // consumer must never duplicate full Smart Process pagination. An
    // EXPIRED snapshot renders immediately and refreshes in the background.
    const cacheIsFresh = isSmartProcessCacheFresh(principal);

    if (hasCachedData && cached) {
      setItems(cached.items);
      setByDealId(cached.byDealId);
      setByCompanyId(cached.byCompanyId);
      setStageDirectoryAvailable(cached.stageDirectoryAvailable);
      setLoadedAt(cached.timestamp);
      setIsStale(false);
      setDataState("ready");
      setLoading(false);
      setRefreshing(!cacheIsFresh);
      setError(null);
      setRefreshError(null);
    } else {
      setLoadedAt(null);
      setIsStale(false);
      setDataState("loading");
      setLoading(true);
      setRefreshing(false);
      setError(null);
      setRefreshError(null);
    }

    // Fresh complete cache + no explicit retry: reuse the snapshot, no fetch.
    if (hasCachedData && cacheIsFresh && attempt === 0) {
      return;
    }

    let isEffectActive = true;
    const force = attempt > 0;

    fetchSmartProcessItemsWithDeduplication(principal, { force })
      .then((result) => {
        if (!isEffectActive || !isMountedRef.current) return;

        if (result.success) {
          setItems(result.items);
          setByDealId(result.byDealId);
          setByCompanyId(result.byCompanyId);
          setStageDirectoryAvailable(result.stageDirectoryAvailable);
          setLoadedAt(result.timestamp);
          setIsStale(false);
          setDataState("ready");
          setLoading(false);
          setRefreshing(false);
          setError(null);
          setRefreshError(null);
        } else {
          // Failed refresh PRESERVES the previous complete snapshot (stale).
          if (hasCachedData) {
            setRefreshing(false);
            setRefreshError(result.error);
            setIsStale(true);
            setDataState("refresh_failed");
          } else {
            setLoading(false);
            setRefreshing(false);
            setError(result.error);
            setLoadedAt(null);
            setIsStale(false);
            setDataState("failed");
          }
        }
      })
      .catch((err) => {
        if (!isEffectActive || !isMountedRef.current) return;
        const msg = err instanceof Error ? err.message : "Ошибка загрузки";
        if (hasCachedData) {
          setRefreshing(false);
          setRefreshError(msg);
          setIsStale(true);
          setDataState("refresh_failed");
        } else {
          setLoading(false);
          setRefreshing(false);
          setError(msg);
          setLoadedAt(null);
          setIsStale(false);
          setDataState("failed");
        }
      });

    return () => {
      isEffectActive = false;
    };
  }, [status, principal, attempt]);

  return {
    items,
    byDealId,
    byCompanyId,
    loading,
    refreshing,
    error,
    refreshError,
    dataState,
    loadedAt,
    isStale,
    stageDirectoryAvailable,
    reload,
  };
}
