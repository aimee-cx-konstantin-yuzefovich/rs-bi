/** Company-only normalization for the universal CRM response. */
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

export function defaultSampleFields(
  company: Record<string, unknown>,
  fields: Array<{ id: string; title: string; listValues?: Array<{ ID: string; VALUE: string }> }> = []
): Array<{ id: string; label: string; value: string }> {
  const fieldMap = new Map(fields.map(f => [f.id, f]));
  return COMPANY_SAMPLE_FIELDS.map(({ id, label }) => {
    let raw = company[id] ?? company[`COMPANY_${id}`];
    if ((raw === undefined || raw === null || raw === "") && id === "COMMENTS") {
      raw = company.COMMENTS ?? company.comments ?? company.COMPANY_COMMENTS;
    }

    if (id === "UF_CRM_1764156557536" || label.toLowerCase().includes("дата")) {
      if (raw) {
        const d = new Date(String(raw));
        if (!isNaN(d.getTime())) {
          return {
            id,
            label,
            value: d.toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit", year: "numeric" }),
          };
        }
      }
    }

    const meta = fieldMap.get(id) || fieldMap.get(`COMPANY_${id}`);
    if (meta?.listValues && meta.listValues.length > 0 && raw !== undefined && raw !== null && raw !== "") {
      if (Array.isArray(raw)) {
        return {
          id,
          label,
          value: raw.map(v => meta.listValues?.find(lv => lv.ID === String(v))?.VALUE || String(v)).join(", "),
        };
      }
      const found = meta.listValues.find(lv => lv.ID === String(raw));
      if (found) {
        return { id, label, value: found.VALUE };
      }
    }

    const value = raw !== undefined && raw !== null && String(raw).trim() !== "" ? String(raw).trim() : "—";
    return { id, label, value };
  });
}

export function defaultCompanyFields(
  company: Record<string, unknown>,
  userNames: Record<string, string> = {}
): Array<{ id: string; label: string; value: string }> {
  const fields: Array<{ id: string; label: string; value: string }> = [];

  if (company.ASSIGNED_BY_ID) {
    const id = String(company.ASSIGNED_BY_ID);
    fields.push({
      id: "ASSIGNED_BY_ID",
      label: "Ответственный компании",
      value: userNames[id] || "Неизвестный сотрудник",
    });
  }

  if (company.PHONE && String(company.PHONE).trim()) {
    fields.push({ id: "PHONE", label: "Телефон", value: String(company.PHONE) });
  }

  if (company.EMAIL && String(company.EMAIL).trim()) {
    fields.push({ id: "EMAIL", label: "Email", value: String(company.EMAIL) });
  }

  if (company.DATE_CREATE && String(company.DATE_CREATE).trim()) {
    const d = new Date(String(company.DATE_CREATE));
    fields.push({
      id: "DATE_CREATE",
      label: "Дата создания",
      value: isNaN(d.getTime()) ? String(company.DATE_CREATE) : d.toLocaleDateString("ru-RU"),
    });
  }

  if (company.DATE_MODIFY && String(company.DATE_MODIFY).trim()) {
    const d = new Date(String(company.DATE_MODIFY));
    fields.push({
      id: "DATE_MODIFY",
      label: "Дата изменения",
      value: isNaN(d.getTime()) ? String(company.DATE_MODIFY) : d.toLocaleDateString("ru-RU"),
    });
  }

  const sampleFieldIds = new Set<string>(COMPANY_SAMPLE_FIELDS.map(f => f.id));
  sampleFieldIds.add("UF_CRM_1753187313314");
  sampleFieldIds.add("LAST_ACTIVITY_TIME");
  sampleFieldIds.add("LAST_ACTIVITY_BY");
  sampleFieldIds.add("COMMENTS");

  for (const [key, val] of Object.entries(company)) {
    if (key.startsWith("UF_CRM_") && !sampleFieldIds.has(key) && val !== null && val !== "" && val !== undefined) {
      fields.push({
        id: key,
        label: key,
        value: typeof val === "object" ? JSON.stringify(val) : String(val),
      });
    }
  }

  return fields;
}
