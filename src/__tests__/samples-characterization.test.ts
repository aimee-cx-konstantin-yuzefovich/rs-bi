// @vitest-environment node
// src/__tests__/samples-characterization.test.ts
// Characterization suite for Samples domain across 15 core scenarios.
// Defines backward compatibility contract and documents the intentional
// Deal testing-marker isolation correctness fix.

import { describe, expect, it } from "vitest";
import {
  buildSampleSummaries,
  computeSampleKpis,
} from "@/lib/samples/aggregate";
import type { BitrixRow } from "@/lib/samples/types";
import {
  COMPANY_SAMPLES_DATE_MULTI_FIELD_ID,
  COMPANY_SAMPLES_DATE_SINGLE_FIELD_ID,
  COMPANY_SAMPLES_FIELD_ID,
  COMPANY_SAMPLES_GRADE_GEL_FIELD_ID,
  COMPANY_SAMPLES_GRADE_SOL_FIELD_ID,
  COMPANY_SAMPLES_QTY_GEL_FIELD_ID,
  COMPANY_SAMPLES_QTY_SOL_FIELD_ID,
  COMPANY_TEST_RESULT_FIELD_ID,
  COMPANY_PRODUCT_TYPE_FIELD_ID,
  COMPANY_APPLICATION_NEW_FIELD_ID,
  COMPANY_APPLICATION_OLD_FIELD_ID,
  DEAL_SAMPLE_TRANSFER_FIELD_ID,
  DEAL_SAMPLE_TESTING_FIELD_ID,
  DEAL_SAMPLE_SENT_DATE_FIELD_ID,
  DEAL_SAMPLE_TVL_DETAILS_FIELD_ID,
  DEAL_SAMPLE_MARK_VOLUME_FIELD_ID,
} from "@/lib/samples/constants";

const makeCompany = (id: string, over: BitrixRow = {}): BitrixRow => ({
  ID: id,
  TITLE: `ООО «Компания ${id}»`,
  ASSIGNED_BY_ID: "10",
  ...over,
});

const makeDeal = (id: string, companyId: string, over: BitrixRow = {}): BitrixRow => ({
  ID: id,
  TITLE: `Сделка ${id}`,
  COMPANY_ID: companyId,
  ASSIGNED_BY_ID: "20",
  ...over,
});

