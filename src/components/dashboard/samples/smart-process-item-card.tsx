"use client";

// src/components/dashboard/samples/smart-process-item-card.tsx
// Presentational compact card for ONE canonical Smart Process item view.
// Shared by Deal Preview, Company Preview, and Sample Preview.
// Purely presentational: consumes an already-projected SmartProcessItemView;
// never parses raw Bitrix fields and never fetches.

import { Badge } from "@/components/ui/badge";
import { NORMALIZED_RESULT_LABELS, SAMPLE_DATA_ISSUE_LABELS } from "@/lib/samples/constants";
import type { SmartProcessItemViewLite } from "@/lib/samples/types";
import type { SampleGrade, SampleQuantity, SampleDataIssue } from "@/lib/samples/types";
import { formatDateRu } from "./samples-registry";
import { resolveResponsibleDisplay } from "@/lib/enrichment-coverage";
import { useDashboardStore } from "@/store/dashboard-store";
import { TriangleAlert } from "lucide-react";

/** Card accepts the full view or the JSON-safe lite projection. */
export type SmartProcessItemCardView = SmartProcessItemViewLite;

export interface SmartProcessItemCardProps {
  view: SmartProcessItemCardView;
  /** Optional linked-Deal display name (resolved by the parent). */
  dealTitle?: string;
  /** Callback to navigate to the linked Deal preview. */
  onOpenDealPreview?: (dealId: string) => void;
  dataTestId?: string;
}

/** Normalized-result display label; works for both view shapes. */
function resultDisplayLabel(view: SmartProcessItemCardView): string {
  return NORMALIZED_RESULT_LABELS[view.normalizedResult] ?? view.normalizedResult;
}

export function SmartProcessItemCard({
  view,
  dealTitle,
  onOpenDealPreview,
  dataTestId,
}: SmartProcessItemCardProps) {
  const userNames = useDashboardStore((s) => s.userNames);
  const usersCoverage = useDashboardStore((s) => s.usersCoverage);

  const responsible = view.responsibleId
    ? resolveResponsibleDisplay(view.responsibleId, userNames, usersCoverage)
    : null;

  const gradePart = (family: string) => {
    const grade = view.grades.find((g) => g.productFamily === family);
    const qty = view.quantities.find((q) => q.productFamily === family);
    if (!grade && !qty) return null;
    const gradeStr = grade?.value ?? "—";
    const qtyStr = qty
      ? ` · ${typeof qty.value === "number" ? qty.value.toLocaleString("ru-RU") : qty.value}${qty.unit ? ` ${qty.unit}` : ""}`
      : "";
    return `${family}: ${gradeStr}${qtyStr}`;
  };
  const gel = gradePart("Гель");
  const sol = gradePart("Золь");

  return (
    <li
      className="rounded-md border bg-muted/20 p-2 text-xs space-y-1"
      data-testid={dataTestId}
      data-sp-item-id={view.processItemId}
      data-sp-active={view.isActive ? "true" : "false"}
    >
      <div className="flex items-center gap-1.5 flex-wrap">
        {view.isActive && (
          <Badge className="bg-amber-100 text-amber-800 dark:bg-amber-950/50 dark:text-amber-300 text-[10px] h-5 rounded-sm border-0 font-medium">
            Активный
          </Badge>
        )}
        {view.isTerminal && (
          <Badge variant="secondary" className="text-[10px] h-5 rounded-sm font-normal">
            Завершён
          </Badge>
        )}
        <Badge variant="outline" className="text-[10px] font-normal max-w-[220px] truncate">
          {view.stageLabel}
        </Badge>
        {view.linkedDealId && (
          <span className="ml-auto flex items-center gap-1 text-[11px]">
            {onOpenDealPreview ? (
              <button
                type="button"
                data-deal-link={view.linkedDealId}
                onClick={() => onOpenDealPreview(view.linkedDealId!)}
                className="font-medium text-primary hover:underline text-left"
              >
                {dealTitle ?? `Сделка ID ${view.linkedDealId}`}
              </button>
            ) : (
              <span className="font-medium text-muted-foreground">
                {dealTitle ?? `Сделка ID ${view.linkedDealId}`}
              </span>
            )}
          </span>
        )}
      </div>

      {view.title && (
        <div className="font-medium break-words">{view.title}</div>
      )}

      <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-muted-foreground">
        {view.sentDates.length > 0 && (
          <span className="tabular-nums">
            Дата отправки: {view.sentDates.map(formatDateRu).join(", ")}
          </span>
        )}
        {gel && <span>{gel}</span>}
        {sol && <span>{sol}</span>}
      </div>

      {view.rawTestResult && (
        <div className="text-muted-foreground break-words">
          Результат: <span className="whitespace-pre-wrap break-words">«{view.rawTestResult}»</span>
          {view.normalizedResult !== "unknown" && (
            <span className="text-[10px]"> · {resultDisplayLabel(view)}</span>
          )}
        </div>
      )}

      {responsible && (
        <div className="text-muted-foreground text-[11px]">Ответственный: {responsible}</div>
      )}

      {view.dataIssues.length > 0 && (
        <div
          className="flex items-start gap-1.5 rounded border border-amber-500/40 bg-amber-500/10 px-1.5 py-1 text-[11px] text-amber-700 dark:text-amber-400"
          data-sp-quality-warning
        >
          <TriangleAlert className="h-3 w-3 mt-0.5 shrink-0" />
          <span className="break-words">
            {view.dataIssues
              .map((issue) => SAMPLE_DATA_ISSUE_LABELS[issue] ?? issue)
              .join("; ")}
          </span>
        </div>
      )}
    </li>
  );
}
