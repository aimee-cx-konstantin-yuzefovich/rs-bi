// src/lib/samples/status-canonical.ts
// ─────────────────────────────────────────────────────────────────────
// ONE canonical Samples status normalization for user-facing UI
// (dropdown/filter options, registry cells, Excel status columns).
//
// Pipeline (WP3 contract):
//   RAW SOURCES → existing canonical Samples precedence
//   → canonicalizeSampleStatusLabel (this module) → dropdown/filter
//
// Invariants:
// 1. Smart Process authoritative state wins: canonical SP stage labels
//    (committed stable semantics) pass through unchanged — this module
//    NEVER reclassifies a known SP stage or touches precedence
//    (SMART_PROCESS → DEAL_LEGACY → COMPANY_LEGACY → NONE).
// 2. Legacy participates only through the existing fallback path; known
//    historical aliases map ONLY through the explicit deterministic
//    SAMPLE_STATUS_ALIAS_MAP (exact, case-sensitive, trimmed strings).
// 3. NO fuzzy matching, NO substring guessing, NO lowercasing-based
//    semantic merging beyond sanctioned exact aliases.
// 4. Unknown historical values (raw enum IDs, DT1032_* tokens, near-miss
//    wordings) → UNCLASSIFIED_LABEL («Не классифицировано»). Raw IDs and
//    transport tokens never leak to the UI.
// 5. Never a second status engine: consumers keep consuming canonical
//    projection output; this module only normalizes the DISPLAY label at
//    the canonical seam.
// ─────────────────────────────────────────────────────────────────────

import { UNCLASSIFIED_LABEL } from "./constants";

/**
 * Ordered canonical user-facing status categories.
 * Order = canonical business order (also used for stable dropdown and
 * status-aware sorting). Legacy-only semantic states («Требуются образцы»,
 * «Требуется доработка») are preserved as ONE canonical category each —
 * never split by spelling/casing variants.
 */
export const CANONICAL_SAMPLE_UI_STATUSES = [
  "Подготовка к отправке",
  "Образцы отправлены",
  "На испытании",
  "Подошли",
  "Не подошли",
  "Требуются образцы",
  "Требуется доработка",
  UNCLASSIFIED_LABEL,
] as const;

export type CanonicalSampleUiStatus = (typeof CANONICAL_SAMPLE_UI_STATUSES)[number];

/** Canonical category → stable sort index (unknown labels → unclassified rank). */
export function canonicalSampleStatusOrder(label: string): number {
  const idx = (CANONICAL_SAMPLE_UI_STATUSES as readonly string[]).indexOf(label);
  return idx >= 0
    ? idx
    : (CANONICAL_SAMPLE_UI_STATUSES as readonly string[]).indexOf(UNCLASSIFIED_LABEL);
}

/**
 * Explicit deterministic alias table for KNOWN historical raw source
 * strings. Exact-string keys (post-trim); every value is one canonical
 * category. Adding aliases is a deliberate, reviewed act — never inferred
 * by casing/wording heuristics at runtime.
 */
export const SAMPLE_STATUS_ALIAS_MAP: Record<string, CanonicalSampleUiStatus> = {
  // Semantic duplicates historically produced by multiple legacy sources.
  "не подошли": "Не подошли",
  "Не подошли": "Не подошли",
  "Образец не подошел": "Не подошли",
  "Образец не подошёл": "Не подошли",
  "подошли": "Подошли",
  "Подошли": "Подошли",
  "Образец подошел": "Подошли",
  "Образец подошёл": "Подошли",
  "На испытании": "На испытании",
  "Образцы на испытании": "На испытании",
  "Образцы отправлены": "Образцы отправлены",
  "образцы отправлены": "Образцы отправлены",
};

/** Canonical labels that are identity-mapped (pass through untouched). */
const CANONICAL_SET: ReadonlySet<string> = new Set(CANONICAL_SAMPLE_UI_STATUSES);

/** Raw enum IDs (numeric) and SP transport tokens never become visible labels. */
const RAW_TOKEN_PATTERNS: RegExp[] = [/^\d+$/, /^DT1032_/i];

/**
 * Canonicalize ONE raw status value into its user-facing label.
 * Pure, deterministic, allocation-free on the happy path.
 */
export function canonicalizeSampleStatusLabel(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return UNCLASSIFIED_LABEL;
  if (RAW_TOKEN_PATTERNS.some((re) => re.test(trimmed))) return UNCLASSIFIED_LABEL;
  if (CANONICAL_SET.has(trimmed)) return trimmed;
  const alias = SAMPLE_STATUS_ALIAS_MAP[trimmed];
  return alias ?? UNCLASSIFIED_LABEL;
}

/**
 * Canonicalize a list, preserving first-seen order and deduplicating by
 * canonical label. Empty input → empty output (sentinel filtering stays
 * the caller's concern, matching existing projection behavior).
 */
export function canonicalizeSampleStatusList(values: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const value of values) {
    const canonical = canonicalizeSampleStatusLabel(value);
    if (seen.has(canonical)) continue;
    seen.add(canonical);
    out.push(canonical);
  }
  return out;
}

/**
 * Dropdown options from the observed canonical labels: canonical business
 * order, only categories actually present in the dataset. Raw duplicate
 * source strings can never appear (they collapse before this point).
 * `observedCanonicalLabels` must already be canonicalized.
 */
export function buildCanonicalStatusOptions(
  observedCanonicalLabels: Iterable<string>
): string[] {
  const observed = new Set(observedCanonicalLabels);
  if (observed.size === 0) return [];
  return (CANONICAL_SAMPLE_UI_STATUSES as readonly string[]).filter((s) =>
    observed.has(s)
  );
}
