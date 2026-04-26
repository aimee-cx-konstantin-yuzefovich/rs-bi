import * as XLSX from "xlsx";
import type { FieldInfo, DealData } from "@/store/dashboard-store";

/**
 * Export deals data to Excel (.xlsx) file.
 * Resolves enumeration IDs to human-readable values.
 * Handles multiple-value fields, money format, etc.
 */
export function exportToExcel(
  deals: DealData[],
  fields: FieldInfo[],
  selectedColumns: string[]
): void {
  if (deals.length === 0) return;

  const fieldMap = new Map(fields.map((f) => [f.id, f]));

  const columns =
    selectedColumns.length > 0 ? selectedColumns : Object.keys(deals[0] || {});

  // Header row: use human-readable titles
  const headers = columns.map((col) => {
    const field = fieldMap.get(col);
    return field?.title || col;
  });

  // Data rows: resolve list values where possible
  const rows = deals.map((deal) =>
    columns.map((col) => {
      const raw = deal[col];
      const field = fieldMap.get(col);

      if (raw === null || raw === undefined || raw === "") return "";

      // Handle arrays (multiple enumeration values)
      if (Array.isArray(raw)) {
        if (field?.listValues) {
          return raw
            .map((v) => {
              const listVal = field.listValues?.find((lv) => lv.ID === String(v));
              return listVal?.VALUE || String(v);
            })
            .join(", ");
        }
        return raw.join(", ");
      }

      // Resolve single enumeration values
      if (field?.listValues && raw) {
        const val = String(raw);
        const listVal = field.listValues.find((lv) => lv.ID === val);
        if (listVal) return listVal.VALUE;
      }

      // Handle money format (amount|currency)
      if (field?.type === "money" && raw) {
        const parts = String(raw).split("|");
        const amount = parseFloat(parts[0]);
        const currency = parts[1] || "";
        if (!isNaN(amount)) {
          return `${amount.toLocaleString("ru-RU", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${currency}`;
        }
      }

      // Handle boolean
      if (field?.type === "boolean" || field?.type === "char") {
        if (raw === "Y" || raw === "1") return "Да";
        if (raw === "N" || raw === "0") return "Нет";
      }

      return String(raw);
    })
  );

  // Create workbook and worksheet
  const wsData = [headers, ...rows];
  const ws = XLSX.utils.aoa_to_sheet(wsData);

  // Auto-size columns
  const colWidths = headers.map((header, idx) => {
    const maxLen = Math.max(
      header.length,
      ...rows.slice(0, 100).map((row) => String(row[idx] || "").length)
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
