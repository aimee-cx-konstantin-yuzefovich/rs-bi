"use client";

// src/components/commercial-funnel/use-commercial-funnel-data.ts
// Client-side loader for /api/bitrix/commercial-funnel.

import { useCallback, useEffect, useRef, useState } from "react";
import { useSession } from "next-auth/react";
import type { CommercialCompany, CommercialDeal } from "@/lib/commercial-funnel/types";

export interface CommercialFunnelDataState {
  companies: CommercialCompany[];
  deals: CommercialDeal[];
  userNames: Record<string, string>;
  statusLabels: Record<string, Record<string, string>>;
  loading: boolean;
  error: string | null;
  isDemoMode: boolean;
  reload: () => void;
}

const FETCH_TIMEOUT_MS = 90_000;

export function useCommercialFunnelData(): CommercialFunnelDataState {
  const { status } = useSession();
  const [companies, setCompanies] = useState<CommercialCompany[]>([]);
  const [deals, setDeals] = useState<CommercialDeal[]>([]);
  const [userNames, setUserNames] = useState<Record<string, string>>({});
  const [statusLabels, setStatusLabels] = useState<Record<string, Record<string, string>>>({});
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
    const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

    setLoading(true);
    setError(null);

    (async () => {
      try {
        const response = await fetch("/api/bitrix/commercial-funnel", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
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
              : "Не удалось загрузить данные коммерческой воронки.");
          setError(message);
          setLoading(false);
          return;
        }

        const data = await response.json();
        if (current !== seq.current) return;

        if (!data.success || !Array.isArray(data.companies)) {
          setError("Некорректный ответ сервера. Попробуйте обновить страницу.");
          setLoading(false);
          return;
        }

        setCompanies(data.companies as CommercialCompany[]);
        setDeals(data.deals as CommercialDeal[]);
        setUserNames(data.userNames || {});
        setStatusLabels(data.statusLabels || {});
        setIsDemoMode(Boolean(data.isDemoMode));
        setLoading(false);
      } catch (err) {
        if (controller.signal.aborted || current !== seq.current) return;
        const message =
          err instanceof Error && err.message.includes("not configured")
            ? err.message
            : "Не удалось загрузить данные коммерческой воронки.";
        setError(message);
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

  return {
    companies,
    deals,
    userNames,
    statusLabels,
    loading,
    error,
    isDemoMode,
    reload,
  };
}
