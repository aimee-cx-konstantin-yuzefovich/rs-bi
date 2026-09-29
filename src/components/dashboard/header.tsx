"use client";

import { useSession, signOut } from "next-auth/react";
import { useDashboardStore } from "@/store/dashboard-store";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "./theme-toggle";
import { LastSync } from "./last-sync";
import { AlertsBell } from "./alerts-bell";
import { ConnectionHealth } from "./connection-health";
import { SectionNav } from "./section-nav";
import { RefreshCw, BarChart3, LogOut, User } from "lucide-react";
import { PRODUCT_UI_DESCRIPTOR } from "@/lib/product-identity";
import { IS_PRODUCTION, WP_LOGIN_URL_CLIENT } from "@/lib/config";
import Link from "next/link";
import { motion } from "framer-motion";

export function Header() {
  const { data: session } = useSession();
  const { dealsLoading, syncData } = useDashboardStore();

  const handleSync = async () => {
    try {
      await syncData();
    } catch (error) {
      console.error("[Header] Sync error:", error);
    }
  };

  const handleLogout = () => {
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
      {/* Shell header row: Brand + Navigation + System Controls */}
      <div className="flex items-center justify-between px-3 sm:px-5 h-12 gap-2">
        {/* Left: Brand + section tabs */}
        <div className="flex items-center gap-3 min-w-0">
          <Link
            href="/"
            className="flex items-center gap-2.5 shrink-0 hover:opacity-80 transition-opacity cursor-pointer"
          >
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

        {/* Right: System & Session Actions */}
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
                {session?.user?.name || session?.user?.email || "–"}
              </span>
              {session?.user?.role === "admin" && (
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
    </header>
  );
}
