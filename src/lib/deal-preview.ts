/**
 * Deal-only normalization and preview field contract for RusSilica BI Terminal.
 * Implements the current Deal card explicit whitelist, three-date timeline model (DATE_CREATE, LAST_TOUCH, DATE_MODIFY),
 * human-readable classification resolution, and unified UI/Excel model.
 */

import {
  getDealStageDisplayLabel,
  DEAL_SAMPLE_TESTING_FIELD_ID,
  DEAL_TESTING_MARKER_CURRENT_FIELD_ID,
  DEAL_SAMPLE_MARK_VOLUME_FIELD_ID,
  PAYMENT_STATUS_FIELD_ID,
  DEAL_PAYMENT_DATE_FIELD_ID,
  DEAL_SHIPMENT_DATE_FIELD_ID,
  DEAL_DELIVERY_TYPE_FIELD_ID,
  DEAL_DELIVERY_COST_FIELD_ID,
  DEAL_DELIVERY_ADDRESS_FIELD_ID,
  DELIVERY_TYPE_ENUM_SEMANTICS,
  UNCLASSIFIED_LABEL,
} from "./crm-constants";
import { PAYMENT_STATUS_ENUM_SEMANTICS } from "./bitrix-contract-spec";
import { BUSINESS_TIMEZONE, parseStrictDate, parseStrictNumber } from "./scalar-safety";
import {
  resolveResponsibleDisplay,
  type DatasetCoverage,
} from "./enrichment-coverage";
import { NUMFMT, getMoneyNumFmt } from "./excel-brand";
import { resolveDealType, type DealTypeRegistry } from "./deal-type";

export function isDealId(id: string): boolean {
  return /^[1-9]\d*$/.test(id) && Number.isSafeInteger(Number(id));
}

/**
 * Derives a secure, direct link to the Bitrix24 deal or company details page.
 * Requirements:
 * - /details/ (never /edit/)
 * - Exact entity ID
 * - Derived from BITRIX_PORTAL_URL (never from webhook credentials)
 * - Valid HTTPS URL without query params, credentials, or fragments
 */
export function getBitrixEntityUrl(
  entity: "deal" | "company",
  id: string,
  portalUrl?: string
): string | null {
  if (!/^[1-9]\d*$/.test(id) || !Number.isSafeInteger(Number(id))) return null;
  const baseUrl = portalUrl ?? process.env.BITRIX_PORTAL_URL ?? "";
  try {
    const portal = new URL(baseUrl);
    if (
      portal.protocol !== "https:" ||
      portal.username ||
      portal.password ||
      portal.search ||
      portal.hash ||
      portal.pathname !== "/" ||
      portal.hostname === "your-portal.bitrix24.ru"
    ) {
      return null;
    }
    return new URL(`/crm/${entity}/details/${id}/`, portal.origin).href;
  } catch {
    return null;
  }
}

/**
 * Normalizes universal CRM item (entityTypeId: 2) into standard Deal format.
 * Strictly enforces naming invariants:
 * - Deal TITLE: real Bitrix TITLE; if empty -> "Без названия"; never deal ID.
 * - Company TITLE: real Bitrix TITLE; if empty -> "Без названия"; never company ID.
 */
