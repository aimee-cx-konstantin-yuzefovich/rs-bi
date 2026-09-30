"use client";

// src/components/dashboard/samples/use-samples-data.ts
// Client-side loader for the authoritative /api/bitrix/samples dataset.
// Incorporates in-memory session caching, in-flight request deduplication,
// and separate cold loading vs warm background refresh states (Phase A).

import { useCallback, useEffect, useRef, useState } from "react";
import { useSession } from "next-auth/react";
import type { SampleSummary, SamplesResponseMeta } from "@/lib/samples/types";
import {
  getCachedSamples,
  fetchSamplesWithDeduplication,
  syncAuthPrincipal,
  clearSamplesCache,
} from "@/lib/samples/samples-cache";

export interface SamplesLoadState {
  samples: SampleSummary[];
  meta: SamplesResponseMeta | null;
  orphanDealCount: number;
  loading: boolean;
  refreshing: boolean;
  error: string | null;
  refreshError: string | null;
  isDemoMode: boolean;
  reload: () => void;
}

export function useSamplesData(): SamplesLoadState {
  const { data: session, status } = useSession();
  const principal =
    status === "authenticated"
      ? session?.user?.id || session?.user?.email || session?.user?.name || "authenticated"
      : null;

  const [samples, setSamples] = useState<SampleSummary[]>([]);
  const [meta, setMeta] = useState<SamplesResponseMeta | null>(null);
  const [orphanDealCount, setOrphanDealCount] = useState<number>(0);
  const [loading, setLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [refreshError, setRefreshError] = useState<string | null>(null);
  const [isDemoMode, setIsDemoMode] = useState<boolean>(false);

  const [attempt, setAttempt] = useState<number>(0);
  const isMountedRef = useRef<boolean>(true);
  const previousPrincipalRef = useRef<string | null>(null);

  // Manual reload triggers a fresh fetch bypassing in-flight deduplication if requested
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
    if (status === "unauthenticated") {
      clearSamplesCache();
      if (isMountedRef.current) {
        setSamples([]);
        setMeta(null);
        setOrphanDealCount(0);
        setLoading(false);
        setRefreshing(false);
        setError(null);
        setRefreshError(null);
      }
      return;
    }

    if (status !== "authenticated" || !principal) return;

    // Check if authenticated identity changed
    if (previousPrincipalRef.current && previousPrincipalRef.current !== principal) {
      syncAuthPrincipal(principal);
      setSamples([]);
      setMeta(null);
      setOrphanDealCount(0);
    }
    previousPrincipalRef.current = principal;

    const cached = getCachedSamples(principal);
    // Cache hit = a stored snapshot exists, regardless of sample count.
    // A fully successful authoritative response containing samples: []
    // is a valid complete snapshot and must render immediately with a
    // warm background refresh (never a cold spinner).
    const hasCachedData = cached !== null;

    if (hasCachedData && cached) {
      setSamples(cached.samples);
      setMeta(cached.meta);
      setOrphanDealCount(cached.orphanDealCount);
      setLoading(false);
      setRefreshing(true);
      setError(null);
      setRefreshError(null);
    } else {
      setLoading(true);
      setRefreshing(false);
      setError(null);
      setRefreshError(null);
    }

    let isEffectActive = true;
    const force = attempt > 0;

    fetchSamplesWithDeduplication(principal, { force })
      .then((result) => {
        if (!isEffectActive || !isMountedRef.current) return;

        if (result.success) {
          setSamples(result.samples);
          setMeta(result.meta);
          setOrphanDealCount(result.orphanDealCount);
          setLoading(false);
          setRefreshing(false);
          setError(null);
          setRefreshError(null);
          setIsDemoMode(false);
        } else {
          // Failed refresh preserves cached snapshot truthfully
          if (hasCachedData) {
            setRefreshing(false);
            setRefreshError(result.error);
            setIsDemoMode(result.isDemoMode);
          } else {
            setLoading(false);
            setRefreshing(false);
            setError(result.error);
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
        } else {
          setLoading(false);
          setRefreshing(false);
          setError(msg);
        }
      });

    return () => {
      isEffectActive = false;
    };
  }, [status, principal, attempt]);

  return {
    samples,
    meta,
    orphanDealCount,
    loading,
    refreshing,
    error,
    refreshError,
    isDemoMode,
    reload,
  };
}
