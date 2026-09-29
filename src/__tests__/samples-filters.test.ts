// src/__tests__/samples-filters.test.ts
// ─────────────────────────────────────────────────────────────────────
// SMP-FLT-1 to SMP-FLT-10: Samples filters, sentinels & normalization suite.
// ─────────────────────────────────────────────────────────────────────

import { describe, it, expect } from "vitest";
import {
  isSentinelValue,
  resolveValue,
  dedupe,
  extractDates,
  parseQuantity,
  isGeographicValue,
  normalizeResult,
  classifyResultValue,
} from "@/lib/samples/normalize";
import { buildSampleSummaries } from "@/lib/samples/aggregate";
import {
  matchesPeriod,
  type SamplesFilters,
  DEFAULT_SAMPLES_FILTERS,
} from "@/components/dashboard/samples/samples-filters";
import { resolveResponsibleDisplay } from "@/lib/enrichment-coverage";
import type { BitrixRow, SampleSummary } from "@/lib/samples/types";
import {
  COMPANY_APPLICATION_NEW_FIELD_ID,
  COMPANY_APPLICATION_OLD_FIELD_ID,
  COMPANY_DIRECTION_FIELD_ID,
  COMPANY_PRODUCT_TYPE_FIELD_ID,
  COMPANY_SAMPLES_FIELD_ID,
  COMPANY_SAMPLES_GRADE_GEL_FIELD_ID,
  COMPANY_SAMPLES_GRADE_SOL_FIELD_ID,
  DEAL_SAMPLE_TRANSFER_FIELD_ID,
} from "@/lib/crm-constants";

