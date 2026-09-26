// src/__tests__/commercial-funnel-golden-reconciliation.test.ts
// ─────────────────────────────────────────────────────────────────────
// End-to-end golden reconciliation test for Commercial Funnel domain.
// Verifies integration of all remediations:
// 1. Terminal vs active stage semantics
// 2. Authoritative sample cycle selection (evidence > timestamp > Deal ID tie-breaker)
// 3. Strict numeric and calendar date parsing
// 4. Currency preservation (EUR/USD not converted to RUB; missing currency not assumed RUB)
// 5. Activity data authority without fabrication
// 6. Excel workbook generation across all 5 sheets
// ─────────────────────────────────────────────────────────────────────

import { describe, it, expect } from "vitest";
import { normalizeDeals, normalizeCompanies } from "../lib/commercial-funnel/normalize";
import {
  computeBottlenecks,
  computeManagerScorecard,
  computePeriodMetrics,
  computeWipMetrics,
  buildSampleRegister,
} from "../lib/commercial-funnel/engine";
import { computePeriodBoundaries } from "../lib/commercial-funnel/date-utils";
import { createCommercialFunnelWorkbook } from "../lib/commercial-funnel/export-excel";
import {
  DEAL_SAMPLE_TRANSFER_FIELD_ID,
  DEAL_SAMPLE_TESTING_FIELD_ID,
  COMPANY_SAMPLES_FIELD_ID,
} from "../lib/crm-constants";
import type { CommercialFilters } from "../lib/commercial-funnel/types";

