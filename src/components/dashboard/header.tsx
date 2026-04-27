"use client";

import { useSession, signOut } from "next-auth/react";
import { useDashboardStore } from "@/store/dashboard-store";
import { Button } from "@/components/ui/button";
import { TooltipProvider } from "@/components/ui/tooltip";
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

export function Header() {
  const { data: session } = useSession();
  const { dealsLoading, syncData, exportData, exportColumns, setColumnSelectorOpen } =
    useDashboardStore();

  const handleSync = async () => {
    try {
      await syncData();
    } catch (error) {
      console.error("[Header] Sync error:", error);
    }
  };

  const handleExport = () => {
    if (exportData.length === 0) return;
    exportToExcelWysiwyg(exportData, exportColumns);
  };

  const handleLogout = () => {
    if (IS_PRODUCTION) {
      const wpLogoutUrl = WP_LOGIN_URL_CLIENT + "?action=logout";
      signOut({ callbackUrl: wpLogoutUrl });
    } else {
      signOut({ callbackUrl: "/login" });
    }
  };

  return (
    <TooltipProvider delayDuration={300}>
      <header className="sticky top-0 z-30 header-gradient border-b border-white/10">
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

            {/* Connection health */}
            <ConnectionHealth />

            {/* Last sync time */}
            <div className="hidden lg:block">
              <LastSync />
            </div>

            {/* Separator */}
            <div className="w-px h-4 bg-white/10 mx-1" />

            {/* Column selector */}
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setColumnSelectorOpen(true)}
              className="h-7 gap-1.5 rounded text-xs text-white/70 hover:text-white hover:bg-white/10"
            >
              <Columns3 className="h-3.5 w-3.5" />
              <span className="hidden lg:inline">Столбцы</span>
            </Button>

            {/* Export */}
            <Button
              variant="ghost"
              size="sm"
              onClick={handleExport}
              disabled={exportData.length === 0}
              className="h-7 gap-1.5 rounded text-xs text-white/70 hover:text-white hover:bg-white/10 disabled:text-white/30"
            >
              <Download className="h-3.5 w-3.5" />
              <span className="hidden lg:inline">Экспорт</span>
            </Button>

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
    </TooltipProvider>
  );
}
