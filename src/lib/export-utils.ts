import ExcelJS from "exceljs";

/**
 * Export deals (or company) data to Excel (.xlsx) file.
 * WYSIWYG export: exports exactly what is displayed in the table (filtered, sorted, resolved).
 */
export async function exportToExcelWysiwyg(
  data: string[][],
  columns: string[],
  options?: {
    sheetName?: string;
    fileNamePrefix?: string;
    // Parallel array to `data` — true marks a row for a highlighted fill,
    // mirroring an on-screen row highlight (e.g. the "Образцы" toggle).
    highlightRows?: boolean[];
    highlightColorArgb?: string;
  }
): Promise<void> {
  if (data.length === 0 || columns.length === 0) return;

  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet(options?.sheetName || "Сделки");

  // Add headers
  worksheet.addRow(columns);

  // Add data
  data.forEach((row) => {
    worksheet.addRow(row);
  });

  // Apply the same highlight shown on screen, if requested.
  if (options?.highlightRows) {
    const fillColor = options.highlightColorArgb || "FFFCE8B0"; // amber, matching the on-screen highlight
    options.highlightRows.forEach((shouldHighlight, dataIndex) => {
      if (!shouldHighlight) return;
      const row = worksheet.getRow(dataIndex + 2); // +1 for header row, +1 for 1-based indexing
      row.eachCell({ includeEmpty: true }, (cell) => {
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: fillColor } };
      });
    });
  }

  // Auto-size columns
  worksheet.columns.forEach((column, idx) => {
    const maxLen = Math.max(
      columns[idx].length,
      ...data.slice(0, 100).map((row) => String(row[idx] || "").length)
    );
    column.width = Math.min(Math.max(maxLen + 2, 10), 60);
  });

  // Generate and download
  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  const now = new Date();
  const dateStr = now.toISOString().slice(0, 10);
  a.download = `${options?.fileNamePrefix || "russilica_deals"}_${dateStr}.xlsx`;
  a.click();
  window.URL.revokeObjectURL(url);
}

export interface CompanyExportField {
  id?: string;
  label: string;
  value: string;
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
  companyId: string;
  companyFields: CompanyExportField[];
  sampleFields: CompanyExportField[];
  deals?: CompanyExportDeal[];
  currentDate?: Date;
  fileName?: string;
}

/**
 * Creates an ExcelJS Workbook representing a full report for a company card,
 * including main information, sample fields, and related deals.
 */
