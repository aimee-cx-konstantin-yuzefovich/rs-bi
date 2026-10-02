"use client";

// src/components/commercial-funnel/overview-tab.tsx
// Tab 1 — Обзор: "Что происходит с бизнесом в целом?"
// COMPACT, three conceptual sections:
//   A. Результаты за период (event metrics, authoritative DatedKpis)
//   B. Компактный текущий портфель (two tracks, every number clickable)
//   C. Управленческие сигналы (existing deterministic bottleneck rules only)

import { useState } from "react";
import { ChevronRight } from "lucide-react";
import { formatCurrencyAmount, getCurrencyUniverse } from "@/lib/commercial-funnel/currency";
import { UNCLASSIFIED_LABEL } from "@/lib/commercial-funnel/constants";
import {
  buildActiveDealsDrillDown,
  buildAwaitingPaymentDrillDown,
  buildContinuationDrillDown,
  buildDealsCreatedDrillDown,
  buildNewCompaniesDrillDown,
  buildPaymentsReceivedDrillDown,
  buildSampleStageDrillDown,
  buildSamplesSentDrillDown,
  buildShipmentsDrillDown,
  buildSignalDrillDown,
} from "@/lib/commercial-funnel/drill-down";
import type {
  CommercialCompany,
  CommercialDrillDownPayload,
  DatedKpi,
  FunnelView,
  ManagementSignal,
  PeriodBoundaries,
} from "@/lib/commercial-funnel/types";

interface OverviewTabProps {
  datedKpis: DatedKpi[];
  funnelView: FunnelView;
  boundaries: PeriodBoundaries;
  managementSignals: ManagementSignal[];
  companies?: CommercialCompany[];
  unavailable?: boolean;
  onOpenDrillDown: (
    titleOrPayload: string | CommercialDrillDownPayload,
    subtitle?: string,
    companyIds?: string[]
  ) => void;
}

const PERIOD_KPI_IDS = [
  "new_companies",
  "samples_sent",
  "deals_created",
  "payments_received",
  "payment_amount",
  "shipments",
] as const;

function MiniStat({
  label,
  count,
  companyIds,
  onOpenDrillDown,
  title,
  subtitle,
  payload,
  accent = false,
  unavailable = false,
}: {
  label: string;
  count: number;
  companyIds: string[];
  onOpenDrillDown: OverviewTabProps["onOpenDrillDown"];
  title: string;
  subtitle: string;
  payload?: CommercialDrillDownPayload;
  accent?: boolean;
  unavailable?: boolean;
}) {
  const disabled = count === 0 || unavailable;
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={() => {
        if (payload) {
          onOpenDrillDown(payload);
        } else {
          onOpenDrillDown(title, subtitle, companyIds);
        }
      }}
      className={`group flex items-center justify-between gap-2 rounded-lg border px-3 py-2 text-left transition-colors ${
        disabled
          ? "border-border/50 bg-muted/30 opacity-60"
          : accent
          ? "border-rose-200 dark:border-rose-900 bg-rose-50/60 dark:bg-rose-950/20 hover:border-rose-400 cursor-pointer"
          : "border-border bg-card hover:border-primary/40 hover:bg-accent/40 cursor-pointer"
      }`}
    >
      <div className="min-w-0">
        <div className="flex items-baseline gap-1.5">
          <span className="text-base font-semibold tabular-nums">{unavailable ? "—" : count}</span>
          <span className="text-[11px] font-medium truncate">{label}</span>
        </div>
        {subtitle && <div className="text-[10px] text-muted-foreground truncate">{subtitle}</div>}
      </div>
      {!disabled && (
        <ChevronRight className="h-3.5 w-3.5 text-muted-foreground group-hover:text-primary shrink-0" />
      )}
    </button>
  );
}

function findKpi(kpis: DatedKpi[], id: string): DatedKpi | undefined {
  return kpis.find((k) => k.id === id);
}

/**
 * Truthful per-currency money line for a KPI card.
 * Preserves the financial-quality invariant: PARTIAL gets a note,
 * UNKNOWN → "нет данных", INVALID_ONLY → "ошибка данных"; currencies are
 * never cross-summed. Returns null for non-currency KPIs.
 */
