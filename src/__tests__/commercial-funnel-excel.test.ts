// @vitest-environment node
// src/__tests__/commercial-funnel-excel.test.ts
// Unit tests for the 6-sheet Commercial Funnel Excel export.
// Contract: Executive Summary | Funnel | Segments | Sample Testing | Managers | Action Plan.

import { describe, expect, it } from "vitest";
import ExcelJS from "exceljs";
import { createCommercialFunnelWorkbook } from "@/lib/commercial-funnel/export-excel";
import { generateDemoCommercialDataset } from "@/lib/commercial-funnel/demo-data";
import { computeBottlenecks, computeManagerScorecard, computePeriodMetrics } from "@/lib/commercial-funnel/engine";
import { computeActionPlan, computeFunnelView } from "@/lib/commercial-funnel/analytics";
import { computePeriodBoundaries } from "@/lib/commercial-funnel/date-utils";
import type { CommercialCompany, CommercialDeal, CommercialFilters } from "@/lib/commercial-funnel/types";

describe("Commercial Funnel — Excel Export (6-sheet management workbook)", () => {
  const demoData = generateDemoCommercialDataset();
  const filters: CommercialFilters = {
    periodPreset: "30days",
    responsibleId: "all",
    productType: "all",
    industry: "all",
    direction: "all",
    region: "all",
  };
  const fixedNow = new Date(2026, 8, 24, 12, 0, 0);

  it("T12: creates exactly the 6 required management sheets in order", async () => {
    const workbook = await createCommercialFunnelWorkbook({
      companies: demoData.companies,
      deals: demoData.deals,
      filters,
      userNames: demoData.userNames,
      now: fixedNow,
    });

    const sheetNames = workbook.worksheets.map((s) => s.name);
    expect(sheetNames).toEqual([
      "Executive Summary",
      "Funnel",
      "Segments",
      "Sample Testing",
      "Managers",
      "Action Plan",
    ]);
  });

  it("T13: old management sheets (Companies/Samples/Bottlenecks) do not exist", async () => {
    const workbook = await createCommercialFunnelWorkbook({
      companies: demoData.companies,
      deals: demoData.deals,
      filters,
      userNames: demoData.userNames,
      now: fixedNow,
    });

    expect(workbook.getWorksheet("Companies")).toBeUndefined();
    expect(workbook.getWorksheet("Samples")).toBeUndefined();
    expect(workbook.getWorksheet("Bottlenecks")).toBeUndefined();
  });

  it("reconciles metric counts between engine and Excel sheets", async () => {
    const workbook = await createCommercialFunnelWorkbook({
      companies: demoData.companies,
      deals: demoData.deals,
      filters,
      userNames: demoData.userNames,
      now: fixedNow,
    });

    const actionPlanSheet = workbook.getWorksheet("Action Plan")!;
    const engineBottlenecks = computeBottlenecks(demoData.companies, fixedNow);
    const bounds = computePeriodBoundaries(filters, fixedNow);
    const engineActionPlan = computeActionPlan(demoData.companies, fixedNow);
    expect(engineActionPlan.length).toBe(engineBottlenecks.length);
    // Rows 1-5 operational header, row 6 table header, data rows from 7
    expect(actionPlanSheet.rowCount - 6).toBe(engineActionPlan.length);

    const engineManagers = computeManagerScorecard(
      demoData.companies,
      bounds,
      engineBottlenecks,
      demoData.userNames
    );
    const managersSheet = workbook.getWorksheet("Managers")!;
    expect(managersSheet.rowCount - 6).toBe(engineManagers.length);

    // Funnel sheet: 8 sample/testing stages + continuation row + spacer + commercial rows
    const bounds2 = computePeriodBoundaries(filters, fixedNow);
    const engineFunnel = computeFunnelView(demoData.companies, bounds2);
    const funnelSheet = workbook.getWorksheet("Funnel")!;
    let stageRows = 0;
    funnelSheet.eachRow((row, rowNumber) => {
      if (rowNumber <= 6) return;
      const section = String(row.getCell(1).value || "");
      if (section === "Образцы и испытания") stageRows++;
    });
    expect(stageRows).toBe(engineFunnel.sampleTestingStages.length);
  });

  it("produces valid binary xlsx buffer without error", async () => {
    const workbook = await createCommercialFunnelWorkbook({
      companies: demoData.companies,
      deals: demoData.deals,
      filters,
      userNames: demoData.userNames,
      now: fixedNow,
    });

    const buffer = await workbook.xlsx.writeBuffer();
    expect(buffer).toBeDefined();
    expect(buffer.byteLength).toBeGreaterThan(1000);
  });

  it("T16/T25: Sample Testing sheet keeps active testing rows with old send dates; dates are native Excel dates", async () => {
    const testingCompany: CommercialCompany = {
      id: "c-old-test",
      title: "Компания Старое Испытание",
      responsibleId: "u1",
      responsibleName: "Менеджер Тестовый",
      dateCreate: "2026-05-01",
      direction: [],
      productType: ["Гель"],
      sampleStatus: "На испытании",
      sampleStatusSource: "DEAL",
      sampleResponsibleId: "u1",
      sampleResponsibleName: "Менеджер Тестовый",
      sampleShipmentDate: "2026-07-01", // far outside 30-day period
      sampleAllDates: ["2026-07-01"],
      gradeGel: [],
      gradeSol: [],
      deals: [
        {
          id: "d-old-test",
          title: "Сделка Старое Испытание",
          companyId: "c-old-test",
          responsibleId: "u1",
          stageId: "EXECUTING",
          categoryId: "0",
          opportunity: 100000,
          currencyId: "RUB",
          dateCreate: "2026-06-25",
          sampleSentDate: "2026-07-01",
          sampleTransferStatus: "На испытании",
          sampleTestingStatus: ["На испытании"],
          sampleTestingStatusRaw: [],
          productType: [],
          industry: [],
          direction: [],
        },
      ],
      hasAttention: false,
      attentionReasons: [],
    };

    const workbook = await createCommercialFunnelWorkbook({
      companies: [testingCompany],
      deals: testingCompany.deals,
      filters,
      userNames: { u1: "Менеджер Тестовый" },
      now: fixedNow,
    });

    const stSheet = workbook.getWorksheet("Sample Testing")!;
    let foundOldActiveRow = false;
    stSheet.eachRow((row, rowNumber) => {
      if (rowNumber <= 6) return;
      const title = String(row.getCell(2).value || "");
      if (title === "Компания Старое Испытание") {
        foundOldActiveRow = true;
        // Col 7: shipment date must be a native Date with dd.mm.yyyy.
        // HD contract: the Date carries the Europe/Moscow calendar date
        // (2026-07-01 00:00 MSK), independent of host timezone.
        const shipmentCell = row.getCell(7);
        expect(shipmentCell.value).toBeInstanceOf(Date);
        const mskParts = new Intl.DateTimeFormat("en-CA", {
          timeZone: "Europe/Moscow",
          year: "numeric",
          month: "2-digit",
          day: "2-digit",
        }).format(shipmentCell.value as Date);
        expect(mskParts).toBe("2026-07-01");
        expect(shipmentCell.numFmt).toBe("dd.mm.yyyy");
      }
    });
    expect(foundOldActiveRow).toBe(true);
  });

  it("includes full filter disclosures and truthful payment KPI label in Executive Summary", async () => {
    const customFilters: CommercialFilters = {
      periodPreset: "custom",
      customFrom: "2026-09-01",
      customTo: "2026-09-15",
      responsibleId: "user-1",
      productType: "Гель",
      industry: "Химия",
      direction: "Агрохимия",
      region: "Москва",
    };

    const workbook = await createCommercialFunnelWorkbook({
      companies: demoData.companies,
      deals: demoData.deals,
      filters: customFilters,
      userNames: { "user-1": "Иван Тестов" },
      now: fixedNow,
    });

    const summarySheet = workbook.getWorksheet("Executive Summary")!;
    const allCellTexts: string[] = [];
    summarySheet.eachRow((row) => {
      row.eachCell((cell) => {
        if (cell.value) allCellTexts.push(String(cell.value));
      });
    });

    // Timezone disclosure
    expect(allCellTexts.some((t) => t.includes("Europe/Moscow"))).toBe(true);
    // Period disclosure
    expect(allCellTexts.some((t) => t.includes("2026-09-01 — 2026-09-15"))).toBe(true);
    // Filters disclosure
    expect(allCellTexts.some((t) => t.includes("Иван Тестов"))).toBe(true);
    expect(allCellTexts.some((t) => t.includes("Гель"))).toBe(true);
    expect(allCellTexts.some((t) => t.includes("Химия"))).toBe(true);
    expect(allCellTexts.some((t) => t.includes("Агрохимия"))).toBe(true);
    expect(allCellTexts.some((t) => t.includes("Москва"))).toBe(true);

    // Truthful payment label
    expect(allCellTexts.some((t) => t.includes("Сумма сделок с полученной оплатой"))).toBe(true);
  });

  it("exports multi-currency dataset truthfully without cross-currency sum or false RUB assumptions", async () => {
    const multiCurCompanies: CommercialCompany[] = [
      {
        id: "c-rub",
        title: "Компания Рублевая",
        responsibleId: "u1",
        responsibleName: "Менеджер Рублев",
        dateCreate: "2026-09-01",
        direction: [],
        productType: [],
        sampleAllDates: [],
        deals: [
          {
            id: "d-rub",
            title: "Сделка Руб",
            companyId: "c-rub",
            responsibleId: "u1",
            stageId: "EXECUTING",
            categoryId: "0",
            opportunity: 1_500_000,
            currencyId: "RUB",
            paymentStatus: "109",
            paymentDate: "2026-09-10",
            sampleTestingStatus: [],
            productType: [],
            industry: [],
            direction: [],
          },
        ],
        primaryDealId: "d-rub",
        primaryDealTitle: "Сделка Руб",
        primaryDealOpportunity: 1_500_000,
        primaryDealCurrencyId: "RUB",
        primaryDealPaymentStatus: "109",
        primaryDealPaymentDate: "2026-09-10",
        sampleStatus: "—",
        sampleStatusSource: "NONE",
        gradeGel: [],
        gradeSol: [],
        hasAttention: false,
        attentionReasons: [],
      },
      {
        id: "c-usd",
        title: "Компания Долларовая",
        responsibleId: "u2",
        responsibleName: "Менеджер Долларов",
        dateCreate: "2026-09-02",
        direction: [],
        productType: [],
        sampleAllDates: [],
        sampleStatus: "—",
        sampleStatusSource: "NONE",
        gradeGel: [],
        gradeSol: [],
        deals: [
          {
            id: "d-usd",
            title: "Сделка Долл",
            companyId: "c-usd",
            responsibleId: "u2",
            stageId: "EXECUTING",
            categoryId: "0",
            opportunity: 25_000,
            currencyId: "USD",
            dateCreate: "2026-07-01",
            paymentStatus: "113",
            paymentDate: "2026-09-12",
            sampleTestingStatus: [],
            productType: [],
            industry: [],
            direction: [],
          },
        ],
        primaryDealId: "d-usd",
        primaryDealTitle: "Сделка Долл",
        primaryDealOpportunity: 25_000,
        primaryDealCurrencyId: "USD",
        primaryDealPaymentStatus: "113",
        primaryDealPaymentDate: "2026-09-12",
        hasAttention: true,
        attentionReasons: ["Нет задач"],
      },
    ];

    const multiCurDeals = multiCurCompanies.flatMap((c) => c.deals);

    const workbook = await createCommercialFunnelWorkbook({
      companies: multiCurCompanies,
      deals: multiCurDeals,
      filters: {
        periodPreset: "30days",
        responsibleId: "all",
        productType: "all",
        industry: "all",
        direction: "all",
        region: "all",
      },
      userNames: { u1: "Менеджер Рублев", u2: "Менеджер Долларов" },
      now: fixedNow,
    });

    // 1. Executive Summary: per-currency payment rows with isolated numFmts
    const summarySheet = workbook.getWorksheet("Executive Summary")!;
    let foundRubRow = false;
    let foundUsdRow = false;

    summarySheet.eachRow((row) => {
      const lbl = String(row.getCell(1).value || "");
      if (lbl.includes("Сумма сделок с полученной оплатой — RUB")) {
        foundRubRow = true;
        expect(row.getCell(2).value).toBe(1_500_000);
        expect(row.getCell(2).numFmt).toContain("₽");
      }
      if (lbl.includes("Сумма сделок с полученной оплатой — USD")) {
        foundUsdRow = true;
        expect(row.getCell(2).value).toBe(25_000);
        expect(row.getCell(2).numFmt).toContain("$");
        expect(row.getCell(2).numFmt).not.toContain("₽");
      }
    });

    expect(foundRubRow).toBe(true);
    expect(foundUsdRow).toBe(true);

    // 2. Funnel sheet: per-currency payment rows
    const funnelSheet = workbook.getWorksheet("Funnel")!;
    let funnelRub = false;
    let funnelUsd = false;
    funnelSheet.eachRow((row) => {
      const lbl = String(row.getCell(2).value || "");
      if (lbl.includes("Сумма сделок с полученной оплатой (RUB)")) {
        funnelRub = true;
        expect(row.getCell(3).numFmt).toContain("₽");
      }
      if (lbl.includes("Сумма сделок с полученной оплатой (USD)")) {
        funnelUsd = true;
        expect(row.getCell(3).numFmt).toContain("$");
        expect(row.getCell(3).numFmt).not.toContain("₽");
      }
    });
    expect(funnelRub).toBe(true);
    expect(funnelUsd).toBe(true);

    // 3. Managers Sheet: Per-currency payment columns
    const mgrSheet = workbook.getWorksheet("Managers")!;
    const mgrHeaderRow = mgrSheet.getRow(6);
    const mgrHeaders = (mgrHeaderRow.values as string[]).slice(1);
    expect(mgrHeaders).toContain("Сумма сделок с полученной оплатой (RUB)");
    expect(mgrHeaders).toContain("Сумма сделок с полученной оплатой (USD)");
  });

  it("preserves neutral format #,##0 for deals without currency in Excel export (never coerces to RUB)", async () => {
    const dealWithoutCur: CommercialDeal = {
      id: "d-nocurr",
      title: "Сделка без валюты",
      companyId: "c-nocurr",
      responsibleId: "u1",
      stageId: "WON",
      categoryId: "0",
      opportunity: 50_000,
      currencyId: "", // intentionally empty
      paymentStatus: "113",
      paymentDate: "2026-09-10",
      sampleTestingStatus: [],
      productType: [],
      industry: [],
      direction: [],
    };

    const companyWithoutCur: CommercialCompany = {
      id: "c-nocurr",
      title: "Компания Без Валюты",
      responsibleId: "u1",
      responsibleName: "Менеджер",
      sampleStatus: "Не требуется",
      sampleStatusSource: "NONE",
      gradeGel: [],
      gradeSol: [],
      productType: [],
      direction: [],
      sampleAllDates: [],
      deals: [dealWithoutCur],
      primaryDealId: "d-nocurr",
      primaryDealTitle: "Сделка без валюты",
      primaryDealOpportunity: 50_000,
      primaryDealCurrencyId: undefined, // intentionally undefined
      primaryDealPaymentStatus: "Оплачен",
      primaryDealPaymentDate: "2026-09-10",
      hasAttention: true,
      attentionReasons: ["Проверка"],
    };

    const workbook = await createCommercialFunnelWorkbook({
      companies: [companyWithoutCur],
      deals: [dealWithoutCur],
      filters,
      userNames: { u1: "Менеджер" },
      now: fixedNow,
    });

    // Funnel sheet: payment amount row for "валюта не указана" uses neutral numFmt
    const funnelSheet = workbook.getWorksheet("Funnel")!;
    let neutralRowFound = false;
    funnelSheet.eachRow((row) => {
      const lbl = String(row.getCell(2).value || "");
      if (lbl.includes("Сумма сделок с полученной оплатой (валюта не указана)")) {
        neutralRowFound = true;
        expect(row.getCell(3).value).toBe(50_000);
        expect(row.getCell(3).numFmt).toBe("#,##0");
        expect(row.getCell(3).numFmt).not.toContain("₽");
        expect(row.getCell(3).numFmt).not.toContain("$");
        expect(row.getCell(3).numFmt).not.toContain("€");
      }
    });
    expect(neutralRowFound).toBe(true);
  });

  it("T27: OpenXML Round-Trip preserves sheet order, per-currency formats, UNKNOWN neutral format, and explicit labels after XLSX reload", async () => {
    const dealRub: CommercialDeal = {
      id: "d-rub",
      title: "Сделка RUB",
      companyId: "c-1",
      responsibleId: "u1",
      stageId: "WON",
      categoryId: "0",
      opportunity: 1_000_000,
      currencyId: "RUB",
      paymentStatus: "113",
      paymentDate: "2026-09-10",
      sampleTestingStatus: [],
      productType: [],
      industry: [],
      direction: [],
    };

    const dealUsd: CommercialDeal = {
      id: "d-usd",
      title: "Сделка USD",
      companyId: "c-2",
      responsibleId: "u2",
      stageId: "WON",
      categoryId: "0",
      opportunity: 20_000,
      currencyId: "USD",
      paymentStatus: "113",
      paymentDate: "2026-09-12",
      sampleTestingStatus: [],
      productType: [],
      industry: [],
      direction: [],
    };

    const dealUnknown: CommercialDeal = {
      id: "d-unk",
      title: "Сделка UNKNOWN",
      companyId: "c-3",
      responsibleId: "u3",
      stageId: "WON",
      categoryId: "0",
      opportunity: 10_000,
      currencyId: "", // UNKNOWN
      paymentStatus: "113",
      paymentDate: "2026-09-14",
      sampleTestingStatus: [],
      productType: [],
      industry: [],
      direction: [],
    };

    const makeComp = (id: string, deal: CommercialDeal, respId: string, curId?: string): CommercialCompany => ({
      id,
      title: `Компания ${id}`,
      responsibleId: respId,
      responsibleName: `Менеджер ${respId}`,
      sampleStatus: "Не требуется",
      sampleStatusSource: "NONE",
      gradeGel: [],
      gradeSol: [],
      productType: [],
      direction: [],
      sampleAllDates: [],
      deals: [deal],
      primaryDealId: deal.id,
      primaryDealTitle: deal.title,
      primaryDealOpportunity: deal.opportunity,
      primaryDealCurrencyId: curId,
      primaryDealPaymentStatus: "Оплачен",
      primaryDealPaymentDate: deal.paymentDate,
      hasAttention: false,
      attentionReasons: [],
    });

    const companies = [
      makeComp("c-1", dealRub, "u1", "RUB"),
      makeComp("c-2", dealUsd, "u2", "USD"),
      makeComp("c-3", dealUnknown, "u3", undefined),
    ];

    const sourceWb = await createCommercialFunnelWorkbook({
      companies,
      deals: [dealRub, dealUsd, dealUnknown],
      filters,
      userNames: { u1: "Менеджер Рублев", u2: "Менеджер Долларов", u3: "Менеджер Безвалютный" },
      now: fixedNow,
    });

    // Write binary buffer and reload via ExcelJS
    const buffer = await sourceWb.xlsx.writeBuffer();
    const reloadedWb = new ExcelJS.Workbook();
    await reloadedWb.xlsx.load(buffer as any);

    // 0. Sheet names and order survive the round trip
    expect(reloadedWb.worksheets.map((s) => s.name)).toEqual([
      "Executive Summary",
      "Funnel",
      "Segments",
      "Sample Testing",
      "Managers",
      "Action Plan",
    ]);

    // 1. Executive Summary: Check Section 1 currency rows
    const summarySheet = reloadedWb.getWorksheet("Executive Summary")!;
    const rowLabels: string[] = [];
    const rowNumFmts: Record<string, string | undefined> = {};
    summarySheet.eachRow((row) => {
      const lbl = String(row.getCell(1).value || "");
      if (lbl) {
        rowLabels.push(lbl);
        rowNumFmts[lbl] = row.getCell(2).numFmt;
      }
    });

    expect(rowLabels).toContain("Сумма сделок с полученной оплатой — RUB");
    expect(rowLabels).toContain("Сумма сделок с полученной оплатой — USD");
    expect(rowLabels).toContain("Сумма сделок с полученной оплатой — валюта не указана");

    expect(rowNumFmts["Сумма сделок с полученной оплатой — RUB"]).toContain("₽");
    expect(rowNumFmts["Сумма сделок с полученной оплатой — USD"]).toContain("$");
    expect(rowNumFmts["Сумма сделок с полученной оплатой — валюта не указана"]).toBe("#,##0");

    // 2. Managers sheet: Check headers include (валюта не указана)
    const mgrSheet = reloadedWb.getWorksheet("Managers")!;
    const mgrHeaderRow = mgrSheet.getRow(6);
    const mgrHeaders = (mgrHeaderRow.values as string[]).slice(1);
    expect(mgrHeaders).toContain("Сумма сделок с полученной оплатой (RUB)");
    expect(mgrHeaders).toContain("Сумма сделок с полученной оплатой (USD)");
    expect(mgrHeaders).toContain("Сумма сделок с полученной оплатой (валюта не указана)");

    // 3. Funnel sheet: per-currency rows survive with correct numFmts
    const funnelSheet = reloadedWb.getWorksheet("Funnel")!;
    const funnelLabels: string[] = [];
    const funnelNumFmts: Record<string, string | undefined> = {};
    funnelSheet.eachRow((row) => {
      const lbl = String(row.getCell(2).value || "");
      if (lbl) {
        funnelLabels.push(lbl);
        funnelNumFmts[lbl] = row.getCell(3).numFmt;
      }
    });
    expect(funnelLabels).toContain("Сумма сделок с полученной оплатой (RUB)");
    expect(funnelLabels).toContain("Сумма сделок с полученной оплатой (USD)");
    expect(funnelLabels).toContain("Сумма сделок с полученной оплатой (валюта не указана)");
    expect(funnelNumFmts["Сумма сделок с полученной оплатой (RUB)"]).toContain("₽");
    expect(funnelNumFmts["Сумма сделок с полученной оплатой (USD)"]).toContain("$");
    expect(funnelNumFmts["Сумма сделок с полученной оплатой (валюта не указана)"]).toBe("#,##0");
  });

  it("exports zero payment amounts with neutral numFmt without false RUB symbol", async () => {
    // Companies with NO paid deals at all
    const mockCompany: CommercialCompany = {
      id: "comp-zero",
      title: "Компания без оплат",
      responsibleId: "u1",
      responsibleName: "Менеджер Тестовый",
      dateCreate: "2026-09-01",
      direction: [],
      directionRaw: [],
      productType: [],
      sampleStatus: "Не требуется",
      sampleStatusSource: "NONE",
      sampleAllDates: [],
      gradeGel: [],
      gradeSol: [],
      deals: [],
      hasAttention: false,
      attentionReasons: [],
    };

    const workbook = await createCommercialFunnelWorkbook({
      companies: [mockCompany],
      deals: [],
      filters,
      userNames: { u1: "Менеджер Тестовый" },
      now: fixedNow,
    });

    const buffer = await workbook.xlsx.writeBuffer();
    const reloadedWb = new ExcelJS.Workbook();
    await reloadedWb.xlsx.load(buffer as any);

    const summarySheet = reloadedWb.getWorksheet("Executive Summary")!;

    // Find the payment amount row in Section 1
    let paymentVal: any = undefined;
    let paymentNumFmt: string | undefined = undefined;

    summarySheet.eachRow((row) => {
      const lbl = String(row.getCell(1).value || "");
      if (lbl.includes("Сумма сделок с полученной оплатой")) {
        paymentVal = row.getCell(2).value;
        paymentNumFmt = row.getCell(2).numFmt;
      }
    });

    expect(paymentVal).toBe(0);
    expect(paymentNumFmt).toBe("#,##0");
    expect(paymentNumFmt).not.toContain("₽");
    expect(paymentNumFmt).not.toContain("$");
    expect(paymentNumFmt).not.toContain("€");
  });

  it("T15: local UI state (active tab/page/sort) cannot exist in workbook input — export is deterministic for same filters", async () => {
    const build = () =>
      createCommercialFunnelWorkbook({
        companies: demoData.companies,
        deals: demoData.deals,
        filters,
        userNames: demoData.userNames,
        now: fixedNow,
      });

    const wb1 = await build();
    const wb2 = await build();

    const snapshot = (wb: ExcelJS.Workbook) => {
      const parts: string[] = [];
      for (const sheet of wb.worksheets) {
        parts.push(`#${sheet.name}`);
        sheet.eachRow((row) => {
          const vals: any[] = [];
          row.eachCell((cell) => vals.push(cell.value));
          parts.push(JSON.stringify(vals));
        });
      }
      return parts.join("\n");
    };

    // Two builds with identical global filters produce identical analytical content.
    expect(snapshot(wb2)).toBe(snapshot(wb1));
  });

  // ─── Phase C §32/§33: Smart-Process-source Sample Testing reconciliation ───

  it("SP-EXCEL: Sample Testing sheet renders SP-source snapshot with exact linked Deal (blank when none)", async () => {
    const spCompany: CommercialCompany = {
      id: "c-sp",
      title: "ООО СП-Компани",
      responsibleId: "owner-1",
      responsibleName: "Владелец Компании",
      dateCreate: "2026-08-01",
      direction: [],
      productType: [],
      // SP current state: item 9001, responsible mgr-1 (NOT the owner),
      // exact linked Deal d-9001 via sampleRelatedDealId.
      sampleStatus: "На испытании",
      sampleStatusSource: "SMART_PROCESS",
      sampleResponsibleId: "mgr-1",
      sampleResponsibleName: "Менеджер Процессный",
      sampleResponsibleProcessItemId: "9001",
      sampleRelatedDealId: "d-9001",
      sampleCurrentResolutionQuality: "RESOLVED",
      sampleShipmentDate: "2026-09-05",
      sampleAllDates: ["2026-09-05"],
      gradeGel: ["КСМГ-9"],
      gradeSol: [],
      deals: [
        {
          id: "d-9001",
          title: "Сделка по образцам 9001",
          companyId: "c-sp",
          responsibleId: "owner-1",
          stageId: "EXECUTING",
          categoryId: "0",
          opportunity: 100000,
          currencyId: "RUB",
          dateCreate: "2026-08-10",
          sampleTestingStatus: [],
          productType: [],
          industry: [],
          direction: [],
        },
      ],
      hasAttention: false,
      attentionReasons: [],
    };

    const workbook = await createCommercialFunnelWorkbook({
      companies: [spCompany],
      deals: spCompany.deals,
      filters,
      userNames: { "owner-1": "Владелец Компании", "mgr-1": "Менеджер Процессный" },
      now: fixedNow,
    });

    const stSheet = workbook.getWorksheet("Sample Testing")!;
    let spRow: ExcelJS.Row | undefined;
    stSheet.eachRow((row) => {
      const title = String(row.getCell(2).value ?? "");
      if (title.includes("СП-Компани")) spRow = row;
    });
    expect(spRow).toBeDefined();
    const row = spRow!;
    // Responsible: SP ASSIGNED_BY_ID, never the Company owner.
    expect(String(row.getCell(3).value ?? "")).toContain("Менеджер Процессный");
    // Status human-readable.
    expect(String(row.getCell(8).value ?? "")).toBe("На испытании");
    // Exact linked Deal present (not blank).
    expect(String(row.getCell(11).value ?? "")).toContain("Сделка по образцам 9001");
    // Marks carried.
    const rowValues: string[] = [];
    row.eachCell((cell) => rowValues.push(String(cell.value ?? "")));
    expect(rowValues.join(" | ")).toContain("КСМГ-9");
  });

  it("SP-EXCEL-2: SP-source without linked Deal leaves Deal blank (never representative primaryDeal)", async () => {
    const spCompanyNoDeal: CommercialCompany = {
      id: "c-sp2",
      title: "ООО СП-Без-Сделки",
      responsibleId: "owner-1",
      responsibleName: "Владелец Компании",
      dateCreate: "2026-08-01",
      direction: [],
      productType: [],
      sampleStatus: "На испытании",
      sampleStatusSource: "SMART_PROCESS",
      sampleResponsibleId: "mgr-1",
      sampleResponsibleName: "Менеджер Процессный",
      sampleResponsibleProcessItemId: "9002",
      sampleRelatedDealId: undefined,
      sampleCurrentResolutionQuality: "RESOLVED",
      sampleShipmentDate: "2026-09-06",
      sampleAllDates: ["2026-09-06"],
      gradeGel: [],
      gradeSol: [],
      // A representative commercial deal EXISTS but must NOT appear as the sample Deal.
      deals: [
        {
          id: "d-rep",
          title: "Представительская сделка",
          companyId: "c-sp2",
          responsibleId: "owner-1",
          stageId: "C4:WON",
          categoryId: "0",
          opportunity: 900000,
          currencyId: "RUB",
          dateCreate: "2026-08-10",
          sampleTestingStatus: [],
          productType: [],
          industry: [],
          direction: [],
        },
      ],
      hasAttention: false,
      attentionReasons: [],
    };

    const workbook = await createCommercialFunnelWorkbook({
      companies: [spCompanyNoDeal],
      deals: spCompanyNoDeal.deals,
      filters,
      userNames: { "owner-1": "Владелец Компании", "mgr-1": "Менеджер Процессный" },
      now: fixedNow,
    });

    const stSheet = workbook.getWorksheet("Sample Testing")!;
    let spRow: ExcelJS.Row | undefined;
    stSheet.eachRow((row) => {
      const title = String(row.getCell(2).value ?? "");
      if (title.includes("СП-Без-Сделки")) spRow = row;
    });
    expect(spRow).toBeDefined();
    const row = spRow!;
    // Deal column blank — representative deal never substituted.
    const dealCell = String(row.getCell(11).value ?? "");
    expect(dealCell).not.toContain("Представительская сделка");
  });
});