export function normalizeDealPreview(
  item: Record<string, unknown>,
  companyTitle?: string | null,
  options?: { companyLookupFailed?: boolean }
): Record<string, unknown> {
  const deal: Record<string, unknown> = {};

  const standardFields: Record<string, string> = {
    id: "ID",
    title: "TITLE",
    typeId: "TYPE_ID",
    stageId: "STAGE_ID",
    categoryId: "CATEGORY_ID",
    opportunity: "OPPORTUNITY",
    currencyId: "CURRENCY_ID",
    assignedById: "ASSIGNED_BY_ID",
    companyId: "COMPANY_ID",
    contactId: "CONTACT_ID",
    createdTime: "DATE_CREATE",
    updatedTime: "DATE_MODIFY",
    begindate: "BEGINDATE",
    closedate: "CLOSEDATE",
    lastActivityTime: "LAST_ACTIVITY_TIME",
    lastActivityBy: "LAST_ACTIVITY_BY",
    comments: "COMMENTS",
  };

  for (const [key, value] of Object.entries(item)) {
    if (key.startsWith("UF_CRM_")) {
      deal[key] = value;
    } else if (standardFields[key]) {
      deal[standardFields[key]] = value;
    }
  }

  deal.ID = String(item.id);

  // Invariant: Real Deal TITLE, never deal ID. Fallback to "Без названия".
  const rawDealTitle = typeof deal.TITLE === "string" ? deal.TITLE.trim() : "";
  deal.TITLE = rawDealTitle || "Без названия";

  // Invariant: If attached to a company, real Company TITLE, never company ID.
  const rawCompanyId = item.companyId !== undefined && item.companyId !== null
    ? String(item.companyId).trim()
    : "";

  if (rawCompanyId && rawCompanyId !== "0") {
    deal.COMPANY_ID = rawCompanyId;
    if (options?.companyLookupFailed) {
      deal.COMPANY_TITLE = "Название компании не удалось загрузить";
    } else {
      const cleanCompanyTitle = typeof companyTitle === "string" ? companyTitle.trim() : "";
      deal.COMPANY_TITLE = cleanCompanyTitle || "Без названия";
    }
  } else {
    deal.COMPANY_ID = "";
    deal.COMPANY_TITLE = "";
  }

  return deal;
}

/** Explicit current Deal card fields whitelist (Section 1B) */
export const DEAL_PREVIEW_CARD_FIELDS = [
  { id: "TYPE_ID", label: "Тип сделки", role: "type" },
  { id: DEAL_TESTING_MARKER_CURRENT_FIELD_ID, label: "Тестирование образцов", role: "testing" },
  { id: DEAL_SAMPLE_MARK_VOLUME_FIELD_ID, label: "Марка и объём поставки", role: "text" },
  { id: PAYMENT_STATUS_FIELD_ID, label: "Статус оплаты", role: "payment_status" },
  { id: DEAL_PAYMENT_DATE_FIELD_ID, label: "Дата оплаты", role: "payment_date" },
  { id: DEAL_SHIPMENT_DATE_FIELD_ID, label: "Дата отгрузки", role: "shipment_date" },
  { id: DEAL_DELIVERY_TYPE_FIELD_ID, label: "Тип доставки", role: "delivery_type" },
  { id: DEAL_DELIVERY_COST_FIELD_ID, label: "Стоимость доставки", role: "delivery_cost" },
  { id: DEAL_DELIVERY_ADDRESS_FIELD_ID, label: "Адрес доставки", role: "delivery_address" },
] as const;

export interface DealPreviewResolvedField {
  id: string;
  label: string;
  value: string; // formatted human-readable UI representation
  formattedAmount?: string;
  currencyLabel?: string;
  rawValue?: unknown;
  type?: string;
  excelValue?: string | number | Date | null;
  excelNumFmt?: string;
  isDate?: boolean;
  isMoney?: boolean;
  currency?: string;
}

export interface DealPreviewModel {
  dealTitle: string;
  dealId: string;
  companyId: string;
  companyTitle: string;
  bitrixUrl: string | null;
  companyBitrixUrl: string | null;
  mainFields: DealPreviewResolvedField[];     // 1. Стадия, 2. Сумма, 3. Ответственный, 4. Компания
  timelineFields: DealPreviewResolvedField[]; // 5. Дата создания сделки, 6. Последнее касание с клиентом, 7. Последнее изменение сделки
  activityField: DealPreviewResolvedField;    // 8. Последняя активность
  cardFields: DealPreviewResolvedField[];     // 9. Тип сделки ... 17. Адрес доставки
}

