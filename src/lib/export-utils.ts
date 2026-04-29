import ExcelJS from "exceljs";

/**
 * Export deals data to Excel (.xlsx) file.
 * WYSIWYG export: exports exactly what is displayed in the table (filtered, sorted, resolved).
 */
export async function exportToExcelWysiwyg(
  data: string[][],
  columns: string[]
): Promise<void> {
  if (data.length === 0 || columns.length === 0) return;

  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet("Сделки");

  // Add headers
  worksheet.addRow(columns);

  // Add data
  data.forEach((row) => {
    worksheet.addRow(row);
  });

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
  a.download = `russilica_deals_${dateStr}.xlsx`;
  a.click();
  window.URL.revokeObjectURL(url);
}
