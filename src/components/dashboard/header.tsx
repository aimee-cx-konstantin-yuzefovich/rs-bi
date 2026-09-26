"use client";

import { useSession, signOut } from "next-auth/react";
import { useDashboardStore } from "@/store/dashboard-store";
import { useTableState } from "@/hooks/use-table-state";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "./theme-toggle";
import { DateFilter } from "./date-filter";
import { GlobalSearch } from "./global-search";
import { ActiveFilters } from "./active-filters";
import { LastSync } from "./last-sync";
import { AlertsBell } from "./alerts-bell";
import { PipelineFilter } from "./pipeline-filter";
import { ResponsibleFilter } from "./responsible-filter";
import { ConnectionHealth } from "./connection-health";
import { SavedViews } from "./saved-views";
import { SectionNav } from "./section-nav";
import { RefreshCw, Download, Columns3, BarChart3, LogOut, User } from "lucide-react";
import { exportToExcelWysiwyg } from "@/lib/export-utils";
import { formatHeaderToRussian, formatStageToRussian } from "@/lib/excel-brand";
import { getDealStageDisplayLabel } from "@/lib/crm-constants";
import { PRODUCT_UI_DESCRIPTOR } from "@/lib/product-identity";
import { IS_PRODUCTION, WP_LOGIN_URL_CLIENT } from "@/lib/config";
import Link from "next/link";
import { useCallback } from "react";
import { motion } from "framer-motion";

