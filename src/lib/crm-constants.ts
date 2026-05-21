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
  RESPONSIBLE_FIELD_ID,
  COMPANY_RESPONSIBLE_FIELD_ID,
  "UF_CRM_69257BBACD471",
  "OPPORTUNITY",
  "UF_CRM_1779384164284",
  "UF_CRM_1774880111684",
  "COMPANY_UF_CRM_1777324548",
  "COMPANY_UF_CRM_1753079306248",
  "COMPANY_UF_CRM_69259C45D3399",
  "UF_CRM_6915D8C2C31D0",
  "UF_CRM_6915D8C328208",
  "COMPANY_UF_CRM_1764079092",
  "COMPANY_UF_CRM_1764076968",
  "COMPANY_UF_CRM_1764079114",
  "COMPANY_UF_CRM_1764076998",
  "COMPANY_UF_CRM_1753080295792",
  "UF_CRM_1779394379",
  "UF_CRM_1774879952785",
  "COMPANY_UF_CRM_1764155817232",
  "COMPANY_UF_CRM_1764156004815",
  "COMPANY_UF_CRM_1764155891815",
  "COMPANY_UF_CRM_1764156064272",
  "UF_CRM_1774880017",
  "COMPANY_UF_CRM_1764156593",
  "UF_CRM_1584459666824",
  "UF_CRM_1584464068013",
  "UF_CRM_1584460062014",
  "UF_CRM_1586468182934",
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