describe("Samples Domain Characterization — 15 Scenarios", () => {
  // Scenario 1: Company legacy data only
  it("Scenario 1: Company legacy data only", () => {
    const companies = [
      makeCompany("1", {
        [COMPANY_TEST_RESULT_FIELD_ID]: "Положительный",
        [COMPANY_SAMPLES_GRADE_GEL_FIELD_ID]: ["КСМГ"],
      }),
    ];
    const { summaries, orphanDeals } = buildSampleSummaries(companies, [], []);
    expect(summaries).toHaveLength(1);
    expect(summaries[0].companyId).toBe("1");
    expect(summaries[0].relatedDeals).toHaveLength(0);
    expect(summaries[0].normalizedResult).toBe("positive");
    expect(summaries[0].grades).toEqual([{ productFamily: "Гель", value: "КСМГ" }]);
    expect(orphanDeals).toHaveLength(0);
  });

  // Scenario 2: Deal legacy data only
  it("Scenario 2: Deal legacy data only", () => {
    const companies = [makeCompany("2")]; // no sample fields on company card
    const deals = [
      makeDeal("102", "2", {
        [DEAL_SAMPLE_TRANSFER_FIELD_ID]: "Переданы",
        [DEAL_SAMPLE_SENT_DATE_FIELD_ID]: "2026-02-15",
      }),
    ];
    const { summaries, orphanDeals } = buildSampleSummaries(companies, deals, []);
    expect(summaries).toHaveLength(1);
    expect(summaries[0].companyId).toBe("2");
    expect(summaries[0].relatedDeals).toHaveLength(1);
    expect(summaries[0].relatedDeals[0].id).toBe("102");
    expect(summaries[0].sentDates).toEqual(["2026-02-15"]);
    expect(orphanDeals).toHaveLength(0);
  });

  // Scenario 3: Company + one Deal
  it("Scenario 3: Company + one Deal", () => {
    const companies = [
      makeCompany("3", {
        [COMPANY_SAMPLES_GRADE_SOL_FIELD_ID]: "СКСГ",
      }),
    ];
    const deals = [
      makeDeal("103", "3", {
        [DEAL_SAMPLE_TRANSFER_FIELD_ID]: "Переданы",
        [DEAL_SAMPLE_SENT_DATE_FIELD_ID]: "2026-03-01",
      }),
    ];
    const { summaries } = buildSampleSummaries(companies, deals, []);
    expect(summaries).toHaveLength(1);
    expect(summaries[0].grades).toEqual([{ productFamily: "Золь", value: "СКСГ" }]);
    expect(summaries[0].sentDates).toEqual(["2026-03-01"]);
    expect(summaries[0].relatedDeals).toHaveLength(1);
  });

  // Scenario 4: Company + multiple sample Deals
  it("Scenario 4: Company + multiple sample Deals", () => {
    const companies = [makeCompany("4", { [COMPANY_SAMPLES_GRADE_GEL_FIELD_ID]: ["КСМГ"] })];
    const deals = [
      makeDeal("104A", "4", { [DEAL_SAMPLE_SENT_DATE_FIELD_ID]: "2026-01-10" }),
      makeDeal("104B", "4", { [DEAL_SAMPLE_SENT_DATE_FIELD_ID]: "2026-02-20" }),
    ];
    const { summaries } = buildSampleSummaries(companies, deals, []);
    expect(summaries).toHaveLength(1);
    expect(summaries[0].relatedDeals).toHaveLength(2);
    expect(summaries[0].sentDates).toEqual(["2026-01-10", "2026-02-20"]);
  });

  // Scenario 5: Multiple Company sent dates
  it("Scenario 5: Multiple Company sent dates", () => {
    const companies = [
      makeCompany("5", {
        [COMPANY_SAMPLES_DATE_MULTI_FIELD_ID]: ["2026-01-01", "2026-01-15"],
      }),
    ];
    const { summaries } = buildSampleSummaries(companies, [], []);
    expect(summaries[0].sentDates).toEqual(["2026-01-01", "2026-01-15"]);
    expect(summaries[0].latestRelevantDate).toBe("2026-01-15");
  });

  // Scenario 6: Company and Deal sent date overlap
  it("Scenario 6: Company and Deal sent date overlap", () => {
    const companies = [
      makeCompany("6", {
        [COMPANY_SAMPLES_DATE_MULTI_FIELD_ID]: ["2026-05-10"],
      }),
    ];
    const deals = [
      makeDeal("106", "6", {
        [DEAL_SAMPLE_SENT_DATE_FIELD_ID]: "2026-05-10",
      }),
    ];
    const { summaries } = buildSampleSummaries(companies, deals, []);
    // Unique list: 2026-05-10 appears once
    expect(summaries[0].sentDates).toEqual(["2026-05-10"]);
  });

  // Scenario 7: Multiple product/grade values
  it("Scenario 7: Multiple product/grade values", () => {
    const companies = [
      makeCompany("7", {
        [COMPANY_SAMPLES_GRADE_GEL_FIELD_ID]: ["КСМГ-1", "КСМГ-2"],
        [COMPANY_SAMPLES_GRADE_SOL_FIELD_ID]: ["СКСГ-1"],
        [COMPANY_SAMPLES_QTY_GEL_FIELD_ID]: "10",
        [COMPANY_SAMPLES_QTY_SOL_FIELD_ID]: "5",
        [COMPANY_TEST_RESULT_FIELD_ID]: "Положительный",
      }),
    ];
    const { summaries } = buildSampleSummaries(companies, [], []);
    const s = summaries[0];
    expect(s.grades).toHaveLength(3);
    expect(s.quantities).toHaveLength(2);
    expect(s.dataIssues).toContain("grades_without_item_result");
  });

  // Scenario 8: Positive result
  it("Scenario 8: Positive result", () => {
    const companies = [makeCompany("8", { [COMPANY_TEST_RESULT_FIELD_ID]: "Тест пройден успешно" })];
    const { summaries } = buildSampleSummaries(companies, [], []);
    expect(summaries[0].normalizedResult).toBe("positive");
  });

  // Scenario 9: Negative result
  it("Scenario 9: Negative result", () => {
    const companies = [makeCompany("9", { [COMPANY_TEST_RESULT_FIELD_ID]: "Отрицательный результат" })];
    const { summaries } = buildSampleSummaries(companies, [], []);
    expect(summaries[0].normalizedResult).toBe("negative");
  });

  // Scenario 10: Rework result
  it("Scenario 10: Rework result", () => {
    const companies = [makeCompany("10", { [COMPANY_TEST_RESULT_FIELD_ID]: "Требуется доработка образца" })];
    const { summaries } = buildSampleSummaries(companies, [], []);
    expect(summaries[0].normalizedResult).toBe("rework");
  });

  // Scenario 11: Mixed/ambiguous evidence
  it("Scenario 11: Mixed/ambiguous evidence via contradictory date fields", () => {
    const companies = [
      makeCompany("11", {
        [COMPANY_SAMPLES_DATE_MULTI_FIELD_ID]: ["2026-01-01"],
        [COMPANY_SAMPLES_DATE_SINGLE_FIELD_ID]: "2026-02-01",
      }),
    ];
    const { summaries } = buildSampleSummaries(companies, [], []);
    expect(summaries[0].sentDates).toEqual(["2026-01-01", "2026-02-01"]);
    expect(summaries[0].dataIssues).toContain("dates_conflict_between_fields");
  });

  // Scenario 12: Deal without Company (orphan)
  it("Scenario 12: Deal without Company (orphan)", () => {
    const deals = [
      makeDeal("999", "0", { [DEAL_SAMPLE_TRANSFER_FIELD_ID]: "Переданы" }),
    ];
    const { summaries, orphanDeals } = buildSampleSummaries([], deals, []);
    expect(summaries).toHaveLength(0);
    expect(orphanDeals).toHaveLength(1);
    expect(orphanDeals[0].ID).toBe("999");
  });

  // Scenario 13: Missing Company title
  it("Scenario 13: Missing Company title", () => {
    const companies = [
      makeCompany("13", {
        TITLE: "",
        [COMPANY_TEST_RESULT_FIELD_ID]: "Положительный",
      }),
    ];
    const { summaries } = buildSampleSummaries(companies, [], []);
    expect(summaries[0].companyTitle).toBe("Без названия");
    expect(summaries[0].dataIssues).toContain("missing_title");
  });

  // Scenario 14: Company with no sample evidence
  it("Scenario 14: Company with no sample evidence excluded", () => {
    const companies = [makeCompany("14", { INDUSTRY: "IT" })];
    const { summaries } = buildSampleSummaries(companies, [], []);
    expect(summaries).toHaveLength(0);
  });

  // Scenario 15: Deal testing-marker field only
  // Confirms company discoverability in the registry
  it("Scenario 15: Deal testing-marker field only preserves company discoverability", () => {
    const companies = [makeCompany("15")]; // no sample fields on company card
    const deals = [
      makeDeal("115", "15", {
        [DEAL_SAMPLE_TESTING_FIELD_ID]: ["Тестирование образцов"],
      }),
    ];
    const { summaries } = buildSampleSummaries(companies, deals, []);
    expect(summaries).toHaveLength(1);
    expect(summaries[0].companyId).toBe("15");
    expect(summaries[0].relatedDeals).toHaveLength(1);
    expect(summaries[0].relatedDeals[0].id).toBe("115");
  });
});
