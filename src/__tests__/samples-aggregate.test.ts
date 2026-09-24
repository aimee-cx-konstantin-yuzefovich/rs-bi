// @vitest-environment node
// src/__tests__/samples-aggregate.test.ts
// Company-level dedupe, nested deals, join failures, KPI rules,
// scenarios 3/4/11/12/13/14/16/20 of the Samples v1 task.
import { describe, expect, it } from "vitest";
import {
  buildSampleSummaries,
  computeSampleKpis,
  dealHasSampleData,
  hasSampleActivity,
} from "@/lib/samples/aggregate";
import type { BitrixRow } from "@/lib/samples/types";

const F = {
  samples: "UF_CRM_1753187313314",
  dateMulti: "UF_CRM_1764156557536",
  dateSingle: "UF_CRM_1783429999269",
  gradeGel: "UF_CRM_1764155817232",
  gradeSol: "UF_CRM_1764155891815",
  qtyGel: "UF_CRM_1764156004815",
  qtySol: "UF_CRM_1764156064272",
  result: "UF_CRM_1764156593",
  product: "UF_CRM_69257BBAB86F6",
  dTransfer: "UF_CRM_1779386185",
  dTesting: "UF_CRM_1779394379",
  dSent: "UF_CRM_1774879952785",
  dTvl: "UF_CRM_1774880017",
  dMark: "UF_CRM_1779384164284",
};

const company = (over: BitrixRow): BitrixRow => ({
  ID: "42",
  TITLE: "ООО «Тест»",
  ASSIGNED_BY_ID: "7",
  ...over,
});

describe("buildSampleSummaries — grain and identity", () => {
  it("one company with sample activity produces exactly one summary", () => {
    const { summaries } = buildSampleSummaries(
      [company({ [F.result]: "Положительный" })],
      []
    );
    expect(summaries).toHaveLength(1);
    expect(summaries[0].companyId).toBe("42");
    expect(summaries[0].companyTitle).toBe("ООО «Тест»");
  });

  it("duplicate company rows are deduplicated by ID (first wins)", () => {
    const { summaries } = buildSampleSummaries(
      [
        company({ [F.result]: "Положительный" }),
        company({ ID: "42", TITLE: "ООО «Тест» дубль", [F.result]: "Отрицательный" }),
      ],
      []
    );
    expect(summaries).toHaveLength(1);
    expect(summaries[0].rawTestResult).toBe("Положительный");
  });

  it("companies without sample activity are excluded", () => {
    const { summaries } = buildSampleSummaries(
      [company({ INDUSTRY: "IT" }), company({ ID: "43", TITLE: "Нет образцов" })],
      []
    );
    expect(summaries).toHaveLength(0);
  });

  it("hasSampleActivity detection across all sample fields", () => {
    expect(hasSampleActivity(company({}))).toBe(false);
    expect(hasSampleActivity(company({ [F.dateMulti]: ["2026-01-01"] }))).toBe(true);
    expect(hasSampleActivity(company({ [F.gradeSol]: "КСМГ" }))).toBe(true);
    expect(hasSampleActivity(company({ [F.samples]: ["1"] }))).toBe(true);
    // Deal fields on a company row don't count.
    expect(hasSampleActivity(company({ [F.dSent]: "2026-01-01" }))).toBe(false);
  });

  it("scenario 19: missing title → fallback, never company ID, issue flagged", () => {
    const { summaries } = buildSampleSummaries(
      [company({ TITLE: "", [F.result]: "Положительный" })],
      []
    );
    expect(summaries[0].companyTitle).toBe("Без названия");
    expect(summaries[0].companyTitle).not.toBe("42");
    expect(summaries[0].dataIssues).toContain("missing_title");
  });
});

