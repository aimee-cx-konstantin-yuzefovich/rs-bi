// src/__tests__/invariant-financial-quality.test.ts
// ─────────────────────────────────────────────────────────────────────
// Invariant Test Suite: Financial Aggregate Quality (Finding B)
// Enforces truth table across period metrics, manager scorecard, and per-currency breakdowns.
// ─────────────────────────────────────────────────────────────────────

import { describe, it, expect, vi, afterEach } from "vitest";
import React from "react";
import { render, screen, cleanup } from "@testing-library/react";
import ExcelJS from "exceljs";
import {
  computePeriodMetrics,
  computeManagerScorecard,
  computeWipMetrics,
  evaluateAggregateAmountQuality,
} from "@/lib/commercial-funnel/engine";
import { computePeriodBoundaries } from "@/lib/commercial-funnel/date-utils";
import { getCurrencyUniverse } from "@/lib/commercial-funnel/currency";
import { createCommercialFunnelWorkbook } from "@/lib/commercial-funnel/export-excel";
import { CommercialOverviewTab } from "@/components/commercial-funnel/overview-tab";
import { CommercialManagersTab } from "@/components/commercial-funnel/managers-tab";
import { PAYMENT_AMOUNT_LABEL } from "@/lib/commercial-funnel/constants";
import type { CommercialCompany, CommercialDeal } from "@/lib/commercial-funnel/types";

