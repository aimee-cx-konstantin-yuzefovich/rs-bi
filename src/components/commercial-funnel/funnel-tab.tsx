"use client";

// src/components/commercial-funnel/funnel-tab.tsx
// Tab 2 — Воронка: "Где сейчас находится коммерческий портфель?"
// Two related tracks, NOT one fake linear funnel:
//   Track 1 — Образцы и испытания (current snapshot; period event only where dated)
//   Track 2 — Коммерциализация (current snapshot + period events, separated)
// Every count is clickable → exact drill-down (reconciles by company IDs).

import { useState } from "react";
import { ChevronRight } from "lucide-react";
import { formatCurrencyAmount, getCurrencyUniverse } from "@/lib/commercial-funnel/currency";
import {
  buildActiveDealsDrillDown,
  buildAwaitingPaymentDrillDown,
  buildContinuationDrillDown,
  buildDealsCreatedDrillDown,
  buildPaymentsReceivedDrillDown,
  buildSampleStageDrillDown,
  buildShipmentsDrillDown,
} from "@/lib/commercial-funnel/drill-down";
import type {
  CommercialCompany,
  CommercialDrillDownPayload,
  FunnelStageRow,
  FunnelView,
  PeriodBoundaries,
} from "@/lib/commercial-funnel/types";

interface FunnelTabProps {
  funnelView: FunnelView;
  boundaries: PeriodBoundaries;
  companies?: CommercialCompany[];
  onOpenDrillDown: (
    titleOrPayload: string | CommercialDrillDownPayload,
    subtitle?: string,
    companyIds?: string[]
  ) => void;
}

