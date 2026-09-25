// src/lib/excel-brand/header.ts
// ─────────────────────────────────────────────────────────────────────
// Branded header generators for Operational, Account, and Management reports.
// ─────────────────────────────────────────────────────────────────────

import type ExcelJS from "exceljs";
import { addBrandLogo } from "./image";
import {
  FILL_SECTION_HEADER_BAR,
  FILL_SECTION_HEADER_SOFT,
  FONT_METADATA_LABEL,
  FONT_METADATA_VALUE,
  FONT_REPORT_SUBTITLE,
  FONT_REPORT_TITLE,
  FONT_SECTION_HEADER,
  FONT_SECTION_HEADER_WHITE,
  THIN_BORDER,
} from "./styles";
import {
  formatReportDateTime,
  REPORT_TIMEZONE,
  RS_BLUE_PRIMARY,
  RS_FONT_FAMILY,
  RS_ORANGE_ACCENT,
  RS_TEXT_SECONDARY,
} from "./tokens";

/**
 * Renders the corporate separator strip beneath metadata:
 * RS_BLUE_PRIMARY horizontal band with RS_ORANGE_ACCENT bottom border.
 */
export function addCorporateDivider(
  worksheet: ExcelJS.Worksheet,
  rowNumber: number,
  colCount: number
): void {
  const row = worksheet.getRow(rowNumber);
  row.height = 4;

  for (let c = 1; c <= Math.max(colCount, 5); c++) {
    const cell = row.getCell(c);
    cell.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: `FF${RS_BLUE_PRIMARY}` },
    };
    cell.border = {
      bottom: { style: "medium", color: { argb: `FF${RS_ORANGE_ACCENT}` } },
    };
  }
}

export interface OperationalHeaderOptions {
  title: string;
  period?: string;
  generatedAt?: Date;
  recordCount?: number;
  filtersText?: string;
  colCount: number;
}

/**
 * Builds the compact 5-row operational corporate header for Deals and Companies.
 * Returns the 1-based row index for the data table header (row 6).
 */
export function addOperationalHeader(
  worksheet: ExcelJS.Worksheet,
  imageId: number | null,
  options: OperationalHeaderOptions
): number {
  const colCount = Math.max(options.colCount, 5);
  const now = options.generatedAt || new Date();
  const dateStr = formatReportDateTime(now);

  // Ensure first column has sufficient width for the logo
  const col1 = worksheet.getColumn(1);
  if (!col1.width || col1.width < 14) {
    col1.width = 14;
  }

  // Row 1: Report Title
  const row1 = worksheet.getRow(1);
  row1.height = 28;
  const titleMergeEnd = Math.min(6, colCount);
  if (titleMergeEnd > 2) {
    worksheet.mergeCells(1, 2, 1, titleMergeEnd);
  }
  const titleCell = row1.getCell(2);
  const upperTitle = options.title.toUpperCase();
  const safeTitle = /^[=\-+\@]/.test(upperTitle) ? "'" + upperTitle : upperTitle;
  titleCell.value = safeTitle;
  titleCell.font = FONT_REPORT_TITLE;
  titleCell.alignment = { vertical: "middle", horizontal: "left" };

  // Place logo in Col 1 (height 56px, aspect ratio safe)
  if (imageId !== null) {
    addBrandLogo(worksheet, imageId, { height: 56, col: 0.15, row: 0.15 });
  }

  // Row 2: Period & Generation Timestamp & Records Count
  const row2 = worksheet.getRow(2);
  row2.height = 18;
  const metaMergeEnd = Math.min(8, colCount);
  if (metaMergeEnd > 2) {
    worksheet.mergeCells(2, 2, 2, metaMergeEnd);
  }
  const metaCell = row2.getCell(2);
  const periodStr = options.period || "Все";
  const countStr = options.recordCount !== undefined ? options.recordCount : 0;
  metaCell.value = `Период: ${periodStr}   |   Сформировано: ${dateStr} (Москва, UTC+3)   |   Записей: ${countStr}`;
  metaCell.font = { name: RS_FONT_FAMILY, size: 9, color: { argb: `FF${RS_TEXT_SECONDARY}` } };
  metaCell.alignment = { vertical: "middle", horizontal: "left" };

  // Row 3: Active Filters
  const row3 = worksheet.getRow(3);
  row3.height = 18;
  if (metaMergeEnd > 2) {
    worksheet.mergeCells(3, 2, 3, metaMergeEnd);
  }
  const filtersCell = row3.getCell(2);
  filtersCell.value = `Фильтры: ${options.filtersText || "Все"}`;
  filtersCell.font = { name: RS_FONT_FAMILY, size: 9, color: { argb: `FF${RS_TEXT_SECONDARY}` } };
  filtersCell.alignment = { vertical: "middle", horizontal: "left" };

  // Row 4: Spacer row
  const row4 = worksheet.getRow(4);
  row4.height = 6;

  // Row 5: Corporate separator strip
  addCorporateDivider(worksheet, 5, colCount);

  // Data table header will be row 6
  return 6;
}

