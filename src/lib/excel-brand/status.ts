// src/lib/excel-brand/status.ts
// ─────────────────────────────────────────────────────────────────────
// Semantic status taxonomy and cell styling for RusSilica Excel reports.
// Maps business statuses to a standardized 6-state semantic palette.
// ─────────────────────────────────────────────────────────────────────

import type ExcelJS from "exceljs";
import {
  ATTENTION_BG,
  ATTENTION_TEXT,
  IN_PROGRESS_BG,
  IN_PROGRESS_TEXT,
  NEGATIVE_BG,
  NEGATIVE_TEXT,
  NEUTRAL_BG,
  NEUTRAL_TEXT,
  RS_BORDER,
  RS_FONT_FAMILY,
  SUCCESS_BG,
  SUCCESS_TEXT,
  UNKNOWN_BG,
  UNKNOWN_TEXT,
} from "./tokens";

export type SemanticStatus =
  | "SUCCESS"
  | "IN_PROGRESS"
  | "ATTENTION"
  | "NEGATIVE"
  | "NEUTRAL"
  | "UNKNOWN";

export interface StatusColors {
  bg: string;
  text: string;
}

const STATUS_COLOR_MAP: Record<SemanticStatus, StatusColors> = {
  SUCCESS: { bg: SUCCESS_BG, text: SUCCESS_TEXT },
  IN_PROGRESS: { bg: IN_PROGRESS_BG, text: IN_PROGRESS_TEXT },
  ATTENTION: { bg: ATTENTION_BG, text: ATTENTION_TEXT },
  NEGATIVE: { bg: NEGATIVE_BG, text: NEGATIVE_TEXT },
  NEUTRAL: { bg: NEUTRAL_BG, text: NEUTRAL_TEXT },
  UNKNOWN: { bg: UNKNOWN_BG, text: UNKNOWN_TEXT },
};

export function getStatusColors(semantic: SemanticStatus): StatusColors {
  return STATUS_COLOR_MAP[semantic] || STATUS_COLOR_MAP.UNKNOWN;
}

/**
 * Maps arbitrary business/CRM status strings to canonical semantic states.
 * Preserves the actual business label; only determines visual styling.
 */
export function mapBusinessStatusToSemantic(status?: string | null): SemanticStatus {
  if (!status || typeof status !== "string") {
    return "NEUTRAL";
  }

  const s = status.trim().toLowerCase();
  if (!s || s === "—" || s === "-" || s === "нет данных") {
    return "NEUTRAL";
  }

  // 1. NEGATIVE (check negative before positive substrings like "не подошёл" vs "подошёл")
  if (
    s.includes("не подош") ||
    s.includes("отказ") ||
    s.includes("брак") ||
    s === "lose" ||
    s === "lost" ||
    s === "провалена" ||
    s === "отменена" ||
    s === "ошибка"
  ) {
    return "NEGATIVE";
  }

  // 2. ATTENTION (check before in_progress)
  if (
    s.includes("внимани") ||
    s.includes("доработк") ||
    s.includes("завис") ||
    s.includes("просроч") ||
    s.includes("требует") ||
    s.includes("застрял") ||
    s.includes("риск")
  ) {
    return "ATTENTION";
  }

  // 3. SUCCESS
  if (
    s.includes("оплачен") ||
    s.includes("подош") || // подошёл / подошли
    s.includes("успеш") ||
    s === "won" ||
    s === "завершена" ||
    s === "выполнено" ||
    s === "да"
  ) {
    return "SUCCESS";
  }

  // 4. IN_PROGRESS
  if (
    s.includes("отправлен") ||
    s.includes("испытан") ||
    s.includes("работе") ||
    s.includes("счет") ||
    s.includes("счёт") ||
    s.includes("подготовк") ||
    s.includes("передан") ||
    s.includes("тестирован") ||
    s === "new" ||
    s === "executing" ||
    s === "prepayment_invoice" ||
    s === "preparation"
  ) {
    return "IN_PROGRESS";
  }

  // 5. NEUTRAL
  if (s.includes("не требуется") || s === "нет" || s === "все" || s === "всё") {
    return "NEUTRAL";
  }

  return "UNKNOWN";
}

/**
 * Translates raw Bitrix stage IDs and English status codes to clear Russian business labels.
 */
