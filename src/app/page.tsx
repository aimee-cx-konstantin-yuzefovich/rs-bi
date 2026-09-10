"use client";

import { Suspense, useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { useLoginRedirect } from "@/hooks/use-login-redirect";
import { useSearchParams } from "next/navigation";
import { useQueryStates } from "nuqs";
import { searchParams } from "@/lib/search-params";
import { useDashboardStore } from "@/store/dashboard-store";
import { Header } from "@/components/dashboard/header";
import { StatsCards } from "@/components/dashboard/stats-cards";
import { DataTable } from "@/components/dashboard/data-table";
import { ColumnSelector } from "@/components/dashboard/column-selector";
import { ConfigBanner } from "@/components/dashboard/config-banner";
import { Footer } from "@/components/dashboard/footer";
import { INITIAL_STARTUP, runDashboardStartup, type StartupState } from "@/lib/dashboard-startup";
import { LoadingScreen } from "@/components/dashboard/loading-screen";
import { BarChart3, Loader2, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";

// Maximum time to wait for NextAuth session check before showing timeout UI
// Prevents infinite spinner if /api/auth/session hangs
const AUTH_LOADING_TIMEOUT_MS = 15_000;

function DashboardContent() {
  const { data: session, status } = useSession();
  const rawSearchParams = useSearchParams();
  const [urlState] = useQueryStates(searchParams);
  const { checkConfig, fetchFields, fetchDeals, isDemoMode, appLoaded, dealsError, syncData, syncUrlState } = useDashboardStore();
  const [authLoadingTimedOut, setAuthLoadingTimedOut] = useState(false);
  const [isUrlSynced, setIsUrlSynced] = useState(false);
  const [startup, setStartup] = useState<StartupState>(INITIAL_STARTUP);

  useLoginRedirect(status, session?.error);

  // Timeout for auth loading state — prevents infinite spinner
  useEffect(() => {
    if (status !== "loading") return;
    const timer = setTimeout(() => setAuthLoadingTimedOut(true), AUTH_LOADING_TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, [status]);

  // Sync URL state on mount
  useEffect(() => {
    if (isUrlSynced) return;
    
    const paramsToSync: any = {};
    let hasParams = false;

    // Check which params are actually in the URL
    if (rawSearchParams.has("date")) { paramsToSync.dateFilter = urlState.date; hasParams = true; }
    if (rawSearchParams.has("pipeline")) { paramsToSync.pipelineFilter = urlState.pipeline; hasParams = true; }
    if (rawSearchParams.has("responsible")) { paramsToSync.responsibleFilter = urlState.responsible; hasParams = true; }
    if (rawSearchParams.has("q")) { paramsToSync.searchQuery = urlState.q; hasParams = true; }
    if (rawSearchParams.has("page")) { paramsToSync.currentPage = urlState.page; hasParams = true; }
    if (rawSearchParams.has("size")) { paramsToSync.pageSize = urlState.size; hasParams = true; }
    if (rawSearchParams.has("filters")) { paramsToSync.columnFilters = urlState.filters; hasParams = true; }

    if (hasParams) {
      syncUrlState(paramsToSync);
    }
    
    setIsUrlSynced(true);
  }, [rawSearchParams, urlState, syncUrlState, isUrlSynced]);

  // Load data when authenticated and URL is synced
  useEffect(() => {
    if (status !== "authenticated" || !isUrlSynced) return;

    let cancelled = false;
    void runDashboardStartup(
      [checkConfig, fetchFields, fetchDeals],
      useDashboardStore.getState,
      setStartup,
      () => cancelled,
    );
    return () => { cancelled = true; };
  }, [status, isUrlSynced, checkConfig, fetchFields, fetchDeals]);

  // Show loading while checking auth
  if (status === "loading") {
    return null;
  }

  // Don't render dashboard for unauthenticated users
  if (status !== "authenticated") {
    return null;
  }

  return (
    <>
      <LoadingScreen startup={startup} />
      <div inert={!appLoaded} aria-hidden={!appLoaded} className={`min-h-screen flex flex-col bg-background transition-opacity duration-200 motion-reduce:transition-none ${appLoaded || startup.finished ? "opacity-100" : "h-dvh overflow-hidden opacity-0 [contain:strict]"}`}>
        <Header />
        <main className="flex-1 flex flex-col min-h-0">
          <ConfigBanner />
          {dealsError && (
            <div className="px-4 sm:px-6 pt-3 animate-fade-in">
              <div className="flex items-center justify-between px-4 py-3 rounded-md bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800">
                <div className="flex items-center gap-3">
                  <AlertCircle className="h-5 w-5 text-red-600 dark:text-red-400" />
                  <span className="text-sm text-red-800 dark:text-red-300 font-medium">
                    {dealsError}
                  </span>
                </div>
                <Button 
                  variant="outline" 
                  size="sm" 
                  onClick={() => syncData()}
                  className="border-red-200 hover:bg-red-100 dark:border-red-800 dark:hover:bg-red-900/50 text-red-700 dark:text-red-400"
                >
                  Повторить
                </Button>
              </div>
            </div>
          )}
          {isDemoMode && (
            <div className="px-4 sm:px-6 pt-3 animate-fade-in">
              <div className="flex items-center gap-2 px-3 py-2 rounded-md bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800">
                <div className="h-1.5 w-1.5 rounded-full bg-amber-500 animate-pulse" />
                <span className="text-xs text-amber-700 dark:text-amber-400 font-medium">
                  Демо-режим — Обратитесь к администратору для подключения реальных данных
                </span>
              </div>
            </div>
          )}
          <StatsCards />
          <DataTable />
        </main>
        <ColumnSelector />
        <Footer />
      </div>
    </>
  );
}

export default function DashboardPage() {
  return (
    <Suspense fallback={null}>
      <DashboardContent />
    </Suspense>
  );
}
