// src/lib/bitrix-contract-spec.ts
// ─────────────────────────────────────────────────────────────────────
// Authoritative Bitrix24 Contract Specification.
// ONE CANONICAL SOURCE OF TRUTH for expected upstream schema properties,
// types, multiplicity constraints, enum IDs, and stage invariants.
// ─────────────────────────────────────────────────────────────────────

import {
  PAYMENT_STATUS_FIELD_ID,
  PAYMENT_STATUS_VALUES,
  COMPANY_SAMPLES_FIELD_ID,
  COMPANY_SAMPLES_DATE_MULTI_FIELD_ID,
  COMPANY_SAMPLES_DATE_SINGLE_FIELD_ID,
  COMPANY_SAMPLES_GRADE_GEL_FIELD_ID,
  COMPANY_SAMPLES_GRADE_SOL_FIELD_ID,
  COMPANY_SAMPLES_QTY_GEL_FIELD_ID,
  COMPANY_SAMPLES_QTY_SOL_FIELD_ID,
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
  DEAL_PAYMENT_DATE_FIELD_ID,
  DEAL_SHIPMENT_DATE_FIELD_ID,
  DEAL_PRODUCT_TYPE_FIELD_ID,
  DEAL_INDUSTRY_FIELD_ID,
  DEAL_REGION_FIELD_ID,
} from "./crm-constants";

export interface ExpectedBitrixField {
  entity: "deal" | "company";
  id: string;
  name: string;
  required: boolean;
  allowedTypes: string[];
  expectedMultiple?: boolean;
  enumIds?: string[];
  enumSemantics?: Record<string, string>;
  businessMeaning: string;
}

export const PAYMENT_STATUS_ENUM_SEMANTICS: Record<string, string> = {
  [PAYMENT_STATUS_VALUES.UNPAID]: "Не оплачен",
  [PAYMENT_STATUS_VALUES.INVOICE_SENT]: "Выставлен счет",
  [PAYMENT_STATUS_VALUES.AWAITING_CONFIRMATION]: "Ожидает подтверждения",
  [PAYMENT_STATUS_VALUES.PAYMENT_PROCESSED]: "Платеж проведен",
  [PAYMENT_STATUS_VALUES.ERROR]: "Ошибка",
  [PAYMENT_STATUS_VALUES.PAID]: "Оплачен",
  [PAYMENT_STATUS_VALUES.REFUNDED]: "Возвращен",
};

