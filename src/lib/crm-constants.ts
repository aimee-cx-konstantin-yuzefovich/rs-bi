// src/lib/crm-constants.ts
// ─────────────────────────────────────────────────────────────────────
// All Bitrix24 CRM-specific constants are defined here.
// When the CRM configuration changes (stages renamed, new fields added),
// update ONLY this file. Business logic in components reads from here.
// ─────────────────────────────────────────────────────────────────────

export const RESPONSIBLE_FIELD_ID = "ASSIGNED_BY_ID";
export const RESPONSIBLE_FIELD_TITLE = "Ответственный";

export const COMPANY_RESPONSIBLE_FIELD_ID = "COMPANY_ASSIGNED_BY_ID";
export const COMPANY_RESPONSIBLE_FIELD_TITLE = "Ответственный компании";

export const DEAL_TABLE_DEFAULT_COLUMNS = [
  "COMPANY_TITLE",
  // NEW — guaranteed defaults for the Companies browser (required fields:
  // company creation date / last activity). Hidden by the shared system-field
  // filter until isSystemField() was made entity-aware for these two.
  "COMPANY_DATE_CREATE",
  "COMPANY_LAST_ACTIVITY_TIME",
  RESPONSIBLE_FIELD_ID,
  COMPANY_RESPONSIBLE_FIELD_ID,
  "UF_CRM_69257BBACD471",
  "COMPANY_UF_CRM_69257BBAB86F6", // NEW — Тип продукта (company-level)
  "OPPORTUNITY",
  "UF_CRM_1779384164284",
  "UF_CRM_1774880111684",
  "COMPANY_UF_CRM_1777324548",
  "COMPANY_REVENUE", // NEW — Годовой оборот
  "COMPANY_UF_CRM_1753079306248",
  "COMPANY_UF_CRM_69259C45D3399",
  "UF_CRM_6915D8C2C31D0",
  "COMPANY_INDUSTRY", // NEW — Сфера деятельности
  "UF_CRM_6915D8C328208",
  "COMPANY_UF_CRM_69257337B8025", // NEW — Область применения
  "COMPANY_UF_CRM_1764079092",
  // NEW (replaces/supplements the field above — Bitrix reconfigured this
  // company-card input around the same time, same title, new field ID):
  "COMPANY_UF_CRM_1781806326214",
  "COMPANY_UF_CRM_1764076968",
  "COMPANY_UF_CRM_1781806269703", // NEW — see note above
  "COMPANY_UF_CRM_1764079114",
  "COMPANY_UF_CRM_1781806285641", // NEW — see note above
  "COMPANY_UF_CRM_1764076998",
  "COMPANY_UF_CRM_1781806301447", // NEW — see note above
  "COMPANY_UF_CRM_1753080295792",
  "UF_CRM_1779394379",
  "UF_CRM_1774879952785",
  "COMPANY_UF_CRM_1753187313314", // NEW — Образцы
  "COMPANY_UF_CRM_1764155817232",
  "COMPANY_UF_CRM_1764156004815",
  "COMPANY_UF_CRM_1764155891815",
  "COMPANY_UF_CRM_1764156064272",
  "COMPANY_UF_CRM_1764156557536", // NEW — Дата передачи образцов
  "UF_CRM_1774880017",
  "COMPANY_UF_CRM_1764156593",
  "COMPANY_COMMENTS", // NEW — Комментарий (компания)
  "UF_CRM_1584459666824",
  "UF_CRM_1584464068013",
  "UF_CRM_1584460062014",
  "UF_CRM_1586468182934",
  // NEW — deal-level support-tracking fields added alongside the company changes:
  "UF_CRM_1781790245",
  "UF_CRM_1781799182248",
  "UF_CRM_1781799196440",
  "ACTIVITY_LAST",
  "ACTIVITY_NEXT",
] as const;

export const DEAL_STAGES = {
  // Standard Bitrix24 terminal stages — these are fixed by Bitrix24 itself
  WON: "WON",
  LOST: "LOSE",

  // Custom pipeline stages — verify these match your Bitrix24 funnel settings
  NEW: "NEW",
  PREPARATION: "PREPARATION",
  INVOICE_SENT: "PREPAYMENT_INVOICE",
  IN_PROGRESS: "EXECUTING",
} as const;

export const PAYMENT_STATUS_FIELD_ID = "UF_CRM_1584464068013";

// Payment status enumeration values — these IDs come from Bitrix24
// and are stable as long as the field is not deleted and recreated.
export const PAYMENT_STATUS_VALUES = {
  UNPAID: "103",
  INVOICE_SENT: "105",
  AWAITING_CONFIRMATION: "107",
  PAYMENT_PROCESSED: "109",
  ERROR: "111",
  PAID: "113",
  REFUNDED: "115",
} as const;

// Thresholds for business alerts — make these configurable so non-developers
// can adjust business rules without touching code.
export const ALERT_THRESHOLDS = {
  STALLED_DEAL_DAYS: 30,
  LARGE_DEAL_MIN_AMOUNT: 500_000,
  STUCK_NEGOTIATION_DAYS: 14,
  STUCK_LARGE_DEAL_MIN_AMOUNT: 1_000_000,
  WIN_RATE_WARNING_THRESHOLD: 20, // percent
  MIN_CLOSED_DEALS_FOR_WIN_RATE: 5,
} as const;
