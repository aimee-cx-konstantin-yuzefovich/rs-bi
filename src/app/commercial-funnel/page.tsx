"use client";

// src/app/commercial-funnel/page.tsx
// Top-level Commercial Funnel section: Коммерческая воронка.
// Management system for the Commercial Director.
// 5 views: Обзор | Воронка | Сегменты | Менеджеры | Требуют внимания.
// ONE global analytical slice feeds every tab AND the Excel report.
// Entity registries (Образцы/Компании) live in their top-level Terminal
// sections; this section reaches them via drill-down / preview / deep links.

import { Suspense, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { useLoginRedirect } from "@/hooks/use-login-redirect";
import { useDashboardStore } from "@/store/dashboard-store";
import {
  AlertTriangle,
  Filter,
  LayoutDashboard,
  PieChart,
  TrendingUp,
  Users,
} from "lucide-react";
import { SectionNav } from "@/components/dashboard/section-nav";
import { TerminalBrand } from "@/components/dashboard/terminal-brand";
import { ProductFooter } from "@/components/dashboard/footer";
import { CompanyPreview } from "@/components/dashboard/company-preview";
import { DealPreview } from "@/components/dashboard/deal-preview";
import { isCompanyId } from "@/lib/company-preview";
import { isDealId } from "@/lib/deal-preview";
import { useCommercialFunnelData } from "@/components/commercial-funnel/use-commercial-funnel-data";
import { CommercialFilterBar } from "@/components/commercial-funnel/filter-bar";
import { CommercialOverviewTab } from "@/components/commercial-funnel/overview-tab";
import { CommercialFunnelTab } from "@/components/commercial-funnel/funnel-tab";
import { CommercialSegmentsTab } from "@/components/commercial-funnel/segments-tab";
import { CommercialManagersTab } from "@/components/commercial-funnel/managers-tab";
import { CommercialBottlenecksTab } from "@/components/commercial-funnel/bottlenecks-tab";
import { CommercialDrillDownSheet } from "@/components/commercial-funnel/drill-down-sheet";
import { DEFAULT_COMMERCIAL_FILTERS } from "@/lib/commercial-funnel/constants";
import {
  computeBottlenecks,
  computeManagerScorecard,
  computePeriodMetrics,
  filterCompaniesByDimensions,
} from "@/lib/commercial-funnel/engine";
import {
  computeActionPlan,
  computeFunnelView,
  computeManagementSignals,
  computeSegmentBreakdown,
} from "@/lib/commercial-funnel/analytics";
import { computePeriodBoundaries } from "@/lib/commercial-funnel/date-utils";
import { downloadCommercialFunnelExcel } from "@/lib/commercial-funnel/export-excel";
import { buildExcelExtraWarnings } from "@/lib/commercial-funnel/disclosure";
import type { CommercialFilters } from "@/lib/commercial-funnel/types";

export type ActiveTab = "overview" | "funnel" | "segments" | "managers" | "bottlenecks";

/** Final tab contract (T01): exactly these five, in this order. */
export const COMMERCIAL_FUNNEL_TABS: Array<{ id: ActiveTab; label: string }> = [
  { id: "overview", label: "Обзор" },
  { id: "funnel", label: "Воронка" },
  { id: "segments", label: "Сегменты" },
  { id: "managers", label: "Менеджеры" },
  { id: "bottlenecks", label: "Требуют внимания" },
];

const TAB_ICONS: Record<ActiveTab, React.ComponentType<{ className?: string }>> = {
  overview: LayoutDashboard,
  funnel: TrendingUp,
  segments: PieChart,
  managers: Users,
  bottlenecks: AlertTriangle,
};

function CommercialFunnelContent() {
  const { data: session, status } = useSession();
  useLoginRedirect(status, session?.error);

  // ─── Route-independent lookup bootstrap (§29) ───
  // Direct navigation to /commercial-funnel must provide the same responsible
  // names and field labels as opening a preview after visiting /. Previews
  // must never depend on accidentally warm Zustand state.
  const { userNames: storeUserNames, fetchUserNames, fields, fetchFields } = useDashboardStore();
  useEffect(() => {
    if (status !== "authenticated") return;
    if (Object.keys(storeUserNames).length === 0) fetchUserNames();
    if (fields.length === 0) fetchFields();
  }, [status, storeUserNames, fetchUserNames, fields, fetchFields]);

  const {
    companies,
    deals,
    userNames,
    loading,
    error,
    isDemoMode,
    activityPartial,
    activityWarning,
    reload,
  } = useCommercialFunnelData();

  const [activeTab, setActiveTab] = useState<ActiveTab>("overview");
  const [filters, setFilters] = useState<CommercialFilters>(DEFAULT_COMMERCIAL_FILTERS);

  // Previews
  const [companyPreviewId, setCompanyPreviewId] = useState<string | null>(null);
  const [dealPreviewId, setDealPreviewId] = useState<string | null>(null);

  // Drill-down Sheet
  const [drillDownOpen, setDrillDownOpen] = useState(false);
  const [drillDownTitle, setDrillDownTitle] = useState("");
  const [drillDownSubtitle, setDrillDownSubtitle] = useState("");
  const [drillDownCompanyIds, setDrillDownCompanyIds] = useState<string[]>([]);

  // Excel export state
  const [exportingExcel, setExportingExcel] = useState(false);

  // ─── ONE ANALYSIS CLOCK (Defect C fix) ───
  // analysisNow is the frozen analytical timestamp for the current view.
  // It refreshes ONLY when a fresh analytical view lands (initial load or
  // reload completion) — never per render, never ticking. UI boundaries,
  // bottleneck day-counts, action plan and the Excel export all consume the
  // SAME instant, so "what I see is what I export" holds even across a
  // calendar-day / quarter / midnight boundary.
  const [analysisNow, setAnalysisNow] = useState<Date>(() => new Date());
  useEffect(() => {
    if (!loading) setAnalysisNow(new Date());
  }, [loading]);

  // ─── ONE GLOBAL ANALYTICAL SLICE ───
  // Every tab and the Excel export consume the SAME filtered population and
  // boundaries. No tab may introduce hidden business filters.
  const boundaries = useMemo(
    () => computePeriodBoundaries(filters, analysisNow),
    [filters, analysisNow]
  );

  const filteredCompanies = useMemo(
    () => filterCompaniesByDimensions(companies, filters),
    [companies, filters]
  );

  const datedKpis = useMemo(
    () => computePeriodMetrics(filteredCompanies, boundaries),
    [filteredCompanies, boundaries]
  );

  const bottlenecks = useMemo(
    () => computeBottlenecks(filteredCompanies, analysisNow),
    [filteredCompanies, analysisNow]
  );

  const managerScorecard = useMemo(
    () => computeManagerScorecard(filteredCompanies, boundaries, bottlenecks, userNames),
    [filteredCompanies, boundaries, bottlenecks, userNames]
  );

  const funnelView = useMemo(
    () => computeFunnelView(filteredCompanies, boundaries),
    [filteredCompanies, boundaries]
  );

  // Segment matrices are ACTIVE-FILTER AWARE: when the global filter is
  // active for the SAME dimension, rows may contain only the selected value
  // (no contradiction with the user's slice). Cross-dimension rows stay
  // fully analytical. The SAME filters object feeds the Excel export.
  const segmentIndustry = useMemo(
    () => computeSegmentBreakdown(filteredCompanies, boundaries, "industry", filters),
    [filteredCompanies, boundaries, filters]
  );
  const segmentDirection = useMemo(
    () => computeSegmentBreakdown(filteredCompanies, boundaries, "direction", filters),
    [filteredCompanies, boundaries, filters]
  );
  const segmentProduct = useMemo(
    () => computeSegmentBreakdown(filteredCompanies, boundaries, "product", filters),
    [filteredCompanies, boundaries, filters]
  );

  const actionPlan = useMemo(
    () => computeActionPlan(filteredCompanies, analysisNow),
    [filteredCompanies, analysisNow]
  );

  const managementSignals = useMemo(
    () => computeManagementSignals(filteredCompanies, analysisNow),
    [filteredCompanies, analysisNow]
  );

  // HE contract: ONE shared disclosure rule for every surface whose values
  // depend on incomplete data (UI banners + Excel extraWarnings).
  const extraWarnings = useMemo(() => {
    const paymentKpi = datedKpis.find((k) => k.id === "payment_amount");
    return buildExcelExtraWarnings({
      activityPartial,
      activityWarning,
      financialQualitiesByCurrency: paymentKpi?.currencyBreakdownQuality?.current,
    });
  }, [datedKpis, activityPartial, activityWarning]);

  const handleOpenDrillDown = (title: string, subtitle: string, companyIds: string[]) => {
    setDrillDownTitle(title);
    setDrillDownSubtitle(subtitle);
    setDrillDownCompanyIds(companyIds);
    setDrillDownOpen(true);
  };

  const handleExportExcel = async () => {
    // Demo data must never become a detached management report (Option A).
    if (isDemoMode) return;
    setExportingExcel(true);
    try {
      await downloadCommercialFunnelExcel({
        companies,
        deals,
        filters,
        userNames,
        now: analysisNow, // ONE ANALYSIS CLOCK: same instant as the UI view
        extraWarnings,
      });
    } catch (err) {
      console.error("[Excel Export Error]", err);
    } finally {
      setExportingExcel(false);
    }
  };

  if (status !== "authenticated") return null;

  return (
    <div className="min-h-screen flex flex-col bg-background">
      {/* ─── TERMINAL HEADER ─── */}
      <header className="z-30 header-gradient border-b border-white/10 shrink-0">
        <div className="flex items-center justify-between px-3 sm:px-5 h-12 gap-2">
          <div className="flex items-center gap-3 min-w-0">
            <TerminalBrand />

            {/* Top-level Navigation */}
            <div className="hidden sm:block">
              <SectionNav variant="dark" />
            </div>
          </div>

          <span className="hidden md:inline text-xs font-normal text-white/40">
            Коммерческая воронка · управление портфелем
          </span>
        </div>
      </header>

      {/* ─── MAIN CONTENT CONTAINER ─── */}
      <main className="flex-1 flex flex-col px-4 sm:px-6 py-4 w-full space-y-4">
        {/* Demo mode banner */}
        {isDemoMode && (
          <div className="flex items-center gap-2 px-3 py-2 rounded-md bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800">
            <div className="h-1.5 w-1.5 rounded-full bg-amber-500 animate-pulse" />
            <span className="text-xs text-amber-700 dark:text-amber-400 font-medium">
              Демо-режим — прямой запрос к Bitrix24 недоступен, отображаются демонстрационные данные
            </span>
          </div>
        )}

        {/* Activity-partial disclosure: activities are the authoritative source
            for next actions and bottlenecks; a partial fetch must be visible. */}
        {activityPartial && (
          <div
            className="flex items-center gap-2 px-3 py-2 rounded-md bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-800"
            data-testid="activity-partial-banner"
          >
            <AlertTriangle className="h-3.5 w-3.5 text-rose-600 dark:text-rose-400 shrink-0" />
            <span className="text-xs text-rose-700 dark:text-rose-400 font-medium">
              {activityWarning || "Данные активностей загружены частично — показатели, зависящие от активностей, могут быть неполными"}
            </span>
          </div>
        )}

        {/* Global Filter Bar */}
        <CommercialFilterBar
          filters={filters}
          onFiltersChange={setFilters}
          companies={companies}
          deals={deals}
          userNames={userNames}
          onExportExcel={handleExportExcel}
          exportingExcel={exportingExcel}
          isDemoMode={isDemoMode}
          onRefresh={reload}
          refreshing={loading}
        />

        {/* ─── VIEW TABS ─── */}
        <div className="flex items-center border-b border-border/80 gap-1 overflow-x-auto" data-testid="funnel-tabs">
          {COMMERCIAL_FUNNEL_TABS.map(({ id, label }) => {
            const Icon = TAB_ICONS[id];
            const badge =
              id === "managers"
                ? managerScorecard.length
                : id === "bottlenecks"
                ? bottlenecks.length
                : id === "segments"
                ? filteredCompanies.length
                : undefined;
            return (
              <button
                key={id}
                type="button"
                onClick={() => setActiveTab(id)}
                data-testid={`funnel-tab-${id}`}
                className={`flex items-center gap-2 px-3.5 py-2 text-xs font-medium border-b-2 transition-colors whitespace-nowrap cursor-pointer ${
                  activeTab === id
                    ? "border-primary text-primary"
                    : "border-transparent text-muted-foreground hover:text-foreground hover:border-border"
                }`}
              >
                <Icon className="h-3.5 w-3.5" />
                {label}
                {badge !== undefined && badge > 0 && (
                  <span
                    className={`rounded-full px-1.5 py-0.2 text-[10px] ${
                      id === "bottlenecks" ? "bg-rose-500 text-white font-semibold" : "bg-muted"
                    }`}
                  >
                    {badge}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* Error message */}
        {error && (
          <div className="p-4 rounded-md bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-800 text-rose-700 dark:text-rose-400 text-xs">
            {error}
          </div>
        )}

        {/* Tab views */}
        {loading ? (
          <div className="py-20 flex flex-col items-center justify-center gap-3">
            <div className="h-7 w-7 rounded-full border-2 border-primary border-t-transparent animate-spin" />
            <span className="text-xs text-muted-foreground">Загрузка данных коммерческой воронки...</span>
          </div>
        ) : (
          <>
            {activeTab === "overview" && (
              <CommercialOverviewTab
                datedKpis={datedKpis}
                funnelView={funnelView}
                boundaries={boundaries}
                managementSignals={managementSignals}
                onOpenDrillDown={handleOpenDrillDown}
              />
            )}

            {activeTab === "funnel" && (
              <CommercialFunnelTab
                funnelView={funnelView}
                boundaries={boundaries}
                onOpenDrillDown={handleOpenDrillDown}
              />
            )}

            {activeTab === "segments" && (
              <CommercialSegmentsTab
                industryBreakdown={segmentIndustry}
                directionBreakdown={segmentDirection}
                productBreakdown={segmentProduct}
                onOpenDrillDown={handleOpenDrillDown}
              />
            )}

            {activeTab === "managers" && (
              <CommercialManagersTab
                scorecard={managerScorecard}
                onOpenDrillDown={handleOpenDrillDown}
              />
            )}

            {activeTab === "bottlenecks" && (
              <CommercialBottlenecksTab
                actionPlan={actionPlan}
                activityPartial={Boolean(activityPartial)}
                onSelectCompany={setCompanyPreviewId}
                onSelectDeal={setDealPreviewId}
                onOpenDrillDown={handleOpenDrillDown}
              />
            )}
          </>
        )}
      </main>
      <ProductFooter />

      {/* ─── DRILL-DOWN SHEET ─── */}
      <CommercialDrillDownSheet
        open={drillDownOpen}
        onOpenChange={setDrillDownOpen}
        title={drillDownTitle}
        subtitle={drillDownSubtitle}
        companyIds={drillDownCompanyIds}
        allCompanies={companies}
        onSelectCompany={(id) => {
          setDrillDownOpen(false);
          setCompanyPreviewId(id);
        }}
      />

      {/* ─── SHARED ENTITY PREVIEWS ─── */}
      {companyPreviewId && isCompanyId(companyPreviewId) && (
        <CompanyPreview
          id={companyPreviewId}
          onClose={() => setCompanyPreviewId(null)}
          onOpenDealPreview={(dealId) => {
            setCompanyPreviewId(null);
            setDealPreviewId(dealId);
          }}
        />
      )}

      {dealPreviewId && isDealId(dealPreviewId) && (
        <DealPreview
          id={dealPreviewId}
          onClose={() => setDealPreviewId(null)}
          onOpenCompanyPreview={(compId) => {
            setDealPreviewId(null);
            setCompanyPreviewId(compId);
          }}
        />
      )}
    </div>
  );
}

export default function CommercialFunnelPage() {
  return (
    <Suspense fallback={null}>
      <CommercialFunnelContent />
    </Suspense>
  );
}