export const EXPECTED_DEAL_FIELDS: ExpectedBitrixField[] = [
  // ─── REQUIRED / Fatal fields ──────────────────────────────────────────
  {
    entity: "deal",
    id: "ID",
    name: "ID",
    required: true,
    allowedTypes: ["integer", "string"],
    businessMeaning: "Primary deal identifier in Bitrix24",
  },
  {
    entity: "deal",
    id: "STAGE_ID",
    name: "Стадия",
    required: true,
    allowedTypes: ["crm_status", "string"],
    businessMeaning: "Deal stage determining pipeline position and won/lost state",
  },
  {
    entity: "deal",
    id: "OPPORTUNITY",
    name: "Сумма",
    required: true,
    allowedTypes: ["double", "float", "number"],
    businessMeaning: "Financial deal value driving Commercial Funnel totals and revenue KPIs",
  },
  {
    entity: "deal",
    id: "CURRENCY_ID",
    name: "Валюта",
    required: true,
    allowedTypes: ["crm_currency", "string"],
    businessMeaning: "Currency code for multi-currency financial calculation and conversion",
  },
  {
    entity: "deal",
    id: "ASSIGNED_BY_ID",
    name: "Ответственный",
    required: true,
    allowedTypes: ["user", "integer", "string"],
    businessMeaning: "Responsible person ID for sales attribution and user filtering",
  },
  {
    entity: "deal",
    id: "COMPANY_ID",
    name: "Компания",
    required: true,
    allowedTypes: ["crm_company", "integer", "string"],
    businessMeaning: "Associated client company identifier",
  },
  {
    entity: "deal",
    id: "DATE_CREATE",
    name: "Дата создания",
    required: true,
    allowedTypes: ["datetime", "date"],
    businessMeaning: "Creation timestamp driving cohort date filters and deal aging",
  },
  {
    entity: "deal",
    id: PAYMENT_STATUS_FIELD_ID,
    name: "Статус оплаты",
    required: true,
    allowedTypes: ["enumeration"],
    expectedMultiple: false,
    enumIds: Object.values(PAYMENT_STATUS_VALUES),
    enumSemantics: PAYMENT_STATUS_ENUM_SEMANTICS,
    businessMeaning: "Payment tracking enumeration driving PAID_STATUS_CODES and INVOICE_SENT_STATUS_CODES",
  },
  {
    entity: "deal",
    id: DEAL_SAMPLE_TRANSFER_FIELD_ID,
    name: "Передача образцов",
    required: true,
    allowedTypes: ["enumeration"],
    businessMeaning: "Sample transfer tracking in Commercial Funnel",
  },
  {
    entity: "deal",
    id: DEAL_SAMPLE_TESTING_FIELD_ID,
    name: "Тестирование образцов",
    required: true,
    allowedTypes: ["enumeration"],
    expectedMultiple: false,
    businessMeaning: "Sample testing status classification in Commercial Funnel",
  },
  {
    entity: "deal",
    id: DEAL_SAMPLE_SENT_DATE_FIELD_ID,
    name: "Дата отправки образцов",
    required: true,
    allowedTypes: ["date", "datetime"],
    businessMeaning: "Sample shipment date establishing sample cycle duration and provenance",
  },
  {
    entity: "deal",
    id: DEAL_PAYMENT_DATE_FIELD_ID,
    name: "Дата оплаты",
    required: false,
    allowedTypes: ["date", "datetime"],
    expectedMultiple: false,
    businessMeaning: "Deal payment date driving cash-in and revenue period metrics",
  },
  {
    entity: "deal",
    id: DEAL_SHIPMENT_DATE_FIELD_ID,
    name: "Дата отгрузки",
    required: false,
    allowedTypes: ["date", "datetime"],
    expectedMultiple: false,
    businessMeaning: "Deal shipment date establishing shipment period metrics",
  },
  {
    entity: "deal",
    id: DEAL_PRODUCT_TYPE_FIELD_ID,
    name: "Тип продукта",
    required: false,
    allowedTypes: ["enumeration"],
    expectedMultiple: true,
    businessMeaning: "Deal product type classification for dimensional filtering",
  },
  {
    entity: "deal",
    id: DEAL_INDUSTRY_FIELD_ID,
    name: "Отрасль",
    required: false,
    allowedTypes: ["enumeration"],
    expectedMultiple: true,
    businessMeaning: "Deal industry classification for dimensional filtering",
  },
  {
    entity: "deal",
    id: DEAL_REGION_FIELD_ID,
    name: "Регион",
    required: false,
    allowedTypes: ["string", "enumeration"],
    expectedMultiple: false,
    businessMeaning: "Deal geographical region classification for dimensional filtering",
  },

  // ─── OPTIONAL / Warning fields (Supplementary display) ───────────────
  {
    entity: "deal",
    id: "BEGINDATE",
    name: "Дата начала",
    required: false,
    allowedTypes: ["date", "datetime"],
    businessMeaning: "Supplementary deal scheduled start date",
  },
  {
    entity: "deal",
    id: "CLOSEDATE",
    name: "Дата завершения",
    required: false,
    allowedTypes: ["date", "datetime"],
    businessMeaning: "Supplementary deal expected close date",
  },
  {
    entity: "deal",
    id: DEAL_SAMPLE_TVL_DETAILS_FIELD_ID,
    name: "Детали по образцам для ТВЛ",
    required: false,
    allowedTypes: ["string"],
    businessMeaning: "Supplementary technologist note on samples",
  },
  {
    entity: "deal",
    id: DEAL_SAMPLE_MARK_VOLUME_FIELD_ID,
    name: "Марка и объём поставки",
    required: false,
    allowedTypes: ["string"],
    businessMeaning: "Supplementary shipment mark and volume details",
  },
  {
    entity: "deal",
    id: DEAL_DIRECTION_FIELD_ID,
    name: "Направление",
    required: false,
    allowedTypes: ["enumeration"],
    expectedMultiple: true,
    businessMeaning: "Supplementary deal business direction categorization",
  },
];

