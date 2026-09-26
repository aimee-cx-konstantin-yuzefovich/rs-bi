// src/__tests__/global-adversarial-reconciliation.test.ts
// ─────────────────────────────────────────────────────────────────────
// GLOBAL ADVERSARIAL RECONCILIATION TEST SUITE
// RS-BI Contract & Invariant Closure Pass
//
// Encodes the central 14-condition adversarial fixture, an independent
// hand-calculated expected ledger (no production function calls), and validates
// end-to-end preservation of meaning across:
// Raw Bitrix -> Normalization -> Domain Analytics Engine -> UI -> Excel Reload.
// ─────────────────────────────────────────────────────────────────────

import { describe, it, expect, vi, beforeEach } from "vitest";
import ExcelJS from "exceljs";
import { fetchAllPages } from "@/lib/samples/bitrix-fetch";
import { normalizeDeals, normalizeCompanies } from "@/lib/commercial-funnel/normalize";
import {
  computeBottlenecks,
  computeManagerScorecard,
  computePeriodMetrics,
  computeWipMetrics,
  buildSampleRegister,
  filterCompaniesByDimensions,
} from "@/lib/commercial-funnel/engine";
import { computePeriodBoundaries } from "@/lib/commercial-funnel/date-utils";
import { createCommercialFunnelWorkbook } from "@/lib/commercial-funnel/export-excel";
import { bitrixPost } from "@/lib/bitrix";
import {
  COMPANY_SAMPLES_FIELD_ID,
  COMPANY_PRODUCT_TYPE_FIELD_ID,
  COMPANY_DIRECTION_FIELD_ID,
  DEAL_DIRECTION_FIELD_ID,
  DEAL_PRODUCT_TYPE_FIELD_ID,
  DEAL_SAMPLE_TRANSFER_FIELD_ID,
  DEAL_SAMPLE_TESTING_FIELD_ID,
  DEAL_SAMPLE_SENT_DATE_FIELD_ID,
  DEAL_PAYMENT_DATE_FIELD_ID,
  PAYMENT_STATUS_FIELD_ID,
} from "@/lib/crm-constants";

vi.mock("@/lib/bitrix", () => ({
  bitrixPost: vi.fn(),
}));

