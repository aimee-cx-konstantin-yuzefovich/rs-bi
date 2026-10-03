/**
 * Company-only normalization and preview field contract for RusSilica BI Terminal.
 *
 * Phase D — Company Preview Current-Card Contract:
 * - ONE strict whitelist (COMPANY_PREVIEW_CURRENT_FIELDS) mirroring the
 *   current approved Bitrix Company card; no generic UF_CRM_* iteration;
 * - ONE resolved business model (buildCompanyPreviewModel) consumed
 *   identically by the UI drawer and the Company Excel export;
 * - human-readable enum/status resolution via field metadata with the
 *   truthful «Не классифицировано (<id>)» fallback;
 * - legacy sample fields stay in backend/canonical analytics but never
 *   render as individual current-card rows;
 * - HTML entities in comments are decoded for plain-text display.
 */

import { parseStrictDate } from "./scalar-safety";
import {
  resolveResponsibleDisplay,
  type DatasetCoverage,
} from "./enrichment-coverage";
import {
  COMPANY_INDUSTRY_CURRENT_FIELD_ID,
  COMPANY_DIRECTION_CURRENT_FIELD_ID,
  COMPANY_PRODUCT_TYPE_FIELD_ID,
  COMPANY_GEL_GRADE_CURRENT_FIELD_ID,
  COMPANY_GEL_CONSUMPTION_CURRENT_FIELD_ID,
  COMPANY_SOL_GRADE_CURRENT_FIELD_ID,
  COMPANY_SOL_CONSUMPTION_CURRENT_FIELD_ID,
  COMPANY_ACTUAL_PRICES_FIELD_ID,
  COMPANY_COMMENTS_PRODUCT_FIELD_ID,
  COMPANY_INN_FIELD_ID,
  COMPANY_REGION_FIELD_ID,
  COMPANY_TESTING_MARKER_FIELD_ID,
  COMPANY_HAS_DISCOVERED_CARD_CONTRACT,
  UNCLASSIFIED_LABEL,
} from "./crm-constants";
import { NUMFMT } from "./excel-brand";

export function isCompanyId(id: string): boolean {
  return /^[1-9]\d*$/.test(id) && Number.isSafeInteger(Number(id));
}

/** Company-only normalization for the universal CRM response. */
export function normalizeCompanyPreview(item: Record<string, unknown>) {
  const company: Record<string, unknown> = {};
  const standardFields: Record<string, string> = {
    id: "ID", title: "TITLE", assignedById: "ASSIGNED_BY_ID",
    createdTime: "DATE_CREATE", updatedTime: "DATE_MODIFY",
    lastActivityTime: "LAST_ACTIVITY_TIME", lastActivityBy: "LAST_ACTIVITY_BY",
    revenue: "REVENUE", currencyId: "CURRENCY_ID", industry: "INDUSTRY",
    companyType: "COMPANY_TYPE", employees: "EMPLOYEES", comments: "COMMENTS",
    web: "WEB", companyId2: "COMPANY_ID",
    contactId: "CONTACT_ID", CONTACT_ID: "CONTACT_ID",
    contactName: "CONTACT_NAME", CONTACT_NAME: "CONTACT_NAME",
  };
  for (const [key, value] of Object.entries(item)) {
    if (key.startsWith("UF_CRM_")) company[key] = value;
    else if (standardFields[key]) company[standardFields[key]] = value;
  }
  company.ID = String(item.id);
  for (const kind of ["PHONE", "EMAIL"] as const) {
    const values = Array.isArray(item.fm) ? item.fm.flatMap((entry) => {
      if (!entry || typeof entry !== "object") return [];
      const field = entry as Record<string, unknown>;
      return field.typeId === kind && typeof field.value === "string" && field.value.trim()
        ? [field.value] : [];
    }) : [];
    const fallback = item[kind.toLowerCase()];
    company[kind] = values.length ? [...new Set(values)].join(", ")
      : typeof fallback === "string" ? fallback : "";
  }
  return company;
}

/**
 * Decodes common HTML entities for plain-text display (no HTML execution).
 * Applied to comment-like text fields so `&quot;ComposiTherm&quot;`
 * renders as `"ComposiTherm"`.
 */
export function decodeHtmlEntities(text: string): string {
  if (!text || !text.includes("&")) return text;
  const named: Record<string, string> = {
    amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ",
    laquo: "«", raquo: "»", mdash: "—", ndash: "–", hellip: "…",
    copy: "©", reg: "®", trade: "™", deg: "°", plusmn: "±",
    times: "×", divide: "÷", middot: "·", bull: "•", rsquo: "’",
    lsquo: "‘", ldquo: "“", rdquo: "”", eacute: "é", egrave: "è",
  };
  return text
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => {
      const code = parseInt(hex, 16);
      return Number.isSafeInteger(code) && code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : _;
    })
    .replace(/&#(\d+);/g, (_, dec) => {
      const code = parseInt(dec, 10);
      return Number.isSafeInteger(code) && code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : _;
    })
    .replace(/&([a-zA-Z][a-zA-Z0-9]*);/g, (match, name) => named[name] ?? match);
}