export interface BuildDealPreviewModelOptions {
  fields?: Array<{ id: string; title?: string; type?: string; listValues?: Array<{ ID: string; VALUE: string }> }>;
  dealTypeRegistry?: DealTypeRegistry | null;
  userNames?: Record<string, string>;
  usersCoverage?: DatasetCoverage | null;
  activity?: { SUBJECT?: string; CREATED?: string; DEADLINE?: string } | null;
  lastTouchTimestamp?: string | null;
  bitrixUrl?: string | null;
  companyBitrixUrl?: string | null;
}

/**
 * Authoritatively resolves a deal stage ID to its Russian human-readable label.
 * Precedence:
 * 1. fields metadata STAGE_ID listValues (authoritative Bitrix status registry)
 * 2. getDealStageDisplayLabel() canonical mappings
 * 3. Truthful fallback: "Не классифицировано (<raw>)"
 */
export function resolveDealStage(
  rawStage: unknown,
  fields?: Array<{ id: string; listValues?: Array<{ ID: string; VALUE: string }> }>,
  categoryId?: string | number | null
): string {
  if (rawStage === undefined || rawStage === null || rawStage === "") return "–";
  const str = String(rawStage).trim();
  if (!str) return "–";

  const normCat =
    categoryId !== undefined && categoryId !== null && String(categoryId).trim() !== ""
      ? String(categoryId).trim()
      : undefined;

  // 1. Check authoritative stage metadata listValues
  const stageField = fields?.find((f) => f.id === "STAGE_ID");
  if (stageField?.listValues && stageField.listValues.length > 0) {
    const listValues = stageField.listValues;

    // 1a. Exact match on raw ID (e.g. "C1:NEW", "10", "WON")
    const directMatch = listValues.find((lv) => lv.ID === str);
    if (directMatch) return directMatch.VALUE;

    const colonIdx = str.lastIndexOf(":");

    // 1b. If input has a category prefix (e.g. "C1:10", "DT1032_15:NEW")
    if (colonIdx !== -1) {
      const prefix = str.slice(0, colonIdx);
      const baseId = str.slice(colonIdx + 1);
      // Match candidate in that exact category prefix
      const matchInPrefix = listValues.find((lv) => {
        const lvColon = lv.ID.lastIndexOf(":");
        if (lvColon === -1) return false;
        return lv.ID.slice(0, lvColon) === prefix && lv.ID.slice(lvColon + 1) === baseId;
      });
      if (matchInPrefix) return matchInPrefix.VALUE;

      // Fallback to unprefixed base ID (default category) if category-specific stage absent
      const unprefixedMatch = listValues.find((lv) => lv.ID === baseId);
      if (unprefixedMatch) return unprefixedMatch.VALUE;
    }

    // 1c. If deal record provides categoryId context
    if (normCat !== undefined) {
      const targetPrefixes = normCat === "0" ? ["", "C0"] : [`C${normCat}`];
      const matchWithCat = listValues.find((lv) => {
        const lvColon = lv.ID.lastIndexOf(":");
        const lvPrefix = lvColon !== -1 ? lv.ID.slice(0, lvColon) : "";
        const lvBase = lvColon !== -1 ? lv.ID.slice(lvColon + 1) : lv.ID;
        return targetPrefixes.includes(lvPrefix) && (lvBase === str || lv.ID === str);
      });
      if (matchWithCat) return matchWithCat.VALUE;
    }

    // 1d. Base-ID fallback (ignoring category prefix)
    // Allowed ONLY when:
    // - exactly ONE candidate in listValues matches the base ID across all categories;
    // - OR category context disambiguates it.
    const baseId = colonIdx !== -1 ? str.slice(colonIdx + 1) : str;
    const baseCandidates = listValues.filter((lv) => {
      const lvColon = lv.ID.lastIndexOf(":");
      const lvBase = lvColon !== -1 ? lv.ID.slice(lvColon + 1) : lv.ID;
      return lvBase === baseId;
    });

    if (baseCandidates.length === 1) {
      return baseCandidates[0].VALUE;
    } else if (baseCandidates.length > 1) {
      // Ambiguous across multiple categories without category context:
      // Do NOT pick the first matching category arbitrarily!
      return UNCLASSIFIED_LABEL;
    }
  }

  // 1e. Default Category 0 live names fallback
  const colonIdx = str.lastIndexOf(":");
  const prefix = colonIdx !== -1 ? str.slice(0, colonIdx) : "";
  const baseId = colonIdx !== -1 ? str.slice(colonIdx + 1) : str;
  const isCat0 = (normCat === "0" || normCat === undefined) && (prefix === "" || prefix === "C0");
  if (isCat0 && CATEGORY_0_STAGE_DISPLAY_LABELS[baseId]) {
    return CATEGORY_0_STAGE_DISPLAY_LABELS[baseId];
  }

  // 2. Check canonical stage display mapping (e.g. NEW, WON, LOSE, PREPARATION, etc.)
  const canonical = getDealStageDisplayLabel(str);
  if (canonical && canonical !== str && canonical !== "—") {
    return canonical;
  }

  // 3. Fallback: truthful unknown classification (never naked internal ID like "10" or "999999")
  return UNCLASSIFIED_LABEL;
}

