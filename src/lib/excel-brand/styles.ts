// src/lib/excel-brand/styles.ts
// ─────────────────────────────────────────────────────────────────────
// Centralized styling objects and cell formatters for RusSilica Excel reports.
// ─────────────────────────────────────────────────────────────────────

import type ExcelJS from "exceljs";
import {
  FONT_SIZES,
  RS_BACKGROUND,
  RS_BACKGROUND_ALT,
  RS_BLUE_PRIMARY,
  RS_BORDER,
  RS_FONT_FAMILY,
  RS_ORANGE_ACCENT,
  RS_TEXT_PRIMARY,
  RS_TEXT_SECONDARY,
  RS_WHITE,
} from "./tokens";

/** Standard thin border for all report data cells */
export const THIN_BORDER: Partial<ExcelJS.Borders> = {
  top: { style: "thin", color: { argb: `FF${RS_BORDER}` } },
  left: { style: "thin", color: { argb: `FF${RS_BORDER}` } },
  bottom: { style: "thin", color: { argb: `FF${RS_BORDER}` } },
  right: { style: "thin", color: { argb: `FF${RS_BORDER}` } },
};

/** Table header border */
export const TABLE_HEADER_BORDER: Partial<ExcelJS.Borders> = {
  top: { style: "thin", color: { argb: `FF${RS_BLUE_PRIMARY}` } },
  left: { style: "thin", color: { argb: `FF${RS_BORDER}` } },
  right: { style: "thin", color: { argb: `FF${RS_BORDER}` } },
  bottom: { style: "medium", color: { argb: `FF${RS_ORANGE_ACCENT}` } },
};

/** Typography definitions */
export const FONT_REPORT_TITLE: Partial<ExcelJS.Font> = {
  name: RS_FONT_FAMILY,
  size: FONT_SIZES.TITLE,
  bold: true,
  color: { argb: `FF${RS_BLUE_PRIMARY}` },
};

export const FONT_REPORT_SUBTITLE: Partial<ExcelJS.Font> = {
  name: RS_FONT_FAMILY,
  size: FONT_SIZES.SUBTITLE,
  bold: true,
  color: { argb: `FF${RS_TEXT_SECONDARY}` },
};

export const FONT_SECTION_HEADER: Partial<ExcelJS.Font> = {
  name: RS_FONT_FAMILY,
  size: FONT_SIZES.SECTION_HEADER,
  bold: true,
  color: { argb: `FF${RS_BLUE_PRIMARY}` },
};

export const FONT_SECTION_HEADER_WHITE: Partial<ExcelJS.Font> = {
  name: RS_FONT_FAMILY,
  size: FONT_SIZES.SECTION_HEADER,
  bold: true,
  color: { argb: `FF${RS_WHITE}` },
};

export const FONT_TABLE_HEADER: Partial<ExcelJS.Font> = {
  name: RS_FONT_FAMILY,
  size: FONT_SIZES.TABLE_HEADER,
  bold: true,
  color: { argb: `FF${RS_WHITE}` },
};

export const FONT_DATA: Partial<ExcelJS.Font> = {
  name: RS_FONT_FAMILY,
  size: FONT_SIZES.DATA,
  color: { argb: `FF${RS_TEXT_PRIMARY}` },
};

export const FONT_DATA_BOLD: Partial<ExcelJS.Font> = {
  name: RS_FONT_FAMILY,
  size: FONT_SIZES.DATA,
  bold: true,
  color: { argb: `FF${RS_TEXT_PRIMARY}` },
};

export const FONT_METADATA_LABEL: Partial<ExcelJS.Font> = {
  name: RS_FONT_FAMILY,
  size: FONT_SIZES.METADATA,
  bold: true,
  color: { argb: `FF${RS_TEXT_SECONDARY}` },
};

export const FONT_METADATA_VALUE: Partial<ExcelJS.Font> = {
  name: RS_FONT_FAMILY,
  size: FONT_SIZES.METADATA,
  color: { argb: `FF${RS_TEXT_PRIMARY}` },
};

export const FONT_KPI_VALUE: Partial<ExcelJS.Font> = {
  name: RS_FONT_FAMILY,
  size: FONT_SIZES.KPI_VALUE,
  bold: true,
  color: { argb: `FF${RS_BLUE_PRIMARY}` },
};

export const FONT_KPI_LABEL: Partial<ExcelJS.Font> = {
  name: RS_FONT_FAMILY,
  size: FONT_SIZES.KPI_LABEL,
  bold: true,
  color: { argb: `FF${RS_TEXT_SECONDARY}` },
};

/** Fills */
export const FILL_TABLE_HEADER: ExcelJS.Fill = {
  type: "pattern",
  pattern: "solid",
  fgColor: { argb: `FF${RS_BLUE_PRIMARY}` },
};

export const FILL_ZEBRA_ODD: ExcelJS.Fill = {
  type: "pattern",
  pattern: "solid",
  fgColor: { argb: `FF${RS_WHITE}` },
};

export const FILL_ZEBRA_EVEN: ExcelJS.Fill = {
  type: "pattern",
  pattern: "solid",
  fgColor: { argb: `FF${RS_BACKGROUND}` },
};

export const FILL_SECTION_HEADER_BAR: ExcelJS.Fill = {
  type: "pattern",
  pattern: "solid",
  fgColor: { argb: `FF${RS_BLUE_PRIMARY}` },
};

export const FILL_SECTION_HEADER_SOFT: ExcelJS.Fill = {
  type: "pattern",
  pattern: "solid",
  fgColor: { argb: `FF${RS_BACKGROUND_ALT}` },
};

/**
 * Apply thin borders to all cells in a row between startCol and endCol.
 */
export function applyRowBorders(
  row: ExcelJS.Row,
  startCol: number,
  endCol: number,
  border: Partial<ExcelJS.Borders> = THIN_BORDER
): void {
  for (let c = startCol; c <= endCol; c++) {
    row.getCell(c).border = border;
  }
}
