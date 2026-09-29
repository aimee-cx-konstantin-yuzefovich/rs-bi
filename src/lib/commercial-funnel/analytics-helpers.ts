// src/lib/commercial-funnel/analytics-helpers.ts
// ─────────────────────────────────────────────────────────────────────
// Small shared primitives used by both the canonical engine and the
// management analytics layer. Kept dependency-free (types only) so the
// engine can import them without creating a cycle with analytics.ts.
// ─────────────────────────────────────────────────────────────────────

/**
 * Deterministic ID ordering for analytical populations (HB contract):
 * numeric-aware ascending compare so business output never depends on
 * accidental Set/Map insertion order.
 */
export function compareCompanyIds(a: string, b: string): number {
  const na = Number(a);
  const nb = Number(b);
  if (Number.isFinite(na) && Number.isFinite(nb) && String(na) === a && String(nb) === b) {
    return na - nb;
  }
  return a.localeCompare(b, "en");
}
