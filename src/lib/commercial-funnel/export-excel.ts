// src/lib/commercial-funnel/export-excel.ts
// ─────────────────────────────────────────────────────────────────────
// Structured 6-sheet RusSilica Management Excel report generator.
// Consumes the EXACT same analytical dataset and engine metrics as the UI.
// Sheets: Executive Summary, Funnel, Segments, Sample Testing, Managers,
// Action Plan.
// ─────────────────────────────────────────────────────────────────────

import ExcelJS from "exceljs";
import {
  COMMERCIAL_TIMEZONE,
  PAID_STATUS_CODES,
  PAYMENT_AMOUNT_LABEL,
} from "./constants";
import {
  computeBottlenecks,
  computeManagerScorecard,
  computePeriodMetrics,
  filterCompaniesByDimensions,
} from "./engine";
import {
  buildSampleTestingSnapshot,
  computeActionPlan,
  computeAttentionSummary,
  computeFunnelView,
  computeSegmentBreakdown,
  NEXT_ACTION_MISSING_LABEL,
} from "./analytics";
import {
  computePeriodBoundaries,
  isDateInPeriod,
  safeDeltaPercent,
} from "./date-utils";
import { normalizeCurrencyCode } from "./normalize";
import { getCurrencyUniverse } from "./currency";
import { parseStrictDate } from "@/lib/date-safety";
import type {
  AggregateAmountQuality,
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
  /**
   * Demo-mode guard: a demo dataset must NEVER be exported as a live
   * management report. The safest product policy is to disable export
   * entirely in demo mode — the caller (UI) disables the button, and this
   * hard guard throws if a demo dataset is ever passed through.
   */
  isDemoMode?: boolean;
  /** Domain-specific warnings stamped on relevant sheets (e.g. activity partial). */
  extraWarnings?: string[];
}

/**
 * Builds the authoritative branded 6-sheet RusSilica Commercial Funnel workbook.
 * Sheets (fixed order): Executive Summary, Funnel, Segments, Sample Testing,
 * Managers, Action Plan.
 */
