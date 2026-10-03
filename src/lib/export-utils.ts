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
  formatReportDateTime,
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
import {
  COMPANY_SAMPLES_FIELD_ID,
  COMPANY_SAMPLES_DATE_MULTI_FIELD_ID,
  COMPANY_SAMPLES_DATE_SINGLE_FIELD_ID,
  DEAL_SAMPLE_SENT_DATE_FIELD_ID,
  UNCLASSIFIED_LABEL,
} from "./crm-constants";
import { isValidCalendarDate, parseStrictDate, parseStrictNumber } from "./scalar-safety";
import {
  coverageExcelLines,
  type DatasetCoverage,
} from "./dataset-coverage";
import { resolveResponsibleDisplay } from "./enrichment-coverage";
import { partitionCompanyPreviewFields } from "./company-preview";
import { STALE_SNAPSHOT_DISCLOSURE } from "./commercial-funnel/disclosure";
import { SAMPLE_DATA_ISSUE_LABELS, NORMALIZED_RESULT_LABELS } from "./samples/constants";
import type { SampleSummary, NormalizedResult } from "./samples/types";
import {
  buildDealPreviewModel,
  buildDealActivitiesModel,
  type DealActivityEntryInput,
  type DealPreviewModel,
  type DealPreviewResolvedField,
} from "./deal-preview";
import type { DealTypeRegistry } from "./deal-type";
import {
  formatSamplesPeriodLabel,
  isSamplesPeriodValid,
  type SamplesFilters,
} from "@/components/dashboard/samples/samples-filters";

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
  rawColumnTypes?: (string | undefined)[];
  rowCurrencies?: (string | null | undefined)[];
  columnCurrencies?: Record<number, string | null | undefined>;
  // Detached-artifact truthfulness: the workbook must carry its own dataset
  // coverage (COMPLETE/CAPPED/PARTIAL) — a user can email the .xlsx without
  // the web UI beside it, so a website banner alone is not enough.
  coverage?: DatasetCoverage | null;
  // Domain-specific extra warnings (e.g. activity partial) rendered in the
  // same prominent report-level block.
  extraWarnings?: string[];
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

  // 1. Operational Corporate Header (+ prominent coverage/warning block)
  const disclosureLines: string[] = [];
  if (options?.coverage) {
    disclosureLines.push(...coverageExcelLines(options.coverage));
  }
  if (options?.extraWarnings) {
    disclosureLines.push(...options.extraWarnings);
  }

  const tableHeaderRowIndex = addOperationalHeader(worksheet, imageId, {
    title: options?.title || defaultTitle,
    period: options?.period || "Все",
    generatedAt: now,
    recordCount: data.length,
    filtersText: options?.filtersText || "Все",
    colCount: finalColumns.length,
    disclosureLines,
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

  const rawColumnTypes = options?.rawColumnTypes;
  const colIdentifiers = options?.rawColumnIds || columns;
  const startDataRow = tableHeaderRowIndex + 1;
  for (const rawRow of data) {
    const parsedRow = rawRow.map((val, idx) =>
      parseCellNativeValue(val, {
        fieldId: colIdentifiers?.[idx],
        fieldType: rawColumnTypes?.[idx],
      })
    );
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

export interface CellParseOptions {
  fieldId?: string;
  fieldType?: string;
}

/**
 * Determines whether a column is an explicit date field according to metadata
 * and authoritative CRM field IDs.
 */
export function isExplicitDateField(fieldId?: string, fieldType?: string): boolean {
  if (fieldType) {
    const t = fieldType.toLowerCase();
    if (t === "date" || t === "datetime") return true;
    if (
      [
        "string",
        "text",
        "enumeration",
        "crm_status",
        "integer",
        "double",
        "money",
        "boolean",
        "char",
        "file",
        "url",
        "user",
        "crm_company",
        "crm_contact",
        "crm_deal",
        "crm_lead",
      ].includes(t)
    ) {
      return false;
    }
  }

  if (fieldId) {
    const idUpper = fieldId.toUpperCase();
    if (
      idUpper.includes(COMPANY_SAMPLES_FIELD_ID) ||
      idUpper === "ID" ||
      idUpper === "COMPANY_ID" ||
      idUpper === "TITLE" ||
      idUpper === "CODE" ||
      idUpper.includes("TITLE") ||
      idUpper.includes("НАЗВАНИЕ") ||
      idUpper.includes("КОММЕНТ") ||
      idUpper.includes("COMMENT")
    ) {
      return false;
    }
    if (
      idUpper.includes("ДАТА") ||
      idUpper.includes("DATE") ||
      idUpper.includes("TIME") ||
      idUpper.includes(COMPANY_SAMPLES_DATE_MULTI_FIELD_ID) ||
      idUpper.includes(COMPANY_SAMPLES_DATE_SINGLE_FIELD_ID) ||
      idUpper.includes(DEAL_SAMPLE_SENT_DATE_FIELD_ID) ||
      idUpper.includes("UF_CRM_1584460062014") ||
      idUpper.includes("UF_CRM_1584459666824")
    ) {
      return true;
    }
    return false;
  }

  // Fallback: When no metadata or field identity was provided, do NOT aggressively coerce text into dates!
  return false;
}

/**
 * Parses raw cell value preserving native Excel dates, numbers, and nulls.
 * Uses strict calendar validation and metadata-aware type constraints.
 *
 * Precedence invariant: EXPLICIT TYPE WINS.
 * If authoritative field metadata declares a non-numeric type (string, text,
 * enumeration, …), content-based money heuristics must NOT override it —
 * "50000 RUB" in a string field stays text. Content inference is used only
 * when metadata is genuinely absent, and unknown metadata prefers text.
 */
export function parseCellNativeValue(
  val: unknown,
  options?: CellParseOptions
): string | number | Date | null {
  if (val === null || val === undefined || val === "" || val === "—" || val === "–" || val === "-") {
    return null;
  }
  if (val instanceof Date) {
    return isNaN(val.getTime()) ? null : val;
  }
  if (typeof val === "number") {
    return isNaN(val) ? null : val;
  }

  const fType = options?.fieldType?.toLowerCase();
  const isBooleanField = fType === "boolean" || fType === "char";

  if (typeof val === "boolean") {
    if (!isBooleanField && fType) {
      return null;
    }
    return val ? "Да" : "Нет";
  }

  const str = String(val).trim();
  if (!str || str === "—" || str === "–" || str === "-") return null;

  if (!isBooleanField && fType) {
    const sLower = str.toLowerCase();
    if (sLower === "false" || sLower === "null" || sLower === "undefined") {
      return null;
    }
  }

  // ── 1. Explicit numeric metadata: strict parse, no content guessing ──
  if (fType === "double" || fType === "integer" || fType === "money") {
    const moneyMatch = str.match(/^([+-]?[\d\s\u00A0]+(?:[.,]\d{1,2})?)\s*(?:₽|руб\.?|RUB|\$|EUR|€)?$/i);
    if (moneyMatch) {
      const parsed = parseStrictNumber(moneyMatch[1]);
      if (parsed !== undefined) return parsed;
    }
    const parsed = parseStrictNumber(str);
    if (parsed !== undefined) return parsed;
    // Unparseable content in a numeric field: keep text (never invent 0).
    let outStrNumeric = translateCrmValueToRussian(str);
    if (/^[=\-+\@]/.test(outStrNumeric)) outStrNumeric = "'" + outStrNumeric;
    return outStrNumeric;
  }

  // ── 2. Explicit non-numeric metadata: text wins over content heuristics ──
  const EXPLICIT_NON_NUMERIC_TYPES = new Set([
    "string", "text", "enumeration", "crm_status", "boolean", "char",
    "file", "url", "user", "crm_company", "crm_contact", "crm_deal",
    "crm_lead", "address", "phone", "email",
  ]);
  if (fType && EXPLICIT_NON_NUMERIC_TYPES.has(fType)) {
    // Date-typed metadata still applies (date/datetime are not in the set);
    // a string field must never be numeric-coerced.
    const shouldTryDate = isExplicitDateField(options?.fieldId, options?.fieldType);
    if (shouldTryDate) {
      const dt = parseStrictDate(str);
      if (dt) return dt;
    }
    let outStr = translateCrmValueToRussian(str);
    if (/^[=\-+\@]/.test(outStr)) outStr = "'" + outStr;
    return outStr;
  }

  // ── 3. Date-typed metadata (explicit date/datetime) ──
  const shouldTryDate = isExplicitDateField(options?.fieldId, options?.fieldType);
  if (shouldTryDate) {
    const dt = parseStrictDate(str);
    if (dt) return dt;
  }

  // ── 4. Metadata genuinely absent: conservative content inference only ──
  // A formatted money string with a currency symbol is the one pattern where
  // numeric semantics are unambiguous ("120 000 ₽", "50000 руб").
  const moneyMatch = str.match(/^([+-]?[\d\s\u00A0]+(?:[.,]\d{1,2})?)\s*(?:₽|руб\.?|RUB|\$|EUR|€)$/i);
  if (moneyMatch) {
    const parsed = parseStrictNumber(moneyMatch[1]);
    if (parsed !== undefined) return parsed;
  }

  let outStr = translateCrmValueToRussian(str);
  // Formula Injection Prevention (CSV/Excel injection)
  if (/^[=\-+\@]/.test(outStr)) {
    outStr = "'" + outStr;
  }
  return outStr;
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
  if (prefix.toLowerCase().includes("sample") || prefix.toLowerCase().includes("образц")) {
    return `РусСилика_Образцы_${dateStr}.xlsx`;
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

/** Lite Smart Process item view for the Company workbook cycle table. */
export interface CompanyExportSmartProcessItem {
  processItemId: string;
  title: string;
  stageLabel: string;
  linkedDealId?: string;
  sentDates: string[];
  grades: Array<{ productFamily?: string; value: string }>;
  quantities: Array<{ productFamily?: string; value: number | string; unit?: string }>;
  rawTestResult?: string;
  normalizedResult: string;
  responsibleId?: string;
  dataIssues: string[];
}

export interface CompanyExportSmartProcess {
  /** Active physical Smart Process cycles for this company. */
  activeCount: number;
  /** Terminal (completed) physical Smart Process cycles for this company. */
  completedCount: number;
  /** Canonical Lite item views — one physical cycle = one Excel row. */
  items: CompanyExportSmartProcessItem[];
  /** True when a background refresh failed and a prior snapshot is shown. */
  stale?: boolean;
}

export interface ExportCompanyOptions {
  companyTitle: string;
  companyId?: string;
  companyFields?: CompanyExportField[];
  fields?: CompanyExportField[];
  /**
   * @deprecated Legacy sample-field block removed: Company Excel parity now
   * comes exclusively from the resolved Company Preview model.
   */
  sampleFields?: CompanyExportField[];
  deals?: CompanyExportDeal[];
  currentDate?: Date;
  fileName?: string;
  responsibleName?: string;
  workbook?: ExcelJS.Workbook;
  logoImageId?: number | null;
  /**
   * The resolved Company Preview model (buildCompanyPreviewModel).
   * The current-card section renders the EXACT same resolved fields as the
   * UI — no independent raw-field enumeration.
   */
  companyModel?: {
    fields: Array<{ id: string; label: string; value: string; type?: string }>;
    createdAt?: string | null;
    modifiedAt?: string | null;
    comments?: string | null;
  };
  /**
   * Section 2 row: the Bitrix Company-card marker «Тестирование образцов»
   * (MARKER_ONLY — distinct from the analytical Smart Process section).
   */
  testingMarkerField?: { label: string; value: string; rawValue?: unknown } | null;
  /**
   * Section 3: canonical Smart Process testing cycles (from the company-
   * scoped Samples response — never a second fetch, never re-parsed raw
   * Bitrix fields).
   */
  smartProcess?: CompanyExportSmartProcess;
  /** Deal ID → readable title map for Smart Process relation resolution. */
  dealTitleById?: Map<string, string>;
  /** User directory for the human-name responsible resolver. */
  userNames?: Record<string, string>;
  usersCoverage?: import("./enrichment-coverage").DatasetCoverage | null;
}

/**
 * ONE report column-width contract for the Company workbook.
 *
 * The workbook contains a 12-column physical Smart Process table, so the
 * whole report is laid out on a 12-column span: account header, section
 * headers, stale/disclosure rows and summary rows span the report width;
 * ordinary label/value rows merge across it and wrap. Every column 1–12 has
 * an intentional width — nothing is left on unconfigured defaults. Print
 * setup is landscape with fitToWidth=1.
 */
export const COMPANY_REPORT_SPAN = 12;

/** Intentional widths for columns 1–12 of the Company report. */
export const COMPANY_REPORT_COLUMN_WIDTHS: readonly number[] = [
  30, // 1  Labels / ID процесса
  26, // 2  Values / Название
  22, // 3  Стадия
  26, // 4  Связанная сделка
  14, // 5  Дата отправки
  16, // 6  Марка ГЕЛЬ
  14, // 7  Количество ГЕЛЬ, кг
  16, // 8  Марка ЗОЛЬ
  14, // 9  Количество ЗОЛЬ, л
  20, // 10 Результат испытаний
  22, // 11 Ответственный
  28, // 12 Качество данных / предупреждение
];

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

  // ── EXPLICIT TYPE WINS ──
  // If CRM metadata declares a non-date type (e.g. type = string), label
  // heuristics ("Дата договора текстом") must NEVER coerce the value into a
  // date. Label heuristics apply only when metadata is genuinely absent.
  const EXPLICIT_NON_DATE_TYPES = new Set([
    "string", "text", "enumeration", "crm_status", "boolean", "char",
    "integer", "double", "money", "file", "url", "user", "crm_company",
    "crm_contact", "crm_deal", "crm_lead",
  ]);
  const explicitTypeSaysNotDate = typeLower !== "" && EXPLICIT_NON_DATE_TYPES.has(typeLower);

  const isExplicitDateField =
    !explicitTypeSaysNotDate &&
    !idUpper.includes(COMPANY_SAMPLES_FIELD_ID) &&
    !idUpper.includes("UF_CRM_1753187313314") &&
    (
      // 1. Explicit field.type from metadata
      typeLower === "date" ||
      typeLower === "datetime" ||
      // 2. Authoritative standard Bitrix date field IDs
      idUpper === "DATE_CREATE" ||
      idUpper === "DATE_MODIFY" ||
      idUpper === "BEGINDATE" ||
      idUpper === "CLOSEDATE" ||
      idUpper === "COMPANY_DATE_CREATE" ||
      idUpper === "COMPANY_DATE_MODIFY" ||
      idUpper === "DEAL_DATE_CREATE" ||
      idUpper === "DEAL_DATE_MODIFY" ||
      idUpper === "LAST_ACTIVITY_TIME" ||
      idUpper === "COMPANY_LAST_ACTIVITY_TIME" ||
      // 3. Authoritative imported custom CRM date constants
      idUpper.includes(COMPANY_SAMPLES_DATE_MULTI_FIELD_ID) ||
      idUpper.includes(COMPANY_SAMPLES_DATE_SINGLE_FIELD_ID) ||
      idUpper.includes(DEAL_SAMPLE_SENT_DATE_FIELD_ID) ||
      idUpper.includes("UF_CRM_1740925760") ||
      idUpper.includes("UF_CRM_1741517789") ||
      idUpper.includes("UF_CRM_1584460062014") ||
      idUpper.includes("UF_CRM_1584459666824") ||
      // 4. Constrained Russian/English date label fallback (only when no
      //    explicit type metadata contradicts it)
      labelLower.startsWith("дата") ||
      labelLower.includes(" дата") ||
      labelLower.startsWith("date") ||
      labelLower.includes(" date")
    );

  const raw = field.value;
  if (raw === null || raw === undefined || raw === "" || raw === "—" || raw === "–" || raw === "-") {
    return { value: null, isDateField: isExplicitDateField };
  }

  const isBoolField = typeLower === "boolean" || typeLower === "char";
  if (!isBoolField && typeLower) {
    if (
      (raw as unknown) === false ||
      (typeof raw === "string" && ["false", "null", "undefined"].includes(raw.trim().toLowerCase()))
    ) {
      return { value: null, isDateField: isExplicitDateField };
    }
  }

  const str = String(raw).trim();
  if (!str || str === "—" || str === "–" || str === "-") {
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
      const y = Number(year);
      const mo = Number(month);
      const d = Number(day);
      if (isValidCalendarDate(y, mo, d)) {
        const hasTime = h !== undefined && m !== undefined;
        const hours = hasTime ? Number(h) : 12;
        const minutes = hasTime ? Number(m) : 0;
        const seconds = s ? Number(s) : 0;
        if (hours <= 23 && minutes <= 59 && seconds <= 59) {
          const dateObj = new Date(Date.UTC(y, mo - 1, d, hours, minutes, seconds));
          if (!isNaN(dateObj.getTime())) {
            return {
              value: dateObj,
              numFmt: hasTime ? NUMFMT.DATETIME : NUMFMT.DATE,
              isDateField: true,
            };
          }
        }
      }
    }

    // 2. YYYY-MM-DD (date only)
    const ymdMatch = str.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (ymdMatch) {
      const [_, year, month, day] = ymdMatch;
      const y = Number(year);
      const mo = Number(month);
      const d = Number(day);
      if (isValidCalendarDate(y, mo, d)) {
        const dateObj = new Date(Date.UTC(y, mo - 1, d, 12, 0, 0));
        if (!isNaN(dateObj.getTime())) {
          return { value: dateObj, numFmt: NUMFMT.DATE, isDateField: true };
        }
      }
    }

    // 3. ISO datetime: YYYY-MM-DDTHH:mm:ss
    const isoMatch = str.match(/^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2}))?/);
    if (isoMatch) {
      const parsedDt = parseStrictDate(str);
      if (parsedDt) {
        const hasTime = parsedDt.getUTCHours() !== 0 || parsedDt.getUTCMinutes() !== 0;
        return {
          value: parsedDt,
          numFmt: hasTime ? NUMFMT.DATETIME : NUMFMT.DATE,
          isDateField: true,
        };
      }
    }

    let outStr = translateCrmValueToRussian(str);
    if (/^[=\-+\@]/.test(outStr)) {
      outStr = "'" + outStr;
    }
    return { value: outStr, isDateField: true };
  }

  let outStr = translateCrmValueToRussian(str);
  if (/^[=\-+\@]/.test(outStr)) {
    outStr = "'" + outStr;
  }
  return { value: outStr, isDateField: false };
}