/**
 * Verified Category 0 live stage names from Bitrix24 portal.
 * Used when metadata listValues is absent and stage belongs to pipeline 0.
 */
export const CATEGORY_0_STAGE_DISPLAY_LABELS: Record<string, string> = {
  NEW: "Предложение / Согласование цены",
  EXECUTING: "Привлечение техподдержки",
  UC_SP94UZ: "Тестирование образцов",
  "8": "Согласование предложения с руководством",
  PREPARATION: "Согласование / подписание договора",
  "5": "Выставление счета",
  "6": "Подписание спецификации",
  "9": "Получение оплаты",
  "10": "Производство",
  "11": "Склад",
  "7": "Отгрузка",
  WON: "Сделка успешна",
  LOSE: "Не устроила цена",
  LOST: "Не устроила цена",
  APOLOGY: "Не устроили сроки",
  "1": "Не согласовали договор",
  "2": "Не устроили параметры продукта",
  "4": "Другое",
};

/**
 * Resolves an enum or status field using metadata listValues, fallback dictionaries,
 * and truthful unknown classification format.
 * Supports recursive array unpacking for multi-select enums.
 */
function resolveEnumField(
  rawVal: unknown,
  fieldId: string,
  fields?: Array<{ id: string; listValues?: Array<{ ID: string; VALUE: string }> }>,
  fallbackMap?: Record<string, string>
): string {
  if (rawVal === undefined || rawVal === null || rawVal === "") return "–";

  // Handle arrays first (e.g. multi-enum)
  if (Array.isArray(rawVal)) {
    if (rawVal.length === 0) return "–";
    const resolved = rawVal.map((v) =>
      resolveEnumField(v, fieldId, fields, fallbackMap)
    );
    return resolved.join(", ");
  }

  const s = String(rawVal).trim();
  if (!s || s === "null" || s === "undefined") return "–";

  // Check metadata listValues
  const fieldMeta = fields?.find((f) => f.id === fieldId);
  if (fieldMeta?.listValues && fieldMeta.listValues.length > 0) {
    const found = fieldMeta.listValues.find((lv) => lv.ID === s);
    if (found) return found.VALUE;
  }

  // Check fallback dictionary
  if (fallbackMap && fallbackMap[s]) {
    return fallbackMap[s];
  }

  return UNCLASSIFIED_LABEL;
}

/**
 * Resolves the "Тестирование образцов" checkbox / manager marker (Section 15).
 * Output is strictly "Да" / "Нет".
 */
function resolveTestingMarker(val: unknown): string {
  if (val === null || val === undefined || val === "") return "Нет";
  if (val === true || val === "Y" || val === "1" || val === 1) return "Да";
  if (val === false || val === "N" || val === "0" || val === 0) return "Нет";
  const str = String(val).trim().toLowerCase();
  if (str === "true" || str === "y" || str === "да") return "Да";
  if (str === "false" || str === "n" || str === "нет" || str === "null" || str === "undefined") return "Нет";
  if (Array.isArray(val)) return val.length > 0 ? "Да" : "Нет";
  return str.length > 0 ? "Да" : "Нет";
}