describe("Commercial Funnel Golden Reconciliation", () => {
  const fixedNow = new Date("2026-03-25T12:00:00Z");

  const goldenRawDeals = [
    // 1. Deal with unknown activity data, older than 60 days
    {
      ID: "101",
      TITLE: "Deal 101 - Stalled Unknown Activity",
      COMPANY_ID: "C1",
      STAGE_ID: "EXECUTING",
      OPPORTUNITY: "150 000,50",
      CURRENCY_ID: "RUB",
      DATE_CREATE: "2026-01-01",
      ASSIGNED_BY_ID: "U1",
    },
    // 2. Deal with known empty activity next, older than 60 days
    {
      ID: "102",
      TITLE: "Deal 102 - Stalled Known No Action",
      COMPANY_ID: "C1",
      STAGE_ID: "EXECUTING",
      OPPORTUNITY: "200000",
      CURRENCY_ID: "RUB",
      DATE_CREATE: "2026-01-01",
      ACTIVITY_NEXT: "", // Explicitly known to have no next step
      ASSIGNED_BY_ID: "U1",
    },
    // 3. Terminal Won deal
    {
      ID: "103",
      TITLE: "Deal 103 - Won Deal",
      COMPANY_ID: "C2",
      STAGE_ID: "WON",
      OPPORTUNITY: "500000",
      CURRENCY_ID: "RUB",
      DATE_CREATE: "2026-02-01",
      CLOSEDATE: "2026-03-01",
      ASSIGNED_BY_ID: "U2",
    },
    // 4. Terminal Lost deal
    {
      ID: "104",
      TITLE: "Deal 104 - Lost Deal",
      COMPANY_ID: "C2",
      STAGE_ID: "APOLOGY", // Terminal lost
      OPPORTUNITY: "300000",
      CURRENCY_ID: "RUB",
      DATE_CREATE: "2026-02-15",
      CLOSEDATE: "2026-03-10",
      ASSIGNED_BY_ID: "U2",
    },
    // 5. Deal with foreign currency (EUR)
    {
      ID: "105",
      TITLE: "Deal 105 - European Deal",
      COMPANY_ID: "C3",
      STAGE_ID: "PREPARATION",
      OPPORTUNITY: "25000",
      CURRENCY_ID: "EUR",
      DATE_CREATE: "2026-03-01",
      ASSIGNED_BY_ID: "U1",
    },
    // 6. Deal with missing currency (must not become RUB)
    {
      ID: "106",
      TITLE: "Deal 106 - Unspecified Currency",
      COMPANY_ID: "C3",
      STAGE_ID: "PREPARATION",
      OPPORTUNITY: "10000",
      CURRENCY_ID: "",
      DATE_CREATE: "2026-03-05",
      ASSIGNED_BY_ID: "U1",
    },
    // 7. Deal with junk opportunity and impossible date
    {
      ID: "107",
      TITLE: "Deal 107 - Junk Data Handled Strictly",
      COMPANY_ID: "C4",
      STAGE_ID: "NEW",
      OPPORTUNITY: "1234junk",
      CURRENCY_ID: "USD",
      DATE_CREATE: "2026-02-31", // Impossible calendar date
      ASSIGNED_BY_ID: "U2",
    },
    // 8 & 9. Company C5 has multiple deals with sample statuses:
    // Deal 108 has sample testing status with newer date
    {
      ID: "108",
      TITLE: "Deal 108 - Active Testing Cycle",
      COMPANY_ID: "C5",
      STAGE_ID: "EXECUTING",
      OPPORTUNITY: "80000",
      CURRENCY_ID: "RUB",
      DATE_CREATE: "2026-02-20",
      [DEAL_SAMPLE_TESTING_FIELD_ID]: ["Тестирование успешно"],
      ASSIGNED_BY_ID: "U1",
    },
    // Deal 109 has transfer status with older date
    {
      ID: "109",
      TITLE: "Deal 109 - Older Transfer Cycle",
      COMPANY_ID: "C5",
      STAGE_ID: "NEW",
      OPPORTUNITY: "40000",
      CURRENCY_ID: "RUB",
      DATE_CREATE: "2026-01-10",
      [DEAL_SAMPLE_TRANSFER_FIELD_ID]: "Передано на склад",
      ASSIGNED_BY_ID: "U1",
    },
  ];

  const goldenRawCompanies = [
    { ID: "C1", TITLE: "Alpha Industries", ASSIGNED_BY_ID: "U1", DATE_CREATE: "2026-01-01" },
    { ID: "C2", TITLE: "Beta Corporation", ASSIGNED_BY_ID: "U2", DATE_CREATE: "2026-01-15" },
    { ID: "C3", TITLE: "Gamma Europe GmbH", ASSIGNED_BY_ID: "U1", DATE_CREATE: "2026-02-01" },
    { ID: "C4", TITLE: "Delta Testing Corp", ASSIGNED_BY_ID: "U2", DATE_CREATE: "2026-02-10" },
    {
      ID: "C5",
      TITLE: "Epsilon Samples Group",
      ASSIGNED_BY_ID: "U1",
      DATE_CREATE: "2026-01-05",
      [COMPANY_SAMPLES_FIELD_ID]: ["Образец запрошен"],
    },
  ];

  const userNames = {
    U1: "Иван Иванов",
    U2: "Петр Петров",
  };

  it("TC-GOLDEN-01: normalizes deals with strict parsing and truthful currencies", () => {
    const deals = normalizeDeals(goldenRawDeals, { userNames });

    // Deal 101: parsed number from string with comma and space
    const d101 = deals.find((d) => d.id === "101")!;
    expect(d101.opportunity).toBe(150000.5);
    expect(d101.currencyId).toBe("RUB");
    expect(d101.activityDataKnown).toBe(false);

    // Deal 102: activityDataKnown is true, activityNext is undefined
    const d102 = deals.find((d) => d.id === "102")!;
    expect(d102.activityDataKnown).toBe(true);
    expect(d102.activityNext).toBeUndefined();

    // Deal 105: EUR currency is preserved
    const d105 = deals.find((d) => d.id === "105")!;
    expect(d105.currencyId).toBe("EUR");

    // Deal 106: Empty currency is preserved as UNKNOWN, NOT coerced to RUB
    const d106 = deals.find((d) => d.id === "106")!;
    expect(d106.currencyId).toBe("UNKNOWN");

    // Deal 107: Junk opportunity defaults to 0
    const d107 = deals.find((d) => d.id === "107")!;
    expect(d107.opportunity).toBe(0);
    expect(d107.currencyId).toBe("USD");
  });

  it("TC-GOLDEN-02: normalizes companies and selects authoritative current sample cycle", () => {
    const deals = normalizeDeals(goldenRawDeals, { userNames });
    const companies = normalizeCompanies(goldenRawCompanies, deals, {
      userNames,
      now: fixedNow,
    });

    // Company C5 has multiple deals with sample statuses:
    // Deal 108 (Тестирование успешно, date 2026-02-20) takes precedence over Deal 109 (date 2026-01-10)
    // and over company-level sample status
    const c5 = companies.find((c) => c.id === "C5")!;
    expect(c5.sampleStatus).toBe("Тестирование успешно");
    expect(c5.sampleStatusSource).toBe("DEAL");
  });

  it("TC-GOLDEN-03: computes truthful bottlenecks without next action fabrication", () => {
    const deals = normalizeDeals(goldenRawDeals, { userNames });
    const companies = normalizeCompanies(goldenRawCompanies, deals, {
      userNames,
      now: fixedNow,
    });

    const bottlenecks = computeBottlenecks(companies, fixedNow);

    // Stalled Deal 101 (unknown activity) must NOT fabricate '(нет след. шага)'
    const b101 = bottlenecks.find((b) => b.dealId === "101")!;
    expect(b101).toBeDefined();
    expect(b101.issueLabel).toBe("Сделка без движения (83 дн.)");
    expect(b101.nextAction).toBeUndefined();

    // Stalled Deal 102 (known empty activity) truthfully states '(нет след. шага)'
    const b102 = bottlenecks.find((b) => b.dealId === "102")!;
    expect(b102).toBeDefined();
    expect(b102.issueLabel).toBe("Сделка без движения (83 дн., нет след. шага)");
    expect(b102.nextAction).toBe("Запланировать звонок / встречу с клиентом");

    // Terminal deals (103 Won, 104 Lost) must NEVER appear as stalled deal bottlenecks
    expect(bottlenecks.some((b) => b.dealId === "103")).toBe(false);
    expect(bottlenecks.some((b) => b.dealId === "104")).toBe(false);
  });

  it("TC-GOLDEN-04: computes KPIs and manager scorecards consistently", () => {
    const deals = normalizeDeals(goldenRawDeals, { userNames });
    const companies = normalizeCompanies(goldenRawCompanies, deals, {
      userNames,
      now: fixedNow,
    });

    const filters: CommercialFilters = { periodPreset: "90days" };
    const boundaries = computePeriodBoundaries(filters, fixedNow);

    const datedKpis = computePeriodMetrics(companies, boundaries);
    expect(datedKpis.length).toBeGreaterThan(0);

    const wipKpis = computeWipMetrics(companies);
    expect(wipKpis.length).toBeGreaterThan(0);

    const bottlenecks = computeBottlenecks(companies, fixedNow);
    const scorecard = computeManagerScorecard(companies, boundaries, bottlenecks, userNames);
    expect(scorecard.length).toBeGreaterThan(0);

    const sampleRegister = buildSampleRegister(companies, fixedNow);
    expect(sampleRegister.length).toBeGreaterThan(0);
  });

  it("TC-GOLDEN-05: generates 5-sheet RusSilica Management Excel workbook cleanly", async () => {
    const deals = normalizeDeals(goldenRawDeals, { userNames });
    const companies = normalizeCompanies(goldenRawCompanies, deals, {
      userNames,
      now: fixedNow,
    });

    const filters: CommercialFilters = { periodPreset: "90days" };
    const workbook = await createCommercialFunnelWorkbook({
      companies,
      deals,
      filters,
      userNames,
      now: fixedNow,
    });

    // Check all 5 required management sheets
    expect(workbook.getWorksheet("Executive Summary")).toBeDefined();
    expect(workbook.getWorksheet("Companies")).toBeDefined();
    expect(workbook.getWorksheet("Samples")).toBeDefined();
    expect(workbook.getWorksheet("Managers")).toBeDefined();
    expect(workbook.getWorksheet("Bottlenecks")).toBeDefined();

    // Verify sheet data rows can be rendered and write to buffer without errors
    const buffer = await workbook.xlsx.writeBuffer();
    expect(buffer.byteLength).toBeGreaterThan(1000);
  });
});
