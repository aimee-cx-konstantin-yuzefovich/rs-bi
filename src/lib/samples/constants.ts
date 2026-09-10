// src/lib/samples/constants.ts
// ─────────────────────────────────────────────────────────────────────
// Samples v1 keyword dictionaries and human-readable labels.
// Field IDs themselves live in src/lib/crm-constants.ts (single source).
// ─────────────────────────────────────────────────────────────────────

import type { SampleDataIssue } from "./types";

export {
  COMPANY_SAMPLES_FIELD_ID,
  COMPANY_SAMPLES_DATE_MULTI_FIELD_ID,
  COMPANY_SAMPLES_DATE_SINGLE_FIELD_ID,
  COMPANY_SAMPLES_GRADE_GEL_FIELD_ID,
  COMPANY_SAMPLES_GRADE_SOL_FIELD_ID,
  COMPANY_SAMPLES_QTY_GEL_FIELD_ID,
  COMPANY_SAMPLES_QTY_SOL_FIELD_ID,
  COMPANY_SAMPLES_QTY_GEL_UNIT,
  COMPANY_SAMPLES_QTY_SOL_UNIT,
  COMPANY_TEST_RESULT_FIELD_ID,
  COMPANY_PRODUCT_TYPE_FIELD_ID,
  COMPANY_APPLICATION_NEW_FIELD_ID,
  COMPANY_APPLICATION_OLD_FIELD_ID,
  COMPANY_DIRECTION_FIELD_ID,
  DEAL_SAMPLE_TRANSFER_FIELD_ID,
  DEAL_SAMPLE_TESTING_FIELD_ID,
  DEAL_SAMPLE_SENT_DATE_FIELD_ID,
  DEAL_SAMPLE_TVL_DETAILS_FIELD_ID,
  DEAL_SAMPLE_MARK_VOLUME_FIELD_ID,
  DEAL_DIRECTION_FIELD_ID,
} from "@/lib/crm-constants";

export const COMPANY_TITLE_FALLBACK = "Без названия";

export const PRODUCT_FAMILY_GEL = "Гель";
export const PRODUCT_FAMILY_SOL = "Золь";

export const SAMPLE_DATA_ISSUE_LABELS: Record<SampleDataIssue, string> = {
  dates_conflict_between_fields:
    "Два поля «Дата передачи образцов» содержат разные даты",
  grades_without_item_result:
    "Несколько марок, но результат указан без привязки к марке",
  products_without_item_result:
    "Несколько продуктов, результат не разделён по продуктам",
  missing_title: "Название компании отсутствует",
  deal_company_status_mismatch:
    "Статусы образцов в сделке и компании противоречат друг другу",
  missing_product: "Есть активность по образцам, но продукт не указан",
  application_fields_differ:
    "Старое и новое поля «Область применения» содержат разные значения",
  deal_without_company: "Сделка с данными по образцам без привязки к компании",
};

export const NORMALIZED_RESULT_LABELS: Record<string, string> = {
  positive: "Положительный",
  negative: "Отрицательный",
  rework: "Доработка",
  pending: "На испытании / ожидание",
  mixed: "Смешанный",
  unknown: "Не определён",
};

export const SOURCE_QUALITY_LABELS: Record<string, string> = {
  structured: "Структурированные",
  partial: "Неполные",
  legacy: "Устаревшие",
  ambiguous: "Противоречивые",
};

/**
 * RU keyword dictionaries for conservative result classification.
 * Matching is lowercase substring against RESOLVED labels / free text.
 * Ordered: rework before negative/positive (rework phrases may contain both).
 */
export const REWORK_KEYWORDS = [
  "доработ",
  "модификац",
  "пересмотр",
  "необходима доработка",
  "требует доработк",
  "повторн", // повторное испытание / повторные испытания
];

export const POSITIVE_KEYWORDS = [
  "положитель",
  "одобрен",
  "пройден",
  "успешн",
  "соответствует",
  "тест пройден",
  "испытания пройдены",
  "подтвержден",
  "принят",
];

export const NEGATIVE_KEYWORDS = [
  "отрицатель",
  "не пройден",
  "не соответствует",
  "отклонен",
  "отклонён",
  "брак",
  "не подходит",
  "не прошел",
];

export const PENDING_KEYWORDS = [
  "ожидание",
  "ожидает",
  "в процессе",
  "испытание",
  "тестируется",
  "тестировани",
  "на испытании",
  "передан",
  "отправлен",
  "ожидается ответ",
  "нет результата",
  "не проверен",
  "ожидаем",
];

/** Statuses meaning active testing (for KPI «на испытании»). */
export const TESTING_STATUS_KEYWORDS = [
  "испытани",
  "тестир",
  "в тесте",
  "в работе",
  "на проверке",
  "тестировани",
];

/** Sample-indicator values meaning samples were actually sent/transferred. */
export const SENT_INDICATOR_KEYWORDS = [
  "отправлен",
  "передан",
  "доставлен",
  "выдан",
];
