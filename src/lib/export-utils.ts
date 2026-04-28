import * as XLSX from "xlsx";

/**
 * Export deals data to Excel (.xlsx) file.
 * WYSIWYG export: exports exactly what is displayed in the table (filtered, sorted, resolved).
 */
export function exportToExcelWysiwyg(
  data: string[][],
  columns: string[]
): void {
  if (data.length === 0 || columns.length === 0) return;

  // Create workbook and worksheet
  const wsData = [columns, ...data];
  const ws = XLSX.utils.aoa_to_sheet(wsData);

  // Auto-size columns
  const colWidths = columns.map((header, idx) => {
    const maxLen = Math.max(
      header.length,
      ...data.slice(0, 100).map((row) => String(row[idx] || "").length)
    );
    return { wch: Math.min(Math.max(maxLen + 2, 10), 60) };
  });
  ws["!cols"] = colWidths;

  // Create workbook
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Сделки");

  // Generate and download
  const now = new Date();
  const dateStr = now.toISOString().slice(0, 10);
  XLSX.writeFile(wb, `russilica_deals_${dateStr}.xlsx`);
}
