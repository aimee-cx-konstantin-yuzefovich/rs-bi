// src/lib/financial-quality.ts
// ─────────────────────────────────────────────────────────────────────
// Shared aggregate financial quality authority for the whole product.
// Extracted from the accepted Commercial Funnel engine so the operational
// Dashboard (StatsCards, alerts) and Commercial Funnel agree semantically.
//
// Invariants preserved:
//   UNKNOWN != EMPTY, UNKNOWN != ZERO, INVALID != ZERO,
//   PARTIAL != COMPLETE, VALID ZERO == ZERO,
//   NO SILENT FX, NO CROSS-CURRENCY SCALAR TOTAL.
// ─────────────────────────────────────────────────────────────────────

import { parseStrictNumber } from "./scalar-safety";
import { normalizeCurrencyCode } from "./currency";

/** Per-deal amount classification. */
export type DealAmountQuality = "VALID" | "UNKNOWN" | "INVALID";

/**
 * Classifies one raw CRM opportunity value strictly.
 *   "100000"  → VALID 100000
 *   "0"       → VALID 0
 *   "" / "  " / null / undefined → UNKNOWN
 *   "1000rub" / "12abc" / "0x10" → INVALID
 */
export function classifyDealAmount(raw: unknown): {
  quality: DealAmountQuality;
  value: number | null;
} {
  if (raw === null || raw === undefined) return { quality: "UNKNOWN", value: null };
  if (typeof raw === "string" && raw.trim() === "") return { quality: "UNKNOWN", value: null };
  const parsed = parseStrictNumber(raw);
  if (parsed !== undefined) return { quality: "VALID", value: parsed };
  return { quality: "INVALID", value: null };
}

/** Aggregate quality states shared by Dashboard and Commercial Funnel. */
export type AggregateAmountQuality =
  | "COMPLETE"
  | "PARTIAL"
  | "UNKNOWN"
  | "INVALID_ONLY";

export interface CurrencyAmountStats {
  validSum: number;
  validCount: number;
  invalidCount: number;
  unknownCount: number;
}

/**
 * Canonical aggregate evaluator (proven in Commercial Funnel):
 * - 0 deals in scope: 0, "COMPLETE"
 * - All amounts valid (even 0): sum, "COMPLETE"
 * - No valid amounts, ≥1 invalid: null, "INVALID_ONLY"
 * - No valid amounts, all missing: null, "UNKNOWN"
 * - Valid amount(s) plus invalid/unknown: sum, "PARTIAL"
 */
export function evaluateAggregateAmountQuality(
  validSum: number,
  validCount: number,
  invalidCount: number,
  unknownCount: number
): { amount: number | null; quality: AggregateAmountQuality } {
  const total = validCount + invalidCount + unknownCount;
  if (total === 0) {
    return { amount: 0, quality: "COMPLETE" };
  }
  if (invalidCount === 0 && unknownCount === 0) {
    return { amount: validSum, quality: "COMPLETE" };
  }
  if (validCount === 0) {
    if (invalidCount > 0) {
      return { amount: null, quality: "INVALID_ONLY" };
    }
    return { amount: null, quality: "UNKNOWN" };
  }
  return { amount: validSum, quality: "PARTIAL" };
}

export function evaluateAggregateFromStats(
  stats: CurrencyAmountStats
): { amount: number | null; quality: AggregateAmountQuality } {
  return evaluateAggregateAmountQuality(
    stats.validSum,
    stats.validCount,
    stats.invalidCount,
    stats.unknownCount
  );
}

/**
 * Aggregates a set of raw (amount, currency) pairs into per-currency stats
 * with strict parsing and strict currency isolation. Never converts currency
 * and never drops a currency that only carries invalid/unknown amounts.
 */
export function aggregateAmountsByCurrency(
  rows: Array<{ rawAmount: unknown; rawCurrency: unknown }>
): {
  statsByCurrency: Record<string, CurrencyAmountStats>;
  qualityByCurrency: Record<string, AggregateAmountQuality>;
  amountByCurrency: Record<string, number | null>;
} {
  const statsByCurrency: Record<string, CurrencyAmountStats> = {};
  const getStats = (cur: string): CurrencyAmountStats => {
    if (!statsByCurrency[cur]) {
      statsByCurrency[cur] = { validSum: 0, validCount: 0, invalidCount: 0, unknownCount: 0 };
    }
    return statsByCurrency[cur];
  };

  for (const row of rows) {
    const cur = normalizeCurrencyCode(
      row.rawCurrency !== null && row.rawCurrency !== undefined && String(row.rawCurrency).trim() !== ""
        ? String(row.rawCurrency)
        : null
    );
    const { quality, value } = classifyDealAmount(row.rawAmount);
    const st = getStats(cur);
    if (quality === "VALID" && value !== null) {
      st.validSum += value;
      st.validCount++;
    } else if (quality === "INVALID") {
      st.invalidCount++;
    } else {
      st.unknownCount++;
    }
  }

  const qualityByCurrency: Record<string, AggregateAmountQuality> = {};
  const amountByCurrency: Record<string, number | null> = {};
  for (const cur of Object.keys(statsByCurrency)) {
    const res = evaluateAggregateFromStats(statsByCurrency[cur]);
    qualityByCurrency[cur] = res.quality;
    amountByCurrency[cur] = res.amount;
  }

  return { statsByCurrency, qualityByCurrency, amountByCurrency };
}

/** Product-wide Russian labels for aggregate quality states. */
export function describeAggregateQuality(quality: AggregateAmountQuality): string | null {
  switch (quality) {
    case "PARTIAL":
      return "неполные данные";
    case "INVALID_ONLY":
      return "ошибка данных";
    case "UNKNOWN":
      return "нет данных";
    case "COMPLETE":
      return null;
  }
}
