// src/lib/commercial-funnel/drill-down.ts
// ─────────────────────────────────────────────────────────────────────
// Authoritative Drill-Down Evidence Builders.
// Guarantees exact analytical provenance between KPI cards and drill-down:
// - Exact qualifying deal(s) (never arbitrary primaryDeal fallback)
// - Exact SP item / shipment facts for sample cards
// - Truthful "—" for company-only / ambiguous cards
// - Exact reconciliation of unique company counts and qualifying deal counts
// ─────────────────────────────────────────────────────────────────────

import {
  COMMERCIAL_THRESHOLDS,
  INVOICE_SENT_STATUS_CODES,
  PAID_STATUS_CODES,
  UNCLASSIFIED_LABEL,
} from "./constants";
import { calculateDaysWaiting, isDateInPeriod } from "./date-utils";
import { normalizeCurrencyCode } from "./normalize";
import { isDealActiveStage, isCommercialContinuationStage } from "./stage-utils";
import { evaluateStalledDeal, isActiveDealMissingNextStep } from "./bottlenecks";
import { compareCompanyIds } from "./analytics-helpers";
import type {
  CommercialCompany,
  CommercialDrillDownEvidence,
  CommercialDrillDownPayload,
  PeriodBoundaries,
} from "./types";

export type {
  CommercialDrillDownEvidenceKind,
  CommercialDrillDownEvidence,
  CommercialDrillDownPayload,
} from "./types";

/**
 * 1. Active commercial deals drill-down
 */
export function buildActiveDealsDrillDown(
  companies: CommercialCompany[]
): CommercialDrillDownPayload {
  const matchingCompanyIds: string[] = [];
  const evidence: CommercialDrillDownEvidence[] = [];
  let dealCount = 0;

  for (const c of companies) {
    const activeDeals = c.deals.filter((d) => isDealActiveStage(d.stageId));
    if (activeDeals.length > 0) {
      matchingCompanyIds.push(c.id);
      for (const d of activeDeals) {
        dealCount++;
        evidence.push({
          companyId: c.id,
          kind: "DEAL",
          dealId: d.id,
          reason: d.stageName || d.stageId,
        });
      }
    }
  }

  return {
    title: "Активные коммерческие сделки",
    subtitle: `Компании с активными (не терминальными) сделками (${matchingCompanyIds.length}) · Сделок: ${dealCount}`,
    companyIds: matchingCompanyIds.sort(compareCompanyIds),
    evidence,
    expectedCompanyCount: matchingCompanyIds.length,
    expectedDealCount: dealCount,
  };
}

/**
 * 2. Awaiting payment drill-down (independent of active stage)
 */
export function buildAwaitingPaymentDrillDown(
  companies: CommercialCompany[]
): CommercialDrillDownPayload {
  const matchingCompanyIds: string[] = [];
  const evidence: CommercialDrillDownEvidence[] = [];
  let dealCount = 0;

  for (const c of companies) {
    const awaitingDeals = c.deals.filter(
      (d) => d.paymentStatus && INVOICE_SENT_STATUS_CODES.has(d.paymentStatus)
    );
    if (awaitingDeals.length > 0) {
      matchingCompanyIds.push(c.id);
      for (const d of awaitingDeals) {
        dealCount++;
        evidence.push({
          companyId: c.id,
          kind: "DEAL",
          dealId: d.id,
          reason: `Ожидает оплаты (статус ${d.paymentStatus})`,
        });
      }
    }
  }

  return {
    title: "Ожидают оплаты",
    subtitle: `Компании со счетами, ожидающими оплату (${matchingCompanyIds.length}) · Сделок: ${dealCount}`,
    companyIds: matchingCompanyIds.sort(compareCompanyIds),
    evidence,
    expectedCompanyCount: matchingCompanyIds.length,
    expectedDealCount: dealCount,
  };
}

/**
 * 3. Deals created in period drill-down
 */
export function buildDealsCreatedDrillDown(
  companies: CommercialCompany[],
  boundaries: PeriodBoundaries
): CommercialDrillDownPayload {
  const matchingCompanyIds: string[] = [];
  const evidence: CommercialDrillDownEvidence[] = [];
  let dealCount = 0;

  for (const c of companies) {
    const periodDeals = c.deals.filter((d) =>
      isDateInPeriod(d.dateCreate, boundaries.currentStart, boundaries.currentEnd)
    );
    if (periodDeals.length > 0) {
      matchingCompanyIds.push(c.id);
      for (const d of periodDeals) {
        dealCount++;
        evidence.push({
          companyId: c.id,
          kind: "DEAL",
          dealId: d.id,
          date: d.dateCreate,
          reason: "Сделка создана в выбранном периоде",
        });
      }
    }
  }

  return {
    title: "Создано сделок за период",
    subtitle: `Компании с созданными сделками в выбранном периоде (${matchingCompanyIds.length}) · Сделок: ${dealCount}`,
    companyIds: matchingCompanyIds.sort(compareCompanyIds),
    evidence,
    expectedCompanyCount: matchingCompanyIds.length,
    expectedDealCount: dealCount,
  };
}

