"use client";

// src/components/commercial-funnel/samples-tab.tsx
// Samples view: Current-state status summary cards + Detailed sample table.
// Preserves multiplicity, shows days since sent, and explicit status source.

import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ExternalLink, FlaskConical } from "lucide-react";
import type {
  CommercialCompany,
  SampleRegisterRow,
  WipKpi,
} from "@/lib/commercial-funnel/types";

interface SamplesTabProps {
  wipKpis: WipKpi[];
  sampleRows: SampleRegisterRow[];
  onOpenDrillDown: (title: string, subtitle: string, companyIds: string[]) => void;
  onSelectCompany: (companyId: string) => void;
  onSelectDeal: (dealId: string) => void;
}

export function CommercialSamplesTab({
  wipKpis,
  sampleRows,
  onOpenDrillDown,
  onSelectCompany,
  onSelectDeal,
}: SamplesTabProps) {
  // Only sample-specific WIP cards (excluding commercial 'awaiting_payment')
  const sampleWipKpis = wipKpis.filter((w) => w.id !== "awaiting_payment");

  return (
    <div className="space-y-6">
      {/* ─── SAMPLE STATUS SUMMARY CARDS ─── */}
      <div>
        <div className="mb-3">
          <h3 className="text-sm font-semibold tracking-tight text-foreground flex items-center gap-2">
            <FlaskConical className="h-4 w-4 text-primary" />
            Текущее состояние работы с образцами
          </h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            Сводка по уникальным компаниям и связанным сделкам
          </p>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-2.5">
          {sampleWipKpis.map((wip) => (
            <Card
              key={wip.id}
              onClick={() =>
                onOpenDrillDown(
                  `Образцы: ${wip.label}`,
                  `${wip.companyCount} уникальных компаний`,
                  wip.companyIds
                )
              }
              className="cursor-pointer hover:border-primary/50 transition-all hover:shadow-xs group"
            >
              <CardHeader className="p-2.5 pb-1 flex flex-row items-center justify-between space-y-0">
                <span className="text-[11px] font-medium text-muted-foreground truncate group-hover:text-primary transition-colors" title={wip.label}>
                  {wip.label}
                </span>
              </CardHeader>
              <CardContent className="p-2.5 pt-0">
                <div className="text-lg font-bold tracking-tight">
                  {wip.companyCount}
                </div>
                <div className="text-[10px] text-muted-foreground mt-0.5">
                  {wip.dealCount} сделок
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>

      {/* ─── DETAILED SAMPLES TABLE ─── */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <div>
            <h3 className="text-sm font-semibold tracking-tight text-foreground">
              Реестр движения образцов ({sampleRows.length} записей)
            </h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              Детальные данные по сделкам с образцами и fallback-записи компаний
            </p>
          </div>
        </div>

        {sampleRows.length === 0 ? (
          <div className="py-12 text-center text-sm text-muted-foreground border rounded-lg bg-card">
            Нет данных по образцам для выбранных фильтров
          </div>
        ) : (
          <div className="rounded-lg border bg-card overflow-hidden">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/50">
                    <TableHead className="text-xs font-semibold">Компания</TableHead>
                    <TableHead className="text-xs font-semibold">Ответственный</TableHead>
                    <TableHead className="text-xs font-semibold">Сделка</TableHead>
                    <TableHead className="text-xs font-semibold">Продукт</TableHead>
                    <TableHead className="text-xs font-semibold">Статус образцов</TableHead>
                    <TableHead className="text-xs font-semibold">Дата отправки</TableHead>
                    <TableHead className="text-xs font-semibold">Дней с отправки</TableHead>
                    <TableHead className="text-xs font-semibold">Результат испытаний</TableHead>
                    <TableHead className="text-xs font-semibold">Марка ГЕЛЬ / ЗОЛЬ</TableHead>
                    <TableHead className="text-xs font-semibold">Кол-во</TableHead>
                    <TableHead className="text-xs font-semibold">Следующий шаг</TableHead>
                    <TableHead className="text-xs font-semibold">Источник</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sampleRows.map((row) => (
                    <TableRow key={row.id} className="hover:bg-muted/30">
                      {/* Компания */}
                      <TableCell className="text-xs font-medium">
                        <button
                          type="button"
                          onClick={() => onSelectCompany(row.companyId)}
                          className="text-left font-medium text-primary hover:underline flex items-center gap-1 cursor-pointer"
                        >
                          <span className="truncate max-w-[160px]">{row.companyTitle}</span>
                          <ExternalLink className="h-3 w-3 opacity-60 shrink-0" />
                        </button>
                      </TableCell>

                      {/* Ответственный */}
                      <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                        {row.responsibleName}
                      </TableCell>

                      {/* Сделка */}
                      <TableCell className="text-xs text-muted-foreground">
                        {row.dealId ? (
                          <button
                            type="button"
                            onClick={() => onSelectDeal(row.dealId!)}
                            className="text-left hover:underline flex items-center gap-1 cursor-pointer"
                          >
                            <span className="truncate max-w-[140px]">{row.dealTitle}</span>
                            <ExternalLink className="h-3 w-3 opacity-60 shrink-0" />
                          </button>
                        ) : (
                          <span className="text-muted-foreground/60">—</span>
                        )}
                      </TableCell>

                      {/* Продукт */}
                      <TableCell className="text-xs whitespace-nowrap">
                        {row.productType !== "—" ? (
                          <Badge variant="outline" className="text-[10px] font-normal">
                            {row.productType}
                          </Badge>
                        ) : (
                          <span className="text-muted-foreground/60">—</span>
                        )}
                      </TableCell>

                      {/* Статус образцов */}
                      <TableCell className="text-xs max-w-[200px]">
                        {row.statuses && row.statuses.length > 0 ? (
                          <div className="flex flex-wrap gap-1">
                            {row.statuses.map((s, idx) => (
                              <Badge key={idx} variant="secondary" className="text-[10px]">
                                {s}
                              </Badge>
                            ))}
                          </div>
                        ) : (
                          <Badge variant="secondary" className="text-[10px]">
                            {row.status}
                          </Badge>
                        )}
                      </TableCell>

                      {/* Дата отправки */}
                      <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                        {row.shipmentDate || "—"}
                      </TableCell>

                      {/* Дней с отправки */}
                      <TableCell className="text-xs whitespace-nowrap">
                        {row.daysSinceSent !== undefined ? (
                          <span className={row.daysSinceSent > 14 ? "text-amber-600 dark:text-amber-400 font-semibold" : ""}>
                            {row.daysSinceSent} дн.
                          </span>
                        ) : (
                          <span className="text-muted-foreground/60">—</span>
                        )}
                      </TableCell>

                      {/* Результат */}
                      <TableCell className="text-xs max-w-[180px] truncate text-muted-foreground" title={row.testResult}>
                        {row.testResult || "—"}
                      </TableCell>

                      {/* Марка */}
                      <TableCell className="text-xs whitespace-nowrap text-muted-foreground">
                        {[row.gradeGel, row.gradeSol].filter(Boolean).join(" / ") || "—"}
                      </TableCell>

                      {/* Кол-во */}
                      <TableCell className="text-xs whitespace-nowrap text-muted-foreground">
                        {[row.qtyGel, row.qtySol].filter(Boolean).join(" / ") || "—"}
                      </TableCell>

                      {/* Следующий шаг */}
                      <TableCell className="text-xs max-w-[180px] truncate text-muted-foreground" title={row.nextAction}>
                        {row.nextAction || "—"}
                      </TableCell>

                      {/* Источник */}
                      <TableCell className="text-xs whitespace-nowrap">
                        <Badge
                          variant="outline"
                          className={`text-[9px] px-1 py-0 ${
                            row.statusSource === "DEAL"
                              ? "border-sky-500/40 text-sky-700 dark:text-sky-400"
                              : "border-purple-500/40 text-purple-700 dark:text-purple-400"
                          }`}
                        >
                          {row.statusSource}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
