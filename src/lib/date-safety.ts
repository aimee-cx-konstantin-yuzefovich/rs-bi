// src/lib/date-safety.ts
// ─────────────────────────────────────────────────────────────────────
// Strict calendar date validation and parsing helpers.
// Prevents silent date normalization errors (e.g. 2026-02-31 -> 2026-03-03).
// ─────────────────────────────────────────────────────────────────────

/**
 * Validates that year, month (1-12), and day (1-31) form a real calendar date.
 * Rejects leap year errors (2026-02-29), day overflows (2026-02-31, 31.04.2026),
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
 * Parses a date or datetime string with strict calendar validation.
 * Returns a valid Date object or null if invalid or impossible calendar date.
 */
export function parseStrictDate(dateStr: unknown): Date | null {
  if (dateStr === null || dateStr === undefined) return null;
  if (dateStr instanceof Date) {
    return isNaN(dateStr.getTime()) ? null : dateStr;
  }
  if (typeof dateStr !== "string") return null;

  const str = dateStr.trim();
  if (!str || str === "—") return null;

  // 1. Pure ISO Date: YYYY-MM-DD
  const isoMatch = str.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (isoMatch) {
    const y = Number(isoMatch[1]);
    const m = Number(isoMatch[2]);
    const d = Number(isoMatch[3]);
    if (!isValidCalendarDate(y, m, d)) return null;
    return new Date(Date.UTC(y, m - 1, d, 0, 0, 0));
  }

  // 2. Pure Russian Date: DD.MM.YYYY
  const ruMatch = str.match(/^(\d{2})\.(\d{2})\.(\d{4})$/);
  if (ruMatch) {
    const d = Number(ruMatch[1]);
    const m = Number(ruMatch[2]);
    const y = Number(ruMatch[3]);
    if (!isValidCalendarDate(y, m, d)) return null;
    return new Date(Date.UTC(y, m - 1, d, 0, 0, 0));
  }

  // 3. ISO Datetime: YYYY-MM-DD[T ]HH:mm(:ss)?(.sss)?(Z|[+-]HH:mm)?
  const isoDtMatch = str.match(
    /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2}))?(?:\.\d+)?(?:Z|[+-]\d{2}:?\d{2})?$/
  );
  if (isoDtMatch) {
    const y = Number(isoDtMatch[1]);
    const m = Number(isoDtMatch[2]);
    const d = Number(isoDtMatch[3]);
    if (!isValidCalendarDate(y, m, d)) return null;
    const dt = new Date(str.includes("T") || str.includes("Z") ? str : str.replace(" ", "T") + "Z");
    return isNaN(dt.getTime()) ? null : dt;
  }

  // 4. Russian Datetime: DD.MM.YYYY[T ]HH:mm(:ss)?
  const ruDtMatch = str.match(/^(\d{2})\.(\d{2})\.(\d{4})[T ](\d{2}):(\d{2})(?::(\d{2}))?$/);
  if (ruDtMatch) {
    const d = Number(ruDtMatch[1]);
    const m = Number(ruDtMatch[2]);
    const y = Number(ruDtMatch[3]);
    const hh = Number(ruDtMatch[4]);
    const mm = Number(ruDtMatch[5]);
    const ss = Number(ruDtMatch[6] || 0);
    if (!isValidCalendarDate(y, m, d)) return null;
    if (hh > 23 || mm > 59 || ss > 59) return null;
    const dt = new Date(Date.UTC(y, m - 1, d, hh, mm, ss));
    return isNaN(dt.getTime()) ? null : dt;
  }

  return null;
}