/**
 * 4. Payments received in period drill-down (optionally isolated by currency)
 */
export function buildPaymentsReceivedDrillDown(
  companies: CommercialCompany[],
  boundaries: PeriodBoundaries,
  currency?: string
): CommercialDrillDownPayload {
  const matchingCompanyIds: string[] = [];
  const evidence: CommercialDrillDownEvidence[] = [];
  let dealCount = 0;

  for (const c of companies) {
    const paidDeals = c.deals.filter(
      (d) =>
        d.paymentStatus &&
        PAID_STATUS_CODES.has(d.paymentStatus) &&
        d.paymentDate &&
        isDateInPeriod(d.paymentDate, boundaries.currentStart, boundaries.currentEnd) &&
        (!currency || normalizeCurrencyCode(d.currencyId) === currency)
    );
    if (paidDeals.length > 0) {
      matchingCompanyIds.push(c.id);
      for (const d of paidDeals) {
        dealCount++;
        evidence.push({
          companyId: c.id,
          kind: "DEAL",
          dealId: d.id,
          date: d.paymentDate,
          reason: `Оплата получена (${normalizeCurrencyCode(d.currencyId)})`,
        });
      }
    }
  }

  const curLabel = currency ? ` (${currency === "UNKNOWN" ? "валюта не указана" : currency})` : "";
  return {
    title: `Получена оплата за период${curLabel}`,
    subtitle: `Компании с оплаченными сделками в выбранном периоде (${matchingCompanyIds.length}) · Сделок: ${dealCount}`,
    companyIds: matchingCompanyIds.sort(compareCompanyIds),
    evidence,
    expectedCompanyCount: matchingCompanyIds.length,
    expectedDealCount: dealCount,
  };
}

/**
 * 5. Shipments in period drill-down
 */
export function buildShipmentsDrillDown(
  companies: CommercialCompany[],
  boundaries: PeriodBoundaries
): CommercialDrillDownPayload {
  const matchingCompanyIds: string[] = [];
  const evidence: CommercialDrillDownEvidence[] = [];
  let dealCount = 0;

  for (const c of companies) {
    const shipmentDeals = c.deals.filter(
      (d) =>
        d.shipmentDate &&
        isDateInPeriod(d.shipmentDate, boundaries.currentStart, boundaries.currentEnd)
    );
    if (shipmentDeals.length > 0) {
      matchingCompanyIds.push(c.id);
      for (const d of shipmentDeals) {
        dealCount++;
        evidence.push({
          companyId: c.id,
          kind: "DEAL",
          dealId: d.id,
          date: d.shipmentDate,
          reason: "Отгрузка в выбранном периоде",
        });
      }
    }
  }

  return {
    title: "Отгрузки за период",
    subtitle: `Компании с подтверждёнными отгрузками в выбранном периоде (${matchingCompanyIds.length}) · Сделок: ${dealCount}`,
    companyIds: matchingCompanyIds.sort(compareCompanyIds),
    evidence,
    expectedCompanyCount: matchingCompanyIds.length,
    expectedDealCount: dealCount,
  };
}

/**
 * 6. New companies created in period drill-down
 */
export function buildNewCompaniesDrillDown(
  companies: CommercialCompany[],
  boundaries: PeriodBoundaries
): CommercialDrillDownPayload {
  const matchingCompanyIds: string[] = [];
  const evidence: CommercialDrillDownEvidence[] = [];

  for (const c of companies) {
    if (
      c.dateCreate &&
      isDateInPeriod(c.dateCreate, boundaries.currentStart, boundaries.currentEnd)
    ) {
      matchingCompanyIds.push(c.id);
      evidence.push({
        companyId: c.id,
        kind: "COMPANY",
        date: c.dateCreate,
        reason: "Создана в выбранном периоде",
      });
    }
  }

  return {
    title: "Новые компании за период",
    subtitle: `Компании, созданные в выбранном периоде (${matchingCompanyIds.length})`,
    companyIds: matchingCompanyIds.sort(compareCompanyIds),
    evidence,
    expectedCompanyCount: matchingCompanyIds.length,
  };
}

/**
 * 7. Companies with samples sent in period drill-down
 */
