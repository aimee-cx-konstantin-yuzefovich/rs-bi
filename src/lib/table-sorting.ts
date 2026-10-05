// src/lib/table-sorting.ts
// ─────────────────────────────────────────────────────────────────────
// ONE shared client-side table sorting utility (WP8).
//
// Pipeline invariant: filters → sorting → pagination. Sort the ENTIRE
// filtered dataset; paginate only afterwards.
//
// Comparator rules:
// - TEXT → locale-aware ("ru") comparison of the DISPLAYED value;
// - NUMBER → numeric comparison;
// - DATE → chronological (pre-parsed epoch ms or Date.parse);
// - STATUS → canonical displayed status / declared business order;
// - EMPTY / «—» / null / undefined → ALWAYS LAST in BOTH directions;
// - never sort by raw legacy IDs, hidden internal codes, or raw transport
//   field names (callers pass displayed values only).
// ─────────────────────────────────────────────────────────────────────

export type SortDirection = "asc" | "desc" | null;

/** Values that count as "empty" and always sort last. */
export const SORT_EMPTY_TOKENS = new Set(["", "—", "–", "-"]);

export function isEmptySortValue(v: string | number | null | undefined): boolean {
  if (v === null || v === undefined) return true;
  if (typeof v === "number") return !Number.isFinite(v);
  return SORT_EMPTY_TOKENS.has(v.trim());
}

export type SortValue = string | number | null | undefined;

/**
 * Core comparator: ascending order with empties ALWAYS LAST.
 * Returns 0 for equal non-empty values.
 */
export function compareAsc(a: SortValue, b: SortValue): number {
  const aEmpty = isEmptySortValue(a);
  const bEmpty = isEmptySortValue(b);
  if (aEmpty && bEmpty) return 0;
  if (aEmpty) return 1;
  if (bEmpty) return -1;

  if (typeof a === "number" && typeof b === "number") {
    return a - b;
  }
  return String(a).localeCompare(String(b), "ru", { numeric: true });
}

/** Directional comparator: asc | desc; empties last in BOTH directions. */
export function compareByDirection(a: SortValue, b: SortValue, direction: SortDirection): number {
  if (direction !== "desc") return compareAsc(a, b);
  const aEmpty = isEmptySortValue(a);
  const bEmpty = isEmptySortValue(b);
  if (aEmpty && bEmpty) return 0;
  if (aEmpty) return 1;
  if (bEmpty) return -1;
  // Flip only the non-empty comparison.
  if (typeof a === "number" && typeof b === "number") return b - a;
  return String(b).localeCompare(String(a), "ru", { numeric: true });
}

/**
 * Stable sort helper over the full dataset. `getSortValue` must return the
 * DISPLAYED value (never a raw ID / internal code) or pre-parsed epoch ms
 * for dates. Ties fall back to the original order (stable in modern V8).
 */
export function sortRows<T>(
  rows: readonly T[],
  getSortValue: (row: T) => SortValue,
  direction: SortDirection
): T[] {
  if (!direction) return [...rows];
  return [...rows].sort((a, b) => compareByDirection(getSortValue(a), getSortValue(b), direction));
}

/**
 * Status comparator: canonical business order first (via `orderOf`),
 * unknown labels after known ones, empties still last overall.
 */
export function compareStatus(
  a: SortValue,
  b: SortValue,
  orderOf: (label: string) => number,
  direction: SortDirection
): number {
  const aEmpty = isEmptySortValue(a);
  const bEmpty = isEmptySortValue(b);
  if (aEmpty && bEmpty) return 0;
  if (aEmpty) return 1;
  if (bEmpty) return -1;

  const aOrder = orderOf(String(a).trim());
  const bOrder = orderOf(String(b).trim());
  const cmp = aOrder === bOrder ? 0 : aOrder < bOrder ? -1 : 1;
  return direction === "desc" ? -cmp : cmp;
}

/** Standard tri-state click progression: none → asc → desc → none. */
export function nextSortDirection(current: SortDirection): SortDirection {
  if (current === null) return "asc";
  if (current === "asc") return "desc";
  return null;
}

/** `aria-sort` attribute value for a sortable column header. */
export function ariaSortValue(direction: SortDirection, isThisColumn: boolean): "ascending" | "descending" | undefined {
  if (!isThisColumn || !direction) return undefined;
  return direction === "asc" ? "ascending" : "descending";
}
