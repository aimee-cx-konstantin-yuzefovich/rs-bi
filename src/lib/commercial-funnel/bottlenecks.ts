// src/lib/commercial-funnel/bottlenecks.ts
// ─────────────────────────────────────────────────────────────────────
// Authoritative bottleneck and movement evaluation for Commercial Funnel.
// Single source of truth used by both normalizeCompanies and computeBottlenecks.
// ─────────────────────────────────────────────────────────────────────

import { COMMERCIAL_THRESHOLDS } from "./constants";
import { calculateDaysWaiting } from "./date-utils";
import { isDealActiveStage } from "./stage-utils";
import type { CommercialDeal } from "./types";

export interface StalledDealInfo {
  isStalled: boolean;
  issueLabel: string;
  attentionReason: string;
  daysWaiting: number;
  relevantDate?: string;
  nextAction?: string;
  activityEvidence: "KNOWN" | "UNKNOWN";
  missingNextStep: boolean;
}

/**
 * One canonical missing next step predicate (Defect 5).
 * Deal is active in a non-terminal stage, activity data is known, and no next step exists.
 * Does not depend on stalled duration.
 */
export function isActiveDealMissingNextStep(deal: CommercialDeal): boolean {
  return (
    isDealActiveStage(deal.stageId) &&
    deal.activityDataKnown === true &&
    !deal.activityNext
  );
}

/**
 * Evaluates whether an active deal is stalled using authoritative movement evidence.
 * 1. If activity data is known: uses activityLast; if never had activity, uses deal creation/start date.
 * 2. If activity data is UNKNOWN: does not make unqualified "без движения N дней" claim,
 *    truthfully surfacing "Старая активная сделка (N дн., данные активности недоступны)".
 */
export function evaluateStalledDeal(
  deal: CommercialDeal,
  now: Date
): StalledDealInfo | null {
  if (!isDealActiveStage(deal.stageId)) {
    return null;
  }

  const missingNextStep = isActiveDealMissingNextStep(deal);

  if (deal.activityDataKnown) {
    // Validated movement evidence: activityLast when known; fallback to beginDate/dateCreate if never had activity
    const refDate = deal.activityLast || deal.beginDate || deal.dateCreate;
    const days = calculateDaysWaiting(refDate, now) || 0;

    if (days > COMMERCIAL_THRESHOLDS.STALLED_DEAL_DAYS) {
      const issueLabel = missingNextStep
        ? `Сделка без движения (${days} дн., нет след. шага)`
        : `Сделка без движения (${days} дн.)`;
      const attentionReason = missingNextStep
        ? `Сделка без движения ${days} дн. (нет следующего шага) «${deal.title}»`
        : `Сделка без движения ${days} дн. «${deal.title}»`;
      const nextAction = deal.activityNext ? deal.activityNext : undefined;

      return {
        isStalled: true,
        issueLabel,
        attentionReason,
        daysWaiting: days,
        relevantDate: refDate,
        nextAction,
        activityEvidence: "KNOWN",
        missingNextStep,
      };
    }
  } else {
    // Activity data is UNKNOWN: truth in labeling without unqualified movement claims
    const refDate = deal.beginDate || deal.dateCreate;
    const days = calculateDaysWaiting(refDate, now) || 0;

    if (days > COMMERCIAL_THRESHOLDS.STALLED_DEAL_DAYS) {
      return {
        isStalled: true,
        issueLabel: `Старая активная сделка (${days} дн., данные активности недоступны)`,
        attentionReason: `Старая активная сделка ${days} дн. (данные активности недоступны) «${deal.title}»`,
        daysWaiting: days,
        relevantDate: refDate,
        nextAction: undefined,
        activityEvidence: "UNKNOWN",
        missingNextStep: false,
      };
    }
  }

  return null;
}
