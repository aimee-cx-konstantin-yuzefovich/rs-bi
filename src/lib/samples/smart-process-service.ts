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

/**
 * ONE bulk read seam: complete SP population → canonical views + indexes.
 * Throws on any authoritative fetch failure (initial load must be explicit,
 * never an empty dataset masquerade).
 */
export async function loadSmartProcessItemViews(
  options: LoadSmartProcessItemViewsOptions = {}
): Promise<SmartProcessDomainLoad> {
  // 1. Complete fail-closed SP population (also runs the contract gate).
  const spRows = await fetchSmartProcessSampleItems(
    options.companyId ? { companyId: options.companyId } : {}
  );

  // 2. Live stage display directory (non-fatal; static fallback inside).
  const stageDirectory = await fetchSmartProcessStageDirectory();

  // 3. Minimal Deal → Company map for relation verification.
  const referencedDealIds = spRows
    .map((row: BitrixRow) => String(row.parentId2 ?? "").trim())
    .filter((id: string) => id && id !== "0");
  const dealCompanyById = await fetchDealCompanyMap(referencedDealIds);

  // 4. Adapt with the existing canonical adapter.
  const labelMaps = await fetchSmartProcessLabelMaps();
  const resolve = makeLabelResolver(labelMaps.labels);

  const evidenceUnits = spRows
    .map((row: BitrixRow) =>
      adaptSmartProcessSampleEvidence(row, resolve, { dealCompanyById })
    )
    .filter((u): u is NonNullable<typeof u> => u !== null);

  // 5./6. Project + index.
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
