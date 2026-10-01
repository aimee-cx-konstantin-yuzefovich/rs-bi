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
  COMPANY_MARK_GEL_FIELD_ID,
  COMPANY_MARK_SOL_FIELD_ID,
  COMPANY_COMMENTS_PRODUCT_FIELD_ID,
  COMPANY_INN_FIELD_ID,
  COMPANY_REGION_FIELD_ID,
  COMPANY_TESTING_MARKER_FIELD_ID,
  COMPANY_HAS_DISCOVERED_CARD_CONTRACT,
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
    resolved.push(found ? found.VALUE : `Не классифицировано (${s})`);
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
    const isDateTime = (meta?.type ?? "").toLowerCase() === "datetime" || /[T ]\d{2}:\d{2}/.test(s);
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

// ─── THE strict current-card whitelist (ordered) ──────────────────────
// Order mirrors the approved Company card as closely as possible;
// Date Created / Date Modified close the card block. Legacy sample
// fields (§9 of the contract) are deliberately ABSENT — they remain in
// backend/canonical analytics only.

export const COMPANY_PREVIEW_CURRENT_FIELDS: readonly CompanyPreviewFieldDef[] = [
  {
    id: "ASSIGNED_BY_ID",
    label: "Ответственный",
    type: "user",
    resolve: (company, ctx) => {
      const raw = company.ASSIGNED_BY_ID;
      if (isSentinel(raw)) return null;
      const id = String(raw);
      return {
        id: "ASSIGNED_BY_ID",
        label: "Ответственный",
        value: resolveResponsibleDisplay(id, ctx.userNames, ctx.usersCoverage),
        rawValue: raw,
        type: "user",
        excelValue: resolveResponsibleDisplay(id, ctx.userNames, ctx.usersCoverage),
      };
    },
  },
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
  {
    id: "REVENUE",
    label: "Годовой оборот",
    type: "money",
    resolve: (company) => {
      const resolved = resolveMoneyRaw(company.REVENUE);
      return resolved
        ? {
            id: "REVENUE",
            label: "Годовой оборот",
            value: resolved.display,
            rawValue: company.REVENUE,
            type: "money",
            excelValue: resolved.excel,
            isMoney: resolved.excel !== null,
          }
        : null;
    },
  },
  {
    id: COMPANY_INN_FIELD_ID,
    label: "ИНН",
    type: "string",
    resolve: (company) => {
      const value = resolveStringRaw(company[COMPANY_INN_FIELD_ID]);
      return value
        ? { id: COMPANY_INN_FIELD_ID, label: "ИНН", value, rawValue: company[COMPANY_INN_FIELD_ID], type: "string", excelValue: value }
        : null;
    },
  },
  {
    id: COMPANY_REGION_FIELD_ID,
    label: "Регион",
    type: "string",
    resolve: (company) => {
      const value = resolveStringRaw(company[COMPANY_REGION_FIELD_ID]);
      return value
        ? { id: COMPANY_REGION_FIELD_ID, label: "Регион", value, rawValue: company[COMPANY_REGION_FIELD_ID], type: "string", excelValue: value }
        : null;
    },
  },
  {
    id: "COMPANY_TYPE",
    label: "Тип компании",
    type: "crm_status",
    resolve: (company, ctx) => {
      const raw = company.COMPANY_TYPE;
      const display = resolveEnumRaw(raw, fieldMeta("COMPANY_TYPE", ctx));
      return display
        ? { id: "COMPANY_TYPE", label: "Тип компании", value: display, rawValue: raw, type: "crm_status", excelValue: display }
        : null;
    },
  },
  {
    id: COMPANY_INDUSTRY_CURRENT_FIELD_ID,
    label: "Отрасль",
    type: "enumeration",
    resolve: (company, ctx) => {
      // ONLY the current approved field. Legacy INDUSTRY (crm_status) and
      // the retired «Отрасль (не использовать)» never override it.
      const raw = company[COMPANY_INDUSTRY_CURRENT_FIELD_ID];
      const display = resolveEnumRaw(raw, fieldMeta(COMPANY_INDUSTRY_CURRENT_FIELD_ID, ctx));
      return display
        ? {
            id: COMPANY_INDUSTRY_CURRENT_FIELD_ID,
            label: "Отрасль",
            value: display,
            rawValue: raw,
            type: "enumeration",
            excelValue: display,
          }
        : null;
    },
  },
  {
    id: COMPANY_DIRECTION_CURRENT_FIELD_ID,
    label: "Направление",
    type: "enumeration",
    resolve: (company, ctx) => {
      const raw = company[COMPANY_DIRECTION_CURRENT_FIELD_ID];
      const display = resolveEnumRaw(raw, fieldMeta(COMPANY_DIRECTION_CURRENT_FIELD_ID, ctx));
      return display
        ? {
            id: COMPANY_DIRECTION_CURRENT_FIELD_ID,
            label: "Направление",
            value: display,
            rawValue: raw,
            type: "enumeration",
            excelValue: display,
          }
        : null;
    },
  },
  {
    id: COMPANY_PRODUCT_TYPE_FIELD_ID,
    label: "Тип продукта",
    type: "enumeration",
    resolve: (company, ctx) => {
      const raw = company[COMPANY_PRODUCT_TYPE_FIELD_ID];
      const display = resolveEnumRaw(raw, fieldMeta(COMPANY_PRODUCT_TYPE_FIELD_ID, ctx));
      return display
        ? {
            id: COMPANY_PRODUCT_TYPE_FIELD_ID,
            label: "Тип продукта",
            value: display,
            rawValue: raw,
            type: "enumeration",
            excelValue: display,
          }
        : null;
    },
  },
  {
    id: COMPANY_MARK_GEL_FIELD_ID,
    label: "Используемая марка — ГЕЛЬ",
    type: "enumeration",
    resolve: (company, ctx) => {
      const raw = company[COMPANY_MARK_GEL_FIELD_ID];
      const display = resolveEnumRaw(raw, fieldMeta(COMPANY_MARK_GEL_FIELD_ID, ctx));
      return display
        ? {
            id: COMPANY_MARK_GEL_FIELD_ID,
            label: "Используемая марка — ГЕЛЬ",
            value: display,
            rawValue: raw,
            type: "enumeration",
            excelValue: display,
          }
        : null;
    },
  },
  {
    id: COMPANY_MARK_SOL_FIELD_ID,
    label: "Используемая марка — ЗОЛЬ",
    type: "enumeration",
    resolve: (company, ctx) => {
      const raw = company[COMPANY_MARK_SOL_FIELD_ID];
      const display = resolveEnumRaw(raw, fieldMeta(COMPANY_MARK_SOL_FIELD_ID, ctx));
      return display
        ? {
            id: COMPANY_MARK_SOL_FIELD_ID,
            label: "Используемая марка — ЗОЛЬ",
            value: display,
            rawValue: raw,
            type: "enumeration",
            excelValue: display,
          }
        : null;
    },
  },
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
  // «Тестирование образцов» Company marker — appended by the model builder
  // ONLY when the live-discovered ID exists (never guessed).
];

