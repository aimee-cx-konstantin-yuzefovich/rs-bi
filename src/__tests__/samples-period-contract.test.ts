// ─────────────────────────────────────────────────────────────────────
// Samples period contract — fixed inclusive business-calendar semantics.
// 7days = current Moscow calendar day + previous 6 (14/30/90 analogous).
// Pure predicate accepts injected `now`; boundary cases below.
// ─────────────────────────────────────────────────────────────────────
import { describe, expect, it } from "vitest";
import {
  matchesPeriod,
  normalizeSamplesPeriodPreset,
  samplesPeriodWindow,
  type SamplesFilters,
} from "@/components/dashboard/samples/samples-filters";
import type { SampleSummary } from "@/lib/samples/types";

function summaryWithDates(dates: string[]): SampleSummary {
  return { sentDates: dates } as unknown as SampleSummary;
}

function filters(period: SamplesFilters["period"], extra?: Partial<SamplesFilters>): SamplesFilters {
  return { ...DEFAULT_BASE, period, ...extra };
}

const DEFAULT_BASE: SamplesFilters = {
  period: "30days",
  companyQuery: "",
  responsibleId: "all",
  productFamily: "all",
  grade: "all",
  industry: "all",
  status: "all",
  result: "all",
};

// Fixed "now": 2026-09-26 12:00 UTC (15:00 Moscow) — well inside the day.
const NOW = new Date("2026-09-26T12:00:00Z");

