"use client";

// src/components/commercial-funnel/use-commercial-funnel-data.ts
// Client-side loader for /api/bitrix/commercial-funnel with principal-isolated
// session cache, in-flight deduplication, and immediate warm cache rendering.

import { useCallback, useEffect, useRef, useState } from "react";
import { useSession } from "next-auth/react";
import type { CommercialCompany, CommercialDeal } from "@/lib/commercial-funnel/types";
import {
  clearCommercialFunnelCache,
  fetchCommercialFunnelWithDeduplication,
  getCachedCommercialFunnel,
  syncCommercialFunnelPrincipal,
} from "@/lib/commercial-funnel/commercial-funnel-cache";

export type AnalyticalDataState =
  | "loading"
  | "ready"
  | "partial"
  | "refresh_failed"
  | "failed";

export interface CommercialFunnelDataState {
  companies: CommercialCompany[];
  deals: CommercialDeal[];
  userNames: Record<string, string>;
  statusLabels: Record<string, Record<string, string>>;
  loading: boolean;
  refreshing?: boolean;
  error: string | null;
  refreshError?: string | null;
  isDemoMode: boolean;
  partial?: boolean;
  metadataPartial?: boolean;
  activityPartial?: boolean;
  activityWarning?: string;
  dataState: AnalyticalDataState;
  loadedAt: number | null;
  isStale: boolean;
  reload: () => void;
}

export function useCommercialFunnelData(): CommercialFunnelDataState {
  const { data: session, status } = useSession();
  const principal =
    status === "authenticated"
      ? session?.user?.id || session?.user?.email || session?.user?.name || "authenticated"
      : null;

  const [companies, setCompanies] = useState<CommercialCompany[]>([]);
  const [deals, setDeals] = useState<CommercialDeal[]>([]);
  const [userNames, setUserNames] = useState<Record<string, string>>({});
  const [statusLabels, setStatusLabels] = useState<Record<string, Record<string, string>>>({});
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [refreshError, setRefreshError] = useState<string | null>(null);
  const [isDemoMode, setIsDemoMode] = useState(false);
  const [partial, setPartial] = useState<boolean | undefined>(undefined);
  const [metadataPartial, setMetadataPartial] = useState<boolean>(false);
  const [activityPartial, setActivityPartial] = useState<boolean | undefined>(undefined);
  const [activityWarning, setActivityWarning] = useState<string | undefined>(undefined);
  const [dataState, setDataState] = useState<AnalyticalDataState>("loading");
  const [loadedAt, setLoadedAt] = useState<number | null>(null);
  const [isStale, setIsStale] = useState<boolean>(false);

  const [attempt, setAttempt] = useState(0);
  const isMountedRef = useRef(true);
  const previousPrincipalRef = useRef<string | null>(null);

  const reload = useCallback(() => setAttempt((n) => n + 1), []);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    if (status === "unauthenticated") {
      clearCommercialFunnelCache();
      if (isMountedRef.current) {
        setCompanies([]);
        setDeals([]);
        setUserNames({});
        setStatusLabels({});
        setLoading(false);
        setRefreshing(false);
        setError(null);
        setRefreshError(null);
        setLoadedAt(null);
        setIsStale(false);
        setDataState("loading");
        setMetadataPartial(false);
      }
      return;
    }

    if (status !== "authenticated" || !principal) return;

    if (previousPrincipalRef.current && previousPrincipalRef.current !== principal) {
      syncCommercialFunnelPrincipal(principal);
      setCompanies([]);
      setDeals([]);
      setUserNames({});
      setStatusLabels({});
      setLoadedAt(null);
      setIsStale(false);
      setDataState("loading");
      setMetadataPartial(false);
    }
    previousPrincipalRef.current = principal;

    const cached = getCachedCommercialFunnel(principal);
    const hasCachedData = cached !== null;

    if (hasCachedData && cached) {
      setCompanies(cached.companies);
      setDeals(cached.deals);
      setUserNames(cached.userNames);
      setStatusLabels(cached.statusLabels);
      setIsDemoMode(cached.isDemoMode);
      setPartial(cached.partial);
      setMetadataPartial(Boolean(cached.metadataPartial));
      setActivityPartial(cached.activityPartial);
      setActivityWarning(cached.activityWarning);
      setLoadedAt(cached.timestamp ?? null);
      setIsStale(false);
      setDataState(cached.partial || cached.metadataPartial ? "partial" : "ready");
      setLoading(false);
      setRefreshing(attempt > 0);
      setError(null);
      setRefreshError(null);
    } else {
      setLoadedAt(null);
      setIsStale(false);
      setDataState("loading");
      setMetadataPartial(false);
      setLoading(true);
      setRefreshing(false);
      setError(null);
      setRefreshError(null);
    }

    let isEffectActive = true;
    const force = attempt > 0;

    fetchCommercialFunnelWithDeduplication(principal, { force })
      .then((result) => {
        if (!isEffectActive || !isMountedRef.current) return;

        if (result.success) {
          const data = result.data;
          setCompanies(data.companies);
          setDeals(data.deals);
          setUserNames(data.userNames);
          setStatusLabels(data.statusLabels);
          setIsDemoMode(data.isDemoMode);
          setPartial(data.partial);
          setMetadataPartial(Boolean(data.metadataPartial));
          setActivityPartial(data.activityPartial);
          setActivityWarning(data.activityWarning);
          setLoadedAt(data.timestamp ?? Date.now());
          setIsStale(false);
          setDataState(data.partial || data.metadataPartial ? "partial" : "ready");
          setLoading(false);
          setRefreshing(false);
          setError(null);
          setRefreshError(null);
        } else {
          // Failed refresh preserves cached snapshot
          if (hasCachedData) {
            setRefreshing(false);
            setRefreshError(result.error);
            setIsStale(true);
            setDataState("refresh_failed");
            setIsDemoMode(result.isDemoMode);
          } else {
            setLoading(false);
            setRefreshing(false);
            setError(result.error);
            setLoadedAt(null);
            setIsStale(false);
            setDataState("failed");
            setIsDemoMode(result.isDemoMode);
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
    companies,
    deals,
    userNames,
    statusLabels,
    loading,
    refreshing,
    error,
    refreshError,
    isDemoMode,
    partial,
    metadataPartial,
    activityPartial,
    activityWarning,
    dataState,
    loadedAt,
    isStale,
    reload,
  };
}
