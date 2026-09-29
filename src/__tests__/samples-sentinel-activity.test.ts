import { describe, it, expect } from "vitest";
import {
  hasSampleActivity,
  dealHasSampleData,
  buildSampleSummaries,
  computeSampleKpis,
} from "@/lib/samples/aggregate";
import {
  COMPANY_SAMPLES_FIELD_ID,
  COMPANY_SAMPLES_DATE_MULTI_FIELD_ID,
  COMPANY_SAMPLES_GRADE_GEL_FIELD_ID,
  COMPANY_TEST_RESULT_FIELD_ID,
  DEAL_SAMPLE_TRANSFER_FIELD_ID,
  DEAL_SAMPLE_TESTING_FIELD_ID,
  DEAL_SAMPLE_SENT_DATE_FIELD_ID,
} from "@/lib/samples/constants";
import type { BitrixRow } from "@/lib/samples/types";

describe("Sample Sentinel Activity & KPI Invariants", () => {
  it("rejects false, 'false', null, undefined, empty string as company sample activity", () => {
    // 1. Bitrix returns boolean false for empty fields
    const companyWithFalse = {
      ID: "101",
      TITLE: "Company False",
      [COMPANY_SAMPLES_FIELD_ID]: false,
      [COMPANY_SAMPLES_DATE_MULTI_FIELD_ID]: false,
      [COMPANY_SAMPLES_GRADE_GEL_FIELD_ID]: false,
      [COMPANY_TEST_RESULT_FIELD_ID]: false,
    } as any as BitrixRow;
    expect(hasSampleActivity(companyWithFalse)).toBe(false);

    // 2. Bitrix returns string "false" / "null" / "undefined"
    const companyWithStringSentinels = {
      ID: "102",
      TITLE: "Company String Sentinels",
      [COMPANY_SAMPLES_FIELD_ID]: "false",
      [COMPANY_SAMPLES_DATE_MULTI_FIELD_ID]: ["false", "null"],
      [COMPANY_SAMPLES_GRADE_GEL_FIELD_ID]: "undefined",
      [COMPANY_TEST_RESULT_FIELD_ID]: "   ",
    } as any as BitrixRow;
    expect(hasSampleActivity(companyWithStringSentinels)).toBe(false);

    // 3. Company with real sample value is accepted
    const companyWithRealValue = {
      ID: "103",
      TITLE: "Company Real",
      [COMPANY_SAMPLES_FIELD_ID]: false,
      [COMPANY_SAMPLES_GRADE_GEL_FIELD_ID]: "КСМГ-5",
    } as any as BitrixRow;
    expect(hasSampleActivity(companyWithRealValue)).toBe(true);
  });

  it("rejects false / 'false' sentinels in deal sample detection", () => {
    // Deal with only sentinels
    const dealWithSentinels = {
      ID: "501",
      TITLE: "Deal with sentinels",
      [DEAL_SAMPLE_TRANSFER_FIELD_ID]: false,
      [DEAL_SAMPLE_TESTING_FIELD_ID]: ["false", ""],
      [DEAL_SAMPLE_SENT_DATE_FIELD_ID]: false,
    } as any as BitrixRow;
    expect(dealHasSampleData(dealWithSentinels)).toBe(false);

    // Deal with real sample data
    const dealWithRealData = {
      ID: "502",
      TITLE: "Deal with real sample",
      [DEAL_SAMPLE_TRANSFER_FIELD_ID]: "Передан",
    } as any as BitrixRow;
    expect(dealHasSampleData(dealWithRealData)).toBe(true);
  });

  it("does NOT count a deal with only sentinel sample fields as an orphan deal", () => {
    const deals = [
      // Orphan deal with only sentinel values
      {
        ID: "601",
        TITLE: "Fake Orphan",
        COMPANY_ID: "",
        [DEAL_SAMPLE_TRANSFER_FIELD_ID]: false,
        [DEAL_SAMPLE_TESTING_FIELD_ID]: ["false"],
      },
      // Real orphan deal
      {
        ID: "602",
        TITLE: "Real Orphan",
        COMPANY_ID: "0",
        [DEAL_SAMPLE_TRANSFER_FIELD_ID]: "Передан заказчику",
        [DEAL_SAMPLE_SENT_DATE_FIELD_ID]: "2026-03-01",
      },
    ] as any as BitrixRow[];

    const { orphanDeals } = buildSampleSummaries([], deals);
    expect(orphanDeals).toHaveLength(1);
    expect(orphanDeals[0].ID).toBe("602");
  });

  it("guarantees KPI invariant: withSentDates <= total (withSampleActivity)", () => {
    const companies = [
      // 1. Company with sentinel false -> excluded completely
      {
        ID: "1",
        TITLE: "Company 1",
        [COMPANY_SAMPLES_FIELD_ID]: false,
        [COMPANY_TEST_RESULT_FIELD_ID]: "false",
      },
      // 2. Company with real sample grade but no sent date
      {
        ID: "2",
        TITLE: "Company 2",
        [COMPANY_SAMPLES_GRADE_GEL_FIELD_ID]: "КСМГ",
      },
      // 3. Company with real sample grade and sent date
      {
        ID: "3",
        TITLE: "Company 3",
        [COMPANY_SAMPLES_GRADE_GEL_FIELD_ID]: "СКСГ",
        [COMPANY_SAMPLES_DATE_MULTI_FIELD_ID]: ["2026-02-15"],
      },
    ] as any as BitrixRow[];

    const deals = [
      // Deal linked to Company 1 with only sentinels -> still no sample activity for Company 1
      {
        ID: "11",
        COMPANY_ID: "1",
        [DEAL_SAMPLE_TRANSFER_FIELD_ID]: false,
      },
    ] as any as BitrixRow[];

    const { summaries } = buildSampleSummaries(companies, deals);
    // Only Company 2 and Company 3 enter the dataset (Company 1 has only sentinels)
    expect(summaries).toHaveLength(2);
    expect(summaries.map((s) => s.companyId).sort()).toEqual(["2", "3"]);

    const kpis = computeSampleKpis(summaries);
    expect(kpis.total).toBe(2);
    expect(kpis.withSentDates).toBe(1); // Only Company 3

    // INVARIANT: withSentDates <= total
    expect(kpis.withSentDates).toBeLessThanOrEqual(kpis.total);
  });
});
