// src/lib/excel-brand/tokens.ts
// ─────────────────────────────────────────────────────────────────────
// Centralized RusSilica Excel design tokens.
// Single source of truth for all Excel exports across the application.
// ─────────────────────────────────────────────────────────────────────

/** Approved base brand colors (without '#' for ExcelJS ARGB / RGB hex) */
export const RS_BLUE_PRIMARY = "1E509C";
export const RS_ORANGE_ACCENT = "FF761C";

/** Supporting corporate palette */
export const RS_WHITE = "FFFFFF";
export const RS_BACKGROUND = "F7F9FC";       // subtle zebra row fill
export const RS_BACKGROUND_ALT = "F3F6FA";   // section headers & card backgrounds
export const RS_BORDER = "D9E0E8";           // light table grid border
export const RS_TEXT_PRIMARY = "1F2937";     // dark slate text
export const RS_TEXT_SECONDARY = "667085";   // muted metadata text

/** Semantic status colors */
export const SUCCESS_BG = "EAF7EE";
export const SUCCESS_TEXT = "267A45";

export const IN_PROGRESS_BG = "EAF1FB";
export const IN_PROGRESS_TEXT = "1E509C";

export const ATTENTION_BG = "FFF4DB";
export const ATTENTION_TEXT = "9A6700";

export const NEGATIVE_BG = "FDECEC";
export const NEGATIVE_TEXT = "B42318";

export const UNKNOWN_BG = "F2F4F7";
export const UNKNOWN_TEXT = "667085";

export const NEUTRAL_BG = "F8FAFC";
export const NEUTRAL_TEXT = "475569";

/** Typography */
export const RS_FONT_FAMILY = "Arial";

export const FONT_SIZES = {
  TITLE: 18,
  SUBTITLE: 12,
  SECTION_HEADER: 12,
  TABLE_HEADER: 10,
  DATA: 10,
  METADATA: 9,
  KPI_VALUE: 20,
  KPI_LABEL: 9,
} as const;

/** Canonical number format masks */
export const NUMFMT = {
  DATE: "dd.mm.yyyy",
  DATETIME: "dd.mm.yyyy hh:mm",
  TIME: "hh:mm",
  MONEY: '#,##0 "₽"',
  MONEY_PRECISE: '#,##0.00 "₽"',
  INTEGER: "#,##0",
  DECIMAL_2: "#,##0.00",
  PERCENT: "0.0%",
  DELTA_MONEY: '+#,##0 "₽";-#,##0 "₽";0 "₽"',
  DELTA_INTEGER: "+#,##0;-#,##0;0",
} as const;

/** Currency-aware number format masks */
export const CURRENCY_NUMFMT = {
  RUB: {
    MONEY: '#,##0 "₽"',
    MONEY_PRECISE: '#,##0.00 "₽"',
  },
  USD: {
    MONEY: '$#,##0',
    MONEY_PRECISE: '$#,##0.00',
  },
  EUR: {
    MONEY: '#,##0 "€"',
    MONEY_PRECISE: '#,##0.00 "€"',
  },
  UNKNOWN: {
    MONEY: '#,##0',
    MONEY_PRECISE: '#,##0.00',
  },
} as const;

/**
 * Returns currency-aware Excel number format mask.
 * Missing or unknown currency safely defaults to neutral numeric formatting.
 */
export function getMoneyNumFmt(currency?: string | null, precise: boolean = false): string {
  if (!currency || typeof currency !== "string") {
    return precise ? CURRENCY_NUMFMT.UNKNOWN.MONEY_PRECISE : CURRENCY_NUMFMT.UNKNOWN.MONEY;
  }
  const upper = currency.trim().toUpperCase();
  if (upper === "RUB" || upper === "RUR" || upper === "₽") {
    return precise ? CURRENCY_NUMFMT.RUB.MONEY_PRECISE : CURRENCY_NUMFMT.RUB.MONEY;
  }
  if (upper === "USD" || upper === "$") {
    return precise ? CURRENCY_NUMFMT.USD.MONEY_PRECISE : CURRENCY_NUMFMT.USD.MONEY;
  }
  if (upper === "EUR" || upper === "€") {
    return precise ? CURRENCY_NUMFMT.EUR.MONEY_PRECISE : CURRENCY_NUMFMT.EUR.MONEY;
  }
  return precise ? CURRENCY_NUMFMT.UNKNOWN.MONEY_PRECISE : CURRENCY_NUMFMT.UNKNOWN.MONEY;
}

/** Standard business timezone for management reports */
export const REPORT_TIMEZONE = "Europe/Moscow";

/**
 * Formats a Date in the designated business timezone (default: Europe/Moscow).
 * Uses Intl.DateTimeFormat for strict timezone correctness without manual offset math.
 */
export function formatReportDateTime(
  date: Date = new Date(),
  timezone: string = REPORT_TIMEZONE
): string {
  const formatter = new Intl.DateTimeFormat("ru-RU", {
    timeZone: timezone,
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
  return formatter.format(date).replace(",", "");
}

export function formatReportDate(
  date: Date = new Date(),
  timezone: string = REPORT_TIMEZONE
): string {
  const formatter = new Intl.DateTimeFormat("ru-RU", {
    timeZone: timezone,
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
  return formatter.format(date);
}

export function formatReportDateForFilename(
  date: Date = new Date(),
  timezone: string = REPORT_TIMEZONE
): string {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  return formatter.format(date);
}

/** Canonical company / report labels */
export const RS_COMPANY_NAME = "РусСилика";
export const RS_SYSTEM_TITLE = "RusSilica BI Terminal";
export const RS_FOOTER_TEXT = "RusSilica BI Terminal • Внутренний управленческий отчёт";