export const EXPECTED_COMPANY_FIELDS: ExpectedBitrixField[] = [
  // ─── REQUIRED / Fatal fields ──────────────────────────────────────────
  {
    entity: "company",
    id: "ID",
    name: "ID",
    required: true,
    allowedTypes: ["integer", "string"],
    businessMeaning: "Primary company identifier",
  },
  {
    entity: "company",
    id: "TITLE",
    name: "Наименование компании",
    required: true,
    allowedTypes: ["string"],
    businessMeaning: "Official company name displayed across dashboard, previews, and exports",
  },
  {
    entity: "company",
    id: "ASSIGNED_BY_ID",
    name: "Ответственный компании",
    required: true,
    allowedTypes: ["user", "integer", "string"],
    businessMeaning: "Company manager for ownership filtering and browser grouping",
  },
  {
    entity: "company",
    id: "DATE_CREATE",
    name: "Дата создания",
    required: true,
    allowedTypes: ["datetime", "date"],
    businessMeaning: "Company creation timestamp used for company date filtering",
  },
  {
    entity: "company",
    id: COMPANY_SAMPLES_FIELD_ID,
    name: "Образцы",
    required: true,
    allowedTypes: ["enumeration"],
    expectedMultiple: true,
    businessMeaning: "Authoritative samples flag driving 'highlight rows with samples' in browser",
  },
  {
    entity: "company",
    id: COMPANY_SAMPLES_DATE_MULTI_FIELD_ID,
    name: "Дата передачи образцов (множественная)",
    required: true,
    allowedTypes: ["date", "datetime"],
    expectedMultiple: true,
    businessMeaning: "Legacy multiple sample delivery date cross-checked by Samples domain layer",
  },
  {
    entity: "company",
    id: COMPANY_SAMPLES_DATE_SINGLE_FIELD_ID,
    name: "Дата передачи образцов (одиночная)",
    required: true,
    allowedTypes: ["date", "datetime"],
    expectedMultiple: false,
    businessMeaning: "Recreated single sample delivery date cross-checked by Samples domain layer",
  },

  // ─── OPTIONAL / Warning fields (Supplementary display) ───────────────
  {
    entity: "company",
    id: COMPANY_SAMPLES_GRADE_GEL_FIELD_ID,
    name: "Марка предоставленных образцов (ГЕЛЬ)",
    required: false,
    allowedTypes: ["string", "enumeration"],
    businessMeaning: "Supplementary sample grade specification",
  },
  {
    entity: "company",
    id: COMPANY_SAMPLES_GRADE_SOL_FIELD_ID,
    name: "Марка предоставленных образцов (ЗОЛЬ)",
    required: false,
    allowedTypes: ["string", "enumeration"],
    businessMeaning: "Supplementary sample grade specification",
  },
  {
    entity: "company",
    id: COMPANY_SAMPLES_QTY_GEL_FIELD_ID,
    name: "Кол-во переданного образца (ГЕЛЬ) кг",
    required: false,
    allowedTypes: ["double", "float", "number", "integer", "string"],
    businessMeaning: "Supplementary gel sample weight",
  },
  {
    entity: "company",
    id: COMPANY_SAMPLES_QTY_SOL_FIELD_ID,
    name: "Кол-во переданного образца (ЗОЛЬ) л",
    required: false,
    allowedTypes: ["double", "float", "number", "integer", "string"],
    businessMeaning: "Supplementary sol sample volume",
  },
  {
    entity: "company",
    id: COMPANY_TEST_RESULT_FIELD_ID,
    name: "Результат испытаний",
    required: false,
    allowedTypes: ["string", "enumeration"],
    businessMeaning: "Supplementary test outcome commentary",
  },
  {
    entity: "company",
    id: COMPANY_PRODUCT_TYPE_FIELD_ID,
    name: "Тип продукта",
    required: false,
    allowedTypes: ["enumeration"],
    expectedMultiple: true,
    businessMeaning: "Supplementary product category classification",
  },
  {
    entity: "company",
    id: COMPANY_APPLICATION_NEW_FIELD_ID,
    name: "Область применения (новая)",
    required: false,
    allowedTypes: ["enumeration", "string"],
    businessMeaning: "New company application industry tag",
  },
  {
    entity: "company",
    id: COMPANY_APPLICATION_OLD_FIELD_ID,
    name: "Область применения (старая)",
    required: false,
    allowedTypes: ["enumeration", "string"],
    businessMeaning: "Legacy company application industry tag",
  },
  {
    entity: "company",
    id: COMPANY_DIRECTION_FIELD_ID,
    name: "Направление",
    required: false,
    allowedTypes: ["enumeration"],
    expectedMultiple: true,
    businessMeaning: "Company sales direction classification",
  },
];

