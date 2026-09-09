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