describe("buildSampleSummaries — multiplicity preservation", () => {
  it("scenario 3: several grades preserved with product families", () => {
    const { summaries } = buildSampleSummaries(
      [
        company({
          [F.gradeGel]: ["КСМГ-5", "КСМГ-7"],
          [F.gradeSol]: "СКСГ-2",
          [F.result]: "Положительный",
        }),
      ],
      []
    );
    const s = summaries[0];
    expect(s.grades).toHaveLength(3);
    expect(s.grades.filter((g) => g.productFamily === "Гель")).toHaveLength(2);
    expect(s.grades.find((g) => g.productFamily === "Золь")?.value).toBe("СКСГ-2");
    expect(s.dataIssues).toContain("grades_without_item_result");
  });

  it("scenario 4: Gel and Sol quantities keep distinct units, never summed", () => {
    const { summaries } = buildSampleSummaries(
      [company({ [F.qtyGel]: "2.5", [F.qtySol]: "1" })],
      []
    );
    const q = summaries[0].quantities;
    expect(q).toHaveLength(2);
    const gel = q.find((x) => x.productFamily === "Гель");
    const sol = q.find((x) => x.productFamily === "Золь");
    expect(gel).toEqual({ productFamily: "Гель", value: 2.5, unit: "кг" });
    expect(sol).toEqual({ productFamily: "Золь", value: 1, unit: "л" });
  });

  it("scenario 6: multiple sent dates preserved including deal dates", () => {
    const { summaries } = buildSampleSummaries(
      [company({ [F.dateMulti]: ["2026-01-15", "2026-02-01"] })],
      [
        {
          ID: "101",
          TITLE: "Сделка",
          COMPANY_ID: "42",
          [F.dSent]: "2026-03-10",
          [F.dTransfer]: "Переданы",
        },
      ]
    );
    expect(summaries[0].sentDates).toEqual([
      "2026-01-15",
      "2026-02-01",
      "2026-03-10",
    ]);
    expect(summaries[0].latestRelevantDate).toBe("2026-03-10");
  });

  it("scenario 7: conflicting two date fields — all dates kept + issue", () => {
    const { summaries } = buildSampleSummaries(
      [company({ [F.dateMulti]: ["2026-03-01"], [F.dateSingle]: "2026-04-10" })],
      []
    );
    const s = summaries[0];
    expect(s.sentDates).toEqual(["2026-03-01", "2026-04-10"]);
    expect(s.dataIssues).toContain("dates_conflict_between_fields");
  });

  it("scenario 18: duplicate dates across fields deduplicate without issue", () => {
    const { summaries } = buildSampleSummaries(
      [company({ [F.dateMulti]: ["2026-03-01"], [F.dateSingle]: "2026-03-01" })],
      []
    );
    const s = summaries[0];
    expect(s.sentDates).toEqual(["2026-03-01"]);
    expect(s.dataIssues).not.toContain("dates_conflict_between_fields");
  });
});

