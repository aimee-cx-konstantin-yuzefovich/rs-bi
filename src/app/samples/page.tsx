"use client";

// src/app/samples/page.tsx
// Samples v1 — third first-class analytical section: Образцы.
// Grain: ONE company with sample activity = ONE primary registry row.
// Data comes from the authoritative /api/bitrix/samples endpoint
// (Bitrix Companies + Deals → SampleSummary), not from the deals store.

import { Suspense, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { useSearchParams } from "next/navigation";
import { useDashboardStore } from "@/store/dashboard-store";
import { BarChart3 } from "lucide-react";
import { SectionNav } from "@/components/dashboard/section-nav";
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
import { isCompanyId } from "@/lib/company-preview";
import { isDealId } from "@/lib/deal-preview";
import type { SampleSummary } from "@/lib/samples/types";

function SamplesContent() {
  const { data: session, status } = useSession();
  const rawSearchParams = useSearchParams();
  const { userNames, fetchUserNames, isDemoMode, checkConfig } =
    useDashboardStore();

  const { samples, meta, orphanDealCount, loading, error, reload } =
    useSamplesData();

  const [filters, setFilters] = useState<SamplesFilters>(DEFAULT_SAMPLES_FILTERS);
  const [selected, setSelected] = useState<SampleSummary | null>(null);
  const [companyPreviewId, setCompanyPreviewId] = useState<string | null>(null);
  const [dealPreviewId, setDealPreviewId] = useState<string | null>(null);

  useEffect(() => {
    if (status !== "authenticated") return;
    checkConfig();
    if (Object.keys(userNames).length === 0) fetchUserNames();
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rawSearchParams, appliedUrlCompany]);

  // Company preselect is a hidden extra filter beyond the visible bar.
  const [companyPreselect, setCompanyPreselect] = useState<string | null>(null);

  const responsibleOptions = useMemo(() => {
    const entries = new Map<string, string>();
    for (const s of samples) {
      if (s.responsibleId) {
        entries.set(
          s.responsibleId,
          s.responsibleName ?? userNames[s.responsibleId] ?? s.responsibleId
        );
      }
    }
    return Array.from(entries.entries())
      .map(([value, label]) => ({ value, label }))
      .sort((a, b) => a.label.localeCompare(b.label, "ru"));
  }, [samples, userNames]);

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

  const applicationOptions = useMemo(
    () =>
      Array.from(
        new Set(
          samples.map((s) => s.application).filter((v): v is string => Boolean(v))
        )
      ).sort((a, b) => a.localeCompare(b, "ru")),
    [samples]
  );

  const statusOptions = useMemo(() => {
    const observed = new Set<string>();
    for (const s of samples) {
      for (const v of [...s.sampleIndicators, ...s.processStatuses]) observed.add(v);
    }
    // Known labels from server metadata enrich the observed union.
    for (const fieldLabels of Object.values(meta?.statusLabels ?? {})) {
      for (const label of Object.values(fieldLabels)) {
        if (label && observed.size < 60) observed.add(label);
      }
    }
    return Array.from(observed).sort((a, b) => a.localeCompare(b, "ru"));
  }, [samples, meta]);

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
      if (filters.application !== "all" && s.application !== filters.application)
        return false;
      if (
        filters.status !== "all" &&
        !s.sampleIndicators.includes(filters.status) &&
        !s.processStatuses.includes(filters.status)
      )
        return false;
      if (filters.result !== "all" && s.normalizedResult !== filters.result)
        return false;
      if (filters.hasDeals === "yes" && s.relatedDeals.length === 0) return false;
      if (filters.hasDeals === "no" && s.relatedDeals.length > 0) return false;
      if (filters.quality !== "all" && s.sourceQuality !== filters.quality)
        return false;
      return true;
    });
  }, [samples, filters, companyPreselect]);

  // KPIs follow the FILTERED set (user decision) — company grain.
  const kpis = useMemo(() => computeSampleKpis(filtered), [filtered]);

  if (status !== "authenticated") return null;

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <header className="z-30 header-gradient border-b border-white/10">
        <div className="flex items-center justify-between px-3 sm:px-5 h-12 gap-2">
          <div className="flex items-center gap-3 min-w-0">
            <Link
              href="/"
              className="flex items-center gap-2.5 shrink-0 hover:opacity-80 transition-opacity cursor-pointer"
            >
              <BarChart3 className="h-5 w-5 text-white/80 shrink-0" />
              <span className="text-sm font-semibold tracking-wide text-white">
                RusSilica
              </span>
            </Link>

            {/* Сделки | Компании | Образцы */}
            <div className="hidden sm:block">
              <SectionNav variant="dark" />
            </div>
          </div>

          <span className="hidden md:inline text-xs font-normal text-white/40">
            Образцы · аналитика испытаний
          </span>
        </div>
      </header>

      <main className="flex-1 flex flex-col min-h-0 gap-3 px-4 sm:px-6 py-4 overflow-y-auto">
        {(isDemoMode || (error && error.includes("not configured"))) && (
          <div className="flex items-center gap-2 px-3 py-2 rounded-md bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 text-sm text-amber-800 dark:text-amber-300">
            <div className="h-1.5 w-1.5 rounded-full bg-amber-500 animate-pulse" />
            Демо-режим: подключение к Bitrix24 не настроено — данные образцов недоступны.
          </div>
        )}

        {error && !error.includes("not configured") && (
          <div className="flex flex-wrap items-center gap-2 px-3 py-2 rounded-md bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 text-sm text-red-800 dark:text-red-300">
            <span>{error}</span>
            <button
              type="button"
              onClick={reload}
              className="underline underline-offset-2 hover:no-underline"
            >
              Повторить
            </button>
          </div>
        )}

        {orphanDealCount > 0 && (
          <div className="px-3 py-2 rounded-md bg-sky-50 dark:bg-sky-950/30 border border-sky-200 dark:border-sky-800 text-xs text-sky-800 dark:text-sky-300">
            Примечание: {orphanDealCount} сделок с данными по образцам не привязаны ни к одной
            компании и не отображаются в реестре (зернистость — компания).
          </div>
        )}

        <SamplesKpiCards kpis={kpis} loading={loading} />

        {!loading && (
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
            applicationOptions={applicationOptions}
            statusOptions={statusOptions}
          />
        )}

        {loading ? (
          <div className="rounded-md border py-16 text-center text-sm text-muted-foreground">
            Загрузка данных по образцам из Bitrix24…
          </div>
        ) : (
          <SamplesRegistry summaries={filtered} onSelect={setSelected} />
        )}

        <p className="text-[10px] text-muted-foreground pb-2">
          Зернистость реестра — компания: одна компания с активностью по образцам = одна
          строка. Несколько марок, дат и сделок сохраняются и видны в карточке.
          KPI считается по компаниям в текущем отборе и не является количеством физических
          образцов.
        </p>
      </main>

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
