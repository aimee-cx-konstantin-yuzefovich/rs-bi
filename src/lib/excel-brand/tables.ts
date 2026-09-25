// src/lib/excel-brand/tables.ts
// ─────────────────────────────────────────────────────────────────────
// Table styling, zebra striping, and column auto-fitting for RusSilica Excel reports.
// ─────────────────────────────────────────────────────────────────────

import type ExcelJS from "exceljs";
import {
  FILL_TABLE_HEADER,
  FILL_ZEBRA_EVEN,
  FILL_ZEBRA_ODD,
  FONT_DATA,
  FONT_TABLE_HEADER,
  TABLE_HEADER_BORDER,
  THIN_BORDER,
} from "./styles";
import { ATTENTION_BG, NUMFMT, RS_BORDER } from "./tokens";
import { applyStatusCell, mapBusinessStatusToSemantic } from "./status";

export interface StyleTableHeaderOptions {
  height?: number;
  colCount?: number;
}

/**
 * Styles a table header row with RusSilica primary blue and white bold text.
 */
export function styleTableHeader(
  row: ExcelJS.Row,
  options?: StyleTableHeaderOptions
): void {
  row.height = options?.height ?? 26;
  const colCount = options?.colCount ?? row.cellCount;

  for (let c = 1; c <= colCount; c++) {
    const cell = row.getCell(c);
    cell.fill = FILL_TABLE_HEADER;
    cell.font = FONT_TABLE_HEADER;
    cell.alignment = {
      vertical: "middle",
      horizontal: "center",
      wrapText: true,
    };
    cell.border = TABLE_HEADER_BORDER;
  }
}

export interface StyleDataRowsOptions {
  highlightRows?: boolean[];
  highlightColorArgb?: string;
  statusColumnIndices?: number[];
}

/**
 * Applies zebra striping, cell borders, native type alignments, and
 * semantic status styling to data rows.
 */
export function styleDataRows(
  worksheet: ExcelJS.Worksheet,
  startRow: number,
  endRow: number,
  colCount: number,
  options?: StyleDataRowsOptions
): void {
  for (let r = startRow; r <= endRow; r++) {
    const row = worksheet.getRow(r);
    row.height = row.height && row.height > 20 ? row.height : 20;

    const dataIndex = r - startRow;
    const isHighlighted = options?.highlightRows?.[dataIndex] === true;
    const isEven = r % 2 === 0;

    const defaultFill = isHighlighted
      ? {
          type: "pattern" as const,
          pattern: "solid" as const,
          fgColor: { argb: options?.highlightColorArgb ? options.highlightColorArgb : `FF${ATTENTION_BG}` },
        }
      : isEven
      ? FILL_ZEBRA_EVEN
      : FILL_ZEBRA_ODD;

    for (let c = 1; c <= colCount; c++) {
      const cell = row.getCell(c);
      const val = cell.value;

      // Base border
      cell.border = THIN_BORDER;

      // Check if cell is specifically identified as status column or is a status string
      const isStatusCol = options?.statusColumnIndices?.includes(c);
      if (typeof val === "string" && (isStatusCol || isRecognizedStatusValue(val))) {
        applyStatusCell(cell, val);
        continue;
      }

      // Default fill
      cell.fill = defaultFill;

      // Native Date
      if (val instanceof Date) {
        cell.font = FONT_DATA;
        cell.alignment = { vertical: "middle", horizontal: "center" };
        if (!cell.numFmt) {
          cell.numFmt = NUMFMT.DATE;
        }
        continue;
      }

      // Native Number
      if (typeof val === "number") {
        cell.font = FONT_DATA;
        cell.alignment = { vertical: "middle", horizontal: "right" };
        if (!cell.numFmt) {
          cell.numFmt = NUMFMT.INTEGER;
        }
        continue;
      }

      // Plain string / empty
      if (!cell.font) {
        cell.font = FONT_DATA;
      }
      if (!cell.alignment) {
        cell.alignment = { vertical: "middle", horizontal: "left" };
      }
    }
  }
}

function isRecognizedStatusValue(str: string): boolean {
  const semantic = mapBusinessStatusToSemantic(str);
  return semantic === "SUCCESS" || semantic === "ATTENTION" || semantic === "NEGATIVE";
}

/**
 * Auto-sizes worksheet columns based on content length.
 */
export function autoFitColumns(
  worksheet: ExcelJS.Worksheet,
  options?: {
    minWidth?: number;
    maxWidth?: number;
    padding?: number;
  }
): void {
  const minWidth = options?.minWidth ?? 12;
  const maxWidth = options?.maxWidth ?? 50;
  const padding = options?.padding ?? 3;

  worksheet.columns.forEach((col) => {
    let maxLen = minWidth;
    if (col && col.eachCell) {
      col.eachCell({ includeEmpty: false }, (cell) => {
        // Skip non-master merged cells
        if (cell.isMerged && cell.master !== cell) {
          return;
        }
        const val = cell.value;
        const str =
          typeof val === "object" && val !== null && "text" in val
            ? String((val as any).text)
            : val instanceof Date
            ? "DD.MM.YYYY"
            : String(val ?? "");
        if (str.length > maxLen) {
          maxLen = str.length;
        }
      });
    }
    col.width = Math.min(Math.max(maxLen + padding, minWidth), maxWidth);
  });
}
