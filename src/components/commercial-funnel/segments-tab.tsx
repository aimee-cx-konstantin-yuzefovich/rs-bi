"use client";

// src/components/commercial-funnel/segments-tab.tsx
// Tab 3 — Сегменты: "В каких рынках / продуктах / направлениях результат и проблема?"
// Local UI state: dimension selector only (Отрасли | Направления | Продукты).
// Matrix with grouped CURRENT / ЗА ПЕРИОД headers; missing values become
// "Не указано"; Итого = union of unique company IDs (never row sums);
// multi-value footnote for Product/Direction; cells drill down exactly.

import { useMemo, useState } from "react";
import { ChevronRight } from "lucide-react";
import type {
  CountedPopulation,
  SegmentBreakdown,
  SegmentDimension,
  SegmentRow,
} from "@/lib/commercial-funnel/types";

interface SegmentsTabProps {
  industryBreakdown: SegmentBreakdown;
  directionBreakdown: SegmentBreakdown;
  regionBreakdown: SegmentBreakdown;
  productBreakdown: SegmentBreakdown;
  onOpenDrillDown: (title: string, subtitle: string, companyIds: string[]) => void;
}

type ColumnKey =
  | "activeCompanies"
  | "requireSamples"
  | "samplesSent"
  | "inTesting"
  | "passed"
  | "failed"
  | "rework"
  | "activeDeals"
  | "awaitingPayment"
  | "requireAttention"
  | "newCompanies"
  | "periodSamplesSent"
  | "dealsCreated"
  | "paymentsReceived"
  | "shipments";

const CURRENT_COLUMNS: Array<{ key: keyof SegmentRow["current"]; label: string }> = [
  { key: "activeCompanies", label: "Компании в текущем контуре" },
  { key: "requireSamples", label: "Требуются образцы" },
  { key: "samplesSent", label: "Отправлены" },
  { key: "inTesting", label: "На испытаниях" },
  { key: "passed", label: "Подошли" },
  { key: "failed", label: "Не подошли" },
  { key: "rework", label: "Доработка" },
  { key: "activeDeals", label: "Активные сделки" },
  { key: "awaitingPayment", label: "Ожидают оплаты" },
  { key: "requireAttention", label: "Требуют внимания" },
];

const PERIOD_COLUMNS: Array<{ key: keyof SegmentRow["period"]; label: string }> = [
  { key: "newCompanies", label: "Новые компании" },
  { key: "samplesSent", label: "Компании с отправл. образцами" },
  { key: "dealsCreated", label: "Компании с созд. сделками" },
  { key: "paymentsReceived", label: "Компании с оплатой" },
  { key: "shipments", label: "Компании с отгрузками" },
];

function Cell({
  pop,
  row,
  columnLabel,
  onOpenDrillDown,
}: {
  pop: CountedPopulation;
  row: SegmentRow;
  columnLabel: string;
  onOpenDrillDown: SegmentsTabProps["onOpenDrillDown"];
}) {
  if (pop.count === 0) {
    return <span className="text-muted-foreground/50 tabular-nums">0</span>;
  }
  return (
    <button
      type="button"
      onClick={() =>
        onOpenDrillDown(
          `${row.label} — ${columnLabel}`,
          `Компании сегмента «${row.label}» с состоянием «${columnLabel}»`,
          pop.companyIds
        )
      }
      className="tabular-nums font-medium text-primary hover:underline cursor-pointer"
      title={`Открыть ${pop.count} компани(й)`}
    >
      {pop.count}
    </button>
  );
}