export function Header() {
  const { data: session } = useSession();
  const {
    dealsLoading,
    syncData,
    setColumnSelectorOpen,
    dateFilter,
    pipelineFilter,
    responsibleFilter,
    searchQuery,
    userNames,
  } = useDashboardStore();
  const { sortedDeals, columns, fieldMap, resolveValue } = useTableState();

  const handleSync = async () => {
    try {
      await syncData();
    } catch (error) {
      console.error("[Header] Sync error:", error);
    }
  };

  const handleExport = useCallback(() => {
    if (sortedDeals.length === 0 || columns.length === 0) return;

    const exportColumns = columns.map((colId) => {
      const title = fieldMap.get(colId)?.title;
      return formatHeaderToRussian(title || colId);
    });
    const exportData = sortedDeals.map((deal) =>
      columns.map((colId) => {
        const raw = deal[colId];
        const resolved = resolveValue(deal, colId);
        const field = fieldMap.get(colId);
        
        if (resolved === null || resolved === undefined || resolved === "") return null;

        if (colId === "STAGE_ID" || field?.id === "STAGE_ID") {
          return formatStageToRussian(resolved);
        }

        if (colId === "CURRENCY_ID" || field?.id === "CURRENCY_ID") {
          return resolved === "RUB" ? "₽" : resolved;
        }

        if (field?.type === "char" || field?.type === "boolean") {
          if (raw === "Y" || raw === "1" || String(raw) === "true") return "Да";
          if (raw === "N" || raw === "0" || String(raw) === "false") return "Нет";
        }

        if (field?.type === "money" && raw) {
          const parts = String(raw).split("|");
          const amount = parseFloat(parts[0]);
          if (!isNaN(amount)) {
            return amount;
          }
        }

        if (field?.type === "double" || field?.type === "integer" || field?.id === "OPPORTUNITY" || colId === "OPPORTUNITY") {
          const num = parseFloat(resolved);
          if (!isNaN(num)) {
            return num;
          }
        }

        if (field?.type === "date" || field?.type === "datetime" || field?.id === "DATE_CREATE" || field?.id === "DATE_MODIFY") {
          const d = new Date(resolved);
          if (!isNaN(d.getTime())) {
            return d;
          }
        }

        return resolved;
      })
    );

    const filtersSummary: string[] = [];
    if (responsibleFilter && responsibleFilter !== "all") {
      filtersSummary.push(`Ответственный: ${userNames[responsibleFilter] || responsibleFilter}`);
    }
    if (pipelineFilter && pipelineFilter !== "all") {
      filtersSummary.push(`Воронка: ${getDealStageDisplayLabel(pipelineFilter)}`);
    }
    if (searchQuery && searchQuery.trim()) {
      filtersSummary.push(`Поиск: "${searchQuery.trim()}"`);
    }

    const periodLabel =
      dateFilter.preset === "custom" && dateFilter.customFrom && dateFilter.customTo
        ? `${dateFilter.customFrom} — ${dateFilter.customTo}`
        : dateFilter.preset === "7days"
        ? "Последние 7 дней"
        : dateFilter.preset === "14days"
        ? "Последние 14 дней"
        : dateFilter.preset === "30days"
        ? "Последние 30 дней"
        : dateFilter.preset === "90days"
        ? "Последние 90 дней"
        : "Все";

    try {
      exportToExcelWysiwyg(exportData, exportColumns, {
        title: "Отчёт по сделкам",
        sheetName: "Сделки",
        fileNamePrefix: "РусСилика_Сделки",
        period: periodLabel,
        filtersText: filtersSummary.length > 0 ? filtersSummary.join(" | ") : "Все",
        rawColumnIds: columns,
        rawColumnTypes: columns.map((colId: string) => fieldMap.get(colId)?.type),
        rowCurrencies: sortedDeals.map((d: any) => d.CURRENCY_ID),
      });
    } catch (err) {
      console.error("Ошибка при экспорте сделок в Excel:", err);
    }
  }, [sortedDeals, columns, fieldMap, resolveValue, dateFilter, pipelineFilter, responsibleFilter, searchQuery, userNames]);

  const handleLogout = () => {
    // Очистить персистентное состояние перед выходом
    localStorage.removeItem("bitrix-bi-dashboard");

    if (IS_PRODUCTION) {
      const u = new URL(WP_LOGIN_URL_CLIENT);
      u.searchParams.set("action", "headless_logout");
      u.searchParams.set("redirect_to", `${window.location.origin}/login`);
      signOut({ callbackUrl: u.toString() });
    } else {
      signOut({ callbackUrl: "/login" });
    }
  };

  return (
    <header className="z-30 header-gradient border-b border-white/10">
      {/* Top row: Brand + Actions */}
      <div className="flex items-center justify-between px-3 sm:px-5 h-12 gap-2">
          {/* Left: Brand + section tabs */}
          <div className="flex items-center gap-3 min-w-0">
            <Link href="/" className="flex items-center gap-2.5 shrink-0 hover:opacity-80 transition-opacity cursor-pointer">
              <BarChart3 className="h-5 w-5 text-white/80 shrink-0" />
              <span className="text-sm font-semibold tracking-wide text-white">
                RusSilica
              </span>
              <span className="hidden md:inline text-xs font-normal text-white/40">
                {PRODUCT_UI_DESCRIPTOR}
              </span>
            </Link>

            {/* Сделки | Компании | Образцы */}
            <div className="hidden sm:block">
              <SectionNav variant="dark" />
            </div>
          </div>

          {/* Right: Actions */}
          <div className="flex items-center gap-1 shrink-0 ml-auto">
            {/* Sync button */}
            <motion.div whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}>
              <Button
                variant="ghost"
                size="sm"
                onClick={handleSync}
                disabled={dealsLoading}
                className="h-7 gap-1.5 rounded text-xs text-white/70 hover:text-white hover:bg-white/10"
                title="Синхронизировать данные"
              >
                <RefreshCw className={`h-3.5 w-3.5 ${dealsLoading ? "sync-pulse" : ""}`} />
                <span className="hidden sm:inline">Синхр.</span>
              </Button>
            </motion.div>

            {/* Connection health */}
            <ConnectionHealth />

            {/* Last sync time */}
            <div className="hidden lg:block">
              <LastSync />
            </div>

            {/* Separator */}
            <div className="w-px h-4 bg-white/10 mx-1" />

            {/* Saved Views */}
            <motion.div whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}>
              <SavedViews />
            </motion.div>

            {/* Column selector */}
            <motion.div whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setColumnSelectorOpen(true)}
                className="h-7 gap-1.5 rounded text-xs text-white/70 hover:text-white hover:bg-white/10"
              >
                <Columns3 className="h-3.5 w-3.5" />
                <span className="hidden lg:inline">Столбцы</span>
              </Button>
            </motion.div>

            {/* Export */}
            <motion.div whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}>
              <Button
                variant="ghost"
                size="sm"
                onClick={handleExport}
                disabled={sortedDeals.length === 0}
                className="h-7 gap-1.5 rounded text-xs text-white/70 hover:text-white hover:bg-white/10 disabled:text-white/30"
              >
                <Download className="h-3.5 w-3.5" />
                <span className="hidden lg:inline">Экспорт</span>
              </Button>
            </motion.div>

            {/* Separator */}
            <div className="w-px h-4 bg-white/10 mx-1" />

            {/* Theme */}
            <ThemeToggle />

            {/* Alerts bell */}
            <AlertsBell />

            {/* Separator */}
            <div className="w-px h-4 bg-white/10 mx-1" />

            {/* User info + Logout */}
            <div className="flex items-center gap-1.5">
              <div className="hidden sm:flex items-center gap-1.5 px-2 py-1 rounded bg-white/[0.07]">
                <User className="h-3 w-3 text-white/50" />
                <span className="text-[11px] text-white/60 font-medium whitespace-nowrap max-w-[120px] truncate">
                  {session?.user?.name || session?.user?.email || "—"}
                </span>
                {(session?.user?.role) === "admin" && (
                  <span className="text-[9px] px-1 py-0.5 rounded bg-amber-500/20 text-amber-400 font-semibold">
                    АДМ
                  </span>
                )}
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={handleLogout}
                className="h-7 gap-1 rounded text-xs text-white/50 hover:text-red-300 hover:bg-white/10"
                title="Выйти из системы"
              >
                <LogOut className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
        </div>

        {/* Second row: Filters + Search */}
        <div className="flex items-center px-3 sm:px-5 pb-2 pt-0.5 gap-2 overflow-x-auto no-scrollbar">
          {/* Date filter */}
          <DateFilter />

          {/* Pipeline quick filter */}
          <PipelineFilter />

          {/* Responsible filter */}
          <ResponsibleFilter />

          {/* Search (inline with filters) */}
          <div className="flex-1 min-w-[200px] max-w-md">
            <GlobalSearch />
          </div>

          {/* Active filters badge */}
          <ActiveFilters />
        </div>

      </header>
  );
}
