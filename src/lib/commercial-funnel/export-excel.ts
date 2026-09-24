// src/lib/commercial-funnel/export-excel.ts
// ─────────────────────────────────────────────────────────────────────
// Structured 5-sheet Excel report generator for Commercial Funnel v1.
// Consumes the EXACT same analytical dataset and engine metrics as the UI.
// Sheets: Executive Summary, Companies, Samples, Managers, Bottlenecks.
// ─────────────────────────────────────────────────────────────────────

import ExcelJS from "exceljs";
import {
  buildSampleRegister,
  computeBottlenecks,
  computeManagerScorecard,
  computePeriodMetrics,
  computeWipMetrics,
  filterCompaniesByDimensions,
} from "./engine";
import { computePeriodBoundaries } from "./date-utils";
import type {
  CommercialCompany,
  CommercialDeal,
  CommercialFilters,
} from "./types";

export interface BuildExcelOptions {
  companies: CommercialCompany[];
  deals: CommercialDeal[];
  filters: CommercialFilters;
  userNames?: Record<string, string>;
  now?: Date;
}

const HEADER_FILL: ExcelJS.Fill = {
  type: "pattern",
  pattern: "solid",
  fgColor: { argb: "FF1E293B" }, // Slate-800
};

const HEADER_FONT: Partial<ExcelJS.Font> = {
  name: "Calibri",
  size: 11,
  bold: true,
  color: { argb: "FFFFFFFF" },
};

const SECTION_HEADER_FILL: ExcelJS.Fill = {
  type: "pattern",
  pattern: "solid",
  fgColor: { argb: "FFF1F5F9" }, // Slate-100
};

const SECTION_HEADER_FONT: Partial<ExcelJS.Font> = {
  name: "Calibri",
  size: 12,
  bold: true,
  color: { argb: "FF0F172A" },
};

function styleHeaderRow(row: ExcelJS.Row) {
  row.height = 26;
  row.eachCell((cell) => {
    cell.fill = HEADER_FILL;
    cell.font = HEADER_FONT;
    cell.alignment = { vertical: "middle", horizontal: "left" };
    cell.border = {
      top: { style: "thin", color: { argb: "FFCBD5E1" } },
      bottom: { style: "medium", color: { argb: "FF0F172A" } },
      left: { style: "thin", color: { argb: "FFCBD5E1" } },
      right: { style: "thin", color: { argb: "FFCBD5E1" } },
    };
  });
}

function autoFitColumns(sheet: ExcelJS.Worksheet) {
  sheet.columns.forEach((col) => {
    let maxLen = 12;
    if (col && col.eachCell) {
      col.eachCell({ includeEmpty: false }, (cell) => {
        const val = cell.value;
        const str = typeof val === "object" && val !== null && "text" in val
          ? String((val as any).text)
          : String(val ?? "");
        if (str.length > maxLen) {
          maxLen = str.length;
        }
      });
    }
    col.width = Math.min(Math.max(maxLen + 3, 12), 50);
  });
}

/**
 * Builds the authoritative 5-sheet Excel workbook.
 */