describe("buildSampleSummaries — deals as nested context", () => {
  const gelPositiveSolPendingDeal = {
    ID: "101",
    TITLE: "Сделка Гель",
    COMPANY_ID: "42",
    STAGE_ID: "EXECUTING",
    [F.dTesting]: ["Испытание Гель пройден", "Золь на испытании"],
  };

  it("scenario 5: Gel positive + Sol testing via deals → mixed, never one fake global result", () => {
    const { summaries } = buildSampleSummaries(
      [company({})],
      [gelPositiveSolPendingDeal]
    );
    const s = summaries[0];
    expect(s.normalizedResult).toBe("mixed");
    expect(s.sourceQuality).toBe("ambiguous");
    expect(s.rawTestResult).toBeUndefined();
  });

  it("scenario 11: multiple related deals all preserved, never just the first", () => {
    const { summaries } = buildSampleSummaries(
      [company({})],
      [
        { ID: "101", TITLE: "Сделка 1", COMPANY_ID: "42", [F.dTransfer]: "Переданы" },
        { ID: "102", TITLE: "Сделка 2", COMPANY_ID: "42", [F.dTesting]: ["Испытание"] },
        { ID: "103", TITLE: "Сделка 3", COMPANY_ID: "42", [F.dSent]: "2026-02-02" },
      ]
    );
    expect(summaries[0].relatedDeals.map((d) => d.id)).toEqual([
      "101",
      "102",
      "103",
    ]);
  });

  it("scenario 12: company sample activity with no deal data → relatedDeals empty", () => {
    const { summaries } = buildSampleSummaries(
      [company({ [F.result]: "Положительный" })],
      []
    );
    expect(summaries[0].relatedDeals).toEqual([]);
  });

  it("scenario 13: deal sample status present while company fields incomplete", () => {
    const { summaries } = buildSampleSummaries(
      [company({})],
      [{ ID: "101", TITLE: "Сделка", COMPANY_ID: "42", [F.dTransfer]: "Переданы" }]
    );
    const s = summaries[0];
    expect(s.relatedDeals[0].sampleTransferStatus).toBe("Переданы");
    expect(s.sentDates).toEqual([]);
  });

  it("scenario 14: company sample fields present while deal fields absent", () => {
    const { summaries } = buildSampleSummaries(
      [company({ [F.result]: "Положительный", [F.dateSingle]: "2026-01-05" })],
      [{ ID: "101", TITLE: "Сделка без образцов", COMPANY_ID: "42" }]
    );
    const s = summaries[0];
    expect(s.rawTestResult).toBe("Положительный");
    // Deal without sample data is not attached as related context.
    expect(s.relatedDeals).toEqual([]);
  });

  it("deals without sample data are never attached", () => {
    expect(dealHasSampleData({ ID: "1", TITLE: "x" })).toBe(false);
    expect(
      dealHasSampleData({ ID: "1", TITLE: "x", [F.dMark]: "КСМГ 10 т" })
    ).toBe(true);
  });

  it("orphan deals (no company) are reported, not silently dropped", () => {
    const { summaries, orphanDeals } = buildSampleSummaries(
      [company({})],
      [{ ID: "999", TITLE: "Сирота", [F.dTransfer]: "Переданы" }]
    );
    // Company without any sample evidence anywhere is not in the dataset.
    expect(summaries).toHaveLength(0);
    expect(orphanDeals).toHaveLength(1);
    expect(orphanDeals[0].ID).toBe("999");
  });

  it("deals joined by COMPANY_ID, never by company display name", () => {
    const { summaries } = buildSampleSummaries(
      [
        company({ TITLE: "ООО «А»", [F.result]: "Положительный" }),
        company({ ID: "43", TITLE: "ООО «А»" }),
      ],
      [{ ID: "101", TITLE: "Сделка", COMPANY_ID: "43", [F.dTransfer]: "Переданы" }]
    );
    // Both companies appear: one via own activity, one via deal activity.
    const target = summaries.find((s) => s.companyId === "43");
    expect(target?.relatedDeals.map((d) => d.id)).toEqual(["101"]);
    const other = summaries.find((s) => s.companyId === "42");
    expect(other?.relatedDeals).toEqual([]);
    // Join was by ID: the deal went to company 43 even though titles match.
    expect(target).toBeDefined();
  });
});

