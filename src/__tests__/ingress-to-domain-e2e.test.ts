// src/__tests__/ingress-to-domain-e2e.test.ts
// ─────────────────────────────────────────────────────────────────────
// End-to-end integration test from ingress pagination through normalization,
// pure domain analytics, to Excel export and binary reload.
// Validates all global contracts and invariants against adversarial input:
// - Cross-page deduplication
// - Invalid calendar date rejection (no 2026-02-31 rollover)
// - Strict numeric parsing (rejection of junk numbers, preservation of valid 0)
// - Truthful multi-currency preservation
// - Strict provenance for sample shipment dates and next actions
// - Truthful bottleneck labeling
// - Excel binary reload with cell-by-cell verification
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
  DEAL_SAMPLE_TRANSFER_FIELD_ID,
  DEAL_SAMPLE_TESTING_FIELD_ID,
  DEAL_SAMPLE_SENT_DATE_FIELD_ID,
  DEAL_PAYMENT_DATE_FIELD_ID,
  DEAL_SHIPMENT_DATE_FIELD_ID,
  DEAL_PRODUCT_TYPE_FIELD_ID,
  PAYMENT_STATUS_FIELD_ID,
} from "@/lib/crm-constants";

vi.mock("@/lib/bitrix", () => ({
  bitrixPost: vi.fn(),
}));

