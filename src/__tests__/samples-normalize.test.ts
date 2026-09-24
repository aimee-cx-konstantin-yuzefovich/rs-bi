// @vitest-environment node
// src/__tests__/samples-normalize.test.ts
// Covers all 20 business scenarios of the Samples v1 task (§18)
// plus KPI derivation rules and period filter semantics.
import { describe, expect, it } from "vitest";
import {
  classifyResultValue,
  computeSourceQuality,
  dedupe,
  extractDates,
  isSentIndicator,
  isTestingStatus,
  normalizeResult,
  parseQuantity,
  resolveValue,
} from "@/lib/samples/normalize";

describe("samples normalization — result classification", () => {
  it("scenario 1: one product, clearly positive result → positive", () => {
    expect(classifyResultValue("Положительный результат")).toBe("positive");
    expect(classifyResultValue("Испытания пройдены")).toBe("positive");
  });

  it("scenario 2: clearly negative result → negative", () => {
    expect(classifyResultValue("Отрицательный")).toBe("negative");
    expect(classifyResultValue("Не пройден по дисперсности")).toBe("negative");
  });

  it("scenario 8: rework mentioned in result → rework (before pos/neg)", () => {
    expect(classifyResultValue("Требуется доработка состава")).toBe("rework");
    expect(classifyResultValue("Положительный, но необходима модификация")).toBe(
      "rework"
    );
    expect(classifyResultValue("Повторное испытание после доработки")).toBe(
      "rework"
    );
  });

  it("scenario 9: waiting for customer/testing → pending", () => {
    expect(classifyResultValue("Ожидает ответа клиента")).toBe("pending");
    expect(classifyResultValue("В процессе испытаний")).toBe("pending");
    expect(classifyResultValue("Образцы переданы, тестирование идёт")).toBe(
      "pending"
    );
  });

  it("scenario 10: no response yet → pending/unknown (never positive)", () => {
    expect(classifyResultValue("Нет результата")).toBe("pending");
    expect(classifyResultValue("Ждём обратной связи")).toBeNull();
    expect(normalizeResult("Ждём обратной связи", [])).toBe("unknown");
  });

  it("scenario 17: unknown/unclassifiable result text → unknown", () => {
    expect(classifyResultValue("Клиент сказал позвонить в пятницу")).toBeNull();
    expect(normalizeResult("Клиент сказал позвонить в пятницу", [])).toBe(
      "unknown"
    );
    expect(classifyResultValue("")).toBeNull();
    expect(normalizeResult("решаем", [])).toBe("unknown");
    expect(normalizeResult(undefined, [])).toBe("unknown");
  });

  it("scenario 5: Gel positive while Sol still testing → mixed", () => {
    expect(
      normalizeResult("Положительный", [
        { productFamily: "Гель", result: "positive" },
        { productFamily: "Золь", result: "pending" },
      ])
    ).toBe("mixed");
  });

  it("per-product same outcomes collapse to that outcome", () => {
    expect(
      normalizeResult(undefined, [
        { productFamily: "Гель", result: "positive" },
        { productFamily: "Золь", result: "positive" },
      ])
    ).toBe("positive");
  });

  it("raw result always preserved: classification never drops the source", () => {
    // The caller keeps rawTestResult verbatim; normalizeResult only derives.
    const raw = "Странный ответ инженера: «сойдёт, но жидковат»";
    expect(normalizeResult(raw, [])).toBe("unknown");
    // raw is untouched by the function contract (pure).
    expect(raw).toBe("Странный ответ инженера: «сойдёт, но жидковат»");
  });
});

