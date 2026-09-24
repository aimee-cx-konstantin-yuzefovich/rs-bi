// src/lib/commercial-funnel/date-utils.ts
// ─────────────────────────────────────────────────────────────────────
// Pure date utilities for Commercial Funnel period calculations.
// Consistent boundaries, equal-duration prior periods, and safe deltas.
// ─────────────────────────────────────────────────────────────────────

import type { CommercialFilters, PeriodBoundaries } from "./types";

/**
 * Format a Date to YYYY-MM-DD (ISO date string)
 */
export function toISODate(d: Date): string {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/**
 * Parse an ISO date or datetime string into a timestamp or null.
 * Handles "YYYY-MM-DD", "YYYY-MM-DDTHH:mm:ss", etc.
 */
export function parseDateTimestamp(dateStr?: string | null): number | null {
  if (!dateStr || typeof dateStr !== "string") return null;
  const trimmed = dateStr.trim();
  if (!trimmed) return null;

  // If date-only string "YYYY-MM-DD", parse as start of day local/UTC
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    const [y, m, d] = trimmed.split("-").map(Number);
    const date = new Date(y, m - 1, d, 0, 0, 0, 0);
    return isNaN(date.getTime()) ? null : date.getTime();
  }

  const d = new Date(trimmed);
  return isNaN(d.getTime()) ? null : d.getTime();
}

/**
 * Calculate the exact start and end dates for both the current selected period
 * and the immediately preceding period of equal duration.
 */
export function computePeriodBoundaries(
  filters: CommercialFilters,
  now: Date = new Date()
): PeriodBoundaries {
  const { periodPreset, customFrom, customTo } = filters;

  let currentStart: Date;
  let currentEnd: Date = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);

  if (periodPreset === "custom" && customFrom && customTo) {
    const [fy, fm, fd] = customFrom.split("-").map(Number);
    const [ty, tm, td] = customTo.split("-").map(Number);
    let s = new Date(fy, fm - 1, fd, 0, 0, 0, 0);
    let e = new Date(ty, tm - 1, td, 23, 59, 59, 999);
    if (s.getTime() > e.getTime()) {
      const tmp = s;
      s = e;
      e = tmp;
    }
    currentStart = s;
    currentEnd = e;
  } else if (periodPreset === "quarter") {
    const currentMonth = now.getMonth();
    const quarterIndex = Math.floor(currentMonth / 3); // 0, 1, 2, 3
    const qStartMonth = quarterIndex * 3;
    currentStart = new Date(now.getFullYear(), qStartMonth, 1, 0, 0, 0, 0);
    // End of quarter
    const qEndMonth = qStartMonth + 2;
    const lastDay = new Date(now.getFullYear(), qEndMonth + 1, 0).getDate();
    currentEnd = new Date(now.getFullYear(), qEndMonth, lastDay, 23, 59, 59, 999);
  } else {
    const daysMap: Record<string, number> = {
      "7days": 7,
      "30days": 30,
      "90days": 90,
    };
    const days = daysMap[periodPreset] || 30;
    currentStart = new Date(currentEnd.getTime() - days * 24 * 60 * 60 * 1000 + 1);
    currentStart.setHours(0, 0, 0, 0);
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
    currentStartStr: toISODate(currentStart),
    currentEndStr: toISODate(currentEnd),
    previousStartStr: toISODate(previousStart),
    previousEndStr: toISODate(previousEnd),
  };
}

/**
 * Check if a date string falls within [startDate, endDate] inclusive
 */
export function isDateInPeriod(
  dateStr?: string | null,
  startDate?: Date,
  endDate?: Date
): boolean {
  if (!dateStr || !startDate || !endDate) return false;
  const ts = parseDateTimestamp(dateStr);
  if (ts === null) return false;
  return ts >= startDate.getTime() && ts <= endDate.getTime();
}

/**
 * Calculate days between a given date and a reference date (defaults to now).
 * Returns null if the date is invalid or absent.
 */
export function calculateDaysWaiting(
  dateStr?: string | null,
  now: Date = new Date()
): number | null {
  if (!dateStr) return null;
  const ts = parseDateTimestamp(dateStr);
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