/** The Company testing marker definition (live-gated). */
const TESTING_MARKER_FIELD: CompanyPreviewFieldDef = {
  id: COMPANY_TESTING_MARKER_FIELD_ID ?? "__unverified_marker__",
  label: "Тестирование образцов",
  type: "boolean",
  resolve: (company) => {
    if (!COMPANY_TESTING_MARKER_FIELD_ID || !COMPANY_HAS_DISCOVERED_CARD_CONTRACT) return null;
    const display = resolveBoolRaw(company[COMPANY_TESTING_MARKER_FIELD_ID]) ?? "Нет";
    return {
      id: COMPANY_TESTING_MARKER_FIELD_ID,
      label: "Тестирование образцов",
      value: display,
      rawValue: company[COMPANY_TESTING_MARKER_FIELD_ID],
      type: "boolean",
      excelValue: display,
    };
  },
};

/**
 * Builds the ONE resolved Company Preview model consumed by both the UI
 * drawer and the Excel export. Only explicit current-card whitelist
 * fields can appear — never a generic UF_CRM dump.
 */
export function buildCompanyPreviewModel(
  company: Record<string, unknown>,
  options: {
    fields?: CompanyFieldMeta[];
    userNames?: Record<string, string>;
    usersCoverage?: DatasetCoverage | null;
  } = {}
): CompanyPreviewModel {
  const ctx: CompanyPreviewResolveContext = {
    fields: options.fields ?? [],
    userNames: options.userNames ?? {},
    usersCoverage: options.usersCoverage,
  };

  const defs = [...COMPANY_PREVIEW_CURRENT_FIELDS, TESTING_MARKER_FIELD];
  const fields: CompanyPreviewResolvedField[] = [];
  for (const def of defs) {
    const resolved = def.resolve(company, ctx);
    if (resolved) fields.push(resolved);
  }

  // Comments (general Company comment) — retained per user requirement.
  const commentsRaw = resolveStringRaw(company.COMMENTS, true);

  // Date Created / Date Modified — retained per user requirement.
  // Contract: DATE_CREATE/DATE_MODIFY display as DATE ONLY in the card
  // (existing regression contract: "formats Дата изменения as date only").
  const created = resolveDateRaw(company.DATE_CREATE, { id: "DATE_CREATE", type: "date" });
  const modified = resolveDateRaw(company.DATE_MODIFY, { id: "DATE_MODIFY", type: "date" });

  return {
    title: String(company.TITLE ?? "").trim() || "Без названия",
    companyId: String(company.ID ?? ""),
    fields,
    createdAt: created ? created.display : null,
    modifiedAt: modified ? modified.display : null,
    comments: commentsRaw,
  };
}

