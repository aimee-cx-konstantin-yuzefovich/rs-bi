/**
 * Deal-only normalization for the universal CRM response (crm.item.get entityTypeId: 2).
 */

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
