"use client";

// src/components/commercial-funnel/drill-down-sheet.tsx
// Displays the exact list of unique companies and qualifying evidence behind any KPI card.
// Reconciles with card number and allows opening CompanyPreview / DealPreview,
// plus deep link into the top-level Samples section (/samples?company=<id>).

import { useMemo, useState } from "react";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Building2, ExternalLink, FileText, FlaskConical, ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";
import type {
  CommercialCompany,
  CommercialDrillDownPayload,
} from "@/lib/commercial-funnel/types";
import { formatCurrencyAmount } from "@/lib/commercial-funnel/currency";
import {
  sortRows,
  nextSortDirection,
  ariaSortValue,
  type SortDirection,
} from "@/lib/table-sorting";

type DrillSortField =
  | "title"
  | "responsible"
  | "product"
  | "sampleStatus"
  | "dealStage"
  | "nextStep"
  | "amount";

/** Sortable header for the drill-down table. */
function DrillSortableHead({
  label,
  field,
  sortField,
  sortDirection,
  onSort,
  className = "",
}: {
  label: string;
  field: DrillSortField;
  sortField: DrillSortField | null;
  sortDirection: SortDirection;
  onSort: (field: DrillSortField) => void;
  className?: string;
}) {
  const isSorted = sortField === field && sortDirection !== null;
  return (
    <TableHead className={className} aria-sort={ariaSortValue(sortDirection, sortField === field)}>
      <button
        type="button"
        onClick={() => onSort(field)}
        title={isSorted ? (sortDirection === "asc" ? "По возрастанию (нажмите для убывания)" : "По убыванию (нажмите для сброса)") : "Сортировка"}
        className="inline-flex items-center gap-1 hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring focus-visible:text-foreground transition-colors cursor-pointer"
      >
        <span>{label}</span>
        {isSorted && sortDirection === "asc" && <ArrowUp className="h-3 w-3 text-brand-blue" aria-hidden="true" />}
        {isSorted && sortDirection === "desc" && <ArrowDown className="h-3 w-3 text-brand-blue" aria-hidden="true" />}
        {!isSorted && <ArrowUpDown className="h-3 w-3 opacity-0 group-hover:opacity-30 transition-opacity" aria-hidden="true" />}
      </button>
    </TableHead>
  );
}

interface DrillDownSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  subtitle?: string;
  companyIds: string[];
  payload?: CommercialDrillDownPayload | null;
  allCompanies: CommercialCompany[];
  onSelectCompany: (companyId: string) => void;
  onSelectDeal?: (dealId: string) => void;
}

