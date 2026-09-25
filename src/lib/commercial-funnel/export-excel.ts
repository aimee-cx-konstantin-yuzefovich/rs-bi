// src/lib/commercial-funnel/export-excel.ts
// ─────────────────────────────────────────────────────────────────────
// Structured 5-sheet RusSilica Management Excel report generator.
// Consumes the EXACT same analytical dataset and engine metrics as the UI.
// Sheets: Executive Summary, Companies, Samples, Managers, Bottlenecks.
// ─────────────────────────────────────────────────────────────────────

import ExcelJS from "exceljs";
import {
  COMMERCIAL_TIMEZONE,
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
import { computePeriodBoundaries } from "./date-utils";
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
  applyStatusCell,
  autoFitColumns,
  configureWorksheetPrint,
  FONT_DATA,
  FONT_METADATA_LABEL,
  FONT_METADATA_VALUE,
  FONT_REPORT_SUBTITLE,
  FONT_REPORT_TITLE,
  FONT_SECTION_HEADER_WHITE,
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
  if (!dateStr || typeof dateStr !== "string") return null;
  const trimmed = dateStr.trim();
  if (!trimmed || trimmed === "—") return null;

  // Date-only: YYYY-MM-DD (construct at UTC noon to avoid timezone shift)
  const dateOnlyMatch = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (dateOnlyMatch) {
    const [_, y, m, d] = dateOnlyMatch;
    const dt = new Date(Date.UTC(Number(y), Number(m) - 1, Number(d), 12, 0, 0));
    return isNaN(dt.getTime()) ? null : dt;
  }

  // Datetime with time component
  const dtMatch = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2}):(\d{2})/);
  if (dtMatch) {
    const dt = new Date(trimmed);
    return isNaN(dt.getTime()) ? null : dt;
  }

  return null;
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

  const periodLabel = `${boundaries.currentStartStr} — ${boundaries.currentEndStr} (${filters.periodPreset})`;
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
    ["Бизнес-часовой пояс:", `${COMMERCIAL_TIMEZONE} (MSK, UTC+3)`],
    ["Дата и время формирования:", now.toISOString().replace("T", " ").slice(0, 19)],
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
    const row = summarySheet.addRow([
      k.label,
      k.currentValue,
      k.previousValue,
      k.delta,
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
      row.getCell(2).numFmt = NUMFMT.MONEY;
      row.getCell(3).numFmt = NUMFMT.MONEY;
      row.getCell(4).numFmt = NUMFMT.DELTA_MONEY;
    } else {
      row.getCell(2).numFmt = NUMFMT.INTEGER;
      row.getCell(3).numFmt = NUMFMT.INTEGER;
      row.getCell(4).numFmt = NUMFMT.DELTA_INTEGER;
    }
  }
  const endKpiRow = summarySheet.rowCount;
  styleDataRows(summarySheet, startKpiRow, endKpiRow, 6);

  summarySheet.addRow([]); // Spacer

  // Section 2: WIP Table
  addSectionHeader(summarySheet, "ТЕКУЩИЙ ПОРТФЕЛЬ / СЕЙЧАС В РАБОТЕ (WIP)", 6);

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
    "Сумма (₽)",
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

    const row = companiesSheet.addRow([
      c.id,
      c.title,
      c.responsibleName || c.responsibleId,
      dateCreateVal,
      c.industry || "—",
      c.region || "—",
      c.productType.join(", ") || "—",
      sampleStatusDisplay,
      c.sampleStatusSource,
      sampleDateVal,
      c.sampleTestResult || "—",
      c.primaryDealTitle || "—",
      c.primaryDealStageName || c.primaryDealStageId || "—",
      c.primaryDealOpportunity || 0,
      c.primaryDealPaymentStatus || "—",
      paymentDateVal,
      c.primaryDealActivityNext || "—",
      c.hasAttention ? "Да" : "Нет",
      c.attentionReasons.join("; ") || "—",
    ]);
    row.height = 20;

    // Native Date formats
    if (dateCreateVal) row.getCell(4).numFmt = NUMFMT.DATE;
    if (sampleDateVal) row.getCell(10).numFmt = NUMFMT.DATE;
    if (paymentDateVal) row.getCell(16).numFmt = NUMFMT.DATE;

    // Currency format
    row.getCell(14).numFmt = NUMFMT.INTEGER;

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
    styleDataRows(companiesSheet, startCompRow, endCompRow, companiesColumns.length);
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
    styleDataRows(samplesSheet, startSamplesRow, endSamplesRow, samplesColumns.length);
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
    `${PAYMENT_AMOUNT_LABEL} (₽)`,
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

    for (let c = 2; c <= 9; c++) {
      row.getCell(c).numFmt = NUMFMT.INTEGER;
    }
    row.getCell(10).numFmt = NUMFMT.INTEGER;
    row.getCell(11).numFmt = NUMFMT.INTEGER;

    if (m.bottlenecksCount > 0) {
      applyStatusCell(row.getCell(11), "Внимание");
      row.getCell(11).value = m.bottlenecksCount;
    }
  }
  const endManagersRow = startManagersRow + managerScorecard.length - 1;
  if (managerScorecard.length > 0) {
    styleDataRows(managersSheet, startManagersRow, endManagersRow, managersColumns.length);
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
    "Сумма (₽)",
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
    const row = bottlenecksSheet.addRow([
      b.companyTitle,
      b.responsibleName,
      b.issueLabel,
      b.currentState,
      relevantDateVal,
      b.daysWaiting,
      b.dealTitle || "—",
      b.amount || 0,
      b.nextAction || "—",
    ]);
    row.height = 20;

    if (relevantDateVal) row.getCell(5).numFmt = NUMFMT.DATE;
    if (typeof b.daysWaiting === "number") row.getCell(6).numFmt = NUMFMT.INTEGER;
    row.getCell(8).numFmt = NUMFMT.INTEGER;

    // Attention styling
    applyStatusCell(row.getCell(3), "Внимание");
    row.getCell(3).value = b.issueLabel;
  }
  const endBotRow = startBotRow + bottlenecks.length - 1;
  if (bottlenecks.length > 0) {
    styleDataRows(bottlenecksSheet, startBotRow, endBotRow, bottlenecksColumns.length);
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
  const dateStr = (options.now || new Date()).toISOString().slice(0, 10);
  a.download = `РусСилика_Коммерческая_воронка_${options.filters.periodPreset}_${dateStr}.xlsx`;
  a.click();
  window.URL.revokeObjectURL(url);
}