// ═════════════════════════════════════════════════════════════════════
// 1. INDEPENDENT HAND-CALCULATED EXPECTED LEDGER
// Calculated strictly by hand — NO production engine or normalization calls.
// ═════════════════════════════════════════════════════════════════════
const INDEPENDENT_EXPECTED_LEDGER = {
  fixedNow: "2026-03-25T12:00:00Z",
  periodPreset: "90days" as const, // Current period: 2025-12-25 to 2026-03-25

  // Date filtering: Deals with impossible timestamps are excluded from period analytics
  acceptedDateDealIds: [
    "D101",
    "D102",
    "D103",
    "D104",
    "D105",
    "D106",
    "D109",
    "D110",
    "D112",
  ],
  rejectedInvalidDateDealIds: [
    "D107", // 2026-03-01 25:00:00 (hour overflow)
    "D108", // 2026-02-31 (impossible leap-free date)
  ],

  // Opportunity parsing expectations
  opportunity: {
    D101: { amount: 0, quality: "VALID" },
    D102: { amount: null, quality: "UNKNOWN" },
    D103: { amount: null, quality: "INVALID" }, // "12abc"
    D104: { amount: null, quality: "INVALID" }, // "RUB 99999"
    D105: { amount: 500000, quality: "VALID" },
    D106: { amount: 10000, quality: "VALID" },
  },

  // Payment KPI expectations
  payments: {
    // Participating companies with paid deals in period
    paidCompanyIds: ["COMP_1", "COMP_4", "COMP_5", "COMP_6"],
    uniqueCompanyCount: 4,

    // Multi-currency invariant: scalar sum across currencies is strictly forbidden
    isMultiCurrency: true,
    aggregateCurrentValue: null,

    // Per-currency ledger
    byCurrency: {
      RUB: {
        knownAmount: 500000,
        quality: "PARTIAL", // D105 is 500000 (valid), D104 is paid but invalid opportunity
        contributingDealIds: ["D105"],
        invalidOrMissingDealIds: ["D104"],
      },
      USD: {
        knownAmount: 0, // D101 is valid zero!
        quality: "COMPLETE",
        contributingDealIds: ["D101"],
        invalidOrMissingDealIds: [],
      },
      EUR: {
        knownAmount: 10000,
        quality: "COMPLETE",
        contributingDealIds: ["D106"],
        invalidOrMissingDealIds: [],
      },
    },
  },

  // Manager scorecard expectations
  managers: {
    // Manager 1 (Responsible for COMP_4, COMP_5, COMP_6, COMP_9, COMP_10, COMP_11, COMP_12)
    "1": {
      name: "Алексей Иванов",
      paymentsReceived: 3, // D104, D105, D106
      paymentAmountsByCurrency: {
        RUB: 500000,
        EUR: 10000,
      },
      paymentAmountsQualityByCurrency: {
        RUB: "PARTIAL", // D104 has invalid opportunity
        EUR: "COMPLETE",
      },
      bottlenecksCount: 3, // D110 (stalled deal), COMP_11 (sample_success_no_deal), COMP_12 (sample_testing_stalled)
    },
    // Manager 2 (Responsible for COMP_1, COMP_2, COMP_3, COMP_7, COMP_8)
    "2": {
      name: "Мария Смирнова",
      paymentsReceived: 1, // D101
      paymentAmountsByCurrency: {
        USD: 0, // Valid 0 preserved!
      },
      paymentAmountsQualityByCurrency: {
        USD: "COMPLETE",
      },
      bottlenecksCount: 2, // D102, D103 (stalled active deals without activity)
    },
  },

  // Bottleneck expectations
  bottlenecks: {
    // Deal D109 (created 80 days ago, last activity yesterday) is NOT stalled!
    notStalledDealIds: ["D109"],

    // Deal D110 (created 75 days ago, activity unknown/incomplete) is stalled with truthful label
    stalledDeals: [
      {
        dealId: "D110",
        companyId: "COMP_10",
        daysWaiting: 75,
        issueLabel: "Старая активная сделка (75 дн., данные активности недоступны)",
        hasActivityNext: false,
      },
    ],

    // Company COMP_11 has sample success (enum 2695) but NO sample shipment date
    // Must NOT fall back to company DATE_CREATE!
    sampleSuccessNoDeal: {
      companyId: "COMP_11",
      daysWaiting: null,
      relevantDate: undefined,
    },
  },

  // Excel binary round-trip expectations
  excel: {
    executiveSummary: {
      // Partial RUB discloses incomplete data in row label
      rubLabelContainsPartial: true,
      rubCurrentAmount: 500000,
      // USD valid zero is native numeric 0
      usdCurrentAmount: 0,
      // EUR is complete 10000
      eurCurrentAmount: 10000,
    },
    managersSheet: {
      mgr1RubCell: 500000,
      mgr1EurCell: 10000,
      mgr2UsdCell: 0, // Must be numeric 0, not "—" or blank
      mgr1RubCellNoteContainsPartial: true,
    },
    bottlenecksSheet: {
      comp11DaysWaitingDisplay: "—", // Never numeric 0!
      d110DaysWaitingDisplay: 75,
    },
  },
};

