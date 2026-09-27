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
import { AlertTriangle } from "lucide-react";

export function EnrichmentCoverageBanner() {
  const usersCoverage = useDashboardStore((s) => s.usersCoverage);
  const activitiesCoverage = useDashboardStore((s) => s.activitiesCoverage);
  const companiesDataCoverage = useDashboardStore((s) => s.companiesDataCoverage);
  const fieldsCoverage = useDashboardStore((s) => s.fieldsCoverage);
  const fields = useDashboardStore((s) => s.fields);
  const { columns } = useTableState();

  const warnings = buildEnrichmentUiWarnings({
    selectedColumns: columns,
    fields,
    usersCoverage,
    activitiesCoverage,
    companiesDataCoverage,
    fieldsCoverage,
  });

  if (warnings.length === 0) return null;

  return (
    <div className="px-4 sm:px-6 pt-2 animate-fade-in" data-testid="enrichment-coverage-banner">
      <div className="flex items-start gap-2 px-3 py-2 rounded-md border bg-amber-50 dark:bg-amber-950/30 border-amber-200 dark:border-amber-800">
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
    </div>
  );
}
