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
import { RefreshCw, Download, Columns3, BarChart3, LogOut, User } from "lucide-react";
import { exportToExcelWysiwyg } from "@/lib/export-utils";
import { IS_PRODUCTION, WP_LOGIN_URL_CLIENT } from "@/lib/config";
import Link from "next/link";
import { useCallback } from "react";
import { motion } from "framer-motion";

export function Header() {
  const { data: session } = useSession();
  const { dealsLoading, syncData, setColumnSelectorOpen } =
    useDashboardStore();
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

    const exportColumns = columns.map((colId) => fieldMap.get(colId)?.title || colId);
    const exportData = sortedDeals.map((deal) =>
      columns.map((colId) => {
        const raw = deal[colId];
        const resolved = resolveValue(deal, colId);
        const field = fieldMap.get(colId);
        
        if (!resolved) return "";

        if (field?.type === "char" || field?.type === "boolean") {
          if (raw === "Y" || raw === "1" || String(raw) === "true") return "Да";
          if (raw === "N" || raw === "0" || String(raw) === "false") return "Нет";
        }

        if (field?.type === "money" && raw) {
          const parts = String(raw).split("|");
          const amount = parseFloat(parts[0]);
          const currency = parts[1] || "";
          if (!isNaN(amount)) {
            return `${amount.toLocaleString("ru-RU", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${currency}`;
          }
        }

        if (field?.type === "double" || field?.type === "integer" || field?.id === "OPPORTUNITY") {
          const num = parseFloat(resolved);
          if (!isNaN(num)) {
            if (field?.type === "integer") {
              return Math.round(num).toLocaleString("ru-RU");
            }
            return num.toLocaleString("ru-RU", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
          }
        }

        if (field?.type === "date" || field?.type === "datetime" || field?.id === "DATE_CREATE" || field?.id === "DATE_MODIFY") {
          const d = new Date(resolved);
          if (!isNaN(d.getTime())) {
            const dateStr = d.toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit", year: "numeric" });
            const timeStr = field?.type === "datetime" ? ` ${d.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" })}` : "";
            return `${dateStr}${timeStr}`;
          }
        }

        return resolved;
      })
    );

    exportToExcelWysiwyg(exportData, exportColumns);
  }, [sortedDeals, columns, fieldMap, resolveValue]);

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
          {/* Left: Brand */}
          <Link href="/" className="flex items-center gap-2.5 shrink-0 hover:opacity-80 transition-opacity cursor-pointer">
            <BarChart3 className="h-5 w-5 text-white/80 shrink-0" />
            <span className="text-sm font-semibold tracking-wide text-white">
              RusSilica
            </span>
            <span className="hidden sm:inline text-xs font-normal text-white/40">
              BI Terminal
            </span>
          </Link>

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
