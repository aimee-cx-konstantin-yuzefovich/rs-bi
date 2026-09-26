// src/lib/scalar-safety.ts
// ─────────────────────────────────────────────────────────────────────
// Authoritative scalar normalization authority for RusSilica BI.
// Enforces single strict contract for numbers and calendar dates across:
// Ingress, Normalization, Analytics Engine, UI components, and Excel exports.
// ─────────────────────────────────────────────────────────────────────

export const BUSINESS_TIMEZONE = "Europe/Moscow";

/**
 * Validates that year, month (1-12), and day (1-31) form a real calendar date.
 * Rejects leap year errors (2026-02-29), day overflows (2026-02-31, 2026-04-31),
 * and impossible components (00.01.2026, 32.01.2026).
 */
export function isValidCalendarDate(year: number, month: number, day: number): boolean {
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) {
    return false;
  }
  if (year < 1000 || year > 9999 || month < 1 || month > 12 || day < 1 || day > 31) {
    return false;
  }
  const d = new Date(Date.UTC(year, month - 1, day, 12, 0, 0));
  return (
    d.getUTCFullYear() === year &&
    d.getUTCMonth() === month - 1 &&
    d.getUTCDate() === day
  );
}

/**
 * Validates that hours, minutes, and seconds are within 24-hour clock boundaries.
 */
export function isValidTime(hour: number, minute: number, second = 0): boolean {
  return (
    Number.isInteger(hour) &&
    hour >= 0 &&
    hour <= 23 &&
    Number.isInteger(minute) &&
    minute >= 0 &&
    minute <= 59 &&
    Number.isInteger(second) &&
    second >= 0 &&
    second <= 59
  );
}

export type DateParseMode =
  | "AUTO"
  | "DATE_ONLY"
  | "DATETIME_BUSINESS_TIMEZONE"
  | "DATETIME_EXPLICIT_OFFSET";

export interface StrictDateOptions {
  mode?: DateParseMode;
  timeZone?: string;
}

/**
 * Canonical strict business date and datetime parser.
 * Rejects calendar rollovers (2026-02-31, 2026-04-31) and clock overflows (25:00:00, 12:99:00, 12:30:99).
 * Evaluates naive datetime strings deterministically in the business timezone (Europe/Moscow, UTC+3).
 */
