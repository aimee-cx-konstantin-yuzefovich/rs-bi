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
import { applyStatusCell, mapBusinessStatusToSemantic, translateCrmValueToRussian } from "./status";

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
  moneyColumnIndices?: number[];
  headerRowIndex?: number;
}

/**
 * Ensures column titles are displayed strictly in Russian, translating
 * raw CRM field identifiers and English titles like "Opportunity", "Title", "Stage".
 */
export function formatHeaderToRussian(colName: string): string {
  if (!colName || typeof colName !== "string") return "";
  const trim = colName.trim();

  // Strip leading "Компания: " or "Сделка: " if present
  const stripped = trim.replace(/^(Компания|Сделка):\s*/i, "");
  const lower = stripped.toLowerCase();
  const upper = stripped.toUpperCase();

  if (lower === "opportunity" || lower === "opportunity_amount" || upper === "OPPORTUNITY") {
    return "Сумма";
  }
  if (lower === "title" || upper === "TITLE") {
    return "Название";
  }
  if (lower === "stage" || lower === "stage_id" || upper === "STAGE_ID") {
    return "Стадия";
  }
  if (lower === "company_title" || upper === "COMPANY_TITLE") {
    return "Компания";
  }
  if (lower === "company_id" || upper === "COMPANY_ID") {
    return "ID компании";
  }
  if (lower === "date_create" || upper === "DATE_CREATE" || upper === "COMPANY_DATE_CREATE") {
    return "Дата создания";
  }
  if (lower === "date_modify" || upper === "DATE_MODIFY" || upper === "COMPANY_DATE_MODIFY") {
    return "Дата изменения";
  }
  if (
    lower === "assigned_by_id" ||
    upper === "ASSIGNED_BY_ID" ||
    upper === "COMPANY_ASSIGNED_BY_ID" ||
    lower === "responsible" ||
    lower === "assigned_by"
  ) {
    return "Ответственный";
  }
  if (lower === "currency" || lower === "currency_id" || upper === "CURRENCY_ID") {
    return "Валюта";
  }
  if (lower === "comments" || upper === "COMMENTS" || upper === "COMPANY_COMMENTS") {
    return "Комментарий";
  }
  if (lower === "phone" || upper === "PHONE") {
    return "Телефон";
  }
  if (lower === "email" || upper === "EMAIL") {
    return "Эл. почта";
  }
  if (lower === "status" || lower === "status_id" || upper === "STATUS_ID") {
    return "Статус";
  }
  if (lower === "revenue" || upper === "COMPANY_REVENUE") {
    return "Годовой оборот";
  }
  if (lower === "industry" || upper === "COMPANY_INDUSTRY") {
    return "Сфера деятельности";
  }
  if (upper === "ACTIVITY_LAST") {
    return "Последняя активность";
  }
  if (upper === "ACTIVITY_NEXT") {
    return "Следующее действие";
  }
  if (upper === "BEGINDATE" || lower === "begindate") {
    return "Дата начала";
  }
  if (upper === "CLOSEDATE" || lower === "closedate") {
    return "Дата завершения";
  }
  if (upper === "PROBABILITY" || lower === "probability") {
    return "Вероятность";
  }
  if (upper === "TYPE_ID" || upper === "TYPE" || lower === "type") {
    return "Тип";
  }
  if (upper === "SOURCE_ID" || upper === "SOURCE" || lower === "source") {
    return "Источник";
  }
  if (upper === "SOURCE_DESCRIPTION") {
    return "Описание источника";
  }
  if (upper === "CREATED_BY_ID" || upper === "CREATED_BY") {
    return "Кем создана";
  }
  if (upper === "MODIFY_BY_ID" || upper === "MODIFY_BY") {
    return "Кем изменена";
  }
  if (upper === "OPENED") {
    return "Доступна для всех";
  }
  if (upper === "LEAD_ID") {
    return "Лид";
  }
  if (upper === "CONTACT_ID") {
    return "Контакт";
  }
  if (upper === "WEB") {
    return "Сайт";
  }
  if (upper === "ADDRESS") {
    return "Адрес";
  }
  if (upper === "BANKING_DETAILS") {
    return "Реквизиты";
  }
  if (upper === "NAME") {
    return "Имя";
  }
  if (upper === "LAST_NAME") {
    return "Фамилия";
  }
  if (upper === "SECOND_NAME") {
    return "Отчество";
  }
  if (upper === "POST") {
    return "Должность";
  }
  if (upper === "TAX_VALUE") {
    return "Налог";
  }
  if (upper === "ADDITIONAL_INFO") {
    return "Дополнительная информация";
  }

  if (upper.startsWith("COMPANY_")) {
    const sub = upper.replace(/^COMPANY_/, "");
    return formatHeaderToRussian(sub);
  }

  return stripped;
}

/**
 * Checks whether a column header represents monetary/currency values.
 */
export function isCurrencyHeader(title: string): boolean {
  if (!title) return false;
  const lower = title.toLowerCase();
  return (
    lower.includes("сумм") ||
    lower.includes("₽") ||
    lower.includes("руб") ||
    lower.includes("оборо") ||
    lower.includes("бюджет") ||
    lower.includes("стоимост") ||
    lower.includes("выручк") ||
    lower.includes("opportunity") ||
    lower.includes("цена")
  );
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
  // Identify money columns: either passed explicitly in options.moneyColumnIndices
  // or auto-detected by inspecting the header row text
  const moneyColIndices = new Set<number>(options?.moneyColumnIndices ?? []);
  const headerRowNum = options?.headerRowIndex ?? (startRow > 1 ? startRow - 1 : null);
  if (headerRowNum !== null && headerRowNum > 0) {
    const headerRow = worksheet.getRow(headerRowNum);
    for (let c = 1; c <= colCount; c++) {
      const headerCell = headerRow.getCell(c);
      const headerText = String(headerCell.value ?? "");
      if (isCurrencyHeader(headerText)) {
        moneyColIndices.add(c);
      }
    }
  }

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
      let val = cell.value;

      // Base border
      cell.border = THIN_BORDER;

      // Translate any untranslated English CRM strings in cell values
      if (typeof val === "string") {
        const translated = translateCrmValueToRussian(val);
        if (translated !== val) {
          val = translated;
          cell.value = translated;
        }
      }

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
          const hasTime =
            val.getUTCHours() !== 0 ||
            val.getUTCMinutes() !== 0 ||
            val.getUTCSeconds() !== 0;
          cell.numFmt = hasTime ? NUMFMT.DATETIME : NUMFMT.DATE;
        }
        continue;
      }

      // Native Number
      if (typeof val === "number") {
        cell.font = FONT_DATA;
        cell.alignment = { vertical: "middle", horizontal: "right" };
        if (!cell.numFmt) {
          if (moneyColIndices.has(c)) {
            const hasCents = Math.abs(val % 1) > 0.001;
            cell.numFmt = hasCents ? NUMFMT.MONEY_PRECISE : NUMFMT.MONEY;
          } else {
            cell.numFmt = NUMFMT.INTEGER;
          }
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
