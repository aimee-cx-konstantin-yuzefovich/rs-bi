"use client";

// src/components/commercial-funnel/funnel-tab.tsx
// Tab 2 — Воронка: "Где сейчас находится коммерческий портфель?"
// Two related tracks, NOT one fake linear funnel:
//   Track 1 — Образцы и испытания (current snapshot; period event only where dated)
//   Track 2 — Коммерциализация (current snapshot + period events, separated)
// Every count is clickable → exact drill-down (reconciles by company IDs).

import { ChevronRight } from "lucide-react";
import { formatCurrencyAmount, getCurrencySymbol } from "@/lib/commercial-funnel/currency";
import { NEXT_ACTION_MISSING_LABEL } from "@/lib/commercial-funnel/analytics";
import type {
  AggregateAmountQuality,
  FunnelStageRow,
  FunnelView,
  PeriodBoundaries,
} from "@/lib/commercial-funnel/types";

interface FunnelTabProps {
  funnelView: FunnelView;
  boundaries: PeriodBoundaries;
  onOpenDrillDown: (title: string, subtitle: string, companyIds: string[]) => void;
}

function formatMoney(amount: number, currency: string): string {
  return `${formatCurrencyAmount(amount)} ${getCurrencySymbol(currency)}`;
}

const QUALITY_SUFFIX: Record<AggregateAmountQuality, string> = {
  COMPLETE: "",
  PARTIAL: " (неполные данные)",
  UNKNOWN: " (нет данных)",
  INVALID_ONLY: " (ошибка данных)",
};

function StageButton({
  stage,
  onOpenDrillDown,
}: {
  stage: FunnelStageRow;
  onOpenDrillDown: FunnelTabProps["onOpenDrillDown"];
}) {
  const disabled = stage.companyCount === 0;
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={() =>
        onOpenDrillDown(
          `Воронка — ${stage.label}`,
          `Компании в текущем состоянии «${stage.label}»`,
          stage.companyIds
        )
      }
      className={`group flex items-center justify-between gap-3 w-full rounded-lg border px-3.5 py-2.5 text-left transition-colors ${
        disabled
          ? "border-border/50 bg-muted/30 opacity-60"
          : "border-border bg-card hover:border-primary/40 hover:bg-accent/40 cursor-pointer"
      }`}
    >
      <div className="min-w-0">
        <div className="flex items-baseline gap-2">
          <span className="text-lg font-semibold tabular-nums">{stage.companyCount}</span>
          <span className="text-xs font-medium truncate">{stage.label}</span>
        </div>
        <div className="text-[11px] text-muted-foreground mt-0.5">
          Сделок: {stage.dealCount}
          {" · "}
          Событий за период:{" "}
          {stage.periodEventCount === null ? "–" : stage.periodEventCount}
        </div>
      </div>
      {!disabled && (
        <ChevronRight className="h-4 w-4 text-muted-foreground group-hover:text-primary transition-colors shrink-0" />
      )}
    </button>
  );
}

