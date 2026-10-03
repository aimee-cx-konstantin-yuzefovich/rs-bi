// src/lib/samples/smart-process-service.ts
// ─────────────────────────────────────────────────────────────────────
// ONE bulk server-side Smart Process read service (read-only).
//
// Pipeline:
//  1. fetch the complete relevant SP 1032 population via the existing
//     fail-closed `fetchSmartProcessSampleItems`;
//  2. resolve live Smart Process display metadata (stage directory);
//  3. build the minimal Deal → Company relation map needed by the EXISTING
//     adapter for fallback/conflict verification — bounded bulk reads of
//     ONLY the Deal IDs referenced by `parentId2` (no per-item requests);
//  4. adapt with the existing `adaptSmartProcessSampleEvidence`;
//  5. project to the canonical `SmartProcessItemView`;
//  6. return views + indexes.
//
// No adapter logic is reimplemented. All reads go through the existing
// fail-closed `fetchAllPages` transport seam (bitrixPost underneath:
// allowlist, SSRF protections). No CRM mutations.
// ─────────────────────────────────────────────────────────────────────

import {
  fetchAllPages,
  fetchFieldLabelMaps,
  fetchSampleDeals,
  fetchSmartProcessSampleItems,
  fetchSmartProcessStageDirectory,
  makeLabelResolver,
  type FieldLabelMaps,
} from "./bitrix-fetch";
import { adaptSmartProcessSampleEvidence } from "./adapters/smart-process";
import {
  buildSmartProcessItemViews,
  indexSmartProcessItemViews,
  type SmartProcessItemIndexes,
  type SmartProcessItemView,
} from "./smart-process-view";
import type { BitrixRow } from "./types";

export interface SmartProcessDomainLoad {
  views: SmartProcessItemView[];
  indexes: SmartProcessItemIndexes;
  stageDirectoryAvailable: boolean;
  /** Count of SP items on which the bulk Deal→Company map was consulted. */
  dealRelationMapSize: number;
}

/** Maximum referenced-Deal IDs per bounded crm.deal.list chunk. */
const DEAL_CHUNK_SIZE = 50;

/** Hard upper bound for chunks — exceeds this → explicit failure, no partial data. */
const MAX_DEAL_CHUNKS = 100;

/**
 * Builds the minimal Deal → Company map for EXACTLY the Deal IDs referenced
 * by Smart Process `parentId2`, using bounded bulk `crm.deal.list` chunks
 * with the documented IN filter syntax (verified live: `{"@ID": [..]}` —
 * uppercase; the lowercase `@id` variant is silently ignored by Bitrix).
 * Sequential chunks respect Bitrix REST limits (no request storms).
 * Fail-closed: any chunk failure or chunk-count overflow throws — the caller
 * never receives a silently incomplete relation map.
 */
export async function fetchDealCompanyMap(
  dealIds: readonly string[]
): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  if (dealIds.length === 0) return map;

  const unique = [...new Set(dealIds.map((id) => id.trim()).filter(Boolean))];
  const chunks: string[][] = [];
  for (let i = 0; i < unique.length; i += DEAL_CHUNK_SIZE) {
    chunks.push(unique.slice(i, i + DEAL_CHUNK_SIZE));
  }
  if (chunks.length > MAX_DEAL_CHUNKS) {
    throw new Error(
      `Smart Process Deal relation map exceeds ${MAX_DEAL_CHUNKS} bulk chunks (${unique.length} referenced deals) — refusing partial map`
    );
  }

  for (const chunk of chunks) {
    // Live-verified contract (T0): crm.deal.list accepts `filter: { "@ID": [...] }`
    // as the documented IN filter; response keys are ID / COMPANY_ID.
    const rows = await fetchAllPages(
      "crm.deal.list",
      {
        SELECT: ["ID", "COMPANY_ID"],
        FILTER: { "@ID": chunk },
        ORDER: { ID: "ASC" },
      },
      "ID"
    );
    for (const row of rows) {
      const id = String(row.ID ?? row.id ?? "").trim();
      const companyId = String(row.COMPANY_ID ?? row.company_id ?? "").trim();
      if (id && companyId && companyId !== "0") {
        map.set(id, companyId);
      }
    }
  }

  return map;
}