export function buildSamplesSentDrillDown(
  companies: CommercialCompany[],
  boundaries: PeriodBoundaries
): CommercialDrillDownPayload {
  const matchingCompanyIds: string[] = [];
  const evidence: CommercialDrillDownEvidence[] = [];

  for (const c of companies) {
    const sentEvents = c.sampleSentEvents?.filter((e) =>
      isDateInPeriod(e.date, boundaries.currentStart, boundaries.currentEnd)
    );

    if (sentEvents && sentEvents.length > 0) {
      matchingCompanyIds.push(c.id);
      for (const e of sentEvents) {
        evidence.push({
          companyId: c.id,
          kind: "SAMPLE_SENT_EVIDENCE",
          date: e.date,
          dealId: e.dealId,
          processItemId: e.processItemId,
          source: e.source,
          reason: `Отправка образца (${e.source})`,
        });
      }
    } else {
      const dates = c.sampleEventDatesForPeriodMetrics || c.sampleAllDates || [];
      const matchingDates = dates.filter((d) =>
        isDateInPeriod(d, boundaries.currentStart, boundaries.currentEnd)
      );
      if (matchingDates.length > 0) {
        matchingCompanyIds.push(c.id);
        evidence.push({
          companyId: c.id,
          kind: "SAMPLE_SENT_EVIDENCE",
          date: matchingDates[0],
          reason: "Отправка образца",
        });
      }
    }
  }

  return {
    title: "Компании с отправленными образцами",
    subtitle: `Компании с подтверждённым фактом отправки образцов за период (${matchingCompanyIds.length})`,
    companyIds: matchingCompanyIds.sort(compareCompanyIds),
    evidence,
    expectedCompanyCount: matchingCompanyIds.length,
  };
}

/**
 * 8. Current sample stage WIP drill-down (exact state provenance)
 */
export function buildSampleStageDrillDown(
  companies: CommercialCompany[],
  stageLabel: string,
  allowedLabels?: string[]
): CommercialDrillDownPayload {
  const matchingCompanyIds: string[] = [];
  const evidence: CommercialDrillDownEvidence[] = [];
  const targetLabels = allowedLabels || [stageLabel];

  for (const c of companies) {
    if (c.sampleStatus && targetLabels.includes(c.sampleStatus)) {
      matchingCompanyIds.push(c.id);
      if (
        c.sampleCurrentResolutionQuality === "AMBIGUOUS" ||
        c.sampleCurrentResolutionQuality === "AMBIGUOUS_MULTIPLE_ACTIVE"
      ) {
        evidence.push({
          companyId: c.id,
          kind: "COMPANY",
          reason: c.sampleStatuses?.join(", ") || "Неоднозначный статус образцов",
        });
      } else if (c.sampleStatusSource === "SMART_PROCESS") {
        evidence.push({
          companyId: c.id,
          kind: "SAMPLE_SP",
          processItemId: c.sampleResponsibleProcessItemId,
          dealId: c.sampleRelatedDealId || c.sampleResponsibleDealId,
          date: c.sampleShipmentDate,
          source: "SMART_PROCESS",
          reason: c.sampleStatus,
        });
      } else if (c.sampleStatusSource === "DEAL") {
        evidence.push({
          companyId: c.id,
          kind: "SAMPLE_DEAL",
          dealId: c.sampleResponsibleDealId,
          date: c.sampleShipmentDate,
          source: "DEAL",
          reason: c.sampleStatus,
        });
      } else if (c.sampleStatusSource === "COMPANY") {
        evidence.push({
          companyId: c.id,
          kind: "SAMPLE_COMPANY",
          date: c.sampleShipmentDate,
          source: "COMPANY",
          reason: c.sampleStatus,
        });
      } else {
        evidence.push({
          companyId: c.id,
          kind: "COMPANY",
          reason: c.sampleStatus || UNCLASSIFIED_LABEL,
        });
      }
    }
  }

  const isUnclassified = stageLabel === UNCLASSIFIED_LABEL;
  return {
    title: isUnclassified ? UNCLASSIFIED_LABEL : `Воронка — ${stageLabel}`,
    subtitle: isUnclassified
      ? `Компании с неоднозначным или неклассифицированным статусом образцов (${matchingCompanyIds.length})`
      : `Компании в текущем состоянии «${stageLabel}» (${matchingCompanyIds.length})`,
    companyIds: matchingCompanyIds.sort(compareCompanyIds),
    evidence,
    expectedCompanyCount: matchingCompanyIds.length,
  };
}

/**
 * 9. Positive result → Commercial continuation drill-down
 */