describe("RS-BI Global Adversarial Reconciliation Master Suite", () => {
  const fixedNow = new Date(INDEPENDENT_EXPECTED_LEDGER.fixedNow);
  const userNames: Record<string, string> = {
    "1": "Алексей Иванов",
    "2": "Мария Смирнова",
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ═══════════════════════════════════════════════════════════════════
  // 2. THE 14-CONDITION ADVERSARIAL MASTER FIXTURE
  // ═══════════════════════════════════════════════════════════════════
  const page1RawDeals = [
    // Condition 1: Valid zero opportunity (paid USD deal)
    {
      ID: "D101",
      TITLE: "Сделка D101 — Валидный ноль USD",
      COMPANY_ID: "COMP_1",
      ASSIGNED_BY_ID: "2",
      STAGE_ID: "WON",
      OPPORTUNITY: "0",
      CURRENCY_ID: "USD",
      DATE_CREATE: "2026-02-01",
      [PAYMENT_STATUS_FIELD_ID]: "113",
      [DEAL_PAYMENT_DATE_FIELD_ID]: "2026-03-05",
    },
    // Condition 2: Missing opportunity (null)
    {
      ID: "D102",
      TITLE: "Сделка D102 — Отсутствующая сумма",
      COMPANY_ID: "COMP_2",
      ASSIGNED_BY_ID: "2",
      STAGE_ID: "EXECUTING",
      OPPORTUNITY: null,
      CURRENCY_ID: "RUB",
      DATE_CREATE: "2026-02-02",
    },
    // Condition 3: Malformed opportunity ("12abc")
    {
      ID: "D103",
      TITLE: "Сделка D103 — Мусорная сумма",
      COMPANY_ID: "COMP_3",
      ASSIGNED_BY_ID: "2",
      STAGE_ID: "NEW",
      OPPORTUNITY: "12abc",
      CURRENCY_ID: "EUR",
      DATE_CREATE: "2026-02-03",
    },
    // Condition 4: Paid deal with malformed amount in RUB
    {
      ID: "D104",
      TITLE: "Сделка D104 — Оплачено с некорректной суммой",
      COMPANY_ID: "COMP_4",
      ASSIGNED_BY_ID: "1",
      STAGE_ID: "WON",
      OPPORTUNITY: "RUB 99999",
      CURRENCY_ID: "RUB",
      DATE_CREATE: "2026-02-04",
      [PAYMENT_STATUS_FIELD_ID]: "113",
      [DEAL_PAYMENT_DATE_FIELD_ID]: "2026-03-08",
    },
    // Condition 5: Valid paid amount in RUB (500 000)
    {
      ID: "D105",
      TITLE: "Сделка D105 — Валидная оплата RUB",
      COMPANY_ID: "COMP_5",
      ASSIGNED_BY_ID: "1",
      STAGE_ID: "WON",
      OPPORTUNITY: "500000",
      CURRENCY_ID: "RUB",
      DATE_CREATE: "2026-02-05",
      [PAYMENT_STATUS_FIELD_ID]: "113",
      [DEAL_PAYMENT_DATE_FIELD_ID]: "2026-03-10",
    },
    // Condition 6: Multi-currency paid deal in EUR (10 000)
    {
      ID: "D106",
      TITLE: "Сделка D106 — Оплата в EUR",
      COMPANY_ID: "COMP_6",
      ASSIGNED_BY_ID: "1",
      STAGE_ID: "WON",
      OPPORTUNITY: "10000",
      CURRENCY_ID: "EUR",
      DATE_CREATE: "2026-02-06",
      [PAYMENT_STATUS_FIELD_ID]: "113",
      [DEAL_PAYMENT_DATE_FIELD_ID]: "2026-03-12",
    },
    // Condition 7: Impossible datetime (hour 25:00:00)
    {
      ID: "D107",
      TITLE: "Сделка D107 — Часовой оверфлоу 25:00",
      COMPANY_ID: "COMP_7",
      ASSIGNED_BY_ID: "2",
      STAGE_ID: "NEW",
      OPPORTUNITY: "300000",
      CURRENCY_ID: "RUB",
      DATE_CREATE: "2026-03-01 25:00:00",
    },
  ];

  const page2RawDeals = [
    // Condition 13: Repeated ID D105 across pagination boundaries (deduplicated cleanly)
    {
      ID: "D105",
      TITLE: "Сделка D105 — Повтор со страницы 2",
      COMPANY_ID: "COMP_5",
      ASSIGNED_BY_ID: "1",
      STAGE_ID: "WON",
      OPPORTUNITY: "500000",
      CURRENCY_ID: "RUB",
      DATE_CREATE: "2026-02-05",
      [PAYMENT_STATUS_FIELD_ID]: "113",
      [DEAL_PAYMENT_DATE_FIELD_ID]: "2026-03-10",
    },
    // Condition 8: Impossible calendar date (2026-02-31)
    {
      ID: "D108",
      TITLE: "Сделка D108 — Несуществующая дата 31 февраля",
      COMPANY_ID: "COMP_8",
      ASSIGNED_BY_ID: "2",
      STAGE_ID: "NEW",
      OPPORTUNITY: "400000",
      CURRENCY_ID: "RUB",
      DATE_CREATE: "2026-02-31",
    },
    // Condition 9: Old Deal (created 80 days ago) with recent activity yesterday
    {
      ID: "D109",
      TITLE: "Сделка D109 — Старая сделка с недавней активностью",
      COMPANY_ID: "COMP_9",
      ASSIGNED_BY_ID: "1",
      STAGE_ID: "EXECUTING",
      OPPORTUNITY: "600000",
      CURRENCY_ID: "RUB",
      DATE_CREATE: "2026-01-04", // 80 days before fixedNow (2026-03-25)
      ACTIVITY_LAST: "2026-03-24", // yesterday!
      ACTIVITY_NEXT: "2026-03-26", // tomorrow!
      activityDataKnown: true,
    },
    // Condition 10: Old Deal (created 75 days ago) with activity UNKNOWN
    {
      ID: "D110",
      TITLE: "Сделка D110 — Старая сделка без данных активности",
      COMPANY_ID: "COMP_10",
      ASSIGNED_BY_ID: "1",
      STAGE_ID: "EXECUTING",
      OPPORTUNITY: "700000",
      CURRENCY_ID: "RUB",
      DATE_CREATE: "2026-01-09", // 75 days before fixedNow (2026-03-25)
    },
    // Condition 14: Valid multiple-value CRM fields
    {
      ID: "D112",
      TITLE: "Сделка D112 — Множественные CRM поля",
      COMPANY_ID: "COMP_12",
      ASSIGNED_BY_ID: "1",
      STAGE_ID: "EXECUTING",
      OPPORTUNITY: "800000",
      CURRENCY_ID: "RUB",
      DATE_CREATE: "2026-02-15",
      [DEAL_DIRECTION_FIELD_ID]: ["1007", "1008"],
      [DEAL_PRODUCT_TYPE_FIELD_ID]: ["101", "102"],
      [DEAL_SAMPLE_TRANSFER_FIELD_ID]: "DT1032_15:UC_ZARRMX",
      [DEAL_SAMPLE_SENT_DATE_FIELD_ID]: "2026-02-20",
    },
  ];

  const rawCompanies = [
    { ID: "COMP_1", TITLE: "ООО «Компания 1 (USD)»", ASSIGNED_BY_ID: "2", DATE_CREATE: "2026-01-10" },
    { ID: "COMP_2", TITLE: "ООО «Компания 2 (null opp)»", ASSIGNED_BY_ID: "2", DATE_CREATE: "2026-01-11" },
    { ID: "COMP_3", TITLE: "ООО «Компания 3 (junk opp)»", ASSIGNED_BY_ID: "2", DATE_CREATE: "2026-01-12" },
    { ID: "COMP_4", TITLE: "ООО «Компания 4 (bad paid)»", ASSIGNED_BY_ID: "1", DATE_CREATE: "2026-01-13" },
    { ID: "COMP_5", TITLE: "ООО «Компания 5 (valid paid)»", ASSIGNED_BY_ID: "1", DATE_CREATE: "2026-01-14" },
    { ID: "COMP_6", TITLE: "ООО «Компания 6 (EUR paid)»", ASSIGNED_BY_ID: "1", DATE_CREATE: "2026-01-15" },
    { ID: "COMP_7", TITLE: "ООО «Компания 7 (bad dt)»", ASSIGNED_BY_ID: "2", DATE_CREATE: "2026-01-16" },
    { ID: "COMP_8", TITLE: "ООО «Компания 8 (bad d)»", ASSIGNED_BY_ID: "2", DATE_CREATE: "2026-01-17" },
    { ID: "COMP_9", TITLE: "ООО «Компания 9 (old active)»", ASSIGNED_BY_ID: "1", DATE_CREATE: "2026-01-04" },
    { ID: "COMP_10", TITLE: "ООО «Компания 10 (old unknown act)»", ASSIGNED_BY_ID: "1", DATE_CREATE: "2026-01-09" },
    // Condition 11: Successful sample (enum 2695) without authoritative sample date
    {
      ID: "COMP_11",
      TITLE: "ООО «Компания 11 (образцы подошли без даты)»",
      ASSIGNED_BY_ID: "1",
      DATE_CREATE: "2025-11-01",
      [COMPANY_SAMPLES_FIELD_ID]: ["2695"], // "Подошли"
    },
    // Condition 14: Valid multiple-value company fields
    {
      ID: "COMP_12",
      TITLE: "ООО «Компания 12 (множественные теги)»",
      ASSIGNED_BY_ID: "1",
      DATE_CREATE: "2026-01-20",
      [COMPANY_SAMPLES_FIELD_ID]: ["261", "2695"],
      [COMPANY_PRODUCT_TYPE_FIELD_ID]: ["1613", "1614"],
      [COMPANY_DIRECTION_FIELD_ID]: ["301", "302"],
    },
  ];

  it("proves complete semantic reconciliation across Raw -> Normalized -> Engine -> UI -> Excel against Independent Expected Ledger", async () => {
    // ═════════════════════════════════════════════════════════════════
    // LAYER 1: INGRESS COMPLETENESS & DEDUPLICATION (Conditions 12 & 13)
    // ═════════════════════════════════════════════════════════════════
    // Mock bitrixPost for deals pagination
    vi.mocked(bitrixPost)
      .mockResolvedValueOnce({
        total: 11,
        result: page1RawDeals,
        next: 7,
      })
      .mockResolvedValueOnce({
        total: 11,
        result: page2RawDeals,
        next: undefined,
      });

    const rawDeals = await fetchAllPages("crm.deal.list", {}, "ID");
    // Authoritative total 11 reconciled; duplicate D105 deduplicated cleanly
    expect(rawDeals).toHaveLength(11);
    expect(rawDeals.map((d) => d.ID).sort()).toEqual(
      ["D101", "D102", "D103", "D104", "D105", "D106", "D107", "D108", "D109", "D110", "D112"].sort()
    );

    // ═════════════════════════════════════════════════════════════════
    // LAYER 2: STRICT NORMALIZATION (Conditions 1, 2, 3, 4, 7, 8, 14)
    // ═════════════════════════════════════════════════════════════════
    const deals = normalizeDeals(rawDeals, { userNames });

    // Assert exact scalar parsing matches Independent Expected Ledger
    for (const dealId of INDEPENDENT_EXPECTED_LEDGER.acceptedDateDealIds) {
      const d = deals.find((x) => x.id === dealId);
      expect(d, `Deal ${dealId} must exist`).toBeDefined();
      expect(d?.dateCreate, `Deal ${dealId} must have valid dateCreate`).toBeDefined();
    }

    // Condition 7 & 8: Impossible dates rejected (undefined dateCreate)
    for (const dealId of INDEPENDENT_EXPECTED_LEDGER.rejectedInvalidDateDealIds) {
      const d = deals.find((x) => x.id === dealId);
      expect(d, `Deal ${dealId} must exist in normalized deals`).toBeDefined();
      expect(d?.dateCreate, `Deal ${dealId} must NOT have dateCreate (no rollover)`).toBeUndefined();
    }

    // Condition 1: Valid zero opportunity
    const d101 = deals.find((d) => d.id === "D101")!;
    expect(d101.opportunity).toBe(INDEPENDENT_EXPECTED_LEDGER.opportunity.D101.amount);
    expect(d101.opportunityQuality).toBe(INDEPENDENT_EXPECTED_LEDGER.opportunity.D101.quality);

    // Condition 2: Missing opportunity
    const d102 = deals.find((d) => d.id === "D102")!;
    expect(d102.opportunity).toBe(INDEPENDENT_EXPECTED_LEDGER.opportunity.D102.amount);
    expect(d102.opportunityQuality).toBe(INDEPENDENT_EXPECTED_LEDGER.opportunity.D102.quality);

    // Condition 3: Malformed opportunity ("12abc")
    const d103 = deals.find((d) => d.id === "D103")!;
    expect(d103.opportunity).toBe(INDEPENDENT_EXPECTED_LEDGER.opportunity.D103.amount);
    expect(d103.opportunityQuality).toBe(INDEPENDENT_EXPECTED_LEDGER.opportunity.D103.quality);

    // Condition 4: Paid deal with malformed amount ("RUB 99999")
    const d104 = deals.find((d) => d.id === "D104")!;
    expect(d104.opportunity).toBe(INDEPENDENT_EXPECTED_LEDGER.opportunity.D104.amount);
    expect(d104.opportunityQuality).toBe(INDEPENDENT_EXPECTED_LEDGER.opportunity.D104.quality);

    // Condition 5: Valid paid amount in RUB
    const d105 = deals.find((d) => d.id === "D105")!;
    expect(d105.opportunity).toBe(INDEPENDENT_EXPECTED_LEDGER.opportunity.D105.amount);
    expect(d105.opportunityQuality).toBe(INDEPENDENT_EXPECTED_LEDGER.opportunity.D105.quality);

    // Condition 6: Valid paid amount in EUR
    const d106 = deals.find((d) => d.id === "D106")!;
    expect(d106.opportunity).toBe(INDEPENDENT_EXPECTED_LEDGER.opportunity.D106.amount);
    expect(d106.opportunityQuality).toBe(INDEPENDENT_EXPECTED_LEDGER.opportunity.D106.quality);

    // Supply activities:
    // Deal D109 has recent activity yesterday (2026-03-24)
    // Deal D110 is in incompleteDealIds (activity UNKNOWN)
    const activitiesMap = {
      D109: {
        last: { ID: "A1", CREATED: "2026-03-24 10:00:00", SUBJECT: "Созвон вчера" },
        next: { ID: "A2", DEADLINE: "2026-03-26 15:00:00", SUBJECT: "Встреча завтра" },
      },
    };

    const companies = normalizeCompanies(rawCompanies, deals, {
      userNames,
      now: fixedNow,
    });

    expect(companies).toHaveLength(12);

    // ═════════════════════════════════════════════════════════════════
    // LAYER 3: DOMAIN ANALYTICS ENGINE (Conditions 5, 6, 9, 10, 11)
    // ═════════════════════════════════════════════════════════════════
    const boundaries = computePeriodBoundaries(
      { periodPreset: INDEPENDENT_EXPECTED_LEDGER.periodPreset },
      fixedNow
    );
    const datedKpis = computePeriodMetrics(companies, boundaries);

    // 3a. Payments received KPI
    const paymentsReceivedKpi = datedKpis.find((k) => k.id === "payments_received")!;
    expect(paymentsReceivedKpi.currentValue).toBe(
      INDEPENDENT_EXPECTED_LEDGER.payments.uniqueCompanyCount
    );
    expect(paymentsReceivedKpi.companyIds.sort()).toEqual(
      INDEPENDENT_EXPECTED_LEDGER.payments.paidCompanyIds.sort()
    );

    // 3b. Payment amount KPI (Multi-currency & quality)
    const paymentAmountKpi = datedKpis.find((k) => k.id === "payment_amount")!;
    expect(paymentAmountKpi.isMultiCurrency).toBe(
      INDEPENDENT_EXPECTED_LEDGER.payments.isMultiCurrency
    );
    expect(paymentAmountKpi.currentValue).toBe(
      INDEPENDENT_EXPECTED_LEDGER.payments.aggregateCurrentValue
    );

    // RUB ledger check
    expect(paymentAmountKpi.currencyBreakdown?.current.RUB).toBe(
      INDEPENDENT_EXPECTED_LEDGER.payments.byCurrency.RUB.knownAmount
    );
    expect(paymentAmountKpi.currencyBreakdownQuality?.current.RUB).toBe(
      INDEPENDENT_EXPECTED_LEDGER.payments.byCurrency.RUB.quality
    );

    // USD ledger check (Valid zero preserved!)
    expect(paymentAmountKpi.currencyBreakdown?.current.USD).toBe(
      INDEPENDENT_EXPECTED_LEDGER.payments.byCurrency.USD.knownAmount
    );
    expect(paymentAmountKpi.currencyBreakdownQuality?.current.USD).toBe(
      INDEPENDENT_EXPECTED_LEDGER.payments.byCurrency.USD.quality
    );

    // EUR ledger check
    expect(paymentAmountKpi.currencyBreakdown?.current.EUR).toBe(
      INDEPENDENT_EXPECTED_LEDGER.payments.byCurrency.EUR.knownAmount
    );
    expect(paymentAmountKpi.currencyBreakdownQuality?.current.EUR).toBe(
      INDEPENDENT_EXPECTED_LEDGER.payments.byCurrency.EUR.quality
    );

    // 3c. Bottlenecks engine
    const bottlenecks = computeBottlenecks(companies, fixedNow);

    // Condition 9: D109 is NOT stalled (last activity was yesterday)
    const b109 = bottlenecks.find((b) => b.dealId === "D109");
    expect(b109).toBeUndefined();

    // Condition 10: D110 is stalled deal without activity data
    const b110 = bottlenecks.find((b) => b.dealId === "D110")!;
    expect(b110).toBeDefined();
    expect(b110.daysWaiting).toBe(
      INDEPENDENT_EXPECTED_LEDGER.bottlenecks.stalledDeals[0].daysWaiting
    );
    expect(b110.issueLabel).toBe(
      INDEPENDENT_EXPECTED_LEDGER.bottlenecks.stalledDeals[0].issueLabel
    );
    expect(b110.nextAction).toBeUndefined();

    // Condition 11: COMP_11 has sample success without shipment date
    // Must NOT fall back to company creation date!
    const bComp11 = bottlenecks.find((b) => b.companyId === "COMP_11")!;
    expect(bComp11).toBeDefined();
    expect(bComp11.type).toBe("sample_success_no_deal");
    expect(bComp11.daysWaiting).toBe(
      INDEPENDENT_EXPECTED_LEDGER.bottlenecks.sampleSuccessNoDeal.daysWaiting
    );
    expect(bComp11.relevantDate).toBe(
      INDEPENDENT_EXPECTED_LEDGER.bottlenecks.sampleSuccessNoDeal.relevantDate
    );

    // 3d. Manager scorecard
    const scorecard = computeManagerScorecard(companies, boundaries, bottlenecks, userNames);
    const mgr1 = scorecard.find((m) => m.responsibleId === "1")!;
    const mgr2 = scorecard.find((m) => m.responsibleId === "2")!;

    expect(mgr1.paymentAmountsByCurrency).toEqual(
      INDEPENDENT_EXPECTED_LEDGER.managers["1"].paymentAmountsByCurrency
    );
    expect(mgr1.paymentAmountsQualityByCurrency).toEqual(
      INDEPENDENT_EXPECTED_LEDGER.managers["1"].paymentAmountsQualityByCurrency
    );
    expect(mgr1.bottlenecksCount).toBe(
      INDEPENDENT_EXPECTED_LEDGER.managers["1"].bottlenecksCount
    );

    expect(mgr2.paymentAmountsByCurrency).toEqual(
      INDEPENDENT_EXPECTED_LEDGER.managers["2"].paymentAmountsByCurrency
    );
    expect(mgr2.paymentAmountsQualityByCurrency).toEqual(
      INDEPENDENT_EXPECTED_LEDGER.managers["2"].paymentAmountsQualityByCurrency
    );
    expect(mgr2.bottlenecksCount).toBe(
      INDEPENDENT_EXPECTED_LEDGER.managers["2"].bottlenecksCount
    );

    // ═════════════════════════════════════════════════════════════════
    // LAYER 4: EXCEL BINARY ROUND-TRIP SERIALIZATION & RELOAD
    // ═════════════════════════════════════════════════════════════════
    const workbook = await createCommercialFunnelWorkbook({
      companies,
      deals,
      filters: { periodPreset: INDEPENDENT_EXPECTED_LEDGER.periodPreset },
      userNames,
      now: fixedNow,
    });

    const buffer = await workbook.xlsx.writeBuffer();
    expect(buffer.byteLength).toBeGreaterThan(1000);

    const reloaded = new ExcelJS.Workbook();
    await reloaded.xlsx.load(buffer);

    // Sheet 1: Executive Summary
    const summarySheet = reloaded.getWorksheet("Executive Summary")!;
    let rubKpiRow: ExcelJS.Row | undefined;
    let usdKpiRow: ExcelJS.Row | undefined;
    let eurKpiRow: ExcelJS.Row | undefined;

    summarySheet.eachRow((r) => {
      const label = String(r.getCell(1).value || "");
      if (label.includes("Сумма сделок с полученной оплатой") && label.includes("RUB")) rubKpiRow = r;
      if (label.includes("Сумма сделок с полученной оплатой") && label.includes("USD")) usdKpiRow = r;
      if (label.includes("Сумма сделок с полученной оплатой") && label.includes("EUR")) eurKpiRow = r;
    });

    // Verify Executive Summary matches expected ledger
    expect(rubKpiRow).toBeDefined();
    // Incomplete status visibly disclosed in row label
    expect(String(rubKpiRow!.getCell(1).value)).toContain("(неполные данные)");
    expect(rubKpiRow!.getCell(2).value).toBe(
      INDEPENDENT_EXPECTED_LEDGER.excel.executiveSummary.rubCurrentAmount
    );

    expect(usdKpiRow).toBeDefined();
    // Valid zero is native numeric 0
    expect(usdKpiRow!.getCell(2).value).toBe(
      INDEPENDENT_EXPECTED_LEDGER.excel.executiveSummary.usdCurrentAmount
    );

    expect(eurKpiRow).toBeDefined();
    expect(eurKpiRow!.getCell(2).value).toBe(
      INDEPENDENT_EXPECTED_LEDGER.excel.executiveSummary.eurCurrentAmount
    );

    // Sheet 4: Managers
    const managersSheet = reloaded.getWorksheet("Managers")!;
    let mgr1Row: ExcelJS.Row | undefined;
    let mgr2Row: ExcelJS.Row | undefined;

    managersSheet.eachRow((r, num) => {
      if (num === 1) return;
      const name = String(r.getCell(1).value || "");
      if (name.includes("Алексей Иванов")) mgr1Row = r;
      if (name.includes("Мария Смирнова")) mgr2Row = r;
    });

    expect(mgr1Row).toBeDefined();
    let mgrHeaderRow: ExcelJS.Row | undefined;
    managersSheet.eachRow((r) => {
      r.eachCell((cell) => {
        if (String(cell.value || "").trim() === "Менеджер") {
          mgrHeaderRow = r;
        }
      });
    });
    expect(mgrHeaderRow).toBeDefined();

    let rubColIdx = -1;
    let usdColIdx = -1;
    let eurColIdx = -1;
    mgrHeaderRow!.eachCell((cell, colNumber) => {
      const v = String(cell.value || "");
      if (v.includes("RUB")) rubColIdx = colNumber;
      if (v.includes("USD")) usdColIdx = colNumber;
      if (v.includes("EUR")) eurColIdx = colNumber;
    });

    expect(rubColIdx).toBeGreaterThan(0);
    expect(usdColIdx).toBeGreaterThan(0);
    expect(eurColIdx).toBeGreaterThan(0);

    // Manager 1 RUB amount
    expect(mgr1Row!.getCell(rubColIdx).value).toBe(
      INDEPENDENT_EXPECTED_LEDGER.excel.managersSheet.mgr1RubCell
    );
    // Manager 1 RUB cell note documents incomplete data
    expect(mgr1Row!.getCell(rubColIdx).note).toBeDefined();

    // Manager 1 EUR amount
    expect(mgr1Row!.getCell(eurColIdx).value).toBe(
      INDEPENDENT_EXPECTED_LEDGER.excel.managersSheet.mgr1EurCell
    );

    // Manager 2 USD amount is native numeric 0
    expect(mgr2Row).toBeDefined();
    expect(mgr2Row!.getCell(usdColIdx).value).toBe(
      INDEPENDENT_EXPECTED_LEDGER.excel.managersSheet.mgr2UsdCell
    );

    // Sheet 5: Bottlenecks
    const bottlenecksSheet = reloaded.getWorksheet("Bottlenecks")!;
    let comp11Row: ExcelJS.Row | undefined;
    let d110Row: ExcelJS.Row | undefined;

    bottlenecksSheet.eachRow((r, num) => {
      if (num === 1) return;
      const compTitle = String(r.getCell(1).value || "");
      if (compTitle.includes("Компания 11")) comp11Row = r;
      if (compTitle.includes("Компания 10")) d110Row = r;
    });

    expect(comp11Row).toBeDefined();
    // Days waiting for COMP_11 (missing shipment date) MUST be "—", never numeric 0!
    expect(comp11Row!.getCell(6).value).toBe(
      INDEPENDENT_EXPECTED_LEDGER.excel.bottlenecksSheet.comp11DaysWaitingDisplay
    );

    expect(d110Row).toBeDefined();
    expect(d110Row!.getCell(6).value).toBe(
      INDEPENDENT_EXPECTED_LEDGER.excel.bottlenecksSheet.d110DaysWaitingDisplay
    );
  });
});
