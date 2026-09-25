"use client";

// src/app/commercial-funnel/page.tsx
// Top-level Commercial Funnel section: Коммерческая воронка.
// 5 views: Обзор | Образцы | Менеджеры | Компании | Требуют внимания.
// Single source of truth analytics, exact drill-down, 5-sheet Excel report.

import { Suspense, useMemo, useState } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { useLoginRedirect } from "@/hooks/use-login-redirect";
import {
  AlertTriangle,
  BarChart3,
  Building2,
  Calendar,
  FlaskConical,
  LayoutDashboard,
  Users,
} from "lucide-react";
import { SectionNav } from "@/components/dashboard/section-nav";
import { ProductFooter } from "@/components/dashboard/footer";
import { CompanyPreview } from "@/components/dashboard/company-preview";
import { DealPreview } from "@/components/dashboard/deal-preview";
import { isCompanyId } from "@/lib/company-preview";
import { isDealId } from "@/lib/deal-preview";
import { useCommercialFunnelData } from "@/components/commercial-funnel/use-commercial-funnel-data";
import { CommercialFilterBar } from "@/components/commercial-funnel/filter-bar";
import { CommercialOverviewTab } from "@/components/commercial-funnel/overview-tab";
import { CommercialSamplesTab } from "@/components/commercial-funnel/samples-tab";
import { CommercialManagersTab } from "@/components/commercial-funnel/managers-tab";
import { CommercialCompaniesTab } from "@/components/commercial-funnel/companies-tab";
import { CommercialBottlenecksTab } from "@/components/commercial-funnel/bottlenecks-tab";
import { CommercialDrillDownSheet } from "@/components/commercial-funnel/drill-down-sheet";
import { DEFAULT_COMMERCIAL_FILTERS } from "@/lib/commercial-funnel/constants";
import {
  buildSampleRegister,
  computeBottlenecks,
  computeManagerScorecard,
  computePeriodMetrics,
  computeWipMetrics,
  filterCompaniesByDimensions,
} from "@/lib/commercial-funnel/engine";
import { computePeriodBoundaries } from "@/lib/commercial-funnel/date-utils";
import { downloadCommercialFunnelExcel } from "@/lib/commercial-funnel/export-excel";
import type { CommercialFilters } from "@/lib/commercial-funnel/types";

type ActiveTab = "overview" | "samples" | "managers" | "companies" | "bottlenecks";

