// src/__tests__/table-sorting.test.ts
// ─────────────────────────────────────────────────────────────────────
// TBL-SORT-1 .. TBL-SORT-8: Shared table sorting utility (WP8).
// ─────────────────────────────────────────────────────────────────────

import { describe, it, expect } from "vitest";
import {
  compareAsc,
  compareByDirection,
  sortRows,
  compareStatus,
  nextSortDirection,
  ariaSortValue,
  isEmptySortValue,
} from "@/lib/table-sorting";

describe("Shared Table Sorting (TBL-SORT-1 .. TBL-SORT-8)", () => {
  it("TBL-SORT-1: ascending and descending text ordering", () => {
    expect(compareByDirection("Бета", "Альфа", "asc")).toBeGreaterThan(0);
    expect(compareByDirection("Бета", "Альфа", "desc")).toBeLessThan(0);
  });

  it("TBL-SORT-2: empty values ALWAYS last in both directions", () => {
    expect(compareByDirection("", "Альфа", "asc")).toBeGreaterThan(0);
    expect(compareByDirection("", "Альфа", "desc")).toBeGreaterThan(0);
    expect(compareByDirection("—", null, "asc")).toBe(0);
    expect(compareByDirection(undefined, "Зет", "desc")).toBeGreaterThan(0);
    expect(isEmptySortValue("–")).toBe(true);
    expect(isEmptySortValue("0")).toBe(false);
    expect(isEmptySortValue(0)).toBe(false);
  });

  it("TBL-SORT-3: numeric comparator", () => {
    expect(compareAsc(2, 10)).toBeLessThan(0);
    expect(compareByDirection(2, 10, "desc")).toBeGreaterThan(0);
    // Mixed numeric strings are compared as strings by core comparator —
    // callers pass typed numbers for numeric columns (documented contract).
    expect(compareAsc(3, 3)).toBe(0);
  });

  it("TBL-SORT-4: date comparator via pre-parsed epoch values", () => {
    const t1 = Date.parse("2026-01-01");
    const t2 = Date.parse("2026-03-01");
    expect(compareAsc(t1, t2)).toBeLessThan(0);
    expect(compareByDirection(t1, t2, "desc")).toBeGreaterThan(0);
  });

  it("TBL-SORT-5: sortRows sorts the full dataset and is non-mutating", () => {
    const rows = [{ v: "Бета" }, { v: "" }, { v: "Альфа" }];
    const sorted = sortRows(rows, (r) => r.v, "asc");
    expect(sorted.map((r) => r.v)).toEqual(["Альфа", "Бета", ""]);
    expect(rows.map((r) => r.v)).toEqual(["Бета", "", "Альфа"]);
    const desc = sortRows(rows, (r) => r.v, "desc");
    expect(desc.map((r) => r.v)).toEqual(["Бета", "Альфа", ""]);
    expect(sortRows(rows, (r) => r.v, null)).toEqual(rows);
  });

  it("TBL-SORT-6: status comparator follows canonical business order", () => {
    const known = ["Подготовка к отправке", "Образцы отправлены", "На испытании", "Подошли", "Не подошли"];
    // Realistic orderOf: known labels → their canonical index; unknown →
    // after all known labels (e.g. the unclassified rank).
    const order = (s: string) => {
      const idx = known.indexOf(s);
      return idx >= 0 ? idx : known.length;
    };
    expect(compareStatus("Подошли", "На испытании", order, "asc")).toBeGreaterThan(0);
    expect(compareStatus("Подошли", "На испытании", order, "desc")).toBeLessThan(0);
    // Unknown labels sort after known ones.
    expect(compareStatus("Неизвестно", "Подошли", order, "asc")).toBeGreaterThan(0);
    // Empties still last.
    expect(compareStatus("—", "Подошли", order, "desc")).toBeGreaterThan(0);
  });

  it("TBL-SORT-7: tri-state click progression", () => {
    expect(nextSortDirection(null)).toBe("asc");
    expect(nextSortDirection("asc")).toBe("desc");
    expect(nextSortDirection("desc")).toBe(null);
  });

  it("TBL-SORT-8: aria-sort mapping", () => {
    expect(ariaSortValue("asc", true)).toBe("ascending");
    expect(ariaSortValue("desc", true)).toBe("descending");
    expect(ariaSortValue(null, true)).toBeUndefined();
    expect(ariaSortValue("asc", false)).toBeUndefined();
  });
});