/**
 * Resolves money fields (such as "30500|RUB" or 30500).
 */
function resolveDeliveryCost(val: unknown): {
  display: string;
  numAmount: number | null;
  currency: string;
} {
  if (val === null || val === undefined || val === "") {
    return { display: "–", numAmount: null, currency: "RUB" };
  }
  const s = String(val).trim();
  if (!s || s === "null" || s === "undefined" || s === "–" || s === "—") {
    return { display: "–", numAmount: null, currency: "RUB" };
  }

  const parts = s.split("|");
  const amount = parseStrictNumber(parts[0]);
  const currency = (parts[1] || "RUB").trim().toUpperCase() || "RUB";

  if (amount !== undefined) {
    const formatted = `${amount.toLocaleString("ru-RU", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })} ${currency}`;
    return { display: formatted, numAmount: amount, currency };
  }

  return { display: s, numAmount: null, currency };
}

/**
 * Parses and formats date-only values in Russian DD.MM.YYYY format.
 * Guarantees timezone-invariant display (independent of client local timezone).
 */
function resolveDateOnly(val: unknown): { display: string; date: Date | null } {
  if (val === null || val === undefined || val === "") return { display: "–", date: null };
  const s = String(val).trim();
  if (!s || s === "null" || s === "undefined" || s === "–" || s === "—") {
    return { display: "–", date: null };
  }
  const d = parseStrictDate(s, { mode: "DATE_ONLY" }) || parseStrictDate(s);
  if (!d) return { display: s, date: null };
  const display = d.toLocaleDateString("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: "UTC",
  });
  return { display, date: d };
}

/**
 * Parses and formats datetime values with time in Russian DD.MM.YYYY, HH:mm format.
 * Formats deterministically in RusSilica business timezone (Europe/Moscow, UTC+3).
 */
function resolveDateTime(val: unknown): { display: string; date: Date | null } {
  if (val === null || val === undefined || val === "") return { display: "–", date: null };
  const s = String(val).trim();
  if (!s || s === "null" || s === "undefined" || s === "–" || s === "—") {
    return { display: "–", date: null };
  }
  const d = parseStrictDate(s, { mode: "DATETIME_BUSINESS_TIMEZONE" }) || parseStrictDate(s);
  if (!d) return { display: s, date: null };
  const display = d.toLocaleString("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: BUSINESS_TIMEZONE,
  });
  return { display, date: d };
}

/**
 * Resolves address fields safely.
 */
function resolveAddress(val: unknown): string {
  if (val === null || val === undefined || val === "") return "–";
  if (typeof val === "object") {
    const obj = val as Record<string, unknown>;
    if (typeof obj.text === "string" && obj.text.trim()) return obj.text.trim();
    if (typeof obj.address === "string" && obj.address.trim()) return obj.address.trim();
    return JSON.stringify(val);
  }
  const s = String(val).trim();
  return s && s !== "null" && s !== "undefined" ? s : "–";
}

/**
 * Canonical builder that produces the exact DealPreviewModel consumed by both
 * the DealPreview drawer UI and the single-Deal Excel export.
 * Guarantees the invariant: UI value === Excel value.
 */