/** Field metadata entry used by resolvers. */
export interface CompanyFieldMeta {
  id: string;
  title?: string;
  type?: string;
  listValues?: Array<{ ID: string; VALUE: string }>;
}

/** A resolved current-card field. UI and Excel consume the same object. */
export interface CompanyPreviewResolvedField {
  id: string;
  label: string;
  /** Human-readable display value (UI). */
  value: string;
  /** Raw CRM value preserved for provenance. */
  rawValue: unknown;
  /** CRM field type metadata. */
  type?: string;
  /** Excel-native value (Date/number) when applicable; else same as value. */
  excelValue?: string | number | Date | null;
  /** Excel number format for date/numeric cells. */
  excelNumFmt?: string;
  isDate?: boolean;
  isMoney?: boolean;
}

export interface CompanyPreviewModel {
  title: string;
  companyId: string;
  /** Ordered current-card fields (the strict whitelist). */
  fields: CompanyPreviewResolvedField[];
  createdAt: string | null;
  modifiedAt: string | null;
  comments: string | null;
}

export type CompanyPreviewFieldDef = {
  id: string;
  label: string;
  type?: string;
  /** Resolves the raw company record to a resolved field. */
  resolve: (
    company: Record<string, unknown>,
    ctx: CompanyPreviewResolveContext
  ) => CompanyPreviewResolvedField | null;
};

export interface CompanyPreviewResolveContext {
  fields: CompanyFieldMeta[];
  userNames: Record<string, string>;
  usersCoverage?: DatasetCoverage | null;
  contactNames?: Record<string, string>;
}

// ─── Shared resolvers ─────────────────────────────────────────────────

function fieldMeta(id: string, ctx: CompanyPreviewResolveContext): CompanyFieldMeta | undefined {
  return (
    ctx.fields.find((f) => f.id === id) ||
    ctx.fields.find((f) => f.id === `COMPANY_${id}`)
  );
}

function isSentinel(raw: unknown): boolean {
  if (raw === null || raw === undefined) return true;
  if (typeof raw === "string") {
    const s = raw.trim().toLowerCase();
    return s === "" || s === "false" || s === "null" || s === "undefined" || s === "—";
  }
  if (raw === false) return true;
  return false;
}

/** Resolves an enum/status raw value via metadata; unknown IDs stay unclassified. */
function resolveEnumRaw(
  raw: unknown,
  meta?: CompanyFieldMeta
): string | null {
  if (isSentinel(raw)) return null;
  const values = Array.isArray(raw) ? raw : [raw];
  const resolved: string[] = [];
  for (const v of values) {
    if (isSentinel(v)) continue;
    const s = String(v).trim();
    const found = meta?.listValues?.find((lv) => lv.ID === s);
    resolved.push(found ? found.VALUE : UNCLASSIFIED_LABEL);
  }
  return resolved.length > 0 ? resolved.join(", ") : null;
}

/** Boolean/char → Да/Нет. */
function resolveBoolRaw(raw: unknown): string | null {
  if (raw === null || raw === undefined || raw === "") return null;
  const s = String(raw).trim().toLowerCase();
  if (raw === true || raw === "Y" || raw === "1" || raw === 1 || s === "true" || s === "y" || s === "да") return "Да";
  if (raw === false || raw === "N" || raw === "0" || raw === 0 || s === "false" || s === "n" || s === "нет") return "Нет";
  return Array.isArray(raw) ? (raw.length > 0 ? "Да" : null) : s.length > 0 ? "Да" : null;
}

/** Date/datetime → deterministic RU display + native Excel Date. */
function resolveDateRaw(
  raw: unknown,
  meta?: CompanyFieldMeta
): { display: string; excel: Date | null } | null {
  if (isSentinel(raw)) return null;
  const s = String(raw).trim();
  const d = parseStrictDate(s);
  if (d && !isNaN(d.getTime())) {
    // Explicit field type metadata wins over the raw-string time heuristic —
    // a whitelist card field declared as «date» renders date-only regardless
    // of datetime suffixes in the raw CRM value.
    const declaredType = (meta?.type ?? "").toLowerCase();
    const isDateTime = declaredType
      ? declaredType === "datetime"
      : /[T ]\d{2}:\d{2}/.test(s);
    const display = isDateTime
      ? `${d.toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "UTC" })} ${d.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit", timeZone: "UTC" })}`
      : d.toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "UTC" });
    return { display, excel: d };
  }
  return { display: s, excel: null };
}

