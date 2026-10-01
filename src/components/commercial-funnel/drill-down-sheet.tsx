"use client";

// src/components/commercial-funnel/drill-down-sheet.tsx
// Displays the exact list of unique companies and qualifying evidence behind any KPI card.
// Reconciles with card number and allows opening CompanyPreview / DealPreview,
// plus deep link into the top-level Samples section (/samples?company=<id>).

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
import { Building2, ExternalLink, FileText, FlaskConical } from "lucide-react";
import type {
  CommercialCompany,
  CommercialDrillDownPayload,
} from "@/lib/commercial-funnel/types";
import { formatCurrencyAmount } from "@/lib/commercial-funnel/currency";

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
  // Reconcile: filter exactly those companies whose ID is in companyIds
  const matchingCompanies = allCompanies.filter((c) => companyIds.includes(c.id));

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
                    <TableHead className="text-xs">Компания</TableHead>
                    <TableHead className="text-xs">Ответственный</TableHead>
                    <TableHead className="text-xs">Продукт</TableHead>
                    <TableHead className="text-xs">Статус образцов</TableHead>
                    <TableHead className="text-xs">Сделка / Этап</TableHead>
                    <TableHead className="text-xs">Следующий шаг</TableHead>
                    <TableHead className="text-xs text-right">Сумма</TableHead>
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
                                className="text-destructive font-mono text-[11px]"
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