export function CommercialSegmentsTab({
  industryBreakdown,
  directionBreakdown,
  regionBreakdown,
  productBreakdown,
  onOpenDrillDown,
}: SegmentsTabProps) {
  const [dimension, setDimension] = useState<SegmentDimension>("industry");

  const breakdown = useMemo(() => {
    if (dimension === "industry") return industryBreakdown;
    if (dimension === "direction") return directionBreakdown;
    if (dimension === "region") return regionBreakdown;
    return productBreakdown;
  }, [dimension, industryBreakdown, directionBreakdown, regionBreakdown, productBreakdown]);

  const dimensionLabels: Record<SegmentDimension, string> = {
    industry: "Отрасли",
    direction: "Направления",
    region: "Регионы",
    product: "Продукты",
  };

  return (
    <div className="space-y-3" data-testid="segments-tab">
      {/* Local dimension selector (UI state only — never changes business truth) */}
      <div className="flex items-center gap-1" data-testid="segments-dimension-selector">
        {(Object.keys(dimensionLabels) as SegmentDimension[]).map((dim) => (
          <button
            key={dim}
            type="button"
            onClick={() => setDimension(dim)}
            className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors cursor-pointer ${
              dimension === dim
                ? "bg-primary text-primary-foreground shadow-2xs"
                : "bg-muted/70 text-muted-foreground hover:bg-muted hover:text-foreground"
            }`}
          >
            {dimensionLabels[dim]}
          </button>
        ))}
      </div>

      {breakdown.isMultiValueDimension && (
        <p className="text-[11px] text-muted-foreground">
          Компания может относиться к нескольким значениям данного измерения;
          сумма строк может превышать число уникальных компаний.
        </p>
      )}

      <div className="rounded-xl border bg-card/60 shadow-2xs overflow-x-auto">
        <table className="w-full text-xs" data-testid="segments-matrix">
          <thead>
            <tr className="border-b bg-muted/40">
              <th rowSpan={2} className="sticky left-0 bg-muted/40 text-left font-semibold px-3 py-2 min-w-[180px]">
                Сегмент
              </th>
              <th
                colSpan={CURRENT_COLUMNS.length}
                className="text-center font-semibold px-3 py-1.5 border-l border-border/60"
              >
                Сейчас
              </th>
              <th
                colSpan={PERIOD_COLUMNS.length}
                className="text-center font-semibold px-3 py-1.5 border-l border-border/60"
              >
                За период
              </th>
            </tr>
            <tr className="border-b bg-muted/20">
              {CURRENT_COLUMNS.map((col, i) => (
                <th
                  key={col.key}
                  className={`font-medium text-muted-foreground px-2 py-1.5 whitespace-nowrap ${
                    i === 0 ? "border-l border-border/60" : ""
                  }`}
                  title={
                    col.key === "activeCompanies"
                      ? "Компании в текущем контуре: у компании есть текущее состояние по образцам и/или активная коммерческая сделка."
                      : undefined
                  }
                >
                  {col.label}
                </th>
              ))}
              {PERIOD_COLUMNS.map((col, i) => (
                <th
                  key={col.key}
                  className={`font-medium text-muted-foreground px-2 py-1.5 whitespace-nowrap ${
                    i === 0 ? "border-l border-border/60" : ""
                  }`}
                >
                  {col.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {breakdown.rows.map((row) => (
              <tr key={row.label} className="border-b border-border/40 hover:bg-accent/30">
                <td
                  className={`sticky left-0 bg-card px-3 py-2 font-medium ${
                    row.isMissingValue ? "italic text-muted-foreground" : ""
                  }`}
                >
                  {row.label}
                </td>
                {CURRENT_COLUMNS.map((col, i) => (
                  <td key={col.key} className={`px-2 py-2 text-center ${i === 0 ? "border-l border-border/40" : ""}`}>
                    <Cell
                      pop={row.current[col.key]}
                      row={row}
                      columnLabel={col.label}
                      onOpenDrillDown={onOpenDrillDown}
                    />
                  </td>
                ))}
                {PERIOD_COLUMNS.map((col, i) => (
                  <td key={col.key} className={`px-2 py-2 text-center ${i === 0 ? "border-l border-border/40" : ""}`}>
                    <Cell
                      pop={row.period[col.key]}
                      row={row}
                      columnLabel={`${col.label} (за период)`}
                      onOpenDrillDown={onOpenDrillDown}
                    />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t bg-muted/30 font-semibold">
              <td className="sticky left-0 bg-muted/30 px-3 py-2">
                Итого по уникальным компаниям
              </td>
              <td colSpan={CURRENT_COLUMNS.length + PERIOD_COLUMNS.length} className="px-3 py-2 border-l border-border/40">
                <button
                  type="button"
                  onClick={() =>
                    onOpenDrillDown(
                      "Все компании аналитического среза",
                      "Уникальные компании текущего глобального фильтра",
                      breakdown.totalUniqueCompanyIds
                    )
                  }
                  className="tabular-nums text-primary hover:underline cursor-pointer"
                >
                  {breakdown.totalUniqueCompanyIds.length}
                </button>
                <span className="ml-2 font-normal text-muted-foreground">
                  {breakdown.isMultiValueDimension
                    ? "(не сумма строк: компании с несколькими значениями посчитаны один раз)"
                    : ""}
                </span>
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}