export function buildDealPreviewModel(
  deal: Record<string, unknown>,
  options: BuildDealPreviewModelOptions = {}
): DealPreviewModel {
  const {
    fields,
    dealTypeRegistry,
    userNames = {},
    usersCoverage,
    activity,
    lastTouchTimestamp,
    bitrixUrl = null,
    companyBitrixUrl = null,
  } = options;

  const dealId = String(deal.ID || deal.id || "");
  const dealTitle = String(deal.TITLE || deal.title || "").trim() || "Без названия";
  const companyId = String(deal.COMPANY_ID || deal.companyId || "");
  const companyTitle = String(deal.COMPANY_TITLE || deal.companyTitle || "").trim() || (companyId ? "Без названия" : "–");

  // ─────────────────────────────────────────────────────────────
  // 1. MAIN Attributes (1 to 4)
  // ─────────────────────────────────────────────────────────────

  // 1. Стадия
  const rawStage = deal.STAGE_ID ?? deal.stageId;
  const rawCat = deal.CATEGORY_ID ?? deal.categoryId;
  const stageDisplay = resolveDealStage(rawStage, fields, rawCat as string | number | null);
  const stageField: DealPreviewResolvedField = {
    id: "STAGE_ID",
    label: "Стадия",
    value: stageDisplay,
    rawValue: rawStage,
    type: "crm_status",
    excelValue: stageDisplay,
  };

  // 2. Сумма
  const rawOpp = deal.OPPORTUNITY ?? deal.opportunity;
  const rawCurrency = String(deal.CURRENCY_ID ?? deal.currencyId ?? "").trim();
  const currencyLabel = rawCurrency && rawCurrency.toUpperCase() !== "UNKNOWN" ? rawCurrency : "валюта не указана";
  const oppNum = parseStrictNumber(rawOpp);
  let oppFormatted = "–";
  let oppExcelValue: number | string | null = null;
  if (oppNum !== undefined) {
    oppFormatted = oppNum.toLocaleString("ru-RU", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
    oppExcelValue = oppNum;
  } else if (rawOpp !== undefined && rawOpp !== null && rawOpp !== "") {
    oppFormatted = String(rawOpp);
    oppExcelValue = String(rawOpp);
  }
  const oppField: DealPreviewResolvedField = {
    id: "OPPORTUNITY",
    label: "Сумма",
    value: oppFormatted !== "–" ? `${oppFormatted} ${currencyLabel}` : "–",
    formattedAmount: oppFormatted,
    currencyLabel: oppFormatted !== "–" ? currencyLabel : undefined,
    rawValue: rawOpp,
    type: "money",
    excelValue: oppExcelValue,
    excelNumFmt: oppNum !== undefined ? getMoneyNumFmt(rawCurrency || "RUB", true) : undefined,
    isMoney: oppNum !== undefined,
    currency: rawCurrency || "RUB",
  };

  // 3. Ответственный
  const rawResp = deal.ASSIGNED_BY_ID ?? deal.assignedById;
  const respDisplay = rawResp
    ? resolveResponsibleDisplay(String(rawResp), userNames, usersCoverage)
    : "–";
  const respField: DealPreviewResolvedField = {
    id: "ASSIGNED_BY_ID",
    label: "Ответственный",
    value: respDisplay,
    rawValue: rawResp,
    type: "user",
    excelValue: respDisplay,
  };

  // 4. Компания
  const companyField: DealPreviewResolvedField = {
    id: "COMPANY_ID",
    label: "Компания",
    value: companyTitle,
    rawValue: companyId,
    type: "crm_company",
    excelValue: companyTitle,
  };

  const mainFields = [stageField, oppField, respField, companyField];

  // ─────────────────────────────────────────────────────────────
  // 2. TIMELINE Attributes (5 to 7)
  // ─────────────────────────────────────────────────────────────

  // 5. Дата создания сделки (from DATE_CREATE)
  const rawCreate = deal.DATE_CREATE ?? deal.createdTime;
  const createParsed = resolveDateTime(rawCreate);
  const createField: DealPreviewResolvedField = {
    id: "DATE_CREATE",
    label: "Дата создания сделки",
    value: createParsed.display,
    rawValue: rawCreate,
    type: "datetime",
    excelValue: createParsed.date,
    excelNumFmt: NUMFMT.DATETIME,
    isDate: true,
  };

  // 6. Последнее касание (NEVER DATE_MODIFY!)
  // Priority: explicit lastTouchTimestamp -> activity.CREATED -> deal.LAST_ACTIVITY_TIME -> null
  const rawLastTouch =
    lastTouchTimestamp !== undefined && lastTouchTimestamp !== null && String(lastTouchTimestamp).trim() !== ""
      ? String(lastTouchTimestamp)
      : activity?.CREATED
      ? activity.CREATED
      : deal.LAST_ACTIVITY_TIME
      ? String(deal.LAST_ACTIVITY_TIME)
      : null;
  const lastTouchParsed = resolveDateTime(rawLastTouch);
  const lastTouchField: DealPreviewResolvedField = {
    id: "LAST_TOUCH",
    label: "Последнее касание с клиентом",
    value: lastTouchParsed.display,
    rawValue: rawLastTouch,
    type: "datetime",
    excelValue: lastTouchParsed.date,
    excelNumFmt: NUMFMT.DATETIME,
    isDate: true,
  };

  // 7. Последнее изменение сделки (from DATE_MODIFY)
  const rawModify = deal.DATE_MODIFY ?? deal.updatedTime;
  const modifyParsed = resolveDateTime(rawModify);
  const modifyField: DealPreviewResolvedField = {
    id: "DATE_MODIFY",
    label: "Последнее изменение сделки",
    value: modifyParsed.display,
    rawValue: rawModify,
    type: "datetime",
    excelValue: modifyParsed.date,
    excelNumFmt: NUMFMT.DATETIME,
    isDate: true,
  };

  const timelineFields = [createField, lastTouchField, modifyField];

  // ─────────────────────────────────────────────────────────────
  // 3. ACTIVITY Attribute (8)
  // ─────────────────────────────────────────────────────────────

  // 8. Последняя активность
  const rawSubject = activity?.SUBJECT?.trim() ?? "";
  const activityField: DealPreviewResolvedField = {
    id: "ACTIVITY_LAST",
    label: "Последняя активность",
    value: rawSubject || "–",
    rawValue: rawSubject,
    type: "string",
    excelValue: rawSubject || "–",
  };

  // ─────────────────────────────────────────────────────────────
  // 4. CURRENT DEAL CARD FIELDS (9 to 17)
  // ─────────────────────────────────────────────────────────────
  const cardFields: DealPreviewResolvedField[] = [];

  // 9. Тип сделки (TYPE_ID)
  const rawTypeId = deal.TYPE_ID ?? deal.typeId;
  const typeFieldMeta = fields?.find((f) => f.id === "TYPE_ID");
  const typeDisplay = resolveDealType(rawTypeId, dealTypeRegistry, typeFieldMeta);
  cardFields.push({
    id: "TYPE_ID",
    label: "Тип сделки",
    value: typeDisplay,
    rawValue: rawTypeId,
    type: "crm_status",
    excelValue: typeDisplay,
  });

  // 9. Тестирование образцов (UF_CRM_1790786438 current ONLY — never falls back to legacy marker)
  const rawTesting = deal[DEAL_TESTING_MARKER_CURRENT_FIELD_ID];
  const testingDisplay = resolveTestingMarker(rawTesting);
  cardFields.push({
    id: DEAL_TESTING_MARKER_CURRENT_FIELD_ID,
    label: "Тестирование образцов",
    value: testingDisplay,
    rawValue: rawTesting,
    type: "boolean",
    excelValue: testingDisplay,
  });

  // 10. Марка и объём поставки (UF_CRM_1779384164284)
  const rawMarkVolume = deal[DEAL_SAMPLE_MARK_VOLUME_FIELD_ID];
  const markVolumeDisplay = rawMarkVolume ? String(rawMarkVolume).trim() || "–" : "–";
  cardFields.push({
    id: DEAL_SAMPLE_MARK_VOLUME_FIELD_ID,
    label: "Марка и объём поставки",
    value: markVolumeDisplay,
    rawValue: rawMarkVolume,
    type: "string",
    excelValue: markVolumeDisplay,
  });

  // 11. Статус оплаты (UF_CRM_1584464068013)
  const rawPayStatus = deal[PAYMENT_STATUS_FIELD_ID];
  const payStatusDisplay = resolveEnumField(
    rawPayStatus,
    PAYMENT_STATUS_FIELD_ID,
    fields,
    PAYMENT_STATUS_ENUM_SEMANTICS
  );
  cardFields.push({
    id: PAYMENT_STATUS_FIELD_ID,
    label: "Статус оплаты",
    value: payStatusDisplay,
    rawValue: rawPayStatus,
    type: "enumeration",
    excelValue: payStatusDisplay,
  });

  // 12. Дата оплаты (UF_CRM_1584460062014)
  const rawPayDate = deal[DEAL_PAYMENT_DATE_FIELD_ID];
  const payDateParsed = resolveDateOnly(rawPayDate);
  cardFields.push({
    id: DEAL_PAYMENT_DATE_FIELD_ID,
    label: "Дата оплаты",
    value: payDateParsed.display,
    rawValue: rawPayDate,
    type: "date",
    excelValue: payDateParsed.date,
    excelNumFmt: NUMFMT.DATE,
    isDate: true,
  });

  // 13. Дата отгрузки (UF_CRM_1584459666824)
  const rawShipDate = deal[DEAL_SHIPMENT_DATE_FIELD_ID];
  const shipDateParsed = resolveDateOnly(rawShipDate);
  cardFields.push({
    id: DEAL_SHIPMENT_DATE_FIELD_ID,
    label: "Дата отгрузки",
    value: shipDateParsed.display,
    rawValue: rawShipDate,
    type: "date",
    excelValue: shipDateParsed.date,
    excelNumFmt: NUMFMT.DATE,
    isDate: true,
  });

  // 14. Тип доставки (UF_CRM_1584459858509)
  const rawDeliveryType = deal[DEAL_DELIVERY_TYPE_FIELD_ID];
  const deliveryTypeDisplay = resolveEnumField(
    rawDeliveryType,
    DEAL_DELIVERY_TYPE_FIELD_ID,
    fields,
    DELIVERY_TYPE_ENUM_SEMANTICS
  );
  cardFields.push({
    id: DEAL_DELIVERY_TYPE_FIELD_ID,
    label: "Тип доставки",
    value: deliveryTypeDisplay,
    rawValue: rawDeliveryType,
    type: "enumeration",
    excelValue: deliveryTypeDisplay,
  });

  // 15. Стоимость доставки (UF_CRM_1584463812262)
  const rawDeliveryCost = deal[DEAL_DELIVERY_COST_FIELD_ID];
  const deliveryCostParsed = resolveDeliveryCost(rawDeliveryCost);
  cardFields.push({
    id: DEAL_DELIVERY_COST_FIELD_ID,
    label: "Стоимость доставки",
    value: deliveryCostParsed.display,
    rawValue: rawDeliveryCost,
    type: "money",
    excelValue: deliveryCostParsed.numAmount,
    excelNumFmt: deliveryCostParsed.numAmount !== null ? getMoneyNumFmt(deliveryCostParsed.currency, true) : undefined,
    isMoney: deliveryCostParsed.numAmount !== null,
    currency: deliveryCostParsed.currency,
  });

  // 16. Адрес доставки (UF_CRM_1763542027)
  const rawDeliveryAddress = deal[DEAL_DELIVERY_ADDRESS_FIELD_ID];
  const deliveryAddressDisplay = resolveAddress(rawDeliveryAddress);
  cardFields.push({
    id: DEAL_DELIVERY_ADDRESS_FIELD_ID,
    label: "Адрес доставки",
    value: deliveryAddressDisplay,
    rawValue: rawDeliveryAddress,
    type: "address",
    excelValue: deliveryAddressDisplay,
  });

  return {
    dealTitle,
    dealId,
    companyId,
    companyTitle,
    bitrixUrl,
    companyBitrixUrl,
    mainFields,
    timelineFields,
    activityField,
    cardFields,
  };
}
