"use client";

// src/components/dashboard/coverage-banner.tsx
// ─────────────────────────────────────────────────────────────────────
// Truthful dataset coverage disclosure for the operational dashboard.
// CAPPED and PARTIAL must never silently look complete. The cause matters:
// an upstream page failure is NOT the same as the application cap, so each
// carries its own message (never a generic "Показаны первые N").
// ─────────────────────────────────────────────────────────────────────

import { useDashboardStore } from "@/store/dashboard-store";
import { AlertTriangle, Info } from "lucide-react";

export function CoverageBanner() {
  const dealsCoverage = useDashboardStore((s) => s.dealsCoverage);

  if (!dealsCoverage || dealsCoverage.status === "COMPLETE") return null;

  const isPartial = dealsCoverage.status === "PARTIAL";

  return (
    <div className="px-4 sm:px-6 pt-3 animate-fade-in" data-testid="coverage-banner" data-coverage-status={dealsCoverage.status}>
      <div
        className={`flex items-center gap-2 px-3 py-2 rounded-md border ${
          isPartial
            ? "bg-rose-50 dark:bg-rose-950/30 border-rose-200 dark:border-rose-800"
            : "bg-amber-50 dark:bg-amber-950/30 border-amber-200 dark:border-amber-800"
        }`}
      >
        {isPartial ? (
          <AlertTriangle className="h-3.5 w-3.5 text-rose-600 dark:text-rose-400 shrink-0" />
        ) : (
          <Info className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400 shrink-0" />
        )}
        <span
          className={`text-xs font-medium ${
            isPartial ? "text-rose-700 dark:text-rose-400" : "text-amber-700 dark:text-amber-400"
          }`}
        >
          {dealsCoverage.warning}
        </span>
      </div>
    </div>
  );
}