export const REQUIRED_BASE_STAGES = ["WON", "LOSE"] as const;

/**
 * Normalizes Bitrix representation of boolean / multiplicity flags.
 * Accepts boolean true/false, "Y"/"N", 1/0, "true"/"false".
 */
export function normalizeBitrixBoolean(value: unknown): boolean {
  if (value === true || value === 1 || value === "1") return true;
  if (typeof value === "string") {
    const s = value.trim().toUpperCase();
    return s === "Y" || s === "TRUE" || s === "YES";
  }
  return false;
}

/**
 * Authoritative schema snapshot for offline contract validation.
 * Truthfully reflects the expected CRM contract with realistic types,
 * multiplicity, and required enum IDs.
 */
export const OFFLINE_CONTRACT_SNAPSHOT = {
  dealFields: {
    result: {
      ID: { type: "integer", isMultiple: false },
      STAGE_ID: { type: "crm_status", isMultiple: false },
      OPPORTUNITY: { type: "double", isMultiple: false },
      CURRENCY_ID: { type: "crm_currency", isMultiple: false },
      ASSIGNED_BY_ID: { type: "user", isMultiple: false },
      COMPANY_ID: { type: "crm_company", isMultiple: false },
      DATE_CREATE: { type: "datetime", isMultiple: false },
      BEGINDATE: { type: "date", isMultiple: false },
      CLOSEDATE: { type: "date", isMultiple: false },
      [DEAL_SAMPLE_TRANSFER_FIELD_ID]: {
        type: "enumeration",
        isMultiple: false,
        items: [{ ID: "1", VALUE: "Передано" }],
      },
      [DEAL_SAMPLE_TESTING_FIELD_ID]: {
        type: "enumeration",
        isMultiple: false,
        items: [{ ID: "2", VALUE: "В работе" }],
      },
      [DEAL_SAMPLE_SENT_DATE_FIELD_ID]: { type: "date", isMultiple: false },
      [DEAL_SAMPLE_TVL_DETAILS_FIELD_ID]: { type: "string", isMultiple: false },
      [DEAL_SAMPLE_MARK_VOLUME_FIELD_ID]: { type: "string", isMultiple: false },
      [DEAL_DIRECTION_FIELD_ID]: {
        type: "enumeration",
        isMultiple: true,
        items: [{ ID: "1007", VALUE: "Агрохимия" }],
      },
      [DEAL_PAYMENT_DATE_FIELD_ID]: { type: "date", isMultiple: false },
      [DEAL_SHIPMENT_DATE_FIELD_ID]: { type: "date", isMultiple: false },
      [DEAL_PRODUCT_TYPE_FIELD_ID]: {
        type: "enumeration",
        isMultiple: true,
        items: [{ ID: "101", VALUE: "Гель" }],
      },
      [DEAL_INDUSTRY_FIELD_ID]: {
        type: "enumeration",
        isMultiple: true,
        items: [{ ID: "201", VALUE: "Химия" }],
      },
      [DEAL_REGION_FIELD_ID]: { type: "string", isMultiple: false },
      [PAYMENT_STATUS_FIELD_ID]: {
        type: "enumeration",
        isMultiple: false,
        items: [
          { ID: "103", VALUE: "Не оплачен" },
          { ID: "105", VALUE: "Выставлен счет" },
          { ID: "107", VALUE: "Ожидает подтверждения" },
          { ID: "109", VALUE: "Платеж проведен" },
          { ID: "111", VALUE: "Ошибка" },
          { ID: "113", VALUE: "Оплачен" },
          { ID: "115", VALUE: "Возвращен" },
        ],
      },
    },
  },
  companyFields: {
    result: {
      ID: { type: "integer", isMultiple: false },
      TITLE: { type: "string", isMultiple: false },
      ASSIGNED_BY_ID: { type: "user", isMultiple: false },
      DATE_CREATE: { type: "datetime", isMultiple: false },
      [COMPANY_SAMPLES_FIELD_ID]: {
        type: "enumeration",
        isMultiple: true,
        items: [
          { ID: "263", VALUE: "Требуются образцы" },
          { ID: "261", VALUE: "Образцы отправлены" },
          { ID: "2695", VALUE: "Подошли" },
          { ID: "269", VALUE: "Не подошли" },
          { ID: "271", VALUE: "Требуется доработка" },
        ],
      },
      [COMPANY_SAMPLES_DATE_MULTI_FIELD_ID]: {
        type: "date",
        isMultiple: true,
      },
      [COMPANY_SAMPLES_DATE_SINGLE_FIELD_ID]: {
        type: "date",
        isMultiple: false,
      },
      [COMPANY_SAMPLES_GRADE_GEL_FIELD_ID]: { type: "string", isMultiple: false },
      [COMPANY_SAMPLES_GRADE_SOL_FIELD_ID]: { type: "string", isMultiple: false },
      [COMPANY_SAMPLES_QTY_GEL_FIELD_ID]: { type: "double", isMultiple: false },
      [COMPANY_SAMPLES_QTY_SOL_FIELD_ID]: { type: "double", isMultiple: false },
      [COMPANY_TEST_RESULT_FIELD_ID]: { type: "string", isMultiple: false },
      [COMPANY_PRODUCT_TYPE_FIELD_ID]: {
        type: "enumeration",
        isMultiple: true,
        items: [{ ID: "1613", VALUE: "Гель" }],
      },
      [COMPANY_APPLICATION_NEW_FIELD_ID]: {
        type: "enumeration",
        isMultiple: false,
        items: [{ ID: "201", VALUE: "Нефтегаз" }],
      },
      [COMPANY_APPLICATION_OLD_FIELD_ID]: {
        type: "string",
        isMultiple: false,
      },
      [COMPANY_DIRECTION_FIELD_ID]: {
        type: "enumeration",
        isMultiple: true,
        items: [{ ID: "301", VALUE: "Катализаторы" }],
      },
    },
  },
  dealList: {
    result: [{ ID: "1", STAGE_ID: "WON", OPPORTUNITY: 1000 }],
  },
  companyList: {
    result: [{ ID: "10", TITLE: "АО «РусСилика»" }],
  },
  statusList: {
    result: [
      { STATUS_ID: "WON", NAME: "Сделка успешна" },
      { STATUS_ID: "LOSE", NAME: "Сделка проиграна" },
    ],
  },
};
