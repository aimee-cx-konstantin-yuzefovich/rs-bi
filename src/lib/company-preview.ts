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

export function defaultCompanyFields(
  company: Record<string, unknown>,
  userNames: Record<string, string> = {}
): Array<{ id: string; label: string; value: string }> {
  const fields: Array<{ id: string; label: string; value: string }> = [];

  if (company.ASSIGNED_BY_ID) {
    const id = String(company.ASSIGNED_BY_ID);
    fields.push({
      id: "ASSIGNED_BY_ID",
      label: "Ответственный",
      value: userNames[id] || `ID ${id}`,
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

  for (const [key, val] of Object.entries(company)) {
    if (key.startsWith("UF_CRM_") && val !== null && val !== "" && val !== undefined) {
      fields.push({
        id: key,
        label: key,
        value: typeof val === "object" ? JSON.stringify(val) : String(val),
      });
    }
  }

  return fields;
}