export function parseStrictDate(
  dateStr: unknown,
  options?: StrictDateOptions | ParseDateMode
): Date | null {
  if (dateStr === null || dateStr === undefined) return null;
  if (dateStr instanceof Date) {
    return isNaN(dateStr.getTime()) ? null : dateStr;
  }
  if (typeof dateStr !== "string") return null;

  const str = dateStr.trim();
  if (!str || str === "—") return null;

  const mode = typeof options === "string" ? options : options?.mode || "AUTO";
  const timeZone = typeof options === "object" ? options?.timeZone || BUSINESS_TIMEZONE : BUSINESS_TIMEZONE;

  // 1. Pure ISO Date: YYYY-MM-DD
  const isoDateMatch = str.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (isoDateMatch) {
    const y = Number(isoDateMatch[1]);
    const m = Number(isoDateMatch[2]);
    const d = Number(isoDateMatch[3]);
    if (!isValidCalendarDate(y, m, d)) return null;

    if (mode === "DATETIME_BUSINESS_TIMEZONE") {
      // 00:00:00 in Moscow is 21:00:00 UTC previous day (UTC+3)
      return new Date(Date.UTC(y, m - 1, d, 0, 0, 0) - 3 * 3600 * 1000);
    }
    // Standard calendar date instant: 00:00:00 UTC
    return new Date(Date.UTC(y, m - 1, d, 0, 0, 0));
  }

  // 2. Pure Russian Date: DD.MM.YYYY
  const ruDateMatch = str.match(/^(\d{2})\.(\d{2})\.(\d{4})$/);
  if (ruDateMatch) {
    const d = Number(ruDateMatch[1]);
    const m = Number(ruDateMatch[2]);
    const y = Number(ruDateMatch[3]);
    if (!isValidCalendarDate(y, m, d)) return null;

    if (mode === "DATETIME_BUSINESS_TIMEZONE") {
      return new Date(Date.UTC(y, m - 1, d, 0, 0, 0) - 3 * 3600 * 1000);
    }
    return new Date(Date.UTC(y, m - 1, d, 0, 0, 0));
  }

  // 3. ISO Datetime: YYYY-MM-DD[T ]HH:mm(:ss)?(.sss)?(Z|[+-]HH:?mm)?
  const isoDtMatch = str.match(
    /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2}))?(?:\.(\d{1,3})\d*)?(Z|[+-]\d{2}:?\d{2})?$/
  );
  if (isoDtMatch) {
    const y = Number(isoDtMatch[1]);
    const m = Number(isoDtMatch[2]);
    const d = Number(isoDtMatch[3]);
    const hh = Number(isoDtMatch[4]);
    const mm = Number(isoDtMatch[5]);
    const ss = Number(isoDtMatch[6] || 0);
    const ms = isoDtMatch[7] ? Number(isoDtMatch[7].padEnd(3, "0")) : 0;
    const tz = isoDtMatch[8];

    if (!isValidCalendarDate(y, m, d)) return null;
    if (!isValidTime(hh, mm, ss)) return null;

    if (tz) {
      if (mode === "DATETIME_BUSINESS_TIMEZONE" && tz !== "Z" && !tz.startsWith("+03")) {
        // Mode explicitly requires business timezone interpretation, but offset is present
      }
      if (tz === "Z") {
        return new Date(Date.UTC(y, m - 1, d, hh, mm, ss, ms));
      }
      const sign = tz[0] === "-" ? -1 : 1;
      const tzRaw = tz.slice(1).replace(":", "");
      const tzH = Number(tzRaw.slice(0, 2));
      const tzM = Number(tzRaw.slice(2, 4));
      if (!isValidTime(tzH, tzM, 0)) return null;

      const offsetMinutes = sign * (tzH * 60 + tzM);
      const utcEpoch = Date.UTC(y, m - 1, d, hh, mm, ss, ms) - offsetMinutes * 60 * 1000;
      return new Date(utcEpoch);
    }

    // Timezone-less datetime: interpret in business timezone if explicitly requested;
    // otherwise deterministic UTC, server timezone independent.
    if (mode === "DATETIME_BUSINESS_TIMEZONE") {
      const businessOffsetMinutes = 180; // UTC+3 permanently
      const utcEpoch = Date.UTC(y, m - 1, d, hh, mm, ss, ms) - businessOffsetMinutes * 60 * 1000;
      return new Date(utcEpoch);
    }
    return new Date(Date.UTC(y, m - 1, d, hh, mm, ss, ms));
  }

  // 4. Russian Datetime: DD.MM.YYYY[T ]HH:mm(:ss)?(.sss)?(Z|[+-]HH:?mm)?
  const ruDtMatch = str.match(
    /^(\d{2})\.(\d{2})\.(\d{4})[T ](\d{2}):(\d{2})(?::(\d{2}))?(?:\.(\d{1,3})\d*)?(Z|[+-]\d{2}:?\d{2})?$/
  );
  if (ruDtMatch) {
    const d = Number(ruDtMatch[1]);
    const m = Number(ruDtMatch[2]);
    const y = Number(ruDtMatch[3]);
    const hh = Number(ruDtMatch[4]);
    const mm = Number(ruDtMatch[5]);
    const ss = Number(ruDtMatch[6] || 0);
    const ms = ruDtMatch[7] ? Number(ruDtMatch[7].padEnd(3, "0")) : 0;
    const tz = ruDtMatch[8];

    if (!isValidCalendarDate(y, m, d)) return null;
    if (!isValidTime(hh, mm, ss)) return null;

    if (tz) {
      if (tz === "Z") {
        return new Date(Date.UTC(y, m - 1, d, hh, mm, ss, ms));
      }
      const sign = tz[0] === "-" ? -1 : 1;
      const tzRaw = tz.slice(1).replace(":", "");
      const tzH = Number(tzRaw.slice(0, 2));
      const tzM = Number(tzRaw.slice(2, 4));
      if (!isValidTime(tzH, tzM, 0)) return null;

      const offsetMinutes = sign * (tzH * 60 + tzM);
      const utcEpoch = Date.UTC(y, m - 1, d, hh, mm, ss, ms) - offsetMinutes * 60 * 1000;
      return new Date(utcEpoch);
    }

    if (mode === "DATETIME_BUSINESS_TIMEZONE") {
      const businessOffsetMinutes = 180;
      const utcEpoch = Date.UTC(y, m - 1, d, hh, mm, ss, ms) - businessOffsetMinutes * 60 * 1000;
      return new Date(utcEpoch);
    }
    return new Date(Date.UTC(y, m - 1, d, hh, mm, ss, ms));
  }

  return null;
}

/**
 * Strict numeric parser for CRM business fields (opportunity, amount, quantities).
 * Accepts integers, floats, comma-separated decimals, and space-separated thousands.
 * Strictly rejects trailing/preceding text (e.g. "12abc", "RUB 100", "---").
 */
export function parseStrictNumber(value: unknown): number | undefined {
  if (value === null || value === undefined) return undefined;
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : undefined;
  }
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  if (!trimmed || trimmed === "—") return undefined;

  const normalized = trimmed.replace(/[\s\u00A0]+/g, "").replace(",", ".");
  if (!/^[+-]?\d+(?:\.\d+)?$/.test(normalized)) {
    return undefined;
  }

  const num = Number(normalized);
  return Number.isFinite(num) ? num : undefined;
}
