// src/lib/deal-table-columns.ts
// ─────────────────────────────────────────────────────────────────────
// ONE canonical classification/splitting helper for Deal-table columns.
//
// The Deals table UI supports columns that are NOT real crm.deal.list
// fields. `fetchDeals()` previously derived its Bitrix `select` directly
// from `selectedColumns`, leaking virtual columns into the upstream request.
// This helper centralizes the split so the Bitrix Deal request receives
// ONLY real Deal CRM fields (plus Bitrix-supported COMPANY_ prefixed
// selects, which the Deals route force-augments server-side).
//
// Client-only columns (never sent upstream):
// - SP_STAGE / SP_SENT_DATE / SP_RESULT / SP_SAMPLES — Smart Process
//   virtual columns (canonical data comes from /api/bitrix/smart-process-items);
// - ACTIVITY_LAST / ACTIVITY_NEXT — activity enrichment columns
//   (activities arrive via /api/bitrix/activities);
// - COMPANY_ASSIGNED_BY_ID-style enrichment is Company-backed via the
//   companies dictionary — but COMPANY_* prefixed selects are accepted by
//   crm.deal.list upstream, so they stay in the Bitrix select.
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

/** All columns that must never enter the upstream crm.deal.list select. */
const CLIENT_ONLY_COLUMN_SET: ReadonlySet<string> = new Set<string>([
  ...SMART_PROCESS_VIRTUAL_COLUMNS,
  ...ACTIVITY_VIRTUAL_COLUMNS,
]);

/** True when the column must never be sent to Bitrix as part of `select`. */
export function isClientOnlyDealColumn(columnId: string): boolean {
  return CLIENT_ONLY_COLUMN_SET.has(columnId);
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
    if (CLIENT_ONLY_COLUMN_SET.has(col)) {
      if (!clientOnlyColumns.includes(col)) clientOnlyColumns.push(col);
    } else if (col.trim()) {
      if (!bitrixSelect.includes(col)) bitrixSelect.push(col);
    }
  }
  return { bitrixSelect, clientOnlyColumns };
}