function CommercialFunnelContent() {
  const { data: session, status } = useSession();
  useLoginRedirect(status, session?.error);

  const {
    companies,
    deals,
    userNames,
    loading,
    error,
    isDemoMode,
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

  // Analytics engine computations
  const boundaries = useMemo(
    () => computePeriodBoundaries(filters),
    [filters]
  );

  const filteredCompanies = useMemo(
    () => filterCompaniesByDimensions(companies, filters),
    [companies, filters]
  );

  const datedKpis = useMemo(
    () => computePeriodMetrics(filteredCompanies, boundaries),
    [filteredCompanies, boundaries]
  );

  const wipKpis = useMemo(
    () => computeWipMetrics(filteredCompanies),
    [filteredCompanies]
  );

  const bottlenecks = useMemo(
    () => computeBottlenecks(filteredCompanies),
    [filteredCompanies]
  );

  const managerScorecard = useMemo(
    () => computeManagerScorecard(filteredCompanies, boundaries, bottlenecks, userNames),
    [filteredCompanies, boundaries, bottlenecks, userNames]
  );

  const sampleRegister = useMemo(
    () => buildSampleRegister(filteredCompanies),
    [filteredCompanies]
  );

  const handleOpenDrillDown = (title: string, subtitle: string, companyIds: string[]) => {
    setDrillDownTitle(title);
    setDrillDownSubtitle(subtitle);
    setDrillDownCompanyIds(companyIds);
    setDrillDownOpen(true);
  };

  const handleExportExcel = async () => {
    setExportingExcel(true);
    try {
      await downloadCommercialFunnelExcel({
        companies,
        deals,
        filters,
        userNames,
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
            <Link
              href="/"
              className="flex items-center gap-2.5 shrink-0 hover:opacity-80 transition-opacity cursor-pointer"
            >
              <BarChart3 className="h-5 w-5 text-white/80 shrink-0" />
              <span className="text-sm font-semibold tracking-wide text-white">RusSilica</span>
            </Link>

            {/* Top-level Navigation */}
            <div className="hidden sm:block">
              <SectionNav variant="dark" />
            </div>
          </div>

          <span className="hidden md:inline text-xs font-normal text-white/40">
            Коммерческая воронка · аналитика активности
          </span>
        </div>
      </header>

      {/* ─── MAIN CONTENT CONTAINER ─── */}
      <main className="flex-1 flex flex-col p-4 sm:p-6 max-w-7xl w-full mx-auto space-y-4">
        {/* Demo mode banner */}
        {isDemoMode && (
          <div className="flex items-center gap-2 px-3 py-2 rounded-md bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800">
            <div className="h-1.5 w-1.5 rounded-full bg-amber-500 animate-pulse" />
            <span className="text-xs text-amber-700 dark:text-amber-400 font-medium">
              Демо-режим — прямой запрос к Bitrix24 недоступен, отображаются демонстрационные данные
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
          onRefresh={reload}
          refreshing={loading}
        />

        {/* ─── VIEW TABS ─── */}
        <div className="flex items-center border-b border-border/80 gap-1 overflow-x-auto">
          <button
            type="button"
            onClick={() => setActiveTab("overview")}
            className={`flex items-center gap-2 px-3.5 py-2 text-xs font-medium border-b-2 transition-colors whitespace-nowrap cursor-pointer ${
              activeTab === "overview"
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground hover:border-border"
            }`}
          >
            <LayoutDashboard className="h-3.5 w-3.5" />
            Обзор
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("samples")}
            className={`flex items-center gap-2 px-3.5 py-2 text-xs font-medium border-b-2 transition-colors whitespace-nowrap cursor-pointer ${
              activeTab === "samples"
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground hover:border-border"
            }`}
          >
            <FlaskConical className="h-3.5 w-3.5" />
            Образцы
            <span className="rounded-full bg-muted px-1.5 py-0.2 text-[10px]">
              {sampleRegister.length}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("managers")}
            className={`flex items-center gap-2 px-3.5 py-2 text-xs font-medium border-b-2 transition-colors whitespace-nowrap cursor-pointer ${
              activeTab === "managers"
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground hover:border-border"
            }`}
          >
            <Users className="h-3.5 w-3.5" />
            Менеджеры
            <span className="rounded-full bg-muted px-1.5 py-0.2 text-[10px]">
              {managerScorecard.length}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("companies")}
            className={`flex items-center gap-2 px-3.5 py-2 text-xs font-medium border-b-2 transition-colors whitespace-nowrap cursor-pointer ${
              activeTab === "companies"
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground hover:border-border"
            }`}
          >
            <Building2 className="h-3.5 w-3.5" />
            Компании
            <span className="rounded-full bg-muted px-1.5 py-0.2 text-[10px]">
              {filteredCompanies.length}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("bottlenecks")}
            className={`flex items-center gap-2 px-3.5 py-2 text-xs font-medium border-b-2 transition-colors whitespace-nowrap cursor-pointer ${
              activeTab === "bottlenecks"
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground hover:border-border"
            }`}
          >
            <AlertTriangle className="h-3.5 w-3.5" />
            Требуют внимания
            {bottlenecks.length > 0 && (
              <span className="rounded-full bg-rose-500 text-white px-1.5 py-0.2 text-[10px] font-semibold">
                {bottlenecks.length}
              </span>
            )}
          </button>
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
                wipKpis={wipKpis}
                boundaries={boundaries}
                onOpenDrillDown={handleOpenDrillDown}
              />
            )}

            {activeTab === "samples" && (
              <CommercialSamplesTab
                wipKpis={wipKpis}
                sampleRows={sampleRegister}
                onOpenDrillDown={handleOpenDrillDown}
                onSelectCompany={setCompanyPreviewId}
                onSelectDeal={setDealPreviewId}
              />
            )}

            {activeTab === "managers" && (
              <CommercialManagersTab
                scorecard={managerScorecard}
                onOpenDrillDown={handleOpenDrillDown}
              />
            )}

            {activeTab === "companies" && (
              <CommercialCompaniesTab
                companies={filteredCompanies}
                onSelectCompany={setCompanyPreviewId}
                onSelectDeal={setDealPreviewId}
              />
            )}

            {activeTab === "bottlenecks" && (
              <CommercialBottlenecksTab
                bottlenecks={bottlenecks}
                onSelectCompany={setCompanyPreviewId}
                onSelectDeal={setDealPreviewId}
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