describe("Ingress-to-Domain End-to-End Pipeline Fixture", () => {
  const fixedNow = new Date("2026-03-25T12:00:00Z");
  const userNames: Record<string, string> = {
    "1": "Алексей Иванов",
    "2": "Мария Смирнова",
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("processes full adversarial ingress stream through domain analytics to Excel reload", async () => {
    // ── 1. Ingress Mock: 2 pages of deals with duplicate across pages, bad dates, and junk opportunity ──
    const page1Deals = [
      {
        ID: "1001",
        TITLE: "Сделка 1001 - Валидная оплата",
        COMPANY_ID: "C1",
        STAGE_ID: "WON",
        OPPORTUNITY: "1 500 000,50",
        CURRENCY_ID: "RUB",
        DATE_CREATE: "2026-01-10",
        ASSIGNED_BY_ID: "1",
        [DEAL_PAYMENT_DATE_FIELD_ID]: "2026-03-01",
        [PAYMENT_STATUS_FIELD_ID]: "113", // Paid
      },
      {
        ID: "1002",
        TITLE: "Сделка 1002 - Наложение на границе страниц",
        COMPANY_ID: "C1",
        STAGE_ID: "EXECUTING",
        OPPORTUNITY: "200000",
        CURRENCY_ID: "RUB",
        DATE_CREATE: "2026-01-01",
        ASSIGNED_BY_ID: "1",
      },
      {
        ID: "1003",
        TITLE: "Сделка 1003 - Невозможная дата и мусорная сумма",
        COMPANY_ID: "C2",
        STAGE_ID: "NEW",
        OPPORTUNITY: "1000rub", // Junk number
        CURRENCY_ID: "USD",
        DATE_CREATE: "2026-02-31", // Impossible calendar date
        ASSIGNED_BY_ID: "2",
      },
    ];

    const page2Deals = [
      {
        // Duplicate ID 1002 appearing across pagination boundaries (Bitrix offset boundary shift)
        ID: "1002",
        TITLE: "Сделка 1002 - Дубль со страницы 2",
        COMPANY_ID: "C1",
        STAGE_ID: "EXECUTING",
        OPPORTUNITY: "200000",
        CURRENCY_ID: "RUB",
        DATE_CREATE: "2026-01-01",
        ASSIGNED_BY_ID: "1",
      },
      {
        ID: "1004",
        TITLE: "Сделка 1004 - Реальный ноль в USD",
        COMPANY_ID: "C2",
        STAGE_ID: "WON",
        OPPORTUNITY: "0",
        CURRENCY_ID: "USD",
        DATE_CREATE: "2026-02-15",
        ASSIGNED_BY_ID: "2",
        [DEAL_PAYMENT_DATE_FIELD_ID]: "2026-03-05",
        [PAYMENT_STATUS_FIELD_ID]: "113", // Paid
      },
      {
        ID: "1005",
        TITLE: "Сделка 1005 - Образцы с датой отправки",
        COMPANY_ID: "C3",
        STAGE_ID: "EXECUTING",
        OPPORTUNITY: "75000",
        CURRENCY_ID: "RUB",
        DATE_CREATE: "2026-02-20",
        ASSIGNED_BY_ID: "1",
        [DEAL_SAMPLE_TRANSFER_FIELD_ID]: "DT1032_15:UC_ZARRMX", // Образцы отправлены
        [DEAL_SAMPLE_SENT_DATE_FIELD_ID]: "2026-02-22",
      },
    ];

    // Mock bitrixPost for deals
    vi.mocked(bitrixPost)
      .mockResolvedValueOnce({
        total: 5,
        result: page1Deals,
        next: 3,
      })
      .mockResolvedValueOnce({
        total: 5,
        result: page2Deals,
        next: undefined,
      });

    const rawDeals = await fetchAllPages("crm.deal.list", {}, "ID");
    // Ingress deduplication verified: 5 unique deals
    expect(rawDeals).toHaveLength(5);
    expect(rawDeals.map((d) => d.ID)).toEqual(["1001", "1002", "1003", "1004", "1005"]);

    // Raw companies
    const rawCompanies = [
      { ID: "C1", TITLE: "АО «РусСилика Тест 1»", ASSIGNED_BY_ID: "1", DATE_CREATE: "2026-01-01" },
      { ID: "C2", TITLE: "ООО «Американ Партнер»", ASSIGNED_BY_ID: "2", DATE_CREATE: "2026-02-01" },
      { ID: "C3", TITLE: "ПАО «ХимСнаб»", ASSIGNED_BY_ID: "1", DATE_CREATE: "2026-02-10" },
    ];

    // ── 2. Normalization Layer ──
    const deals = normalizeDeals(rawDeals, { userNames });
    expect(deals).toHaveLength(5);

    // Deal 1001: strict parsed number
    const d1001 = deals.find((d) => d.id === "1001")!;
    expect(d1001.opportunity).toBe(1500000.5);
    expect(d1001.opportunityQuality).toBe("VALID");
    expect(d1001.currencyId).toBe("RUB");

    // Deal 1003: junk number is rejected (null) and bad date is rejected (undefined)
    const d1003 = deals.find((d) => d.id === "1003")!;
    expect(d1003.opportunity).toBeNull();
    expect(d1003.opportunityQuality).toBe("INVALID");
    expect(d1003.dateCreate).toBeUndefined(); // 2026-02-31 rejected, no rollover!
    expect(d1003.currencyId).toBe("USD");

    // Deal 1004: real 0 preserved
    const d1004 = deals.find((d) => d.id === "1004")!;
    expect(d1004.opportunity).toBe(0);
    expect(d1004.opportunityQuality).toBe("VALID");

    const companies = normalizeCompanies(rawCompanies, deals, { userNames, now: fixedNow });
    expect(companies).toHaveLength(3);

    // ── 3. Pure Analytics Engine ──
    const boundaries = computePeriodBoundaries({ periodPreset: "90days" }, fixedNow);
    const datedKpis = computePeriodMetrics(companies, boundaries);

    // New companies: all 3 in period
    const newCompKpi = datedKpis.find((k) => k.id === "new_companies")!;
    expect(newCompKpi.currentValue).toBe(3);

    // Payments received: 2 unique companies (C1 with deal 1001, C2 with deal 1004)
    const payKpi = datedKpis.find((k) => k.id === "payments_received")!;
    expect(payKpi.currentValue).toBe(2);

    // Payment amount: multi-currency (RUB + USD), scalar sum forbidden
    const payAmtKpi = datedKpis.find((k) => k.id === "payment_amount")!;
    expect(payAmtKpi.isMultiCurrency).toBe(true);
    expect(payAmtKpi.currentValue).toBeNull();
    expect(payAmtKpi.currencyBreakdown?.current.RUB).toBe(1500000.5);
    expect(payAmtKpi.currencyBreakdown?.current.USD).toBe(0);
    expect(payAmtKpi.amountQuality).toBe("COMPLETE");

    // Bottlenecks: deal 1002 is 83 days old without activity data
    const bottlenecks = computeBottlenecks(companies, fixedNow);
    const b1002 = bottlenecks.find((b) => b.dealId === "1002")!;
    expect(b1002).toBeDefined();
    expect(b1002.daysWaiting).toBe(83);
    expect(b1002.issueLabel).toBe("Старая активная сделка (83 дн., данные активности недоступны)");
    expect(b1002.nextAction).toBeUndefined();

    // Sample Register: strictly deal 1005 with its own shipment date
    const sampleRegister = buildSampleRegister(companies, fixedNow);
    expect(sampleRegister).toHaveLength(1);
    expect(sampleRegister[0].dealId).toBe("1005");
    expect(sampleRegister[0].shipmentDate).toBe("2026-02-22");
    expect(sampleRegister[0].status).toBe("Образцы отправлены");

    // ── 4. Excel Export & Binary Reload ──
    const workbook = await createCommercialFunnelWorkbook({
      companies,
      deals,
      filters: { periodPreset: "90days" },
      userNames,
      now: fixedNow,
    });

    const buffer = await workbook.xlsx.writeBuffer();
    expect(buffer.byteLength).toBeGreaterThan(1000);

    const reloaded = new ExcelJS.Workbook();
    await reloaded.xlsx.load(buffer);

    // Verify all 5 sheets
    expect(reloaded.worksheets.map((w) => w.name)).toEqual([
      "Executive Summary",
      "Companies",
      "Samples",
      "Managers",
      "Bottlenecks",
    ]);

    // Inspect Companies sheet cell values
    const compSheet = reloaded.getWorksheet("Companies")!;
    let c1Row: ExcelJS.Row | undefined;
    let c2Row: ExcelJS.Row | undefined;

    compSheet.eachRow((r, num) => {
      if (num === 1) return;
      if (r.getCell(1).value === "C1") c1Row = r;
      if (r.getCell(1).value === "C2") c2Row = r;
    });

    expect(c1Row).toBeDefined();
    // Primary deal for C1: active deal 1002 (EXECUTING) takes deterministic priority over closed deal 1001 (WON)
    expect(c1Row!.getCell(14).value).toBe(200000);

    expect(c2Row).toBeDefined();
    // Primary deal for C2: active deal 1003 (NEW) takes precedence over closed deal 1004 (WON).
    // Deal 1003 has invalid opportunity ("1000rub"), exported faithfully as "Неверная сумма"
    expect(c2Row!.getCell(14).value).toBe("Неверная сумма");

    // Inspect Samples sheet
    const sampleSheet = reloaded.getWorksheet("Samples")!;
    let sampleRow: ExcelJS.Row | undefined;
    sampleSheet.eachRow((r) => {
      const dealTitleVal = String(r.getCell(3).value || "");
      if (dealTitleVal.includes("1005")) sampleRow = r;
    });
    expect(sampleRow).toBeDefined();
    expect(sampleRow!.getCell(5).value).toBe("Образцы отправлены");
    const shipmentCellVal = sampleRow!.getCell(7).value;
    expect(shipmentCellVal).toBeInstanceOf(Date);
    expect((shipmentCellVal as Date).toISOString()).toContain("2026-02-22");
  });
});