// ─── Legacy sample fields (kept for backward compatibility of existing
// tests/callers; NOT part of the current-card whitelist) ──────────────

export const COMPANY_SAMPLE_FIELDS = [
  { id: "UF_CRM_1764155817232", label: "Марка предоставленных образцов (ГЕЛЬ)" },
  { id: "UF_CRM_1764156004815", label: "Кол-во переданного образца (ГЕЛЬ) кг" },
  { id: "UF_CRM_1764155891815", label: "Марка предоставленных образцов (ЗОЛЬ)" },
  { id: "UF_CRM_1764156064272", label: "Кол-во переданного образца (ЗОЛЬ) л" },
  { id: "UF_CRM_1764156557536", label: "Дата передачи образцов" },
  { id: "UF_CRM_1764156593", label: "Результат испытаний" },
  { id: "COMMENTS", label: "Комментарий" },
] as const;

export interface PreviewField {
  id: string;
  label: string;
  value: string;
  /** CRM field type metadata — preserved through export so explicit type wins. */
  type?: string;
}

/**
 * @deprecated Phase D: legacy sample-field builder retained only for the
 * transitional company-browser sample block. The current-card section of
 * Company Preview uses buildCompanyPreviewModel.
 */
export function defaultSampleFields(
  company: Record<string, unknown>,
  fields: Array<{ id: string; title: string; type?: string; listValues?: Array<{ ID: string; VALUE: string }> }> = []
): PreviewField[] {
  const fieldMap = new Map(fields.map(f => [f.id, f]));
  return COMPANY_SAMPLE_FIELDS.map(({ id, label }) => {
    let raw = company[id] ?? company[`COMPANY_${id}`];
    if ((raw === undefined || raw === null || raw === "") && id === "COMMENTS") {
      raw = company.COMMENTS ?? company.comments ?? company.COMPANY_COMMENTS;
    }

    const meta = fieldMap.get(id) || fieldMap.get(`COMPANY_${id}`);
    const metaType = meta?.type?.toLowerCase();
    const explicitTypeIsNotDate =
      metaType !== undefined &&
      ["string", "text", "enumeration", "crm_status", "boolean", "char", "integer", "double", "money", "user", "file", "url"].includes(metaType);

    if ((id === "UF_CRM_1764156557536" || label.toLowerCase().includes("дата")) && !explicitTypeIsNotDate) {
      if (raw) {
        const d = parseStrictDate(String(raw));
        if (d) {
          return {
            id,
            label,
            value: d.toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit", year: "numeric" }),
            type: metaType,
          };
        }
      }
    }

    if (meta?.listValues && meta.listValues.length > 0 && raw !== undefined && raw !== null && raw !== "") {
      if (Array.isArray(raw)) {
        return {
          id,
          label,
          value: raw.map(v => meta.listValues?.find(lv => lv.ID === String(v))?.VALUE || String(v)).join(", "),
          type: metaType,
        };
      }
      const found = meta.listValues.find(lv => lv.ID === String(raw));
      if (found) {
        return { id, label, value: found.VALUE, type: metaType };
      }
    }

    const isBool = metaType === "boolean" || metaType === "char";
    const s = String(raw).trim();
    const isSentinel = !isBool && (raw === false || s.toLowerCase() === "false" || s.toLowerCase() === "null" || s.toLowerCase() === "undefined");
    const value = raw !== undefined && raw !== null && s !== "" && !isSentinel ? s : "–";
    return { id, label, value, type: metaType };
  });
}

