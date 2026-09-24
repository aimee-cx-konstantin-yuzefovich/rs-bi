"use client";

// src/components/dashboard/samples/samples-kpi-cards.tsx
// KPI summary — COMPANY grain only. All labels say «Компаний …»:
// these are counts of companies, never physical sample counts.

import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import type { SamplesKpis } from "@/lib/samples/types";

const CARDS: Array<{
  key: keyof SamplesKpis;
  title: string;
  hint: string;
  accent: string;
}> = [
  {
    key: "total",
    title: "Компаний с образцами",
    hint: "в текущем отборе",
    accent: "text-primary",
  },
  {
    key: "withSentDates",
    title: "С переданными образцами",
    hint: "есть ≥1 дата передачи",
    accent: "text-sky-600 dark:text-sky-400",
  },
  {
    key: "inTesting",
    title: "На испытании",
    hint: "статус испытания / ожидание",
    accent: "text-amber-600 dark:text-amber-400",
  },
  {
    key: "withResult",
    title: "С полученным результатом",
    hint: "включая смешанный",
    accent: "text-violet-600 dark:text-violet-400",
  },
  {
    key: "positive",
    title: "С положительным результатом",
    hint: "только однозначный",
    accent: "text-emerald-600 dark:text-emerald-400",
  },
  {
    key: "negative",
    title: "С отрицательным результатом",
    hint: "только однозначный",
    accent: "text-red-600 dark:text-red-400",
  },
  {
    key: "rework",
    title: "С доработкой",
    hint: "требуется доработка / модификация",
    accent: "text-orange-600 dark:text-orange-400",
  },
  {
    key: "ambiguous",
    title: "С неоднозначными данными",
    hint: "противоречивые источники",
    accent: "text-yellow-600 dark:text-yellow-400",
  },
];

export function SamplesKpiCards({
  kpis,
  loading,
}: {
  kpis: SamplesKpis;
  loading: boolean;
}) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
      {CARDS.map(({ key, title, hint, accent }) => (
        <Card key={key} className="py-3">
          <CardContent className="px-3">
            {loading ? (
              <>
                <Skeleton className="h-7 w-12 mb-1.5" />
                <Skeleton className="h-3.5 w-full" />
              </>
            ) : (
              <>
                <div className={`text-2xl font-bold tabular-nums leading-none ${accent}`}>
                  {kpis[key]}
                </div>
                <div className="mt-1.5 text-[11px] font-medium leading-tight text-foreground/80">
                  {title}
                </div>
                <div className="text-[10px] leading-tight text-muted-foreground">
                  {hint}
                </div>
              </>
            )}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
