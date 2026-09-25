// src/lib/export-utils.ts
// ─────────────────────────────────────────────────────────────────────
// Excel export utilities for RusSilica BI Terminal.
// Implements unified corporate branding across Deals, Companies, and Single Company reports.
// ─────────────────────────────────────────────────────────────────────

import ExcelJS from "exceljs";
import {
  addAccountHeader,
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
  FILL_SECTION_HEADER_SOFT,
  disambiguateHeaders,
  formatCurrencyToRussian,
  formatHeaderToRussian,
  formatReportDateForFilename,
  formatStageToRussian,
  getMoneyNumFmt,
  mapBusinessStatusToSemantic,
  NUMFMT,
  registerBrandLogo,
  REPORT_TIMEZONE,
  RS_FONT_FAMILY,
  RS_SYSTEM_TITLE,
  RS_TEXT_SECONDARY,
  styleDataRows,
  styleTableHeader,
  THIN_BORDER,
  translateCrmValueToRussian,
} from "./excel-brand";

export interface WysiwygExportOptions {
  sheetName?: string;
  fileNamePrefix?: string;
  title?: string;
  period?: string;
  filtersText?: string;
  // Parallel array to `data` — true marks a row for a highlighted fill,
  // mirroring an on-screen row highlight (e.g. the "Образцы" toggle).
  highlightRows?: boolean[];
  highlightColorArgb?: string;
  logoImageId?: number | null;
  rawColumnIds?: string[];
  rowCurrencies?: (string | null | undefined)[];
  columnCurrencies?: Record<number, string | null | undefined>;
}

/**
 * Builds an ExcelJS Workbook for WYSIWYG export (Deals or Companies).
 * Anchors compact corporate header on rows 1-5, table header on row 6,
 * and freeze panes below the table header.
 */
export async function buildWysiwygWorkbook(
  data: (string | number | Date | null | undefined)[][],
  columns: string[],
  options?: WysiwygExportOptions
): Promise<ExcelJS.Workbook> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = RS_SYSTEM_TITLE;
  workbook.lastModifiedBy = RS_SYSTEM_TITLE;
  const now = new Date();
  workbook.created = now;
  workbook.modified = now;

  const sheetName = options?.sheetName || "Сделки";
  const worksheet = workbook.addWorksheet(sheetName, {
    views: [{ showGridLines: true }],
  });

  // Register / Add logo
  let imageId = options?.logoImageId ?? null;
  if (imageId === null) {
    imageId = await registerBrandLogo(workbook);
  }

  const defaultTitle = sheetName.toLowerCase().includes("компан")
    ? "Отчёт по компаниям"
    : "Отчёт по сделкам";

  const rawColumnIds = options?.rawColumnIds;
  const cleanColumns = columns.map((col, idx) =>
    formatHeaderToRussian(col, { fieldId: rawColumnIds?.[idx] })
  );
  const finalColumns = disambiguateHeaders(cleanColumns, rawColumnIds);

  // 1. Operational Corporate Header (Rows 1-5)
  const tableHeaderRowIndex = addOperationalHeader(worksheet, imageId, {
    title: options?.title || defaultTitle,
    period: options?.period || "Все",
    generatedAt: now,
    recordCount: data.length,
    filtersText: options?.filtersText || "Все",
    colCount: finalColumns.length,
  });

  // 2. Table Header (Row 6)
  const tableHeaderRow = worksheet.getRow(tableHeaderRowIndex);
  tableHeaderRow.values = finalColumns;
  styleTableHeader(tableHeaderRow, { colCount: finalColumns.length });

  // 3. Freeze panes: keep header rows 1-6 visible when scrolling
  worksheet.views = [
    {
      state: "frozen",
      ySplit: tableHeaderRowIndex,
      showGridLines: true,
    },
  ];

  // 4. AutoFilter anchored strictly to table header row
  worksheet.autoFilter = {
    from: { row: tableHeaderRowIndex, column: 1 },
    to: { row: tableHeaderRowIndex, column: finalColumns.length },
  };

  // 5. Data rows (Row 7+)
  const detectedColCurrencies: Record<number, string | null | undefined> = { ...(options?.columnCurrencies || {}) };
  for (let c = 0; c < finalColumns.length; c++) {
    const colIdx = c + 1;
    if (detectedColCurrencies[colIdx]) continue;
    for (const row of data) {
      const val = row[c];
      if (typeof val === "string") {
        if (/₽|руб|RUB/i.test(val)) {
          detectedColCurrencies[colIdx] = "RUB";
          break;
        }
        if (/\$|USD/i.test(val)) {
          detectedColCurrencies[colIdx] = "USD";
          break;
        }
        if (/€|EUR/i.test(val)) {
          detectedColCurrencies[colIdx] = "EUR";
          break;
        }
      }
    }
  }

  const startDataRow = tableHeaderRowIndex + 1;
  for (const rawRow of data) {
    const parsedRow = rawRow.map((val) => parseCellNativeValue(val));
    worksheet.addRow(parsedRow);
  }
  const endDataRow = startDataRow + data.length - 1;

  if (data.length > 0) {
    styleDataRows(worksheet, startDataRow, endDataRow, finalColumns.length, {
      highlightRows: options?.highlightRows,
      highlightColorArgb: options?.highlightColorArgb,
      headerRowIndex: tableHeaderRowIndex,
      rowCurrencies: options?.rowCurrencies,
      columnCurrencies: detectedColCurrencies,
    });
  }

  // 6. Auto-fit column widths
  autoFitColumns(worksheet, { minWidth: 12, maxWidth: 50 });
  const col1 = worksheet.getColumn(1);
  if (!col1.width || col1.width < 14) {
    col1.width = 14;
  }

  // 7. Print setup & Corporate Footer
  configureWorksheetPrint(worksheet, {
    orientation: "landscape",
    fitToWidth: 1,
    fitToHeight: 0,
    printTitlesRow: `${tableHeaderRowIndex}:${tableHeaderRowIndex}`,
  });
  addCorporateFooter(worksheet);

  return workbook;
}

