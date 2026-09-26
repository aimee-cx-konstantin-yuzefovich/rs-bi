// src/lib/commercial-funnel/date-utils.ts
// ─────────────────────────────────────────────────────────────────────
// Pure date utilities for Commercial Funnel period calculations.
// Consistent boundaries, equal-duration prior periods, safe deltas,
// and explicit business timezone normalization (Europe/Moscow).
// ─────────────────────────────────────────────────────────────────────

import { COMMERCIAL_TIMEZONE } from "./constants";
import { isValidCalendarDate, parseStrictDate } from "@/lib/date-safety";
import type { CommercialFilters, PeriodBoundaries } from "./types";

const formatterCache = new Map<string, Intl.DateTimeFormat>();

export function getZonedFormatter(timeZone: string = COMMERCIAL_TIMEZONE): Intl.DateTimeFormat {
  let f = formatterCache.get(timeZone);
  if (!f) {
    f = new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    });
    formatterCache.set(timeZone, f);
  }
  return f;
}

/**
 * Extract zoned calendar parts (year, month, day, hour, minute, second)
 * for a Date in the authoritative business timezone.
 */
export function getZonedCalendarParts(
  d: Date,
  timeZone: string = COMMERCIAL_TIMEZONE
) {
  const formatter = getZonedFormatter(timeZone);
  const parts = formatter.formatToParts(d);
  const p: Record<string, number> = {};
  for (const part of parts) {
    if (part.type !== "literal") p[part.type] = Number(part.value);
  }
  return {
    year: p.year,
    month: p.month, // 1-12
    monthIndex: p.month - 1, // 0-11
    day: p.day,
    hour: p.hour === 24 ? 0 : p.hour,
    minute: p.minute,
    second: p.second,
  };
}

/**
 * Construct a Date object representing the exact wall-clock instant
 * in the business timezone.
 */
export function createZonedDate(
  year: number,
  monthIndex: number,
  day: number,
  hour = 0,
  minute = 0,
  second = 0,
  ms = 0,
  timeZone: string = COMMERCIAL_TIMEZONE
): Date {
  const targetUtc = Date.UTC(year, monthIndex, day, hour, minute, second, ms);
  // Fast-path: Europe/Moscow is permanently UTC+3 (no DST since Oct 2014)
  if (timeZone === COMMERCIAL_TIMEZONE || timeZone === "Europe/Moscow") {
    return new Date(targetUtc - 3 * 3600 * 1000);
  }

  const formatter = getZonedFormatter(timeZone);
  let guess = targetUtc - 3 * 3600 * 1000;
  for (let i = 0; i < 3; i++) {
    const parts = formatter.formatToParts(new Date(guess));
    const p: Record<string, number> = {};
    for (const part of parts) {
      if (part.type !== "literal") p[part.type] = Number(part.value);
    }
    const h = p.hour === 24 ? 0 : p.hour;
    const asUtc = Date.UTC(p.year, p.month - 1, p.day, h, p.minute, p.second, guess % 1000);
    const diff = targetUtc - asUtc;
    if (diff === 0) break;
    guess += diff;
  }
  return new Date(guess);
}

/**
 * Format a Date to YYYY-MM-DD in the business timezone
 */
