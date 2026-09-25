// src/lib/currency.ts
// ─────────────────────────────────────────────────────────────────────
// Pure authoritative currency normalization, symbols, and formatting.
// Central source of truth for all financial currency presentation across
// RusSilica BI Terminal (Commercial Funnel, Dashboard, Exports, Previews).
// ─────────────────────────────────────────────────────────────────────

/**
 * Normalizes currency codes according to corporate domain rules:
 * - RUR -> RUB
 * - RUB -> RUB
 * - USD -> USD
 * - EUR -> EUR
 * - Other valid non-empty codes remain isolated by their uppercase code (e.g. GBP, CNY)
 * - Missing/empty/whitespace currency is represented explicitly as UNKNOWN. Never coerced to RUB.
 */
export function normalizeCurrencyCode(code?: string | null): string {
  if (!code || typeof code !== "string") return "UNKNOWN";
  const trimmed = code.trim().toUpperCase();
  if (!trimmed) return "UNKNOWN";
  if (trimmed === "RUR") return "RUB";
  return trimmed;
}

/**
 * Returns symbol for known currencies or human-readable label for unknown / unclassified.
 */
export function getCurrencySymbol(currencyId?: string | null): string {
  const norm = normalizeCurrencyCode(currencyId);
  switch (norm) {
    case "RUB":
      return "₽";
    case "USD":
      return "$";
    case "EUR":
      return "€";
    case "UNKNOWN":
      return "валюта не указана";
    default:
      return norm;
  }
}

/**
 * Formats a monetary amount with currency truthfully according to domain presentation rules.
 * - 0 amount with undefined/null currencyId returns "0" (no false currency symbol).
 * - UNKNOWN returns "{formatted} — валюта не указана".
 * - Known currencies return "{formatted} {symbol}".
 */
export function formatCurrencyAmount(amount: number, currencyId?: string | null): string {
  if (amount === 0 && (currencyId === undefined || currencyId === null)) {
    return "0";
  }
  const norm = normalizeCurrencyCode(currencyId);
  const formatted = Math.round(amount).toLocaleString("ru-RU");
  switch (norm) {
    case "RUB":
      return `${formatted} ₽`;
    case "USD":
      return `${formatted} $`;
    case "EUR":
      return `${formatted} €`;
    case "UNKNOWN":
      return `${formatted} — валюта не указана`;
    default:
      return `${formatted} ${norm}`;
  }
}

/** Standard presentation sort order: RUB first, USD second, EUR third, others alphabetically, UNKNOWN last */
export const CURRENCY_DISPLAY_ORDER: Record<string, number> = {
  RUB: 1,
  USD: 2,
  EUR: 3,
};

/**
 * Deterministic sort comparator for currency buckets.
 */
export function sortCurrencyCodes(a: string, b: string): number {
  const orderA = a === "UNKNOWN" ? 999 : (CURRENCY_DISPLAY_ORDER[a] ?? 50);
  const orderB = b === "UNKNOWN" ? 999 : (CURRENCY_DISPLAY_ORDER[b] ?? 50);
  if (orderA !== orderB) return orderA - orderB;
  return a.localeCompare(b);
}
