// src/__tests__/strict-parsing.test.ts
// ─────────────────────────────────────────────────────────────────────
// Regression tests for strict numeric and calendar date parsing.
// ─────────────────────────────────────────────────────────────────────

import { describe, it, expect } from "vitest";
import { parseStrictNumber, normalizeDeals } from "../lib/commercial-funnel/normalize";
import { isValidCalendarDate, parseStrictDate } from "../lib/date-safety";
import { parseCellNativeValue, isExplicitDateField, normalizeCompanyReportFieldValue } from "../lib/export-utils";

describe("Strict Numeric Parsing", () => {
  it("TC-STRICT-NUM-01: parses valid numbers, strings with commas and spaces", () => {
    expect(parseStrictNumber(123)).toBe(123);
    expect(parseStrictNumber(123.45)).toBe(123.45);
    expect(parseStrictNumber("123")).toBe(123);
    expect(parseStrictNumber("123.45")).toBe(123.45);
    expect(parseStrictNumber("-42")).toBe(-42);
    expect(parseStrictNumber("  +50.5  ")).toBe(50.5);
    expect(parseStrictNumber("1 200,50")).toBe(1200.5);
    expect(parseStrictNumber("100\u00A0000,25")).toBe(100000.25);
  });

  it("TC-STRICT-NUM-02: rejects partial, junk, and multiple decimal point values", () => {
    expect(parseStrictNumber("12abc")).toBeUndefined();
    expect(parseStrictNumber("abc12")).toBeUndefined();
    expect(parseStrictNumber("12.34.56")).toBeUndefined();
    expect(parseStrictNumber("--5")).toBeUndefined();
    expect(parseStrictNumber("++5")).toBeUndefined();
    expect(parseStrictNumber("")).toBeUndefined();
    expect(parseStrictNumber("   ")).toBeUndefined();
    expect(parseStrictNumber(null)).toBeUndefined();
    expect(parseStrictNumber(undefined)).toBeUndefined();
    expect(parseStrictNumber(NaN)).toBeUndefined();
    expect(parseStrictNumber(Infinity)).toBeUndefined();
  });

  it("TC-STRICT-NUM-03: normalizeDeals rejects junk opportunity without crashing or parsing partial number", () => {
    const deals = normalizeDeals([
      {
        ID: "101",
        TITLE: "Deal with invalid opportunity",
        OPPORTUNITY: "1000junk",
        CURRENCY_ID: "RUB",
      },
      {
        ID: "102",
        TITLE: "Deal with valid opportunity",
        OPPORTUNITY: "2 500,50",
        CURRENCY_ID: "RUB",
      },
    ]);
    expect(deals[0].opportunity).toBeNull();
    expect(deals[0].opportunityQuality).toBe("INVALID");
    expect(deals[1].opportunity).toBe(2500.5);
    expect(deals[1].opportunityQuality).toBe("VALID");
  });

  it("TC-STRICT-NUM-04: distinguishes VALID zero, UNKNOWN missing, and INVALID malformed opportunities (UNKNOWN != INVALID != ZERO)", () => {
    const rawDeals = [
      { ID: "1", OPPORTUNITY: "0" },
      { ID: "2", OPPORTUNITY: 0 },
      { ID: "3", OPPORTUNITY: "" },
      { ID: "4", OPPORTUNITY: null },
      { ID: "5", OPPORTUNITY: "12abc" },
      { ID: "6", OPPORTUNITY: "RUB 100" },
      { ID: "7", OPPORTUNITY: "1 000 000" },
      { ID: "8", OPPORTUNITY: "1 200,50" },
      { ID: "9", OPPORTUNITY: "1.2.3" },
      { ID: "10", OPPORTUNITY: NaN },
      { ID: "11", OPPORTUNITY: Infinity },
    ];

    const deals = normalizeDeals(rawDeals);

    // Valid zero
    expect(deals[0].opportunity).toBe(0);
    expect(deals[0].opportunityQuality).toBe("VALID");
    expect(deals[1].opportunity).toBe(0);
    expect(deals[1].opportunityQuality).toBe("VALID");

    // Empty / missing -> UNKNOWN (null, never 0)
    expect(deals[2].opportunity).toBeNull();
    expect(deals[2].opportunityQuality).toBe("UNKNOWN");
    expect(deals[3].opportunity).toBeNull();
    expect(deals[3].opportunityQuality).toBe("UNKNOWN");

    // Malformed non-empty -> INVALID (null, never 0)
    expect(deals[4].opportunity).toBeNull();
    expect(deals[4].opportunityQuality).toBe("INVALID");
    expect(deals[5].opportunity).toBeNull();
    expect(deals[5].opportunityQuality).toBe("INVALID");

    // Formatted numbers -> VALID
    expect(deals[6].opportunity).toBe(1000000);
    expect(deals[6].opportunityQuality).toBe("VALID");
    expect(deals[7].opportunity).toBe(1200.5);
    expect(deals[7].opportunityQuality).toBe("VALID");

    // Multiple dots, NaN, Infinity -> INVALID
    expect(deals[8].opportunity).toBeNull();
    expect(deals[8].opportunityQuality).toBe("INVALID");
    expect(deals[9].opportunity).toBeNull();
    expect(deals[9].opportunityQuality).toBe("INVALID");
    expect(deals[10].opportunity).toBeNull();
    expect(deals[10].opportunityQuality).toBe("INVALID");
  });
});

