"use client";

// src/components/commercial-funnel/managers-tab.tsx
// Managers scorecard view.
// Operational visibility without artificial ranking (Section 19).

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Users } from "lucide-react";
import type { ManagerScorecardRow } from "@/lib/commercial-funnel/types";
import { formatCurrencyAmount } from "@/lib/commercial-funnel/normalize";

interface ManagersTabProps {
  scorecard: ManagerScorecardRow[];
  onOpenDrillDown: (title: string, subtitle: string, companyIds: string[]) => void;
}

export function CommercialManagersTab({
  scorecard,
  onOpenDrillDown,
}: ManagersTabProps) {
  // Aggregate non-monetary totals row
  const totals = scorecard.reduce(
    (acc, row) => ({
      newCompanies: acc.newCompanies + row.newCompanies,
      samplesSent: acc.samplesSent + row.samplesSent,
      inTesting: acc.inTesting + row.inTesting,
      sampleSuccess: acc.sampleSuccess + row.sampleSuccess,
      sampleFail: acc.sampleFail + row.sampleFail,
      sampleRework: acc.sampleRework + row.sampleRework,
      dealsCreated: acc.dealsCreated + row.dealsCreated,
      paymentsReceived: acc.paymentsReceived + row.paymentsReceived,
      bottlenecksCount: acc.bottlenecksCount + row.bottlenecksCount,
    }),
    {
      newCompanies: 0,
      samplesSent: 0,
      inTesting: 0,
      sampleSuccess: 0,
      sampleFail: 0,
      sampleRework: 0,
      dealsCreated: 0,
      paymentsReceived: 0,
      bottlenecksCount: 0,
    }
  );

  // Compute multi-currency payment totals across all managers without cross-currency summation
  const totalPaymentAmountsByCurrency: Record<string, number> = {};
  for (const row of scorecard) {
    if (row.paymentAmountsByCurrency && Object.keys(row.paymentAmountsByCurrency).length > 0) {
      for (const [cur, amt] of Object.entries(row.paymentAmountsByCurrency)) {
        totalPaymentAmountsByCurrency[cur] = (totalPaymentAmountsByCurrency[cur] || 0) + amt;
      }
    } else if (row.paymentAmount !== null && row.paymentAmount > 0) {
      totalPaymentAmountsByCurrency["UNKNOWN"] = (totalPaymentAmountsByCurrency["UNKNOWN"] || 0) + row.paymentAmount;
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold tracking-tight text-foreground flex items-center gap-2">
            <Users className="h-4 w-4 text-primary" />
            Операционный срез по менеджерам ({scorecard.length})
          </h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            Сводка активности за период и текущий портфель в работе (без искусственного ранжирования)
          </p>
        </div>
      </div>

      {scorecard.length === 0 ? (
        <div className="py-12 text-center text-sm text-muted-foreground border rounded-lg bg-card">
          Нет данных по менеджерам для выбранных фильтров
        </div>
      ) : (
        <div className="rounded-lg border bg-card overflow-hidden">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/50">
                  <TableHead className="text-xs font-semibold">Менеджер</TableHead>
                  <TableHead className="text-xs font-semibold text-right">Новые компании</TableHead>
                  <TableHead className="text-xs font-semibold text-right">Образцы отправлены</TableHead>
                  <TableHead className="text-xs font-semibold text-right">На испытании</TableHead>
                  <TableHead className="text-xs font-semibold text-right">Подошли</TableHead>
                  <TableHead className="text-xs font-semibold text-right">Не подошли</TableHead>
                  <TableHead className="text-xs font-semibold text-right">Доработка</TableHead>
                  <TableHead className="text-xs font-semibold text-right">Создано сделок</TableHead>
                  <TableHead className="text-xs font-semibold text-right">Получено оплат</TableHead>
                  <TableHead className="text-xs font-semibold text-right" title="Сумма сделок с полученной оплатой">Сумма сделок с получ. оплатой</TableHead>
                  <TableHead className="text-xs font-semibold text-right">Требуют внимания</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {scorecard.map((row) => (
                  <TableRow
                    key={row.responsibleId}
                    className="hover:bg-muted/30 cursor-pointer"
                    onClick={() =>
                      onOpenDrillDown(
                        `Компании менеджера: ${row.name}`,
                        `Всего компаний в портфеле: ${row.companyIds.length}`,
                        row.companyIds
                      )
                    }
                  >
                    <TableCell className="text-xs font-medium whitespace-nowrap">
                      {row.name}
                    </TableCell>
                    <TableCell className="text-xs text-right font-medium">
                      {row.newCompanies || "—"}
                    </TableCell>
                    <TableCell className="text-xs text-right font-medium">
                      {row.samplesSent || "—"}
                    </TableCell>
                    <TableCell className="text-xs text-right font-medium">
                      {row.inTesting || "—"}
                    </TableCell>
                    <TableCell className="text-xs text-right text-emerald-600 dark:text-emerald-400 font-medium">
                      {row.sampleSuccess || "—"}
                    </TableCell>
                    <TableCell className="text-xs text-right text-rose-600 dark:text-rose-400 font-medium">
                      {row.sampleFail || "—"}
                    </TableCell>
                    <TableCell className="text-xs text-right text-amber-600 dark:text-amber-400 font-medium">
                      {row.sampleRework || "—"}
                    </TableCell>
                    <TableCell className="text-xs text-right font-medium">
                      {row.dealsCreated || "—"}
                    </TableCell>
                    <TableCell className="text-xs text-right font-medium">
                      {row.paymentsReceived || "—"}
                    </TableCell>
                    <TableCell className="text-xs text-right font-semibold whitespace-nowrap">
                      {row.paymentAmountsByCurrency && Object.keys(row.paymentAmountsByCurrency).length > 0 ? (
                        <div className="flex flex-col gap-0.5 items-end">
                          {Object.entries(row.paymentAmountsByCurrency).map(([cur, amt]) => (
                            <span key={cur}>{formatCurrencyAmount(amt, cur)}</span>
                          ))}
                        </div>
                      ) : row.paymentAmount !== null && row.paymentAmount > 0 ? (
                        formatCurrencyAmount(row.paymentAmount, "UNKNOWN")
                      ) : (
                        "—"
                      )}
                    </TableCell>
                    <TableCell className="text-xs text-right">
                      {row.bottlenecksCount > 0 ? (
                        <Badge variant="destructive" className="text-[10px] px-1.5 py-0">
                          {row.bottlenecksCount}
                        </Badge>
                      ) : (
                        <span className="text-muted-foreground/60">—</span>
                      )}
                    </TableCell>
                  </TableRow>
                ))}

                {/* Totals row */}
                <TableRow className="bg-muted/60 font-semibold border-t-2">
                  <TableCell className="text-xs font-bold">ИТОГО</TableCell>
                  <TableCell className="text-xs text-right font-bold">{totals.newCompanies}</TableCell>
                  <TableCell className="text-xs text-right font-bold">{totals.samplesSent}</TableCell>
                  <TableCell className="text-xs text-right font-bold">{totals.inTesting}</TableCell>
                  <TableCell className="text-xs text-right font-bold text-emerald-600 dark:text-emerald-400">
                    {totals.sampleSuccess}
                  </TableCell>
                  <TableCell className="text-xs text-right font-bold text-rose-600 dark:text-rose-400">
                    {totals.sampleFail}
                  </TableCell>
                  <TableCell className="text-xs text-right font-bold text-amber-600 dark:text-amber-400">
                    {totals.sampleRework}
                  </TableCell>
                  <TableCell className="text-xs text-right font-bold">{totals.dealsCreated}</TableCell>
                  <TableCell className="text-xs text-right font-bold">{totals.paymentsReceived}</TableCell>
                  <TableCell className="text-xs text-right font-bold whitespace-nowrap">
                    {Object.keys(totalPaymentAmountsByCurrency).length > 0 ? (
                      <div className="flex flex-col gap-0.5 items-end">
                        {Object.entries(totalPaymentAmountsByCurrency).map(([cur, amt]) => (
                          <span key={cur}>{formatCurrencyAmount(amt, cur)}</span>
                        ))}
                      </div>
                    ) : (
                      "—"
                    )}
                  </TableCell>
                  <TableCell className="text-xs text-right font-bold">
                    {totals.bottlenecksCount > 0 ? (
                      <Badge variant="destructive" className="text-[10px] px-1.5 py-0 font-bold">
                        {totals.bottlenecksCount}
                      </Badge>
                    ) : (
                      "0"
                    )}
                  </TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </div>
        </div>
      )}
    </div>
  );
}
