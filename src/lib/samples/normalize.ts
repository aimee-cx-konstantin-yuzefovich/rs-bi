// src/lib/samples/normalize.ts
// ─────────────────────────────────────────────────────────────────────
// Pure normalization helpers for Samples v1. No Bitrix I/O here.
// All functions are deterministic and unit-testable in isolation.
// ─────────────────────────────────────────────────────────────────────

import type {
  BitrixFieldValue,
  LabelResolver,
  NormalizedResult,
} from "./types";
import {
  NEGATIVE_KEYWORDS,
  PENDING_KEYWORDS,
  POSITIVE_KEYWORDS,
  REWORK_KEYWORDS,
  TESTING_STATUS_KEYWORDS,
  SENT_INDICATOR_KEYWORDS,
} from "./constants";

/** Identity resolver — used when field metadata is unavailable. */
export const identityLabelResolver: LabelResolver = (_fieldId, rawValue) =>
  rawValue;

/**
 * Coerces a raw Bitrix value into a string label via the resolver.
 * Arrays: every element resolved and preserved (order kept).
 * Numbers/booleans → string. null/undefined/"" → undefined.
 */
export function resolveValue(
  fieldId: string,
  raw: BitrixFieldValue,
  resolve: LabelResolver
): string[] | undefined {
  if (raw === null || raw === undefined || raw === "") return undefined;
  if (Array.isArray(raw)) {
    const labels = raw
      .map((item) => String(item).trim())
      .filter((item) => item !== "")
      .map((item) => resolve(fieldId, item));
    return labels.length > 0 ? labels : undefined;
  }
  const label = resolve(fieldId, String(raw).trim());
  return label !== "" ? [label] : undefined;
}

/** Deduplicates strings, preserving first-seen order, trimming empties. */
export function dedupe(values: Array<string | undefined>): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const value of values) {
    if (!value) continue;
    const trimmed = value.trim();
    if (!trimmed) continue;
    const key = trimmed.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(trimmed);
  }
  return out;
}

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}/;

/**
 * Extracts valid dates (ISO YYYY-MM-DD prefix) from a raw Bitrix value.
 * Bitrix multiple-date fields arrive as arrays; single dates as strings.
 * Invalid garbage is skipped (never invented into a fake date).
 */
export function extractDates(raw: BitrixFieldValue): string[] {
  if (raw === null || raw === undefined || raw === "") return [];
  const parts = Array.isArray(raw) ? raw : [raw];
  const out: string[] = [];
  for (const part of parts) {
    const str = String(part).trim();
    if (!ISO_DATE_RE.test(str)) continue;
    // Take the date part; datetime suffixes are legal but irrelevant here.
    const date = str.slice(0, 10);
    // Validate the calendar date (reject 2026-13-45).
    const parsed = new Date(`${date}T00:00:00Z`);
    if (Number.isNaN(parsed.getTime())) continue;
    if (parsed.toISOString().slice(0, 10) !== date) continue;
    out.push(date);
  }
  return out;
}

/** Parses a quantity: keeps numeric value when cleanly parseable. */
export function parseQuantity(
  raw: BitrixFieldValue
): number | string | undefined {
  if (raw === null || raw === undefined || raw === "") return undefined;
  if (Array.isArray(raw)) {
    return raw.length === 1 ? parseQuantity(raw[0]) : raw.map(String).join("; ");
  }
  const str = String(raw).trim();
  if (str === "") return undefined;
  const num = Number(str.replace(",", "."));
  return Number.isFinite(num) && str !== "" ? num : str;
}

function matchesAny(text: string, keywords: string[]): boolean {
  const lower = text.toLowerCase();
  return keywords.some((keyword) => lower.includes(keyword));
}

/**
 * Conservative result classification from one raw/label value.
 * Order matters: rework phrases often contain positive/negative words.
 */
export function classifyResultValue(value: string): NormalizedResult | null {
  if (!value) return null;
  if (matchesAny(value, REWORK_KEYWORDS)) return "rework";
  if (matchesAny(value, NEGATIVE_KEYWORDS)) return "negative";
  if (matchesAny(value, POSITIVE_KEYWORDS)) return "positive";
  if (matchesAny(value, PENDING_KEYWORDS)) return "pending";
  return null;
}

export interface PerProductEvidence {
  productFamily: string;
  result: NormalizedResult;
}

/**
 * Full classification for a company:
 * - proven per-product outcomes (Gel positive + Sol pending) → "mixed";
 * - otherwise the single global raw value classified conservatively;
 * - conflicting keyword hits inside one value → the earlier keyword family
 *   wins (rework > negative > positive > pending) — deterministic;
 * - unclassifiable → "unknown".
 */
export function normalizeResult(
  rawTestResult: string | undefined,
  perProductEvidence: PerProductEvidence[]
): NormalizedResult {
  const distinct = new Set(perProductEvidence.map((e) => e.result));
  if (distinct.size > 1) return "mixed";
  if (distinct.size === 1) {
    // All products share the same proven outcome — safe to report it.
    return perProductEvidence[0].result;
  }
  if (!rawTestResult || rawTestResult.trim() === "") return "unknown";
  return classifyResultValue(rawTestResult) ?? "unknown";
}

/** True when a status label means active testing (KPI «на испытании»). */
export function isTestingStatus(status: string): boolean {
  return matchesAny(status, TESTING_STATUS_KEYWORDS);
}

/** True when a sample indicator/status means samples were sent. */
export function isSentIndicator(status: string): boolean {
  return matchesAny(status, SENT_INDICATOR_KEYWORDS);
}

/**
 * Source-quality classification per Samples v1 §5.
 * Normal multiplicity (several grades/dates/deals) is NOT ambiguity.
 */
export function computeSourceQuality(input: {
  hasStructuredFields: boolean;
  hasLegacyOnly: boolean;
  hasConflictingEvidence: boolean;
}): "structured" | "partial" | "legacy" | "ambiguous" {
  if (input.hasConflictingEvidence) return "ambiguous";
  if (input.hasLegacyOnly && !input.hasStructuredFields) return "legacy";
  if (input.hasStructuredFields) {
    return input.hasLegacyOnly ? "partial" : "structured";
  }
  return "partial";
}
