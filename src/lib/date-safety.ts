// src/lib/date-safety.ts
// ─────────────────────────────────────────────────────────────────────
// Strict calendar date validation and parsing helpers.
// Re-exports from canonical scalar-safety authority.
// ─────────────────────────────────────────────────────────────────────

export {
  isValidCalendarDate,
  isValidTime,
  parseStrictDate,
  parseStrictNumber,
  BUSINESS_TIMEZONE,
} from "./scalar-safety";

export type {
  DateParseMode,
  StrictDateOptions,
} from "./scalar-safety";