export interface AccountHeaderOptions {
  companyTitle: string;
  companyId?: string;
  responsibleName?: string;
  generatedAt?: Date;
  colCount?: number;
}

/**
 * Builds the branded Account Report header for Single Company export.
 * Returns the next available row number.
 */
export function addAccountHeader(
  worksheet: ExcelJS.Worksheet,
  imageId: number | null,
  options: AccountHeaderOptions
): number {
  const colCount = options.colCount ?? 5;
  const now = options.generatedAt || new Date();
  const dateStr = formatReportDateTime(now);

  // Ensure first column has sufficient width for ~70px logo
  const col1 = worksheet.getColumn(1);
  if (!col1.width || col1.width < 16) {
    col1.width = 16;
  }

  // Row 1: Report Title
  const row1 = worksheet.getRow(1);
  row1.height = 24;
  worksheet.mergeCells(1, 2, 1, colCount);
  const titleCell = row1.getCell(2);
  titleCell.value = "ОТЧЁТ ПО КОМПАНИИ";
  titleCell.font = FONT_REPORT_TITLE;
  titleCell.alignment = { vertical: "middle", horizontal: "left" };

  // Place logo (height ~68px)
  if (imageId !== null) {
    addBrandLogo(worksheet, imageId, { height: 68, col: 0.15, row: 0.15 });
  }

  // Row 2: Company Title
  const row2 = worksheet.getRow(2);
  row2.height = 26;
  worksheet.mergeCells(2, 2, 2, colCount);
  const compCell = row2.getCell(2);
  const cleanTitle = (options.companyTitle || "Компания")
    .replace(/[\r\n\t]+/g, " ")
    .trim();
  const safeTitle = /^[=\-+\@]/.test(cleanTitle) ? "'" + cleanTitle : cleanTitle;
  compCell.value = safeTitle;
  compCell.font = { name: RS_FONT_FAMILY, size: 14, bold: true, color: { argb: `FF${RS_BLUE_PRIMARY}` } };
  compCell.alignment = { vertical: "middle", horizontal: "left" };

  // Row 3: Metadata
  const row3 = worksheet.getRow(3);
  row3.height = 20;
  worksheet.mergeCells(3, 2, 3, colCount);
  const metaCell = row3.getCell(2);
  const idStr = options.companyId ? `CRM ID: ${options.companyId}   |   ` : "";
  const respStr = options.responsibleName ? `Ответственный: ${options.responsibleName}   |   ` : "";
  metaCell.value = `${idStr}${respStr}Дата формирования: ${dateStr} (Москва, UTC+3)`;
  metaCell.font = { name: RS_FONT_FAMILY, size: 9, color: { argb: `FF${RS_TEXT_SECONDARY}` } };
  metaCell.alignment = { vertical: "middle", horizontal: "left" };

  // Row 4: Spacer
  const row4 = worksheet.getRow(4);
  row4.height = 8;

  // Row 5: Corporate separator strip
  addCorporateDivider(worksheet, 5, colCount);

  // Row 6: Spacer before sections
  const row6 = worksheet.getRow(6);
  row6.height = 10;

  return 7;
}

/**
 * Adds a standardized section header bar.
 */
export function addSectionHeader(
  worksheet: ExcelJS.Worksheet,
  title: string,
  colCount: number,
  options?: { soft?: boolean; height?: number }
): ExcelJS.Row {
  const nextRow = worksheet.rowCount + 1;
  const row = worksheet.addRow([title]);
  row.height = options?.height ?? 22;

  if (colCount > 1) {
    worksheet.mergeCells(nextRow, 1, nextRow, colCount);
  }

  const cell = row.getCell(1);
  cell.alignment = { vertical: "middle", indent: 1 };

  if (options?.soft) {
    cell.fill = FILL_SECTION_HEADER_SOFT;
    cell.font = FONT_SECTION_HEADER;
  } else {
    cell.fill = FILL_SECTION_HEADER_BAR;
    cell.font = FONT_SECTION_HEADER_WHITE;
  }

  for (let c = 1; c <= colCount; c++) {
    row.getCell(c).border = THIN_BORDER;
  }

  return row;
}