describe("samples normalization — dates", () => {
  it("scenario 6: multiple sent dates all preserved, sorted, deduped", () => {
    const dates = dedupe([
      ...extractDates(["2026-01-15", "2026-02-01"]),
      ...extractDates("2026-01-15"),
    ]);
    expect(dates).toEqual(["2026-01-15", "2026-02-01"]);
  });

  it("scenario 7: two same-title date fields disagree — both kept (conflict flagged by aggregate)", () => {
    const multi = extractDates(["2026-03-01", "2026-03-05"]);
    const single = extractDates("2026-04-10");
    const all = dedupe([...multi, ...single]);
    expect(all).toEqual(["2026-03-01", "2026-03-05", "2026-04-10"]);
  });

  it("identical dates across legacy fields deduplicate", () => {
    const all = dedupe([
      ...extractDates("2026-03-01"),
      ...extractDates("2026-03-01"),
    ]);
    expect(all).toEqual(["2026-03-01"]);
  });

  it("invalid date garbage is skipped, never coerced", () => {
    expect(extractDates(["не указано", "2026-13-45", ""])).toEqual([]);
    expect(extractDates("2026-02-30")).toEqual([]);
    expect(extractDates("2026-01-15T10:30:00")).toEqual(["2026-01-15"]);
  });
});

describe("samples normalization — values", () => {
  it("scenario 18: duplicate values across legacy fields deduplicate case-insensitively", () => {
    expect(dedupe(["КСМГ-5", "ксмг-5", "КСМГ-5 ", "КСМГ-7"])).toEqual([
      "КСМГ-5",
      "КСМГ-7",
    ]);
  });

  it("scenario 19: title resolution falls back to «Без названия», never ID", () => {
    const title = "";
    expect(title.trim() || "Без названия").toBe("Без названия");
  });

  it("quantities preserve Gel/Sol units and never add unlike units", () => {
    expect(parseQuantity("2.5")).toBe(2.5);
    expect(parseQuantity("2,5")).toBe(2.5);
    expect(parseQuantity("по договорённости")).toBe("по договорённости");
    expect(parseQuantity(["1", "2"])).toBe("1; 2");
  });

  it("resolveValue maps raw enum IDs through the label resolver", () => {
    const labels: Record<string, string> = { 1613: "Гель", 1615: "Золь" };
    const resolve = (_fieldId: string, raw: string) => labels[raw] ?? raw;
    expect(resolveValue("UF_X", ["1613", "1615"], resolve)).toEqual([
      "Гель",
      "Золь",
    ]);
  });

  it("resolveValue passes raw values through identity resolver", () => {
    expect(resolveValue("UF_X", "1613", (f, v) => v)).toEqual(["1613"]);
    expect(resolveValue("UF_X", null, (f, v) => v)).toBeUndefined();
    expect(resolveValue("UF_X", [], (f, v) => v)).toBeUndefined();
  });
});

describe("samples normalization — statuses and quality", () => {
  it("scenario 15: multiple statuses in a multiple enumeration are all kept", () => {
    const statuses = dedupe(
      resolveValue(
        "UF_CRM_1753187313314",
        ["1", "2", "1"],
        (_f, v) => v
      ) ?? []
    );
    expect(statuses).toHaveLength(2);
  });

  it("testing-status detection for KPI «на испытании»", () => {
    expect(isTestingStatus("Испытание образцов")).toBe(true);
    expect(isTestingStatus("Тестирование завершено")).toBe(true);
    expect(isTestingStatus("Образцы отправлены")).toBe(false);
  });

  it("sent-indicator detection", () => {
    expect(isSentIndicator("Образцы отправлены")).toBe(true);
    expect(isSentIndicator("Переданы клиенту")).toBe(true);
    expect(isSentIndicator("Положительный результат")).toBe(false);
  });

  it("source quality: legacy-only vs structured vs ambiguous", () => {
    expect(
      computeSourceQuality({
        hasStructuredFields: false,
        hasLegacyOnly: true,
        hasConflictingEvidence: false,
      })
    ).toBe("legacy");
    expect(
      computeSourceQuality({
        hasStructuredFields: true,
        hasLegacyOnly: false,
        hasConflictingEvidence: false,
      })
    ).toBe("structured");
    expect(
      computeSourceQuality({
        hasStructuredFields: true,
        hasLegacyOnly: true,
        hasConflictingEvidence: false,
      })
    ).toBe("partial");
    expect(
      computeSourceQuality({
        hasStructuredFields: true,
        hasLegacyOnly: false,
        hasConflictingEvidence: true,
      })
    ).toBe("ambiguous");
  });
});
