import { describe, it, expect } from "vitest";
import {
  isValidCalendarDate,
  isValidTime,
  parseStrictDate,
  parseStrictNumber,
} from "@/lib/scalar-safety";
import { computePeriodBoundaries } from "@/lib/commercial-funnel/date-utils";

describe("Fix E & Fix F: Canonical Date & Scalar Safety Authorities", () => {
  describe("Calendar date and time rejection rules (No Rollover)", () => {
    it("rejects day overflow in February (2026-02-31)", () => {
      expect(isValidCalendarDate(2026, 2, 31)).toBe(false);
      expect(parseStrictDate("2026-02-31")).toBeNull();
    });

    it("rejects day overflow in 30-day month (2026-04-31)", () => {
      expect(isValidCalendarDate(2026, 4, 31)).toBe(false);
      expect(parseStrictDate("2026-04-31")).toBeNull();
    });

    it("rejects non-leap February 29 (2026-02-29)", () => {
      expect(isValidCalendarDate(2026, 2, 29)).toBe(false);
      expect(parseStrictDate("2026-02-29")).toBeNull();
    });

    it("accepts leap February 29 (2024-02-29)", () => {
      expect(isValidCalendarDate(2024, 2, 29)).toBe(true);
      expect(parseStrictDate("2024-02-29")).toBeInstanceOf(Date);
    });

    it("rejects hour overflow (2026-09-01T25:00:00)", () => {
      expect(isValidTime(25, 0, 0)).toBe(false);
      expect(parseStrictDate("2026-09-01T25:00:00")).toBeNull();
    });

    it("rejects minute overflow (2026-09-01 12:99:00)", () => {
      expect(isValidTime(12, 99, 0)).toBe(false);
      expect(parseStrictDate("2026-09-01 12:99:00")).toBeNull();
    });

    it("rejects second overflow (2026-09-01T12:30:99)", () => {
      expect(isValidTime(12, 30, 99)).toBe(false);
      expect(parseStrictDate("2026-09-01T12:30:99")).toBeNull();
    });
  });

  describe("Deterministic Datetime Normalization (Europe/Moscow Business Timezone)", () => {
    it("parses pure ISO date to 00:00:00 UTC", () => {
      const d = parseStrictDate("2026-09-01");
      expect(d?.toISOString()).toBe("2026-09-01T00:00:00.000Z");
    });

    it("parses explicit UTC instant (2026-09-01T12:30:00Z)", () => {
      const d = parseStrictDate("2026-09-01T12:30:00Z");
      expect(d?.toISOString()).toBe("2026-09-01T12:30:00.000Z");
    });

    it("parses explicit +03:00 offset (2026-09-01T12:30:00+03:00) to 09:30:00 UTC", () => {
      const d = parseStrictDate("2026-09-01T12:30:00+03:00");
      expect(d?.toISOString()).toBe("2026-09-01T09:30:00.000Z");
    });

    it("parses explicit +0300 offset without colon (2026-09-01T12:30:00+0300)", () => {
      const d = parseStrictDate("2026-09-01T12:30:00+0300");
      expect(d?.toISOString()).toBe("2026-09-01T09:30:00.000Z");
    });

    it("parses naive ISO datetime as deterministic UTC by default (2026-09-01T12:30:00 -> 12:30:00 UTC)", () => {
      const d = parseStrictDate("2026-09-01T12:30:00");
      expect(d?.toISOString()).toBe("2026-09-01T12:30:00.000Z");
    });

    it("parses naive ISO datetime in Europe/Moscow timezone when specified (2026-09-01T12:30:00 -> 09:30:00 UTC)", () => {
      const d = parseStrictDate("2026-09-01T12:30:00", "DATETIME_BUSINESS_TIMEZONE");
      expect(d?.toISOString()).toBe("2026-09-01T09:30:00.000Z");
    });

    it("parses naive space-separated datetime in Europe/Moscow timezone when specified (2026-09-01 12:30:00 -> 09:30:00 UTC)", () => {
      const d = parseStrictDate("2026-09-01 12:30:00", "DATETIME_BUSINESS_TIMEZONE");
      expect(d?.toISOString()).toBe("2026-09-01T09:30:00.000Z");
    });
  });

  describe("Custom period boundary calendar validation", () => {
    it("fails closed on impossible customFrom calendar date (2026-02-31)", () => {
      expect(() => {
        computePeriodBoundaries({
          periodPreset: "custom",
          customFrom: "2026-02-31",
          customTo: "2026-03-10",
        });
      }).toThrow(/contains an impossible calendar date/);
    });

    it("fails closed on impossible customTo calendar date (2026-04-31)", () => {
      expect(() => {
        computePeriodBoundaries({
          periodPreset: "custom",
          customFrom: "2026-04-01",
          customTo: "2026-04-31",
        });
      }).toThrow(/contains an impossible calendar date/);
    });
  });

  describe("Strict Numeric Normalization (parseStrictNumber)", () => {
    it("rejects string with non-numeric trailing text ('12abc')", () => {
      expect(parseStrictNumber("12abc")).toBeUndefined();
    });

    it("parses space-separated thousands with comma ('1 000,50' -> 1000.5)", () => {
      expect(parseStrictNumber("1 000,50")).toBe(1000.5);
    });

    it("rejects currency text prefix ('RUB 100')", () => {
      expect(parseStrictNumber("RUB 100")).toBeUndefined();
    });

    it("rejects currency text suffix ('100 RUB')", () => {
      expect(parseStrictNumber("100 RUB")).toBeUndefined();
    });

    it("preserves valid 0 as number 0 (not undefined or falsy null)", () => {
      expect(parseStrictNumber(0)).toBe(0);
      expect(parseStrictNumber("0")).toBe(0);
      expect(parseStrictNumber("0.00")).toBe(0);
    });

    it("rejects empty strings, null, and undefined", () => {
      expect(parseStrictNumber("")).toBeUndefined();
      expect(parseStrictNumber("   ")).toBeUndefined();
      expect(parseStrictNumber("—")).toBeUndefined();
      expect(parseStrictNumber(null)).toBeUndefined();
      expect(parseStrictNumber(undefined)).toBeUndefined();
      expect(parseStrictNumber(NaN)).toBeUndefined();
      expect(parseStrictNumber(Infinity)).toBeUndefined();
    });
  });
});