describe("Strict Calendar Date Validation", () => {
  it("TC-CALENDAR-DATE-01: validates real calendar dates including leap years", () => {
    expect(isValidCalendarDate(2026, 2, 28)).toBe(true);
    expect(isValidCalendarDate(2024, 2, 29)).toBe(true); // Leap year 2024
    expect(isValidCalendarDate(2000, 2, 29)).toBe(true); // Leap year 2000
    expect(isValidCalendarDate(2025, 12, 31)).toBe(true);
    expect(isValidCalendarDate(2026, 4, 30)).toBe(true);
  });

  it("TC-CALENDAR-DATE-02: rejects impossible calendar dates and non-leap year Feb 29", () => {
    expect(isValidCalendarDate(2026, 2, 29)).toBe(false); // 2026 is not a leap year
    expect(isValidCalendarDate(1900, 2, 29)).toBe(false); // 1900 is not a leap year
    expect(isValidCalendarDate(2026, 2, 31)).toBe(false);
    expect(isValidCalendarDate(2026, 4, 31)).toBe(false); // April has 30 days
    expect(isValidCalendarDate(2026, 6, 31)).toBe(false); // June has 30 days
    expect(isValidCalendarDate(2026, 9, 31)).toBe(false); // Sept has 30 days
    expect(isValidCalendarDate(2026, 11, 31)).toBe(false); // Nov has 30 days
    expect(isValidCalendarDate(2026, 0, 15)).toBe(false); // Month 0
    expect(isValidCalendarDate(2026, 13, 1)).toBe(false); // Month 13
    expect(isValidCalendarDate(2026, 1, 0)).toBe(false); // Day 0
    expect(isValidCalendarDate(2026, 1, 32)).toBe(false); // Day 32
  });

  it("TC-CALENDAR-DATE-03: parseStrictDate returns valid UTC Date or null without rollover", () => {
    // Valid ISO Date
    const d1 = parseStrictDate("2026-03-01");
    expect(d1).not.toBeNull();
    expect(d1?.toISOString()).toBe("2026-03-01T00:00:00.000Z");

    // Valid RU Date
    const d2 = parseStrictDate("01.03.2026");
    expect(d2).not.toBeNull();
    expect(d2?.toISOString()).toBe("2026-03-01T00:00:00.000Z");

    // Impossible dates do not roll over to March
    expect(parseStrictDate("2026-02-31")).toBeNull();
    expect(parseStrictDate("31.02.2026")).toBeNull();
    expect(parseStrictDate("2026-02-29")).toBeNull();
    expect(parseStrictDate("29.02.2026")).toBeNull();
    expect(parseStrictDate("31.04.2026")).toBeNull();
    expect(parseStrictDate("2026-04-31T12:00:00Z")).toBeNull();
  });
});

describe("Excel Cell Parsing and Metadata-Aware Typing", () => {
  it("TC-XLSX-TEXT-DATE-01: non-date text fields with date-like values remain strings", () => {
    // When fieldId is a non-date field, e.g. TITLE or COMPANY_ID
    expect(isExplicitDateField("TITLE", "string")).toBe(false);
    expect(isExplicitDateField("ID", "integer")).toBe(false);
    expect(isExplicitDateField("COMMENTS", "text")).toBe(false);

    const val = parseCellNativeValue("2026-03-01", {
      fieldId: "TITLE",
      fieldType: "string",
    });
    // Must remain string, not Date
    expect(typeof val).toBe("string");
    expect(val).toBe("2026-03-01");
  });

  it("TC-XLSX-DATE-02: explicit date field parses as native Excel Date", () => {
    expect(isExplicitDateField("DATE_CREATE", "datetime")).toBe(true);
    const val = parseCellNativeValue("2026-03-01", {
      fieldId: "DATE_CREATE",
      fieldType: "datetime",
    });
    expect(val instanceof Date).toBe(true);
    expect((val as Date).toISOString()).toBe("2026-03-01T00:00:00.000Z");
  });

  it("TC-XLSX-DATE-03: impossible date in explicit date column does not roll over", () => {
    const val = parseCellNativeValue("2026-02-31", {
      fieldId: "DATE_CREATE",
      fieldType: "datetime",
    });
    // Does not produce a Date rolled over to March 3
    expect(val instanceof Date).toBe(false);
    expect(val).toBe("2026-02-31");
  });

  it("TC-XLSX-DATE-04: normalizeCompanyReportFieldValue rejects rollover for impossible dates", () => {
    const res = normalizeCompanyReportFieldValue({
      id: "DATE_CREATE",
      label: "Дата создания",
      value: "31.02.2026",
    });
    expect(res.value instanceof Date).toBe(false);
    expect(res.value).toBe("31.02.2026");

    const validRes = normalizeCompanyReportFieldValue({
      id: "DATE_CREATE",
      label: "Дата создания",
      value: "28.02.2026",
    });
    expect(validRes.value instanceof Date).toBe(true);
  });
});
