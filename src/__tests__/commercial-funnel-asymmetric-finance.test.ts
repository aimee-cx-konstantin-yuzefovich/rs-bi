// @vitest-environment node
import { describe, it, expect } from "vitest";
import ExcelJS from "exceljs";
import { createCommercialFunnelWorkbook } from "@/lib/commercial-funnel/export-excel";
import {
  CommercialCompany,
  CommercialDeal,
  CommercialFilters,
} from "@/lib/commercial-funnel/types";

describe("Commercial Funnel — Asymmetric Financial Quality (Section 11)", () => {
  const fixedNow = new Date("2026-09-24T12:00:00Z");

  const filters: CommercialFilters = {
    periodPreset: "custom",
    customFrom: "2026-09-01",
    customTo: "2026-09-30",
    responsibleId: "all",
    productType: "all",
    industry: "all",
    direction: "all",
    region: "all",
  };

  // Helper to extract Payment Amount row from Executive Summary sheet
  async function generateAndLoadPaymentRow(companies: CommercialCompany[], deals: CommercialDeal[]) {
    const workbook = await createCommercialFunnelWorkbook({
      companies,
      deals,
      filters,
      userNames: { "u-1": "Менеджер Тестовый" },
      now: fixedNow,
    });

    const buffer = await workbook.xlsx.writeBuffer();
    const reloaded = new ExcelJS.Workbook();
    await reloaded.xlsx.load(buffer as any);

    const sheet = reloaded.getWorksheet("Executive Summary")!;
    let targetRow: ExcelJS.Row | undefined;

    sheet.eachRow((row) => {
      const label = String(row.getCell(1).value || "");
      if (label.includes("Сумма сделок с полученной оплатой")) {
        targetRow = row;
      }
    });

    if (!targetRow) {
      throw new Error("Payment Amount row not found in Executive Summary");
    }

    return {
      label: String(targetRow.getCell(1).value || ""),
      currVal: targetRow.getCell(2).value,
      currNote: targetRow.getCell(2).note,
      prevVal: targetRow.getCell(3).value,
      prevNote: targetRow.getCell(3).note,
      delta: targetRow.getCell(4).value,
      deltaPct: targetRow.getCell(5).value,
    };
  }

  // CASE A: Current COMPLETE (500,000 RUB), Previous UNKNOWN (null)
  it("Case A: current COMPLETE, previous UNKNOWN -> previous is 'Нет данных' (never 0), delta is '—'", async () => {
    // Current deal: paid in September 2026, 500k RUB, valid
    const dealCurrent: CommercialDeal = {
      id: "deal-curr",
      title: "Сделка Текущая",
      companyId: "c-1",
      responsibleId: "u-1",
      stageId: "C4:WON",
      categoryId: "0",
      opportunity: 500000,
      opportunityQuality: "VALID",
      currencyId: "RUB",
      paymentStatus: "113",
      paymentDate: "2026-09-15",
      productType: [],
      direction: [],
      industry: [],
      sampleTestingStatus: [],
    };
    // Previous deal: paid in August 2026, opportunity UNKNOWN
    const dealPrevUnknown: CommercialDeal = {
      id: "deal-prev-unk",
      title: "Сделка Прошлая Неизвестная",
      companyId: "c-1",
      responsibleId: "u-1",
      stageId: "C4:WON",
      categoryId: "0",
      opportunity: null,
      opportunityQuality: "UNKNOWN",
      currencyId: "RUB",
      paymentStatus: "113",
      paymentDate: "2026-08-15",
      productType: [],
      direction: [],
      industry: [],
      sampleTestingStatus: [],
    };

    const comp: CommercialCompany = {
      id: "c-1",
      title: "Компания 1",
      responsibleId: "u-1",
      sampleStatus: "Не требуется",
      sampleStatusSource: "NONE",
      deals: [dealCurrent, dealPrevUnknown],
      productType: [],
      direction: [],
      gradeGel: [],
      gradeSol: [],
      sampleAllDates: [],
      hasAttention: false,
      attentionReasons: [],
    };

    const res = await generateAndLoadPaymentRow([comp], [dealCurrent, dealPrevUnknown]);

    expect(res.currVal).toBe(500000);
    expect(res.prevVal).toBe("Нет данных");
    expect(res.prevVal).not.toBe(0);
    expect(res.delta).toBe("—");
    expect(res.deltaPct).toBe("—");
  });

  // CASE B: Current UNKNOWN (null), Previous COMPLETE (100,000 RUB)
  it("Case B: current UNKNOWN, previous COMPLETE -> current is 'Нет данных', previous is 100,000, delta is '—'", async () => {
    // Current deal: paid in September 2026, opportunity UNKNOWN
    const dealCurrUnknown: CommercialDeal = {
      id: "deal-curr-unk",
      title: "Сделка Текущая Неизвестная",
      companyId: "c-2",
      responsibleId: "u-1",
      stageId: "C4:WON",
      categoryId: "0",
      opportunity: null,
      opportunityQuality: "UNKNOWN",
      currencyId: "RUB",
      paymentStatus: "113",
      paymentDate: "2026-09-15",
      productType: [],
      direction: [],
      industry: [],
      sampleTestingStatus: [],
    };
    // Prior period deal: paid in August 2026, 100k RUB, valid
    const dealPrev: CommercialDeal = {
      id: "deal-prev",
      title: "Сделка Прошлая",
      companyId: "c-2",
      responsibleId: "u-1",
      stageId: "C4:WON",
      categoryId: "0",
      opportunity: 100000,
      opportunityQuality: "VALID",
      currencyId: "RUB",
      paymentStatus: "113",
      paymentDate: "2026-08-15",
      productType: [],
      direction: [],
      industry: [],
      sampleTestingStatus: [],
    };

    const comp: CommercialCompany = {
      id: "c-2",
      title: "Компания 2",
      responsibleId: "u-1",
      sampleStatus: "Не требуется",
      sampleStatusSource: "NONE",
      deals: [dealCurrUnknown, dealPrev],
      productType: [],
      direction: [],
      gradeGel: [],
      gradeSol: [],
      sampleAllDates: [],
      hasAttention: false,
      attentionReasons: [],
    };

    const res = await generateAndLoadPaymentRow([comp], [dealCurrUnknown, dealPrev]);

    expect(res.currVal).toBe("Нет данных");
    expect(res.prevVal).toBe(100000);
    expect(res.prevVal).not.toBe("Нет данных");
    expect(res.delta).toBe("—");
    expect(res.deltaPct).toBe("—");
  });

  // CASE C: Current PARTIAL (500,000 RUB), Previous COMPLETE (100,000 RUB)
  it("Case C: current PARTIAL, previous COMPLETE -> current has note, delta is '—'", async () => {
    const dealCurrValid: CommercialDeal = {
      id: "deal-c-val",
      title: "Сделка Тек Валидная",
      companyId: "c-3",
      responsibleId: "u-1",
      stageId: "C4:WON",
      categoryId: "0",
      opportunity: 500000,
      opportunityQuality: "VALID",
      currencyId: "RUB",
      paymentStatus: "113",
      paymentDate: "2026-09-10",
      productType: [],
      direction: [],
      industry: [],
      sampleTestingStatus: [],
    };
    const dealCurrInvalid: CommercialDeal = {
      id: "deal-c-inv",
      title: "Сделка Тек Невалидная",
      companyId: "c-3",
      responsibleId: "u-1",
      stageId: "C4:WON",
      categoryId: "0",
      opportunity: null,
      opportunityQuality: "INVALID",
      currencyId: "RUB",
      paymentStatus: "113",
      paymentDate: "2026-09-12",
      productType: [],
      direction: [],
      industry: [],
      sampleTestingStatus: [],
    };
    const dealPrevValid: CommercialDeal = {
      id: "deal-c-prev",
      title: "Сделка Пред Валидная",
      companyId: "c-3",
      responsibleId: "u-1",
      stageId: "C4:WON",
      categoryId: "0",
      opportunity: 100000,
      opportunityQuality: "VALID",
      currencyId: "RUB",
      paymentStatus: "113",
      paymentDate: "2026-08-15",
      productType: [],
      direction: [],
      industry: [],
      sampleTestingStatus: [],
    };

    const comp: CommercialCompany = {
      id: "c-3",
      title: "Компания 3",
      responsibleId: "u-1",
      sampleStatus: "Не требуется",
      sampleStatusSource: "NONE",
      deals: [dealCurrValid, dealCurrInvalid, dealPrevValid],
      productType: [],
      direction: [],
      gradeGel: [],
      gradeSol: [],
      sampleAllDates: [],
      hasAttention: false,
      attentionReasons: [],
    };

    const res = await generateAndLoadPaymentRow([comp], [dealCurrValid, dealCurrInvalid, dealPrevValid]);

    expect(res.currVal).toBe(500000);
    expect(res.currNote).toContain("Неполные данные");
    expect(res.prevVal).toBe(100000);
    expect(res.delta).toBe("—");
    expect(res.deltaPct).toBe("—");
  });

  // CASE D: Current COMPLETE (500,000 RUB), Previous PARTIAL (100,000 RUB)
  it("Case D: current COMPLETE, previous PARTIAL -> previous has note, delta is '—'", async () => {
    const dealCurrValid: CommercialDeal = {
      id: "deal-d-val",
      title: "Сделка Тек Валидная",
      companyId: "c-4",
      responsibleId: "u-1",
      stageId: "C4:WON",
      categoryId: "0",
      opportunity: 500000,
      opportunityQuality: "VALID",
      currencyId: "RUB",
      paymentStatus: "113",
      paymentDate: "2026-09-10",
      productType: [],
      direction: [],
      industry: [],
      sampleTestingStatus: [],
    };
    const dealPrevValid: CommercialDeal = {
      id: "deal-d-prev-val",
      title: "Сделка Пред Валидная",
      companyId: "c-4",
      responsibleId: "u-1",
      stageId: "C4:WON",
      categoryId: "0",
      opportunity: 100000,
      opportunityQuality: "VALID",
      currencyId: "RUB",
      paymentStatus: "113",
      paymentDate: "2026-08-10",
      productType: [],
      direction: [],
      industry: [],
      sampleTestingStatus: [],
    };
    const dealPrevInvalid: CommercialDeal = {
      id: "deal-d-prev-inv",
      title: "Сделка Пред Невалидная",
      companyId: "c-4",
      responsibleId: "u-1",
      stageId: "C4:WON",
      categoryId: "0",
      opportunity: null,
      opportunityQuality: "INVALID",
      currencyId: "RUB",
      paymentStatus: "113",
      paymentDate: "2026-08-12",
      productType: [],
      direction: [],
      industry: [],
      sampleTestingStatus: [],
    };

    const comp: CommercialCompany = {
      id: "c-4",
      title: "Компания 4",
      responsibleId: "u-1",
      sampleStatus: "Не требуется",
      sampleStatusSource: "NONE",
      deals: [dealCurrValid, dealPrevValid, dealPrevInvalid],
      productType: [],
      direction: [],
      gradeGel: [],
      gradeSol: [],
      sampleAllDates: [],
      hasAttention: false,
      attentionReasons: [],
    };

    const res = await generateAndLoadPaymentRow([comp], [dealCurrValid, dealPrevValid, dealPrevInvalid]);

    expect(res.currVal).toBe(500000);
    expect(res.prevVal).toBe(100000);
    expect(res.prevNote).toContain("Неполные данные");
    expect(res.delta).toBe("—");
    expect(res.deltaPct).toBe("—");
  });
});