function currencyLine(kpi: DatedKpi): string | null {
  if (!kpi.isCurrency) return null;
  if (kpi.isMultiCurrency && kpi.currencyBreakdown) {
    const universe = getCurrencyUniverse(
      kpi.currencyBreakdown.current,
      kpi.currencyBreakdown.previous,
      kpi.currencyBreakdownQuality?.current,
      kpi.currencyBreakdownQuality?.previous
    );
    if (universe.length === 0) return null;
    return universe
      .map((cur) => {
        const q = kpi.currencyBreakdownQuality?.current?.[cur] || "COMPLETE";
        const curLabel = cur === "UNKNOWN" ? "валюта не указана" : cur;
        if (q === "INVALID_ONLY") return `${curLabel} — ошибка данных`;
        if (q === "UNKNOWN") return `${curLabel} — нет данных`;
        const amt = kpi.currencyBreakdown!.current[cur];
        const val = typeof amt === "number" ? amt : 0;
        return `${formatCurrencyAmount(val, cur)}${q === "PARTIAL" ? " (неполные данные)" : ""}`;
      })
      .join(" · ");
  }
  const q = kpi.amountQuality || "COMPLETE";
  const curLabel = kpi.currencyId === "UNKNOWN" ? "валюта не указана" : kpi.currencyId;
  if (q === "INVALID_ONLY") return curLabel ? `${curLabel} — ошибка данных` : "— (ошибка данных)";
  if (q === "UNKNOWN") return curLabel ? `${curLabel} — нет данных` : "— (нет данных)";
  const val = kpi.currentValue ?? 0;
  return `${formatCurrencyAmount(val, kpi.currencyId)}${q === "PARTIAL" ? " (неполные данные)" : ""}`;
}