export function formatStageToRussian(stage?: string | null): string {
  if (!stage || typeof stage !== "string") return "—";
  const trim = stage.trim();
  const upper = trim.toUpperCase();
  if (upper === "WON") return "Успешно завершена";
  if (upper === "LOSE" || upper === "LOST") return "Провалена";
  if (upper === "NEW") return "Новая сделка";
  if (upper === "EXECUTING") return "В работе";
  if (upper === "PREPARATION") return "Подготовка";
  if (upper === "PREPAYMENT_INVOICE") return "Счёт на предоплату";
  if (upper === "FINAL_INVOICE") return "Финальный счёт";
  if (upper === "INVOICE_SENT") return "Счёт выставлен";
  if (upper === "OPPORTUNITY") return "Сумма сделки";
  return trim;
}

/**
 * Translates raw English payment status codes to Russian.
 */
export function formatPaymentStatusToRussian(status?: string | null): string {
  if (!status || typeof status !== "string") return "—";
  const trim = status.trim();
  const upper = trim.toUpperCase();
  if (upper === "PAID") return "Оплачено";
  if (upper === "UNPAID") return "Не оплачено";
  if (upper === "INVOICE_SENT") return "Счёт выставлен";
  if (upper === "AWAITING_CONFIRMATION") return "Ожидает подтверждения";
  if (upper === "PAYMENT_PROCESSED") return "Платёж обработан";
  if (upper === "REFUNDED") return "Возврат";
  if (upper === "ERROR") return "Ошибка";
  return trim;
}

/**
 * Translates English currency codes to Russian currency symbols.
 */
export function formatCurrencyToRussian(currency?: string | null): string {
  if (!currency || typeof currency !== "string") return "₽";
  const upper = currency.trim().toUpperCase();
  if (upper === "RUB" || upper === "RUR") return "₽";
  if (upper === "USD") return "$";
  if (upper === "EUR") return "€";
  return currency.trim();
}

/**
 * Translates general English CRM and boolean values into Russian.
 */
export function translateCrmValueToRussian(val: string): string {
  if (!val || typeof val !== "string") return "";
  const trim = val.trim();
  const upper = trim.toUpperCase();
  const lower = trim.toLowerCase();

  if (lower === "opportunity") return "Сумма сделки";
  if (upper === "WON") return "Успешно завершена";
  if (upper === "LOSE" || upper === "LOST") return "Провалена";
  if (upper === "NEW") return "Новая сделка";
  if (upper === "EXECUTING") return "В работе";
  if (upper === "PREPARATION") return "Подготовка";
  if (upper === "PREPAYMENT_INVOICE") return "Счёт на предоплату";
  if (upper === "FINAL_INVOICE") return "Финальный счёт";
  if (upper === "PAID") return "Оплачено";
  if (upper === "UNPAID") return "Не оплачено";
  if (upper === "RUB" || upper === "RUR") return "₽";
  if (upper === "TRUE") return "Да";
  if (upper === "FALSE") return "Нет";

  return trim;
}

/**
 * Applies semantic badge styling to an Excel cell, translating raw English CRM values.
 */
export function applyStatusCell(
  cell: ExcelJS.Cell,
  statusText?: string | null,
  options?: { border?: boolean; bold?: boolean; translateEnglish?: boolean }
): void {
  const text = statusText || (typeof cell.value === "string" ? cell.value : null);
  const semantic = mapBusinessStatusToSemantic(text);
  const colors = getStatusColors(semantic);

  // If cell text is an untranslated English CRM term, translate to Russian
  if (options?.translateEnglish !== false && typeof cell.value === "string") {
    cell.value = translateCrmValueToRussian(cell.value);
  }

  cell.fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: `FF${colors.bg}` },
  };

  cell.font = {
    name: RS_FONT_FAMILY,
    size: 9,
    bold: options?.bold ?? true,
    color: { argb: `FF${colors.text}` },
  };

  cell.alignment = {
    vertical: "middle",
    horizontal: "center",
    wrapText: true,
  };

  if (options?.border ?? true) {
    cell.border = {
      top: { style: "thin", color: { argb: `FF${RS_BORDER}` } },
      bottom: { style: "thin", color: { argb: `FF${RS_BORDER}` } },
      left: { style: "thin", color: { argb: `FF${RS_BORDER}` } },
      right: { style: "thin", color: { argb: `FF${RS_BORDER}` } },
    };
  }
}