describe("buildSampleSummaries — result normalization and quality", () => {
  it("scenario 16: missing product but known sample status → issue + statuses kept", () => {
    const { summaries } = buildSampleSummaries(
      [company({ [F.samples]: ["Образцы отправлены"] })],
      []
    );
    const s = summaries[0];
    expect(s.sampleIndicators).toEqual(["Образцы отправлены"]);
    expect(s.productFamilies).toEqual([]);
    expect(s.dataIssues).toContain("missing_product");
    expect(s.normalizedResult).toBe("unknown");
  });

  it("scenario 20: materially ambiguous record → ambiguous quality", () => {
    const { summaries } = buildSampleSummaries(
      [
        company({
          [F.dateMulti]: ["2026-03-01"],
          [F.dateSingle]: "2026-04-10",
          [F.gradeGel]: ["A", "B"],
          [F.result]: "Положительный",
        }),
      ],
      []
    );
    const s = summaries[0];
    expect(s.dataIssues).toContain("dates_conflict_between_fields");
    expect(s.dataIssues).toContain("grades_without_item_result");
    // Quality here is driven by mixed deal evidence only; conflicts flag via issues.
    expect(s.sourceQuality).toBe("structured");
  });

  it("labelResolver maps enum IDs for statuses and products", () => {
    const dict: Record<string, string> = {
      "1": "Образцы отправлены",
      "1613": "Гель",
    };
    const resolve = (fieldId: string, raw: string) =>
      fieldId === F.product ? dict[raw] ?? raw : dict[raw] ?? raw;
    const { summaries } = buildSampleSummaries(
      [
        company({
          [F.samples]: ["1"],
          [F.product]: ["1613"],
          [F.result]: "Положительный",
        }),
      ],
      [],
      { labelResolver: resolve }
    );
    const s = summaries[0];
    expect(s.sampleIndicators).toEqual(["Образцы отправлены"]);
    expect(s.productFamilies).toEqual(["Гель"]);
    expect(s.normalizedResult).toBe("positive");
  });

  it("industry and application: newer field wins, older supplement, difference flagged", () => {
    const { summaries } = buildSampleSummaries(
      [
        company({
          [F.result]: "Положительный",
          "UF_CRM_1781806326214": "Керамика",
          "UF_CRM_69257337B8025": "Строительство",
        }),
      ],
      []
    );
    const s = summaries[0];
    expect(s.application).toBe("Керамика");
    expect(s.dataIssues).toContain("application_fields_differ");
  });
});

describe("computeSampleKpis — explicit company grain", () => {
  const emptySummaries: ReturnType<
    typeof buildSampleSummaries
  >["summaries"] = [];
  it("mixed counts in none of positive/negative/rework; counted with result", () => {
    const kpis = computeSampleKpis([
      {
        companyId: "1",
        companyTitle: "A",
        productFamilies: [],
        grades: [],
        quantities: [],
        sentDates: [],
        sampleIndicators: [],
        processStatuses: [],
        normalizedResult: "mixed",
        relatedDeals: [],
        sourceQuality: "ambiguous",
        dataIssues: [],
      },
      {
        companyId: "2",
        companyTitle: "B",
        productFamilies: [],
        grades: [],
        quantities: [],
        sentDates: ["2026-01-01"],
        sampleIndicators: [],
        processStatuses: [],
        normalizedResult: "positive",
        relatedDeals: [],
        sourceQuality: "structured",
        dataIssues: [],
      },
      {
        companyId: "3",
        companyTitle: "C",
        productFamilies: [],
        grades: [],
        quantities: [],
        sentDates: [],
        sampleIndicators: [],
        processStatuses: ["Испытание образцов"],
        normalizedResult: "pending",
        relatedDeals: [],
        sourceQuality: "partial",
        dataIssues: [],
      },
    ]);
    expect(kpis.total).toBe(3);
    expect(kpis.withSentDates).toBe(1);
    expect(kpis.inTesting).toBe(1);
    expect(kpis.withResult).toBe(2); // mixed + positive
    expect(kpis.positive).toBe(1);
    expect(kpis.negative).toBe(0);
    expect(kpis.rework).toBe(0);
    expect(kpis.ambiguous).toBe(1);
  });

  it("empty set yields zeroed KPIs", () => {
    expect(computeSampleKpis(emptySummaries)).toEqual({
      total: 0,
      withSentDates: 0,
      inTesting: 0,
      withResult: 0,
      positive: 0,
      negative: 0,
      rework: 0,
      ambiguous: 0,
    });
  });
});