/** Money ("30500|RUB" or number) → formatted display + native number. */
function resolveMoneyRaw(raw: unknown): { display: string; excel: number | null } | null {
  if (isSentinel(raw)) return null;
  const str = String(raw).trim();
  const [amountStr, currency] = str.split("|");
  const amount = Number(amountStr);
  if (Number.isFinite(amount)) {
    return {
      display: `${amount.toLocaleString("ru-RU", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}${currency ? ` ${currency}` : ""}`,
      excel: amount,
    };
  }
  return { display: str, excel: null };
}

/** Plain string (with HTML entity decoding for comment-like text). */
function resolveStringRaw(raw: unknown, decodeEntities = false): string | null {
  if (isSentinel(raw)) return null;
  let s: string;
  if (typeof raw === "object") {
    // Composite (e.g. address objects): join non-empty string parts.
    const parts = Object.values(raw as Record<string, unknown>).filter(
      (v): v is string => typeof v === "string" && v.trim().length > 0
    );
    s = parts.join(", ");
  } else {
    s = String(raw).trim();
  }
  if (!s) return null;
  return decodeEntities ? decodeHtmlEntities(s) : s;
}

/** Address resolution: formats Bitrix address objects or strings, stripping pipe delimiters. */
export function resolveAddressRaw(raw: unknown): string | null {
  if (isSentinel(raw)) return null;
  if (typeof raw === "string") {
    const trimmed = raw.trim();
    if (!trimmed) return null;
    if (trimmed.includes("|;|")) {
      const parts = trimmed.split("|;|").map((p) => p.trim()).filter((p) => p && !/^\d+$/.test(p));
      return parts.length > 0 ? parts.join(", ") : trimmed.split("|;|")[0].trim();
    }
    return trimmed;
  }
  if (typeof raw === "object") {
    const parts = Object.values(raw as Record<string, unknown>).filter(
      (v): v is string => typeof v === "string" && v.trim().length > 0
    );
    return parts.length > 0 ? parts.join(", ") : null;
  }
  return String(raw).trim() || null;
}

