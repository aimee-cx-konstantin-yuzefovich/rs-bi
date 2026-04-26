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
import { SavedViews } from "./saved-views";
import { ConnectionHealth } from "./connection-health";
import { RefreshCw, Download, Columns3, BarChart3, LogOut, User } from "lucide-react";
import { exportToExcel } from "@/lib/export-utils";
import { IS_PRODUCTION, WP_LOGIN_URL_CLIENT } from "@/lib/config";

export function Header() {
  const { data: session } = useSession();
  const { dealsLoading, dealsTotal, syncData, deals, fields, selectedColumns, setColumnSelectorOpen } =
    useDashboardStore();

  const handleSync = async () => {
    try {
      await syncData();
    } catch (error) {
      // syncData has its own error handling (falls back to demo mode),
      // but catch here to prevent unhandled promise rejection
      console.error("[Header] Sync error:", error);
    }
  };

  const handleExport = () => {
    if (deals.length === 0) return;
    exportToExcel(deals, fields, selectedColumns);
  };

  const handleLogout = () => {
    if (IS_PRODUCTION) {
      // Production: redirect to WordPress logout
      // NOTE: WordPress logout requires _wpnonce parameter to skip confirmation.
      // Since this is a same-origin redirect, WP will show its logout confirmation page,
      // which is acceptable for security. The user just clicks "Log Out" again.
      const wpLogoutUrl = WP_LOGIN_URL_CLIENT + "?action=logout";
      signOut({ callbackUrl: wpLogoutUrl });
    } else {
      // Development: standard NextAuth logout
      signOut({ callbackUrl: "/login" });
    }
  };

  return (
    <TooltipProvider delayDuration={300}>
      <header className="sticky top-0 z-30 header-gradient border-b border-white/10">
        {/* Top row: Brand + Search + Actions */}
        <div className="flex items-center justify-between px-3 sm:px-5 h-12 gap-2">
          {/* Left: Brand */}
          <div className="flex items-center gap-2.5 shrink-0">
            <BarChart3 className="h-5 w-5 text-white/80 shrink-0" />
            <span className="text-sm font-semibold tracking-wide text-white">
              RusSilica
            </span>
            <span className="hidden sm:inline text-xs font-normal text-white/40">
              BI Terminal
            </span>
          </div>

          {/* Center: Search (always renders, shows icon on mobile, input on desktop) */}
          <div className="flex-1 flex justify-center max-w-md mx-2">
            <GlobalSearch />
          </div>

          {/* Right: Actions */}
          <div className="flex items-center gap-0.5 shrink-0">
            {/* Last sync time */}
            <div className="hidden lg:block mr-1">
              <LastSync />
            </div>

            {/* Active filters badge */}
            <div className="mr-0.5">
              <ActiveFilters />
            </div>

            {/* Alerts bell */}
            <AlertsBell />

            {/* Separator */}
            <div className="w-px h-4 bg-white/10 mx-0.5" />

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
              disabled={deals.length === 0}
              className="h-7 gap-1.5 rounded text-xs text-white/70 hover:text-white hover:bg-white/10 disabled:text-white/30"
            >
              <Download className="h-3.5 w-3.5" />
              <span className="hidden lg:inline">Экспорт</span>
            </Button>

            {/* Saved views */}
            <SavedViews />

            {/* Sync button */}
            <Button
              size="sm"
              onClick={handleSync}
              disabled={dealsLoading}
              className="h-7 gap-1.5 rounded bg-brand-orange hover:bg-brand-orange-hover text-white text-xs font-medium"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${dealsLoading ? "sync-pulse" : ""}`} />
              <span className="hidden sm:inline">Синхр.</span>
            </Button>

            {/* Separator */}
            <div className="w-px h-4 bg-white/10 mx-0.5" />

            {/* Connection health + Theme */}
            <div className="flex items-center gap-1.5">
              <ConnectionHealth />
              <ThemeToggle />
            </div>

            {/* Separator */}
            <div className="w-px h-4 bg-white/10 mx-0.5" />

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

        {/* Second row: Filters + Deal count */}
        <div className="flex items-center justify-between px-3 sm:px-5 pb-2 pt-0.5 gap-2">
          <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar">
            {/* Date filter */}
            <DateFilter />

            {/* Pipeline quick filter */}
            <PipelineFilter />

            {/* Responsible filter */}
            <ResponsibleFilter />
          </div>

          {/* Deal count */}
          <div className="flex items-center gap-1.5 shrink-0">
            <div className="flex items-center gap-1.5 px-2 py-1 rounded bg-white/[0.07]">
              <div className={`h-1.5 w-1.5 rounded-full ${dealsTotal > 0 ? "bg-emerald-400" : "bg-white/30"}`} />
              <span className="text-[11px] text-white/60 font-medium tabular-nums whitespace-nowrap">
                {dealsTotal > 0 ? `${dealsTotal.toLocaleString("ru-RU")} сделок` : "Нет данных"}
              </span>
            </div>
          </div>
        </div>

      </header>
    </TooltipProvider>
  );
}