export function CommercialFunnelTab({ funnelView, boundaries, onOpenDrillDown }: FunnelTabProps) {
  const { commercial, continuation } = funnelView;

  return (
    <div className="space-y-4" data-testid="funnel-tab">
      {/* ── TRACK 1: Образцы и испытания ── */}
      <section className="rounded-xl border bg-card/60 p-4 shadow-2xs">
        <div className="flex items-baseline justify-between gap-2 mb-1">
          <h3 className="text-sm font-semibold">Образцы и испытания</h3>
          <span className="text-[11px] text-muted-foreground">
            Текущее состояние · период не ограничивает WIP
          </span>
        </div>
        <p className="text-[11px] text-muted-foreground mb-3">
          Событий за период показано только там, где существует достоверная датированная активность
          (отправка образцов). Для остальных состояний достоверной даты события нет — отображается «–».
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-2">
          {funnelView.sampleTestingStages.map((stage) => (
            <StageButton key={stage.id} stage={stage} onOpenDrillDown={onOpenDrillDown} />
          ))}
        </div>
      </section>

      {/* ── TRACK 2: Коммерциализация ── */}
      <section className="rounded-xl border bg-card/60 p-4 shadow-2xs">
        <h3 className="text-sm font-semibold mb-3">Коммерциализация</h3>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* CURRENT SNAPSHOT */}
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground mb-2">
              Сейчас
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <button
                type="button"
                disabled={commercial.current.activeDeals.count === 0}
                onClick={() =>
                  onOpenDrillDown(
                    "Активные коммерческие сделки",
                    "Компании с активными (не терминальными) сделками",
                    commercial.current.activeDeals.companyIds
                  )
                }
                className={`rounded-lg border px-3.5 py-2.5 text-left transition-colors ${
                  commercial.current.activeDeals.count === 0
                    ? "border-border/50 bg-muted/30 opacity-60"
                    : "border-border bg-card hover:border-primary/40 hover:bg-accent/40 cursor-pointer"
                }`}
              >
                <div className="flex items-baseline gap-2">
                  <span className="text-lg font-semibold tabular-nums">
                    {commercial.current.activeDeals.count}
                  </span>
                  <span className="text-xs font-medium">Активные сделки</span>
                </div>
                <div className="text-[11px] text-muted-foreground mt-0.5">
                  Сделок: {commercial.current.dealCount}
                </div>
              </button>

              <button
                type="button"
                disabled={commercial.current.awaitingPayment.count === 0}
                onClick={() =>
                  onOpenDrillDown(
                    "Ожидают оплаты",
                    "Компании со сделками, по которым выставлен счёт и ожидается оплата",
                    commercial.current.awaitingPayment.companyIds
                  )
                }
                className={`rounded-lg border px-3.5 py-2.5 text-left transition-colors ${
                  commercial.current.awaitingPayment.count === 0
                    ? "border-border/50 bg-muted/30 opacity-60"
                    : "border-border bg-card hover:border-primary/40 hover:bg-accent/40 cursor-pointer"
                }`}
              >
                <div className="flex items-baseline gap-2">
                  <span className="text-lg font-semibold tabular-nums">
                    {commercial.current.awaitingPayment.count}
                  </span>
                  <span className="text-xs font-medium">Ожидают оплаты</span>
                </div>
                <div className="text-[11px] text-muted-foreground mt-0.5">
                  Сделок: {commercial.current.awaitingPaymentDealCount}
                </div>
              </button>
            </div>
          </div>

          {/* PERIOD EVENTS */}
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground mb-2">
              За выбранный период
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <button
                type="button"
                disabled={commercial.period.dealsCreated.count === 0}
                onClick={() =>
                  onOpenDrillDown(
                    "Создано сделок за период",
                    "Компании, по которым созданы сделки в выбранном периоде",
                    commercial.period.dealsCreated.companyIds
                  )
                }
                className={`rounded-lg border px-3.5 py-2.5 text-left transition-colors ${
                  commercial.period.dealsCreated.count === 0
                    ? "border-border/50 bg-muted/30 opacity-60"
                    : "border-border bg-card hover:border-primary/40 hover:bg-accent/40 cursor-pointer"
                }`}
              >
                <div className="flex items-baseline gap-2">
                  <span className="text-lg font-semibold tabular-nums">
                    {commercial.period.dealsCreated.count}
                  </span>
                  <span className="text-xs font-medium">Создано сделок</span>
                </div>
                <div className="text-[11px] text-muted-foreground mt-0.5">компаний за период</div>
              </button>

              <button
                type="button"
                disabled={commercial.period.paymentsReceived.count === 0}
                onClick={() =>
                  onOpenDrillDown(
                    "Получена оплата за период",
                    "Компании, по которым получена оплата в выбранном периоде",
                    commercial.period.paymentsReceived.companyIds
                  )
                }
                className={`rounded-lg border px-3.5 py-2.5 text-left transition-colors ${
                  commercial.period.paymentsReceived.count === 0
                    ? "border-border/50 bg-muted/30 opacity-60"
                    : "border-border bg-card hover:border-primary/40 hover:bg-accent/40 cursor-pointer"
                }`}
              >
                <div className="flex items-baseline gap-2">
                  <span className="text-lg font-semibold tabular-nums">
                    {commercial.period.paymentsReceived.count}
                  </span>
                  <span className="text-xs font-medium">Получена оплата</span>
                </div>
                <div className="text-[11px] text-muted-foreground mt-0.5">
                  {Object.keys(commercial.period.paymentAmountsByCurrency).length === 0
                    ? "–"
                    : Object.entries(commercial.period.paymentAmountsByCurrency)
                        .map(([cur, amount]) => {
                          const quality =
                            commercial.period.paymentAmountQualityByCurrency?.[cur] || "COMPLETE";
                          return `${formatMoney(amount, cur)}${QUALITY_SUFFIX[quality]}`;
                        })
                        .join(" · ")}
                </div>
              </button>

              <button
                type="button"
                disabled={commercial.period.shipments.count === 0}
                onClick={() =>
                  onOpenDrillDown(
                    "Отгрузки за период",
                    "Компании, по которым прошли отгрузки в выбранном периоде",
                    commercial.period.shipments.companyIds
                  )
                }
                className={`rounded-lg border px-3.5 py-2.5 text-left transition-colors ${
                  commercial.period.shipments.count === 0
                    ? "border-border/50 bg-muted/30 opacity-60"
                    : "border-border bg-card hover:border-primary/40 hover:bg-accent/40 cursor-pointer"
                }`}
              >
                <div className="flex items-baseline gap-2">
                  <span className="text-lg font-semibold tabular-nums">
                    {commercial.period.shipments.count}
                  </span>
                  <span className="text-xs font-medium">Отгрузки</span>
                </div>
                <div className="text-[11px] text-muted-foreground mt-0.5">компаний за период</div>
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* ── CONNECTION: положительный результат → коммерческое продолжение ── */}
      <section className="rounded-xl border bg-card/60 p-4 shadow-2xs">
        <h3 className="text-sm font-semibold mb-1">
          Положительный результат → коммерческое продолжение
        </h3>
        <p className="text-[11px] text-muted-foreground mb-3">
          Сопоставление текущих состояний по одним и тем же компаниям: из компаний с текущим статусом
          «Подошли» у части уже есть коммерческая сделка, продвинувшаяся за стартовые этапы.
          Это свидетельство продолжения, а не историческая конверсия — процент не вычисляется.
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            disabled={continuation.positiveResult.count === 0}
            onClick={() =>
              onOpenDrillDown(
                "Положительный результат испытаний",
                "Компании с текущим статусом «Подошли»",
                continuation.positiveResult.companyIds
              )
            }
            className={`rounded-lg border px-3.5 py-2.5 text-left transition-colors ${
              continuation.positiveResult.count === 0
                ? "border-border/50 bg-muted/30 opacity-60"
                : "border-border bg-card hover:border-primary/40 hover:bg-accent/40 cursor-pointer"
            }`}
          >
            <div className="flex items-baseline gap-2">
              <span className="text-lg font-semibold tabular-nums">
                {continuation.positiveResult.count}
              </span>
              <span className="text-xs font-medium">Подошли</span>
            </div>
          </button>

          <span className="text-muted-foreground text-xs">→</span>

          <button
            type="button"
            disabled={continuation.withCommercialContinuation.count === 0}
            onClick={() =>
              onOpenDrillDown(
                "Коммерческое продолжение",
                "Компании с «Подошли» и продвинутой коммерческой сделкой",
                continuation.withCommercialContinuation.companyIds
              )
            }
            className={`rounded-lg border px-3.5 py-2.5 text-left transition-colors ${
              continuation.withCommercialContinuation.count === 0
                ? "border-border/50 bg-muted/30 opacity-60"
                : "border-border bg-card hover:border-primary/40 hover:bg-accent/40 cursor-pointer"
            }`}
          >
            <div className="flex items-baseline gap-2">
              <span className="text-lg font-semibold tabular-nums">
                {continuation.withCommercialContinuation.count}
              </span>
              <span className="text-xs font-medium">Есть коммерческое продолжение</span>
            </div>
          </button>
        </div>
      </section>
    </div>
  );
}