/**
 * Parses raw cell value preserving native Excel dates, numbers, and nulls.
 */
function parseCellNativeValue(val: unknown): string | number | Date | null {
  if (val === null || val === undefined || val === "" || val === "—") {
    return null;
  }
  if (val instanceof Date) {
    return isNaN(val.getTime()) ? null : val;
  }
  if (typeof val === "number") {
    return isNaN(val) ? null : val;
  }
  if (typeof val === "boolean") {
    return val ? "Да" : "Нет";
  }

  const str = String(val).trim();
  if (!str) return null;

  // 1. Check ISO Datetime: YYYY-MM-DD[T ]HH:mm(:ss)?(.sss)?(Z|[+-]HH:mm)?
  const isoDateTimeMatch = str.match(/^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2}))?(?:\.\d+)?(?:Z|[+-]\d{2}:?\d{2})?$/);
  if (isoDateTimeMatch) {
    const dt = new Date(str.includes("T") || str.includes("Z") ? str : str.replace(" ", "T") + "Z");
    if (!isNaN(dt.getTime())) return dt;
  }

  // 2. Check Russian Datetime: DD.MM.YYYY[T ]HH:mm(:ss)?
  const ruDateTimeMatch = str.match(/^(\d{2})\.(\d{2})\.(\d{4})[T ](\d{2}):(\d{2})(?::(\d{2}))?$/);
  if (ruDateTimeMatch) {
    const [_, d, m, y, hh, mm, ss] = ruDateTimeMatch;
    const dt = new Date(Date.UTC(Number(y), Number(m) - 1, Number(d), Number(hh), Number(mm), Number(ss || 0)));
    if (!isNaN(dt.getTime())) return dt;
  }

  // 3. Check pure ISO date: YYYY-MM-DD
  const isoDateMatch = str.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (isoDateMatch) {
    const [_, y, m, d] = isoDateMatch;
    const dt = new Date(Date.UTC(Number(y), Number(m) - 1, Number(d), 0, 0, 0));
    if (!isNaN(dt.getTime())) return dt;
  }

  // 4. Check pure Russian date: DD.MM.YYYY
  const ruDateMatch = str.match(/^(\d{2})\.(\d{2})\.(\d{4})$/);
  if (ruDateMatch) {
    const [_, d, m, y] = ruDateMatch;
    const dt = new Date(Date.UTC(Number(y), Number(m) - 1, Number(d), 0, 0, 0));
    if (!isNaN(dt.getTime())) return dt;
  }

  // 5. Check formatted money string with currency symbol (e.g. "120 000 ₽" or "50000 руб")
  const moneyMatch = str.match(/^([+-]?[\d\s]+(?:[.,]\d{1,2})?)\s*(?:₽|руб\.?|RUB)$/i);
  if (moneyMatch) {
    const cleanNum = moneyMatch[1].replace(/\s+/g, "").replace(",", ".");
    const num = parseFloat(cleanNum);
    if (!isNaN(num)) return num;
  }

  return translateCrmValueToRussian(str);
}