export function toISODate(d: Date, timeZone: string = COMMERCIAL_TIMEZONE): string {
  const { year, month, day } = getZonedCalendarParts(d, timeZone);
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

const dateTimestampCache = new Map<string, number | null>();

/**
 * Parse an ISO date or datetime string into a timestamp or null.
 * - Date-only "YYYY-MM-DD": parsed at 00:00:00 in business timezone.
 * - Naive datetime "YYYY-MM-DD HH:mm:ss" or "YYYY-MM-DDTHH:mm:ss": parsed in business timezone.
 * - Datetime with explicit offset (Z, +HH:MM, -HH:MM): parsed via UTC epoch.
 */
export function parseDateTimestamp(
  dateStr?: string | null,
  timeZone: string = COMMERCIAL_TIMEZONE
): number | null {
  if (!dateStr || typeof dateStr !== "string") return null;
  const trimmed = dateStr.trim();
  if (!trimmed || trimmed === "—") return null;

  const cacheKey = `${timeZone}:${trimmed}`;
  if (dateTimestampCache.has(cacheKey)) {
    return dateTimestampCache.get(cacheKey)!;
  }

  if (dateTimestampCache.size > 20000) {
    dateTimestampCache.clear();
  }

  // Canonical strict date & datetime parsing:
  // Rejects invalid calendar dates, invalid times, clock overflows, and interprets naive datetimes in business timezone.
  const parsed = parseStrictDate(trimmed, { mode: "DATETIME_BUSINESS_TIMEZONE", timeZone });
  const result = parsed && !isNaN(parsed.getTime()) ? parsed.getTime() : null;

  dateTimestampCache.set(cacheKey, result);
  return result;
}

/**
 * Calculate the exact start and end dates for both the current selected period
 * and the immediately preceding period of equal duration.
 * Normalized to the business timezone.
 */
export function computePeriodBoundaries(
  filters: CommercialFilters,
  now: Date = new Date(),
  timeZone: string = COMMERCIAL_TIMEZONE
): PeriodBoundaries {
  const { periodPreset, customFrom, customTo } = filters;
  const nowParts = getZonedCalendarParts(now, timeZone);

  let currentStart: Date;
  let currentEnd: Date = createZonedDate(
    nowParts.year,
    nowParts.monthIndex,
    nowParts.day,
    23,
    59,
    59,
    999,
    timeZone
  );

  if (periodPreset === "custom" && customFrom && customTo) {
    // Validate boundaries strictly against calendar rules
    const parsedFrom = parseStrictDate(customFrom, { mode: "DATE_ONLY" });
    const parsedTo = parseStrictDate(customTo, { mode: "DATE_ONLY" });

    if (!parsedFrom || !parsedTo) {
      throw new Error(
        `Invalid custom period boundaries: '${customFrom}' to '${customTo}' contains an impossible calendar date`
      );
    }

    let earlier = parsedFrom;
    let later = parsedTo;
    if (earlier.getTime() > later.getTime()) {
      earlier = parsedTo;
      later = parsedFrom;
    }

    currentStart = createZonedDate(
      earlier.getUTCFullYear(),
      earlier.getUTCMonth(),
      earlier.getUTCDate(),
      0,
      0,
      0,
      0,
      timeZone
    );
    currentEnd = createZonedDate(
      later.getUTCFullYear(),
      later.getUTCMonth(),
      later.getUTCDate(),
      23,
      59,
      59,
      999,
      timeZone
    );
  } else if (periodPreset === "quarter") {
    const quarterIndex = Math.floor(nowParts.monthIndex / 3); // 0, 1, 2, 3
    const qStartMonth = quarterIndex * 3;
    currentStart = createZonedDate(nowParts.year, qStartMonth, 1, 0, 0, 0, 0, timeZone);
    const qEndMonth = qStartMonth + 2;
    const lastDay = new Date(Date.UTC(nowParts.year, qEndMonth + 1, 0)).getUTCDate();
    currentEnd = createZonedDate(nowParts.year, qEndMonth, lastDay, 23, 59, 59, 999, timeZone);
  } else {
    const daysMap: Record<string, number> = {
      "7days": 7,
      "30days": 30,
      "90days": 90,
    };
    const days = daysMap[periodPreset] || 30;
    // Exactly N whole days ending at currentEnd
    const durationMs = (days * 24 * 60 * 60 * 1000) - 1000;
    const rawStart = new Date(currentEnd.getTime() - durationMs);
    const sParts = getZonedCalendarParts(rawStart, timeZone);
    currentStart = createZonedDate(sParts.year, sParts.monthIndex, sParts.day, 0, 0, 0, 0, timeZone);
  }

  // Calculate prior period of exact equal duration
  const durationMs = currentEnd.getTime() - currentStart.getTime();
  const previousEnd = new Date(currentStart.getTime() - 1);
  const previousStart = new Date(previousEnd.getTime() - durationMs);

  return {
    currentStart,
    currentEnd,
    previousStart,
    previousEnd,
    currentStartStr: toISODate(currentStart, timeZone),
    currentEndStr: toISODate(currentEnd, timeZone),
    previousStartStr: toISODate(previousStart, timeZone),
    previousEndStr: toISODate(previousEnd, timeZone),
  };
}

/**
 * Check if a date string falls within [startDate, endDate] inclusive
 */
export function isDateInPeriod(
  dateStr?: string | null,
  startDate?: Date,
  endDate?: Date,
  timeZone: string = COMMERCIAL_TIMEZONE
): boolean {
  if (!dateStr || !startDate || !endDate) return false;
  const ts = parseDateTimestamp(dateStr, timeZone);
  if (ts === null) return false;
  return ts >= startDate.getTime() && ts <= endDate.getTime();
}

/**
 * Calculate days between a given date and a reference date (defaults to now).
 * Evaluates full calendar day intervals. Returns null if the date is invalid or absent.
 */
export function calculateDaysWaiting(
  dateStr?: string | null,
  now: Date = new Date(),
  timeZone: string = COMMERCIAL_TIMEZONE
): number | null {
  if (!dateStr) return null;
  const ts = parseDateTimestamp(dateStr, timeZone);
  if (ts === null) return null;
  const diffMs = now.getTime() - ts;
  if (diffMs < 0) return 0;
  return Math.floor(diffMs / (24 * 60 * 60 * 1000));
}

/**
 * Calculate percentage delta safely without NaN or Infinity.
 * Returns null if denominator is zero or invalid.
 */
export function safeDeltaPercent(current: number, previous: number): number | null {
  if (!Number.isFinite(current) || !Number.isFinite(previous)) return null;
  if (previous === 0) {
    if (current === 0) return 0;
    return null; // Denominator zero with positive/negative numerator -> no valid percentage
  }
  const pct = ((current - previous) / Math.abs(previous)) * 100;
  return Math.round(pct * 10) / 10;
}