function StageButton({
  stage,
  companies,
  onOpenDrillDown,
  isSelected,
  onSelect,
}: {
  stage: FunnelStageRow;
  companies?: CommercialCompany[];
  onOpenDrillDown: FunnelTabProps["onOpenDrillDown"];
  isSelected?: boolean;
  onSelect?: () => void;
}) {
  const disabled = stage.companyCount === 0;
  const periodCount = stage.periodCompanyCount ?? stage.periodEventCount;

  return (
    <button
      type="button"
      disabled={disabled}
      onClick={() => {
        onSelect?.();
        if (companies) {
          onOpenDrillDown(buildSampleStageDrillDown(companies, stage.label));
        } else {
          onOpenDrillDown(
            `Воронка — ${stage.label}`,
            `Компании в текущем состоянии «${stage.label}»`,
            stage.companyIds
          );
        }
      }}
      className={`group flex items-center justify-between gap-3 w-full rounded-lg border px-3.5 py-2.5 text-left transition-colors ${
        disabled
          ? "border-border/50 bg-muted/30 opacity-60"
          : isSelected
          ? "border-primary/40 bg-primary/10 shadow-2xs cursor-pointer text-foreground"
          : "border-border bg-card hover:border-primary/40 hover:bg-primary/5 cursor-pointer"
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
          Компаний с отправкой за период:{" "}
          {periodCount === null ? "–" : periodCount}
        </div>
      </div>
      {!disabled && (
        <ChevronRight className="h-4 w-4 text-muted-foreground group-hover:text-primary transition-colors shrink-0" />
      )}
    </button>
  );
}

export function CommercialFunnelTab({
  funnelView,
  boundaries,
  companies,
  onOpenDrillDown,
}: FunnelTabProps) {
  const [selectedCardId, setSelectedCardId] = useState<string | null>(null);
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
          Компаний с отправкой за период показано только там, где существует подтверждённый
          факт отправки образцов. Для остальных состояний даты события отправки нет — отображается «–».
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-2">
          {funnelView.sampleTestingStages.map((stage) => (
            <StageButton
              key={stage.id}
              stage={stage}
              companies={companies}
              onOpenDrillDown={onOpenDrillDown}
              isSelected={selectedCardId === stage.id}
              onSelect={() => setSelectedCardId(stage.id)}
            />
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
                onClick={() => {
                  setSelectedCardId("active_deals");
                  if (companies) {
                    onOpenDrillDown(buildActiveDealsDrillDown(companies));
                  } else {
                    onOpenDrillDown(
                      "Активные коммерческие сделки",
                      "Компании с активными (не терминальными) сделками",
                      commercial.current.activeDeals.companyIds
                    );
                  }
                }}
                className={`rounded-lg border px-3.5 py-2.5 text-left transition-colors ${
                  commercial.current.activeDeals.count === 0
                    ? "border-border/50 bg-muted/30 opacity-60"
                    : selectedCardId === "active_deals"
                    ? "border-primary/40 bg-primary/10 shadow-2xs cursor-pointer text-foreground"
                    : "border-border bg-card hover:border-primary/40 hover:bg-primary/5 cursor-pointer"
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
                onClick={() => {
                  setSelectedCardId("awaiting_payment");
                  if (companies) {
                    onOpenDrillDown(buildAwaitingPaymentDrillDown(companies));
                  } else {
                    onOpenDrillDown(
                      "Ожидают оплаты",
                      "Компании со сделками, по которым выставлен счёт и ожидается оплата",
                      commercial.current.awaitingPayment.companyIds
                    );
                  }
                }}
                className={`rounded-lg border px-3.5 py-2.5 text-left transition-colors ${
                  commercial.current.awaitingPayment.count === 0
                    ? "border-border/50 bg-muted/30 opacity-60"
                    : selectedCardId === "awaiting_payment"
                    ? "border-primary/40 bg-primary/10 shadow-2xs cursor-pointer text-foreground"
                    : "border-border bg-card hover:border-primary/40 hover:bg-primary/5 cursor-pointer"
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
                onClick={() => {
                  setSelectedCardId("deals_created");
                  if (companies) {
                    onOpenDrillDown(buildDealsCreatedDrillDown(companies, boundaries));
                  } else {
                    onOpenDrillDown(
                      "Создано сделок за период",
                      "Компании, по которым созданы сделки в выбранном периоде",
                      commercial.period.dealsCreated.companyIds
                    );
                  }
                }}
                className={`rounded-lg border px-3.5 py-2.5 text-left transition-colors ${
                  commercial.period.dealsCreated.count === 0
                    ? "border-border/50 bg-muted/30 opacity-60"
                    : selectedCardId === "deals_created"
                    ? "border-primary/40 bg-primary/10 shadow-2xs cursor-pointer text-foreground"
                    : "border-border bg-card hover:border-primary/40 hover:bg-primary/5 cursor-pointer"
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
                onClick={() => {
                  setSelectedCardId("payments_received");
                  if (companies) {
                    onOpenDrillDown(buildPaymentsReceivedDrillDown(companies, boundaries));
                  } else {
                    onOpenDrillDown(
                      "Получена оплата за период",
                      "Компании, по которым получена оплата в выбранном периоде",
                      commercial.period.paymentsReceived.companyIds
                    );
                  }
                }}
                className={`rounded-lg border px-3.5 py-2.5 text-left transition-colors ${
                  commercial.period.paymentsReceived.count === 0
                    ? "border-border/50 bg-muted/30 opacity-60"
                    : selectedCardId === "payments_received"
                    ? "border-primary/40 bg-primary/10 shadow-2xs cursor-pointer text-foreground"
                    : "border-border bg-card hover:border-primary/40 hover:bg-primary/5 cursor-pointer"
                }`}
              >
                <div className="flex items-baseline gap-2">
                  <span className="text-lg font-semibold tabular-nums">
                    {commercial.period.paymentsReceived.count}
                  </span>
                  <span className="text-xs font-medium">Получена оплата</span>
                </div>
                <div className="text-[11px] text-muted-foreground mt-0.5">
                  {(() => {
                    const universe = getCurrencyUniverse(
                      commercial.period.paymentAmountsByCurrency,
                      commercial.period.paymentAmountQualityByCurrency
                    );
                    if (universe.length === 0) return "–";
                    return universe
                      .map((cur) => {
                        const quality =
                          commercial.period.paymentAmountQualityByCurrency?.[cur] || "COMPLETE";
                        const curLabel = cur === "UNKNOWN" ? "валюта не указана" : cur;
                        if (quality === "INVALID_ONLY") return `${curLabel} — ошибка данных`;
                        if (quality === "UNKNOWN") return `${curLabel} — нет данных`;
                        const amt = commercial.period.paymentAmountsByCurrency[cur];
                        const val = typeof amt === "number" ? amt : 0;
                        return `${formatCurrencyAmount(val, cur)}${quality === "PARTIAL" ? " (неполные данные)" : ""}`;
                      })
                      .join(" · ");
                  })()}
                </div>
              </button>

              <button
                type="button"
                disabled={commercial.period.shipments.count === 0}
                onClick={() => {
                  setSelectedCardId("shipments");
                  if (companies) {
                    onOpenDrillDown(buildShipmentsDrillDown(companies, boundaries));
                  } else {
                    onOpenDrillDown(
                      "Отгрузки за период",
                      "Компании, по которым прошли отгрузки в выбранном периоде",
                      commercial.period.shipments.companyIds
                    );
                  }
                }}
                className={`rounded-lg border px-3.5 py-2.5 text-left transition-colors ${
                  commercial.period.shipments.count === 0
                    ? "border-border/50 bg-muted/30 opacity-60"
                    : selectedCardId === "shipments"
                    ? "border-primary/40 bg-primary/10 shadow-2xs cursor-pointer text-foreground"
                    : "border-border bg-card hover:border-primary/40 hover:bg-primary/5 cursor-pointer"
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
            onClick={() => {
              if (companies) {
                onOpenDrillDown(buildContinuationDrillDown(companies, "positive"));
              } else {
                onOpenDrillDown(
                  "Положительный результат испытаний",
                  "Компании с текущим статусом «Подошли»",
                  continuation.positiveResult.companyIds
                );
              }
            }}
            className={`rounded-lg border px-3.5 py-2.5 text-left transition-colors ${
              continuation.positiveResult.count === 0
                ? "border-border/50 bg-muted/30 opacity-60"
                : "border-border bg-card hover:border-primary/40 hover:bg-primary/5 cursor-pointer"
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
            onClick={() => {
              if (companies) {
                onOpenDrillDown(buildContinuationDrillDown(companies, "continuation"));
              } else {
                onOpenDrillDown(
                  "Коммерческое продолжение",
                  "Компании с «Подошли» и продвинутой коммерческой сделкой",
                  continuation.withCommercialContinuation.companyIds
                );
              }
            }}
            className={`rounded-lg border px-3.5 py-2.5 text-left transition-colors ${
              continuation.withCommercialContinuation.count === 0
                ? "border-border/50 bg-muted/30 opacity-60"
                : "border-border bg-card hover:border-primary/40 hover:bg-primary/5 cursor-pointer"
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