/**
 * Standardizes filename prefix according to Russian internal business names.
 */
function resolveWysiwygFileName(prefix?: string, defaultPrefix = "РусСилика_Сделки"): string {
  const now = new Date();
  const dateStr = formatReportDateForFilename(now);

  if (!prefix) {
    return `${defaultPrefix}_${dateStr}.xlsx`;
  }
  if (prefix.toLowerCase().includes("deal") || prefix.toLowerCase().includes("сделк")) {
    return `РусСилика_Сделки_${dateStr}.xlsx`;
  }
  if (prefix.toLowerCase().includes("compan") || prefix.toLowerCase().includes("компан")) {
    return `РусСилика_Компании_${dateStr}.xlsx`;
  }

  const safePrefix = prefix.replace(/[\x00-\x1f\x7f\\/:*?"<>|]/g, "_").trim();
  return `${safePrefix || defaultPrefix}_${dateStr}.xlsx`;
}

/**
 * Export deals (or company) data to Excel (.xlsx) file.
 * WYSIWYG export: exports exactly what is displayed in the table (filtered, sorted, resolved).
 */
export async function exportToExcelWysiwyg(
  data: (string | number | Date | null | undefined)[][],
  columns: string[],
  options?: WysiwygExportOptions
): Promise<void> {
  if (data.length === 0 || columns.length === 0) return;

  const workbook = await buildWysiwygWorkbook(data, columns, options);
  const buffer = await workbook.xlsx.writeBuffer();

  if (typeof window === "undefined" || typeof document === "undefined") {
    return;
  }

  const blob = new Blob([buffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;

  const defaultName = options?.sheetName?.toLowerCase().includes("компан")
    ? "РусСилика_Компании"
    : "РусСилика_Сделки";
  a.download = resolveWysiwygFileName(options?.fileNamePrefix, defaultName);

  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  window.URL.revokeObjectURL(url);
}

export interface CompanyExportField {
  id?: string;
  label: string;
  value: string | null | undefined;
  type?: string;
}

export interface CompanyExportDeal {
  id: string;
  title: string;
  stage?: string | null;
  opportunity?: number | null;
  currency?: string;
}

export interface ExportCompanyOptions {
  companyTitle: string;
  companyId?: string;
  companyFields?: CompanyExportField[];
  fields?: CompanyExportField[];
  sampleFields?: CompanyExportField[];
  deals?: CompanyExportDeal[];
  currentDate?: Date;
  fileName?: string;
  responsibleName?: string;
  workbook?: ExcelJS.Workbook;
  logoImageId?: number | null;
}

/**
 * Normalizes field values for the Single Company report:
 * converts reliable date fields into native Date objects with correct numFmt,
 * preserves blank cells for null/empty values, and translates string values.
 */
export function normalizeCompanyReportFieldValue(field: CompanyExportField): {
  value: Date | string | number | null;
  numFmt?: string;
  isDateField?: boolean;
} {
  const idUpper = (field.id || "").toUpperCase();
  const labelLower = (field.label || "").toLowerCase();
  const typeLower = (field.type || "").toLowerCase();

  const isExplicitDateField =
    typeLower === "date" ||
    typeLower === "datetime" ||
    idUpper.includes("DATE_CREATE") ||
    idUpper.includes("DATE_MODIFY") ||
    idUpper.includes("DATE") ||
    idUpper.includes("UF_CRM_1740925760") ||
    idUpper.includes("UF_CRM_1741517789") ||
    labelLower.includes("дата") ||
    labelLower.includes("date");

  const raw = field.value;
  if (raw === null || raw === undefined || raw === "" || raw === "—") {
    return { value: null, isDateField: isExplicitDateField };
  }

  const str = String(raw).trim();
  if (!str || str === "—") {
    return { value: null, isDateField: isExplicitDateField };
  }

  if (isExplicitDateField) {
    if ((raw as unknown) instanceof Date && !isNaN(((raw as unknown) as Date).getTime())) {
      const dateObj = (raw as unknown) as Date;
      const hasTime = dateObj.getUTCHours() !== 0 || dateObj.getUTCMinutes() !== 0;
      return {
        value: dateObj,
        numFmt: hasTime ? NUMFMT.DATETIME : NUMFMT.DATE,
        isDateField: true,
      };
    }

    // 1. DD.MM.YYYY [HH:mm[:ss]]
    const dmyMatch = str.match(/^(\d{2})\.(\d{2})\.(\d{4})(?:\s+(\d{2}):(\d{2})(?::(\d{2}))?)?$/);
    if (dmyMatch) {
      const [_, day, month, year, h, m, s] = dmyMatch;
      const hasTime = h !== undefined && m !== undefined;
      const hours = hasTime ? Number(h) : 12;
      const minutes = hasTime ? Number(m) : 0;
      const seconds = s ? Number(s) : 0;
      const d = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day), hours, minutes, seconds));
      if (!isNaN(d.getTime())) {
        return {
          value: d,
          numFmt: hasTime ? NUMFMT.DATETIME : NUMFMT.DATE,
          isDateField: true,
        };
      }
    }

    // 2. YYYY-MM-DD (date only)
    const ymdMatch = str.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (ymdMatch) {
      const [_, year, month, day] = ymdMatch;
      const d = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day), 12, 0, 0));
      if (!isNaN(d.getTime())) {
        return { value: d, numFmt: NUMFMT.DATE, isDateField: true };
      }
    }

    // 3. ISO datetime: YYYY-MM-DDTHH:mm:ss
    const isoMatch = str.match(/^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2}))?/);
    if (isoMatch) {
      const d = new Date(str);
      if (!isNaN(d.getTime())) {
        const hasTime = d.getUTCHours() !== 0 || d.getUTCMinutes() !== 0;
        return {
          value: d,
          numFmt: hasTime ? NUMFMT.DATETIME : NUMFMT.DATE,
          isDateField: true,
        };
      }
    }

    return { value: translateCrmValueToRussian(str), isDateField: true };
  }

  return { value: translateCrmValueToRussian(str), isDateField: false };
}

