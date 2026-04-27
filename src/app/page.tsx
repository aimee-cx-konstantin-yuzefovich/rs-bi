"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useDashboardStore } from "@/store/dashboard-store";
import { Header } from "@/components/dashboard/header";
import { StatsCards } from "@/components/dashboard/stats-cards";
import { DataTable } from "@/components/dashboard/data-table";
import { ColumnSelector } from "@/components/dashboard/column-selector";
import { ConfigBanner } from "@/components/dashboard/config-banner";
import { Footer } from "@/components/dashboard/footer";
import { LoadingScreen } from "@/components/dashboard/loading-screen";
import { BarChart3, Loader2, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";

// Maximum time to wait for NextAuth session check before showing timeout UI
// Prevents infinite spinner if /api/auth/session hangs
const AUTH_LOADING_TIMEOUT_MS = 15_000;

export default function DashboardPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const { checkConfig, fetchFields, fetchDeals, isDemoMode, appLoaded } = useDashboardStore();
  const [authLoadingTimedOut, setAuthLoadingTimedOut] = useState(false);

  // Redirect unauthenticated users to login
  useEffect(() => {
    if (status === "unauthenticated") {
      router.replace("/login");
    }
  }, [status, router]);

  // Handle session invalidation (password changed, account deactivated, etc.)
  useEffect(() => {
    if (session && session.error === "SessionInvalid") {
      router.replace("/login");
    }
  }, [session, router]);

  // Timeout for auth loading state — prevents infinite spinner
  useEffect(() => {
    if (status !== "loading") return;
    const timer = setTimeout(() => setAuthLoadingTimedOut(true), AUTH_LOADING_TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, [status]);

  // Load data when authenticated
  useEffect(() => {
    if (status !== "authenticated") return;

    const init = async () => {
      try {
        await checkConfig();
        await fetchFields();
        await fetchDeals();
      } catch (error) {
        // Each individual fetch has its own error handling (falls back to demo mode),
        // but catch here to prevent unhandled promise rejection
        console.error("[Dashboard] Init error:", error);
      }
    };
    init();
  }, [status, checkConfig, fetchFields, fetchDeals]);

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
      <LoadingScreen />
      <div className={`min-h-screen flex flex-col bg-background transition-opacity duration-300 ${appLoaded ? "opacity-100" : "opacity-0"}`}>
        <Header />
        <main className="flex-1 flex flex-col min-h-0">
          <ConfigBanner />
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
