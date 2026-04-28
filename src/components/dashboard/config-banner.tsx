"use client";

import { useState } from "react";
import { useDashboardStore } from "@/store/dashboard-store";
import { Wifi, WifiOff, X } from "lucide-react";

export function ConfigBanner() {
  const { isConfigured, isDemoMode } = useDashboardStore();
  const [dismissed, setDismissed] = useState(false);

  if (dismissed || isConfigured === null || isDemoMode) return null;

  if (isConfigured && !isDemoMode) {
    return (
      <div className="px-4 sm:px-6 pt-3 animate-fade-in">
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-md bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800">
          <Wifi className="h-3 w-3 text-emerald-600 dark:text-emerald-400 flex-shrink-0" />
          <span className="text-[11px] text-emerald-700 dark:text-emerald-400 font-medium">
            Подключение к CRM активно
          </span>
          <button
            onClick={() => setDismissed(true)}
            className="ml-auto text-emerald-600/50 hover:text-emerald-600 dark:text-emerald-400/50 dark:hover:text-emerald-400"
          >
            <X className="h-3 w-3" />
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="px-4 sm:px-6 pt-3 animate-fade-in">
      <div className="flex items-center gap-2 px-3 py-1.5 rounded-md bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800">
        <WifiOff className="h-3 w-3 text-amber-600 dark:text-amber-400 flex-shrink-0" />
        <span className="text-[11px] text-amber-700 dark:text-amber-400 font-medium">
          CRM не подключено — обратитесь к администратору
        </span>
        <button
          onClick={() => setDismissed(true)}
          className="ml-auto text-amber-600/50 hover:text-amber-600 dark:text-amber-400/50 dark:hover:text-amber-400"
        >
          <X className="h-3 w-3" />
        </button>
      </div>
    </div>
  );
}
