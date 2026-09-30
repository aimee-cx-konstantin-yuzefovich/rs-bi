"use client";

// src/app/samples/page.tsx
// Samples v1 — third first-class analytical section: Образцы.
// Grain: ONE company with sample activity = ONE primary registry row.
// Data comes from the authoritative /api/bitrix/samples endpoint
// (Bitrix Companies + Deals → SampleSummary), not from the deals store.

import { Suspense, useEffect, useMemo, useState } from "react";
import { useSession } from "next-auth/react";
import { useSearchParams } from "next/navigation";
import { useDashboardStore } from "@/store/dashboard-store";
import { AlertTriangle, RefreshCw, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SectionNav } from "@/components/dashboard/section-nav";
import { TerminalBrand } from "@/components/dashboard/terminal-brand";
import { ProductFooter } from "@/components/dashboard/footer";
import { CompanyPreview } from "@/components/dashboard/company-preview";
import { DealPreview } from "@/components/dashboard/deal-preview";
import { useSamplesData } from "@/components/dashboard/samples/use-samples-data";
import { SamplesKpiCards } from "@/components/dashboard/samples/samples-kpi-cards";
import {
  SamplesFilterBar,
  matchesPeriod,
  DEFAULT_SAMPLES_FILTERS,
  type SamplesFilters,
} from "@/components/dashboard/samples/samples-filters";
import { SamplesRegistry } from "@/components/dashboard/samples/samples-registry";
import { SamplePreview } from "@/components/dashboard/samples/sample-preview";
import { computeSampleKpis } from "@/lib/samples/aggregate";
import { exportSamplesToExcel } from "@/lib/export-utils";
import { isSentinelValue } from "@/lib/samples/normalize";
import { resolveResponsibleDisplay } from "@/lib/enrichment-coverage";
import { isCompanyId } from "@/lib/company-preview";
import { isDealId } from "@/lib/deal-preview";
import type { SampleSummary } from "@/lib/samples/types";