export function CommercialOverviewTab({
  datedKpis,
  funnelView,
  boundaries,
  managementSignals,
  companies,
  unavailable = false,
  onOpenDrillDown,
}: OverviewTabProps) {
  const [selectedKpiId, setSelectedKpiId] = useState<string | null>(null);
  const { commercial, continuation, sampleTestingStages } = funnelView;
  const stage = (id: string) => sampleTestingStages.find((s) => s.id === id);

  const isAllTime = boundaries.isAllTime;

  const periodRows = PERIOD_KPI_IDS.map((id) => findKpi(datedKpis, id)).filter(
    (k): k is DatedKpi => Boolean(k)
  );

  return (
    <div className="space-y-4" data-testid="overview-tab">
      {/* ── A. РЕЗУЛЬТАТЫ ЗА ПЕРИОД ── */}
      <section className="rounded-xl border bg-card/60 p-4 shadow-2xs">
        <div className="flex items-baseline justify-between gap-2 mb-3">
          <h3 className="text-sm font-semibold">Результаты за период</h3>
          <span className="text-[11px] text-muted-foreground">
            {isAllTime ? "За всё время · сравнение недоступно" : "События выбранного периода"}
          </span>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-2">
          {periodRows.map((kpi) => {
            const isSelected = selectedKpiId === kpi.id;
            const delta =
              !isAllTime && kpi.comparisonAvailable !== false && kpi.delta !== null
                ? `${kpi.delta > 0 ? "+" : ""}${kpi.delta}`
                : "—";
            return (
              <button
                key={kpi.id}
                type="button"
                disabled={unavailable || kpi.companyIds.length === 0}
                onClick={() => {
                  setSelectedKpiId(kpi.id);
                  if (companies) {
                    if (kpi.id === "new_companies") {
                      onOpenDrillDown(buildNewCompaniesDrillDown(companies, boundaries));
                    } else if (kpi.id === "samples_sent") {
                      onOpenDrillDown(buildSamplesSentDrillDown(companies, boundaries));
                    } else if (kpi.id === "deals_created") {
                      onOpenDrillDown(buildDealsCreatedDrillDown(companies, boundaries));
                    } else if (kpi.id === "payments_received" || kpi.id === "payment_amount") {
                      onOpenDrillDown(buildPaymentsReceivedDrillDown(companies, boundaries));
                    } else if (kpi.id === "shipments") {
                      onOpenDrillDown(buildShipmentsDrillDown(companies, boundaries));
                    } else {
                      onOpenDrillDown(
                        kpi.label,
                        "Компании, подходящие под показатель в выбранном периоде",
                        kpi.companyIds
                      );
                    }
                  } else {
                    onOpenDrillDown(
                      kpi.label,
                      "Компании, подходящие под показатель в выбранном периоде",
                      kpi.companyIds
                    );
                  }
                }}
                className={`group rounded-lg border px-3 py-2.5 text-left transition-colors ${
                  unavailable || kpi.companyIds.length === 0
                    ? "border-border/50 bg-muted/30 opacity-60"
                    : isSelected
                    ? "border-primary/40 bg-primary/10 shadow-2xs cursor-pointer text-foreground"
                    : "border-border bg-card hover:border-primary/40 hover:bg-accent/40 cursor-pointer"
                }`}
              >
                <div className="text-[10px] text-muted-foreground font-medium truncate">{kpi.label}</div>
                <div className="flex items-baseline gap-1.5 mt-0.5">
                  <span className="text-lg font-semibold tabular-nums">
                    {unavailable ? "—" : kpi.isCurrency && kpi.currentValue === null ? "—" : (kpi.currentValue ?? 0)}
                  </span>
                  {!isAllTime && (
                    <span
                      className={`text-[10px] tabular-nums ${
                        !unavailable && kpi.delta !== null && kpi.delta > 0
                          ? "text-emerald-600 dark:text-emerald-400"
                          : !unavailable && kpi.delta !== null && kpi.delta < 0
                          ? "text-rose-600 dark:text-rose-400"
                          : "text-muted-foreground"
                      }`}
                    >
                      {unavailable ? "—" : delta}
                    </span>
                  )}
                </div>
                {!unavailable && kpi.isCurrency && (() => {
                  const line = currencyLine(kpi);
                  return line ? (
                    <div className="text-[10px] text-muted-foreground" data-testid={`kpi-currency-${kpi.id}`}>
                      {line}
                    </div>
                  ) : null;
                })()}
              </button>
            );
          })}
        </div>
      </section>

      {/* ── B. КОМПАКТНЫЙ ТЕКУЩИЙ ПОРТФЕЛЬ ── */}
      <section className="rounded-xl border bg-card/60 p-4 shadow-2xs">
        <div className="flex items-baseline justify-between gap-2 mb-3">
          <h3 className="text-sm font-semibold">Текущий портфель</h3>
          <span className="text-[11px] text-muted-foreground">
            Состояние «сейчас» · период его не ограничивает
          </span>
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Track 1: Samples & Testing chain */}
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground mb-2">
              Образцы и испытания
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
              <MiniStat
                label="Требуются образцы"
                count={stage("Требуются образцы")?.companyCount ?? 0}
                companyIds={stage("Требуются образцы")?.companyIds ?? []}
                onOpenDrillDown={onOpenDrillDown}
                title="Требуются образцы"
                subtitle="Компании, которым требуются образцы"
                payload={companies ? buildSampleStageDrillDown(companies, "Требуются образцы") : undefined}
                unavailable={unavailable}
              />
              <MiniStat
                label="Подготовка"
                count={stage("Подготовка к отправке")?.companyCount ?? 0}
                companyIds={stage("Подготовка к отправке")?.companyIds ?? []}
                onOpenDrillDown={onOpenDrillDown}
                title="Подготовка к отправке"
                subtitle="Компании в подготовке образцов"
                payload={companies ? buildSampleStageDrillDown(companies, "Подготовка к отправке") : undefined}
                unavailable={unavailable}
              />
              <MiniStat
                label="Отправлены"
                count={stage("Образцы отправлены")?.companyCount ?? 0}
                companyIds={stage("Образцы отправлены")?.companyIds ?? []}
                onOpenDrillDown={onOpenDrillDown}
                title="Образцы отправлены"
                subtitle="Компании с отправленными образцами"
                payload={companies ? buildSampleStageDrillDown(companies, "Образцы отправлены") : undefined}
                unavailable={unavailable}
              />
              <MiniStat
                label="На испытаниях"
                count={stage("На испытании")?.companyCount ?? 0}
                companyIds={stage("На испытании")?.companyIds ?? []}
                onOpenDrillDown={onOpenDrillDown}
                title="На испытании"
                subtitle="Компании, чьи образцы на испытаниях"
                payload={companies ? buildSampleStageDrillDown(companies, "На испытании") : undefined}
                unavailable={unavailable}
              />
              <MiniStat
                label="Подошли"
                count={stage("Подошли")?.companyCount ?? 0}
                companyIds={stage("Подошли")?.companyIds ?? []}
                onOpenDrillDown={onOpenDrillDown}
                title="Подошли"
                subtitle="Компании с положительным результатом"
                payload={companies ? buildSampleStageDrillDown(companies, "Подошли") : undefined}
                unavailable={unavailable}
              />
              <MiniStat
                label="Не подошли / Доработка"
                count={(stage("Не подошли")?.companyCount ?? 0) + (stage("Требуется доработка")?.companyCount ?? 0)}
                companyIds={[
                  ...(stage("Не подошли")?.companyIds ?? []),
                  ...(stage("Требуется доработка")?.companyIds ?? []),
                ]}
                onOpenDrillDown={onOpenDrillDown}
                title="Не подошли / Требуется доработка"
                subtitle="Компании с отрицательным результатом или на доработке"
                payload={companies ? buildSampleStageDrillDown(companies, "Не подошли / Требуется доработка", ["Не подошли", "Требуется доработка"]) : undefined}
                unavailable={unavailable}
              />
              <MiniStat
                label="Не классифицировано"
                count={stage(UNCLASSIFIED_LABEL)?.companyCount ?? 0}
                companyIds={stage(UNCLASSIFIED_LABEL)?.companyIds ?? []}
                onOpenDrillDown={onOpenDrillDown}
                title="Не классифицировано"
                subtitle="Компании с неоднозначным или неклассифицированным статусом образцов"
                payload={companies ? buildSampleStageDrillDown(companies, UNCLASSIFIED_LABEL) : undefined}
                unavailable={unavailable}
              />
            </div>
          </div>

          {/* Track 2: Commercial chain */}
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground mb-2">
              Коммерциализация
            </div>
            <div className="grid grid-cols-2 gap-2">
              <MiniStat
                label="Активные сделки"
                count={commercial.current.activeDeals.count}
                companyIds={commercial.current.activeDeals.companyIds}
                onOpenDrillDown={onOpenDrillDown}
                title="Активные коммерческие сделки"
                subtitle="Компании с активными (не терминальными) сделками"
                payload={companies ? buildActiveDealsDrillDown(companies) : undefined}
                unavailable={unavailable}
              />
              <MiniStat
                label="Ожидают оплаты"
                count={commercial.current.awaitingPayment.count}
                companyIds={commercial.current.awaitingPayment.companyIds}
                onOpenDrillDown={onOpenDrillDown}
                title="Ожидают оплаты"
                subtitle="Компании со счетами, ожидающими оплату"
                payload={companies ? buildAwaitingPaymentDrillDown(companies) : undefined}
                unavailable={unavailable}
              />
            </div>
            <div className="mt-2 flex items-center gap-2 text-[11px] text-muted-foreground">
              <span>Положительный результат → продолжение:</span>
              <button
                type="button"
                disabled={unavailable || continuation.positiveResult.count === 0}
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
                className="tabular-nums font-semibold text-primary hover:underline disabled:opacity-50 cursor-pointer"
              >
                {unavailable ? "—" : continuation.positiveResult.count}
              </button>
              <span>→</span>
              <button
                type="button"
                disabled={unavailable || continuation.withCommercialContinuation.count === 0}
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
                className="tabular-nums font-semibold text-primary hover:underline disabled:opacity-50 cursor-pointer"
              >
                {unavailable ? "—" : continuation.withCommercialContinuation.count}
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* ── C. УПРАВЛЕНЧЕСКИЕ СИГНАЛЫ ── */}
      <section className="rounded-xl border bg-card/60 p-4 shadow-2xs">
        <div className="flex items-baseline justify-between gap-2 mb-3">
          <h3 className="text-sm font-semibold">Управленческие сигналы</h3>
          <span className="text-[11px] text-muted-foreground">Объективные правила, без субъективных оценок</span>
        </div>
        {unavailable ? (
          <p className="text-xs text-muted-foreground">Данные сигналов недоступны из-за ошибки загрузки.</p>
        ) : managementSignals.length === 0 ? (
          <p className="text-xs text-muted-foreground">Сигналов нет — по текущим правилам всё в порядке.</p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-2">
            {managementSignals.map((signal) => (
              <MiniStat
                key={signal.id}
                label={signal.label}
                count={signal.companyCount}
                companyIds={signal.companyIds}
                onOpenDrillDown={onOpenDrillDown}
                title={signal.label}
                subtitle="Открыть список компаний"
                payload={companies ? buildSignalDrillDown(companies, signal.id, signal.label) : undefined}
                accent
                unavailable={unavailable}
              />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