describe("Samples Filters & Normalization (SMP-FLT-1 .. SMP-FLT-10)", () => {
  it("SMP-FLT-1: unrelated CRM enum labels cannot enter Status dropdown", () => {
    // Simulated raw company row with product type, industry, and application
    const rawCompany: BitrixRow = {
      ID: "10",
      TITLE: "Тест Статусов",
      [COMPANY_SAMPLES_FIELD_ID]: ["Переданы", "В работе"],
      [COMPANY_PRODUCT_TYPE_FIELD_ID]: ["Гель", "Золь"], // Products MUST NOT leak into status
      INDUSTRY: "Химическая промышленность", // Industry MUST NOT leak into status
      [COMPANY_APPLICATION_NEW_FIELD_ID]: "Катализаторы", // Application MUST NOT leak into status
    };

    const { summaries } = buildSampleSummaries([rawCompany], []);
    expect(summaries.length).toBe(1);

    const s = summaries[0];
    const observedStatuses = [...s.sampleIndicators, ...s.processStatuses];

    // Statuses contain only sample status indicators
    expect(observedStatuses).toContain("Переданы");
    expect(observedStatuses).toContain("В работе");

    // Products, industries, applications must NOT be present in status indicators
    expect(observedStatuses).not.toContain("Гель");
    expect(observedStatuses).not.toContain("Золь");
    expect(observedStatuses).not.toContain("Химическая промышленность");
    expect(observedStatuses).not.toContain("Катализаторы");

    // Furthermore, status dropdown options built from summaries only include sample statuses
    const statusOptions = Array.from(
      new Set(summaries.flatMap((row) => [...row.sampleIndicators, ...row.processStatuses]))
    ).filter((v) => !isSentinelValue(v));

    expect(statusOptions).toContain("Переданы");
    expect(statusOptions).toContain("В работе");
    expect(statusOptions).not.toContain("Гель");
    expect(statusOptions).not.toContain("Химическая промышленность");
  });

  it("SMP-FLT-2: boolean false cannot become visible Samples status", () => {
    // 1. Bitrix returns boolean false or "false" string in sample status field
    const rawCompanyFalse: BitrixRow = {
      ID: "11",
      TITLE: "Компания Без Статуса",
      [COMPANY_SAMPLES_FIELD_ID]: false as any, // Raw boolean false from REST API
    };
    const rawCompanyFalseStr: BitrixRow = {
      ID: "12",
      TITLE: "Компания Со Строкой False",
      [COMPANY_SAMPLES_FIELD_ID]: ["false", "В работе", false as any],
    };

    const { summaries } = buildSampleSummaries([rawCompanyFalse, rawCompanyFalseStr], []);
    expect(summaries.length).toBe(2);

    for (const s of summaries) {
      for (const st of [...s.sampleIndicators, ...s.processStatuses]) {
        expect(st.toLowerCase()).not.toBe("false");
        expect(st.toLowerCase()).not.toBe("true");
        expect(st.toLowerCase()).not.toBe("null");
        expect(st.toLowerCase()).not.toBe("undefined");
      }
    }

    // Direct sentinel check
    expect(isSentinelValue(false)).toBe(true);
    expect(isSentinelValue("false")).toBe(true);
    expect(isSentinelValue("FALSE")).toBe(true);
    expect(isSentinelValue("true")).toBe(true);
    expect(isSentinelValue("null")).toBe(true);
    expect(isSentinelValue("undefined")).toBe(true);
  });

  it("SMP-FLT-3: known employee ID resolves to name", () => {
    const userNames = { "10": "Алексей Смирнов" };
    const coverageComplete = { status: "COMPLETE" as const, fetched: 1, total: 1 };
    const coveragePartial = { status: "PARTIAL" as const, fetched: 0, total: 1, warning: "Неполный справочник" };

    // Known ID resolves to real employee name
    expect(resolveResponsibleDisplay("10", userNames, coverageComplete)).toBe("Алексей Смирнов");

    // Unknown ID + COMPLETE directory resolves to "Сотрудник не найден"
    expect(resolveResponsibleDisplay("99", userNames, coverageComplete)).toBe("Сотрудник не найден");

    // Unknown ID + PARTIAL directory resolves to "Неизвестный сотрудник (справочник неполный)"
    expect(resolveResponsibleDisplay("99", userNames, coveragePartial)).toBe(
      "Неизвестный сотрудник (справочник неполный)"
    );
  });

  it("SMP-FLT-4: Product option comes from product field", () => {
    const rawCompany: BitrixRow = {
      ID: "15",
      TITLE: "Компания Продукты",
      [COMPANY_SAMPLES_FIELD_ID]: ["Переданы"],
      [COMPANY_PRODUCT_TYPE_FIELD_ID]: ["101", "102"], // Enum IDs
    };

    const resolver = (fieldId: string, val: string) => {
      if (fieldId === COMPANY_PRODUCT_TYPE_FIELD_ID) {
        if (val === "101") return "Гель";
        if (val === "102") return "Золь";
      }
      return val;
    };

    const { summaries } = buildSampleSummaries([rawCompany], [], { labelResolver: resolver });
    expect(summaries.length).toBe(1);
    expect(summaries[0].productFamilies).toEqual(["Гель", "Золь"]);
  });

  it("SMP-FLT-5: Grade comes from grade fields", () => {
    const rawCompany: BitrixRow = {
      ID: "16",
      TITLE: "Компания Марки",
      [COMPANY_SAMPLES_FIELD_ID]: ["Переданы"],
      [COMPANY_SAMPLES_GRADE_GEL_FIELD_ID]: ["201", false as any],
      [COMPANY_SAMPLES_GRADE_SOL_FIELD_ID]: "301",
    };

    const resolver = (fieldId: string, val: string) => {
      if (fieldId === COMPANY_SAMPLES_GRADE_GEL_FIELD_ID && val === "201") return "КСМГ-5";
      if (fieldId === COMPANY_SAMPLES_GRADE_SOL_FIELD_ID && val === "301") return "СКСГ-2";
      return val;
    };

    const { summaries } = buildSampleSummaries([rawCompany], [], { labelResolver: resolver });
    expect(summaries.length).toBe(1);
    expect(summaries[0].grades).toEqual([
      { productFamily: "Гель", value: "КСМГ-5" },
      { productFamily: "Золь", value: "СКСГ-2" },
    ]);
  });

  it("SMP-FLT-6: Industry resolves to human label", () => {
    const rawCompany: BitrixRow = {
      ID: "17",
      TITLE: "Компания Отрасль",
      [COMPANY_SAMPLES_FIELD_ID]: ["Переданы"],
      INDUSTRY: "CHEMISTRY", // Raw CRM status code
    };

    const resolver = (fieldId: string, val: string) => {
      if (fieldId === "INDUSTRY" && val === "CHEMISTRY") return "Химическая промышленность";
      return val;
    };

    const { summaries } = buildSampleSummaries([rawCompany], [], { labelResolver: resolver });
    expect(summaries.length).toBe(1);
    expect(summaries[0].industry).toBe("Химическая промышленность");
  });

  it("SMP-FLT-7: Application uses correct semantic field", () => {
    expect(isGeographicValue("Москва")).toBe(true);
    expect(isGeographicValue("Санкт-Петербург")).toBe(true);
    expect(isGeographicValue("Приволжский федеральный округ")).toBe(true);
    expect(isGeographicValue("ЦФО")).toBe(true);
    expect(isGeographicValue("ПФО")).toBe(true);
    expect(isGeographicValue("Свердловская область")).toBe(true);
    expect(isGeographicValue("Краснодарский край")).toBe(true);
    expect(isGeographicValue("Россия")).toBe(true);

    expect(isGeographicValue("Катализаторы")).toBe(false);
    expect(isGeographicValue("Осушка газов")).toBe(false);
    expect(isGeographicValue("Шинная промышленность")).toBe(false);

    // Simulated company with geographic direction and valid industrial application
    const rawCompany: BitrixRow = {
      ID: "20",
      TITLE: "Компания Гео",
      [COMPANY_SAMPLES_FIELD_ID]: ["Переданы"],
      [COMPANY_DIRECTION_FIELD_ID]: ["Приволжский ФО", "Катализаторы гидроочистки"],
    };

    const { summaries } = buildSampleSummaries([rawCompany], []);
    expect(summaries[0].application).toBe("Катализаторы гидроочистки");
    expect(summaries[0].application).not.toContain("Приволжский");
  });

  it("SMP-FLT-8: Period uses Samples dates", () => {
    const sample: SampleSummary = {
      companyId: "30",
      companyTitle: "Компания Даты",
      productFamilies: [],
      grades: [],
      quantities: [],
      sentDates: ["2026-03-10"],
      sampleIndicators: [],
      processStatuses: [],
      normalizedResult: "unknown",
      relatedDeals: [],
      sourceQuality: "structured",
      dataIssues: [],
    };

    const fixedNow = new Date("2026-03-15T12:00:00Z");

    const filters30d: SamplesFilters = {
      ...DEFAULT_SAMPLES_FILTERS,
      period: "30days",
    };
    expect(matchesPeriod(sample, filters30d, fixedNow)).toBe(true);

    // Date outside window (e.g. 2025-01-01)
    const oldSample: SampleSummary = {
      ...sample,
      sentDates: ["2025-01-01"],
    };
    expect(matchesPeriod(oldSample, filters30d, fixedNow)).toBe(false);

    // Custom date range
    const customMatch: SamplesFilters = {
      ...DEFAULT_SAMPLES_FILTERS,
      period: "custom",
      customFrom: "2026-03-01",
      customTo: "2026-03-12",
    };
    expect(matchesPeriod(sample, customMatch, fixedNow)).toBe(true);

    const customMismatch: SamplesFilters = {
      ...DEFAULT_SAMPLES_FILTERS,
      period: "custom",
      customFrom: "2026-03-12",
      customTo: "2026-03-20",
    };
    expect(matchesPeriod(sample, customMismatch, fixedNow)).toBe(false);
  });

  it("SMP-FLT-9: Result normalization behaves correctly", () => {
    // Keywords mapping
    expect(classifyResultValue("Тест успешно пройден")).toBe("positive");
    expect(classifyResultValue("Образцы не подошли")).toBe("negative");
    expect(classifyResultValue("не подош")).toBe("negative");
    expect(classifyResultValue("Требуется доработка")).toBe("rework");
    expect(classifyResultValue("Находится на испытаниях в лаборатории")).toBe("pending");
    expect(classifyResultValue("испытан")).toBe("pending");

    // normalizeResult: single text
    expect(normalizeResult("Положительный результат", [])).toBe("positive");
    expect(normalizeResult("Отрицательный", [])).toBe("negative");
    expect(normalizeResult("Необходима модификация", [])).toBe("rework");
    expect(normalizeResult(undefined, [])).toBe("unknown");

    // normalizeResult: per-product mixed evidence
    expect(
      normalizeResult("Положительный", [
        { productFamily: "Гель", result: "positive" },
        { productFamily: "Золь", result: "negative" },
      ])
    ).toBe("mixed");

    // normalizeResult: unanimous per-product evidence
    expect(
      normalizeResult(undefined, [
        { productFamily: "Гель", result: "positive" },
        { productFamily: "Золь", result: "positive" },
      ])
    ).toBe("positive");
  });

  it("SMP-FLT-10: Related-deal semantics are preserved", () => {
    const companies: BitrixRow[] = [
      {
        ID: "100",
        TITLE: "Компания 100",
        [COMPANY_SAMPLES_FIELD_ID]: ["Переданы"],
      },
    ];

    const deals: BitrixRow[] = [
      {
        ID: "901",
        TITLE: "Сделка 901",
        COMPANY_ID: "100",
        [DEAL_SAMPLE_TRANSFER_FIELD_ID]: "Да",
      },
      {
        ID: "902",
        TITLE: "Сделка 902 (другая компания)",
        COMPANY_ID: "200",
        [DEAL_SAMPLE_TRANSFER_FIELD_ID]: "Да",
      },
      {
        ID: "903",
        TITLE: "Сделка 903 (сирота)",
        COMPANY_ID: null,
        [DEAL_SAMPLE_TRANSFER_FIELD_ID]: "Да",
      },
    ];

    const { summaries, orphanDeals } = buildSampleSummaries(companies, deals);

    expect(summaries.length).toBe(1);
    expect(summaries[0].companyId).toBe("100");
    // Only deal 901 attached
    expect(summaries[0].relatedDeals.length).toBe(1);
    expect(summaries[0].relatedDeals[0].id).toBe("901");

    // Orphan deal tracked
    expect(orphanDeals.length).toBe(1);
    expect(orphanDeals[0].ID).toBe("903");
  });
});