function SamplesContent() {
  const { data: session, status } = useSession();
  const rawSearchParams = useSearchParams();
  const { userNames, fetchUserNames, usersCoverage, isDemoMode, checkConfig } =
    useDashboardStore();

  const {
    samples,
    meta,
    orphanDealCount,
    loading,
    refreshing,
    error,
    refreshError,
    reload,
  } = useSamplesData();

  const [filters, setFilters] = useState<SamplesFilters>(DEFAULT_SAMPLES_FILTERS);
  const [showKpis, setShowKpis] = useState(true);
  const [demoDismissed, setDemoDismissed] = useState(false);
  const [errorDismissed, setErrorDismissed] = useState(false);
  const [refreshErrorDismissed, setRefreshErrorDismissed] = useState(false);
  const [orphanDismissed, setOrphanDismissed] = useState(false);
  const [selected, setSelected] = useState<SampleSummary | null>(null);
  const [companyPreviewId, setCompanyPreviewId] = useState<string | null>(null);
  const [dealPreviewId, setDealPreviewId] = useState<string | null>(null);
  // Company preselect is a hidden extra filter beyond the visible bar
  // (deep link /samples?company=<id> from Company/Deal Preview).
  const [companyPreselect, setCompanyPreselect] = useState<string | null>(null);

  useEffect(() => {
    if (status !== "authenticated") return;
    checkConfig();
    if (Object.keys(userNames).length === 0) fetchUserNames();
  }, [status]);

  // Deep link: /samples?company=<id> — filter registry to that company
  // once, on mount (cross-navigation from Company/Deal Preview).
  const [appliedUrlCompany, setAppliedUrlCompany] = useState(false);
  useEffect(() => {
    if (appliedUrlCompany) return;
    const companyParam = rawSearchParams.get("company");
    if (companyParam && isCompanyId(companyParam)) {
      setCompanyPreselect(companyParam);
    }
    setAppliedUrlCompany(true);
  }, [rawSearchParams, appliedUrlCompany]);

  const responsibleOptions = useMemo(() => {
    const entries = new Map<string, string>();
    for (const s of samples) {
      if (s.responsibleId) {
        entries.set(
          s.responsibleId,
          resolveResponsibleDisplay(s.responsibleId, userNames, usersCoverage)
        );
      }
    }
    return Array.from(entries.entries())
      .map(([value, label]) => ({ value, label }))
      .sort((a, b) => a.label.localeCompare(b.label, "ru"));
  }, [samples, userNames, usersCoverage]);

  const productFamilyOptions = useMemo(
    () =>
      Array.from(new Set(samples.flatMap((s) => s.productFamilies))).sort((a, b) =>
        a.localeCompare(b, "ru")
      ),
    [samples]
  );

  const gradeOptions = useMemo(
    () =>
      Array.from(new Set(samples.flatMap((s) => s.grades.map((g) => g.value)))).sort(
        (a, b) => a.localeCompare(b, "ru")
      ),
    [samples]
  );

  const industryOptions = useMemo(
    () =>
      Array.from(
        new Set(samples.map((s) => s.industry).filter((v): v is string => Boolean(v)))
      ).sort((a, b) => a.localeCompare(b, "ru")),
    [samples]
  );

  const statusOptions = useMemo(() => {
    const observed = new Set<string>();
    for (const s of samples) {
      for (const v of [...s.sampleIndicators, ...s.processStatuses]) {
        if (v && !isSentinelValue(v)) {
          observed.add(v.trim());
        }
      }
    }
    return Array.from(observed).sort((a, b) => a.localeCompare(b, "ru"));
  }, [samples]);

  const filtered = useMemo(() => {
    const query = companyPreselect
      ? "" // preselect works by exact ID match below
      : filters.companyQuery.trim().toLowerCase();

    return samples.filter((s) => {
      if (companyPreselect) {
        if (s.companyId !== companyPreselect) return false;
      } else if (query && !s.companyTitle.toLowerCase().includes(query)) {
        return false;
      }
      if (!matchesPeriod(s, filters)) return false;
      if (
        filters.responsibleId !== "all" &&
        s.responsibleId !== filters.responsibleId
      )
        return false;
      if (
        filters.productFamily !== "all" &&
        !s.productFamilies.includes(filters.productFamily)
      )
        return false;
      if (
        filters.grade !== "all" &&
        !s.grades.some((g) => g.value === filters.grade)
      )
        return false;
      if (filters.industry !== "all" && s.industry !== filters.industry)
        return false;
      if (
        filters.status !== "all" &&
        !s.sampleIndicators.includes(filters.status) &&
        !s.processStatuses.includes(filters.status)
      )
        return false;
      if (filters.result !== "all" && s.normalizedResult !== filters.result)
        return false;
      return true;
    });
  }, [samples, filters, companyPreselect]);

  // KPIs follow the FILTERED set (user decision) — company grain.
  const kpis = useMemo(() => computeSampleKpis(filtered), [filtered]);

  if (status !== "authenticated") return null;

  return (
    <div className="h-dvh flex flex-col bg-background overflow-hidden">
      <header className="z-30 header-gradient border-b border-white/10 shrink-0">
        <div className="flex items-center justify-between px-3 sm:px-5 h-12 gap-2">
          <div className="flex items-center gap-3 min-w-0">
            <TerminalBrand />

            {/* Сделки | Компании | Образцы */}
            <div className="hidden sm:block">
              <SectionNav variant="dark" />
            </div>
          </div>

          <div className="flex items-center gap-3">
            {refreshing && (
              <div className="flex items-center gap-1.5 text-xs text-white/70 animate-pulse">
                <RefreshCw className="h-3.5 w-3.5 animate-spin text-white/70" />
                <span>Обновление...</span>
              </div>
            )}
            <span className="hidden md:inline text-xs font-normal text-white/40">
              Образцы · аналитика испытаний
            </span>
          </div>
        </div>
      </header>

      <main className="flex-1 min-h-0 flex flex-col px-4 sm:px-6 py-3 gap-2 overflow-hidden">
        {(isDemoMode || (error && error.includes("not configured"))) && !demoDismissed && (
          <div className="flex items-center justify-between px-3 py-2 rounded-md bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 text-sm text-amber-800 dark:text-amber-300 shrink-0">
            <div className="flex items-center gap-2">
              <div className="h-1.5 w-1.5 rounded-full bg-amber-500 animate-pulse" />
              <span>Демо-режим: подключение к Bitrix24 не настроено – данные образцов недоступны.</span>
            </div>
            <button
              type="button"
              onClick={() => setDemoDismissed(true)}
              aria-label="Закрыть"
              title="Закрыть"
              className="text-amber-700/60 hover:text-amber-900 dark:text-amber-400/60 dark:hover:text-amber-200 p-0.5"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        )}

        {error && !error.includes("not configured") && !errorDismissed && (
          <div className="flex items-center justify-between px-3 py-2 rounded-md bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 text-sm text-red-800 dark:text-red-300 shrink-0">
            <div className="flex flex-wrap items-center gap-2">
              <span>{error}</span>
              <button
                type="button"
                onClick={reload}
                className="underline underline-offset-2 hover:no-underline font-medium"
              >
                Повторить
              </button>
            </div>
            <button
              type="button"
              onClick={() => setErrorDismissed(true)}
              aria-label="Закрыть"
              title="Закрыть"
              className="text-red-700/60 hover:text-red-900 dark:text-red-400/60 dark:hover:text-red-200 p-0.5"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        )}

        {refreshError && !refreshErrorDismissed && (
          <div className="flex items-center justify-between px-3 py-2 rounded-md bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 text-xs text-amber-800 dark:text-amber-300 shrink-0">
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400 shrink-0" />
              <span>Не удалось обновить данные: {refreshError}. Отображаются данные предыдущего сеанса.</span>
              <button
                type="button"
                onClick={reload}
                className="underline underline-offset-2 hover:no-underline font-medium ml-1"
              >
                Повторить
              </button>
            </div>
            <button
              type="button"
              onClick={() => setRefreshErrorDismissed(true)}
              aria-label="Закрыть"
              title="Закрыть"
              className="text-amber-700/60 hover:text-amber-900 dark:text-amber-400/60 dark:hover:text-amber-200 p-0.5"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        )}

        {orphanDealCount > 0 && !orphanDismissed && (
          <div className="flex items-center justify-between px-3 py-2 rounded-md bg-sky-50 dark:bg-sky-950/30 border border-sky-200 dark:border-sky-800 text-xs text-sky-800 dark:text-sky-300 shrink-0">
            <div>
              Примечание: {orphanDealCount} сделок с данными по образцам не привязаны ни к одной компании и не отображаются в реестре (зернистость – компания).
            </div>
            <button
              type="button"
              onClick={() => setOrphanDismissed(true)}
              aria-label="Закрыть"
              title="Закрыть"
              className="text-sky-700/60 hover:text-sky-900 dark:text-sky-400/60 dark:hover:text-sky-200 p-0.5"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        )}

        {showKpis && (
          <div className="shrink-0">
            <SamplesKpiCards kpis={kpis} loading={loading} />
          </div>
        )}

        {!loading && (
          <div className="shrink-0">
            <SamplesFilterBar
              filters={filters}
              onChange={(f) => {
                setFilters(f);
                // Manual company search cancels the URL preselect.
                if (companyPreselect) setCompanyPreselect(null);
              }}
              responsibleOptions={responsibleOptions}
              productFamilyOptions={productFamilyOptions}
              gradeOptions={gradeOptions}
              industryOptions={industryOptions}
              statusOptions={statusOptions}
              showKpis={showKpis}
              onToggleKpis={() => setShowKpis((v) => !v)}
              onExport={() =>
                exportSamplesToExcel({
                  summaries: filtered,
                  userNames,
                  usersCoverage,
                })
              }
              exportDisabled={filtered.length === 0}
              totalCount={filtered.length}
            />
          </div>
        )}

        {loading ? (
          <div className="flex-1 flex flex-col items-center justify-center py-20 gap-3">
            <div className="h-7 w-7 rounded-full border-2 border-primary border-t-transparent animate-spin" />
            <span className="text-xs text-muted-foreground">Загрузка данных по образцам...</span>
          </div>
        ) : (
          <SamplesRegistry summaries={filtered} onSelect={setSelected} />
        )}

        <p className="shrink-0 text-[10px] text-muted-foreground pt-1 pb-1">
          Зернистость реестра – компания: одна компания с активностью по образцам = одна
          строка. Несколько марок, дат и сделок сохраняются и видны в карточке.
          KPI считается по компаниям в текущем отборе и не является количеством физических
          образцов.
        </p>
      </main>
      <ProductFooter className="shrink-0" />

      {selected && (
        <SamplePreview
          summary={selected}
          onClose={() => setSelected(null)}
          onOpenCompanyPreview={(id) => {
            setSelected(null);
            setCompanyPreviewId(id);
          }}
          onOpenDealPreview={(id) => {
            setSelected(null);
            setDealPreviewId(id);
          }}
        />
      )}

      {companyPreviewId && (
        <CompanyPreview
          id={companyPreviewId}
          onClose={() => setCompanyPreviewId(null)}
          onOpenDealPreview={(id) => {
            setCompanyPreviewId(null);
            setDealPreviewId(id);
          }}
        />
      )}

      {dealPreviewId && isDealId(dealPreviewId) && (
        <DealPreview
          id={dealPreviewId}
          onClose={() => setDealPreviewId(null)}
          onOpenCompanyPreview={(id) => {
            setDealPreviewId(null);
            setCompanyPreviewId(id);
          }}
        />
      )}
    </div>
  );
}

export default function SamplesPage() {
  return (
    <Suspense fallback={null}>
      <SamplesContent />
    </Suspense>
  );
}
