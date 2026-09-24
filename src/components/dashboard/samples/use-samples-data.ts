"use client";

// src/components/dashboard/samples/use-samples-data.ts
// Client-side loader for the authoritative /api/bitrix/samples dataset.
// Independent of the deals dashboard store by design (Samples v1 §9).

import { useCallback, useEffect, useRef, useState } from "react";
import { useSession } from "next-auth/react";
import type { SampleSummary, SamplesResponseMeta } from "@/lib/samples/types";

export interface SamplesLoadState {
  samples: SampleSummary[];
  meta: SamplesResponseMeta | null;
  orphanDealCount: number;
  loading: boolean;
  error: string | null;
  isDemoMode: boolean;
  reload: () => void;
}

const CLIENT_FETCH_TIMEOUT_MS = 90_000;

export function useSamplesData(): SamplesLoadState {
  const { status } = useSession();
  const [samples, setSamples] = useState<SampleSummary[]>([]);
  const [meta, setMeta] = useState<SamplesResponseMeta | null>(null);
  const [orphanDealCount, setOrphanDealCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isDemoMode, setIsDemoMode] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const seq = useRef(0);

  const reload = useCallback(() => setAttempt((n) => n + 1), []);

  useEffect(() => {
    if (status !== "authenticated") return;
    const current = ++seq.current;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), CLIENT_FETCH_TIMEOUT_MS);

    setLoading(true);
    setError(null);

    (async () => {
      try {
        const response = await fetch("/api/bitrix/samples", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: "{}",
          signal: controller.signal,
          cache: "no-store",
        });
        if (current !== seq.current) return;

        if (!response.ok) {
          const payload = await response.json().catch(() => null);
          const message =
            payload?.error ||
            (response.status === 401
              ? "Требуется авторизация"
              : "Не удалось загрузить данные по образцам. Попробуйте ещё раз.");
          setError(message);
          setLoading(false);
          return;
        }

        const data = await response.json();
        if (current !== seq.current) return;

        if (!data.success || !Array.isArray(data.samples)) {
          setError("Некорректный ответ сервера. Попробуйте ещё раз.");
          setLoading(false);
          return;
        }

        setSamples(data.samples as SampleSummary[]);
        setMeta((data.meta as SamplesResponseMeta) ?? null);
        setOrphanDealCount(Number(data.orphanDealCount ?? 0));
        setIsDemoMode(false);
        setLoading(false);
      } catch (err) {
        if (controller.signal.aborted || current !== seq.current) return;
        // Not-configured CRM → the API returns 502 with "not configured".
        const message =
          err instanceof Error && err.message.includes("not configured")
            ? err.message
            : "Не удалось загрузить данные по образцам. Попробуйте ещё раз.";
        setError(message);
        // Demo mode detection mirrors other pages: connection banner comes
        // from the shared checkConfig; here we only soften the error text.
        setIsDemoMode(message.includes("not configured"));
        setLoading(false);
      } finally {
        clearTimeout(timeoutId);
      }
    })();

    return () => {
      controller.abort();
      clearTimeout(timeoutId);
    };
  }, [status, attempt]);

  return { samples, meta, orphanDealCount, loading, error, isDemoMode, reload };
}
