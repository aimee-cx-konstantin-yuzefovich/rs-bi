"use client";

import { useDashboardStore } from "@/store/dashboard-store";
import { WifiOff, X } from "lucide-react";

export const CRM_CONFIG_BANNER_ID = "crm-config-error";

export function ConfigBanner() {
  const isConfigured = useDashboardStore((s) => s.isConfigured);
  const isDemoMode = useDashboardStore((s) => s.isDemoMode);
  const isDismissed = useDashboardStore((s) => s.dismissedBannerIds.includes(CRM_CONFIG_BANNER_ID));
  const dismissBanner = useDashboardStore((s) => s.dismissBanner);

  // Success (isConfigured === true) is silent; pending (null) and demo mode render nothing here
  if (isDismissed || isConfigured === null || isConfigured === true || isDemoMode) {
    return null;
  }

  return (
    <div className="px-4 sm:px-6 pt-3 animate-fade-in" data-testid="config-banner">
      <div className="flex items-center gap-2 px-3 py-1.5 rounded-md bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800">
        <WifiOff className="h-3 w-3 text-amber-600 dark:text-amber-400 flex-shrink-0" />
        <span className="text-[11px] text-amber-700 dark:text-amber-400 font-medium">
          CRM не подключено — обратитесь к администратору
        </span>
        <button
          type="button"
          onClick={() => dismissBanner(CRM_CONFIG_BANNER_ID)}
          aria-label="Закрыть"
          title="Закрыть"
          className="ml-auto text-amber-600/50 hover:text-amber-600 dark:text-amber-400/50 dark:hover:text-amber-400"
        >
          <X className="h-3 w-3" />
        </button>
      </div>
    </div>
  );
}
