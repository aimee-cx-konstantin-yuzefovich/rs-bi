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

/** Checks if a value is absent or a Bitrix REST API sentinel (false, "false", "true", "null", "undefined", "", "—", "–", "-"). */
export function isSentinelValue(v: unknown): boolean {
  if (v === null || v === undefined || v === false || v === true) return true;
  if (typeof v === "string") {
    const s = v.trim().toLowerCase();
    return (
      s === "" ||
      s === "false" ||
      s === "true" ||
      s === "null" ||
      s === "undefined" ||
      s === "—" ||
      s === "–" ||
      s === "-"
    );
  }
  return false;
}

const GEOGRAPHIC_PATTERNS = [
  /росси/i,
  /москв/i,
  /петербург/i,
  /спб/i,
  /рф/i,
  /снг/i,
  /беларус/i,
  /казахстан/i,
  /федеральн.*округ/i,
  /(?:^|\s)(?:цфо|сзфо|юфо|скфо|пфо|уфо|сфо|дфо)(?:$|\s)/i,
  /приволж/i,
  /центральн.*округ/i,
  /сибирск/i,
  /уральск/i,
  /северо-запад/i,
  /северо-кавказ/i,
  /дальневосточ/i,
  /южн.*округ/i,
  /область/i,
  /край/i,
  /республик/i,
];

/**
 * Secondary defensive cleanup: returns true if string represents a region or geographic entity
 * rather than an industrial application.
 *
 * Rationale (CASE B):
 * During legacy Bitrix CRM data entry and migration, operators occasionally entered or mapped
 * geographic regions/territories into company direction or application fields. While the primary
 * application mapping uses the verified Bitrix field ID (UF_CRM_69257337B8025),
 * this heuristic is strictly retained as a defensive sanitizer to prevent dirty historic geography
 * strings from leaking into industrial application filters/summaries. Valid business applications
 * (e.g. "Катализаторы гидроочистки", "Осушка газов", "Керамика") are preserved and verified by test.
 */
export function isGeographicValue(val: string): boolean {
  const trimmed = val.trim();
  return GEOGRAPHIC_PATTERNS.some((pat) => pat.test(trimmed));
}

/** Identity resolver — used when field metadata is unavailable. */
export const identityLabelResolver: LabelResolver = (_fieldId, rawValue) =>
  rawValue;

/**
 * Coerces a raw Bitrix value into a string label via the resolver.
 * Arrays: every element resolved and preserved (order kept).
 * Sentinels (false, "false", "true", "null", "undefined") → undefined.
 */
export function resolveValue(
  fieldId: string,
  raw: BitrixFieldValue,
  resolve: LabelResolver
): string[] | undefined {
  if (isSentinelValue(raw)) return undefined;
  if (Array.isArray(raw)) {
    const labels = raw
      .filter((item) => !isSentinelValue(item))
      .map((item) => String(item).trim())
      .map((item) => resolve(fieldId, item))
      .filter((item) => !isSentinelValue(item));
    return labels.length > 0 ? labels : undefined;
  }
  const label = resolve(fieldId, String(raw).trim());
  return !isSentinelValue(label) ? [label] : undefined;
}

/** Deduplicates strings, preserving first-seen order, trimming empties and sentinels. */
export function dedupe(values: Array<string | undefined>): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const value of values) {
    if (!value || isSentinelValue(value)) continue;
    const trimmed = value.trim();
    if (!trimmed || isSentinelValue(trimmed)) continue;
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
 * Invalid garbage and sentinels are skipped (never invented into a fake date).
 */
export function extractDates(raw: BitrixFieldValue): string[] {
  if (isSentinelValue(raw)) return [];
  const parts = Array.isArray(raw) ? raw : [raw];
  const out: string[] = [];
  for (const part of parts) {
    if (isSentinelValue(part)) continue;
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
  if (isSentinelValue(raw)) return undefined;
  if (Array.isArray(raw)) {
    const valid = raw.filter((item) => !isSentinelValue(item));
    if (valid.length === 0) return undefined;
    return valid.length === 1 ? parseQuantity(valid[0]) : valid.map(String).join("; ");
  }
  const str = String(raw).trim();
  if (str === "" || isSentinelValue(str)) return undefined;
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