describe("Invariant Financial Quality Contract (Finding B)", () => {
  afterEach(() => {
    cleanup();
  });

  const fixedNow = new Date("2026-03-25T12:00:00Z");
  const boundaries = computePeriodBoundaries({ periodPreset: "90days" }, fixedNow);

  const makeCompany = (
    id: string,
    deals: Partial<CommercialDeal>[],
    respId = "1"
  ): CommercialCompany => ({
    id,
    title: `Company ${id}`,
    responsibleId: respId,
    responsibleName: `Manager ${respId}`,
    dateCreate: "2026-01-10",
    direction: [],
    productType: [],
    gradeGel: [],
    gradeSol: [],
    sampleStatus: "—",
    sampleStatusSource: "NONE",
    sampleStatuses: [],
    sampleStatusRawValues: [],
    sampleStatusEntries: [],
    sampleDealSentDates: [],
    sampleCompanyTransferDates: [],
    sampleEventDatesForPeriodMetrics: [],
    sampleAllDates: [],
    hasAttention: false,
    attentionReasons: [],
    deals: deals.map((d, idx) => ({
      id: d.id || `${id}-${idx + 1}`,
      companyId: id,
      responsibleId: respId,
      title: d.title || `Deal ${idx + 1}`,
      stageId: d.stageId || "WON",
      currencyId: d.currencyId || "RUB",
      dateCreate: d.dateCreate || "2026-02-01",
      paymentStatus: d.paymentStatus ?? "113", // Paid
      paymentDate: d.paymentDate ?? "2026-03-01",
      sampleTestingStatus: [],
      ...d,
    } as CommercialDeal)),
  });

  describe("Aggregate Quality Truth Table", () => {
    it("A. True Zero: valid numeric 0 produces 0 with COMPLETE quality", () => {
      const res = evaluateAggregateAmountQuality(0, 2, 0, 0);
      expect(res.amount).toBe(0);
      expect(res.quality).toBe("COMPLETE");
    });

    it("B. No Known Amount: paid deals missing amount produce null with UNKNOWN quality", () => {
      const res = evaluateAggregateAmountQuality(0, 0, 0, 3);
      expect(res.amount).toBeNull();
      expect(res.quality).toBe("UNKNOWN");
    });

    it("C. Invalid Amount: paid deals with malformed amount produce null with INVALID_ONLY quality", () => {
      const res = evaluateAggregateAmountQuality(0, 0, 2, 0);
      expect(res.amount).toBeNull();
      expect(res.quality).toBe("INVALID_ONLY");
    });

    it("D. Partial Amount: valid subtotal + invalid/unknown deals produces known subtotal with PARTIAL quality", () => {
      const res1 = evaluateAggregateAmountQuality(100000, 1, 1, 0);
      expect(res1.amount).toBe(100000);
      expect(res1.quality).toBe("PARTIAL");

      const res2 = evaluateAggregateAmountQuality(250000, 2, 0, 1);
      expect(res2.amount).toBe(250000);
      expect(res2.quality).toBe("PARTIAL");
    });
  });

  describe("Executive Financial KPIs", () => {
    it("produces PARTIAL quality when 1 deal is valid (100k) and 1 deal is invalid in the same currency", () => {
      const companies = [
        makeCompany("C1", [
          { id: "D1", opportunity: 100000, opportunityQuality: "VALID", currencyId: "RUB" },
        ]),
        makeCompany("C2", [
          { id: "D2", opportunity: null, opportunityQuality: "INVALID", currencyId: "RUB" },
        ]),
      ];

      const kpis = computePeriodMetrics(companies, boundaries);
      const payAmtKpi = kpis.find((k) => k.id === "payment_amount")!;

      expect(payAmtKpi.currentValue).toBe(100000);
      expect(payAmtKpi.amountQuality).toBe("PARTIAL");
      expect(payAmtKpi.currencyBreakdown?.current.RUB).toBe(100000);
      expect(payAmtKpi.currencyBreakdownQuality?.current.RUB).toBe("PARTIAL");
    });

    it("produces separate per-currency qualities in multi-currency scenario", () => {
      const companies = [
        makeCompany("C1", [
          { id: "D1", opportunity: 100000, opportunityQuality: "VALID", currencyId: "RUB" },
          { id: "D2", opportunity: null, opportunityQuality: "INVALID", currencyId: "RUB" },
        ]),
        makeCompany("C2", [
          { id: "D3", opportunity: 1000, opportunityQuality: "VALID", currencyId: "USD" },
        ]),
      ];

      const kpis = computePeriodMetrics(companies, boundaries);
      const payAmtKpi = kpis.find((k) => k.id === "payment_amount")!;

      expect(payAmtKpi.isMultiCurrency).toBe(true);
      expect(payAmtKpi.currentValue).toBeNull(); // scalar sum forbidden
      expect(payAmtKpi.currencyBreakdown?.current.RUB).toBe(100000);
      expect(payAmtKpi.currencyBreakdown?.current.USD).toBe(1000);
      expect(payAmtKpi.currencyBreakdownQuality?.current.RUB).toBe("PARTIAL");
      expect(payAmtKpi.currencyBreakdownQuality?.current.USD).toBe("COMPLETE");
    });
  });

  describe("Manager Scorecard Financial Quality", () => {
    it("does NOT produce paymentAmount = 0 COMPLETE when paid deals have INVALID opportunity", () => {
      const companies = [
        makeCompany("C1", [
          { id: "D1", opportunity: null, opportunityQuality: "INVALID", currencyId: "RUB" },
        ], "M1"),
      ];

      const scorecard = computeManagerScorecard(companies, boundaries);
      const m1 = scorecard.find((s) => s.responsibleId === "M1")!;

      expect(m1).toBeDefined();
      expect(m1.paymentsReceived).toBe(1);
      // Critical invariant: must NOT be 0 COMPLETE!
      expect(m1.paymentAmount).toBeNull();
      expect(m1.paymentAmountQuality).toBe("INVALID_ONLY");
      expect(m1.paymentAmountsQualityByCurrency?.RUB).toBe("INVALID_ONLY");
    });

    it("preserves PARTIAL quality for manager with 1 valid and 1 invalid deal", () => {
      const companies = [
        makeCompany("C1", [
          { id: "D1", opportunity: 75000, opportunityQuality: "VALID", currencyId: "RUB" },
          { id: "D2", opportunity: null, opportunityQuality: "INVALID", currencyId: "RUB" },
        ], "M2"),
      ];

      const scorecard = computeManagerScorecard(companies, boundaries);
      const m2 = scorecard.find((s) => s.responsibleId === "M2")!;

      expect(m2).toBeDefined();
      expect(m2.paymentsReceived).toBe(2);
      expect(m2.paymentAmount).toBe(75000);
      expect(m2.paymentAmountQuality).toBe("PARTIAL");
      expect(m2.paymentAmountsQualityByCurrency?.RUB).toBe("PARTIAL");
    });

    it("preserves genuine 0 COMPLETE when manager has valid paid deal with opportunity 0", () => {
      const companies = [
        makeCompany("C1", [
          { id: "D1", opportunity: 0, opportunityQuality: "VALID", currencyId: "RUB" },
        ], "M3"),
      ];

      const scorecard = computeManagerScorecard(companies, boundaries);
      const m3 = scorecard.find((s) => s.responsibleId === "M3")!;

      expect(m3).toBeDefined();
      expect(m3.paymentsReceived).toBe(1);
      expect(m3.paymentAmount).toBe(0);
      expect(m3.paymentAmountQuality).toBe("COMPLETE");
      expect(m3.paymentAmountsQualityByCurrency?.RUB).toBe("COMPLETE");
    });
  });

  describe("Adversarial Financial Fixtures FQ-1 to FQ-5 (End-to-End Invariants)", () => {
    // Helper to find a row in worksheet by text contained in cell 1
    function findRowByLabel(sheet: ExcelJS.Worksheet, substring: string): ExcelJS.Row | undefined {
      let found: ExcelJS.Row | undefined;
      sheet.eachRow((row) => {
        const val = String(row.getCell(1).value || "");
        if (val.includes(substring)) {
          found = row;
        }
      });
      return found;
    }

    // Helper to find column index in managers sheet header
    function findManagerColIdx(headerRow: ExcelJS.Row, currencyCode: string): number {
      let idx = -1;
      headerRow.eachCell((cell, colNumber) => {
        const val = String(cell.value || "");
        if (val.includes(currencyCode)) {
          idx = colNumber;
        }
      });
      return idx;
    }

    it("FQ-1: valid RUB 100000 + invalid-only USD preserves quality and does NOT hide or zero USD", async () => {
      const companies = [
        makeCompany("C1", [
          { id: "D1", opportunity: 100000, opportunityQuality: "VALID", currencyId: "RUB" },
        ], "M1"),
        makeCompany("C2", [
          { id: "D2", opportunity: null, opportunityQuality: "INVALID", currencyId: "USD" },
        ], "M1"),
      ];

      // 1. Domain Engine
      const datedKpis = computePeriodMetrics(companies, boundaries);
      const wipKpis = computeWipMetrics(companies);
      const payKpi = datedKpis.find((k) => k.id === "payment_amount")!;

      expect(payKpi.isMultiCurrency).toBe(true);
      expect(payKpi.currentValue).toBeNull(); // scalar sum forbidden
      expect(payKpi.currencyBreakdown?.current.RUB).toBe(100000);
      expect(payKpi.currencyBreakdownQuality?.current.RUB).toBe("COMPLETE");
      expect(payKpi.currencyBreakdown?.current.USD).toBeUndefined();
      expect(payKpi.currencyBreakdownQuality?.current.USD).toBe("INVALID_ONLY");

      const universe = getCurrencyUniverse(
        payKpi.currencyBreakdown?.current,
        payKpi.currencyBreakdown?.previous,
        payKpi.currencyBreakdownQuality?.current,
        payKpi.currencyBreakdownQuality?.previous
      );
      expect(universe).toEqual(["RUB", "USD"]);

      // 2. Scorecard
      const scorecard = computeManagerScorecard(companies, boundaries, [], { M1: "Manager 1" });
      const m1 = scorecard.find((s) => s.responsibleId === "M1")!;
      expect(m1.paymentAmountsByCurrency?.RUB).toBe(100000);
      expect(m1.paymentAmountsQualityByCurrency?.RUB).toBe("COMPLETE");
      expect(m1.paymentAmountsByCurrency?.USD).toBeUndefined();
      expect(m1.paymentAmountsQualityByCurrency?.USD).toBe("INVALID_ONLY");

      // 3. Overview UI Tab
      render(
        React.createElement(CommercialOverviewTab, {
          datedKpis,
          wipKpis,
          boundaries,
          onOpenDrillDown: vi.fn(),
        })
      );
      expect(screen.getAllByText(/100\s?000\s?₽/).length).toBeGreaterThan(0);
      expect(screen.getByText(/USD\s*—\s*ошибка данных/)).toBeInTheDocument();
      // USD must NEVER be displayed as 0 $
      expect(screen.queryByText(/0\s?\$/)).not.toBeInTheDocument();
      expect(screen.queryByText(/\$\s?0/)).not.toBeInTheDocument();
      cleanup();

      // 4. Managers UI Tab
      render(
        React.createElement(CommercialManagersTab, {
          scorecard,
          onOpenDrillDown: vi.fn(),
        })
      );
      expect(screen.getByText(/Сумма сделок с получ\. оплатой/)).toBeInTheDocument();
      expect(screen.getAllByText(/100\s?000\s?₽/).length).toBeGreaterThan(0);
      expect(screen.getAllByText(/USD\s*—\s*ошибка данных/).length).toBeGreaterThan(0);
      expect(screen.queryByText(/0\s?\$/)).not.toBeInTheDocument();
      cleanup();

      // 5. Excel Generation & Binary Reload
      const workbook = await createCommercialFunnelWorkbook({
        companies,
        deals: companies.flatMap((c) => c.deals),
        filters: { periodPreset: "90days" },
        userNames: { M1: "Manager 1" },
        now: fixedNow,
      });

      const buffer = await workbook.xlsx.writeBuffer();
      const reloaded = new ExcelJS.Workbook();
      await reloaded.xlsx.load(buffer as any);

      // Verify Executive Summary Sheet
      const summarySheet = reloaded.getWorksheet("Executive Summary")!;
      const usdKpiRow = findRowByLabel(summarySheet, `${PAYMENT_AMOUNT_LABEL} — USD`);
      expect(usdKpiRow).toBeDefined();
      expect(usdKpiRow!.getCell(2).value).toBe("Ошибка данных");
      expect(usdKpiRow!.getCell(2).value).not.toBe(0);

      let usdCardRow: ExcelJS.Row | undefined;
      summarySheet.eachRow((r) => {
        if (r.getCell(4).value === "USD") usdCardRow = r;
      });
      expect(usdCardRow).toBeDefined();
      expect(usdCardRow!.getCell(5).value).toBe("Ошибка данных");
      expect(usdCardRow!.getCell(5).value).not.toBe(0);

      // Verify Managers Sheet
      const managersSheet = reloaded.getWorksheet("Managers")!;
      let mgrHeaderRow: ExcelJS.Row | undefined;
      managersSheet.eachRow((r) => {
        r.eachCell((c) => {
          if (String(c.value || "").trim() === "Менеджер") mgrHeaderRow = r;
        });
      });
      expect(mgrHeaderRow).toBeDefined();

      const usdCol = findManagerColIdx(mgrHeaderRow!, "USD");
      expect(usdCol).toBeGreaterThan(0);

      const m1Row = findRowByLabel(managersSheet, "Manager 1");
      expect(m1Row).toBeDefined();
      expect(m1Row!.getCell(usdCol).value).toBe("Ошибка данных");
      expect(m1Row!.getCell(usdCol).value).not.toBe(0);
    });

    it("FQ-2: valid RUB 100000 + unknown-only EUR preserves quality and does NOT hide or zero EUR", async () => {
      const companies = [
        makeCompany("C1", [
          { id: "D1", opportunity: 100000, opportunityQuality: "VALID", currencyId: "RUB" },
        ], "M1"),
        makeCompany("C2", [
          { id: "D2", opportunity: null, opportunityQuality: "UNKNOWN", currencyId: "EUR" },
        ], "M1"),
      ];

      // 1. Domain Engine
      const datedKpis = computePeriodMetrics(companies, boundaries);
      const wipKpis = computeWipMetrics(companies);
      const payKpi = datedKpis.find((k) => k.id === "payment_amount")!;

      expect(payKpi.isMultiCurrency).toBe(true);
      expect(payKpi.currentValue).toBeNull();
      expect(payKpi.currencyBreakdown?.current.RUB).toBe(100000);
      expect(payKpi.currencyBreakdownQuality?.current.RUB).toBe("COMPLETE");
      expect(payKpi.currencyBreakdown?.current.EUR).toBeUndefined();
      expect(payKpi.currencyBreakdownQuality?.current.EUR).toBe("UNKNOWN");

      const universe = getCurrencyUniverse(
        payKpi.currencyBreakdown?.current,
        payKpi.currencyBreakdown?.previous,
        payKpi.currencyBreakdownQuality?.current,
        payKpi.currencyBreakdownQuality?.previous
      );
      expect(universe).toEqual(["EUR", "RUB"]);

      // 2. Scorecard
      const scorecard = computeManagerScorecard(companies, boundaries, [], { M1: "Manager 1" });
      const m1 = scorecard.find((s) => s.responsibleId === "M1")!;
      expect(m1.paymentAmountsByCurrency?.RUB).toBe(100000);
      expect(m1.paymentAmountsQualityByCurrency?.RUB).toBe("COMPLETE");
      expect(m1.paymentAmountsByCurrency?.EUR).toBeUndefined();
      expect(m1.paymentAmountsQualityByCurrency?.EUR).toBe("UNKNOWN");

      // 3. Overview UI Tab
      render(
        React.createElement(CommercialOverviewTab, {
          datedKpis,
          wipKpis,
          boundaries,
          onOpenDrillDown: vi.fn(),
        })
      );
      expect(screen.getAllByText(/100\s?000\s?₽/).length).toBeGreaterThan(0);
      expect(screen.getByText(/EUR\s*—\s*нет данных/)).toBeInTheDocument();
      expect(screen.queryByText(/0\s?€/)).not.toBeInTheDocument();
      expect(screen.queryByText(/€\s?0/)).not.toBeInTheDocument();
      cleanup();

      // 4. Managers UI Tab
      render(
        React.createElement(CommercialManagersTab, {
          scorecard,
          onOpenDrillDown: vi.fn(),
        })
      );
      expect(screen.getByText(/Сумма сделок с получ\. оплатой/)).toBeInTheDocument();
      expect(screen.getAllByText(/100\s?000\s?₽/).length).toBeGreaterThan(0);
      expect(screen.getAllByText(/EUR\s*—\s*нет данных/).length).toBeGreaterThan(0);
      expect(screen.queryByText(/0\s?€/)).not.toBeInTheDocument();
      cleanup();

      // 5. Excel Generation & Binary Reload
      const workbook = await createCommercialFunnelWorkbook({
        companies,
        deals: companies.flatMap((c) => c.deals),
        filters: { periodPreset: "90days" },
        userNames: { M1: "Manager 1" },
        now: fixedNow,
      });

      const buffer = await workbook.xlsx.writeBuffer();
      const reloaded = new ExcelJS.Workbook();
      await reloaded.xlsx.load(buffer as any);

      // Verify Executive Summary Sheet
      const summarySheet = reloaded.getWorksheet("Executive Summary")!;
      const eurKpiRow = findRowByLabel(summarySheet, `${PAYMENT_AMOUNT_LABEL} — EUR`);
      expect(eurKpiRow).toBeDefined();
      expect(eurKpiRow!.getCell(2).value).toBe("Нет данных");
      expect(eurKpiRow!.getCell(2).value).not.toBe(0);

      let eurCardRow: ExcelJS.Row | undefined;
      summarySheet.eachRow((r) => {
        if (r.getCell(4).value === "EUR") eurCardRow = r;
      });
      expect(eurCardRow).toBeDefined();
      expect(eurCardRow!.getCell(5).value).toBe("Нет данных");
      expect(eurCardRow!.getCell(5).value).not.toBe(0);

      // Verify Managers Sheet
      const managersSheet = reloaded.getWorksheet("Managers")!;
      let mgrHeaderRow: ExcelJS.Row | undefined;
      managersSheet.eachRow((r) => {
        r.eachCell((c) => {
          if (String(c.value || "").trim() === "Менеджер") mgrHeaderRow = r;
        });
      });
      expect(mgrHeaderRow).toBeDefined();

      const eurCol = findManagerColIdx(mgrHeaderRow!, "EUR");
      expect(eurCol).toBeGreaterThan(0);

      const m1Row = findRowByLabel(managersSheet, "Manager 1");
      expect(m1Row).toBeDefined();
      expect(m1Row!.getCell(eurCol).value).toBe("Нет данных");
      expect(m1Row!.getCell(eurCol).value).not.toBe(0);
    });

    it("FQ-3: invalid-only USD only preserves quality and does NOT collapse to numeric zero", async () => {
      const companies = [
        makeCompany("C1", [
          { id: "D1", opportunity: null, opportunityQuality: "INVALID", currencyId: "USD" },
        ], "M1"),
      ];

      // 1. Domain Engine
      const datedKpis = computePeriodMetrics(companies, boundaries);
      const wipKpis = computeWipMetrics(companies);
      const payKpi = datedKpis.find((k) => k.id === "payment_amount")!;

      expect(payKpi.isMultiCurrency).toBe(false);
      expect(payKpi.currencyId).toBe("USD");
      expect(payKpi.currentValue).toBeNull();
      expect(payKpi.amountQuality).toBe("INVALID_ONLY");

      // 2. Scorecard
      const scorecard = computeManagerScorecard(companies, boundaries, [], { M1: "Manager 1" });
      const m1 = scorecard.find((s) => s.responsibleId === "M1")!;
      expect(m1.paymentAmount).toBeNull();
      expect(m1.paymentAmountQuality).toBe("INVALID_ONLY");
      expect(m1.paymentAmountsQualityByCurrency?.USD).toBe("INVALID_ONLY");

      // 3. Overview UI Tab
      render(
        React.createElement(CommercialOverviewTab, {
          datedKpis,
          wipKpis,
          boundaries,
          onOpenDrillDown: vi.fn(),
        })
      );
      expect(screen.getByText(/— ошибка данных/)).toBeInTheDocument();
      expect(screen.queryByText(/0\s?\$/)).not.toBeInTheDocument();
      expect(screen.queryByText(/\$\s?0/)).not.toBeInTheDocument();
      cleanup();

      // 4. Managers UI Tab
      render(
        React.createElement(CommercialManagersTab, {
          scorecard,
          onOpenDrillDown: vi.fn(),
        })
      );
      expect(screen.getAllByText(/— ошибка данных/).length).toBeGreaterThan(0);
      expect(screen.queryByText(/0\s?\$/)).not.toBeInTheDocument();
      cleanup();

      // 5. Excel Generation & Binary Reload
      const workbook = await createCommercialFunnelWorkbook({
        companies,
        deals: companies.flatMap((c) => c.deals),
        filters: { periodPreset: "90days" },
        userNames: { M1: "Manager 1" },
        now: fixedNow,
      });

      const buffer = await workbook.xlsx.writeBuffer();
      const reloaded = new ExcelJS.Workbook();
      await reloaded.xlsx.load(buffer as any);

      // Verify Executive Summary Sheet
      const summarySheet = reloaded.getWorksheet("Executive Summary")!;
      const kpiRow = findRowByLabel(summarySheet, PAYMENT_AMOUNT_LABEL);
      expect(kpiRow).toBeDefined();
      expect(kpiRow!.getCell(2).value).toBe("Ошибка данных");
      expect(kpiRow!.getCell(2).value).not.toBe(0);

      // Verify Managers Sheet (single currency -> col 10)
      const managersSheet = reloaded.getWorksheet("Managers")!;
      const m1Row = findRowByLabel(managersSheet, "Manager 1");
      expect(m1Row).toBeDefined();
      expect(m1Row!.getCell(10).value).toBe("Ошибка данных");
      expect(m1Row!.getCell(10).value).not.toBe(0);
    });

    it("FQ-4: unknown-only EUR only preserves quality and does NOT collapse to numeric zero", async () => {
      const companies = [
        makeCompany("C1", [
          { id: "D1", opportunity: null, opportunityQuality: "UNKNOWN", currencyId: "EUR" },
        ], "M1"),
      ];

      // 1. Domain Engine
      const datedKpis = computePeriodMetrics(companies, boundaries);
      const wipKpis = computeWipMetrics(companies);
      const payKpi = datedKpis.find((k) => k.id === "payment_amount")!;

      expect(payKpi.isMultiCurrency).toBe(false);
      expect(payKpi.currencyId).toBe("EUR");
      expect(payKpi.currentValue).toBeNull();
      expect(payKpi.amountQuality).toBe("UNKNOWN");

      // 2. Scorecard
      const scorecard = computeManagerScorecard(companies, boundaries, [], { M1: "Manager 1" });
      const m1 = scorecard.find((s) => s.responsibleId === "M1")!;
      expect(m1.paymentAmount).toBeNull();
      expect(m1.paymentAmountQuality).toBe("UNKNOWN");
      expect(m1.paymentAmountsQualityByCurrency?.EUR).toBe("UNKNOWN");

      // 3. Overview UI Tab
      render(
        React.createElement(CommercialOverviewTab, {
          datedKpis,
          wipKpis,
          boundaries,
          onOpenDrillDown: vi.fn(),
        })
      );
      expect(screen.getByText(/— нет данных/)).toBeInTheDocument();
      expect(screen.queryByText(/0\s?€/)).not.toBeInTheDocument();
      expect(screen.queryByText(/€\s?0/)).not.toBeInTheDocument();
      cleanup();

      // 4. Managers UI Tab
      render(
        React.createElement(CommercialManagersTab, {
          scorecard,
          onOpenDrillDown: vi.fn(),
        })
      );
      expect(screen.getAllByText(/— нет данных/).length).toBeGreaterThan(0);
      expect(screen.queryByText(/0\s?€/)).not.toBeInTheDocument();
      cleanup();

      // 5. Excel Generation & Binary Reload
      const workbook = await createCommercialFunnelWorkbook({
        companies,
        deals: companies.flatMap((c) => c.deals),
        filters: { periodPreset: "90days" },
        userNames: { M1: "Manager 1" },
        now: fixedNow,
      });

      const buffer = await workbook.xlsx.writeBuffer();
      const reloaded = new ExcelJS.Workbook();
      await reloaded.xlsx.load(buffer as any);

      // Verify Executive Summary Sheet
      const summarySheet = reloaded.getWorksheet("Executive Summary")!;
      const kpiRow = findRowByLabel(summarySheet, PAYMENT_AMOUNT_LABEL);
      expect(kpiRow).toBeDefined();
      expect(kpiRow!.getCell(2).value).toBe("Нет данных");
      expect(kpiRow!.getCell(2).value).not.toBe(0);

      // Verify Managers Sheet (single currency -> col 10)
      const managersSheet = reloaded.getWorksheet("Managers")!;
      const m1Row = findRowByLabel(managersSheet, "Manager 1");
      expect(m1Row).toBeDefined();
      expect(m1Row!.getCell(10).value).toBe("Нет данных");
      expect(m1Row!.getCell(10).value).not.toBe(0);
    });

    it("FQ-5: valid RUB 0 proves genuine zero remains numeric 0 across engine, UI, and Excel", async () => {
      const companies = [
        makeCompany("C1", [
          { id: "D1", opportunity: 0, opportunityQuality: "VALID", currencyId: "RUB" },
        ], "M1"),
      ];

      // 1. Domain Engine
      const datedKpis = computePeriodMetrics(companies, boundaries);
      const wipKpis = computeWipMetrics(companies);
      const payKpi = datedKpis.find((k) => k.id === "payment_amount")!;

      expect(payKpi.currentValue).toBe(0);
      expect(payKpi.amountQuality).toBe("COMPLETE");
      expect(payKpi.currencyBreakdown?.current.RUB).toBe(0);

      // 2. Scorecard
      const scorecard = computeManagerScorecard(companies, boundaries, [], { M1: "Manager 1" });
      const m1 = scorecard.find((s) => s.responsibleId === "M1")!;
      expect(m1.paymentAmount).toBe(0);
      expect(m1.paymentAmountQuality).toBe("COMPLETE");
      expect(m1.paymentAmountsByCurrency?.RUB).toBe(0);

      // 3. Overview UI Tab
      render(
        React.createElement(CommercialOverviewTab, {
          datedKpis,
          wipKpis,
          boundaries,
          onOpenDrillDown: vi.fn(),
        })
      );
      expect(screen.getByText(/0\s?₽/)).toBeInTheDocument();
      cleanup();

      // 4. Managers UI Tab
      render(
        React.createElement(CommercialManagersTab, {
          scorecard,
          onOpenDrillDown: vi.fn(),
        })
      );
      expect(screen.getAllByText(/0\s?₽/).length).toBeGreaterThan(0);
      cleanup();

      // 5. Excel Generation & Binary Reload
      const workbook = await createCommercialFunnelWorkbook({
        companies,
        deals: companies.flatMap((c) => c.deals),
        filters: { periodPreset: "90days" },
        userNames: { M1: "Manager 1" },
        now: fixedNow,
      });

      const buffer = await workbook.xlsx.writeBuffer();
      const reloaded = new ExcelJS.Workbook();
      await reloaded.xlsx.load(buffer as any);

      // Verify Executive Summary Sheet
      const summarySheet = reloaded.getWorksheet("Executive Summary")!;
      const kpiRow = findRowByLabel(summarySheet, PAYMENT_AMOUNT_LABEL);
      expect(kpiRow).toBeDefined();
      expect(kpiRow!.getCell(2).value).toBe(0);
      expect(typeof kpiRow!.getCell(2).value).toBe("number");

      // Verify Managers Sheet
      const managersSheet = reloaded.getWorksheet("Managers")!;
      const m1Row = findRowByLabel(managersSheet, "Manager 1");
      expect(m1Row).toBeDefined();
      expect(m1Row!.getCell(10).value).toBe(0);
      expect(typeof m1Row!.getCell(10).value).toBe("number");
    });
  });
});
