// src/lib/excel-brand/print.ts
// ─────────────────────────────────────────────────────────────────────
// Print setups, page configurations, and corporate headers/footers for RusSilica Excel reports.
// ─────────────────────────────────────────────────────────────────────

import type ExcelJS from "exceljs";
import { RS_FOOTER_TEXT } from "./tokens";

export interface PrintSetupOptions {
  orientation?: "landscape" | "portrait";
  fitToWidth?: number;
  fitToHeight?: number;
  printTitlesRow?: string; // e.g. "6:6" to repeat table header row
}

/**
 * Configures worksheet page setup for professional printing and PDF export.
 */
export function configureWorksheetPrint(
  worksheet: ExcelJS.Worksheet,
  options?: PrintSetupOptions
): void {
  worksheet.pageSetup = {
    orientation: options?.orientation ?? "landscape",
    fitToPage: true,
    fitToWidth: options?.fitToWidth ?? 1,
    fitToHeight: options?.fitToHeight ?? 0,
    margins: {
      left: 0.5,
      right: 0.5,
      top: 0.75,
      bottom: 0.75,
      header: 0.3,
      footer: 0.3,
    },
    printTitlesRow: options?.printTitlesRow,
  };
}

/**
 * Adds the corporate footer:
 * Left: RusSilica BI Terminal • Внутренний управленческий отчёт
 * Right: Страница &[Page] из &[Pages]
 */
export function addCorporateFooter(worksheet: ExcelJS.Worksheet): void {
  worksheet.headerFooter = {
    oddFooter: `&L${RS_FOOTER_TEXT}&RСтраница &P из &N`,
    evenFooter: `&L${RS_FOOTER_TEXT}&RСтраница &P из &N`,
  };
}
