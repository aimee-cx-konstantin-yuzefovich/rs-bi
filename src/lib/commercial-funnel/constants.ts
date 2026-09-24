// src/lib/commercial-funnel/constants.ts
// ─────────────────────────────────────────────────────────────────────
// Centralized business constants and thresholds for Commercial Funnel v1.
// ─────────────────────────────────────────────────────────────────────

import type { CommercialFilters } from "./types";

export const COMMERCIAL_THRESHOLDS = {
  SAMPLE_TESTING_ATTENTION_DAYS: 14,
  PAYMENT_WAITING_ATTENTION_DAYS: 14,
  STALLED_DEAL_DAYS: 30,
} as const;

/**
 * Authoritative business timezone for RusSilica Commercial Funnel.
 * Bitrix24 instance operates in Moscow time (MSK, UTC+3).
 * All period boundaries, date checks, and waiting day calculations use this timezone.
 */
export const COMMERCIAL_TIMEZONE = "Europe/Moscow";

/** Truthful Russian label for deal opportunity of paid deals (cash receipts are not tracked in CRM) */
export const PAYMENT_AMOUNT_LABEL = "Сумма сделок с полученной оплатой";


export const DEFAULT_COMMERCIAL_FILTERS: CommercialFilters = {
  periodPreset: "30days",
  responsibleId: "all",
  productType: "all",
  industry: "all",
  direction: "all",
  region: "all",
};

/** Company-level "Образцы" (UF_CRM_1753187313314) known enum mapping */
export const COMPANY_SAMPLE_STATUS_MAP: Record<string, string> = {
  "263": "Требуются образцы",
  "261": "Образцы отправлены",
  "2695": "Подошли",
  "269": "Не подошли",
  "271": "Требуется доработка",
};

/** Deal-level "Передача образцов" (UF_CRM_1779386185) known mapping */
export const DEAL_SAMPLE_PROCESS_MAP: Record<string, string> = {
  "DT1032_15:NEW": "Подготовка к отправке",
  "DT1032_15:UC_ZARRMX": "Образцы отправлены",
  "DT1032_15:CLIENT": "На испытании",
  "DT1032_15:SUCCESS": "Подошли",
  "DT1032_15:FAIL": "Не подошли",
};

export const UNCLASSIFIED_LABEL = "Не классифицировано";

/** Standardized unified status keys for WIP aggregation */
export const WIP_STATUS_KEYS = [
  "Требуются образцы",
  "Подготовка к отправке",
  "Образцы отправлены",
  "На испытании",
  "Подошли",
  "Не подошли",
  "Требуется доработка",
  UNCLASSIFIED_LABEL,
] as const;

export const PAYMENT_STATUS_LABELS: Record<string, string> = {
  "103": "Не оплачен",
  "105": "Выставлен счет",
  "107": "Ожидает подтверждения",
  "109": "Платеж проведен",
  "111": "Ошибка",
  "113": "Оплачен",
  "115": "Возвращен",
};

export const PAID_STATUS_CODES = new Set(["109", "113"]);
export const INVOICE_SENT_STATUS_CODES = new Set(["105", "107"]);
