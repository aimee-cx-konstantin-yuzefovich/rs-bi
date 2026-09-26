// src/lib/commercial-funnel/currency.ts
// ─────────────────────────────────────────────────────────────────────
// Canonical currency universe and multi-currency formatting utilities.
// Guarantees that quality-only currencies never disappear even when numeric
// amounts are absent or invalid.
// ─────────────────────────────────────────────────────────────────────

import { normalizeCurrencyCode } from "@/lib/currency";

export { formatCurrencyAmount, getCurrencySymbol, normalizeCurrencyCode } from "@/lib/currency";

/**
 * Authoritative currency universe helper.
 * Derives the complete union of currencies across any number of numeric amount maps
 * and quality state maps (current, previous, manager-level, etc.).
 *
 * Deterministically sorted alphabetically.
 */
export function getCurrencyUniverse(
  ...maps: Array<Record<string, unknown> | undefined | null>
): string[] {
  const currencySet = new Set<string>();

  for (const map of maps) {
    if (map && typeof map === "object") {
      for (const rawKey of Object.keys(map)) {
        const trimmed = String(rawKey || "").trim();
        if (trimmed) {
          currencySet.add(normalizeCurrencyCode(trimmed));
        }
      }
    }
  }

  return Array.from(currencySet).sort((a, b) => a.localeCompare(b));
}
