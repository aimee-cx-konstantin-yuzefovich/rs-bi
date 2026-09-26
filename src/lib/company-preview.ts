/** Company-only normalization for the universal CRM response. */
import { parseStrictDate } from "./scalar-safety";

export function normalizeCompanyPreview(item: Record<string, unknown>) {
  const company: Record<string, unknown> = {};
  const standardFields: Record<string, string> = {
    id: "ID", title: "TITLE", assignedById: "ASSIGNED_BY_ID",
    createdTime: "DATE_CREATE", updatedTime: "DATE_MODIFY",
    lastActivityTime: "LAST_ACTIVITY_TIME", lastActivityBy: "LAST_ACTIVITY_BY",
    revenue: "REVENUE", currencyId: "CURRENCY_ID", industry: "INDUSTRY",
    companyType: "COMPANY_TYPE", employees: "EMPLOYEES", comments: "COMMENTS",
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

export function isCompanyId(id: string): boolean {
  return /^[1-9]\d*$/.test(id) && Number.isSafeInteger(Number(id));
}

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
    // Explicit metadata wins: a string-typed field with a date-looking label
    // or value must stay text.
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

    const value = raw !== undefined && raw !== null && String(raw).trim() !== "" ? String(raw).trim() : "—";
    return { id, label, value, type: metaType };
  });
}

export function defaultCompanyFields(
  company: Record<string, unknown>,
  userNames: Record<string, string> = {},
  fields: Array<{ id: string; title: string; type?: string }> = []
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
      value: userNames[id] || "Неизвестный сотрудник",
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
      out.push({
        id: key,
        label: key,
        value: typeof val === "object" ? JSON.stringify(val) : String(val),
        type: typeOf(key),
      });
    }
  }

  return out;
}
