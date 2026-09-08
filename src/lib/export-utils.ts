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