/**
 * Section «ТЕСТИРОВАНИЕ ОБРАЗЦОВ» of the Company workbook: canonical Smart
 * Process analytics from the company-scoped Samples data.
 *
 * Invariants:
 * - one physical Smart Process item = one Excel row (never collapsed);
 * - canonical Lite item views only — no raw Bitrix field parsing here;
 * - readable values only: safe stage label, human responsible name,
 *   readable issue labels; raw IDs never leak;
 * - a failed refresh with a preserved snapshot stamps a stale disclosure.
 */
function addCompanySmartProcessSection(
  worksheet: ExcelJS.Worksheet,
  options: ExportCompanyOptions
): void {
  addSectionHeader(worksheet, "Тестирование образцов", COMPANY_REPORT_SPAN);

  const sp = options.smartProcess;
  const sanitize = (s: string) => (/^[=\-+\@]/.test(s) ? "'" + s : s);

  // Stale disclosure (failed refresh with preserved snapshot) — agrees with
  // the UI stale warning; an export must never masquerade stale as fresh.
  if (sp?.stale) {
    const staleRow = worksheet.addRow([STALE_SNAPSHOT_DISCLOSURE]);
    staleRow.height = 20;
    worksheet.mergeCells(staleRow.number, 1, staleRow.number, COMPANY_REPORT_SPAN);
    const cell = staleRow.getCell(1);
    cell.font = { name: RS_FONT_FAMILY, size: 10, italic: true, color: { argb: `FF${RS_TEXT_SECONDARY}` } };
    cell.alignment = { vertical: "middle", indent: 1 };
    applyRowBorders(staleRow, 1, COMPANY_REPORT_SPAN);
  }

  if (!sp) {
    const emptyRow = worksheet.addRow(["Данные тестирования образцов недоступны"]);
    emptyRow.height = 20;
    worksheet.mergeCells(emptyRow.number, 1, emptyRow.number, COMPANY_REPORT_SPAN);
    const cell = emptyRow.getCell(1);
    cell.font = { name: RS_FONT_FAMILY, size: 10, italic: true, color: { argb: `FF${RS_TEXT_SECONDARY}` } };
    cell.fill = FILL_SECTION_HEADER_SOFT;
    cell.alignment = { vertical: "middle", indent: 1 };
    applyRowBorders(emptyRow, 1, COMPANY_REPORT_SPAN);
    return;
  }

  // Summary rows
  const summaryRows: Array<[string, number]> = [
    ["Активных процессов", sp.activeCount],
    ["Завершённых процессов", sp.completedCount],
  ];
  for (const [label, value] of summaryRows) {
    const row = worksheet.addRow([label, value]);
    row.height = 20;
    worksheet.mergeCells(row.number, 2, row.number, COMPANY_REPORT_SPAN);
    const labelCell = row.getCell(1);
    labelCell.font = FONT_METADATA_LABEL;
    labelCell.fill = FILL_SECTION_HEADER_SOFT;
    labelCell.alignment = { vertical: "middle", indent: 1 };
    const valueCell = row.getCell(2);
    valueCell.font = FONT_DATA;
    valueCell.alignment = { vertical: "middle", horizontal: "left", indent: 1 };
    applyRowBorders(row, 1, COMPANY_REPORT_SPAN);
  }

  worksheet.addRow([]);

  // Physical-cycle table — EXACTLY the requested 12 columns.
  const cycleHeaders = [
    "ID процесса",
    "Название",
    "Стадия",
    "Связанная сделка",
    "Дата отправки",
    "Марка ГЕЛЬ",
    "Количество ГЕЛЬ, кг",
    "Марка ЗОЛЬ",
    "Количество ЗОЛЬ, л",
    "Результат испытаний",
    "Ответственный",
    "Качество данных / предупреждение",
  ];
  const headerRow = worksheet.addRow(cycleHeaders);
  styleTableHeader(headerRow, { colCount: cycleHeaders.length });

  if (sp.items.length === 0) {
    const emptyRow = worksheet.addRow(["Циклы тестирования не найдены"]);
    emptyRow.height = 20;
    worksheet.mergeCells(emptyRow.number, 1, emptyRow.number, cycleHeaders.length);
    const cell = emptyRow.getCell(1);
    cell.font = { name: RS_FONT_FAMILY, size: 10, italic: true, color: { argb: `FF${RS_TEXT_SECONDARY}` } };
    cell.alignment = { vertical: "middle", indent: 1 };
    applyRowBorders(emptyRow, 1, cycleHeaders.length);
    return;
  }

  for (const item of sp.items) {
    // Readable relation: title (when known) + ID retained for ambiguity-free
    // reference; no linked deal → explicit truthful label.
    const dealTitle = item.linkedDealId
      ? options.dealTitleById?.get(item.linkedDealId)
      : undefined;
    const relation = item.linkedDealId
      ? dealTitle
        ? `${dealTitle} (ID ${item.linkedDealId})`
        : `Сделка ID ${item.linkedDealId}`
      : "Без связанной сделки";

    // Human-readable responsible (never a raw user ID as the label).
    const responsible = item.responsibleId
      ? resolveResponsibleDisplay(item.responsibleId, options.userNames ?? {}, options.usersCoverage)
      : "—";

    // Result: factual free text first; classification label as fallback.
    const rawResult = item.rawTestResult?.trim() ?? "";
    const result = sanitize(
      rawResult || NORMALIZED_RESULT_LABELS[item.normalizedResult] || "Не определён"
    );

    // Readable deterministic quality issues (no raw issue codes).
    const quality =
      item.dataIssues.length > 0
        ? item.dataIssues
            .map(
              (issue) =>
                SAMPLE_DATA_ISSUE_LABELS[issue as keyof typeof SAMPLE_DATA_ISSUE_LABELS] ??
                UNCLASSIFIED_LABEL
            )
            .join("; ")
        : "—";

    const sentDate = item.sentDates.length > 0 ? item.sentDates.join(", ") : "—";
    // Safe display stage label only — raw DT1032_* IDs never leak here.
    const stageLabel = sanitize(item.stageLabel || UNCLASSIFIED_LABEL);

    // Grade cells show the grade value; quantity columns (7/9) are filled
    // separately below so numeric quantities stay numeric in Excel.
    const gelGrade = item.grades.find((g) => g.productFamily === "Гель")?.value ?? "—";
    const solGrade = item.grades.find((g) => g.productFamily === "Золь")?.value ?? "—";

    const row = worksheet.addRow([
      sanitize(item.processItemId),
      sanitize(item.title || "Тестирование образца"),
      stageLabel,
      sanitize(relation),
      sentDate,
      sanitize(gelGrade),
      "—", // Количество ГЕЛЬ, кг — filled below (numeric when parseable)
      sanitize(solGrade),
      "—", // Количество ЗОЛЬ, л — filled below (numeric when parseable)
      result,
      sanitize(responsible),
      sanitize(quality),
    ]);
    const gelQty = item.quantities.find((q) => q.productFamily === "Гель");
    const solQty = item.quantities.find((q) => q.productFamily === "Золь");
    row.getCell(7).value =
      gelQty !== undefined
        ? typeof gelQty.value === "number"
          ? gelQty.value
          : sanitize(String(gelQty.value))
        : "—";
    row.getCell(9).value =
      solQty !== undefined
        ? typeof solQty.value === "number"
          ? solQty.value
          : sanitize(String(solQty.value))
        : "—";
    row.height = 20;
    for (let c = 1; c <= cycleHeaders.length; c++) {
      const cell = row.getCell(c);
      cell.border = THIN_BORDER;
      cell.font = FONT_DATA;
      cell.alignment =
        c === 1
          ? { vertical: "middle", horizontal: "center" }
          : { vertical: "middle", horizontal: "left", wrapText: true };
    }
  }
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
    colCount: COMPANY_REPORT_SPAN,
  });

  // Section 1: ИНФОРМАЦИЯ О КОМПАНИИ
  // Company Preview UI = Company Excel: when the resolved model is provided,
  // render the EXACT same resolved fields in the canonical order — including
  // empty fields as truthful «—» rows. Legacy/unknown UF fields can never
  // leak into the current-card section.
  addSectionHeader(worksheet, "Информация о компании", COMPANY_REPORT_SPAN);

  const model = options.companyModel;

  let fields: Array<{ id: string; label: string; value: string; type?: string }> = [...rawCompanyFields];
  if (model) {
    // ONE canonical partition (the exact helper the UI drawer uses) splits
    // the model into its sections: Section 1 renders ONLY business card
    // fields, the marker rides its own Section 2 and system dates their own
    // Section 6 — never duplicated, never a hard-coded UF token here.
    fields = partitionCompanyPreviewFields(model).business;
  }
  // Company ID intentionally lives ONLY in the workbook account header
  // («CRM ID: <id>»): no technical ID row inside the business section.

  for (const field of fields) {
    const cleanLabel = formatHeaderToRussian(field.label, { preserveProvenance: false });
    const parsed = normalizeCompanyReportFieldValue(field);
    const cellValue = parsed.isDateField
      ? (parsed.value instanceof Date ? parsed.value : null)
      : (parsed.value ?? "—");
    const row = worksheet.addRow([cleanLabel, cellValue]);
    row.height = 20;
    worksheet.mergeCells(row.number, 2, row.number, COMPANY_REPORT_SPAN);

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

    applyRowBorders(row, 1, COMPANY_REPORT_SPAN);
  }

  worksheet.addRow([]);

  // Section 2: ИНФОРМАЦИЯ ОБ ОБРАЗЦАХ — the Bitrix Company-card marker
  // «Тестирование образцов» (MARKER_ONLY; distinct from the analytical
  // Smart Process section below).
  addSectionHeader(worksheet, "Информация об образцах", COMPANY_REPORT_SPAN);

  const marker = options.testingMarkerField;
  {
    const markerValue = marker?.value ?? "—";
    const markerRow = worksheet.addRow([
      marker ? formatHeaderToRussian(marker.label, { preserveProvenance: false }) : "Тестирование образцов",
      typeof markerValue === "string" && /^[=\-+\@]/.test(markerValue) ? "'" + markerValue : markerValue,
    ]);
    markerRow.height = 20;
    worksheet.mergeCells(markerRow.number, 2, markerRow.number, COMPANY_REPORT_SPAN);
    const labelCell = markerRow.getCell(1);
    labelCell.font = FONT_METADATA_LABEL;
    labelCell.fill = FILL_SECTION_HEADER_SOFT;
    labelCell.alignment = { vertical: "middle", indent: 1 };
    const valueCell = markerRow.getCell(2);
    valueCell.font = FONT_DATA;
    valueCell.alignment = { vertical: "middle", indent: 1 };
    applyRowBorders(markerRow, 1, COMPANY_REPORT_SPAN);
  }

  worksheet.addRow([]);

  // Section 3: ТЕСТИРОВАНИЕ ОБРАЗЦОВ — canonical Smart Process analytics.
  // One physical cycle = one Excel row (never collapsed); canonical Lite
  // item views only — no raw Bitrix field parsing in export code.
  addCompanySmartProcessSection(worksheet, options);

  worksheet.addRow([]);

  // Section 4: Связанные сделки — a 5-column content table inside the
  // wider 12-column report span (section header spans the report width).
  const deals = options.deals || [];
  addSectionHeader(worksheet, `Связанные сделки (${deals.length})`, COMPANY_REPORT_SPAN);

  if (deals.length > 0) {
    const dealColHeaders = worksheet.addRow(["ID сделки", "Название сделки", "Стадия", "Сумма", "Валюта"]);
    styleTableHeader(dealColHeaders, { colCount: 5 });

    for (const deal of deals) {
      const stageRussian = formatStageToRussian(deal.stage);
      const currencyRussian = formatCurrencyToRussian(deal.currency);
      const sanitize = (s: string) => /^[=\-+\@]/.test(s) ? "'" + s : s;
      const dealRow = worksheet.addRow([
        sanitize(String(deal.id || "")),
        sanitize(deal.title || ""),
        sanitize(stageRussian || ""),
        deal.opportunity !== null && deal.opportunity !== undefined ? deal.opportunity : "—",
        sanitize(currencyRussian || ""),
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
    worksheet.mergeCells(emptyRow.number, 1, emptyRow.number, COMPANY_REPORT_SPAN);
    const emptyCell = emptyRow.getCell(1);
    emptyCell.font = { name: RS_FONT_FAMILY, size: 10, italic: true, color: { argb: `FF${RS_TEXT_SECONDARY}` } };
    emptyCell.fill = FILL_SECTION_HEADER_SOFT;
    emptyCell.alignment = { vertical: "middle", indent: 1 };
    applyRowBorders(emptyRow, 1, COMPANY_REPORT_SPAN);
  }

  worksheet.addRow([]);

  // Section 6: СИСТЕМНАЯ ИНФОРМАЦИЯ (Дата создания / Дата изменения —
  // the same canonical model rows the UI renders in its Section 5). When no
  // resolved model is provided, the section is omitted entirely: the
  // placeholder path must never shadow label/value pairs of other sections.
  if (model) {
    addSectionHeader(worksheet, "Системная информация", COMPANY_REPORT_SPAN);
    const systemPairs: Array<[string, string | number | Date | null]> = [];
    for (const f of partitionCompanyPreviewFields(model).system) {
      const parsed = normalizeCompanyReportFieldValue(f);
      systemPairs.push([
        f.label,
        parsed.isDateField && parsed.value instanceof Date ? parsed.value : (parsed.value ?? "—"),
      ]);
    }
    for (const [label, value] of systemPairs) {
      const row = worksheet.addRow([label, value]);
      row.height = 20;
      worksheet.mergeCells(row.number, 2, row.number, COMPANY_REPORT_SPAN);
      const labelCell = row.getCell(1);
      labelCell.font = FONT_METADATA_LABEL;
      labelCell.fill = FILL_SECTION_HEADER_SOFT;
      labelCell.alignment = { vertical: "middle", indent: 1 };
      const valueCell = row.getCell(2);
      valueCell.font = FONT_DATA;
      if (value instanceof Date) {
        valueCell.alignment = { vertical: "middle", horizontal: "left", indent: 1 };
        valueCell.numFmt = NUMFMT.DATETIME;
      } else {
        valueCell.alignment = { vertical: "middle", indent: 1 };
      }
      applyRowBorders(row, 1, COMPANY_REPORT_SPAN);
    }
  }

  // Column widths — the ONE report column-width contract: every column 1–12
  // has an intentional width (nothing left on unconfigured defaults).
  for (let c = 1; c <= COMPANY_REPORT_SPAN; c++) {
    worksheet.getColumn(c).width = COMPANY_REPORT_COLUMN_WIDTHS[c - 1];
  }

  // Print Setup & Corporate Footer — landscape: the 12-column physical
  // Smart Process table requires the wider page; fitToWidth=1 keeps the
  // report structurally readable on one page width.
  configureWorksheetPrint(worksheet, {
    orientation: "landscape",
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

export interface ExportDealOptions {
  deal: Record<string, unknown>;
  fields?: Array<{ id: string; title?: string; type?: string; listValues?: Array<{ ID: string; VALUE: string }> }>;
  dealTypeRegistry?: DealTypeRegistry | null;
  userNames?: Record<string, string>;
  usersCoverage?: DatasetCoverage | null;
  activity?: { SUBJECT?: string; CREATED?: string; DEADLINE?: string } | null;
  lastTouchTimestamp?: string | null;
  currentDate?: Date;
  fileName?: string;
  logoImageId?: number | null;
  workbook?: ExcelJS.Workbook;
  dealModel?: DealPreviewModel;
  /** Full activity list for the deal — drives the «Дела и активности» section. */
  dealActivities?: Array<DealActivityEntryInput>;
}

/**
 * Creates an ExcelJS Workbook representing a full branded Single Deal Report,
 * mirroring the Deal Preview drawer sections and exact field contract.
 */
export function createDealExcelWorkbook(options: ExportDealOptions): ExcelJS.Workbook {
  const model =
    options.dealModel ||
    buildDealPreviewModel(options.deal, {
      fields: options.fields,
      dealTypeRegistry: options.dealTypeRegistry,
      userNames: options.userNames,
      usersCoverage: options.usersCoverage,
      activity: options.activity,
      lastTouchTimestamp: options.lastTouchTimestamp,
    });

  const workbook = options.workbook || new ExcelJS.Workbook();
  workbook.creator = RS_SYSTEM_TITLE;
  workbook.lastModifiedBy = RS_SYSTEM_TITLE;
  const now = options.currentDate || new Date();
  workbook.created = now;
  workbook.modified = now;

  const worksheet = workbook.addWorksheet("Отчёт по сделке", {
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

  // Find responsible name for header
  const respField = model.mainFields.find((f) => f.id === "ASSIGNED_BY_ID");
  const responsibleName = respField?.value !== "–" ? respField?.value : undefined;

  // Header via addAccountHeader
  addAccountHeader(worksheet, imageId, {
    companyTitle: model.dealTitle,
    companyId: model.dealId || "—",
    responsibleName,
    generatedAt: now,
    colCount: 5,
  });

  // Overwrite Row 1 title to "ОТЧЁТ ПО СДЕЛКЕ"
  const row1 = worksheet.getRow(1);
  const titleCell = row1.getCell(2);
  titleCell.value = "ОТЧЁТ ПО СДЕЛКЕ";

  // Format Row 3 metadata specifically for Deal context
  const row3 = worksheet.getRow(3);
  const metaCell = row3.getCell(2);
  const idStr = model.dealId ? `ID сделки: ${model.dealId}   |   ` : "";
  const respStr = responsibleName ? `Ответственный: ${responsibleName}   |   ` : "";
  const reportDateTimeStr = formatReportDateTime(now);
  metaCell.value = `${idStr}${respStr}Дата формирования: ${reportDateTimeStr} (Москва, UTC+3)`;

  // Helper to render field rows into a section
  const renderFieldRows = (fields: DealPreviewResolvedField[]) => {
    for (const field of fields) {
      const cleanLabel = formatHeaderToRussian(field.label, { preserveProvenance: false });
      let cellValue: unknown = field.excelValue ?? field.value ?? "–";
      if (cellValue === null || cellValue === undefined || cellValue === "") {
        cellValue = "–";
      }

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
        valueCell.numFmt = field.excelNumFmt || NUMFMT.DATE;
      } else if (typeof cellValue === "number") {
        valueCell.font = FONT_DATA;
        valueCell.alignment = { vertical: "middle", horizontal: "left", indent: 1 };
        if (field.excelNumFmt) {
          valueCell.numFmt = field.excelNumFmt;
        }
      } else {
        const valStr = String(cellValue).trim();
        const semantic = mapBusinessStatusToSemantic(valStr);
        if (
          field.id === "STAGE_ID" &&
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
  };

  // Section 1: ОСНОВНАЯ ИНФОРМАЦИЯ
  addSectionHeader(worksheet, "Основная информация", 5);
  renderFieldRows(model.mainFields);
  worksheet.addRow([]);

  // Section 2: ХРОНОЛОГИЯ
  addSectionHeader(worksheet, "Хронология", 5);
  // Последняя активность: row omitted entirely when no meaningful SUBJECT.
  renderFieldRows(
    model.activityField ? [...model.timelineFields, model.activityField] : model.timelineFields
  );
  worksheet.addRow([]);

  // Section 3: ДАННЫЕ СДЕЛКИ
  addSectionHeader(worksheet, "Данные сделки", 5);
  renderFieldRows(model.cardFields);

  // Section 3b: ДЕЛА И АКТИВНОСТИ (shared model with Deal Preview UI)
  const dealActivities = options.dealActivities ?? [];
  if (dealActivities.length > 0) {
    const activityDisplays = buildDealActivitiesModel(dealActivities, {
      userNames: options.userNames,
      usersCoverage: options.usersCoverage,
    });
    if (activityDisplays.length > 0) {
      addSectionHeader(worksheet, "Дела и активности", 5);
      for (const a of activityDisplays) {
        const when = a.date ?? "–";
        const subject = a.subject || "Без темы";
        const desc = a.description ? ` — ${a.description}` : "";
        const responsible = a.responsible ? ` (Ответственный: ${a.responsible})` : "";
        const row = worksheet.addRow([`${a.status} · ${a.type}`, `${subject} · ${when}${desc}${responsible}`]);
        row.height = 20;
        worksheet.mergeCells(row.number, 2, row.number, 5);
        const labelCell = row.getCell(1);
        labelCell.font = FONT_METADATA_LABEL;
        labelCell.fill = FILL_SECTION_HEADER_SOFT;
        labelCell.alignment = { vertical: "middle", indent: 1 };
        const valueCell = row.getCell(2);
        valueCell.font = FONT_DATA;
        valueCell.alignment = { vertical: "middle", wrapText: true, indent: 1 };
        applyRowBorders(row, 1, 5);
      }
      worksheet.addRow([]);
    }
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
 * Downloads an Excel (.xlsx) file with full branded deal report.
 */
export async function exportDealToExcel(options: ExportDealOptions): Promise<void> {
  const workbook = new ExcelJS.Workbook();
  const logoImageId = await registerBrandLogo(workbook);
  createDealExcelWorkbook({ ...options, workbook, logoImageId });

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

  const now = options.currentDate || new Date();
  const dateStr = formatReportDateForFilename(now);
  const rawDealId = String(options.deal?.ID || options.deal?.id || options.dealModel?.dealId || "").trim();
  const safeDealId = rawDealId ? rawDealId.replace(/[^a-zA-Z0-9_-]/g, "") : "";
  a.download = options.fileName || `РусСилика_Сделка_${safeDealId || "Без_ID"}_${dateStr}.xlsx`;

  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  window.URL.revokeObjectURL(url);
}

export interface ExportSamplesOptions {
  summaries: SampleSummary[];
  userNames?: Record<string, string>;
  usersCoverage?: DatasetCoverage | null;
  period?: string;
  filters?: Pick<SamplesFilters, "period" | "customFrom" | "customTo">;
  filtersText?: string;
  coverage?: DatasetCoverage | null;
  extraWarnings?: string[];
}

/**
 * Builds an ExcelJS Workbook for Samples registry export.
 * Sheet: "Образцы", Title: "Реестр образцов", sequential 1..N row index.
 */
export async function buildSamplesWorkbook(
  options: ExportSamplesOptions
): Promise<ExcelJS.Workbook> {
  const {
    summaries,
    userNames = {},
    usersCoverage,
    filtersText = "Все",
    coverage,
    extraWarnings,
  } = options;

  let period: string;
  if (options.period) {
    period = options.period;
  } else if (options.filters) {
    const derived = formatSamplesPeriodLabel(options.filters);
    if (!derived && options.filters.period === "custom") {
      throw new Error(
        "Экспорт отключён: указан неполный или некорректный пользовательский период."
      );
    }
    period = derived || formatSamplesPeriodLabel({ period: "30days" })!;
  } else {
    period = formatSamplesPeriodLabel({ period: "30days" })!;
  }

  const columns = [
    "№",
    "Компания",
    "Ответственный",
    "Отрасль / применение",
    "Продукт",
    "Марка",
    "Количество",
    "Дата передачи",
    "Статус",
    "Текущий этап тестирования",
    "Активных процессов",
    "Результат",
    "Сделки",
  ];

  const RESULT_LABELS: Record<NormalizedResult, string> = {
    positive: "Успешно",
    negative: "Не подошли",
    rework: "На доработке",
    pending: "На испытаниях",
    mixed: "Смешанный",
    unknown: "Неизвестно",
  };

  const formatIsoDateToRu = (iso: string): string => {
    const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
    if (match) return `${match[3]}.${match[2]}.${match[1]}`;
    return iso;
  };

  const data: (string | number | null)[][] = summaries.map((s, idx) => {
    const rowNum = idx + 1;
    const company = s.companyTitle || (s.companyId ? `Компания #${s.companyId}` : "");
    const responsible = s.responsibleId
      ? resolveResponsibleDisplay(s.responsibleId, userNames, usersCoverage)
      : s.responsibleName || null;
    const industryApp = [s.industry, s.application].filter(Boolean).join(" / ") || null;
    const products = s.productFamilies.length > 0 ? s.productFamilies.join(", ") : null;
    const grades = s.grades.map((g) => g.value).filter(Boolean).join(", ") || null;
    const quantities =
      s.quantities.length > 0
        ? s.quantities
            .map((q) => {
              const val = typeof q.value === "number" ? q.value.toLocaleString("ru-RU") : q.value;
              return q.unit ? `${val} ${q.unit}` : String(val);
            })
            .join(", ")
        : null;
    const sentDates =
      s.sentDates.length > 0
        ? s.sentDates.map(formatIsoDateToRu).join(", ")
        : null;
    const statusesList = [...s.sampleIndicators, ...s.processStatuses].map((st) => {
      if (/^\d+$/.test(st) || /^DT1032_/i.test(st)) {
        return UNCLASSIFIED_LABEL;
      }
      return st;
    });
    const statuses = statusesList.length > 0 ? statusesList.join(", ") : null;

    // Smart Process presentation facts (canonical SampleSummary — no second
    // fetch, no re-parse):
    // - 0 active → empty stage cell (workbook convention), count 0;
    // - 1 active → its stage label;
    // - >1 active → ALL unique active stage labels (never one winner).
    // Sanitize FIRST, then deduplicate: two different unsafe/raw
    // representations that both sanitize to «Не классифицировано» must
    // produce one occurrence, not a duplicated label list.
    const activeStageLabels = [
      ...new Set(
        (s.currentActiveStageLabels ?? [])
          .map((st) => (/^\d+$/.test(st) || /^DT1032_/i.test(st) ? UNCLASSIFIED_LABEL : st))
          .filter(Boolean)
      ),
    ];
    const currentStage =
      activeStageLabels.length === 1
        ? activeStageLabels[0]
        : activeStageLabels.length > 1
        ? activeStageLabels.join(", ")
        : null;
    const activeSpCount = s.activeSmartProcessCount ?? 0;

    const result = RESULT_LABELS[s.normalizedResult] || "Неизвестно";
    const deals =
      s.relatedDeals.length > 0
        ? s.relatedDeals.map((d) => d.title).filter(Boolean).join(", ")
        : null;

    return [
      rowNum,
      company,
      responsible,
      industryApp,
      products,
      grades,
      quantities,
      sentDates,
      statuses,
      currentStage,
      activeSpCount,
      result,
      deals,
    ];
  });

  return buildWysiwygWorkbook(data, columns, {
    sheetName: "Образцы",
    title: "Реестр образцов",
    fileNamePrefix: "РусСилика_Образцы",
    period,
    filtersText,
    coverage,
    extraWarnings,
  });
}

/**
 * Exports filtered Samples registry to Excel file.
 */
export async function exportSamplesToExcel(
  options: ExportSamplesOptions
): Promise<void> {
  if (options.summaries.length === 0) return;
  if (options.filters && !isSamplesPeriodValid(options.filters) && !options.period) {
    return;
  }

  const workbook = await buildSamplesWorkbook(options);
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
  a.download = resolveWysiwygFileName("РусСилика_Образцы", "РусСилика_Образцы");
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  window.URL.revokeObjectURL(url);
}
