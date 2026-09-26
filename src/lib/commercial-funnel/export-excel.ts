// src/lib/commercial-funnel/export-excel.ts
// ─────────────────────────────────────────────────────────────────────
// Structured 5-sheet RusSilica Management Excel report generator.
// Consumes the EXACT same analytical dataset and engine metrics as the UI.
// Sheets: Executive Summary, Companies, Samples, Managers, Bottlenecks.
// ─────────────────────────────────────────────────────────────────────

import ExcelJS from "exceljs";
import {
  COMMERCIAL_TIMEZONE,
  PAID_STATUS_CODES,
  PAYMENT_AMOUNT_LABEL,
} from "./constants";
import {
  buildSampleRegister,
  computeBottlenecks,
  computeManagerScorecard,
  computePeriodMetrics,
  computeWipMetrics,
  filterCompaniesByDimensions,
} from "./engine";
import {
  computePeriodBoundaries,
  isDateInPeriod,
  safeDeltaPercent,
} from "./date-utils";
import { normalizeCurrencyCode } from "./normalize";
import { parseStrictDate } from "@/lib/date-safety";
import type {
  CommercialCompany,
  CommercialDeal,
  CommercialFilters,
} from "./types";
import {
  addBrandLogo,
  addCorporateDivider,
  addCorporateFooter,
  addOperationalHeader,
  addSectionHeader,
  applyRowBorders,
  applyStatusCell,
  autoFitColumns,
  configureWorksheetPrint,
  FONT_DATA,
  FONT_METADATA_LABEL,
  FONT_METADATA_VALUE,
  FONT_REPORT_SUBTITLE,
  FONT_REPORT_TITLE,
  FONT_SECTION_HEADER_WHITE,
  formatPaymentStatusToRussian,
  formatReportDateForFilename,
  formatReportDateTime,
  formatStageToRussian,
  getDeltaMoneyNumFmt,
  getMoneyNumFmt,
  NUMFMT,
  registerBrandLogo,
  REPORT_TIMEZONE,
  RS_BLUE_PRIMARY,
  RS_FONT_FAMILY,
  RS_SYSTEM_TITLE,
  RS_TEXT_SECONDARY,
  styleDataRows,
  styleTableHeader,
  THIN_BORDER,
} from "@/lib/excel-brand";

/**
 * Convert ISO date or datetime string to native Date object for Excel.
 * Returns null if missing or invalid, ensuring empty cells stay blank.
 */
function toExcelDate(dateStr?: string | null): Date | null {
  return parseStrictDate(dateStr);
}
function sanitizeExcelValue(val: any): any {
  if (typeof val === "string" && /^[=\-+\@]/.test(val)) {
    return "'" + val;
  }
  return val;
}

function sRow(vals: any[]): any[] {
  return vals.map(sanitizeExcelValue);
}


export interface BuildExcelOptions {
  companies: CommercialCompany[];
  deals: CommercialDeal[];
  filters: CommercialFilters;
  userNames?: Record<string, string>;
  now?: Date;
}

