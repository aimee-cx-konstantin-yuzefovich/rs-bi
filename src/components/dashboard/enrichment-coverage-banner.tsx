"use client";

// src/components/dashboard/enrichment-coverage-banner.tsx
// ─────────────────────────────────────────────────────────────────────
// Compact enrichment-source disclosure, kept deliberately DISTINCT from
// the main Deal dataset coverage banner: Deals coverage and lookup/
// enrichment coverage affect different semantics.
//
// Shown only when a currently visible column depends on an incomplete
// enrichment source (users directory / activities / companies / field
// metadata). Reuses the same dependency model as the Excel export so the
// two surfaces can never diverge.
// ─────────────────────────────────────────────────────────────────────

import { useDashboardStore } from "@/store/dashboard-store";
import { useTableState } from "@/hooks/use-table-state";
import { buildEnrichmentUiWarnings } from "@/lib/enrichment-disclosure";
import { AlertTriangle, X } from "lucide-react";

export const ENRICHMENT_COVERAGE_BANNER_ID = "enrichment-coverage-warning";

export function EnrichmentCoverageBanner() {
  const usersCoverage = useDashboardStore((s) => s.usersCoverage);
  const activitiesCoverage = useDashboardStore((s) => s.activitiesCoverage);
  const companiesDataCoverage = useDashboardStore((s) => s.companiesDataCoverage);
  const fieldsCoverage = useDashboardStore((s) => s.fieldsCoverage);
  const fields = useDashboardStore((s) => s.fields);
  const { columns } = useTableState();
  const isDismissed = useDashboardStore((s) => s.dismissedBannerIds.includes(ENRICHMENT_COVERAGE_BANNER_ID));
  const dismissBanner = useDashboardStore((s) => s.dismissBanner);

  const warnings = buildEnrichmentUiWarnings({
    selectedColumns: columns,
    fields,
    usersCoverage,
    activitiesCoverage,
    companiesDataCoverage,
    fieldsCoverage,
  });

  if (isDismissed || warnings.length === 0) return null;

  return (
    <div className="px-4 sm:px-6 pt-2 animate-fade-in" data-testid="enrichment-coverage-banner">
      <div className="flex items-start justify-between gap-2 px-3 py-2 rounded-md border bg-amber-50 dark:bg-amber-950/30 border-amber-200 dark:border-amber-800">
        <div className="flex items-start gap-2">
          <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400 mt-0.5 shrink-0" />
          <div className="space-y-0.5">
            {warnings.map((w) => (
              <span
                key={w}
                className="block text-xs font-medium text-amber-700 dark:text-amber-400"
              >
                {w}
              </span>
            ))}
          </div>
        </div>
        <button
          type="button"
          onClick={() => dismissBanner(ENRICHMENT_COVERAGE_BANNER_ID)}
          aria-label="Закрыть"
          title="Закрыть"
          className="text-amber-700/60 hover:text-amber-900 dark:text-amber-400/60 dark:hover:text-amber-200 p-0.5"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}