export async function createCommercialFunnelWorkbook(
  options: BuildExcelOptions
): Promise<ExcelJS.Workbook> {
  const { companies, deals, filters, userNames = {}, now = new Date() } = options;

  const boundaries = computePeriodBoundaries(filters, now);
  const filteredCompanies = filterCompaniesByDimensions(companies, filters);

  const datedKpis = computePeriodMetrics(filteredCompanies, boundaries);
  const wipKpis = computeWipMetrics(filteredCompanies);
  const bottlenecks = computeBottlenecks(filteredCompanies, now);
  const managerScorecard = computeManagerScorecard(
    filteredCompanies,
    boundaries,
    bottlenecks,
    userNames
  );
  const sampleRegister = buildSampleRegister(filteredCompanies, now);

  const workbook = new ExcelJS.Workbook();
  workbook.creator = "RusSilica BI Terminal";
  workbook.lastModifiedBy = "RusSilica BI Terminal";
  workbook.created = now;
  workbook.modified = now;

  // ═══════════════════════════════════════════════════════════════════
  // SHEET 1: Executive Summary
  // ═══════════════════════════════════════════════════════════════════
  const summarySheet = workbook.addWorksheet("Executive Summary", {
    views: [{ showGridLines: true }],
  });

  summarySheet.addRow(["ОТЧЁТ: КОММЕРЧЕСКАЯ ВОРОНКА (RUSILICA BI)"]);
  summarySheet.getRow(1).font = { name: "Calibri", size: 16, bold: true, color: { argb: "FF0F172A" } };
  summarySheet.addRow([]);

  // Report parameters
  summarySheet.addRow(["Параметры отчёта"]);
  summarySheet.getRow(3).font = SECTION_HEADER_FONT;
  summarySheet.addRow(["Период анализа:", `${boundaries.currentStartStr} — ${boundaries.currentEndStr}`]);
  summarySheet.addRow(["Предыдущий период для сравнения:", `${boundaries.previousStartStr} — ${boundaries.previousEndStr}`]);
  summarySheet.addRow(["Дата и время формирования:", now.toISOString().replace("T", " ").slice(0, 19)]);
  summarySheet.addRow([
    "Активные фильтры:",
    `Ответственный: ${filters.responsibleId || "Все"}, Продукт: ${filters.productType || "Все"}, Отрасль: ${filters.industry || "Все"}`,
  ]);
  summarySheet.addRow([]);

  // Dated KPIs table
  const datedHeaderRowIndex = 9;
  summarySheet.addRow(["АКТИВНОСТЬ ЗА ПЕРИОД (СОБЫТИЯ С НАДЁЖНОЙ ДАТОЙ)"]);
  summarySheet.getRow(datedHeaderRowIndex).font = SECTION_HEADER_FONT;

  const kpiTableHeader = summarySheet.addRow([
    "Метрика",
    "Текущий период",
    "Предыдущий период",
    "Абсолютное изменение",
    "Изменение %",
    "Уникальных компаний",
  ]);
  styleHeaderRow(kpiTableHeader);

  for (const k of datedKpis) {
    const row = summarySheet.addRow([
      k.label,
      k.currentValue,
      k.previousValue,
      k.delta,
      k.deltaPercent !== null ? `${k.deltaPercent > 0 ? "+" : ""}${k.deltaPercent}%` : "—",
      k.companyIds.length,
    ]);
    row.height = 20;
    if (k.isCurrency) {
      row.getCell(2).numFmt = '#,##0 "₽"';
      row.getCell(3).numFmt = '#,##0 "₽"';
      row.getCell(4).numFmt = '+#,##0 "₽";-#,##0 "₽";0 "₽"';
    } else {
      row.getCell(2).numFmt = '#,##0';
      row.getCell(3).numFmt = '#,##0';
      row.getCell(4).numFmt = '+#,##0;-#,##0;0';
    }
  }
  summarySheet.addRow([]);

  // WIP Table
  const wipHeaderRowIndex = summarySheet.rowCount + 1;
  summarySheet.addRow(["ТЕКУЩИЙ ПОРТФЕЛЬ / СЕЙЧАС В РАБОТЕ (WIP)"]);
  summarySheet.getRow(wipHeaderRowIndex).font = SECTION_HEADER_FONT;

  const wipTableHeader = summarySheet.addRow([
    "Статус / Этап",
    "Уникальных компаний",
    "Связанных сделок",
  ]);
  styleHeaderRow(wipTableHeader);

  for (const w of wipKpis) {
    const row = summarySheet.addRow([w.label, w.companyCount, w.dealCount]);
    row.height = 20;
  }

  autoFitColumns(summarySheet);

  // ═══════════════════════════════════════════════════════════════════
  // SHEET 2: Companies (One row = one Company)
  // ═══════════════════════════════════════════════════════════════════
  const companiesSheet = workbook.addWorksheet("Companies", {
    views: [{ state: "frozen", ySplit: 1, showGridLines: true }],
  });

  const companiesHeader = companiesSheet.addRow([
    "ID компании",
    "Название компании",
    "Ответственный",
    "Дата создания",
    "Отрасль",
    "Регион",
    "Продукт",
    "Статус образцов",
    "Источник статуса",
    "Дата передачи / отправки",
    "Результат испытаний",
    "Текущая сделка",
    "Коммерческий этап",
    "Сумма (₽)",
    "Статус оплаты",
    "Дата оплаты",
    "Следующий шаг",
    "Требует внимания",
    "Причина внимания",
  ]);
  styleHeaderRow(companiesHeader);
  companiesSheet.autoFilter = { from: "A1", to: "S1" };

  for (const c of filteredCompanies) {
    const row = companiesSheet.addRow([
      c.id,
      c.title,
      c.responsibleName || c.responsibleId,
      c.dateCreate || "—",
      c.industry || "—",
      c.region || "—",
      c.productType.join(", ") || "—",
      c.sampleStatus,
      c.sampleStatusSource,
      c.sampleShipmentDate || "—",
      c.sampleTestResult || "—",
      c.primaryDealTitle || "—",
      c.primaryDealStageName || c.primaryDealStageId || "—",
      c.primaryDealOpportunity || 0,
      c.primaryDealPaymentStatus || "—",
      c.primaryDealPaymentDate || "—",
      c.primaryDealActivityNext || "—",
      c.hasAttention ? "Да" : "Нет",
      c.attentionReasons.join("; ") || "—",
    ]);
    row.height = 20;
    // Format currency cell
    const cellOpportunity = row.getCell(14);
    cellOpportunity.numFmt = "#,##0";
  }
  autoFitColumns(companiesSheet);

  // ═══════════════════════════════════════════════════════════════════
  // SHEET 3: Samples (Granular sample register)
  // ═══════════════════════════════════════════════════════════════════
  const samplesSheet = workbook.addWorksheet("Samples", {
    views: [{ state: "frozen", ySplit: 1, showGridLines: true }],
  });

  const samplesHeader = samplesSheet.addRow([
    "Компания",
    "Ответственный",
    "Сделка",
    "Тип продукта",
    "Статус образцов",
    "Источник статуса",
    "Дата отправки / передачи",
    "Дней с отправки",
    "Результат испытаний",
    "Марка ГЕЛЬ",
    "Марка ЗОЛЬ",
    "Количество ГЕЛЬ",
    "Количество ЗОЛЬ",
    "Следующий шаг",
  ]);
  styleHeaderRow(samplesHeader);
  samplesSheet.autoFilter = { from: "A1", to: "N1" };

  for (const s of sampleRegister) {
    const row = samplesSheet.addRow([
      s.companyTitle,
      s.responsibleName,
      s.dealTitle || "—",
      s.productType,
      s.status,
      s.statusSource,
      s.shipmentDate || "—",
      s.daysSinceSent !== undefined ? s.daysSinceSent : "—",
      s.testResult || "—",
      s.gradeGel || "—",
      s.gradeSol || "—",
      s.qtyGel || "—",
      s.qtySol || "—",
      s.nextAction || "—",
    ]);
    row.height = 20;
  }
  autoFitColumns(samplesSheet);

  // ═══════════════════════════════════════════════════════════════════
  // SHEET 4: Managers (Scorecard per responsible)
  // ═══════════════════════════════════════════════════════════════════
  const managersSheet = workbook.addWorksheet("Managers", {
    views: [{ state: "frozen", ySplit: 1, showGridLines: true }],
  });

  const managersHeader = managersSheet.addRow([
    "Менеджер",
    "Новые компании (период)",
    "Образцы отправлены (период)",
    "Сейчас на испытании",
    "Подошли",
    "Не подошли",
    "Требуют доработки",
    "Создано сделок (период)",
    "Получено оплат (период)",
    "Сумма оплат (₽)",
    "Требуют внимания",
  ]);
  styleHeaderRow(managersHeader);
  managersSheet.autoFilter = { from: "A1", to: "K1" };

  for (const m of managerScorecard) {
    const row = managersSheet.addRow([
      m.name,
      m.newCompanies,
      m.samplesSent,
      m.inTesting,
      m.sampleSuccess,
      m.sampleFail,
      m.sampleRework,
      m.dealsCreated,
      m.paymentsReceived,
      m.paymentAmount,
      m.bottlenecksCount,
    ]);
    row.height = 20;
    const cellAmount = row.getCell(10);
    cellAmount.numFmt = "#,##0";
  }
  autoFitColumns(managersSheet);

  // ═══════════════════════════════════════════════════════════════════
  // SHEET 5: Bottlenecks (Actionable items requiring attention)
  // ═══════════════════════════════════════════════════════════════════
  const bottlenecksSheet = workbook.addWorksheet("Bottlenecks", {
    views: [{ state: "frozen", ySplit: 1, showGridLines: true }],
  });

  const bottlenecksHeader = bottlenecksSheet.addRow([
    "Компания",
    "Менеджер",
    "Проблема / Причина",
    "Текущее состояние",
    "Дата события",
    "Дней ожидания",
    "Сделка",
    "Сумма (₽)",
    "Следующий шаг / Рекомендация",
  ]);
  styleHeaderRow(bottlenecksHeader);
  bottlenecksSheet.autoFilter = { from: "A1", to: "I1" };

  for (const b of bottlenecks) {
    const row = bottlenecksSheet.addRow([
      b.companyTitle,
      b.responsibleName,
      b.issueLabel,
      b.currentState,
      b.relevantDate || "—",
      b.daysWaiting,
      b.dealTitle || "—",
      b.amount || 0,
      b.nextAction || "—",
    ]);
    row.height = 20;
    const cellAmount = row.getCell(8);
    cellAmount.numFmt = "#,##0";
  }
  autoFitColumns(bottlenecksSheet);

  return workbook;
}

/**
 * Browser helper to download the workbook as an .xlsx file.
 */
export async function downloadCommercialFunnelExcel(
  options: BuildExcelOptions
): Promise<void> {
  const workbook = await createCommercialFunnelWorkbook(options);
  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  const dateStr = (options.now || new Date()).toISOString().slice(0, 10);
  a.download = `commercial_funnel_${options.filters.periodPreset}_${dateStr}.xlsx`;
  a.click();
  window.URL.revokeObjectURL(url);
}