/**
 * Builds the authoritative branded 5-sheet RusSilica Commercial Funnel workbook.
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
  workbook.creator = RS_SYSTEM_TITLE;
  workbook.lastModifiedBy = RS_SYSTEM_TITLE;
  workbook.created = now;
  workbook.modified = now;

  // Register logo once on workbook; reused across all 5 sheets
  const logoImageId = await registerBrandLogo(workbook);

  // Monkey-patch addRow for formula injection prevention
  const originalAddWorksheet = workbook.addWorksheet.bind(workbook);
  workbook.addWorksheet = (name, options) => {
    const sheet = originalAddWorksheet(name, options);
    const originalAddRow = sheet.addRow.bind(sheet);
    sheet.addRow = (vals: any, style?: string) => {
      if (Array.isArray(vals)) {
        return originalAddRow(sRow(vals), style);
      }
      return originalAddRow(vals, style);
    };
    return sheet;
  };

function formatPeriodPresetToRussian(preset: string): string {
  switch (preset) {
    case "7days": return "7 дней";
    case "14days": return "14 дней";
    case "30days": return "30 дней";
    case "90days": return "90 дней";
    case "custom": return "Пользовательский период";
    case "all": return "Все";
    default: return preset;
  }
}

  const periodLabel = `${boundaries.currentStartStr} — ${boundaries.currentEndStr} (${formatPeriodPresetToRussian(filters.periodPreset)})`;
  const respLabel =
    filters.responsibleId && filters.responsibleId !== "all"
      ? userNames[filters.responsibleId] || `ID ${filters.responsibleId}`
      : "Все";
  const prodLabel = filters.productType && filters.productType !== "all" ? filters.productType : "Все";
  const indLabel = filters.industry && filters.industry !== "all" ? filters.industry : "Все";
  const dirLabel = filters.direction && filters.direction !== "all" ? filters.direction : "Все";
  const regLabel = filters.region && filters.region !== "all" ? filters.region : "Все";
  const customDatesLabel =
    filters.periodPreset === "custom" && filters.customFrom && filters.customTo
      ? `${filters.customFrom} — ${filters.customTo}`
      : "Не применяются";

  const filtersSummaryText = `Ответственный: ${respLabel} | Продукт: ${prodLabel} | Отрасль: ${indLabel} | Направление: ${dirLabel} | Регион: ${regLabel}`;

  // ═══════════════════════════════════════════════════════════════════
  // SHEET 1: Executive Summary (Branded Management Report)
  // ═══════════════════════════════════════════════════════════════════
  const summarySheet = workbook.addWorksheet("Executive Summary", {
    views: [{ showGridLines: true }],
  });

  const col1 = summarySheet.getColumn(1);
  col1.width = 46;

  // Place larger logo in Col A (height ~82px, width ~83px)
  if (logoImageId !== null) {
    addBrandLogo(summarySheet, logoImageId, { height: 82, col: 0.15, row: 0.15 });
  }

  // Row 1: Title
  const row1 = summarySheet.getRow(1);
  row1.height = 28;
  summarySheet.mergeCells(1, 2, 1, 6);
  const titleCell = row1.getCell(2);
  titleCell.value = "КОММЕРЧЕСКАЯ ВОРОНКА";
  titleCell.font = FONT_REPORT_TITLE;
  titleCell.alignment = { vertical: "middle", horizontal: "left" };

  // Row 2: Subtitle
  const row2 = summarySheet.getRow(2);
  row2.height = 20;
  summarySheet.mergeCells(2, 2, 2, 6);
  const subCell = row2.getCell(2);
  subCell.value = "Управленческий отчёт RusSilica BI";
  subCell.font = FONT_REPORT_SUBTITLE;
  subCell.alignment = { vertical: "middle", horizontal: "left" };

  summarySheet.addRow([]);

  // Report parameters & full filter disclosures
  addSectionHeader(summarySheet, "ПАРАМЕТРЫ ОТЧЁТА", 6, { soft: true, height: 20 });

  const paramRows: [string, string][] = [
    ["Период анализа:", periodLabel],
    ["Предыдущий период для сравнения:", `${boundaries.previousStartStr} — ${boundaries.previousEndStr}`],
    ["Бизнес-часовой пояс:", `Москва (${COMMERCIAL_TIMEZONE}, UTC+3)`],
    ["Дата и время формирования:", `${formatReportDateTime(now)} (Москва, UTC+3)`],
    ["Ответственный:", respLabel],
    ["Продукт:", prodLabel],
    ["Отрасль:", indLabel],
    ["Направление:", dirLabel],
    ["Регион:", regLabel],
    ["Пользовательский диапазон:", customDatesLabel],
  ];

  for (const [lbl, val] of paramRows) {
    const r = summarySheet.addRow([lbl, val]);
    r.height = 18;
    summarySheet.mergeCells(r.number, 2, r.number, 6);

    const lCell = r.getCell(1);
    lCell.font = FONT_METADATA_LABEL;
    lCell.alignment = { vertical: "middle", indent: 1 };

    const vCell = r.getCell(2);
    vCell.font = FONT_METADATA_VALUE;
    vCell.alignment = { vertical: "middle", indent: 1 };
  }

  // Corporate Divider beneath metadata
  const divRowNum = summarySheet.rowCount + 1;
  addCorporateDivider(summarySheet, divRowNum, 6);
  summarySheet.addRow([]); // Spacer

  // ── Executive KPI Cards (drawn strictly from datedKpis) ──
  addSectionHeader(summarySheet, "КЛЮЧЕВЫЕ ПОКАЗАТЕЛИ (KPI)", 6, { soft: true, height: 20 });

  const kpiNewComp = datedKpis.find((k) => k.id === "new_companies");
  const kpiSamples = datedKpis.find((k) => k.id === "samples_sent");
  const kpiDeals = datedKpis.find((k) => k.id === "deals_created");
  const kpiPayments = datedKpis.find((k) => k.id === "payments_received");
  const kpiAmount = datedKpis.find((k) => k.id === "payment_amount");

  // Row 1: Top 3 volume metrics (New Companies, Samples Sent, Deals Created)
  const valRow1 = summarySheet.addRow([
    kpiNewComp?.currentValue ?? 0,
    null,
    kpiSamples?.currentValue ?? 0,
    null,
    kpiDeals?.currentValue ?? 0,
    null,
  ]);
  valRow1.height = 26;
  summarySheet.mergeCells(valRow1.number, 1, valRow1.number, 2);
  summarySheet.mergeCells(valRow1.number, 3, valRow1.number, 4);
  summarySheet.mergeCells(valRow1.number, 5, valRow1.number, 6);

  const lblRow1 = summarySheet.addRow([
    `[KPI] ${kpiNewComp?.label ?? "Новые компании"}`,
    null,
    `[KPI] ${kpiSamples?.label ?? "Образцы отправлены"}`,
    null,
    `[KPI] ${kpiDeals?.label ?? "Создано сделок"}`,
    null,
  ]);
  lblRow1.height = 18;
  summarySheet.mergeCells(lblRow1.number, 1, lblRow1.number, 2);
  summarySheet.mergeCells(lblRow1.number, 3, lblRow1.number, 4);
  summarySheet.mergeCells(lblRow1.number, 5, lblRow1.number, 6);

  // Row 2: Bottom 2 conversion/financial metrics (Payments Received, Payment Amount)
  const kpiCardFill = {
    type: "pattern" as const,
    pattern: "solid" as const,
    fgColor: { argb: "FFF3F6FA" },
  };

  // Style Row 1
  for (let c = 1; c <= 6; c++) {
    const vCell = valRow1.getCell(c);
    vCell.fill = kpiCardFill;
    vCell.border = THIN_BORDER;
    vCell.font = { name: RS_FONT_FAMILY, size: 14, bold: true, color: { argb: `FF${RS_BLUE_PRIMARY}` } };
    vCell.alignment = { vertical: "middle", horizontal: "center" };

    const lCell = lblRow1.getCell(c);
    lCell.fill = kpiCardFill;
    lCell.border = THIN_BORDER;
    lCell.font = { name: RS_FONT_FAMILY, size: 9, bold: true, color: { argb: `FF${RS_TEXT_SECONDARY}` } };
    lCell.alignment = { vertical: "middle", horizontal: "center" };
  }
  valRow1.getCell(1).numFmt = NUMFMT.INTEGER;
  valRow1.getCell(3).numFmt = NUMFMT.INTEGER;
  valRow1.getCell(5).numFmt = NUMFMT.INTEGER;

  const isMultiCurr = Boolean(kpiAmount?.isMultiCurrency && kpiAmount?.currencyBreakdown);
  const cardCurrs = isMultiCurr
    ? Array.from(
        new Set([
          ...Object.keys(kpiAmount!.currencyBreakdown!.current || {}),
          ...Object.keys(kpiAmount!.currencyBreakdown!.previous || {}),
        ])
      ).sort()
    : [];

  let valRow2: ExcelJS.Row;
  let lblRow2: ExcelJS.Row;

  if (isMultiCurr && cardCurrs.length > 1) {
    const cardRows: ExcelJS.Row[] = [];
    for (let i = 0; i < cardCurrs.length; i++) {
      const cur = cardCurrs[i];
      const amt = kpiAmount!.currencyBreakdown!.current[cur] || 0;
      const curDisplay = cur === "UNKNOWN" ? "валюта не указана" : cur;
      const r = summarySheet.addRow([
        i === 0 ? (kpiPayments?.currentValue ?? 0) : null,
        null,
        null,
        curDisplay,
        amt,
        null,
      ]);
      r.height = 24;
      summarySheet.mergeCells(r.number, 5, r.number, 6);
      for (let c = 1; c <= 6; c++) {
        const cell = r.getCell(c);
        cell.fill = kpiCardFill;
        cell.border = THIN_BORDER;
        cell.font = { name: RS_FONT_FAMILY, size: 12, bold: true, color: { argb: `FF${RS_BLUE_PRIMARY}` } };
        cell.alignment = { vertical: "middle", horizontal: "center" };
      }
      r.getCell(4).font = { name: RS_FONT_FAMILY, size: 10, bold: true, color: { argb: `FF${RS_TEXT_SECONDARY}` } };
      r.getCell(5).numFmt = getMoneyNumFmt(cur);
      cardRows.push(r);
    }
    const firstNum = cardRows[0].number;
    const lastNum = cardRows[cardRows.length - 1].number;
    summarySheet.mergeCells(firstNum, 1, lastNum, 3);
    cardRows[0].getCell(1).numFmt = NUMFMT.INTEGER;
    valRow2 = cardRows[0];

    lblRow2 = summarySheet.addRow([
      `[KPI] ${kpiPayments?.label ?? "Получено оплат"}`,
      null,
      null,
      `[KPI] ${kpiAmount?.label ?? "Сумма полученных оплат"}`,
      null,
      null,
    ]);
    lblRow2.height = 18;
    summarySheet.mergeCells(lblRow2.number, 1, lblRow2.number, 3);
    summarySheet.mergeCells(lblRow2.number, 4, lblRow2.number, 6);
    for (let c = 1; c <= 6; c++) {
      const cell = lblRow2.getCell(c);
      cell.fill = kpiCardFill;
      cell.border = THIN_BORDER;
      cell.font = { name: RS_FONT_FAMILY, size: 9, bold: true, color: { argb: `FF${RS_TEXT_SECONDARY}` } };
      cell.alignment = { vertical: "middle", horizontal: "center" };
    }
  } else {
    const singleCurrency = kpiAmount?.currencyId || cardCurrs[0];
    const singleAmt = isMultiCurr && cardCurrs.length === 1
      ? kpiAmount!.currencyBreakdown!.current[cardCurrs[0]] || 0
      : (kpiAmount?.currentValue ?? 0);

    valRow2 = summarySheet.addRow([
      kpiPayments?.currentValue ?? 0,
      null,
      null,
      singleAmt,
      null,
      null,
    ]);
    valRow2.height = 26;
    summarySheet.mergeCells(valRow2.number, 1, valRow2.number, 3);
    summarySheet.mergeCells(valRow2.number, 4, valRow2.number, 6);

    lblRow2 = summarySheet.addRow([
      `[KPI] ${kpiPayments?.label ?? "Получено оплат"}`,
      null,
      null,
      `[KPI] ${kpiAmount?.label ?? "Сумма полученных оплат"}`,
      null,
      null,
    ]);
    lblRow2.height = 18;
    summarySheet.mergeCells(lblRow2.number, 1, lblRow2.number, 3);
    summarySheet.mergeCells(lblRow2.number, 4, lblRow2.number, 6);

    for (let c = 1; c <= 6; c++) {
      const cell = valRow2.getCell(c);
      cell.fill = kpiCardFill;
      cell.border = THIN_BORDER;
      cell.font = { name: RS_FONT_FAMILY, size: 14, bold: true, color: { argb: `FF${RS_BLUE_PRIMARY}` } };
      cell.alignment = { vertical: "middle", horizontal: "center" };

      const lCell = lblRow2.getCell(c);
      lCell.fill = kpiCardFill;
      lCell.border = THIN_BORDER;
      lCell.font = { name: RS_FONT_FAMILY, size: 9, bold: true, color: { argb: `FF${RS_TEXT_SECONDARY}` } };
      lCell.alignment = { vertical: "middle", horizontal: "center" };
    }
    valRow2.getCell(1).numFmt = NUMFMT.INTEGER;
    valRow2.getCell(4).numFmt = getMoneyNumFmt(singleCurrency);
  }

  summarySheet.addRow([]); // Spacer

  // Section 1: Dated KPIs table (Crucial: keeps exact cell positions for reconciliation tests)
  addSectionHeader(summarySheet, "АКТИВНОСТЬ ЗА ПЕРИОД (СОБЫТИЯ С НАДЁЖНОЙ ДАТОЙ)", 6);

  const kpiTableHeader = summarySheet.addRow([
    "Метрика",
    "Текущий период",
    "Предыдущий период",
    "Абсолютное изменение",
    "Изменение %",
    "Уникальных компаний",
  ]);
  styleTableHeader(kpiTableHeader, { colCount: 6 });

  const startKpiRow = summarySheet.rowCount + 1;
  for (const k of datedKpis) {
    if (k.id === "payment_amount" && k.isMultiCurrency && k.currencyBreakdown) {
      const allCurrs = Array.from(
        new Set([
          ...Object.keys(k.currencyBreakdown.current),
          ...Object.keys(k.currencyBreakdown.previous),
        ])
      ).sort();

      for (const cur of allCurrs) {
        const currAmt = k.currencyBreakdown.current[cur] || 0;
        const prevAmt = k.currencyBreakdown.previous[cur] || 0;
        const deltaAmt = currAmt - prevAmt;
        const pct = safeDeltaPercent(currAmt, prevAmt);
        const pctStr = pct !== null ? `${pct > 0 ? "+" : ""}${pct}%` : "—";
        const compCount = filteredCompanies.filter((c) =>
          c.deals.some(
            (d) =>
              d.paymentStatus &&
              PAID_STATUS_CODES.has(d.paymentStatus) &&
              d.paymentDate &&
              isDateInPeriod(d.paymentDate, boundaries.currentStart, boundaries.currentEnd) &&
              normalizeCurrencyCode(d.currencyId) === cur
          )
        ).length;

        const curLabel = cur === "UNKNOWN" ? "валюта не указана" : cur;
        const row = summarySheet.addRow([
          `${k.label} — ${curLabel}`,
          currAmt,
          prevAmt,
          deltaAmt,
          pctStr,
          compCount,
        ]);
        row.height = 20;

        for (let c = 1; c <= 6; c++) {
          const cell = row.getCell(c);
          cell.border = THIN_BORDER;
          cell.font = FONT_DATA;
        }

        row.getCell(2).numFmt = getMoneyNumFmt(cur);
        row.getCell(3).numFmt = getMoneyNumFmt(cur);
        row.getCell(4).numFmt = getDeltaMoneyNumFmt(cur);
      }
    } else {
      const row = summarySheet.addRow([
        k.label,
        k.currentValue ?? 0,
        k.previousValue ?? 0,
        k.delta ?? 0,
        k.deltaPercent !== null ? `${k.deltaPercent > 0 ? "+" : ""}${k.deltaPercent}%` : "—",
        k.companyIds.length,
      ]);
      row.height = 20;

      for (let c = 1; c <= 6; c++) {
        const cell = row.getCell(c);
        cell.border = THIN_BORDER;
        cell.font = FONT_DATA;
      }

      if (k.isCurrency) {
        const cur = k.currencyId ? normalizeCurrencyCode(k.currencyId) : undefined;
        row.getCell(2).numFmt = getMoneyNumFmt(cur);
        row.getCell(3).numFmt = getMoneyNumFmt(cur);
        row.getCell(4).numFmt = getDeltaMoneyNumFmt(cur);
      } else {
        row.getCell(2).numFmt = NUMFMT.INTEGER;
        row.getCell(3).numFmt = NUMFMT.INTEGER;
        row.getCell(4).numFmt = NUMFMT.DELTA_INTEGER;
      }
    }
  }
  const endKpiRow = summarySheet.rowCount;
  styleDataRows(summarySheet, startKpiRow, endKpiRow, 6);

  summarySheet.addRow([]); // Spacer

  // Section 2: WIP Table
  addSectionHeader(summarySheet, "ТЕКУЩИЙ ПОРТФЕЛЬ / СЕЙЧАС В РАБОТЕ", 6);

  const wipTableHeader = summarySheet.addRow([
    "Статус / Этап",
    "Уникальных компаний",
    "Связанных сделок",
  ]);
  styleTableHeader(wipTableHeader, { colCount: 3 });

  const startWipRow = summarySheet.rowCount + 1;
  for (const w of wipKpis) {
    const row = summarySheet.addRow([w.label, w.companyCount, w.dealCount]);
    row.height = 20;
    row.getCell(2).numFmt = NUMFMT.INTEGER;
    row.getCell(3).numFmt = NUMFMT.INTEGER;
  }
  const endWipRow = summarySheet.rowCount;
  styleDataRows(summarySheet, startWipRow, endWipRow, 3);

  summarySheet.addRow([]); // Spacer

  // Section 3: Attention / Bottlenecks summary
  addSectionHeader(summarySheet, "ТРЕБУЮТ ВНИМАНИЯ (УЗКИЕ МЕСТА)", 6);

  if (bottlenecks.length === 0) {
    const emptyRow = summarySheet.addRow([
      "Узких мест и зависших процессов не обнаружено. Все процессы выполняются штатно.",
    ]);
    emptyRow.height = 20;
    summarySheet.mergeCells(emptyRow.number, 1, emptyRow.number, 6);
    const cell = emptyRow.getCell(1);
    cell.font = FONT_METADATA_LABEL;
    cell.alignment = { vertical: "middle", indent: 1 };
  } else {
    const attentionHeader = summarySheet.addRow([
      "Компания",
      "Менеджер",
      "Причина внимания",
      "Текущее состояние",
      "Дней ожидания",
      "Сумма",
    ]);
    styleTableHeader(attentionHeader, { colCount: 6 });

    const startAttentionRow = summarySheet.rowCount + 1;
    const topBottlenecks = bottlenecks.slice(0, 5);

    for (const b of topBottlenecks) {
      let botAmtVal: number | string = "—";
      if (b.amountQuality === "INVALID") {
        botAmtVal = "Неверная сумма";
      } else if (typeof b.amount === "number") {
        botAmtVal = b.amount;
      }

      const row = summarySheet.addRow([
        b.companyTitle,
        b.responsibleName,
        b.issueLabel,
        b.currentState,
        b.daysWaiting,
        botAmtVal,
      ]);
      row.height = 20;

      for (let c = 1; c <= 6; c++) {
        const cell = row.getCell(c);
        cell.border = THIN_BORDER;
        cell.font = FONT_DATA;
      }

      if (typeof b.daysWaiting === "number") row.getCell(5).numFmt = NUMFMT.INTEGER;
      if (typeof botAmtVal === "number") {
        const botCur = b.currencyId ? normalizeCurrencyCode(b.currencyId) : undefined;
        row.getCell(6).numFmt = getMoneyNumFmt(botCur);
      }

      applyStatusCell(row.getCell(3), "Внимание");
      row.getCell(3).value = b.issueLabel;
    }
    const endAttentionRow = summarySheet.rowCount;
    styleDataRows(summarySheet, startAttentionRow, endAttentionRow, 6);

    if (bottlenecks.length > 5) {
      const moreRow = summarySheet.addRow([
        `Показано 5 из ${bottlenecks.length} узких мест. Полный реестр доступен на листе «Bottlenecks».`,
      ]);
      moreRow.height = 18;
      summarySheet.mergeCells(moreRow.number, 1, moreRow.number, 6);
      const moreCell = moreRow.getCell(1);
      moreCell.font = { name: RS_FONT_FAMILY, size: 9, italic: true, color: { argb: `FF${RS_TEXT_SECONDARY}` } };
      moreCell.alignment = { vertical: "middle", indent: 1 };
    }
  }

  // Auto-fit summary sheet columns
  autoFitColumns(summarySheet, { minWidth: 14, maxWidth: 50 });
  const col1Width = summarySheet.getColumn(1).width ?? 0;
  if (col1Width < 44) {
    summarySheet.getColumn(1).width = 44;
  }

  // Print Setup & Corporate Footer
  configureWorksheetPrint(summarySheet, {
    orientation: "portrait",
    fitToWidth: 1,
    fitToHeight: 1,
  });
  addCorporateFooter(summarySheet);

  // ═══════════════════════════════════════════════════════════════════
  // SHEET 2: Companies (One row = one Company)
  // ═══════════════════════════════════════════════════════════════════
  const companiesSheet = workbook.addWorksheet("Companies", {
    views: [{ showGridLines: true }],
  });

  const companiesColumns = [
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
    "Сумма",
    "Статус оплаты",
    "Дата оплаты",
    "Следующий шаг",
    "Требует внимания",
    "Причина внимания",
  ];

  const compHeaderRowIndex = addOperationalHeader(companiesSheet, logoImageId, {
    title: "Коммерческая воронка: Компании",
    period: periodLabel,
    generatedAt: now,
    recordCount: filteredCompanies.length,
    filtersText: filtersSummaryText,
    colCount: companiesColumns.length,
  });

  const companiesHeader = companiesSheet.getRow(compHeaderRowIndex);
  companiesHeader.values = companiesColumns;
  styleTableHeader(companiesHeader, { colCount: companiesColumns.length });

  companiesSheet.views = [
    { state: "frozen", ySplit: compHeaderRowIndex, showGridLines: true },
  ];
  companiesSheet.autoFilter = {
    from: { row: compHeaderRowIndex, column: 1 },
    to: { row: compHeaderRowIndex, column: companiesColumns.length },
  };

  const startCompRow = compHeaderRowIndex + 1;
  for (const c of filteredCompanies) {
    const dateCreateVal = toExcelDate(c.dateCreate);
    const sampleDateVal = toExcelDate(c.sampleShipmentDate);
    const paymentDateVal = toExcelDate(c.primaryDealPaymentDate);
    const sampleStatusDisplay =
      c.sampleStatuses && c.sampleStatuses.length > 0
        ? c.sampleStatuses.join(", ")
        : c.sampleStatus;

    let oppVal: number | string = "—";
    if (c.primaryDealOpportunityQuality === "INVALID") {
      oppVal = "Неверная сумма";
    } else if (typeof c.primaryDealOpportunity === "number") {
      oppVal = c.primaryDealOpportunity;
    }

    const row = companiesSheet.addRow([
      c.id,
      c.title,
      c.responsibleName || c.responsibleId,
      dateCreateVal,
      c.industry || "—",
      c.region || "—",
      (Array.isArray(c.productType) ? c.productType.join(", ") : c.productType) || "—",
      sampleStatusDisplay,
      c.sampleStatusSource,
      sampleDateVal,
      c.sampleTestResult || "—",
      c.primaryDealTitle || "—",
      c.primaryDealStageName || formatStageToRussian(c.primaryDealStageId),
      oppVal,
      formatPaymentStatusToRussian(c.primaryDealPaymentStatus),
      paymentDateVal,
      c.primaryDealActivityNext || "—",
      c.hasAttention ? "Да" : "Нет",
      (Array.isArray(c.attentionReasons) ? c.attentionReasons.join("; ") : c.attentionReasons) || "—",
    ]);
    row.height = 20;

    // Native Date formats
    if (dateCreateVal) row.getCell(4).numFmt = NUMFMT.DATE;
    if (sampleDateVal) row.getCell(10).numFmt = NUMFMT.DATE;
    if (paymentDateVal) row.getCell(16).numFmt = NUMFMT.DATE;

    // Currency format
    if (typeof oppVal === "number") {
      const dealCur = c.primaryDealCurrencyId ? normalizeCurrencyCode(c.primaryDealCurrencyId) : undefined;
      row.getCell(14).numFmt = getMoneyNumFmt(dealCur);
    }

    // Status styling
    if (sampleStatusDisplay && sampleStatusDisplay !== "—") {
      applyStatusCell(row.getCell(8), sampleStatusDisplay);
    }
    if (c.primaryDealPaymentStatus && c.primaryDealPaymentStatus !== "—") {
      applyStatusCell(row.getCell(15), c.primaryDealPaymentStatus);
    }
    if (c.hasAttention) {
      applyStatusCell(row.getCell(18), "Да");
    }
  }
  const endCompRow = startCompRow + filteredCompanies.length - 1;
  if (filteredCompanies.length > 0) {
    styleDataRows(companiesSheet, startCompRow, endCompRow, companiesColumns.length, {
      headerRowIndex: compHeaderRowIndex,
    });
  }
  autoFitColumns(companiesSheet);
  configureWorksheetPrint(companiesSheet, {
    orientation: "landscape",
    fitToWidth: 1,
    fitToHeight: 0,
    printTitlesRow: `${compHeaderRowIndex}:${compHeaderRowIndex}`,
  });
  addCorporateFooter(companiesSheet);

  // ═══════════════════════════════════════════════════════════════════
  // SHEET 3: Samples (Granular sample register)
  // ═══════════════════════════════════════════════════════════════════
  const samplesSheet = workbook.addWorksheet("Samples", {
    views: [{ showGridLines: true }],
  });

  const samplesColumns = [
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
  ];

  const samplesHeaderRowIndex = addOperationalHeader(samplesSheet, logoImageId, {
    title: "Коммерческая воронка: Регистр образцов",
    period: periodLabel,
    generatedAt: now,
    recordCount: sampleRegister.length,
    filtersText: filtersSummaryText,
    colCount: samplesColumns.length,
  });

  const samplesHeader = samplesSheet.getRow(samplesHeaderRowIndex);
  samplesHeader.values = samplesColumns;
  styleTableHeader(samplesHeader, { colCount: samplesColumns.length });

  samplesSheet.views = [
    { state: "frozen", ySplit: samplesHeaderRowIndex, showGridLines: true },
  ];
  samplesSheet.autoFilter = {
    from: { row: samplesHeaderRowIndex, column: 1 },
    to: { row: samplesHeaderRowIndex, column: samplesColumns.length },
  };

  const startSamplesRow = samplesHeaderRowIndex + 1;
  for (const s of sampleRegister) {
    const shipmentDateVal = toExcelDate(s.shipmentDate);
    const row = samplesSheet.addRow([
      s.companyTitle,
      s.responsibleName,
      s.dealTitle || "—",
      s.productType,
      s.status,
      s.statusSource,
      shipmentDateVal,
      s.daysSinceSent !== undefined ? s.daysSinceSent : "—",
      s.testResult || "—",
      s.gradeGel || "—",
      s.gradeSol || "—",
      s.qtyGel || "—",
      s.qtySol || "—",
      s.nextAction || "—",
    ]);
    row.height = 20;

    if (shipmentDateVal) row.getCell(7).numFmt = NUMFMT.DATE;
    if (typeof s.daysSinceSent === "number") row.getCell(8).numFmt = NUMFMT.INTEGER;

    // Status styling
    if (s.status && s.status !== "—") {
      applyStatusCell(row.getCell(5), s.status);
    }
    if (s.testResult && s.testResult !== "—") {
      applyStatusCell(row.getCell(9), s.testResult);
    }
  }
  const endSamplesRow = startSamplesRow + sampleRegister.length - 1;
  if (sampleRegister.length > 0) {
    styleDataRows(samplesSheet, startSamplesRow, endSamplesRow, samplesColumns.length, {
      headerRowIndex: samplesHeaderRowIndex,
    });
  }
  autoFitColumns(samplesSheet);
  configureWorksheetPrint(samplesSheet, {
    orientation: "landscape",
    fitToWidth: 1,
    fitToHeight: 0,
    printTitlesRow: `${samplesHeaderRowIndex}:${samplesHeaderRowIndex}`,
  });
  addCorporateFooter(samplesSheet);

  // ═══════════════════════════════════════════════════════════════════
  // SHEET 4: Managers (Scorecard per responsible)
  // ═══════════════════════════════════════════════════════════════════
  const managersSheet = workbook.addWorksheet("Managers", {
    views: [{ showGridLines: true }],
  });

  const allManagerCurrencies = Array.from(
    new Set(
      managerScorecard.flatMap((m) => Object.keys(m.paymentAmountsByCurrency || {}))
    )
  ).sort();

  const isMultiManagerCurrencies = allManagerCurrencies.length > 1;

  const managersColumns = [
    "Менеджер",
    "Новые компании (период)",
    "Образцы отправлены (период)",
    "Сейчас на испытании",
    "Подошли",
    "Не подошли",
    "Требуют доработки",
    "Создано сделок (период)",
    "Получено оплат (период)",
    ...(isMultiManagerCurrencies
      ? allManagerCurrencies.map((cur) => `${PAYMENT_AMOUNT_LABEL} (${cur === "UNKNOWN" ? "валюта не указана" : cur})`)
      : allManagerCurrencies.length === 1
      ? [`${PAYMENT_AMOUNT_LABEL} (${allManagerCurrencies[0] === "UNKNOWN" ? "валюта не указана" : allManagerCurrencies[0]})`]
      : [PAYMENT_AMOUNT_LABEL]),
    "Требуют внимания",
  ];

  const managersHeaderRowIndex = addOperationalHeader(managersSheet, logoImageId, {
    title: "Коммерческая воронка: Показатели менеджеров",
    period: periodLabel,
    generatedAt: now,
    recordCount: managerScorecard.length,
    filtersText: filtersSummaryText,
    colCount: managersColumns.length,
  });

  const managersHeader = managersSheet.getRow(managersHeaderRowIndex);
  managersHeader.values = managersColumns;
  styleTableHeader(managersHeader, { colCount: managersColumns.length });

  managersSheet.views = [
    { state: "frozen", ySplit: managersHeaderRowIndex, showGridLines: true },
  ];
  managersSheet.autoFilter = {
    from: { row: managersHeaderRowIndex, column: 1 },
    to: { row: managersHeaderRowIndex, column: managersColumns.length },
  };

  const startManagersRow = managersHeaderRowIndex + 1;
  for (const m of managerScorecard) {
    const payAmounts = isMultiManagerCurrencies
      ? allManagerCurrencies.map((cur) => m.paymentAmountsByCurrency?.[cur] || 0)
      : [m.paymentAmount ?? 0];

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
      ...payAmounts,
      m.bottlenecksCount,
    ]);
    row.height = 20;

    for (let c = 2; c <= 9; c++) {
      row.getCell(c).numFmt = NUMFMT.INTEGER;
    }

    if (isMultiManagerCurrencies) {
      for (let i = 0; i < allManagerCurrencies.length; i++) {
        row.getCell(10 + i).numFmt = getMoneyNumFmt(allManagerCurrencies[i]);
      }
      const attentionCol = 10 + allManagerCurrencies.length;
      row.getCell(attentionCol).numFmt = NUMFMT.INTEGER;

      if (m.bottlenecksCount > 0) {
        applyStatusCell(row.getCell(attentionCol), "Внимание");
        row.getCell(attentionCol).value = m.bottlenecksCount;
      }
    } else {
      const singleCur = allManagerCurrencies[0];
      row.getCell(10).numFmt = getMoneyNumFmt(singleCur);
      row.getCell(11).numFmt = NUMFMT.INTEGER;

      if (m.bottlenecksCount > 0) {
        applyStatusCell(row.getCell(11), "Внимание");
        row.getCell(11).value = m.bottlenecksCount;
      }
    }
  }
  const endManagersRow = startManagersRow + managerScorecard.length - 1;
  if (managerScorecard.length > 0) {
    styleDataRows(managersSheet, startManagersRow, endManagersRow, managersColumns.length, {
      headerRowIndex: managersHeaderRowIndex,
    });
  }
  autoFitColumns(managersSheet);
  configureWorksheetPrint(managersSheet, {
    orientation: "landscape",
    fitToWidth: 1,
    fitToHeight: 0,
    printTitlesRow: `${managersHeaderRowIndex}:${managersHeaderRowIndex}`,
  });
  addCorporateFooter(managersSheet);

  // ═══════════════════════════════════════════════════════════════════
  // SHEET 5: Bottlenecks (Actionable items requiring attention)
  // ═══════════════════════════════════════════════════════════════════
  const bottlenecksSheet = workbook.addWorksheet("Bottlenecks", {
    views: [{ showGridLines: true }],
  });

  const bottlenecksColumns = [
    "Компания",
    "Менеджер",
    "Проблема / Причина",
    "Текущее состояние",
    "Дата события",
    "Дней ожидания",
    "Сделка",
    "Сумма",
    "Следующий шаг / Рекомендация",
  ];

  const botHeaderRowIndex = addOperationalHeader(bottlenecksSheet, logoImageId, {
    title: "Коммерческая воронка: Узкие места",
    period: periodLabel,
    generatedAt: now,
    recordCount: bottlenecks.length,
    filtersText: filtersSummaryText,
    colCount: bottlenecksColumns.length,
  });

  const bottlenecksHeader = bottlenecksSheet.getRow(botHeaderRowIndex);
  bottlenecksHeader.values = bottlenecksColumns;
  styleTableHeader(bottlenecksHeader, { colCount: bottlenecksColumns.length });

  bottlenecksSheet.views = [
    { state: "frozen", ySplit: botHeaderRowIndex, showGridLines: true },
  ];
  bottlenecksSheet.autoFilter = {
    from: { row: botHeaderRowIndex, column: 1 },
    to: { row: botHeaderRowIndex, column: bottlenecksColumns.length },
  };

  const startBotRow = botHeaderRowIndex + 1;
  for (const b of bottlenecks) {
    const relevantDateVal = toExcelDate(b.relevantDate);
    let botAmtVal: number | string = "—";
    if (b.amountQuality === "INVALID") {
      botAmtVal = "Неверная сумма";
    } else if (typeof b.amount === "number") {
      botAmtVal = b.amount;
    }

    const row = bottlenecksSheet.addRow([
      b.companyTitle,
      b.responsibleName,
      b.issueLabel,
      b.currentState,
      relevantDateVal,
      b.daysWaiting,
      b.dealTitle || "—",
      botAmtVal,
      b.nextAction || "—",
    ]);
    row.height = 20;

    if (relevantDateVal) row.getCell(5).numFmt = NUMFMT.DATE;
    if (typeof b.daysWaiting === "number") row.getCell(6).numFmt = NUMFMT.INTEGER;
    if (typeof botAmtVal === "number") {
      const botCur = b.currencyId ? normalizeCurrencyCode(b.currencyId) : undefined;
      row.getCell(8).numFmt = getMoneyNumFmt(botCur);
    }

    // Attention styling
    applyStatusCell(row.getCell(3), "Внимание");
    row.getCell(3).value = b.issueLabel;
  }
  const endBotRow = startBotRow + bottlenecks.length - 1;
  if (bottlenecks.length > 0) {
    styleDataRows(bottlenecksSheet, startBotRow, endBotRow, bottlenecksColumns.length, {
      headerRowIndex: botHeaderRowIndex,
    });
  }
  autoFitColumns(bottlenecksSheet);
  configureWorksheetPrint(bottlenecksSheet, {
    orientation: "landscape",
    fitToWidth: 1,
    fitToHeight: 0,
    printTitlesRow: `${botHeaderRowIndex}:${botHeaderRowIndex}`,
  });
  addCorporateFooter(bottlenecksSheet);

  return workbook;
}

/**
 * Browser helper to download the workbook as an .xlsx file with Russian business name.
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
  const dateStr = formatReportDateForFilename(options.now || new Date());
  const periodPart =
    options.filters.periodPreset === "custom" && options.filters.customFrom && options.filters.customTo
      ? `${options.filters.customFrom}_${options.filters.customTo}`
      : options.filters.periodPreset.replace("days", "дней");
  a.download = `РусСилика_Коммерческая_воронка_${periodPart}_${dateStr}.xlsx`;
  a.click();
  window.URL.revokeObjectURL(url);
}