/**
 * Creates an ExcelJS Workbook representing a full branded Account Report for a company card,
 * including main information, sample fields, and related deals.
 */
export function createCompanyExcelWorkbook(options: ExportCompanyOptions): ExcelJS.Workbook {
  const workbook = options.workbook || new ExcelJS.Workbook();
  workbook.creator = RS_SYSTEM_TITLE;
  workbook.lastModifiedBy = RS_SYSTEM_TITLE;
  const now = options.currentDate || new Date();
  workbook.created = now;
  workbook.modified = now;

  const worksheet = workbook.addWorksheet("Отчёт по компании", {
    views: [{ showGridLines: true }],
  });

  // Register / Add logo on this workbook instance
  let imageId = (workbook as any).__russilica_logo_id__ ?? options.logoImageId ?? null;
  if (imageId === null && typeof process !== "undefined" && Boolean(process.versions?.node)) {
    try {
      const nodeRequire = (globalThis as any).__non_webpack_require__ ?? eval("require");
      const fs = nodeRequire("fs");
      const path = nodeRequire("path");
      const logoPath = path.join(process.cwd(), "public", "brand", "russilica-logo.png");
      if (fs.existsSync(logoPath)) {
        const buf = fs.readFileSync(logoPath);
        imageId = workbook.addImage({ buffer: buf, extension: "png" });
        (workbook as any).__russilica_logo_id__ = imageId;
      }
    } catch {}
  }

  // Account Header (Rows 1 to 6)
  const cleanTitle = (options.companyTitle || "Компания")
    .replace(/[\r\n\t]+/g, " ")
    .trim();

  // Extract responsible name from fields if not provided directly
  const rawCompanyFields = options.companyFields || (options as any).fields || [];
  const responsibleField = rawCompanyFields.find((f: any) =>
    f.id?.includes("ASSIGNED_BY") || f.label?.toLowerCase().includes("ответственный")
  );
  const responsibleName = options.responsibleName || responsibleField?.value;

  addAccountHeader(worksheet, imageId, {
    companyTitle: cleanTitle,
    companyId: options.companyId || "—",
    responsibleName,
    generatedAt: now,
    colCount: 5,
  });

  // Section 1: Основная информация
  addSectionHeader(worksheet, "Основная информация", 5);

  const fields = [...rawCompanyFields];
  if (options.companyId && !fields.some((f) => f.id === "ID" || f.label?.toLowerCase().includes("id компании"))) {
    fields.unshift({ id: "ID", label: "ID компании", value: options.companyId });
  }

  for (const field of fields) {
    const cleanLabel = formatHeaderToRussian(field.label, { preserveProvenance: false });
    const parsed = normalizeCompanyReportFieldValue(field);
    const cellValue = parsed.isDateField
      ? (parsed.value instanceof Date ? parsed.value : null)
      : (parsed.value ?? "—");
    const row = worksheet.addRow([cleanLabel, cellValue]);
    row.height = 20;
    worksheet.mergeCells(row.number, 2, row.number, 5);

    const labelCell = row.getCell(1);
    labelCell.font = FONT_METADATA_LABEL;
    labelCell.fill = FILL_SECTION_HEADER_SOFT;
    labelCell.alignment = { vertical: "middle", indent: 1 };

    const valueCell = row.getCell(2);
    valueCell.font = FONT_DATA;
    if (cellValue instanceof Date) {
      valueCell.alignment = { vertical: "middle", horizontal: "left", indent: 1 };
      valueCell.numFmt = parsed.numFmt || NUMFMT.DATE;
    } else if (cellValue === null) {
      valueCell.alignment = { vertical: "middle", horizontal: "left", indent: 1 };
    } else {
      valueCell.alignment = { vertical: "middle", wrapText: true, indent: 1 };
    }

    applyRowBorders(row, 1, 5);
  }

  worksheet.addRow([]);

  // Section 2: Образцы
  addSectionHeader(worksheet, "Образцы", 5);

  const sampleFields = options.sampleFields || [];
  if (sampleFields.length > 0) {
    for (const field of sampleFields) {
      const cleanLabel = formatHeaderToRussian(field.label, { preserveProvenance: false });
      const parsed = normalizeCompanyReportFieldValue(field);
      const cellValue = parsed.isDateField
        ? (parsed.value instanceof Date ? parsed.value : null)
        : (parsed.value ?? "—");
      const row = worksheet.addRow([cleanLabel, cellValue]);
      row.height = 20;
      worksheet.mergeCells(row.number, 2, row.number, 5);

      const labelCell = row.getCell(1);
      labelCell.font = FONT_METADATA_LABEL;
      labelCell.fill = FILL_SECTION_HEADER_SOFT;
      labelCell.alignment = { vertical: "middle", indent: 1 };

      const valueCell = row.getCell(2);
      if (cellValue instanceof Date) {
        valueCell.font = FONT_DATA;
        valueCell.alignment = { vertical: "middle", horizontal: "left", indent: 1 };
        valueCell.numFmt = parsed.numFmt || NUMFMT.DATE;
      } else if (cellValue === null) {
        valueCell.font = FONT_DATA;
        valueCell.alignment = { vertical: "middle", horizontal: "left", indent: 1 };
      } else {
        const valStr = String(cellValue).trim();
        const semantic = mapBusinessStatusToSemantic(valStr);
        if (
          (cleanLabel.includes("Результат") || cleanLabel.includes("Статус")) &&
          (semantic === "SUCCESS" || semantic === "ATTENTION" || semantic === "NEGATIVE")
        ) {
          applyStatusCell(valueCell, valStr);
        } else {
          valueCell.font = FONT_DATA;
          valueCell.alignment = { vertical: "middle", wrapText: true, indent: 1 };
        }
      }

      applyRowBorders(row, 1, 5);
    }
  } else {
    const emptyRow = worksheet.addRow(["Нет данных по образцам"]);
    emptyRow.height = 20;
    worksheet.mergeCells(emptyRow.number, 1, emptyRow.number, 5);
    const emptyCell = emptyRow.getCell(1);
    emptyCell.font = { name: RS_FONT_FAMILY, size: 10, italic: true, color: { argb: `FF${RS_TEXT_SECONDARY}` } };
    emptyCell.fill = FILL_SECTION_HEADER_SOFT;
    emptyCell.alignment = { vertical: "middle", indent: 1 };
    applyRowBorders(emptyRow, 1, 5);
  }

  worksheet.addRow([]);

  // Section 3: Связанные сделки
  const deals = options.deals || [];
  addSectionHeader(worksheet, `Связанные сделки (${deals.length})`, 5);

  if (deals.length > 0) {
    const dealColHeaders = worksheet.addRow(["ID сделки", "Название сделки", "Стадия", "Сумма", "Валюта"]);
    styleTableHeader(dealColHeaders, { colCount: 5 });

    for (const deal of deals) {
      const stageRussian = formatStageToRussian(deal.stage);
      const currencyRussian = formatCurrencyToRussian(deal.currency);
      const dealRow = worksheet.addRow([
        deal.id,
        deal.title,
        stageRussian,
        deal.opportunity !== null && deal.opportunity !== undefined ? deal.opportunity : "—",
        currencyRussian,
      ]);
      dealRow.height = 20;

      for (let c = 1; c <= 5; c++) {
        const cell = dealRow.getCell(c);
        cell.border = THIN_BORDER;
        if (c === 1 || c === 5) {
          cell.alignment = { vertical: "middle", horizontal: "center" };
          cell.font = FONT_DATA;
        } else if (c === 2) {
          cell.alignment = { vertical: "middle", horizontal: "left", wrapText: true };
          cell.font = FONT_DATA;
        } else if (c === 3) {
          if (stageRussian && stageRussian !== "—") {
            applyStatusCell(cell, stageRussian);
          } else {
            cell.font = FONT_DATA;
            cell.alignment = { vertical: "middle", horizontal: "center" };
          }
        } else if (c === 4) {
          cell.font = FONT_DATA;
          cell.alignment = { vertical: "middle", horizontal: "right" };
          if (typeof deal.opportunity === "number") {
            const hasCents = Math.abs(deal.opportunity % 1) > 0.001;
            cell.numFmt = getMoneyNumFmt(deal.currency, hasCents);
          }
        }
      }
    }
  } else {
    const emptyRow = worksheet.addRow(["Нет связанных сделок"]);
    emptyRow.height = 20;
    worksheet.mergeCells(emptyRow.number, 1, emptyRow.number, 5);
    const emptyCell = emptyRow.getCell(1);
    emptyCell.font = { name: RS_FONT_FAMILY, size: 10, italic: true, color: { argb: `FF${RS_TEXT_SECONDARY}` } };
    emptyCell.fill = FILL_SECTION_HEADER_SOFT;
    emptyCell.alignment = { vertical: "middle", indent: 1 };
    applyRowBorders(emptyRow, 1, 5);
  }

  // Column Widths
  worksheet.getColumn(1).width = 38;
  worksheet.getColumn(2).width = 44;
  worksheet.getColumn(3).width = 24;
  worksheet.getColumn(4).width = 18;
  worksheet.getColumn(5).width = 12;

  // Print Setup & Corporate Footer
  configureWorksheetPrint(worksheet, {
    orientation: "portrait",
    fitToWidth: 1,
    fitToHeight: 0,
  });
  addCorporateFooter(worksheet);

  return workbook;
}

/**
 * Downloads an Excel (.xlsx) file with full branded company report.
 */
export async function exportCompanyToExcel(options: ExportCompanyOptions): Promise<void> {
  const workbook = new ExcelJS.Workbook();
  const logoImageId = await registerBrandLogo(workbook);
  createCompanyExcelWorkbook({ ...options, workbook, logoImageId });

  const buffer = await workbook.xlsx.writeBuffer();

  if (typeof window === "undefined" || typeof document === "undefined") {
    return;
  }

  const blob = new Blob([buffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;

  // Sanitize filename: remove control characters, newlines, tabs and filesystem-forbidden characters
  const rawTitle = (options.companyTitle || "")
    .replace(/[\x00-\x1f\x7f\\/:*?"<>|]/g, "_")
    .trim();
  const safeTitle = rawTitle.replace(/^_+|_+$/g, "").trim().slice(0, 50);
  const now = options.currentDate || new Date();
  const dateStr = formatReportDateForFilename(now);
  const prefix = safeTitle ? `РусСилика_Компания_${safeTitle}` : "РусСилика_Компания";
  a.download = options.fileName || `${prefix}_${dateStr}.xlsx`;

  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  window.URL.revokeObjectURL(url);
}