export function CommercialDrillDownSheet({
  open,
  onOpenChange,
  title,
  subtitle,
  companyIds,
  payload,
  allCompanies,
  onSelectCompany,
  onSelectDeal,
}: DrillDownSheetProps) {
  const [sortField, setSortField] = useState<DrillSortField | null>(null);
  const [sortDirection, setSortDirection] = useState<SortDirection>(null);

  const handleSort = (field: DrillSortField) => {
    if (sortField !== field) {
      setSortField(field);
      setSortDirection("asc");
    } else {
      const next = nextSortDirection(sortDirection);
      setSortDirection(next);
      if (next === null) setSortField(null);
    }
  };

  // Reconcile: filter exactly those companies whose ID is in companyIds,
  // then sort (WP8) by displayed values; empties always last.
  const matchingCompanies = useMemo(() => {
    const filtered = allCompanies.filter((c) => companyIds.includes(c.id));
    if (!sortField || !sortDirection) return filtered;
    return sortRows(filtered, (c) => {
      switch (sortField) {
        case "title":
          return c.title;
        case "responsible":
          return c.responsibleName || c.responsibleId || null;
        case "product":
          return c.productType.length > 0 ? c.productType.join(", ") : null;
        case "sampleStatus":
          return c.sampleStatus && c.sampleStatus !== "—" ? c.sampleStatus : null;
        case "dealStage": {
          const deal = c.deals.find((d) => d.id === c.primaryDealId) ?? c.deals[0];
          return deal ? deal.stageName || deal.stageId || null : null;
        }
        case "nextStep": {
          const deal = c.deals.find((d) => d.id === c.primaryDealId) ?? c.deals[0];
          return deal?.activityNext || null;
        }
        case "amount": {
          const deal = c.deals.find((d) => d.id === c.primaryDealId) ?? c.deals[0];
          return deal && typeof deal.opportunity === "number" ? deal.opportunity : null;
        }
        default:
          return null;
      }
    }, sortDirection);
  }, [allCompanies, companyIds, sortField, sortDirection]);

  const displayTitle = payload?.title || title;
  const displaySubtitle =
    payload?.subtitle ||
    subtitle ||
    `Компании, вошедшие в показатель (${matchingCompanies.length})`;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-3xl p-0 flex flex-col">
        <SheetHeader className="p-4 border-b">
          <div className="flex items-center gap-2">
            <Building2 className="h-5 w-5 text-primary" />
            <SheetTitle className="text-base">{displayTitle}</SheetTitle>
          </div>
          <SheetDescription className="text-xs">
            {displaySubtitle}
          </SheetDescription>
        </SheetHeader>

        <div className="flex-1 overflow-auto p-4">
          {matchingCompanies.length === 0 ? (
            <div className="py-8 text-center text-sm text-muted-foreground">
              Нет компаний для отображения
            </div>
          ) : (
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted">
                    <DrillSortableHead label="Компания" field="title" sortField={sortField} sortDirection={sortDirection} onSort={handleSort} className="text-xs" />
                    <DrillSortableHead label="Ответственный" field="responsible" sortField={sortField} sortDirection={sortDirection} onSort={handleSort} className="text-xs" />
                    <DrillSortableHead label="Продукт" field="product" sortField={sortField} sortDirection={sortDirection} onSort={handleSort} className="text-xs" />
                    <DrillSortableHead label="Статус образцов" field="sampleStatus" sortField={sortField} sortDirection={sortDirection} onSort={handleSort} className="text-xs" />
                    <DrillSortableHead label="Сделка / Этап" field="dealStage" sortField={sortField} sortDirection={sortDirection} onSort={handleSort} className="text-xs" />
                    <DrillSortableHead label="Следующий шаг" field="nextStep" sortField={sortField} sortDirection={sortDirection} onSort={handleSort} className="text-xs" />
                    <DrillSortableHead label="Сумма" field="amount" sortField={sortField} sortDirection={sortDirection} onSort={handleSort} className="text-xs text-right" />
                    <TableHead className="text-xs w-14"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {matchingCompanies.map((c) => {
                    const compEvidences = payload?.evidence?.filter((e) => e.companyId === c.id) ?? [];
                    const qualifyingDealIds = compEvidences
                      .map((e) => e.dealId)
                      .filter((id): id is string => Boolean(id));

                    // Lookup exact qualifying deals from company's deals array
                    const qualifyingDeals =
                      qualifyingDealIds.length > 0
                        ? c.deals.filter((d) => qualifyingDealIds.includes(d.id))
                        : [];

                    const sampleEvidence = compEvidences.find(
                      (e) =>
                        e.kind === "SAMPLE_SP" ||
                        e.kind === "SAMPLE_SENT_EVIDENCE" ||
                        e.kind === "SAMPLE_DEAL"
                    );

                    // Data-aware Samples navigation (WP6): the deep link
                    // renders ONLY when canonical Samples data provably
                    // exists for this company (already computed on the
                    // CommercialCompany projection — no new requests).
                    // Marker-only/unknown provenance never qualifies; no
                    // dead link is rendered.
                    const hasCanonicalSamplesData =
                      (c.sampleStatusSource !== "NONE" &&
                        c.sampleStatus !== "—" &&
                        Boolean(c.sampleStatus)) ||
                      (c.sampleAllDates?.length ?? 0) > 0 ||
                      (c.sampleSentEvents?.length ?? 0) > 0;

                    return (
                      <TableRow
                        key={c.id}
                        className="cursor-pointer hover:bg-muted/50"
                        onClick={() => onSelectCompany(c.id)}
                      >
                        <TableCell className="font-medium text-xs">
                          <div className="flex items-center gap-1.5">
                            <span>{c.title}</span>
                            {c.hasAttention && (
                              <Badge variant="destructive" className="text-[10px] px-1 py-0">
                                Внимание
                              </Badge>
                            )}
                          </div>
                        </TableCell>

                        <TableCell className="text-xs text-muted-foreground">
                          {c.responsibleName || c.responsibleId || "Не назначен"}
                        </TableCell>

                        <TableCell
                          className="text-xs text-muted-foreground max-w-[120px] truncate"
                          title={c.productType.join(", ")}
                        >
                          {c.productType.length > 0 ? c.productType.join(", ") : "—"}
                        </TableCell>

                        <TableCell className="text-xs">
                          <div className="flex flex-col gap-0.5">
                            <Badge variant="outline" className="text-[10px] w-fit">
                              {c.sampleStatus || "—"}
                            </Badge>
                            {sampleEvidence?.processItemId && (
                              <span className="text-[10px] text-muted-foreground">
                                СП #{sampleEvidence.processItemId}
                              </span>
                            )}
                            {sampleEvidence?.date && (
                              <span className="text-[10px] text-muted-foreground">
                                {sampleEvidence.date}
                              </span>
                            )}
                            {typeof c.sampleActiveSmartProcessCount === "number" &&
                              c.sampleActiveSmartProcessCount > 0 && (
                                <span
                                  className="text-[10px] text-muted-foreground"
                                  title={c.sampleActiveStageLabels?.join(", ") || undefined}
                                >
                                  Активных процессов: {c.sampleActiveSmartProcessCount}
                                </span>
                              )}
                          </div>
                        </TableCell>

                        {/* Deal Stage — EXACT qualifying deals only (never arbitrary primaryDeal fallback) */}
                        <TableCell className="text-xs">
                          {qualifyingDeals.length === 1 ? (
                            <div className="flex flex-col">
                              <button
                                type="button"
                                className="text-left font-medium text-primary hover:underline truncate max-w-[150px] cursor-pointer"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  onSelectDeal?.(qualifyingDeals[0].id);
                                }}
                                title={`Открыть сделку «${qualifyingDeals[0].title}»`}
                              >
                                {qualifyingDeals[0].title}
                              </button>
                              <span className="text-[10px] text-muted-foreground truncate">
                                {qualifyingDeals[0].stageName || qualifyingDeals[0].stageId || "—"}
                              </span>
                            </div>
                          ) : qualifyingDeals.length > 1 ? (
                            <div className="flex flex-col gap-1">
                              {qualifyingDeals.map((d) => (
                                <div key={d.id} className="flex items-center gap-1">
                                  <button
                                    type="button"
                                    className="text-left font-medium text-primary hover:underline truncate max-w-[120px] text-[11px] cursor-pointer"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      onSelectDeal?.(d.id);
                                    }}
                                    title={`Открыть сделку «${d.title}»`}
                                  >
                                    {d.title}
                                  </button>
                                  <span className="text-[10px] text-muted-foreground">
                                    ({d.stageName || d.stageId || "—"})
                                  </span>
                                </div>
                              ))}
                            </div>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </TableCell>

                        {/* Next Action — EXACT qualifying deals only */}
                        <TableCell className="text-xs text-muted-foreground max-w-[140px] truncate">
                          {qualifyingDeals.length === 1 ? (
                            <span title={qualifyingDeals[0].activityNext || (qualifyingDeals[0].activityDataKnown ? "не указан" : "данные недоступны")}>
                              {qualifyingDeals[0].activityDataKnown
                                ? qualifyingDeals[0].activityNext || "не указан"
                                : "данные недоступны"}
                            </span>
                          ) : qualifyingDeals.length > 1 ? (
                            <span title={qualifyingDeals.map((d) => d.activityNext || (d.activityDataKnown ? "не указан" : "данные недоступны")).join("; ")}>
                              {qualifyingDeals.map((d) => d.activityNext || (d.activityDataKnown ? "не указан" : "данные недоступны")).join("; ")}
                            </span>
                          ) : (
                            "—"
                          )}
                        </TableCell>

                        {/* Amount — EXACT qualifying deals only */}
                        <TableCell className="text-xs text-right font-medium">
                          {qualifyingDeals.length === 1 ? (
                            qualifyingDeals[0].opportunityQuality === "INVALID" ? (
                              <span
                                className="text-destructive text-[11px] tabular-nums"
                                title="Некорректная сумма в Bitrix24"
                              >
                                Неверная сумма
                              </span>
                            ) : typeof qualifyingDeals[0].opportunity === "number" ? (
                              formatCurrencyAmount(
                                qualifyingDeals[0].opportunity,
                                qualifyingDeals[0].currencyId
                              )
                            ) : (
                              "—"
                            )
                          ) : qualifyingDeals.length > 1 ? (
                            <div className="flex flex-col text-right">
                              {qualifyingDeals.map((d) => (
                                <span key={d.id} className="text-[11px] font-medium">
                                  {d.opportunityQuality === "INVALID"
                                    ? "Неверная сумма"
                                    : typeof d.opportunity === "number"
                                    ? formatCurrencyAmount(d.opportunity, d.currencyId)
                                    : "—"}
                                </span>
                              ))}
                            </div>
                          ) : (
                            "—"
                          )}
                        </TableCell>

                        {/* Actions */}
                        <TableCell className="text-xs">
                          <div className="flex items-center gap-0.5">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-6 w-6"
                              onClick={(e) => {
                                e.stopPropagation();
                                onSelectCompany(c.id);
                              }}
                              title="Открыть карточку компании"
                            >
                              <ExternalLink className="h-3.5 w-3.5" />
                            </Button>
                            {qualifyingDeals.length > 0 && onSelectDeal && (
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-6 w-6"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  onSelectDeal(qualifyingDeals[0].id);
                                }}
                                title={`Открыть сделку «${qualifyingDeals[0].title}»`}
                              >
                                <FileText className="h-3.5 w-3.5" />
                              </Button>
                            )}
                            {hasCanonicalSamplesData && (
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-6 w-6"
                                asChild
                                onClick={(e) => e.stopPropagation()}
                              >
                                <a
                                  href={`/samples?company=${encodeURIComponent(c.id)}`}
                                  title="Открыть в разделе Образцы"
                                >
                                  <FlaskConical className="h-3.5 w-3.5" />
                                </a>
                              </Button>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
