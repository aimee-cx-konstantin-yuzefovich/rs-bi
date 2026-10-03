// src/lib/deal-table-columns.ts
// ─────────────────────────────────────────────────────────────────────
// ONE canonical classification/splitting helper for Deal-table columns.
//
// The Deals table UI supports columns that are NOT real crm.deal.list
// fields. `fetchDeals()` previously derived its Bitrix `select` directly
// from `selectedColumns`, leaking virtual columns into the upstream request.
// This helper centralizes the split so the Bitrix Deal request receives
// ONLY real Deal CRM fields.
//
// Canonical classification (A/B — no prefix guessing):
// A. REAL Deal CRM fields → may enter `crm.deal.list select`
// B. CLIENT/ENRICHMENT virtual fields → must NEVER enter the upstream select
//
// Client-only families (resolved from client stores/enrichment endpoints):
// - SP_STAGE / SP_SENT_DATE / SP_RESULT / SP_SAMPLES — Smart Process
//   virtual columns (canonical data comes from /api/bitrix/smart-process-items);
// - ACTIVITY_LAST / ACTIVITY_NEXT — activity enrichment columns
//   (activities arrive via /api/bitrix/activities);
// - ALL synthetic Company enrichment columns (COMPANY_*), resolved
//   client-side from the companies dictionary (`companiesData`). The
//   upstream crm.deal.list does NOT return these columns; the single
//   exception is COMPANY_ID — a real Bitrix Deal field.
// ─────────────────────────────────────────────────────────────────────

/** Smart Process virtual Deal-table columns (client-side only). */
export const SMART_PROCESS_VIRTUAL_COLUMNS = [
  "SP_STAGE",
  "SP_SENT_DATE",
  "SP_RESULT",
  "SP_SAMPLES",
] as const;

export type SmartProcessVirtualColumn = (typeof SMART_PROCESS_VIRTUAL_COLUMNS)[number];

/** Activity enrichment virtual columns (client-side only). */
export const ACTIVITY_VIRTUAL_COLUMNS = ["ACTIVITY_LAST", "ACTIVITY_NEXT"] as const;

/**
 * The ONLY COMPANY_* column that is a real crm.deal.list field. Every other
 * COMPANY_* column is a synthetic Company-enrichment projection resolved
 * client-side from `companiesData` (Company responsible, Company industry,
 * COMPANY_UF_CRM_* mirrors, COMPANY_TITLE, …).
 */
export const UPSTREAM_COMPANY_DEAL_COLUMNS = ["COMPANY_ID"] as const;

/**
 * Truthful upstream eligibility for a Deal-table column.
 *
 * Structural family rule (not name-guessing): every COMPANY_* column is
 * client-enrichment EXCEPT the explicitly whitelisted real Deal fields in
 * UPSTREAM_COMPANY_DEAL_COLUMNS. SP_ and ACTIVITY_ families are always
 * client-only. Everything else is treated as a real Deal CRM field.
 */
export function isClientOnlyDealColumn(columnId: string): boolean {
  const col = columnId.trim();
  if (!col) return false;
  if (
    (SMART_PROCESS_VIRTUAL_COLUMNS as readonly string[]).includes(col) ||
    (ACTIVITY_VIRTUAL_COLUMNS as readonly string[]).includes(col)
  ) {
    return true;
  }
  if (col.startsWith("COMPANY_")) {
    return !(UPSTREAM_COMPANY_DEAL_COLUMNS as readonly string[]).includes(col);
  }
  return false;
}

export interface DealTableColumnSplit {
  /** Columns safe to send upstream as crm.deal.list `select` entries. */
  bitrixSelect: string[];
  /** Columns resolved client-side from enrichment/cache data. */
  clientOnlyColumns: string[];
}

/**
 * Deterministically splits the user-selected Deal-table columns into the
 * upstream Bitrix select and client-only virtual columns. Order is
 * preserved within each group; duplicates are not introduced.
 */
export function splitDealTableColumns(
  selectedColumns: readonly string[]
): DealTableColumnSplit {
  const bitrixSelect: string[] = [];
  const clientOnlyColumns: string[] = [];
  for (const col of selectedColumns) {
    if (isClientOnlyDealColumn(col)) {
      if (!clientOnlyColumns.includes(col)) clientOnlyColumns.push(col);
    } else if (col.trim()) {
      if (!bitrixSelect.includes(col)) bitrixSelect.push(col);
    }
  }
  return { bitrixSelect, clientOnlyColumns };
}
