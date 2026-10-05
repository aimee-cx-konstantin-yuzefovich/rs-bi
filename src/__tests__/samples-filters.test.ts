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
import { UNCLASSIFIED_LABEL } from "@/lib/samples/constants";
import type { BitrixRow, SampleSummary } from "@/lib/samples/types";
import {
  COMPANY_APPLICATION_NEW_FIELD_ID,
  COMPANY_APPLICATION_OLD_FIELD_ID,
  COMPANY_DIRECTION_FIELD_ID,
  COMPANY_INDUSTRY_CURRENT_FIELD_ID,
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

    const { summaries } = buildSampleSummaries([rawCompany], [], []);
    expect(summaries.length).toBe(1);

    const s = summaries[0];
    const observedStatuses = [...s.sampleIndicators, ...s.processStatuses];

    // Canonical status seam (WP3): unknown historical raw values
    // («Переданы», «В работе») normalize truthfully to «Не классифицировано»
    // instead of leaking arbitrary legacy wordings into the UI.
    expect(observedStatuses).toContain(UNCLASSIFIED_LABEL);

    // Products, industries, applications must NOT be present in status indicators
    expect(observedStatuses).not.toContain("Гель");
    expect(observedStatuses).not.toContain("Золь");
    expect(observedStatuses).not.toContain("Химическая промышленность");
    expect(observedStatuses).not.toContain("Катализаторы");
    expect(observedStatuses).not.toContain("Переданы");
    expect(observedStatuses).not.toContain("В работе");

    // Status dropdown options built from summaries only include canonical
    // sample statuses — no raw historical variants, no unrelated enums.
    const statusOptions = Array.from(
      new Set(summaries.flatMap((row) => [...row.sampleIndicators, ...row.processStatuses]))
    ).filter((v) => !isSentinelValue(v));

    expect(statusOptions).toContain(UNCLASSIFIED_LABEL);
    expect(statusOptions).not.toContain("Переданы");
    expect(statusOptions).not.toContain("В работе");
    expect(statusOptions).not.toContain("Гель");
    expect(statusOptions).not.toContain("Химическая промышленность");
  });

  it("SMP-FLT-2: boolean false cannot become visible Samples status", () => {
    // 1. Bitrix returns boolean false or "false" string in sample status field
    const rawCompanyFalse: BitrixRow = {
      ID: "11",
      TITLE: "Компания Без Статуса",
      [COMPANY_SAMPLES_FIELD_ID]: false as any, // Raw boolean false from REST API
      [COMPANY_SAMPLES_GRADE_GEL_FIELD_ID]: "КСМГ",
    };
    const rawCompanyFalseStr: BitrixRow = {
      ID: "12",
      TITLE: "Компания Со Строкой False",
      [COMPANY_SAMPLES_FIELD_ID]: ["false", "В работе", false as any],
    };

    const { summaries } = buildSampleSummaries([rawCompanyFalse, rawCompanyFalseStr], [], []);
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

    const { summaries } = buildSampleSummaries([rawCompany], [], [], { labelResolver: resolver });
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

    const { summaries } = buildSampleSummaries([rawCompany], [], [], { labelResolver: resolver });
    expect(summaries.length).toBe(1);
    expect(summaries[0].grades).toEqual([
      { productFamily: "Гель", value: "КСМГ-5" },
      { productFamily: "Золь", value: "СКСГ-2" },
    ]);
  });

  it("SMP-FLT-6: Industry uses the current approved Company-card field («Отрасль (согл.список)»)", () => {
    // Current contract (Phase C §47): the Samples Industry projection uses
    // UF_CRM_1784195884554 «Отрасль (согл.список)». Legacy INDUSTRY and the
    // retired «Отрасль (не использовать)» never override it.
    const rawCompany: BitrixRow = {
      ID: "17",
      TITLE: "Компания Отрасль",
      [COMPANY_SAMPLES_FIELD_ID]: ["Переданы"],
      INDUSTRY: "CHEMISTRY", // legacy crm_status — must NOT be used
      [COMPANY_INDUSTRY_CURRENT_FIELD_ID]: "Химическая промышленность",
    };

    const { summaries } = buildSampleSummaries([rawCompany], [], []);
    expect(summaries.length).toBe(1);
    expect(summaries[0].industry).toBe("Химическая промышленность");
  });

  it("SMP-FLT-6b: legacy INDUSTRY never overrides the current approved field; absent current field is truthful", () => {
    // Old field present, current field absent → industry is undefined
    // (truthful absence), never a silent legacy fallback.
    const legacyOnly: BitrixRow = {
      ID: "18",
      TITLE: "Компания Легаси Отрасль",
      [COMPANY_SAMPLES_FIELD_ID]: ["Переданы"],
      INDUSTRY: "CHEMISTRY",
    };
    const { summaries: s1 } = buildSampleSummaries([legacyOnly], [], []);
    expect(s1.length).toBe(1);
    expect(s1[0].industry).toBeUndefined();

    // Both present with different values → current approved field wins.
    const both: BitrixRow = {
      ID: "19",
      TITLE: "Компания Обе Отрасли",
      [COMPANY_SAMPLES_FIELD_ID]: ["Переданы"],
      INDUSTRY: "Старая отрасль",
      [COMPANY_INDUSTRY_CURRENT_FIELD_ID]: "Новая отрасль",
    };
    const { summaries: s2 } = buildSampleSummaries([both], [], []);
    expect(s2.length).toBe(1);
    expect(s2[0].industry).toBe("Новая отрасль");
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

    const { summaries } = buildSampleSummaries([rawCompany], [], []);
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
      currentStatusSource: "NONE",
      currentStatusValues: [],
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

    const { summaries, orphanDeals } = buildSampleSummaries(companies, deals, []);

    expect(summaries.length).toBe(1);
    expect(summaries[0].companyId).toBe("100");
    // Only deal 901 attached
    expect(summaries[0].relatedDeals.length).toBe(1);
    expect(summaries[0].relatedDeals[0].id).toBe("901");

    // Orphan deal tracked
    expect(orphanDeals.length).toBe(1);
    expect(orphanDeals[0].ID).toBe("903");
  });

  it("SMP-FLT-11: Application enum numeric ID resolves to human-readable label via labelResolver", () => {
    const rawCompany: BitrixRow = {
      ID: "50",
      TITLE: "Компания Энзимы",
      [COMPANY_SAMPLES_FIELD_ID]: ["Переданы"],
      [COMPANY_APPLICATION_NEW_FIELD_ID]: "541", // Raw Bitrix enum ID
    };

    const resolver = (fieldId: string, val: string) => {
      if (fieldId === COMPANY_APPLICATION_NEW_FIELD_ID && val === "541") {
        return "Катализаторы гидроочистки";
      }
      return val;
    };

    const { summaries } = buildSampleSummaries([rawCompany], [], [], { labelResolver: resolver });
    expect(summaries.length).toBe(1);
    expect(summaries[0].application).toBe("Катализаторы гидроочистки");
    expect(summaries[0].application).not.toBe("541");
    expect(summaries[0].application).not.toContain("UF_CRM");
  });

  it("SMP-FLT-12: Region/geography cannot masquerade as Application merely because it is an enumeration", () => {
    // 1. If the current application field returns a geographic region, it is stripped
    const rawCompanyGeo: BitrixRow = {
      ID: "51",
      TITLE: "Компания Регион",
      [COMPANY_SAMPLES_FIELD_ID]: ["Переданы"],
      [COMPANY_APPLICATION_NEW_FIELD_ID]: "999", // Points to a region in a misconfigured field
    };

    const resolver = (fieldId: string, val: string) => {
      if (fieldId === COMPANY_APPLICATION_NEW_FIELD_ID && val === "999") {
        return "Центральный федеральный округ";
      }
      if (fieldId === COMPANY_APPLICATION_OLD_FIELD_ID && val === "888") {
        return "Свердловская область";
      }
      if (fieldId === COMPANY_DIRECTION_FIELD_ID && val === "777") {
        return "Приволжский федеральный округ";
      }
      return val;
    };

    const { summaries: s1 } = buildSampleSummaries([rawCompanyGeo], [], [], { labelResolver: resolver });
    expect(s1.length).toBe(1);
    expect(s1[0].application).toBeUndefined();

    // 2. Legacy application field returning a geographic region must also be stripped
    const rawLegacyGeo: BitrixRow = {
      ID: "52",
      TITLE: "Компания Легаси Регион",
      [COMPANY_SAMPLES_FIELD_ID]: ["Переданы"],
      [COMPANY_APPLICATION_OLD_FIELD_ID]: "888",
    };
    const { summaries: s2 } = buildSampleSummaries([rawLegacyGeo], [], [], { labelResolver: resolver });
    expect(s2.length).toBe(1);
    expect(s2[0].application).toBeUndefined();

    // 3. Direction field returning a geographic region must also not become an application
    const rawDirectionGeo: BitrixRow = {
      ID: "53",
      TITLE: "Компания Направление Регион",
      [COMPANY_SAMPLES_FIELD_ID]: ["Переданы"],
      [COMPANY_DIRECTION_FIELD_ID]: ["777"],
    };
    const { summaries: s3 } = buildSampleSummaries([rawDirectionGeo], [], [], { labelResolver: resolver });
    expect(s3.length).toBe(1);
    expect(s3[0].application).toBeUndefined();
  });

  it("SMP-FLT-13: isGeographicValue acts strictly as defensive cleanup and preserves valid business applications", () => {
    // Proven industrial applications must NEVER be falsely identified as geographic
    const validApplications = [
      "Катализаторы",
      "Катализаторы гидроочистки",
      "Осушка газов",
      "Шинная промышленность",
      "Керамика",
      "Строительство",
      "Лакокрасочные материалы",
      "Буровые растворы",
      "Бытовая химия",
      "Производство резины",
      "Пищевая промышленность",
    ];

    for (const app of validApplications) {
      expect(isGeographicValue(app)).toBe(false);
    }

    // Obvious geographic strings must be caught
    const geoStrings = [
      "Москва",
      "Санкт-Петербург",
      "Приволжский федеральный округ",
      "ЦФО",
      "Свердловская область",
      "Краснодарский край",
      "Республика Татарстан",
    ];

    for (const geo of geoStrings) {
      expect(isGeographicValue(geo)).toBe(true);
    }
  });

  it("SMP-FLT-14: Live verifier semantic title comparison rejects mismatched titles and validates status dictionaries", async () => {
    const { normalizeTitle, evaluateFieldSpec } = await import(
      "../../scripts/verify-samples-field-map.mjs"
    );

    expect(normalizeTitle("  Область   Применения  ")).toBe("область применения");
    expect(normalizeTitle("Марка и объём")).toBe("марка и объем");

    const appSpec = {
      role: "Область применения",
      entity: "Company",
      configuredId: "UF_CRM_69257337B8025",
      expectedTypes: ["enumeration", "string"],
      acceptedTitles: ["Область применения"],
    };

    // Case 1: Live CRM has title "Регион" (mismatched semantics)
    const liveRegionField = {
      title: "Регион",
      type: "enumeration",
      isMultiple: false,
    };
    const resultRegion = evaluateFieldSpec(appSpec, liveRegionField, []);
    expect(resultRegion.SEMANTIC_STATUS).toBe("FAIL");
    expect(resultRegion.TECHNICAL_STATUS).toBe("PASS");
    expect(resultRegion.FINAL_STATUS).toBe("FAIL");

    // Case 2: Live CRM has title "Область применения" (matching semantics)
    const liveAppField = {
      title: "Область применения",
      type: "enumeration",
      isMultiple: false,
    };
    const resultApp = evaluateFieldSpec(appSpec, liveAppField, []);
    expect(resultApp.SEMANTIC_STATUS).toBe("PASS");
    expect(resultApp.TECHNICAL_STATUS).toBe("PASS");
    expect(resultApp.FINAL_STATUS).toBe("PASS");

    // Case 3: Status field (INDUSTRY) with and without dictionary in statusList
    const industrySpec = {
      role: "INDUSTRY",
      entity: "Company",
      configuredId: "INDUSTRY",
      expectedTypes: ["crm_status"],
      acceptedTitles: ["Сфера деятельности", "Отрасль"],
    };
    const liveIndustry = {
      title: "Сфера деятельности",
      type: "crm_status",
      statusType: "CRM_INDUSTRY",
    };

    // Missing dictionary in statusList
    const resultNoDict = evaluateFieldSpec(industrySpec, liveIndustry, []);
    expect(resultNoDict.SEMANTIC_STATUS).toBe("PASS");
    expect(resultNoDict.TECHNICAL_STATUS).toBe("FAIL");
    expect(resultNoDict.FINAL_STATUS).toBe("FAIL");

    // Valid dictionary present
    const validStatusList = [
      { ENTITY_ID: "CRM_INDUSTRY", STATUS_ID: "CHEM", NAME: "Химия" },
    ];
    const resultWithDict = evaluateFieldSpec(industrySpec, liveIndustry, validStatusList);
    expect(resultWithDict.SEMANTIC_STATUS).toBe("PASS");
    expect(resultWithDict.TECHNICAL_STATUS).toBe("PASS");
    expect(resultWithDict.FINAL_STATUS).toBe("PASS");
  });

  it("SMP-PHASE-A-FLT: application and hasDeals are removed from filter contract while data is intact", () => {
    // 1. Verify DEFAULT_SAMPLES_FILTERS contract
    expect((DEFAULT_SAMPLES_FILTERS as any).application).toBeUndefined();
    expect((DEFAULT_SAMPLES_FILTERS as any).hasDeals).toBeUndefined();

    // 2. Verify SampleSummary data retains relatedDeals and application
    const rawCompany: BitrixRow = {
      ID: "50",
      TITLE: "Инновации Плюс",
      [COMPANY_SAMPLES_FIELD_ID]: ["Переданы"],
      [COMPANY_APPLICATION_NEW_FIELD_ID]: "Катализаторы",
      // Current approved industry field (Phase C §47) — the projection source.
      [COMPANY_INDUSTRY_CURRENT_FIELD_ID]: "Химия",
    };
    const rawDeal: BitrixRow = {
      ID: "101",
      COMPANY_ID: "50",
      TITLE: "Сделка по катализаторам",
      [DEAL_SAMPLE_TRANSFER_FIELD_ID]: "Y",
    };

    const { summaries } = buildSampleSummaries([rawCompany], [rawDeal], []);
    expect(summaries.length).toBe(1);
    const summary = summaries[0];

    // relatedDeals data MUST remain intact
    expect(summary.relatedDeals.length).toBe(1);
    expect(summary.relatedDeals[0].id).toBe("101");

    // Legacy application data MUST remain intact on SampleSummary
    expect(summary.application).toBe("Катализаторы");

    // Industry data MUST remain intact (from the current approved field)
    expect(summary.industry).toBe("Химия");
  });
});