/**
 * Resolves Smart Process field label maps (grade enum dictionaries).
 * The SP view layer needs the discovered SP enum fields; non-fatal per the
 * broad Samples metadata contract.
 */
async function fetchSmartProcessLabelMaps(): Promise<FieldLabelMaps> {
  return fetchFieldLabelMaps();
}

export interface LoadSmartProcessItemViewsOptions {
  /**
   * Narrow to one company's items (Company Preview). Omit for the full
   * population (Deals table / previews shared seam).
   */
  companyId?: string;
}

/** Result of the ONE shared trustworthy company-scope candidate mechanism. */
export interface CompanyScopedSmartProcessCandidates {
  /** Requested Company ID (normalized positive-integer string). */
  companyId: string;
  /**
   * Deduplicated candidate SP rows that can factually belong to the target:
   * direct companyId === X, or exact parentId2 → a Deal of X. Relation
   * conflicts are NOT resolved here — the canonical adapter + complete
   * Deal→Company map decide attribution after adaptation.
   */
  rows: BitrixRow[];
  /**
   * Complete Deal → COMPANY_ID map for ALL Deal IDs referenced by the
   * candidates' parentId2 (including foreign-linked deals needed to detect
   * relation conflicts). Fail-closed: any chunk failure throws.
   */
  dealCompanyById: Map<string, string>;
  /** Company X's own Deal IDs (bounded bulk read; ≥1 chunk when non-empty). */
  companyDealIds: string[];
  /**
   * Raw Company X Deal rows already fetched for candidate determination —
   * reusable by scoped routes as the aggregate's Deal input (one scoped
   * deal read per request, never a duplicate).
   */
  companyDealRows: BitrixRow[];
}

/**
 * ONE shared trustworthy company-scope mechanism (used by BOTH
 * /api/bitrix/samples { companyId } and /api/bitrix/smart-process-items
 * { companyId }).
 *
 * Scope semantics (canonical attribution rules preserved):
 * - INCLUDE candidates: SP item with direct companyId = X; SP item with no
 *   direct company whose exact parentId2 points to a Deal of X.
 * - EXCLUDE (post-adaptation): relation-conflicted items (direct company ≠
 *   linked Deal company — detected via a COMPLETE Deal→Company map, never a
 *   scoped subset), orphans, and items attributed to other companies.
 *
 * Candidate acquisition is the bounded, correct fallback: the complete SP
 * population via existing fail-closed pagination, filtered in-memory. A
 * `crm.item.list` `@parentId2` IN-filter optimization is deliberately NOT
 * used: the filter contract has not been live-verified read-only, and an
 * unverified optimization must never trade correctness (the
 * fallback-by-Deal case is silently lost under a direct-company-only
 * filter). No per-item Deal requests; Deal relation reads are bounded bulk
 * chunks only.
 */
export async function collectCompanyScopedSmartProcessCandidates(
  companyId: string
): Promise<CompanyScopedSmartProcessCandidates> {
  const target = companyId.trim();
  if (!/^[1-9]\d*$/.test(target)) {
    throw new Error("companyId must be a positive integer string");
  }

  // 1. Target Company's Deal IDs via the existing bounded bulk seam
  //    (crm.deal.list, fixed SELECT, fail-closed pagination).
  const companyDeals = await fetchSampleDeals({ companyId: target });
  const companyDealIds: string[] = [];
  for (const deal of companyDeals) {
    const id = String(deal.ID ?? deal.id ?? "").trim();
    if (id && id !== "0") companyDealIds.push(id);
  }
  const companyDealIdSet = new Set(companyDealIds);

  // 2./3. SP candidates = direct-company rows ∪ exact parentId2 rows,
  //       deduplicated by process item ID.
  const spRows = await fetchSmartProcessSampleItems({});
  const seen = new Set<string>();
  const rows: BitrixRow[] = [];
  for (const row of spRows) {
    const itemId = String(row.id ?? row.ID ?? "").trim();
    if (!itemId || seen.has(itemId)) continue;
    const directCompany = String(row.companyId ?? row.COMPANY_ID ?? "").trim();
    const linkedDealId = String(row.parentId2 ?? "").trim();
    if (
      directCompany === target ||
      (linkedDealId && linkedDealId !== "0" && companyDealIdSet.has(linkedDealId))
    ) {
      seen.add(itemId);
      rows.push(row);
    }
  }

  // 4. COMPLETE Deal → Company map for ALL Deal IDs referenced by the
  //    candidates (including foreign-linked deals for conflict detection).
  const referencedDealIds = rows
    .map((row) => String(row.parentId2 ?? "").trim())
    .filter((id) => id && id !== "0");
  const dealCompanyById = await fetchDealCompanyMap(referencedDealIds);

  return { companyId: target, rows, dealCompanyById, companyDealIds, companyDealRows: companyDeals };
}

