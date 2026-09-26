// src/__tests__/commercial-funnel-golden-reconciliation.test.ts
// ─────────────────────────────────────────────────────────────────────
// End-to-end golden reconciliation test for Commercial Funnel domain.
// Verifies integration of all remediations:
// 1. Terminal vs active stage semantics
// 2. Authoritative sample cycle selection (evidence > timestamp > Deal ID tie-breaker)
// 3. Strict numeric and calendar date parsing
// 4. Currency preservation (EUR/USD not converted to RUB; missing currency not assumed RUB)
// 5. Activity data authority without fabrication
// 6. Complete independent ledger reconciliation across stages, WIP, currencies, managers
// 7. Binary ExcelJS buffer reload with cell-by-cell inspection
// ─────────────────────────────────────────────────────────────────────

import { describe, it, expect } from "vitest";
import ExcelJS from "exceljs";
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
  DEAL_SAMPLE_SENT_DATE_FIELD_ID,
  COMPANY_SAMPLES_FIELD_ID,
} from "../lib/crm-constants";
import { isTerminalStage, isDealActiveStage } from "../lib/commercial-funnel/stage-utils";
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
    // 8. Company C5 Deal 108: active testing cycle with sent date
    {
      ID: "108",
      TITLE: "Deal 108 - Active Testing Cycle",
      COMPANY_ID: "C5",
      STAGE_ID: "EXECUTING",
      OPPORTUNITY: "80000",
      CURRENCY_ID: "RUB",
      DATE_CREATE: "2026-02-20",
      [DEAL_SAMPLE_TESTING_FIELD_ID]: ["Тестирование успешно"],
      [DEAL_SAMPLE_SENT_DATE_FIELD_ID]: "2026-02-22",
      ASSIGNED_BY_ID: "U1",
    },
    // 9. Company C5 Deal 109: older transfer cycle with sent date
    {
      ID: "109",
      TITLE: "Deal 109 - Older Transfer Cycle",
      COMPANY_ID: "C5",
      STAGE_ID: "NEW",
      OPPORTUNITY: "40000",
      CURRENCY_ID: "RUB",
      DATE_CREATE: "2026-01-10",
      [DEAL_SAMPLE_TRANSFER_FIELD_ID]: "Передано на склад",
      [DEAL_SAMPLE_SENT_DATE_FIELD_ID]: "2026-01-12",
      ASSIGNED_BY_ID: "U1",
    },
    // 10. Deal 110: Prepayment invoice stage
    {
      ID: "110",
      TITLE: "Deal 110 - Invoicing",
      COMPANY_ID: "C6",
      STAGE_ID: "PREPAYMENT_INVOICE",
      OPPORTUNITY: "120000",
      CURRENCY_ID: "RUB",
      DATE_CREATE: "2026-03-12",
      ASSIGNED_BY_ID: "U3",
    },
    // 11. Deal 111: Terminal Won with real zero opportunity in USD
    {
      ID: "111",
      TITLE: "Deal 111 - Zero Dollar Won",
      COMPANY_ID: "C7",
      STAGE_ID: "WON",
      OPPORTUNITY: "0",
      CURRENCY_ID: "USD",
      DATE_CREATE: "2026-02-10",
      CLOSEDATE: "2026-03-15",
      ASSIGNED_BY_ID: "U3",
    },
    // 12. Deal 112: Missing opportunity (blank)
    {
      ID: "112",
      TITLE: "Deal 112 - Unspecified Amount",
      COMPANY_ID: "C8",
      STAGE_ID: "NEW",
      OPPORTUNITY: "",
      CURRENCY_ID: "RUB",
      DATE_CREATE: "2026-03-18",
      ASSIGNED_BY_ID: "U3",
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
    { ID: "C6", TITLE: "Zeta Trading LLC", ASSIGNED_BY_ID: "U3", DATE_CREATE: "2026-01-20" },
    { ID: "C7", TITLE: "Omega Zero Corp", ASSIGNED_BY_ID: "U3", DATE_CREATE: "2026-02-05" },
    { ID: "C8", TITLE: "Theta Unknown Corp", ASSIGNED_BY_ID: "U3", DATE_CREATE: "2026-02-15" },
  ];

  const userNames = {
    U1: "Иван Иванов",
    U2: "Петр Петров",
    U3: "Анна Сидорова",
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

    // Deal 107: Junk opportunity must remain null/INVALID (never coerced to 0)
    const d107 = deals.find((d) => d.id === "107")!;
    expect(d107.opportunity).toBeNull();
    expect(d107.opportunityQuality).toBe("INVALID");
    expect(d107.currencyId).toBe("USD");

    // Deal 111: Real zero is 0 and VALID
    const d111 = deals.find((d) => d.id === "111")!;
    expect(d111.opportunity).toBe(0);
    expect(d111.opportunityQuality).toBe("VALID");

    // Deal 112: Blank is null and UNKNOWN
    const d112 = deals.find((d) => d.id === "112")!;
    expect(d112.opportunity).toBeNull();
    expect(d112.opportunityQuality).toBe("UNKNOWN");
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
    expect(c5.sampleShipmentDate).toBe("2026-02-22");
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
    expect(b101.issueLabel).toBe("Старая активная сделка (83 дн., данные активности недоступны)");
    expect(b101.nextAction).toBeUndefined();

    // Stalled Deal 102 (known empty activity) truthfully states '(нет след. шага)'
    const b102 = bottlenecks.find((b) => b.dealId === "102")!;
    expect(b102).toBeDefined();
    expect(b102.issueLabel).toBe("Сделка без движения (83 дн., нет след. шага)");
    expect(b102.nextAction).toBe("Запланировать звонок / встречу с клиентом");

    // Terminal deals (103 Won, 104 Lost, 111 Won) must NEVER appear as stalled deal bottlenecks
    expect(bottlenecks.some((b) => b.dealId === "103")).toBe(false);
    expect(bottlenecks.some((b) => b.dealId === "104")).toBe(false);
    expect(bottlenecks.some((b) => b.dealId === "111")).toBe(false);
  });

  it("TC-GOLDEN-04: computes KPIs and manager scorecards consistently", () => {
    const deals = normalizeDeals(goldenRawDeals, { userNames });
    const companies = normalizeCompanies(goldenRawCompanies, deals, {
      userNames,
      now: fixedNow,
    });

    const filters: CommercialFilters = { periodPreset: "90days" };
    const boundaries = computePeriodBoundaries(filters, fixedNow);

    // 1. Exact Period KPI ledger
    const datedKpis = computePeriodMetrics(companies, boundaries);
    expect(datedKpis).toHaveLength(6);

    const newCompKpi = datedKpis.find((k) => k.id === "new_companies")!;
    expect(newCompKpi.currentValue).toBe(8);
    expect(newCompKpi.companyIds.sort()).toEqual(["C1", "C2", "C3", "C4", "C5", "C6", "C7", "C8"]);

    const samplesKpi = datedKpis.find((k) => k.id === "samples_sent")!;
    expect(samplesKpi.currentValue).toBe(1);
    expect(samplesKpi.companyIds).toEqual(["C5"]);

    const dealsCreatedKpi = datedKpis.find((k) => k.id === "deals_created")!;
    // C4 deal 107 had invalid date 2026-02-31, so C4 is excluded from deals_created in period
    expect(dealsCreatedKpi.currentValue).toBe(7);
    expect(dealsCreatedKpi.companyIds.sort()).toEqual(["C1", "C2", "C3", "C5", "C6", "C7", "C8"]);

    const paymentsReceivedKpi = datedKpis.find((k) => k.id === "payments_received")!;
    expect(paymentsReceivedKpi.currentValue).toBe(0);
    expect(paymentsReceivedKpi.companyIds).toEqual([]);

    const paymentAmountKpi = datedKpis.find((k) => k.id === "payment_amount")!;
    expect(paymentAmountKpi.currentValue).toBe(0);
    expect(paymentAmountKpi.amountQuality).toBe("COMPLETE");
    expect(paymentAmountKpi.currencyBreakdown?.current).toEqual({});

    // 2. Exact WIP ledger
    const wipKpis = computeWipMetrics(companies);
    const unclassWip = wipKpis.find((w) => w.id === "Не классифицировано")!;
    expect(unclassWip.companyCount).toBe(1);
    expect(unclassWip.companyIds).toEqual(["C5"]);

    // 3. Exact Sample Register ledger
    const sampleRegister = buildSampleRegister(companies, fixedNow);
    expect(sampleRegister).toHaveLength(2);
    // Deterministically sorted by deal ID: 108, then 109
    expect(sampleRegister[0].dealId).toBe("108");
    expect(sampleRegister[0].shipmentDate).toBe("2026-02-22");
    expect(sampleRegister[0].status).toBe("Тестирование успешно");
    expect(sampleRegister[0].nextAction).toBeUndefined();

    expect(sampleRegister[1].dealId).toBe("109");
    expect(sampleRegister[1].shipmentDate).toBe("2026-01-12");
    expect(sampleRegister[1].status).toBe("Передано на склад");
    expect(sampleRegister[1].nextAction).toBeUndefined();

    // 4. Exact Bottlenecks ledger
    const bottlenecks = computeBottlenecks(companies, fixedNow);
    expect(bottlenecks).toHaveLength(4);
    const b101 = bottlenecks.find((b) => b.dealId === "101")!;
    expect(b101.daysWaiting).toBe(83);
    expect(b101.nextAction).toBeUndefined();

    const b102 = bottlenecks.find((b) => b.dealId === "102")!;
    expect(b102.daysWaiting).toBe(83);
    expect(b102.nextAction).toBe("Запланировать звонок / встречу с клиентом");

    const scorecard = computeManagerScorecard(companies, boundaries, bottlenecks, userNames);
    expect(scorecard).toHaveLength(3);
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

  it("TC-GOLDEN-06: reconciles complete independent ledger (stages, WIP vs terminal, currencies, bottlenecks)", () => {
    const deals = normalizeDeals(goldenRawDeals, { userNames });
    const companies = normalizeCompanies(goldenRawCompanies, deals, {
      userNames,
      now: fixedNow,
    });

    // 1. Stage population assertion
    const newDeals = deals.filter((d) => d.stageId === "NEW");
    expect(newDeals.map((d) => d.id).sort()).toEqual(["107", "109", "112"]);

    const prepDeals = deals.filter((d) => d.stageId === "PREPARATION");
    expect(prepDeals.map((d) => d.id).sort()).toEqual(["105", "106"]);

    const execDeals = deals.filter((d) => d.stageId === "EXECUTING");
    expect(execDeals.map((d) => d.id).sort()).toEqual(["101", "102", "108"]);

    const invoiceDeals = deals.filter((d) => d.stageId === "PREPAYMENT_INVOICE");
    expect(invoiceDeals.map((d) => d.id).sort()).toEqual(["110"]);

    const wonDeals = deals.filter((d) => d.stageId === "WON");
    expect(wonDeals.map((d) => d.id).sort()).toEqual(["103", "111"]);

    const lostDeals = deals.filter((d) => d.stageId === "LOSE" || d.stageId === "APOLOGY");
    expect(lostDeals.map((d) => d.id).sort()).toEqual(["104"]);

    // Total: 12 deals across all 6 stages
    expect(deals).toHaveLength(12);

    // 2. Active WIP vs Terminal deals
    const terminalDeals = deals.filter((d) => isTerminalStage(d.stageId));
    expect(terminalDeals.map((d) => d.id).sort()).toEqual(["103", "104", "111"]);

    const activeWipDeals = deals.filter((d) => isDealActiveStage(d.stageId));
    expect(activeWipDeals.map((d) => d.id).sort()).toEqual([
      "101", "102", "105", "106", "107", "108", "109", "110", "112",
    ]);

    // 3. Currency isolation
    expect(deals.find((d) => d.id === "105")?.currencyId).toBe("EUR");
    expect(deals.find((d) => d.id === "106")?.currencyId).toBe("UNKNOWN");
    expect(deals.find((d) => d.id === "107")?.currencyId).toBe("USD");
    expect(deals.find((d) => d.id === "111")?.currencyId).toBe("USD");

    // 4. Exact company primary deal opportunity & quality mappings
    const c4 = companies.find((c) => c.id === "C4")!;
    expect(c4.primaryDealOpportunity).toBeNull();
    expect(c4.primaryDealOpportunityQuality).toBe("INVALID");

    const c7 = companies.find((c) => c.id === "C7")!;
    expect(c7.primaryDealOpportunity).toBe(0);
    expect(c7.primaryDealOpportunityQuality).toBe("VALID");

    const c8 = companies.find((c) => c.id === "C8")!;
    expect(c8.primaryDealOpportunity).toBeNull();
    expect(c8.primaryDealOpportunityQuality).toBe("UNKNOWN");

    // 5. Manager scorecard ledger
    const filters: CommercialFilters = { periodPreset: "90days" };
    const boundaries = computePeriodBoundaries(filters, fixedNow);
    const bottlenecks = computeBottlenecks(companies, fixedNow);
    const scorecard = computeManagerScorecard(companies, boundaries, bottlenecks, userNames);

    const m1 = scorecard.find((s) => s.responsibleId === "U1")!;
    expect(m1).toBeDefined();
    expect(m1.name).toBe("Иван Иванов");
    expect(m1.dealsCreated).toBe(6);
    expect(m1.bottlenecksCount).toBe(4);

    const m2 = scorecard.find((s) => s.responsibleId === "U2")!;
    expect(m2).toBeDefined();
    expect(m2.name).toBe("Петр Петров");
    expect(m2.dealsCreated).toBe(2);
    expect(m2.bottlenecksCount).toBe(0);

    const m3 = scorecard.find((s) => s.responsibleId === "U3")!;
    expect(m3).toBeDefined();
    expect(m3.name).toBe("Анна Сидорова");
    expect(m3.dealsCreated).toBe(3);
    expect(m3.bottlenecksCount).toBe(0);

    // Exact bottleneck deals assertion
    expect(bottlenecks).toHaveLength(4);
    expect(bottlenecks.map((b) => b.dealId).sort()).toEqual(["101", "102", "108", "109"]);
  });

  it("TC-GOLDEN-07: verifies binary ExcelJS reload with cell-by-cell inspection of golden values, invalid money formatting, real zero, and date types", async () => {
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

    const buffer = await workbook.xlsx.writeBuffer();

    // Reload workbook from binary buffer to test strict round-trip
    const reloaded = new ExcelJS.Workbook();
    await reloaded.xlsx.load(buffer);

    // 1. Assert all 5 worksheets exist
    expect(reloaded.getWorksheet("Executive Summary")).toBeDefined();
    expect(reloaded.getWorksheet("Companies")).toBeDefined();
    expect(reloaded.getWorksheet("Samples")).toBeDefined();
    expect(reloaded.getWorksheet("Managers")).toBeDefined();
    expect(reloaded.getWorksheet("Bottlenecks")).toBeDefined();

    // 2. Companies sheet inspection
    const compSheet = reloaded.getWorksheet("Companies")!;
    let headerRowNum = -1;
    compSheet.eachRow((row, rowNumber) => {
      if (row.getCell(1).value === "ID компании") {
        headerRowNum = rowNumber;
      }
    });
    expect(headerRowNum).toBeGreaterThan(0);

    const headerRow = compSheet.getRow(headerRowNum);
    expect(headerRow.getCell(1).value).toBe("ID компании");
    expect(headerRow.getCell(2).value).toBe("Название компании");
    expect(headerRow.getCell(8).value).toBe("Статус образцов");
    expect(headerRow.getCell(10).value).toBe("Дата передачи / отправки");
    expect(headerRow.getCell(14).value).toBe("Сумма");

    let c1Row: ExcelJS.Row | undefined;
    let c4Row: ExcelJS.Row | undefined;
    let c5Row: ExcelJS.Row | undefined;
    let c7Row: ExcelJS.Row | undefined;
    let c8Row: ExcelJS.Row | undefined;

    compSheet.eachRow((row, rowNumber) => {
      if (rowNumber <= headerRowNum) return;
      const idVal = row.getCell(1).value;
      if (idVal === "C1") c1Row = row;
      if (idVal === "C4") c4Row = row;
      if (idVal === "C5") c5Row = row;
      if (idVal === "C7") c7Row = row;
      if (idVal === "C8") c8Row = row;
    });

    // C1: valid opportunity 200,000 (number)
    expect(c1Row).toBeDefined();
    expect(c1Row!.getCell(14).value).toBe(200000);

    // C4: invalid amount must be exact text "Неверная сумма", NOT 0, NOT "0 ₽", NOT blank
    expect(c4Row).toBeDefined();
    expect(c4Row!.getCell(2).value).toBe("Delta Testing Corp");
    expect(c4Row!.getCell(14).value).toBe("Неверная сумма");

    // C7: real zero must be number 0
    expect(c7Row).toBeDefined();
    expect(c7Row!.getCell(2).value).toBe("Omega Zero Corp");
    expect(c7Row!.getCell(14).value).toBe(0);

    // C8: blank opportunity is "—"
    expect(c8Row).toBeDefined();
    expect(c8Row!.getCell(14).value).toBe("—");

    // C5: authoritative sample cycle and date cell
    expect(c5Row).toBeDefined();
    expect(c5Row!.getCell(2).value).toBe("Epsilon Samples Group");
    expect(c5Row!.getCell(8).value).toBe("Тестирование успешно, Передано на склад, Образец запрошен");
    expect(c5Row!.getCell(9).value).toBe("DEAL");
    const sampleDateVal = c5Row!.getCell(10).value;
    expect(sampleDateVal).toBeInstanceOf(Date);
    expect((sampleDateVal as Date).toISOString()).toContain("2026-02-22");

    // 3. Bottlenecks sheet inspection
    const botSheet = reloaded.getWorksheet("Bottlenecks")!;
    let botHeaderRow = -1;
    botSheet.eachRow((row, rowNumber) => {
      if (row.getCell(1).value === "Компания") {
        botHeaderRow = rowNumber;
      }
    });
    expect(botHeaderRow).toBeGreaterThan(0);
  });
});