describe("samples period contract", () => {
  it("7days includes today and 6 days ago; excludes 7 days ago", () => {
    const f = filters("7days");
    expect(matchesPeriod(summaryWithDates(["2026-09-26"]), f, NOW)).toBe(true);
    expect(matchesPeriod(summaryWithDates(["2026-09-20"]), f, NOW)).toBe(true); // 6 days before 09-26
    expect(matchesPeriod(summaryWithDates(["2026-09-19"]), f, NOW)).toBe(false); // 7 days before — outside
  });

  it("14days includes today and 13 days ago; excludes 14 days ago", () => {
    const f = filters("14days");
    expect(matchesPeriod(summaryWithDates(["2026-09-26"]), f, NOW)).toBe(true);
    expect(matchesPeriod(summaryWithDates(["2026-09-13"]), f, NOW)).toBe(true); // 13 days before 09-26
    expect(matchesPeriod(summaryWithDates(["2026-09-12"]), f, NOW)).toBe(false); // 14 days before — outside
  });

  it("30days includes today and 29 days ago; excludes 30 days ago", () => {
    const f = filters("30days");
    expect(matchesPeriod(summaryWithDates(["2026-09-26"]), f, NOW)).toBe(true);
    expect(matchesPeriod(summaryWithDates(["2026-08-28"]), f, NOW)).toBe(true); // 29 days before 09-26
    expect(matchesPeriod(summaryWithDates(["2026-08-27"]), f, NOW)).toBe(false); // 30 days before — outside
  });

  it("window spans exact calendar day counts inclusive", () => {
    const checkDays = (preset: SamplesFilters["period"], expectedCount: number) => {
      const { from, to } = samplesPeriodWindow(filters(preset), NOW);
      expect(from).not.toBeNull();
      expect(to).not.toBeNull();
      const days = Math.round((to!.getTime() - from!.getTime()) / 86400000);
      expect(days).toBe(expectedCount);
    };

    checkDays("7days", 7);
    checkDays("14days", 14);
    checkDays("30days", 30);
    checkDays("90days", 90);
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

  it("obsolete presets (all, 365days, unknown) normalize safely to 30days", () => {
    expect(normalizeSamplesPeriodPreset("all")).toBe("30days");
    expect(normalizeSamplesPeriodPreset("365days")).toBe("30days");
    expect(normalizeSamplesPeriodPreset("unknown" as any)).toBe("30days");

    const fLegacy = filters("all" as any);
    const { from, to } = samplesPeriodWindow(fLegacy, NOW);
    expect(from).not.toBeNull();
    expect(to).not.toBeNull();
    const days = Math.round((to!.getTime() - from!.getTime()) / 86400000);
    expect(days).toBe(30);
  });

  it("leap day 2024-02-29 is a valid date and never rolls to Mar 1", () => {
    const f = filters("custom", { customFrom: "2024-02-01", customTo: "2024-03-31" });
    expect(matchesPeriod(summaryWithDates(["2024-02-29"]), f, NOW)).toBe(true);
    // Invalid dates must never match any window:
    expect(matchesPeriod(summaryWithDates(["2023-02-29"]), f, NOW)).toBe(false);
  });

  it("custom inclusive from/to includes both endpoints and swaps inverted boundaries", () => {
    const f = filters("custom", { customFrom: "2026-09-01", customTo: "2026-09-30" });
    expect(matchesPeriod(summaryWithDates(["2026-09-01"]), f, NOW)).toBe(true);
    expect(matchesPeriod(summaryWithDates(["2026-09-30"]), f, NOW)).toBe(true);
    expect(matchesPeriod(summaryWithDates(["2026-08-31"]), f, NOW)).toBe(false);
    expect(matchesPeriod(summaryWithDates(["2026-10-01"]), f, NOW)).toBe(false);

    // Inverted range customFrom > customTo swaps safely
    const fInverted = filters("custom", { customFrom: "2026-09-30", customTo: "2026-09-01" });
    expect(matchesPeriod(summaryWithDates(["2026-09-15"]), fInverted, NOW)).toBe(true);
  });

  it("custom with missing boundaries does NOT match any sent dates (truthful empty state)", () => {
    const fMissing = filters("custom", {});
    expect(matchesPeriod(summaryWithDates(["2026-09-15"]), fMissing, NOW)).toBe(false);
  });

  describe("Required Defect B Regression Matrix (B1 to B8: All-or-Nothing Custom Period)", () => {
    it("B1 both missing -> null/null -> no match", () => {
      const f = filters("custom", {});
      const { from, to } = samplesPeriodWindow(f, NOW);
      expect(from).toBeNull();
      expect(to).toBeNull();
      expect(matchesPeriod(summaryWithDates(["2026-09-15"]), f, NOW)).toBe(false);
    });

    it("B2 From only -> null/null -> no match", () => {
      const f = filters("custom", { customFrom: "2026-09-10" });
      const { from, to } = samplesPeriodWindow(f, NOW);
      expect(from).toBeNull();
      expect(to).toBeNull();
      expect(matchesPeriod(summaryWithDates(["2026-09-15"]), f, NOW)).toBe(false);
    });

    it("B3 To only -> null/null -> no match", () => {
      const f = filters("custom", { customTo: "2026-09-20" });
      const { from, to } = samplesPeriodWindow(f, NOW);
      expect(from).toBeNull();
      expect(to).toBeNull();
      expect(matchesPeriod(summaryWithDates(["2026-09-15"]), f, NOW)).toBe(false);
    });

    it("B4 impossible From (2026-02-31) -> null/null -> no match", () => {
      const f = filters("custom", { customFrom: "2026-02-31", customTo: "2026-03-20" });
      const { from, to } = samplesPeriodWindow(f, NOW);
      expect(from).toBeNull();
      expect(to).toBeNull();
      expect(matchesPeriod(summaryWithDates(["2026-03-15"]), f, NOW)).toBe(false);
    });

    it("B5 impossible To (2026-02-31) -> null/null -> no match", () => {
      const f = filters("custom", { customFrom: "2026-02-01", customTo: "2026-02-31" });
      const { from, to } = samplesPeriodWindow(f, NOW);
      expect(from).toBeNull();
      expect(to).toBeNull();
      expect(matchesPeriod(summaryWithDates(["2026-02-15"]), f, NOW)).toBe(false);
    });

    it("B6 valid reversed range swaps", () => {
      const f = filters("custom", { customFrom: "2026-09-20", customTo: "2026-09-10" });
      const { from, to } = samplesPeriodWindow(f, NOW);
      expect(from).not.toBeNull();
      expect(to).not.toBeNull();
      expect(from!.getTime()).toBeLessThan(to!.getTime());
      expect(matchesPeriod(summaryWithDates(["2026-09-15"]), f, NOW)).toBe(true);
    });

    it("B7 valid boundaries are inclusive", () => {
      const f = filters("custom", { customFrom: "2026-09-10", customTo: "2026-09-20" });
      expect(matchesPeriod(summaryWithDates(["2026-09-10"]), f, NOW)).toBe(true);
      expect(matchesPeriod(summaryWithDates(["2026-09-20"]), f, NOW)).toBe(true);
      expect(matchesPeriod(summaryWithDates(["2026-09-09"]), f, NOW)).toBe(false);
      expect(matchesPeriod(summaryWithDates(["2026-09-21"]), f, NOW)).toBe(false);
    });

    it("B8 one Company with multiple sentDates still counts once", () => {
      const f = filters("custom", { customFrom: "2026-09-10", customTo: "2026-09-20" });
      const multiSummary = summaryWithDates(["2026-09-10", "2026-09-15", "2026-09-20"]);
      expect(matchesPeriod(multiSummary, f, NOW)).toBe(true);
      const filtered = [multiSummary].filter((s) => matchesPeriod(s, f, NOW));
      expect(filtered.length).toBe(1);
    });
  });

  it("impossible datetime 2026-09-01T25:00:00 is invalid, not 01:00 next day", () => {
    const f = filters("custom", { customFrom: "2026-09-01", customTo: "2026-09-02" });
    expect(matchesPeriod(summaryWithDates(["2026-09-01T25:00:00"]), f, NOW)).toBe(false);
  });

  it("empty sentDates never matches a bounded period", () => {
    const f = filters("30days");
    expect(matchesPeriod(summaryWithDates([]), f, NOW)).toBe(false);
  });
});