/**
 * ONE bulk read seam: complete SP population → canonical views + indexes.
 * Throws on any authoritative fetch failure (initial load must be explicit,
 * never an empty dataset masquerade).
 *
 * Scoped (`companyId`) loads go through the ONE shared trustworthy
 * company-scope mechanism: candidates = direct company ∪ exact parentId2 →
 * Deal of X, complete Deal→Company map before adaptation, and Company X's
 * population selected only AFTER adaptation/indexing (relation-conflicted
 * and orphan items are excluded from company attribution by the canonical
 * adapter + view projector).
 */
export async function loadSmartProcessItemViews(
  options: LoadSmartProcessItemViewsOptions = {}
): Promise<SmartProcessDomainLoad> {
  // 1. Candidate rows + complete Deal→Company map. Full scope: the existing
  //    fail-closed complete population (contract gate runs inside).
  //    Company scope: the shared company-scope mechanism (which runs the
  //    same gate through fetchSmartProcessSampleItems).
  let spRows: BitrixRow[];
  let prebuiltDealCompanyById: Map<string, string> | undefined;
  if (options.companyId) {
    const scoped = await collectCompanyScopedSmartProcessCandidates(options.companyId);
    spRows = scoped.rows;
    prebuiltDealCompanyById = scoped.dealCompanyById;
  } else {
    spRows = await fetchSmartProcessSampleItems({});
  }

  // 2. Live stage display directory (non-fatal; static fallback inside).
  const stageDirectory = await fetchSmartProcessStageDirectory();

  // 3. Minimal Deal → Company map for relation verification (full scope:
  //    bounded bulk chunks over the referenced Deal IDs; company scope: the
  //    complete prebuilt map from the shared mechanism).
  let referencedDealIds: string[] = [];
  let dealCompanyById: Map<string, string>;
  if (prebuiltDealCompanyById) {
    dealCompanyById = prebuiltDealCompanyById;
  } else {
    referencedDealIds = spRows
      .map((row: BitrixRow) => String(row.parentId2 ?? "").trim())
      .filter((id: string) => id && id !== "0");
    dealCompanyById = await fetchDealCompanyMap(referencedDealIds);
  }

  // 4. Adapt with the existing canonical adapter.
  const labelMaps = await fetchSmartProcessLabelMaps();
  const resolve = makeLabelResolver(labelMaps.labels);

  const evidenceUnits = spRows
    .map((row: BitrixRow) =>
      adaptSmartProcessSampleEvidence(row, resolve, { dealCompanyById })
    )
    .filter((u): u is NonNullable<typeof u> => u !== null);

  // 5./6. Project + index (byCompanyId excludes conflicts/orphans canonically).
  const views = buildSmartProcessItemViews(evidenceUnits, {
    liveStageLabels: stageDirectory.available ? stageDirectory.labels : undefined,
  });
  const indexes = indexSmartProcessItemViews(views);

  return {
    views,
    indexes,
    stageDirectoryAvailable: stageDirectory.available,
    dealRelationMapSize: dealCompanyById.size,
  };
}