/**
 * @deprecated Phase D: generic-field builder retained only for the
 * transitional company-browser previewFields path. The current-card
 * section of Company Preview uses buildCompanyPreviewModel — this
 * function must NOT be used for the drawer's current-card fields.
 */
export function defaultCompanyFields(
  company: Record<string, unknown>,
  userNames: Record<string, string> = {},
  fields: Array<{ id: string; title: string; type?: string }> = [],
  usersCoverage?: DatasetCoverage | null
): PreviewField[] {
  const fieldMap = new Map(fields.map(f => [f.id, f]));
  const typeOf = (id: string): string | undefined =>
    fieldMap.get(id)?.type || fieldMap.get(`COMPANY_${id}`)?.type;

  const out: PreviewField[] = [];

  if (company.ASSIGNED_BY_ID) {
    const id = String(company.ASSIGNED_BY_ID);
    out.push({
      id: "ASSIGNED_BY_ID",
      label: "Ответственный компании",
      value: resolveResponsibleDisplay(id, userNames, usersCoverage),
      type: "user",
    });
  }

  if (company.PHONE && String(company.PHONE).trim()) {
    out.push({ id: "PHONE", label: "Телефон", value: String(company.PHONE), type: "phone" });
  }

  if (company.EMAIL && String(company.EMAIL).trim()) {
    out.push({ id: "EMAIL", label: "Email", value: String(company.EMAIL), type: "email" });
  }

  if (company.DATE_CREATE && String(company.DATE_CREATE).trim()) {
    const d = parseStrictDate(String(company.DATE_CREATE));
    out.push({
      id: "DATE_CREATE",
      label: "Дата создания",
      value: d ? d.toLocaleDateString("ru-RU") : String(company.DATE_CREATE),
      type: "datetime",
    });
  }

  if (company.DATE_MODIFY && String(company.DATE_MODIFY).trim()) {
    const d = parseStrictDate(String(company.DATE_MODIFY));
    out.push({
      id: "DATE_MODIFY",
      label: "Дата изменения",
      value: d ? d.toLocaleDateString("ru-RU") : String(company.DATE_MODIFY),
      type: "datetime",
    });
  }

  const sampleFieldIds = new Set<string>(COMPANY_SAMPLE_FIELDS.map(f => f.id));
  sampleFieldIds.add("UF_CRM_1753187313314");
  sampleFieldIds.add("LAST_ACTIVITY_TIME");
  sampleFieldIds.add("LAST_ACTIVITY_BY");
  sampleFieldIds.add("COMMENTS");

  for (const [key, val] of Object.entries(company)) {
    if (key.startsWith("UF_CRM_") && !sampleFieldIds.has(key) && val !== null && val !== "" && val !== undefined) {
      const fType = typeOf(key)?.toLowerCase();
      const isBool = fType === "boolean" || fType === "char";
      const s = String(val).trim();
      const isSentinel = !isBool && (val === false || s.toLowerCase() === "false" || s.toLowerCase() === "null" || s.toLowerCase() === "undefined");
      if (!isSentinel) {
        out.push({
          id: key,
          label: key,
          value: typeof val === "object" ? JSON.stringify(val) : s,
          type: fType,
        });
      }
    }
  }

  return out;
}

/** Re-export for the Excel builder's native typing. */
export { NUMFMT };
