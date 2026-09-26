// src/__tests__/invariant-date-contract.test.ts
// ─────────────────────────────────────────────────────────────────────
// Invariant Test Suite: Strict Date and Datetime Lexical & Calendar Contracts
// Enforces single shared authority under src/lib without rollover or overflow.
// ─────────────────────────────────────────────────────────────────────

import { describe, it, expect } from "vitest";
import { parseStrictDate, isValidCalendarDate, isValidTime } from "@/lib/date-safety";
import {
  parseDateTimestamp,
  computePeriodBoundaries,
} from "@/lib/commercial-funnel/date-utils";

describe("Invariant Date & Datetime Contract (Finding A)", () => {
  describe("Strict Calendar and Clock Boundaries", () => {
    it("rejects clock hour overflow (25:00:00)", () => {
      expect(parseStrictDate("2026-09-01T25:00:00")).toBeNull();
      expect(parseDateTimestamp("2026-09-01T25:00:00")).toBeNull();
    });

    it("rejects clock minute overflow (12:99:00)", () => {
      expect(parseStrictDate("2026-09-01T12:99:00")).toBeNull();
      expect(parseDateTimestamp("2026-09-01T12:99:00")).toBeNull();
    });

    it("rejects clock second overflow (12:30:99)", () => {
      expect(parseStrictDate("2026-09-01T12:30:99")).toBeNull();
      expect(parseDateTimestamp("2026-09-01T12:30:99")).toBeNull();
    });

    it("rejects non-existent February 31 without rollover (2026-02-31)", () => {
      expect(parseStrictDate("2026-02-31")).toBeNull();
      expect(parseDateTimestamp("2026-02-31")).toBeNull();
    });

    it("rejects February 31 with explicit offset (2026-02-31T12:00:00+03:00)", () => {
      expect(parseStrictDate("2026-02-31T12:00:00+03:00")).toBeNull();
      expect(parseDateTimestamp("2026-02-31T12:00:00+03:00")).toBeNull();
    });

    it("rejects impossible month 13 (2026-13-01)", () => {
      expect(parseStrictDate("2026-13-01")).toBeNull();
      expect(parseDateTimestamp("2026-13-01")).toBeNull();
    });

    it("rejects compound overflow (2026-09-01T25:70:00)", () => {
      expect(parseStrictDate("2026-09-01T25:70:00")).toBeNull();
      expect(parseDateTimestamp("2026-09-01T25:70:00")).toBeNull();
    });
  });

  describe("Timezone Semantics", () => {
    it("interprets naive commercial datetime deterministically in Europe/Moscow (UTC+3)", () => {
      const parsed = parseStrictDate("2026-09-01T12:30:00", {
        mode: "DATETIME_BUSINESS_TIMEZONE",
      });
      expect(parsed).not.toBeNull();
      // 12:30 in Moscow (UTC+3) is 09:30 UTC
      expect(parsed!.toISOString()).toBe("2026-09-01T09:30:00.000Z");

      const ts = parseDateTimestamp("2026-09-01T12:30:00");
      expect(ts).toBe(parsed!.getTime());
    });

    it("preserves real instant for explicit offset (+03:00)", () => {
      const parsed = parseStrictDate("2026-09-01T12:30:00+03:00");
      expect(parsed).not.toBeNull();
      expect(parsed!.toISOString()).toBe("2026-09-01T09:30:00.000Z");

      const ts = parseDateTimestamp("2026-09-01T12:30:00+03:00");
      expect(ts).toBe(parsed!.getTime());
    });

    it("handles date-only format without rollover", () => {
      const parsed = parseStrictDate("2026-09-01", { mode: "DATE_ONLY" });
      expect(parsed).not.toBeNull();
      expect(parsed!.toISOString()).toBe("2026-09-01T00:00:00.000Z");
    });
  });

  describe("Custom Period Boundaries Validation", () => {
    const fixedNow = new Date("2026-09-15T12:00:00Z");

    it("rejects impossible custom boundary date (customFrom = 2026-02-31)", () => {
      expect(() =>
        computePeriodBoundaries(
          { periodPreset: "custom", customFrom: "2026-02-31", customTo: "2026-03-31" },
          fixedNow
        )
      ).toThrowError(/Invalid custom period boundaries/);
    });

    it("rejects impossible custom boundary date (customTo = 2026-04-31)", () => {
      expect(() =>
        computePeriodBoundaries(
          { periodPreset: "custom", customFrom: "2026-04-01", customTo: "2026-04-31" },
          fixedNow
        )
      ).toThrowError(/Invalid custom period boundaries/);
    });

    it("reorders inverted valid custom range chronologically without rollover", () => {
      const boundaries = computePeriodBoundaries(
        { periodPreset: "custom", customFrom: "2026-03-31", customTo: "2026-03-01" },
        fixedNow
      );

      expect(boundaries.currentStartStr).toBe("2026-03-01");
      expect(boundaries.currentEndStr).toBe("2026-03-31");
      expect(boundaries.currentStart.getTime()).toBeLessThan(boundaries.currentEnd.getTime());
    });

    it("spans full start and end days for valid range", () => {
      const boundaries = computePeriodBoundaries(
        { periodPreset: "custom", customFrom: "2026-03-01", customTo: "2026-03-10" },
        fixedNow
      );

      expect(boundaries.currentStartStr).toBe("2026-03-01");
      expect(boundaries.currentEndStr).toBe("2026-03-10");
    });
  });
});