export function buildContinuationDrillDown(
  companies: CommercialCompany[],
  mode: "positive" | "continuation"
): CommercialDrillDownPayload {
  const matchingCompanyIds: string[] = [];
  const evidence: CommercialDrillDownEvidence[] = [];
  let continuationDealCount = 0;

  for (const c of companies) {
    if (c.sampleStatus === "Подошли") {
      if (mode === "positive") {
        matchingCompanyIds.push(c.id);
        evidence.push({
          companyId: c.id,
          kind: c.sampleStatusSource === "SMART_PROCESS" ? "SAMPLE_SP" : "SAMPLE_DEAL",
          dealId: c.sampleRelatedDealId || c.sampleResponsibleDealId,
          processItemId: c.sampleResponsibleProcessItemId,
          reason: "Положительный результат испытаний",
        });
      } else {
        const contDeals = c.deals.filter((d) =>
          isCommercialContinuationStage(d.stageId, d.categoryId)
        );
        if (contDeals.length > 0) {
          matchingCompanyIds.push(c.id);
          for (const d of contDeals) {
            continuationDealCount++;
            evidence.push({
              companyId: c.id,
              kind: "DEAL",
              dealId: d.id,
              reason: `Коммерческое продолжение: ${d.stageName || d.stageId}`,
            });
          }
        }
      }
    }
  }

  if (mode === "positive") {
    return {
      title: "Положительный результат испытаний",
      subtitle: `Компании с текущим статусом «Подошли» (${matchingCompanyIds.length})`,
      companyIds: matchingCompanyIds.sort(compareCompanyIds),
      evidence,
      expectedCompanyCount: matchingCompanyIds.length,
    };
  }

  return {
    title: "Коммерческое продолжение",
    subtitle: `Компании с «Подошли» и продвинутой коммерческой сделкой (${matchingCompanyIds.length}) · Сделок: ${continuationDealCount}`,
    companyIds: matchingCompanyIds.sort(compareCompanyIds),
    evidence,
    expectedCompanyCount: matchingCompanyIds.length,
    expectedDealCount: continuationDealCount,
  };
}

/**
 * 10. Management signals drill-down
 */
export function buildSignalDrillDown(
  companies: CommercialCompany[],
  signalId: string,
  signalLabel: string,
  now: Date = new Date()
): CommercialDrillDownPayload {
  const matchingCompanyIds: string[] = [];
  const evidence: CommercialDrillDownEvidence[] = [];

  for (const c of companies) {
    if (signalId === "testing_stalled") {
      if (c.sampleStatus === "На испытании" && c.sampleShipmentDate) {
        const days = calculateDaysWaiting(c.sampleShipmentDate, now);
        if (days !== null && days > COMMERCIAL_THRESHOLDS.SAMPLE_TESTING_ATTENTION_DAYS) {
          matchingCompanyIds.push(c.id);
          evidence.push({
            companyId: c.id,
            kind: c.sampleStatusSource === "SMART_PROCESS" ? "SAMPLE_SP" : "SAMPLE_DEAL",
            processItemId: c.sampleResponsibleProcessItemId,
            dealId: c.sampleRelatedDealId || c.sampleResponsibleDealId,
            reason: `Испытания длятся ${days} дн.`,
          });
        }
      }
    } else if (signalId === "deals_stalled") {
      const stalled = c.deals.filter((d) => {
        const info = evaluateStalledDeal(d, now);
        return info && info.activityEvidence === "KNOWN";
      });
      if (stalled.length > 0) {
        matchingCompanyIds.push(c.id);
        for (const d of stalled) {
          evidence.push({
            companyId: c.id,
            kind: "DEAL",
            dealId: d.id,
            reason: "Зависшая сделка без активности",
          });
        }
      }
    } else if (signalId === "deals_unknown_activity") {
      const unknown = c.deals.filter((d) => {
        const info = evaluateStalledDeal(d, now);
        return info && info.activityEvidence === "UNKNOWN";
      });
      if (unknown.length > 0) {
        matchingCompanyIds.push(c.id);
        for (const d of unknown) {
          evidence.push({
            companyId: c.id,
            kind: "DEAL",
            dealId: d.id,
            reason: "Нет данных активности в Bitrix24",
          });
        }
      }
    } else if (signalId === "no_next_step") {
      const missing = c.deals.filter(isActiveDealMissingNextStep);
      if (missing.length > 0) {
        matchingCompanyIds.push(c.id);
        for (const d of missing) {
          evidence.push({
            companyId: c.id,
            kind: "DEAL",
            dealId: d.id,
            reason: "Нет запланированного следующего действия",
          });
        }
      }
    } else if (signalId === "sample_success_no_deal" || signalId === "success_no_continuation") {
      if (
        c.sampleStatus === "Подошли" &&
        !c.deals.some((d) => isCommercialContinuationStage(d.stageId, d.categoryId))
      ) {
        matchingCompanyIds.push(c.id);
        evidence.push({
          companyId: c.id,
          kind: "COMPANY",
          reason: "Успешные испытания без коммерческого продолжения",
        });
      }
    }
  }

  return {
    title: signalLabel,
    subtitle: `Компании, подпадающие под сигнал (${matchingCompanyIds.length})`,
    companyIds: matchingCompanyIds.sort(compareCompanyIds),
    evidence,
    expectedCompanyCount: matchingCompanyIds.length,
  };
}
