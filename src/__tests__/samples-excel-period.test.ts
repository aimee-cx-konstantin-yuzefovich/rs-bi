// @vitest-environment node
import { describe, expect, it } from "vitest";
import { buildSamplesWorkbook } from "@/lib/export-utils";
import { formatSamplesPeriodLabel } from "@/components/dashboard/samples/samples-filters";
import type { SampleSummary } from "@/lib/samples/types";

describe("Samples Excel Period Disclosure Contract (Defect C: C1 to C6)", () => {
  const mockSummary: SampleSummary = {
    companyId: "c-1",
    companyTitle: "Компания Тест",
    responsibleId: "u-1",
    responsibleName: "Иван Иванов",
    industry: "Химия",
    application: "Осушка",
    productFamilies: ["КСКГ"],
    grades: [{ value: "КСКГ" }],
    quantities: [{ value: 50, unit: "кг" }],
    sentDates: ["2026-09-15"],
    sampleIndicators: ["Образец передан"],
    processStatuses: ["На испытаниях"],
    normalizedResult: "pending",
    relatedDeals: [{ id: "d-1", title: "Сделка 1", sampleTestingStatus: [] }],
    sourceQuality: "structured",
    dataIssues: [],
  };

  function extractPeriodFromWorkbook(workbook: any): string {
    const sheet = workbook.getWorksheet("Образцы");
    const row2 = sheet?.getRow(2);
    const metaCell = row2?.getCell(2);
    const value = String(metaCell?.value || "");
    const match = /Период:\s*([^|]+)/.exec(value);
    return match ? match[1].trim() : "";
  }

  it("C1 7days workbook says 7 дней", async () => {
    const label = formatSamplesPeriodLabel({ period: "7days" });
    expect(label).toBe("7 дней");

    const workbook = await buildSamplesWorkbook({
      summaries: [mockSummary],
      filters: { period: "7days" },
    });
    const periodStr = extractPeriodFromWorkbook(workbook);
    expect(periodStr).toBe("7 дней");
    expect(periodStr).not.toBe("Все");
  });

  it("C2 14days workbook says 14 дней", async () => {
    const label = formatSamplesPeriodLabel({ period: "14days" });
    expect(label).toBe("14 дней");

    const workbook = await buildSamplesWorkbook({
      summaries: [mockSummary],
      filters: { period: "14days" },
    });
    const periodStr = extractPeriodFromWorkbook(workbook);
    expect(periodStr).toBe("14 дней");
    expect(periodStr).not.toBe("Все");
  });

  it("C3 30days workbook says 30 дней", async () => {
    const label = formatSamplesPeriodLabel({ period: "30days" });
    expect(label).toBe("30 дней");

    const workbook = await buildSamplesWorkbook({
      summaries: [mockSummary],
      filters: { period: "30days" },
    });
    const periodStr = extractPeriodFromWorkbook(workbook);
    expect(periodStr).toBe("30 дней");
    expect(periodStr).not.toBe("Все");
  });

  it("C4 90days workbook says 90 дней", async () => {
    const label = formatSamplesPeriodLabel({ period: "90days" });
    expect(label).toBe("90 дней");

    const workbook = await buildSamplesWorkbook({
      summaries: [mockSummary],
      filters: { period: "90days" },
    });
    const periodStr = extractPeriodFromWorkbook(workbook);
    expect(periodStr).toBe("90 дней");
    expect(periodStr).not.toBe("Все");
  });

  it("C5 custom workbook shows exact range", async () => {
    const label = formatSamplesPeriodLabel({
      period: "custom",
      customFrom: "2026-09-10",
      customTo: "2026-09-20",
    });
    expect(label).toBe("10.09.2026 — 20.09.2026");

    const workbook = await buildSamplesWorkbook({
      summaries: [mockSummary],
      filters: {
        period: "custom",
        customFrom: "2026-09-10",
        customTo: "2026-09-20",
      },
    });
    const periodStr = extractPeriodFromWorkbook(workbook);
    expect(periodStr).toBe("10.09.2026 — 20.09.2026");
    expect(periodStr).not.toBe("Все");

    // Also inverted range normalizes correctly in export
    const workbookSwapped = await buildSamplesWorkbook({
      summaries: [mockSummary],
      filters: {
        period: "custom",
        customFrom: "2026-09-20",
        customTo: "2026-09-10",
      },
    });
    expect(extractPeriodFromWorkbook(workbookSwapped)).toBe("10.09.2026 — 20.09.2026");
  });

  it("C6 incomplete custom does not export a report labelled 'Все'", async () => {
    // 1. Label helper returns null for incomplete custom
    expect(formatSamplesPeriodLabel({ period: "custom", customFrom: "2026-09-10" })).toBeNull();
    expect(formatSamplesPeriodLabel({ period: "custom", customTo: "2026-09-20" })).toBeNull();
    expect(formatSamplesPeriodLabel({ period: "custom", customFrom: "2026-02-31", customTo: "2026-03-20" })).toBeNull();

    // 2. buildSamplesWorkbook throws fail-closed error instead of defaulting to "Все"
    await expect(
      buildSamplesWorkbook({
        summaries: [mockSummary],
        filters: { period: "custom", customFrom: "2026-09-10" },
      })
    ).rejects.toThrow("Экспорт отключён");

    await expect(
      buildSamplesWorkbook({
        summaries: [mockSummary],
        filters: { period: "custom", customFrom: "2026-02-31", customTo: "2026-03-20" },
      })
    ).rejects.toThrow("Экспорт отключён");
  });
});
