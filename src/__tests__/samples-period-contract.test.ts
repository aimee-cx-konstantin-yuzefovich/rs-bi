// ─────────────────────────────────────────────────────────────────────
// Samples period contract — fixed inclusive business-calendar semantics.
// 30days = current Moscow calendar day + previous 29 (90/365 analogous).
// Pure predicate accepts injected `now`; boundary cases below.
// ─────────────────────────────────────────────────────────────────────
import { describe, expect, it } from "vitest";
import { matchesPeriod, samplesPeriodWindow } from "@/components/dashboard/samples/samples-filters";
import type { SampleSummary, SamplesFilters } from "@/components/dashboard/samples/samples-filters";

function summaryWithDates(dates: string[]): SampleSummary {
  return { sentDates: dates } as unknown as SampleSummary;
}

function filters(period: SamplesFilters["period"], extra?: Partial<SamplesFilters>): SamplesFilters {
  return { ...DEFAULT_BASE, period, ...extra };
}

const DEFAULT_BASE: SamplesFilters = {
  period: "all",
  companyQuery: "",
  responsibleId: "all",
  productFamily: "all",
  grade: "all",
  industry: "all",
  application: "all",
  status: "all",
  result: "all",
  hasDeals: "all",
  quality: "all",
};

// Fixed "now": 2026-09-26 12:00 UTC (15:00 Moscow) — well inside the day.
const NOW = new Date("2026-09-26T12:00:00Z");

describe("samples period contract", () => {
  it("30days includes today and 29 days ago; excludes 30 days ago", () => {
    const f = filters("30days");
    expect(matchesPeriod(summaryWithDates(["2026-09-26"]), f, NOW)).toBe(true);
    expect(matchesPeriod(summaryWithDates(["2026-08-28"]), f, NOW)).toBe(true); // 29 days before 09-26
    expect(matchesPeriod(summaryWithDates(["2026-08-27"]), f, NOW)).toBe(false); // 30 days before — outside
  });

  it("window is exactly 30 calendar days inclusive", () => {
    const { from, to } = samplesPeriodWindow(filters("30days"), NOW);
    expect(from).not.toBeNull();
    expect(to).not.toBeNull();
    const days = Math.round((to!.getTime() - from!.getTime()) / 86400000) + 1;
    expect(days).toBe(30);
  });

  it("month boundary: August 31 inside a 30-day window ending Sep 26? — no; Sep 1 yes", () => {
    const f = filters("30days");
    // Window: 2026-08-28 .. 2026-09-26 → Aug 31 inside, Aug 27 outside.
    expect(matchesPeriod(summaryWithDates(["2026-08-31"]), f, NOW)).toBe(true);
    expect(matchesPeriod(summaryWithDates(["2026-08-27"]), f, NOW)).toBe(false);
  });

  it("year boundary: Dec 31 2025 excluded from 90-day window ending Sep 26 2026", () => {
    const f = filters("90days");
    expect(matchesPeriod(summaryWithDates(["2025-12-31"]), f, NOW)).toBe(false);
    // 90 days window: 2026-06-29 .. 2026-09-26
    expect(matchesPeriod(summaryWithDates(["2026-06-29"]), f, NOW)).toBe(true);
    expect(matchesPeriod(summaryWithDates(["2026-06-28"]), f, NOW)).toBe(false);
  });

  it("365days includes previous 364 days (leap-day semantics: 2024-02-29 valid)", () => {
    const f = filters("365days");
    // Window: 2025-09-27 .. 2026-09-26
    expect(matchesPeriod(summaryWithDates(["2025-09-27"]), f, NOW)).toBe(true);
    expect(matchesPeriod(summaryWithDates(["2025-09-26"]), f, NOW)).toBe(false);
  });

  it("leap day 2024-02-29 is a valid date and never rolls to Mar 1", () => {
    const f = filters("custom", { customFrom: "2024-02-01", customTo: "2024-03-31" });
    expect(matchesPeriod(summaryWithDates(["2024-02-29"]), f, NOW)).toBe(true);
    // Invalid dates must never match any window:
    expect(matchesPeriod(summaryWithDates(["2023-02-29"]), f, NOW)).toBe(false);
  });

  it("custom inclusive from/to includes both endpoints", () => {
    const f = filters("custom", { customFrom: "2026-09-01", customTo: "2026-09-30" });
    expect(matchesPeriod(summaryWithDates(["2026-09-01"]), f, NOW)).toBe(true);
    expect(matchesPeriod(summaryWithDates(["2026-09-30"]), f, NOW)).toBe(true);
    expect(matchesPeriod(summaryWithDates(["2026-08-31"]), f, NOW)).toBe(false);
    expect(matchesPeriod(summaryWithDates(["2026-10-01"]), f, NOW)).toBe(false);
  });

  it("invalid custom dates and impossible sent dates never match", () => {
    const f = filters("custom", { customFrom: "2026-02-31", customTo: "2026-03-31" });
    // Invalid from → window open-ended at to; invalid sent date never matches.
    expect(matchesPeriod(summaryWithDates(["2026-02-31"]), f, NOW)).toBe(false);
    expect(matchesPeriod(summaryWithDates(["2026-04-31"]), f, NOW)).toBe(false);
    expect(matchesPeriod(summaryWithDates(["2026-03-15"]), f, NOW)).toBe(true);
  });

  it("impossible datetime 2026-09-01T25:00:00 is invalid, not 01:00 next day", () => {
    const f = filters("custom", { customFrom: "2026-09-01", customTo: "2026-09-02" });
    expect(matchesPeriod(summaryWithDates(["2026-09-01T25:00:00"]), f, NOW)).toBe(false);
  });

  it("period=all matches everything including empty sent dates", () => {
    const f = filters("all");
    expect(matchesPeriod(summaryWithDates([]), f, NOW)).toBe(true);
  });

  it("empty sentDates never matches a bounded period", () => {
    const f = filters("30days");
    expect(matchesPeriod(summaryWithDates([]), f, NOW)).toBe(false);
  });
});