export async function createCommercialFunnelWorkbook(
  options: BuildExcelOptions
): Promise<ExcelJS.Workbook> {
  const { companies, deals, filters, userNames = {}, now = new Date(), extraWarnings = [] } = options;

  // Hard guard (Option A — safest): demo data never becomes a detached
  // workbook that could be mistaken for a live management report.
  if (options.isDemoMode) {
    throw new Error(
      "Экспорт в демо-режиме отключён: демонстрационные данные не могут использоваться как управленческий отчёт."
    );
  }

  const boundaries = computePeriodBoundaries(filters, now);
  const filteredCompanies = filterCompaniesByDimensions(companies, filters);

  const datedKpis = computePeriodMetrics(filteredCompanies, boundaries);
  const bottlenecks = computeBottlenecks(filteredCompanies, now);
  const managerScorecard = computeManagerScorecard(
    filteredCompanies,
    boundaries,
    bottlenecks,
    userNames
  );
  const funnelView = computeFunnelView(filteredCompanies, boundaries);
  const segmentIndustry = computeSegmentBreakdown(filteredCompanies, boundaries, "industry");
  const segmentDirection = computeSegmentBreakdown(filteredCompanies, boundaries, "direction");
  const segmentProduct = computeSegmentBreakdown(filteredCompanies, boundaries, "product");
  const sampleSnapshot = buildSampleTestingSnapshot(filteredCompanies, now);
  const attentionSummary = computeAttentionSummary(filteredCompanies, now);
  const commercial = funnelView.commercial;
  const funnelCurrencies = getCurrencyUniverse(
    commercial.period.paymentAmountsByCurrency,
    commercial.period.paymentAmountQualityByCurrency
  );
  const actionPlan = computeActionPlan(filteredCompanies, now);

  const workbook = new ExcelJS.Workbook();
  workbook.creator = RS_SYSTEM_TITLE;
  workbook.lastModifiedBy = RS_SYSTEM_TITLE;
  workbook.created = now;
  workbook.modified = now;

  // Register logo once on workbook; reused across all 6 sheets
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
    case "quarter": return "Квартал";
    case "custom": return "Пользовательский период";
    case "all": return "За всё время";
    default: return preset;
  }
}

  const periodLabel = boundaries.isAllTime
    ? `За всё время (по ${boundaries.currentEndStr})`
    : `${boundaries.currentStartStr} — ${boundaries.currentEndStr} (${formatPeriodPresetToRussian(filters.periodPreset)})`;
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
    ["Предыдущий период для сравнения:", boundaries.isAllTime ? "—" : `${boundaries.previousStartStr} — ${boundaries.previousEndStr}`],
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
    ? getCurrencyUniverse(
        kpiAmount?.currencyBreakdown?.current,
        kpiAmount?.currencyBreakdown?.previous,
        kpiAmount?.currencyBreakdownQuality?.current,
        kpiAmount?.currencyBreakdownQuality?.previous
      )
    : [];

  let valRow2: ExcelJS.Row;
  let lblRow2: ExcelJS.Row;

  if (isMultiCurr && cardCurrs.length > 1) {
    const cardRows: ExcelJS.Row[] = [];
    for (let i = 0; i < cardCurrs.length; i++) {
      const cur = cardCurrs[i];
      const curQuality = kpiAmount?.currencyBreakdownQuality?.current?.[cur];
      const hasAmt =
        kpiAmount?.currencyBreakdown?.current && cur in kpiAmount.currencyBreakdown.current;
      const rawAmt = kpiAmount?.currencyBreakdown?.current?.[cur];

      let cellValue: number | string;
      if (curQuality === "INVALID_ONLY") {
        cellValue = "Ошибка данных";
      } else if (curQuality === "UNKNOWN") {
        cellValue = "Нет данных";
      } else if (hasAmt && typeof rawAmt === "number") {
        cellValue = rawAmt;
      } else {
        cellValue = 0;
      }

      const curDisplay = cur === "UNKNOWN" ? "валюта не указана" : cur;
      const r = summarySheet.addRow([
        i === 0 ? (kpiPayments?.currentValue ?? 0) : null,
        null,
        null,
        curDisplay,
        cellValue,
        null,
      ]);
      r.height = 24;
      summarySheet.mergeCells(r.number, 5, r.number, 6);
      for (let c = 1; c <= 6; c++) {
        const cell = r.getCell(c);
        cell.fill = kpiCardFill;
        cell.border = THIN_BORDER;
        cell.font = {
          name: RS_FONT_FAMILY,
          size: typeof cellValue === "string" ? 10 : 12,
          bold: true,
          color: { argb: `FF${RS_BLUE_PRIMARY}` },
        };
        cell.alignment = { vertical: "middle", horizontal: "center" };
      }
      r.getCell(4).font = { name: RS_FONT_FAMILY, size: 10, bold: true, color: { argb: `FF${RS_TEXT_SECONDARY}` } };
      if (typeof cellValue === "number") {
        r.getCell(5).numFmt = getMoneyNumFmt(cur);
      }
      if (curQuality === "PARTIAL") {
        r.getCell(5).note = "Неполные данные: присутствуют сделки с некорректной суммой";
      }
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
    let singleAmt: number | string = 0;
    if (kpiAmount?.amountQuality === "INVALID_ONLY") {
      singleAmt = "Ошибка данных";
    } else if (kpiAmount?.amountQuality === "UNKNOWN") {
      singleAmt = "Нет данных";
    } else {
      singleAmt =
        isMultiCurr && cardCurrs.length === 1
          ? (kpiAmount?.currencyBreakdown?.current?.[cardCurrs[0]] ?? 0)
          : (kpiAmount?.currentValue ?? 0);
    }

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

    const amountLabelSuffix = kpiAmount?.amountQuality === "PARTIAL" ? " (неполные данные)" : "";
    lblRow2 = summarySheet.addRow([
      `[KPI] ${kpiPayments?.label ?? "Получено оплат"}`,
      null,
      null,
      `[KPI] ${kpiAmount?.label ?? "Сумма полученных оплат"}${amountLabelSuffix}`,
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
      cell.font = { name: RS_FONT_FAMILY, size: typeof singleAmt === "string" ? 11 : 14, bold: true, color: { argb: `FF${RS_BLUE_PRIMARY}` } };
      cell.alignment = { vertical: "middle", horizontal: "center" };

      const lCell = lblRow2.getCell(c);
      lCell.fill = kpiCardFill;
      lCell.border = THIN_BORDER;
      lCell.font = { name: RS_FONT_FAMILY, size: 9, bold: true, color: { argb: `FF${RS_TEXT_SECONDARY}` } };
      lCell.alignment = { vertical: "middle", horizontal: "center" };
    }
    valRow2.getCell(1).numFmt = NUMFMT.INTEGER;
    if (typeof singleAmt === "number") {
      valRow2.getCell(4).numFmt = getMoneyNumFmt(singleCurrency);
    }
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
      const allCurrs = getCurrencyUniverse(
        k.currencyBreakdown.current,
        k.currencyBreakdown.previous,
        k.currencyBreakdownQuality?.current,
        k.currencyBreakdownQuality?.previous
      );

      for (const cur of allCurrs) {
        const curQuality = k.currencyBreakdownQuality?.current?.[cur];
        const prevQuality = k.currencyBreakdownQuality?.previous?.[cur];
        const rawCurr = k.currencyBreakdown.current?.[cur];
        const rawPrev = k.currencyBreakdown.previous?.[cur];

        let currAmt: number | string;
        if (curQuality === "INVALID_ONLY") {
          currAmt = "Ошибка данных";
        } else if (curQuality === "UNKNOWN") {
          currAmt = "Нет данных";
        } else if (typeof rawCurr === "number") {
          currAmt = rawCurr;
        } else {
          currAmt = 0;
        }

        let prevAmt: number | string;
        if (prevQuality === "INVALID_ONLY") {
          prevAmt = "Ошибка данных";
        } else if (prevQuality === "UNKNOWN") {
          prevAmt = "Нет данных";
        } else if (typeof rawPrev === "number") {
          prevAmt = rawPrev;
        } else {
          prevAmt = 0;
        }

        const isComparisonValid =
          !boundaries.isAllTime &&
          curQuality === "COMPLETE" &&
          prevQuality === "COMPLETE" &&
          typeof currAmt === "number" &&
          typeof prevAmt === "number";

        const numCurr = typeof currAmt === "number" ? currAmt : 0;
        const numPrev = typeof prevAmt === "number" ? prevAmt : 0;
        const deltaAmt: number | string = isComparisonValid ? numCurr - numPrev : "—";
        const pct = isComparisonValid ? safeDeltaPercent(numCurr, numPrev) : null;
        const pctStr = pct !== null ? `${pct > 0 ? "+" : ""}${pct}%` : "—";
        const prevDisplayAmt: number | string = boundaries.isAllTime ? "—" : prevAmt;
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
        const qualitySuffix =
          curQuality === "PARTIAL"
            ? " (неполные данные)"
            : curQuality === "INVALID_ONLY"
            ? " (ошибка данных)"
            : curQuality === "UNKNOWN"
            ? " (нет данных)"
            : "";
        const row = summarySheet.addRow([
          `${k.label} — ${curLabel}${qualitySuffix}`,
          currAmt,
          prevDisplayAmt,
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

        if (typeof currAmt === "number") {
          row.getCell(2).numFmt = getMoneyNumFmt(cur);
        }
        if (typeof prevDisplayAmt === "number") {
          row.getCell(3).numFmt = getMoneyNumFmt(cur);
        }
        if (typeof deltaAmt === "number") {
          row.getCell(4).numFmt = getDeltaMoneyNumFmt(cur);
        }
        if (curQuality === "PARTIAL") {
          row.getCell(2).note = "Неполные данные: присутствуют сделки с некорректной суммой";
        }
        if (prevQuality === "PARTIAL") {
          row.getCell(3).note = "Неполные данные: присутствуют сделки с некорректной суммой";
        }
      }
    } else {
      if (k.isCurrency) {
        const cur = k.currencyId ? normalizeCurrencyCode(k.currencyId) : undefined;
        const currentQuality: AggregateAmountQuality =
          (cur && k.currencyBreakdownQuality?.current?.[cur]) || k.amountQuality || "COMPLETE";
        const previousQuality: AggregateAmountQuality =
          (cur && k.currencyBreakdownQuality?.previous?.[cur]) ||
          (boundaries.isAllTime ? "UNKNOWN" : "COMPLETE");

        const formatCell = (
          rawVal: number | null,
          quality: AggregateAmountQuality
        ): { val: number | string; isNote: boolean } => {
          if (quality === "INVALID_ONLY") {
            return { val: "Ошибка данных", isNote: false };
          }
          if (quality === "UNKNOWN" || rawVal === null) {
            return { val: "Нет данных", isNote: false };
          }
          if (quality === "PARTIAL") {
            return { val: rawVal, isNote: true };
          }
          return { val: rawVal, isNote: false };
        };

        const currCell = formatCell(k.currentValue, currentQuality);
        const prevCell = formatCell(k.previousValue, previousQuality);

        const currVal = currCell.val;
        const prevDisplayVal: number | string = boundaries.isAllTime ? "—" : prevCell.val;

        const isComparisonValid =
          !boundaries.isAllTime &&
          currentQuality === "COMPLETE" &&
          previousQuality === "COMPLETE" &&
          typeof currVal === "number" &&
          typeof prevDisplayVal === "number";

        const deltaVal: number | string = isComparisonValid
          ? (currVal as number) - (prevDisplayVal as number)
          : "—";

        const pct = isComparisonValid
          ? safeDeltaPercent(currVal as number, prevDisplayVal as number)
          : null;
        const pctStr = pct !== null ? `${pct > 0 ? "+" : ""}${pct}%` : "—";

        const qualitySuffix =
          currentQuality === "PARTIAL"
            ? " (неполные данные)"
            : currentQuality === "INVALID_ONLY"
            ? " (ошибка данных)"
            : currentQuality === "UNKNOWN"
            ? " (нет данных)"
            : "";

        const row = summarySheet.addRow([
          `${k.label}${qualitySuffix}`,
          currVal,
          prevDisplayVal,
          deltaVal,
          pctStr,
          k.companyIds.length,
        ]);
        row.height = 20;

        for (let c = 1; c <= 6; c++) {
          const cell = row.getCell(c);
          cell.border = THIN_BORDER;
          cell.font = FONT_DATA;
        }

        if (typeof currVal === "number") {
          row.getCell(2).numFmt = getMoneyNumFmt(cur);
        }
        if (typeof prevDisplayVal === "number") {
          row.getCell(3).numFmt = getMoneyNumFmt(cur);
        }
        if (typeof deltaVal === "number") {
          row.getCell(4).numFmt = getDeltaMoneyNumFmt(cur);
        }
        if (currCell.isNote) {
          row.getCell(2).note = "Неполные данные: присутствуют сделки с некорректной суммой";
        }
        if (prevCell.isNote && !boundaries.isAllTime) {
          row.getCell(3).note = "Неполные данные: присутствуют сделки с некорректной суммой";
        }
      } else {
        // Non-currency count KPIs
        const currVal = k.currentValue ?? 0;
        const prevVal = k.previousValue ?? 0;
        const isComparisonValid =
          !boundaries.isAllTime &&
          k.comparisonAvailable !== false &&
          typeof currVal === "number" &&
          typeof prevVal === "number";

        const deltaVal: number | string = isComparisonValid ? currVal - prevVal : "—";
        const pctStr =
          isComparisonValid && k.deltaPercent !== null
            ? `${k.deltaPercent > 0 ? "+" : ""}${k.deltaPercent}%`
            : "—";
        const prevDisplayVal: number | string = boundaries.isAllTime ? "—" : prevVal;

        const row = summarySheet.addRow([
          k.label,
          currVal,
          prevDisplayVal,
          deltaVal,
          pctStr,
          k.companyIds.length,
        ]);
        row.height = 20;

        for (let c = 1; c <= 6; c++) {
          const cell = row.getCell(c);
          cell.border = THIN_BORDER;
          cell.font = FONT_DATA;
        }

        row.getCell(2).numFmt = NUMFMT.INTEGER;
        row.getCell(3).numFmt = NUMFMT.INTEGER;
        row.getCell(4).numFmt = NUMFMT.DELTA_INTEGER;
      }
    }
  }
  const endKpiRow = summarySheet.rowCount;
  styleDataRows(summarySheet, startKpiRow, endKpiRow, 6);

  summarySheet.addRow([]); // Spacer

  // Section 2: Current portfolio — Table A (Образцы и испытания) + Table B (Коммерциализация)
  addSectionHeader(summarySheet, "ТЕКУЩИЙ ПОРТФЕЛЬ (СОСТОЯНИЕ «СЕЙЧАС»)", 6);

  const wipTableHeader = summarySheet.addRow([
    "Состояние",
    "Компаний",
    "Сделок",
  ]);
  styleTableHeader(wipTableHeader, { colCount: 3 });

  const startWipRow = summarySheet.rowCount + 1;
  for (const stage of funnelView.sampleTestingStages) {
    const row = summarySheet.addRow([stage.label, stage.companyCount, stage.dealCount]);
    row.height = 20;
    row.getCell(2).numFmt = NUMFMT.INTEGER;
    row.getCell(3).numFmt = NUMFMT.INTEGER;
  }
  const endWipRow = summarySheet.rowCount;
  styleDataRows(summarySheet, startWipRow, endWipRow, 3);

  summarySheet.addRow([]); // Spacer

  addSectionHeader(summarySheet, "КОММЕРЦИАЛИЗАЦИЯ (ТЕКУЩЕЕ СОСТОЯНИЕ И СОБЫТИЯ ПЕРИОДА)", 6);
  const commHeader = summarySheet.addRow([
    "Показатель",
    "Значение",
    "Примечание",
  ]);
  styleTableHeader(commHeader, { colCount: 3 });

  const commRows: Array<[string, number | string, string]> = [
    ["Активные коммерческие сделки (компаний)", commercial.current.activeDeals.count, "сейчас"],
    ["— из них сделок", commercial.current.dealCount, "сейчас"],
    ["Ожидают оплаты (компаний)", commercial.current.awaitingPayment.count, "сейчас"],
    ["— из них сделок", commercial.current.awaitingPaymentDealCount, "сейчас"],
    ["Создано сделок (компаний)", commercial.period.dealsCreated.count, "за период"],
    ["Получена оплата (компаний)", commercial.period.paymentsReceived.count, "за период"],
    ["Отгрузки (компаний)", commercial.period.shipments.count, "за период"],
  ];
  const startCommRow = summarySheet.rowCount + 1;
  for (const [label, value, note] of commRows) {
    const row = summarySheet.addRow([label, value, note]);
    row.height = 20;
    row.getCell(2).numFmt = NUMFMT.INTEGER;
  }
  for (const cur of funnelCurrencies) {
    const q = commercial.period.paymentAmountQualityByCurrency?.[cur] || "COMPLETE";
    const amt = commercial.period.paymentAmountsByCurrency?.[cur];
    let val: number | string;
    if (q === "INVALID_ONLY") val = "Ошибка данных";
    else if (q === "UNKNOWN") val = "Нет данных";
    else val = typeof amt === "number" ? amt : 0;
    const curLabel = cur === "UNKNOWN" ? "валюта не указана" : cur;
    const suffix = q === "PARTIAL" ? " (неполные данные)" : "";
    const row = summarySheet.addRow([
      `Сумма сделок с полученной оплатой (${curLabel})${suffix}`,
      val,
      "за период",
    ]);
    row.height = 20;
    if (typeof val === "number") row.getCell(2).numFmt = getMoneyNumFmt(cur);
  }
  const endCommRow = summarySheet.rowCount;
  styleDataRows(summarySheet, startCommRow, endCommRow, 3);

  summarySheet.addRow([]); // Spacer

  // Section 3: Attention summary (signal → count; items total labeled explicitly)
  addSectionHeader(summarySheet, "ТРЕБУЮТ ВНИМАНИЯ (СИГНАЛЫ)", 6);

  if (attentionSummary.signals.length === 0) {
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
      "Сигнал",
      "Количество",
    ]);
    styleTableHeader(attentionHeader, { colCount: 2 });

    const startAttentionRow = summarySheet.rowCount + 1;
    for (const signal of attentionSummary.signals) {
      const row = summarySheet.addRow([signal.label, signal.companyCount]);
      row.height = 20;
      for (let c = 1; c <= 2; c++) {
        const cell = row.getCell(c);
        cell.border = THIN_BORDER;
        cell.font = FONT_DATA;
      }
      row.getCell(2).numFmt = NUMFMT.INTEGER;
    }
    const endAttentionRow = summarySheet.rowCount;
    styleDataRows(summarySheet, startAttentionRow, endAttentionRow, 2);

    // Explicit unambiguous total: ATTENTION ITEMS (bottleneck rows), not companies.
    const totalRow = summarySheet.addRow([
      "Всего требуют внимания (записей, требующих действий; компания может входить в несколько записей)",
      attentionSummary.totalItems,
    ]);
    totalRow.height = 22;
    totalRow.font = { name: RS_FONT_FAMILY, size: 10, bold: true };
    totalRow.getCell(2).numFmt = NUMFMT.INTEGER;
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
  // SHEET 2: Funnel (two tracks: Samples & Testing + Commercial)
  // ═══════════════════════════════════════════════════════════════════
  const funnelSheet = workbook.addWorksheet("Funnel", {
    views: [{ showGridLines: true }],
  });

  const funnelColumns = [
    "Раздел",
    "Этап / Показатель",
    "Сейчас компаний",
    "Сейчас сделок",
    "Событий за выбранный период",
  ];

  const funnelHeaderRowIndex = addOperationalHeader(funnelSheet, logoImageId, {
    title: "Коммерческая воронка: Воронка",
    period: periodLabel,
    generatedAt: now,
    recordCount: filteredCompanies.length,
    filtersText: filtersSummaryText,
    colCount: funnelColumns.length,
    disclosureLines: [
      "Текущее состояние портфеля. Диапазон дат применяется к событийным показателям и не ограничивает текущий WIP.",
      ...extraWarnings,
    ],
  });

  const funnelHeader = funnelSheet.getRow(funnelHeaderRowIndex);
  funnelHeader.values = funnelColumns;
  styleTableHeader(funnelHeader, { colCount: funnelColumns.length });

  funnelSheet.views = [
    { state: "frozen", ySplit: funnelHeaderRowIndex, showGridLines: true },
  ];
  funnelSheet.autoFilter = {
    from: { row: funnelHeaderRowIndex, column: 1 },
    to: { row: funnelHeaderRowIndex, column: funnelColumns.length },
  };

  const startFunnelRow = funnelHeaderRowIndex + 1;
  // Section A: Samples & Testing
  for (const stage of funnelView.sampleTestingStages) {
    const row = funnelSheet.addRow([
      "Образцы и испытания",
      stage.label,
      stage.companyCount,
      stage.dealCount,
      stage.periodEventCount === null ? "–" : stage.periodEventCount,
    ]);
    row.height = 20;
    row.getCell(3).numFmt = NUMFMT.INTEGER;
    row.getCell(4).numFmt = NUMFMT.INTEGER;
    if (stage.periodEventCount !== null) row.getCell(5).numFmt = NUMFMT.INTEGER;
    applyStatusCell(row.getCell(2), stage.label);
    row.getCell(2).value = stage.label;
  }
  // Continuation evidence (NOT conversion — no percentage)
  const contRow = funnelSheet.addRow([
    "Связка треков",
    "Положительный результат → коммерческое продолжение (компаний с «Подошли» и продвинутой сделкой)",
    funnelView.continuation.positiveResult.count,
    "—",
    funnelView.continuation.withCommercialContinuation.count,
  ]);
  contRow.height = 26;
  contRow.getCell(3).numFmt = NUMFMT.INTEGER;
  contRow.getCell(5).numFmt = NUMFMT.INTEGER;
  const contNote = funnelSheet.addRow([
    "Связка показывает количество компаний с продолжением из числа «Подошли»; это свидетельство, а не историческая конверсия — процент не вычисляется.",
  ]);
  contNote.height = 18;
  funnelSheet.mergeCells(contNote.number, 1, contNote.number, 5);
  contNote.getCell(1).font = { name: RS_FONT_FAMILY, size: 9, italic: true, color: { argb: `FF${RS_TEXT_SECONDARY}` } };
  contNote.getCell(1).alignment = { vertical: "middle", indent: 1 };

  funnelSheet.addRow([]);
  // Section B: Commercial
  const commercialRows: Array<[string, string, number | string]> = [
    ["Коммерциализация — СЕЙЧАС", "Активные коммерческие сделки (компаний)", commercial.current.activeDeals.count],
    ["Коммерциализация — СЕЙЧАС", "— из них сделок", commercial.current.dealCount],
    ["Коммерциализация — СЕЙЧАС", "Ожидают оплаты (компаний)", commercial.current.awaitingPayment.count],
    ["Коммерциализация — СЕЙЧАС", "— из них сделок", commercial.current.awaitingPaymentDealCount],
    ["Коммерциализация — ЗА ПЕРИОД", "Создано сделок (компаний)", commercial.period.dealsCreated.count],
    ["Коммерциализация — ЗА ПЕРИОД", "Получена оплата (компаний)", commercial.period.paymentsReceived.count],
    ["Коммерциализация — ЗА ПЕРИОД", "Отгрузки (компаний)", commercial.period.shipments.count],
  ];
  for (const [section, label, value] of commercialRows) {
    const row = funnelSheet.addRow([section, label, value, "—", "—"]);
    row.height = 20;
    if (typeof value === "number") row.getCell(3).numFmt = NUMFMT.INTEGER;
  }
  // Payment amounts by currency (isolated; never cross-summed)
  for (const cur of funnelCurrencies) {
    const q = commercial.period.paymentAmountQualityByCurrency?.[cur] || "COMPLETE";
    const amt = commercial.period.paymentAmountsByCurrency?.[cur];
    let val: number | string;
    if (q === "INVALID_ONLY") val = "Ошибка данных";
    else if (q === "UNKNOWN") val = "Нет данных";
    else val = typeof amt === "number" ? amt : 0;
    const curLabel = cur === "UNKNOWN" ? "валюта не указана" : cur;
    const suffix = q === "PARTIAL" ? " (неполные данные)" : "";
    const row = funnelSheet.addRow([
      "Коммерциализация — ЗА ПЕРИОД",
      `Сумма сделок с полученной оплатой (${curLabel})${suffix}`,
      val,
      "—",
      "—",
    ]);
    row.height = 20;
    if (typeof val === "number") row.getCell(3).numFmt = getMoneyNumFmt(cur);
  }

  autoFitColumns(funnelSheet);
  configureWorksheetPrint(funnelSheet, {
    orientation: "landscape",
    fitToWidth: 1,
    fitToHeight: 0,
    printTitlesRow: `${funnelHeaderRowIndex}:${funnelHeaderRowIndex}`,
  });
  addCorporateFooter(funnelSheet);

  // ═══════════════════════════════════════════════════════════════════
  // SHEET 3: Segments (three sections: industries / directions / products)
  // ═══════════════════════════════════════════════════════════════════
  const segmentsSheet = workbook.addWorksheet("Segments", {
    views: [{ showGridLines: true }],
  });

  const segmentCurrentCols = [
    "Компании в текущем контуре",
    "Требуются образцы",
    "Отправлены",
    "На испытаниях",
    "Подошли",
    "Не подошли",
    "Доработка",
    "Активные сделки",
    "Ожидают оплаты",
    "Требуют внимания",
  ];
  const segmentPeriodCols = [
    "Новые компании",
    "Компании с отправл. образцами",
    "Компании с созд. сделками",
    "Компании с оплатой",
    "Компании с отгрузками",
  ];
  const segmentsColumns = ["Сегмент", ...segmentCurrentCols, ...segmentPeriodCols];

  const segmentsHeaderRowIndex = addOperationalHeader(segmentsSheet, logoImageId, {
    title: "Коммерческая воронка: Сегменты",
    period: periodLabel,
    generatedAt: now,
    recordCount: filteredCompanies.length,
    filtersText: filtersSummaryText,
    colCount: segmentsColumns.length,
    disclosureLines: [
      "Текущее состояние портфеля. Диапазон дат применяется к событийным показателям и не ограничивает текущий WIP.",
      "Компания может относиться к нескольким значениям измерения (Направления / Продукты); сумма строк может превышать число уникальных компаний. Итого считается по уникальным компаниям.",
      ...extraWarnings,
    ],
  });

  const segmentsHeader = segmentsSheet.getRow(segmentsHeaderRowIndex);
  segmentsHeader.values = segmentsColumns;
  styleTableHeader(segmentsHeader, { colCount: segmentsColumns.length });

  segmentsSheet.views = [
    { state: "frozen", ySplit: segmentsHeaderRowIndex, showGridLines: true },
  ];
  segmentsSheet.autoFilter = {
    from: { row: segmentsHeaderRowIndex, column: 1 },
    to: { row: segmentsHeaderRowIndex, column: segmentsColumns.length },
  };

  const writeSegmentSection = (title: string, breakdown: ReturnType<typeof computeSegmentBreakdown>) => {
    const sectionRow = segmentsSheet.addRow([title]);
    sectionRow.height = 22;
    segmentsSheet.mergeCells(sectionRow.number, 1, sectionRow.number, segmentsColumns.length);
    const secCell = sectionRow.getCell(1);
    secCell.font = { name: RS_FONT_FAMILY, size: 11, bold: true, color: { argb: `FF${RS_BLUE_PRIMARY}` } };
    secCell.alignment = { vertical: "middle", indent: 1 };

    for (const rowDef of breakdown.rows) {
      const r = segmentsSheet.addRow([
        rowDef.label,
        rowDef.current.activeCompanies.count,
        rowDef.current.requireSamples.count,
        rowDef.current.samplesSent.count,
        rowDef.current.inTesting.count,
        rowDef.current.passed.count,
        rowDef.current.failed.count,
        rowDef.current.rework.count,
        rowDef.current.activeDeals.count,
        rowDef.current.awaitingPayment.count,
        rowDef.current.requireAttention.count,
        rowDef.period.newCompanies.count,
        rowDef.period.samplesSent.count,
        rowDef.period.dealsCreated.count,
        rowDef.period.paymentsReceived.count,
        rowDef.period.shipments.count,
      ]);
      r.height = 20;
      for (let c = 2; c <= segmentsColumns.length; c++) {
        r.getCell(c).numFmt = NUMFMT.INTEGER;
      }
    }
    // Итого по уникальным компаниям (NOT the sum of row counts)
    const totalRow = segmentsSheet.addRow([
      "Итого по уникальным компаниям",
      breakdown.totalUniqueCompanyIds.length,
      ...Array.from({ length: segmentsColumns.length - 2 }, () => "—"),
    ]);
    totalRow.height = 20;
    totalRow.font = { name: RS_FONT_FAMILY, size: 10, bold: true };
    totalRow.getCell(2).numFmt = NUMFMT.INTEGER;
  };

  writeSegmentSection("По отраслям", segmentIndustry);
  writeSegmentSection("По направлениям", segmentDirection);
  writeSegmentSection("По продуктам", segmentProduct);

  autoFitColumns(segmentsSheet);
  configureWorksheetPrint(segmentsSheet, {
    orientation: "landscape",
    fitToWidth: 1,
    fitToHeight: 0,
    printTitlesRow: `${segmentsHeaderRowIndex}:${segmentsHeaderRowIndex}`,
  });
  addCorporateFooter(segmentsSheet);

  // ═══════════════════════════════════════════════════════════════════
  // SHEET 4: Sample Testing (management snapshot, NOT the raw registry)
  // ═══════════════════════════════════════════════════════════════════
  const sampleTestingSheet = workbook.addWorksheet("Sample Testing", {
    views: [{ showGridLines: true }],
  });

  const sampleTestingColumns = [
    "№",
    "Компания",
    "Менеджер",
    "Продукт",
    "Отрасль / направление",
    "Марка / партия",
    "Дата отправки",
    "Статус испытаний",
    "Результат",
    "Следующий шаг / актуальный комментарий",
    "Сделка",
  ];

  const stHeaderRowIndex = addOperationalHeader(sampleTestingSheet, logoImageId, {
    title: "Коммерческая воронка: Испытания образцов (управленческий срез)",
    period: periodLabel,
    generatedAt: now,
    recordCount: sampleSnapshot.length,
    filtersText: filtersSummaryText,
    colCount: sampleTestingColumns.length,
    disclosureLines: [
      "Текущее состояние портфеля. Диапазон дат применяется к событийным показателям и не ограничивает текущий WIP: активные испытания остаются в срезе независимо от даты отправки.",
      ...extraWarnings,
    ],
  });

  const stHeader = sampleTestingSheet.getRow(stHeaderRowIndex);
  stHeader.values = sampleTestingColumns;
  styleTableHeader(stHeader, { colCount: sampleTestingColumns.length });

  sampleTestingSheet.views = [
    { state: "frozen", ySplit: stHeaderRowIndex, showGridLines: true },
  ];
  sampleTestingSheet.autoFilter = {
    from: { row: stHeaderRowIndex, column: 1 },
    to: { row: stHeaderRowIndex, column: sampleTestingColumns.length },
  };

  const startStRow = stHeaderRowIndex + 1;
  sampleSnapshot.forEach((s, idx) => {
    const shipmentDateVal = toExcelDate(s.shipmentDate);
    const row = sampleTestingSheet.addRow([
      idx + 1,
      s.companyTitle,
      s.responsibleName,
      s.productType || "—",
      s.industry === s.direction ? s.industry : `${s.industry} / ${s.direction}`,
      s.markOrBatch,
      shipmentDateVal,
      s.testingStatus,
      s.testResult,
      s.nextActionOrComment,
      s.dealTitle || "—",
    ]);
    row.height = 30;
    row.alignment = { vertical: "top", wrapText: true };
    row.getCell(1).numFmt = NUMFMT.INTEGER;
    if (shipmentDateVal) row.getCell(7).numFmt = NUMFMT.DATE;
    applyStatusCell(row.getCell(8), s.testingStatus);
    row.getCell(8).value = s.testingStatus;
  });
  const endStRow = startStRow + sampleSnapshot.length - 1;
  if (sampleSnapshot.length > 0) {
    styleDataRows(sampleTestingSheet, startStRow, endStRow, sampleTestingColumns.length, {
      headerRowIndex: stHeaderRowIndex,
    });
  }
  autoFitColumns(sampleTestingSheet);
  configureWorksheetPrint(sampleTestingSheet, {
    orientation: "landscape",
    fitToWidth: 1,
    fitToHeight: 0,
    printTitlesRow: `${stHeaderRowIndex}:${stHeaderRowIndex}`,
  });
  addCorporateFooter(sampleTestingSheet);

  // ═══════════════════════════════════════════════════════════════════
  // SHEET 5: Managers (Scorecard per responsible; grouped columns; no ranking)
  // ═══════════════════════════════════════════════════════════════════
  const managersSheet = workbook.addWorksheet("Managers", {
    views: [{ showGridLines: true }],
  });

  const allManagerCurrencies = getCurrencyUniverse(
    ...managerScorecard.map((m) => m.paymentAmountsByCurrency),
    ...managerScorecard.map((m) => m.paymentAmountsQualityByCurrency)
  );

  const isMultiManagerCurrencies = allManagerCurrencies.length > 1;

  // Period shipments per manager (unique companies; Deal manager authoritative,
  // company owner fallback — mirrors engine provenance rules).
  const shipmentsByManager = new Map<string, number>();
  for (const c of filteredCompanies) {
    const dealSenders = new Set<string>();
    for (const d of c.deals) {
      if (
        d.shipmentDate &&
        isDateInPeriod(d.shipmentDate, boundaries.currentStart, boundaries.currentEnd)
      ) {
        dealSenders.add(d.responsibleId || c.responsibleId);
      }
    }
    for (const mgr of dealSenders) {
      shipmentsByManager.set(mgr, (shipmentsByManager.get(mgr) || 0) + 1);
    }
  }

  const managersColumns = [
    "Менеджер",
    // PORTFOLIO (current)
    "Компании в текущем контуре (сейчас)",
    "На испытании (сейчас)",
    "Ожидают оплаты (сейчас)",
    "Без следующего шага (сейчас)",
    "Требуют внимания (сейчас)",
    // PERIOD FLOW
    "Новые компании (период)",
    "Образцы отправлены (период)",
    // RESULT
    "Подошли",
    "Не подошли",
    "Требуют доработки",
    "Получено оплат (период)",
    ...(isMultiManagerCurrencies
      ? allManagerCurrencies.map((cur) => `${PAYMENT_AMOUNT_LABEL} (${cur === "UNKNOWN" ? "валюта не указана" : cur})`)
      : allManagerCurrencies.length === 1
      ? [`${PAYMENT_AMOUNT_LABEL} (${allManagerCurrencies[0] === "UNKNOWN" ? "валюта не указана" : allManagerCurrencies[0]})`]
      : [PAYMENT_AMOUNT_LABEL]),
    "Компании с отгрузками (период)",
  ];

  const managersHeaderRowIndex = addOperationalHeader(managersSheet, logoImageId, {
    title: "Коммерческая воронка: Показатели менеджеров",
    period: periodLabel,
    generatedAt: now,
    recordCount: managerScorecard.length,
    filtersText: filtersSummaryText,
    colCount: managersColumns.length,
    disclosureLines: extraWarnings,
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
    const payAmounts: (number | string)[] = isMultiManagerCurrencies
      ? allManagerCurrencies.map((cur) => {
          const amt = m.paymentAmountsByCurrency?.[cur];
          const curQual = m.paymentAmountsQualityByCurrency?.[cur];
          if (curQual === "INVALID_ONLY") return "Ошибка данных";
          if (curQual === "UNKNOWN") return "Нет данных";
          if (typeof amt === "number") return amt;
          return 0;
        })
      : [
          m.paymentAmountQuality === "INVALID_ONLY"
            ? "Ошибка данных"
            : m.paymentAmountQuality === "UNKNOWN"
            ? "Нет данных"
            : m.paymentAmount !== null
            ? m.paymentAmount
            : 0,
        ];

    const row = managersSheet.addRow([
      m.name,
      // PORTFOLIO (current)
      m.activeCompanies,
      m.inTesting,
      m.awaitingPayment,
      m.noNextStep,
      m.bottlenecksCount,
      // PERIOD FLOW
      m.newCompanies,
      m.samplesSent,
      // RESULT
      m.sampleSuccess,
      m.sampleFail,
      m.sampleRework,
      m.paymentsReceived,
      ...payAmounts,
      shipmentsByManager.get(m.responsibleId) ?? 0,
    ]);
    row.height = 20;

    for (let c = 2; c <= managersColumns.length; c++) {
      row.getCell(c).numFmt = NUMFMT.INTEGER;
    }

    const moneyColStart = 13;
    if (isMultiManagerCurrencies) {
      for (let i = 0; i < allManagerCurrencies.length; i++) {
        const cur = allManagerCurrencies[i];
        const cell = row.getCell(moneyColStart + i);
        if (typeof payAmounts[i] === "number") {
          cell.numFmt = getMoneyNumFmt(cur);
        }
        if (m.paymentAmountsQualityByCurrency?.[cur] === "PARTIAL") {
          cell.note = "Неполные данные: присутствуют сделки с некорректной суммой";
        }
      }
    } else {
      const singleCur = allManagerCurrencies[0];
      const cell = row.getCell(moneyColStart);
      if (typeof payAmounts[0] === "number") {
        cell.numFmt = getMoneyNumFmt(singleCur);
      }
      if (
        m.paymentAmountQuality === "PARTIAL" ||
        (singleCur && m.paymentAmountsQualityByCurrency?.[singleCur] === "PARTIAL")
      ) {
        cell.note = "Неполные данные: присутствуют сделки с некорректной суммой";
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
  // SHEET 6: Action Plan (operationally usable in a management meeting)
  // ═══════════════════════════════════════════════════════════════════
  const bottlenecksSheet = workbook.addWorksheet("Action Plan", {
    views: [{ showGridLines: true }],
  });

  const bottlenecksColumns = [
    "Компания",
    "Менеджер",
    "Где зависло",
    "Текущее состояние",
    "Дней ожидания",
    "Последняя активность",
    "Следующий шаг",
    "Срок",
    "Сделка",
  ];

  const botHeaderRowIndex = addOperationalHeader(bottlenecksSheet, logoImageId, {
    title: "Коммерческая воронка: План действий",
    period: periodLabel,
    generatedAt: now,
    recordCount: actionPlan.length,
    filtersText: filtersSummaryText,
    colCount: bottlenecksColumns.length,
    disclosureLines: extraWarnings,
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
  for (const a of actionPlan) {
    const lastActivityVal = toExcelDate(a.lastActivity);
    const nextDateVal = toExcelDate(a.nextActionDate);
    const row = bottlenecksSheet.addRow([
      a.companyTitle,
      a.responsibleName,
      a.stuckAt,
      a.currentState,
      typeof a.daysWaiting === "number" ? a.daysWaiting : "—",
      a.lastActivityKnown ? (lastActivityVal || a.lastActivity || "—") : "данные активности недоступны",
      a.nextAction || NEXT_ACTION_MISSING_LABEL,
      nextDateVal || (a.nextActionDate || "—"),
      a.dealTitle || "—",
    ]);
    row.height = 24;
    row.alignment = { vertical: "top", wrapText: true };

    if (typeof a.daysWaiting === "number") row.getCell(5).numFmt = NUMFMT.INTEGER;
    if (lastActivityVal) row.getCell(6).numFmt = NUMFMT.DATE;
    if (nextDateVal) row.getCell(8).numFmt = NUMFMT.DATE;

    applyStatusCell(row.getCell(3), "Внимание");
    row.getCell(3).value = a.stuckAt;
  }
  const endBotRow = startBotRow + actionPlan.length - 1;
  if (actionPlan.length > 0) {
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