export function createCompanyExcelWorkbook(options: ExportCompanyOptions): ExcelJS.Workbook {
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet("Отчёт по компании");

  worksheet.views = [{ showGridLines: true }];

  const currentDate = options.currentDate || new Date();
  const dateStr = currentDate.toLocaleDateString("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });

  const thinBorder: Partial<ExcelJS.Borders> = {
    top: { style: "thin", color: { argb: "FFE2E8F0" } },
    left: { style: "thin", color: { argb: "FFE2E8F0" } },
    bottom: { style: "thin", color: { argb: "FFE2E8F0" } },
    right: { style: "thin", color: { argb: "FFE2E8F0" } },
  };

  const applyBorders = (row: ExcelJS.Row, startCol = 1, endCol = 5) => {
    for (let c = startCol; c <= endCol; c++) {
      row.getCell(c).border = thinBorder;
    }
  };

  // 1. Title Banner
  const cleanTitle = (options.companyTitle || "Без названия")
    .replace(/[\r\n\t]+/g, " ")
    .trim();
  const titleText = `Отчёт по компании: ${cleanTitle || "Без названия"} Дата: ${dateStr}`;
  const titleRow = worksheet.addRow([titleText]);
  titleRow.height = 28;
  worksheet.mergeCells(1, 1, 1, 5);

  const titleCell = titleRow.getCell(1);
  titleCell.font = { name: "Calibri", size: 13, bold: true, color: { argb: "FF1A52A3" } };
  titleCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE8EFF8" } };
  titleCell.alignment = { vertical: "middle", horizontal: "left", indent: 1 };
  applyBorders(titleRow, 1, 5);

  // Spacer
  worksheet.addRow([]);

  // 2. Section: Основная информация
  const mainHeaderRow = worksheet.addRow(["Основная информация"]);
  mainHeaderRow.height = 22;
  worksheet.mergeCells(mainHeaderRow.number, 1, mainHeaderRow.number, 5);
  const mainHeaderCell = mainHeaderRow.getCell(1);
  mainHeaderCell.font = { name: "Calibri", size: 11, bold: true, color: { argb: "FFFFFFFF" } };
  mainHeaderCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1A52A3" } };
  mainHeaderCell.alignment = { vertical: "middle", indent: 1 };
  applyBorders(mainHeaderRow, 1, 5);

  // Include Company ID if not already in fields
  const fields = [...options.companyFields];
  if (!fields.some((f) => f.id === "ID" || f.label.toLowerCase().includes("id компании"))) {
    fields.unshift({ id: "ID", label: "ID компании", value: options.companyId });
  }

  for (const field of fields) {
    const row = worksheet.addRow([field.label, field.value || "—"]);
    row.height = 20;
    worksheet.mergeCells(row.number, 2, row.number, 5);

    const labelCell = row.getCell(1);
    labelCell.font = { name: "Calibri", size: 10, bold: true, color: { argb: "FF475569" } };
    labelCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF8FAFC" } };
    labelCell.alignment = { vertical: "middle" };

    const valueCell = row.getCell(2);
    valueCell.font = { name: "Calibri", size: 10, color: { argb: "FF0F172A" } };
    valueCell.alignment = { vertical: "middle", wrapText: true };

    applyBorders(row, 1, 5);
  }

  // Spacer
  worksheet.addRow([]);

  // 3. Section: Образцы
  const sampleHeaderRow = worksheet.addRow(["Образцы"]);
  sampleHeaderRow.height = 22;
  worksheet.mergeCells(sampleHeaderRow.number, 1, sampleHeaderRow.number, 5);
  const sampleHeaderCell = sampleHeaderRow.getCell(1);
  sampleHeaderCell.font = { name: "Calibri", size: 11, bold: true, color: { argb: "FFFFFFFF" } };
  sampleHeaderCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1A52A3" } };
  sampleHeaderCell.alignment = { vertical: "middle", indent: 1 };
  applyBorders(sampleHeaderRow, 1, 5);

  const sampleFields = options.sampleFields || [];
  if (sampleFields.length > 0) {
    for (const field of sampleFields) {
      const row = worksheet.addRow([field.label, field.value || "—"]);
      row.height = 20;
      worksheet.mergeCells(row.number, 2, row.number, 5);

      const labelCell = row.getCell(1);
      labelCell.font = { name: "Calibri", size: 10, bold: true, color: { argb: "FF475569" } };
      labelCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF8FAFC" } };
      labelCell.alignment = { vertical: "middle" };

      const valueCell = row.getCell(2);
      valueCell.font = { name: "Calibri", size: 10, color: { argb: "FF0F172A" } };
      valueCell.alignment = { vertical: "middle", wrapText: true };

      applyBorders(row, 1, 5);
    }
  } else {
    const emptyRow = worksheet.addRow(["Нет данных по образцам"]);
    emptyRow.height = 20;
    worksheet.mergeCells(emptyRow.number, 1, emptyRow.number, 5);
    const emptyCell = emptyRow.getCell(1);
    emptyCell.font = { name: "Calibri", size: 10, italic: true, color: { argb: "FF64748B" } };
    emptyCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF8FAFC" } };
    emptyCell.alignment = { vertical: "middle", indent: 1 };
    applyBorders(emptyRow, 1, 5);
  }

  // Spacer
  worksheet.addRow([]);

  // 4. Section: Связанные сделки
  const deals = options.deals || [];
  const dealsHeaderRow = worksheet.addRow([`Связанные сделки (${deals.length})`]);
  dealsHeaderRow.height = 22;
  worksheet.mergeCells(dealsHeaderRow.number, 1, dealsHeaderRow.number, 5);
  const dealsHeaderCell = dealsHeaderRow.getCell(1);
  dealsHeaderCell.font = { name: "Calibri", size: 11, bold: true, color: { argb: "FFFFFFFF" } };
  dealsHeaderCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1A52A3" } };
  dealsHeaderCell.alignment = { vertical: "middle", indent: 1 };
  applyBorders(dealsHeaderRow, 1, 5);

  if (deals.length > 0) {
    const dealColHeaders = worksheet.addRow(["ID сделки", "Название сделки", "Стадия", "Сумма", "Валюта"]);
    dealColHeaders.height = 20;
    for (let c = 1; c <= 5; c++) {
      const cell = dealColHeaders.getCell(c);
      cell.font = { name: "Calibri", size: 10, bold: true, color: { argb: "FF334155" } };
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF1F5F9" } };
      cell.alignment = {
        vertical: "middle",
        horizontal: c === 4 ? "right" : c === 1 || c === 5 ? "center" : "left",
      };
      cell.border = thinBorder;
    }

    for (const deal of deals) {
      const dealRow = worksheet.addRow([
        deal.id,
        deal.title,
        deal.stage || "—",
        deal.opportunity !== null && deal.opportunity !== undefined ? deal.opportunity : "—",
        deal.currency || "RUB",
      ]);
      dealRow.height = 20;

      for (let c = 1; c <= 5; c++) {
        const cell = dealRow.getCell(c);
        cell.font = { name: "Calibri", size: 10, color: { argb: "FF0F172A" } };
        cell.alignment = {
          vertical: "middle",
          horizontal: c === 4 ? "right" : c === 1 || c === 5 ? "center" : "left",
          wrapText: c === 2,
        };
        if (c === 4 && typeof deal.opportunity === "number") {
          cell.numFmt = "#,##0.00";
        }
        cell.border = thinBorder;
      }
    }
  } else {
    const emptyRow = worksheet.addRow(["Нет связанных сделок"]);
    emptyRow.height = 20;
    worksheet.mergeCells(emptyRow.number, 1, emptyRow.number, 5);
    const emptyCell = emptyRow.getCell(1);
    emptyCell.font = { name: "Calibri", size: 10, italic: true, color: { argb: "FF64748B" } };
    emptyCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF8FAFC" } };
    emptyCell.alignment = { vertical: "middle", indent: 1 };
    applyBorders(emptyRow, 1, 5);
  }

  // Column Widths
  worksheet.getColumn(1).width = 42;
  worksheet.getColumn(2).width = 46;
  worksheet.getColumn(3).width = 24;
  worksheet.getColumn(4).width = 18;
  worksheet.getColumn(5).width = 12;

  return workbook;
}

/**
 * Downloads an Excel (.xlsx) file with full company report.
 */
export async function exportCompanyToExcel(options: ExportCompanyOptions): Promise<void> {
  const workbook = createCompanyExcelWorkbook(options);
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
  const rawTitle = (options.companyTitle || "Компания")
    .replace(/[\x00-\x1f\x7f\\/:*?"<>|]/g, "_")
    .trim();
  const safeTitle = (rawTitle.replace(/^_+|_+$/g, "").trim() || "Компания").slice(0, 50);
  const now = options.currentDate || new Date();
  const dateStr = now.toISOString().slice(0, 10);
  a.download = options.fileName || `Отчет_${safeTitle}_${dateStr}.xlsx`;

  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  window.URL.revokeObjectURL(url);
}