/** File field resolution: returns human-readable file title or link label. Never raw storage ID or opaque token. */
export function resolveFileRaw(raw: unknown): string | null {
  if (isSentinel(raw)) return null;
  if (Array.isArray(raw)) {
    const valid = raw.map(resolveFileRaw).filter(Boolean);
    return valid.length > 0 ? valid.join(", ") : null;
  }
  if (typeof raw === "object" && raw !== null) {
    const obj = raw as Record<string, unknown>;
    if (obj.name && typeof obj.name === "string" && obj.name.trim() !== "") {
      const name = obj.name.trim();
      if (/^\d+$/.test(name) || /^#\d+$/.test(name)) return "Файл прикреплен";
      return name;
    }
    if (
      obj.showUrl ||
      obj.downloadUrl ||
      obj.url ||
      obj.id !== undefined ||
      obj.ID !== undefined ||
      obj.fileId !== undefined ||
      obj.FILE_ID !== undefined
    ) {
      return "Файл прикреплен";
    }
    if (Object.keys(obj).length > 0) return "Файл прикреплен";
    return null;
  }
  const str = String(raw).trim();
  if (!str) return null;
  if (
    /^\d+$/.test(str) ||
    /^#\d+$/.test(str) ||
    str.startsWith("Файл #") ||
    str.startsWith("Файл №")
  ) {
    return "Файл прикреплен";
  }
  // Check if string is a safe human-readable filename with known extension (no path separators)
  const isFilename = /\.[a-zA-Z0-9]{2,5}$/i.test(str) && !str.includes("/") && !str.includes("\\");
  if (
    isFilename &&
    !/^(disk|file|storage|attach|token)[_-]/i.test(str) &&
    !/^[a-f0-9-]{32,}$/i.test(str)
  ) {
    return str;
  }
  // Safe URL with trailing filename
  if (/^https?:\/\//i.test(str)) {
    const pathname = str.split("?")[0];
    const match = pathname.match(/\/([^/]+\.[a-zA-Z0-9]{2,5})$/i);
    if (match && match[1]) {
      return decodeURIComponent(match[1]);
    }
    return "Файл прикреплен";
  }
  // Opaque token, storage ID, or unstructured ID string: fail-closed to friendly label
  return "Файл прикреплен";
}

/** Consumption quantity (annual) with explicit unit «тн/год». */
export function resolveConsumptionRaw(raw: unknown): { display: string; excel: number | string | null } | null {
  if (isSentinel(raw)) return null;
  if (Array.isArray(raw)) {
    const valid = raw.map(resolveConsumptionRaw).filter(Boolean);
    if (!valid.length) return null;
    return {
      display: valid.map((v) => v!.display).join(", "),
      excel: valid.map((v) => v!.display).join(", "),
    };
  }
  const str = String(raw).trim();
  if (!str) return null;
  const num = Number(str.replace(",", "."));
  if (Number.isFinite(num)) {
    return {
      display: `${num.toLocaleString("ru-RU")} тн/год`,
      excel: num,
    };
  }
  return {
    display: str.toLowerCase().includes("тн") ? str : `${str} тн/год`,
    excel: str,
  };
}

/** Contact display resolution: directory name > custom contact string > contact title. Never naked CRM relation ID or token. */
export function resolveContactRaw(
  company: Record<string, unknown>,
  ctx: CompanyPreviewResolveContext
): string | null {
  const customContact = resolveStringRaw(company.UF_CRM_1764858571);
  if (customContact) return customContact;
  const directName = resolveStringRaw(company.CONTACT_NAME ?? company.CONTACT_TITLE);
  if (directName) return directName;
  const contactId = company.CONTACT_ID ?? company.contactId;
  if (contactId && !isSentinel(contactId)) {
    const idStr = String(Array.isArray(contactId) ? contactId[0] : contactId).trim();
    if (ctx.contactNames && ctx.contactNames[idStr]) {
      return ctx.contactNames[idStr];
    }
    // Fail-closed: ANY value from contactId unresolvable in contactNames must NEVER leak raw token / ID
    return "Контакт не удалось загрузить";
  }
  return null;
}

/** Requisites resolution: banking details or INN. */
export function resolveRequisitesRaw(company: Record<string, unknown>): string | null {
  const inn = resolveStringRaw(company[COMPANY_INN_FIELD_ID]);
  const banking = resolveStringRaw(company.BANKING_DETAILS);
  if (inn && banking) return `ИНН ${inn}, ${banking}`;
  if (inn) return `ИНН ${inn}`;
  if (banking) return banking;
  return null;
}

/** Price fields resolution: formatted money from current field ONLY. Zero legacy fallback. */
export function resolvePricesRaw(company: Record<string, unknown>): { display: string; excel: unknown } | null {
  const rawMoney = company[COMPANY_ACTUAL_PRICES_FIELD_ID];
  if (!isSentinel(rawMoney)) {
    if (Array.isArray(rawMoney)) {
      const parts = rawMoney.map(resolveMoneyRaw).filter(Boolean);
      if (parts.length > 0) {
        return {
          display: parts.map((p) => p!.display).join(", "),
          excel: parts.map((p) => p!.display).join(", "),
        };
      }
    } else {
      const money = resolveMoneyRaw(rawMoney);
      if (money) return { display: money.display, excel: money.excel };
    }
  }
  return null;
}

// ─── THE strict current-card whitelist (ordered) ──────────────────────
// Canonical Company Preview field sequence, mirroring the current Bitrix
// Company card in content and order. Consumed identically by the UI drawer,
// the Company Excel export and the regression tests — never a second list.
//
// Section 1 «ИНФОРМАЦИЯ О КОМПАНИИ» (21 business fields, in card order):
//  1. Ответственный
//  2. Контакт
//  3. Сайт
//  4. Телефон
//  5. E-mail
//  6. Годовой оборот
//  7. Реквизиты
//  8. Документы контрагента
//  9. Адрес
// 10. Регион
// 11. Карточка компании
// 12. Тип компании
// 13. Отрасль (согл. список)
// 14. Направление (согл. список)
// 15. Используемая марка гель
// 16. Гель потребление (тн/год)
// 17. Используемая марка золь
// 18. Золь потребление (тн/год)
// 19. Комментарий по используемым продуктам
// 20. Фактические цены
// 21. Комментарий (general comments; long field)
//
// Section 2 «ИНФОРМАЦИЯ ОБ ОБРАЗЦАХ»:
// 22. Тестирование образцов (Company-card marker, MARKER_ONLY)
//
// Section 5 «СИСТЕМНАЯ ИНФОРМАЦИЯ»:
// 23. Дата создания
// 24. Дата изменения
//
// Empty fields are NEVER dropped: buildCompanyPreviewModel renders every
// whitelisted field; an unresolvable value becomes the truthful «—»
// placeholder (identical behaviour in UI and Excel).

export const TOTAL_APPROVED_FIELDS = 24;

/** Truthful empty-value placeholder shared by the UI drawer and Excel. */
export const EMPTY_FIELD_PLACEHOLDER = "—";

/** Field IDs of Section 1 (business card fields, canonical order). */
export const COMPANY_BUSINESS_FIELD_IDS: readonly string[] = [
  "ASSIGNED_BY_ID",
  "CONTACT",
  "WEB",
  "PHONE",
  "EMAIL",
  "REVENUE",
  COMPANY_INN_FIELD_ID,
  "UF_CRM_1782742600447",
  "ADDRESS",
  COMPANY_REGION_FIELD_ID,
  "UF_CRM_691EB8983DE7D",
  "COMPANY_TYPE",
  COMPANY_INDUSTRY_CURRENT_FIELD_ID,
  COMPANY_DIRECTION_CURRENT_FIELD_ID,
  COMPANY_GEL_GRADE_CURRENT_FIELD_ID,
  COMPANY_GEL_CONSUMPTION_CURRENT_FIELD_ID,
  COMPANY_SOL_GRADE_CURRENT_FIELD_ID,
  COMPANY_SOL_CONSUMPTION_CURRENT_FIELD_ID,
  COMPANY_COMMENTS_PRODUCT_FIELD_ID,
  COMPANY_ACTUAL_PRICES_FIELD_ID,
  "COMMENTS",
];

/** Field IDs of Section 5 (system information). */
export const COMPANY_SYSTEM_FIELD_IDS: readonly string[] = [
  "DATE_CREATE",
  "DATE_MODIFY",
];

/** The Section 2 marker field (Bitrix Company card, MARKER_ONLY). */
export const COMPANY_MARKER_FIELD_ID = COMPANY_TESTING_MARKER_FIELD_ID;

/**
 * ONE canonical partition of a resolved Company Preview model into the
 * drawer's fixed sections, driven exclusively by the canonical field-ID
 * exports above — never a hard-coded UF token and never a second list.
 * The SAME partition drives the UI drawer sections and the Company Excel
 * sections (UI/Excel parity invariant).
 */
export interface CompanyPreviewFieldPartition {
  /** Section 1 «Информация о компании» — canonical business-field order. */
  business: CompanyPreviewResolvedField[];
  /** Section 2 «Информация об образцах» — the Bitrix marker field only. */
  marker: CompanyPreviewResolvedField | null;
  /** Section «Системная информация» — DATE_CREATE / DATE_MODIFY. */
  system: CompanyPreviewResolvedField[];
}

export function partitionCompanyPreviewFields(
  model: Pick<CompanyPreviewModel, "fields">
): CompanyPreviewFieldPartition {
  const business: CompanyPreviewResolvedField[] = [];
  const system: CompanyPreviewResolvedField[] = [];
  let marker: CompanyPreviewResolvedField | null = null;

  const systemSet = new Set<string>(COMPANY_SYSTEM_FIELD_IDS);
  for (const field of model.fields) {
    if (systemSet.has(field.id)) {
      system.push(field);
    } else if (field.id === COMPANY_MARKER_FIELD_ID) {
      marker = field;
    } else if (COMPANY_BUSINESS_FIELD_IDS.includes(field.id)) {
      business.push(field);
    } else {
      // Defensive: the model is whitelist-built, so this cannot happen —
      // partition membership must never silently drop a resolved field.
      business.push(field);
    }
  }

  return { business, marker, system };
}

export const COMPANY_PREVIEW_CURRENT_FIELDS: readonly CompanyPreviewFieldDef[] = [
  // 1. Ответственный
  {
    id: "ASSIGNED_BY_ID",
    label: "Ответственный",
    type: "user",
    resolve: (company, ctx) => {
      const raw = company.ASSIGNED_BY_ID;
      if (isSentinel(raw)) return null;
      const id = String(raw);
      const display = resolveResponsibleDisplay(id, ctx.userNames, ctx.usersCoverage);
      return {
        id: "ASSIGNED_BY_ID",
        label: "Ответственный",
        value: display,
        rawValue: raw,
        type: "user",
        excelValue: display,
      };
    },
  },
  // 2. Контакт
  {
    id: "CONTACT",
    label: "Контакт",
    type: "contact",
    resolve: (company, ctx) => {
      const display = resolveContactRaw(company, ctx);
      return display
        ? {
            id: "CONTACT",
            label: "Контакт",
            value: display,
            rawValue: company.CONTACT_ID ?? company.UF_CRM_1764858571,
            type: "contact",
            excelValue: display,
          }
        : null;
    },
  },
  // 3. Сайт
  {
    id: "WEB",
    label: "Сайт",
    type: "url",
    resolve: (company) => {
      const value = resolveStringRaw(company.WEB);
      return value
        ? { id: "WEB", label: "Сайт", value, rawValue: company.WEB, type: "url", excelValue: value }
        : null;
    },
  },
  // 4. Телефон
  {
    id: "PHONE",
    label: "Телефон",
    type: "phone",
    resolve: (company) => {
      const value = resolveStringRaw(company.PHONE);
      return value
        ? { id: "PHONE", label: "Телефон", value, rawValue: company.PHONE, type: "phone", excelValue: value }
        : null;
    },
  },
  // 5. E-mail
  {
    id: "EMAIL",
    label: "E-mail",
    type: "email",
    resolve: (company) => {
      const value = resolveStringRaw(company.EMAIL);
      return value
        ? { id: "EMAIL", label: "E-mail", value, rawValue: company.EMAIL, type: "email", excelValue: value }
        : null;
    },
  },
  // 6. Годовой оборот
  {
    id: "REVENUE",
    label: "Годовой оборот",
    type: "money",
    resolve: (company) => {
      const resolved = resolveMoneyRaw(company.REVENUE ?? company.UF_CRM_1777324548);
      return resolved
        ? {
            id: "REVENUE",
            label: "Годовой оборот",
            value: resolved.display,
            rawValue: company.REVENUE ?? company.UF_CRM_1777324548,
            type: "money",
            excelValue: resolved.excel,
            isMoney: resolved.excel !== null,
          }
        : null;
    },
  },
  // 7. Реквизиты
  {
    id: COMPANY_INN_FIELD_ID,
    label: "Реквизиты",
    type: "string",
    resolve: (company) => {
      const value = resolveRequisitesRaw(company);
      return value
        ? {
            id: COMPANY_INN_FIELD_ID,
            label: "Реквизиты",
            value,
            rawValue: company.BANKING_DETAILS ?? company[COMPANY_INN_FIELD_ID],
            type: "string",
            excelValue: value,
          }
        : null;
    },
  },
  // 8. Документы контрагента
  {
    id: "UF_CRM_1782742600447",
    label: "Документы контрагента",
    type: "file",
    resolve: (company) => {
      const value = resolveFileRaw(company.UF_CRM_1782742600447);
      return value
        ? {
            id: "UF_CRM_1782742600447",
            label: "Документы контрагента",
            value,
            rawValue: company.UF_CRM_1782742600447,
            type: "file",
            excelValue: value,
          }
        : null;
    },
  },
  // 9. Адрес
  {
    id: "ADDRESS",
    label: "Адрес",
    type: "address",
    resolve: (company) => {
      const value = resolveAddressRaw(
        company.ADDRESS ?? company.REG_ADDRESS ?? company.UF_CRM_1763116930
      );
      return value
        ? {
            id: "ADDRESS",
            label: "Адрес",
            value,
            rawValue: company.ADDRESS ?? company.REG_ADDRESS ?? company.UF_CRM_1763116930,
            type: "address",
            excelValue: value,
          }
        : null;
    },
  },
  // 10. Регион
  {
    id: COMPANY_REGION_FIELD_ID,
    label: "Регион",
    type: "string",
    resolve: (company) => {
      const value = resolveStringRaw(company[COMPANY_REGION_FIELD_ID]);
      return value
        ? {
            id: COMPANY_REGION_FIELD_ID,
            label: "Регион",
            value,
            rawValue: company[COMPANY_REGION_FIELD_ID],
            type: "string",
            excelValue: value,
          }
        : null;
    },
  },
  // 11. Карточка компании
  {
    id: "UF_CRM_691EB8983DE7D",
    label: "Карточка компании",
    type: "file",
    resolve: (company) => {
      const value = resolveFileRaw(company.UF_CRM_691EB8983DE7D);
      return value
        ? {
            id: "UF_CRM_691EB8983DE7D",
            label: "Карточка компании",
            value,
            rawValue: company.UF_CRM_691EB8983DE7D,
            type: "file",
            excelValue: value,
          }
        : null;
    },
  },
  // 12. Тип компании
  {
    id: "COMPANY_TYPE",
    label: "Тип компании",
    type: "crm_status",
    resolve: (company, ctx) => {
      const raw = company.COMPANY_TYPE;
      const display = resolveEnumRaw(raw, fieldMeta("COMPANY_TYPE", ctx));
      return display
        ? {
            id: "COMPANY_TYPE",
            label: "Тип компании",
            value: display,
            rawValue: raw,
            type: "crm_status",
            excelValue: display,
          }
        : null;
    },
  },
  // 13. Отрасль (согл. список)
  {
    id: COMPANY_INDUSTRY_CURRENT_FIELD_ID,
    label: "Отрасль (согл. список)",
    type: "enumeration",
    resolve: (company, ctx) => {
      const raw = company[COMPANY_INDUSTRY_CURRENT_FIELD_ID];
      const display = resolveEnumRaw(raw, fieldMeta(COMPANY_INDUSTRY_CURRENT_FIELD_ID, ctx));
      return display
        ? {
            id: COMPANY_INDUSTRY_CURRENT_FIELD_ID,
            label: "Отрасль (согл. список)",
            value: display,
            rawValue: raw,
            type: "enumeration",
            excelValue: display,
          }
        : null;
    },
  },
  // 14. Направление (согл. список)
  {
    id: COMPANY_DIRECTION_CURRENT_FIELD_ID,
    label: "Направление (согл. список)",
    type: "enumeration",
    resolve: (company, ctx) => {
      const raw = company[COMPANY_DIRECTION_CURRENT_FIELD_ID];
      const display = resolveEnumRaw(raw, fieldMeta(COMPANY_DIRECTION_CURRENT_FIELD_ID, ctx));
      return display
        ? {
            id: COMPANY_DIRECTION_CURRENT_FIELD_ID,
            label: "Направление (согл. список)",
            value: display,
            rawValue: raw,
            type: "enumeration",
            excelValue: display,
          }
        : null;
    },
  },
  // 15. Используемая марка гель
  {
    id: COMPANY_GEL_GRADE_CURRENT_FIELD_ID,
    label: "Используемая марка гель",
    type: "string",
    resolve: (company) => {
      const raw = company[COMPANY_GEL_GRADE_CURRENT_FIELD_ID];
      if (isSentinel(raw)) return null;
      const display = Array.isArray(raw)
        ? raw.map((v) => resolveStringRaw(v)).filter(Boolean).join(", ")
        : resolveStringRaw(raw);
      return display
        ? {
            id: COMPANY_GEL_GRADE_CURRENT_FIELD_ID,
            label: "Используемая марка гель",
            value: display,
            rawValue: raw,
            type: "string",
            excelValue: display,
          }
        : null;
    },
  },
  // 16. Гель потребление (тн/год)
  {
    id: COMPANY_GEL_CONSUMPTION_CURRENT_FIELD_ID,
    label: "Гель потребление (тн/год)",
    type: "double",
    resolve: (company) => {
      const raw = company[COMPANY_GEL_CONSUMPTION_CURRENT_FIELD_ID];
      const res = resolveConsumptionRaw(raw);
      return res
        ? {
            id: COMPANY_GEL_CONSUMPTION_CURRENT_FIELD_ID,
            label: "Гель потребление (тн/год)",
            value: res.display,
            rawValue: raw,
            type: "double",
            excelValue: res.excel,
          }
        : null;
    },
  },
  // 17. Используемая марка золь
  {
    id: COMPANY_SOL_GRADE_CURRENT_FIELD_ID,
    label: "Используемая марка золь",
    type: "string",
    resolve: (company) => {
      const raw = company[COMPANY_SOL_GRADE_CURRENT_FIELD_ID];
      if (isSentinel(raw)) return null;
      const display = Array.isArray(raw)
        ? raw.map((v) => resolveStringRaw(v)).filter(Boolean).join(", ")
        : resolveStringRaw(raw);
      return display
        ? {
            id: COMPANY_SOL_GRADE_CURRENT_FIELD_ID,
            label: "Используемая марка золь",
            value: display,
            rawValue: raw,
            type: "string",
            excelValue: display,
          }
        : null;
    },
  },
  // 18. Золь потребление (тн/год)
  {
    id: COMPANY_SOL_CONSUMPTION_CURRENT_FIELD_ID,
    label: "Золь потребление (тн/год)",
    type: "double",
    resolve: (company) => {
      const raw = company[COMPANY_SOL_CONSUMPTION_CURRENT_FIELD_ID];
      const res = resolveConsumptionRaw(raw);
      return res
        ? {
            id: COMPANY_SOL_CONSUMPTION_CURRENT_FIELD_ID,
            label: "Золь потребление (тн/год)",
            value: res.display,
            rawValue: raw,
            type: "double",
            excelValue: res.excel,
          }
        : null;
    },
  },
  // 19. Комментарий по используемым продуктам
  {
    id: COMPANY_COMMENTS_PRODUCT_FIELD_ID,
    label: "Комментарий по используемым продуктам",
    type: "string",
    resolve: (company) => {
      const value = resolveStringRaw(company[COMPANY_COMMENTS_PRODUCT_FIELD_ID], true);
      return value
        ? {
            id: COMPANY_COMMENTS_PRODUCT_FIELD_ID,
            label: "Комментарий по используемым продуктам",
            value,
            rawValue: company[COMPANY_COMMENTS_PRODUCT_FIELD_ID],
            type: "string",
            excelValue: value,
          }
        : null;
    },
  },
  // 20. Фактические цены
  {
    id: COMPANY_ACTUAL_PRICES_FIELD_ID,
    label: "Фактические цены",
    type: "money",
    resolve: (company) => {
      const res = resolvePricesRaw(company);
      return res
        ? {
            id: COMPANY_ACTUAL_PRICES_FIELD_ID,
            label: "Фактические цены",
            value: res.display,
            rawValue: company[COMPANY_ACTUAL_PRICES_FIELD_ID],
            type: "money",
            excelValue: res.excel as any,
          }
        : null;
    },
  },
  // 21. Комментарий (general comments; long field)
  {
    id: "COMMENTS",
    label: "Комментарий",
    type: "string",
    resolve: (company) => {
      const value = resolveStringRaw(company.COMMENTS, true);
      return value
        ? {
            id: "COMMENTS",
            label: "Комментарий",
            value,
            rawValue: company.COMMENTS,
            type: "string",
            excelValue: value,
          }
        : null;
    },
  },
  // 22. Тестирование образцов (marker, MARKER_ONLY)
  {
    id: COMPANY_TESTING_MARKER_FIELD_ID,
    label: "Тестирование образцов",
    type: "boolean",
    resolve: (company) => {
      if (!COMPANY_TESTING_MARKER_FIELD_ID || !COMPANY_HAS_DISCOVERED_CARD_CONTRACT) return null;
      const display = resolveBoolRaw(company[COMPANY_TESTING_MARKER_FIELD_ID]);
      return display !== null
        ? {
            id: COMPANY_TESTING_MARKER_FIELD_ID,
            label: "Тестирование образцов",
            value: display,
            rawValue: company[COMPANY_TESTING_MARKER_FIELD_ID],
            type: "boolean",
            excelValue: display,
          }
        : null;
    },
  },
  // 23. Дата создания
  {
    id: "DATE_CREATE",
    label: "Дата создания",
    type: "date",
    resolve: (company) => {
      const res = resolveDateRaw(company.DATE_CREATE, { id: "DATE_CREATE", type: "date" });
      return res
        ? {
            id: "DATE_CREATE",
            label: "Дата создания",
            value: res.display,
            rawValue: company.DATE_CREATE,
            type: "date",
            excelValue: res.excel,
            isDate: true,
          }
        : null;
    },
  },
  // 24. Дата изменения
  {
    id: "DATE_MODIFY",
    label: "Дата изменения",
    type: "date",
    resolve: (company) => {
      const res = resolveDateRaw(company.DATE_MODIFY, { id: "DATE_MODIFY", type: "date" });
      return res
        ? {
            id: "DATE_MODIFY",
            label: "Дата изменения",
            value: res.display,
            rawValue: company.DATE_MODIFY,
            type: "date",
            excelValue: res.excel,
            isDate: true,
          }
        : null;
    },
  },
];

/**
 * Builds the ONE resolved Company Preview model consumed by both the UI
 * drawer and the Excel export. Only explicit current-card whitelist
 * fields can appear — never a generic UF_CRM dump.
 *
 * Empty-field invariant: every whitelisted field renders, even when its
 * resolved value is empty — an unresolvable field becomes the truthful
 * «—» placeholder (never dropped, never fabricated). UI and Excel inherit
 * this behaviour from the same resolved model.
 */
export function buildCompanyPreviewModel(
  company: Record<string, unknown>,
  options: {
    fields?: CompanyFieldMeta[];
    userNames?: Record<string, string>;
    usersCoverage?: DatasetCoverage | null;
    contactNames?: Record<string, string>;
  } = {}
): CompanyPreviewModel {
  const ctx: CompanyPreviewResolveContext = {
    fields: options.fields ?? [],
    userNames: options.userNames ?? {},
    usersCoverage: options.usersCoverage,
    contactNames: options.contactNames ?? {},
  };

  const fields: CompanyPreviewResolvedField[] = [];
  for (const def of COMPANY_PREVIEW_CURRENT_FIELDS) {
    const resolved = def.resolve(company, ctx);
    if (resolved) {
      fields.push(resolved);
    } else if (def.id === COMPANY_MARKER_FIELD_ID && !(COMPANY_TESTING_MARKER_FIELD_ID && COMPANY_HAS_DISCOVERED_CARD_CONTRACT)) {
      // Marker field without a verified discovered contract: the field is
      // not part of the verified live card — no placeholder is fabricated.
      continue;
    } else {
      // Truthful empty placeholder: field stays visible with «—».
      fields.push({
        id: def.id,
        label: def.label,
        value: EMPTY_FIELD_PLACEHOLDER,
        rawValue: null,
        type: def.type,
      });
    }
  }

  const createdField = fields.find((f) => f.id === "DATE_CREATE");
  const modifiedField = fields.find((f) => f.id === "DATE_MODIFY");
  const commentsField = fields.find((f) => f.id === "COMMENTS");

  return {
    title: String(company.TITLE ?? "").trim() || "Без названия",
    companyId: String(company.ID ?? ""),
    fields,
    createdAt: createdField && createdField.value !== EMPTY_FIELD_PLACEHOLDER ? createdField.value : null,
    modifiedAt: modifiedField && modifiedField.value !== EMPTY_FIELD_PLACEHOLDER ? modifiedField.value : null,
    comments: commentsField && commentsField.value !== EMPTY_FIELD_PLACEHOLDER ? commentsField.value : null,
  };
}

export interface PreviewField {
  id: string;
  label: string;
  value: string;
  /** CRM field type metadata — preserved through export so explicit type wins. */
  type?: string;
}

/** Re-export for the Excel builder's native typing. */
export { NUMFMT };
