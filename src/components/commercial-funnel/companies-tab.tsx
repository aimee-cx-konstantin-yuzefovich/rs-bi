"use client";

// src/components/commercial-funnel/companies-tab.tsx
// Commercial analytical companies table (Section 20).
// Direct access to existing CompanyPreview & DealPreview.

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { AlertCircle, Building2, ExternalLink } from "lucide-react";
import type { CommercialCompany } from "@/lib/commercial-funnel/types";
import { formatCurrencyAmount } from "@/lib/commercial-funnel/normalize";

interface CompaniesTabProps {
  companies: CommercialCompany[];
  onSelectCompany: (companyId: string) => void;
  onSelectDeal: (dealId: string) => void;
}

export function CommercialCompaniesTab({
  companies,
  onSelectCompany,
  onSelectDeal,
}: CompaniesTabProps) {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold tracking-tight text-foreground flex items-center gap-2">
            <Building2 className="h-4 w-4 text-primary" />
            Аналитический срез по компаниям ({companies.length})
          </h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            Статус образцов, коммерческая стадия, оплаты и внимание по каждой компании
          </p>
        </div>
      </div>

      {companies.length === 0 ? (
        <div className="py-12 text-center text-sm text-muted-foreground border rounded-lg bg-card">
          Нет компаний для выбранных фильтров
        </div>
      ) : (
        <div className="rounded-lg border bg-card overflow-hidden">
          <Table containerClassName="max-h-[calc(100vh-280px)] min-h-[400px] overflow-auto">
            <TableHeader>
              <TableRow className="bg-muted">
                  <TableHead className="text-xs font-semibold">Компания</TableHead>
                  <TableHead className="text-xs font-semibold">Ответственный</TableHead>
                  <TableHead className="text-xs font-semibold">Дата создания</TableHead>
                  <TableHead className="text-xs font-semibold">Статус образцов</TableHead>
                  <TableHead className="text-xs font-semibold">Дата образцов</TableHead>
                  <TableHead className="text-xs font-semibold">Результат</TableHead>
                  <TableHead className="text-xs font-semibold">Текущая сделка</TableHead>
                  <TableHead className="text-xs font-semibold">Этап сделки</TableHead>
                  <TableHead className="text-xs font-semibold text-right">Сумма</TableHead>
                  <TableHead className="text-xs font-semibold">Оплата</TableHead>
                  <TableHead className="text-xs font-semibold">Следующий шаг</TableHead>
                  <TableHead className="text-xs font-semibold">Внимание</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {companies.map((c) => (
                  <TableRow key={c.id} className="hover:bg-muted/30">
                    {/* Компания */}
                    <TableCell className="text-xs font-medium">
                      <button
                        type="button"
                        onClick={() => onSelectCompany(c.id)}
                        className="text-left font-medium text-primary hover:underline flex items-center gap-1 cursor-pointer"
                      >
                        <span className="truncate max-w-[170px]">{c.title}</span>
                        <ExternalLink className="h-3 w-3 opacity-60 shrink-0" />
                      </button>
                    </TableCell>

                    {/* Ответственный */}
                    <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                      {c.responsibleName}
                    </TableCell>

                    {/* Дата создания */}
                    <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                      {c.dateCreate || "—"}
                    </TableCell>

                    {/* Статус образцов */}
                    <TableCell className="text-xs max-w-[200px]">
                      {c.sampleStatuses && c.sampleStatuses.length > 0 ? (
                        <div className="flex flex-col gap-1">
                          <div className="flex flex-wrap gap-1">
                            {c.sampleStatuses.map((s, idx) => (
                              <Badge key={idx} variant="secondary" className="text-[10px]">
                                {s}
                              </Badge>
                            ))}
                          </div>
                          <span className="text-[9px] text-muted-foreground whitespace-nowrap">({c.sampleStatusSource})</span>
                        </div>
                      ) : c.sampleStatus !== "—" ? (
                        <div className="flex items-center gap-1">
                          <Badge variant="secondary" className="text-[10px]">
                            {c.sampleStatus}
                          </Badge>
                          <span className="text-[9px] text-muted-foreground whitespace-nowrap">({c.sampleStatusSource})</span>
                        </div>
                      ) : (
                        <span className="text-muted-foreground/60">—</span>
                      )}
                    </TableCell>

                    {/* Дата отправки */}
                    <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                      {c.sampleShipmentDate || "—"}
                    </TableCell>

                    {/* Результат */}
                    <TableCell className="text-xs max-w-[160px] truncate text-muted-foreground" title={c.sampleTestResult}>
                      {c.sampleTestResult || "—"}
                    </TableCell>

                    {/* Текущая сделка */}
                    <TableCell className="text-xs text-muted-foreground">
                      {c.primaryDealId ? (
                        <button
                          type="button"
                          onClick={() => onSelectDeal(c.primaryDealId!)}
                          className="text-left hover:underline flex items-center gap-1 cursor-pointer"
                        >
                          <span className="truncate max-w-[140px]">{c.primaryDealTitle}</span>
                          <ExternalLink className="h-3 w-3 opacity-60 shrink-0" />
                        </button>
                      ) : (
                        <span className="text-muted-foreground/60">—</span>
                      )}
                    </TableCell>

                    {/* Этап сделки */}
                    <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                      {c.primaryDealStageName || c.primaryDealStageId || "—"}
                    </TableCell>

                    {/* Сумма */}
                    <TableCell className="text-xs text-right font-medium whitespace-nowrap">
                      {c.primaryDealOpportunityQuality === "INVALID" ? (
                        <span className="text-destructive font-mono text-[11px]" title="Некорректная сумма в Bitrix24">
                          Неверная сумма
                        </span>
                      ) : typeof c.primaryDealOpportunity === "number" ? (
                        formatCurrencyAmount(
                          c.primaryDealOpportunity,
                          c.primaryDealCurrencyId ||
                            (c.primaryDealId
                              ? c.deals.find((d) => d.id === c.primaryDealId)?.currencyId
                              : undefined)
                        )
                      ) : (
                        "—"
                      )}
                    </TableCell>

                    {/* Оплата */}
                    <TableCell className="text-xs whitespace-nowrap">
                      {c.primaryDealPaymentStatus ? (
                        <Badge variant="outline" className="text-[10px]">
                          {c.primaryDealPaymentStatus}
                        </Badge>
                      ) : (
                        <span className="text-muted-foreground/60">—</span>
                      )}
                    </TableCell>

                    {/* Следующий шаг */}
                    <TableCell className="text-xs max-w-[180px] truncate text-muted-foreground" title={c.primaryDealActivityNext}>
                      {c.primaryDealActivityNext || "—"}
                    </TableCell>

                    {/* Внимание */}
                    <TableCell className="text-xs whitespace-nowrap">
                      {c.hasAttention ? (
                        <div className="flex items-center gap-1 text-rose-600 dark:text-rose-400" title={c.attentionReasons.join("; ")}>
                          <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                          <span className="text-[11px] font-medium">Да ({c.attentionReasons.length})</span>
                        </div>
                      ) : (
                        <span className="text-muted-foreground/60">Нет</span>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
        </div>
      )}
    </div>
  );
}
