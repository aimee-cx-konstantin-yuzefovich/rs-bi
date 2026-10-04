// src/lib/samples-pipeline-diagnostics.ts
// ─────────────────────────────────────────────────────────────────────
// Samples pipeline runtime diagnostics (READ-ONLY, Phase D — second
// diagnostic patch). ONE fixed, sequential probe routine that isolates
// the FIRST authoritative failing layer of the real Samples pipeline in
// the deployed runtime, strictly BELOW the already-proven Smart Process
// transport layer (SMART_PROCESS_TRANSPORT_OK).
//
//   Probe A  fetchFieldLabelMaps()            — field metadata (Samples path)
//   Probe B  fetchSampleCompanies({})         — full-scope Companies loader
//   Probe C  fetchSampleDeals({})             — full-scope Deal loader
//   Probe D  fetchSmartProcessSampleItems({}) — SP helper as Samples consumes it
//   Probe E  fetchSmartProcessStageDirectory()— live stage directory (non-fatal)
//   Probe F  fetchDealCompanyMap(referenced)  — bounded bulk relation map
//   Probe G  buildSampleSummaries(...)        — canonical aggregation
//   Probe H  validateSamplesClientPayload()   — client response contract
//   Probe J  Commercial Funnel INPUT path     — exact CF selects + canonical engine
//
// Hard rules:
// - production helpers are IMPORTED and executed — no simplified fake
//   equivalents, no duplicated selects, no second parser, no duplicate
//   aggregation logic;
// - sequential stages: ordering isolates the first failing layer;
// - responses contain ONLY statuses, counts, booleans, sanitized
//   quality counters, and safe failure metadata
//   ({ method, httpStatus?, bitrixCode? }) — never company IDs/titles,
//   Deal IDs, SP item IDs, grades, quantities, comments, prices,
//   SampleSummary objects, labels, enum values, error_description, URLs,
//   or any credential material;
// - production retry semantics are reused exactly (the diagnostic
//   reflects the FINAL outcome after the existing bounded retries);
// - read-only Bitrix methods only (the underlying helpers already
//   restrict themselves to the transport allowlist);
// - fixed diagnostic routine, NOT a Bitrix proxy: no caller-supplied
//   parameters exist;
// - zero-summary aggregation is a legitimate PASS (truthful empty
//   dataset), never a failure.
// ─────────────────────────────────────────────────────────────────────

import { readBitrixFailureMeta, bitrixPost, type BitrixSafeErrorMeta } from "@/lib/bitrix";
import { isBitrixListInvariantError } from "@/lib/bitrix-list-invariant";
import {
  fetchAllPages,
  fetchFieldLabelMaps,
  fetchSampleCompanies,
  fetchSampleDeals,
  fetchSmartProcessSampleItems,
  fetchSmartProcessStageDirectory,
  makeLabelResolver,
  buildSmartProcessListParams,
} from "@/lib/samples/bitrix-fetch";
import { fetchDealCompanyMap } from "@/lib/samples/smart-process-service";
import { assertSmartProcessContractReady } from "@/lib/samples/smart-process-contract";
import {
  buildCanonicalSampleDomain,
  buildSampleSummaries,
  type SmartProcessQualityCounts,
} from "@/lib/samples/aggregate";
import { validateSamplesClientPayload, type SamplesClientContractRejection } from "@/lib/samples/client-contract";
import {
  COMMERCIAL_COMPANY_SELECT,
  COMMERCIAL_DEAL_SELECT,
  fetchUserDirectory,
} from "@/app/api/bitrix/commercial-funnel/route";
import { normalizeCompanies, normalizeDeals, applyCanonicalSampleDomain } from "@/lib/commercial-funnel/normalize";
import { fetchDealsActivities } from "@/lib/bitrix-activities";
import { SAMPLE_DATA_ISSUE_LABELS } from "@/lib/samples/constants";
import type { BitrixRow } from "@/lib/samples/types";
import type { CommercialCompany, CommercialDeal } from "@/lib/commercial-funnel/types";

// ─── Probe result contracts (safe output — nothing else is exposed) ───

/** Shared safe failure envelope from any transport/aggregation error. */
interface ProbeFailure {
  status: "FAIL";
  method?: string;
  httpStatus?: number;
  bitrixCode?: string;
}

export type FieldMetadataProbe =
  | { status: "PASS" | "DEGRADED"; labelCount: number; partial: boolean }
  | ProbeFailure
  | { status: "SKIPPED"; reason: string };

export type CountProbe = { status: "PASS"; count: number } | ProbeFailure | { status: "SKIPPED"; reason: string };

export type StageDirectoryProbe =
  | { status: "PASS" | "DEGRADED"; available: boolean; knownStageLabelCount: number }
  | { status: "SKIPPED"; reason: string };

/**
 * DIRECT FIRST-PAGE COMPARISON (Probe D pre-step): the EXACT raw production
 * `crm.item.list` request, issued immediately before the wrapped helper —
 * same method, same params (structurally shared via
 * `buildSmartProcessListParams`), same transport. Records ONLY anonymous
 * structure facts; never item identity. Purpose: prove
 * raw response structure → exact local invariant that rejects it.
 */
export interface SmartProcessFirstPageComparison {
  status: "PASS" | "FAIL";
  /** `result.items` is an array (official `crm.item.list` envelope). */
  itemsIsArray?: boolean;
  /** Number of rows on the first page (when envelope parsed). */
  itemCount?: number;
  /** Rows carrying a usable (non-empty) `id`. */
  rowsWithUsableId?: number;
  /** Duplicate first-page ID rows (anonymous count only). */
  duplicateIdCount?: number;
  /** Total Bitrix reported on the first page (when reported). */
  reportedTotal?: number | null;
  /** Whether the first page carried a `next` continuation token. */
  nextPresent?: boolean;
  method?: string;
  httpStatus?: number;
  bitrixCode?: string;
  // ─── Safe key-NAME casing facts (first row; never any VALUE) ───
  /** Own enumerable key count of the first row. */
  firstRowKeyCount?: number;
  /** The lowercase documented item key `id` is present. */
  firstRowHasIdKey?: boolean;
  /** The classic uppercase `ID` key is present. */
  firstRowHasUppercaseIdKey?: boolean;
  /**
   * Present key NAMES that are ID-like (among the documented casing
   * candidates) — names only, never values.
   */
  firstRowIdLikeKeys?: string[];
  /**
   * Present key NAMES that are NOT in the production select — the exact
   * structural anomaly signal. Names only, never values.
   */
  firstRowUnmatchedKeys?: string[];
}

/** Safe structured view of a local pagination invariant failure. */
export interface SmartProcessLocalInvariant {
  /** Safe invariant category (no identity data). */
  localInvariant: string;
  reportedTotal?: number;
  pageItemCount?: number;
  accumulatedUniqueCount?: number;
  duplicateCount?: number;
  missingIdCount?: number;
  start?: number;
  nextPresent?: boolean;
}

export type SmartProcessProbe =
  | { status: "PASS"; count: number }
  | ({ status: "FAIL" } & ProbeFailure & {
      firstPage?: SmartProcessFirstPageComparison;
      localInvariant?: SmartProcessLocalInvariant;
    })
  | { status: "SKIPPED"; reason: string };

export type DealCompanyMapProbe =
  | { status: "PASS"; referencedDealCount: number; resolvedRelationCount: number }
  | ProbeFailure
  | { status: "SKIPPED"; reason: string };

export type AggregationProbe =
  | {
      status: "PASS";
      summaryCount: number;
      orphanDealCount: number;
      qualityCounts: SmartProcessQualityCounts;
    }
  | ProbeFailure
  | { status: "SKIPPED"; reason: string };

export type ClientContractProbe =
  | { status: "PASS" }
  | { status: "FAIL"; reason: SamplesClientContractRejection }
  | { status: "SKIPPED"; reason: string };

export type CommercialFunnelInputProbe =
  | { status: "PASS"; companyCount: number; dealCount: number }
  | ProbeFailure
  | { status: "SKIPPED"; reason: "UPSTREAM_SAMPLES_FAILED" | "NOT_RUN" };

export interface SamplesPipelineDiagnosticsReport {
  success: boolean;
  probes: {
    fieldMetadata: FieldMetadataProbe;
    companies: CountProbe;
    deals: CountProbe;
    smartProcess: SmartProcessProbe;
    stageDirectory: StageDirectoryProbe;
    dealCompanyMap: DealCompanyMapProbe;
    aggregation: AggregationProbe;
    clientContract: ClientContractProbe;
    commercialFunnelInput: CommercialFunnelInputProbe;
  };
  diagnosis: SamplesPipelineDiagnosis;
}

export type SamplesPipelineDiagnosis =
  | "FIELDS_METADATA_FAILED"
  | "COMPANIES_FETCH_FAILED"
  | "DEALS_FETCH_FAILED"
  | "SMART_PROCESS_HELPER_FAILED"
  | "DEAL_COMPANY_MAP_FAILED"
  | "SAMPLES_AGGREGATION_FAILED"
  | "SAMPLES_RESPONSE_CONTRACT_FAILED"
  | "SAMPLES_HTTP_ROUTE_FAILED" // reserved: measured by live HTTP, not by this engine
  | "SAMPLES_CLIENT_STATE_FAILED" // reserved: measured by the client state harness
  | "COMMERCIAL_FUNNEL_INPUT_FAILED"
  | "SAMPLES_PIPELINE_OK"
  | "DIAGNOSTIC_INCOMPLETE";

/** Safe failure envelope from any thrown error (credential-free). */
function failProbe(method: string, error: unknown): ProbeFailure {
  const meta: BitrixSafeErrorMeta | null = readBitrixFailureMeta(error);
  return {
    status: "FAIL",
    method: meta?.method ?? method,
    ...(meta?.httpStatus !== undefined ? { httpStatus: meta.httpStatus } : {}),
    ...(meta?.bitrixCode !== undefined ? { bitrixCode: meta.bitrixCode } : {}),
  };
}

/**
 * Terminal state for any Samples-upstream failure: the downstream
 * Commercial Funnel input probe is explicitly SKIPPED with the fixed
 * reason (never silently NOT_RUN) and the report is diagnosed.
 */
function finishWithUpstreamSkip(
  probes: SamplesPipelineDiagnosticsReport["probes"]
): SamplesPipelineDiagnosticsReport {
  probes.commercialFunnelInput = { status: "SKIPPED", reason: "UPSTREAM_SAMPLES_FAILED" };
  return { success: true, probes, diagnosis: diagnoseSamplesPipeline(probes) };
}

/**
 * Runs the sequential read-only probe routine. Exported for focused
 * testing; the route handler stays thin. Throws only on unexpected
 * internal setup failure (before the probe matrix can be reported) —
 * probe failures are reported inside the matrix, never thrown.
 */
export async function runSamplesPipelineDiagnostics(): Promise<SamplesPipelineDiagnosticsReport> {
  const probes: SamplesPipelineDiagnosticsReport["probes"] = {
    fieldMetadata: { status: "SKIPPED", reason: "NOT_RUN" },
    companies: { status: "SKIPPED", reason: "NOT_RUN" },
    deals: { status: "SKIPPED", reason: "NOT_RUN" },
    smartProcess: { status: "SKIPPED", reason: "NOT_RUN" },
    stageDirectory: { status: "SKIPPED", reason: "NOT_RUN" },
    dealCompanyMap: { status: "SKIPPED", reason: "NOT_RUN" },
    aggregation: { status: "SKIPPED", reason: "NOT_RUN" },
    clientContract: { status: "SKIPPED", reason: "NOT_RUN" },
    commercialFunnelInput: { status: "SKIPPED", reason: "NOT_RUN" },
  };

  // ─── PROBE A: field metadata (same path as Samples) ───
  // Non-fatal by production contract: a partial/fallback result is
  // DEGRADED, not automatically FAIL.
  let fieldMetadata: Awaited<ReturnType<typeof fetchFieldLabelMaps>>;
  try {
    fieldMetadata = await fetchFieldLabelMaps();
    probes.fieldMetadata = {
      status: fieldMetadata.partial ? "DEGRADED" : "PASS",
      labelCount: Object.keys(fieldMetadata.labels).length,
      partial: Boolean(fieldMetadata.partial),
    };
  } catch (error) {
    probes.fieldMetadata = failProbe("crm.company.fields", error);
    return finishWithUpstreamSkip(probes);
  }

  // ─── PROBE B: full-scope sample Companies (production loader) ───
  let companies: BitrixRow[];
  try {
    companies = await fetchSampleCompanies({});
    probes.companies = { status: "PASS", count: companies.length };
  } catch (error) {
    probes.companies = failProbe("crm.company.list", error);
    return finishWithUpstreamSkip(probes);
  }

  // ─── PROBE C: full-scope sample Deals (production loader) ───
  let deals: BitrixRow[];
  try {
    deals = await fetchSampleDeals({});
    probes.deals = { status: "PASS", count: deals.length };
  } catch (error) {
    probes.deals = failProbe("crm.deal.list", error);
    return finishWithUpstreamSkip(probes);
  }

  // ─── PROBE D: SP items via the EXACT Samples helper ───
  // (Includes the real fail-closed contract gate the route consumes.)
  //
  // Direct first-page comparison pre-step (task §3): issue the EXACT raw
  // production request once via the same transport, recording ONLY safe
  // anonymous structure facts, immediately before the wrapped helper runs.
  // Purpose: prove raw response structure → exact local invariant that
  // rejects it, in one report. Parameters are structurally shared with the
  // production helper via buildSmartProcessListParams — no parameter delta
  // is possible. When the helper fails because of a LOCAL pagination
  // invariant (BitrixListInvariantError), the safe category and anonymous
  // counts are attached (localInvariant); all other errors keep the
  // existing failProbe shape. Never item IDs/titles/UF values/URLs.
  let smartProcessItems: BitrixRow[];
  try {
    assertSmartProcessContractReady();
    let firstPage: SmartProcessFirstPageComparison | undefined;
    try {
      const rawPage = await bitrixPost<{
        result?: unknown;
        total?: unknown;
        next?: unknown;
      }>("crm.item.list", { ...buildSmartProcessListParams({}), start: 0 });
      const rawResult = rawPage?.result;
      const items = Array.isArray(rawResult)
        ? rawResult
        : rawResult !== null &&
          rawResult !== undefined &&
          typeof rawResult === "object" &&
          Array.isArray((rawResult as { items?: unknown }).items)
        ? ((rawResult as { items: unknown[] }).items)
        : undefined;
      let rowsWithUsableId = 0;
      const seenIds = new Set<string>();
      let duplicateIdCount = 0;
      if (items) {
        for (const row of items) {
          const rawId =
            row !== null && typeof row === "object"
              ? (row as { id?: unknown; ID?: unknown }).id ??
                (row as { id?: unknown; ID?: unknown }).ID
              : undefined;
          const id = rawId === undefined || rawId === null ? "" : String(rawId).trim();
          if (id === "") continue;
          rowsWithUsableId++;
          if (seenIds.has(id)) {
            duplicateIdCount++;
            continue;
          }
          seenIds.add(id);
        }
      }
      const parsedTotal =
        rawPage?.total === undefined || rawPage?.total === null
          ? null
          : Number(rawPage.total);
      // Safe key-NAME casing facts from the first row (never any value):
      // identifies the exact structural delta between the raw response and
      // the documented `id`/`ID` keys when rowsWithUsableId === 0.
      const firstRow =
        items && items.length > 0 && items[0] !== null && typeof items[0] === "object"
          ? (items[0] as Record<string, unknown>)
          : undefined;
      const firstRowKeys = firstRow ? Object.keys(firstRow) : [];
      const selectParams = buildSmartProcessListParams({});
      const selectList = Array.isArray(selectParams.select) ? selectParams.select : [];
      const idLikeKeys = firstRowKeys.filter((k) =>
        ["id", "ID", "Id", "iD"].includes(k)
      );
      const unmatchedKeys = firstRowKeys.filter(
        (k) => !selectList.includes(k)
      );
      firstPage = {
        status: "PASS",
        itemsIsArray: Array.isArray(items),
        itemCount: items ? items.length : undefined,
        rowsWithUsableId,
        duplicateIdCount,
        reportedTotal:
          parsedTotal !== null && Number.isFinite(parsedTotal) && parsedTotal >= 0
            ? parsedTotal
            : null,
        nextPresent: rawPage?.next !== undefined && rawPage?.next !== null,
        ...(firstRow
          ? {
              firstRowKeyCount: firstRowKeys.length,
              firstRowHasIdKey: firstRowKeys.includes("id"),
              firstRowHasUppercaseIdKey: firstRowKeys.includes("ID"),
              firstRowIdLikeKeys: idLikeKeys,
              firstRowUnmatchedKeys: unmatchedKeys,
            }
          : {}),
      };
    } catch (error) {
      const meta = readBitrixFailureMeta(error);
      firstPage = {
        status: "FAIL",
        method: meta?.method ?? "crm.item.list",
        ...(meta?.httpStatus !== undefined ? { httpStatus: meta.httpStatus } : {}),
        ...(meta?.bitrixCode !== undefined ? { bitrixCode: meta.bitrixCode } : {}),
      };
    }

    try {
      smartProcessItems = await fetchSmartProcessSampleItems({});
      probes.smartProcess = {
        status: "PASS",
        count: smartProcessItems.length,
        ...(firstPage ? { firstPage } : {}),
      };
    } catch (error) {
      const base = failProbe("crm.item.list", error);
      if (isBitrixListInvariantError(error)) {
        probes.smartProcess = {
          ...base,
          firstPage,
          localInvariant: {
            localInvariant: error.category,
            ...(error.reportedTotal !== undefined ? { reportedTotal: error.reportedTotal } : {}),
            ...(error.pageItemCount !== undefined ? { pageItemCount: error.pageItemCount } : {}),
            ...(error.accumulatedUniqueCount !== undefined
              ? { accumulatedUniqueCount: error.accumulatedUniqueCount }
              : {}),
            ...(error.duplicateCount !== undefined ? { duplicateCount: error.duplicateCount } : {}),
            ...(error.missingIdCount !== undefined ? { missingIdCount: error.missingIdCount } : {}),
            ...(error.start !== undefined ? { start: error.start } : {}),
            ...(error.nextPresent !== undefined ? { nextPresent: error.nextPresent } : {}),
          },
        };
      } else {
        probes.smartProcess = { ...base, ...(firstPage ? { firstPage } : {}) };
      }
      return finishWithUpstreamSkip(probes);
    }
  } catch (error) {
    // Contract-gate failure (fail-closed) — keep the existing shape.
    probes.smartProcess = failProbe("crm.item.list", error);
    return finishWithUpstreamSkip(probes);
  }

  // ─── PROBE E: live stage directory (non-fatal by production contract) ───
  const stageDirectory = await fetchSmartProcessStageDirectory();
  probes.stageDirectory = {
    status: stageDirectory.available ? "PASS" : "DEGRADED",
    available: stageDirectory.available,
    knownStageLabelCount: Object.keys(stageDirectory.labels).length,
  };

  // ─── PROBE F: canonical bounded-bulk Deal → Company relation map ───
  // Referenced Deal IDs are collected internally (never emitted); the
  // load itself is the canonical production helper (no N+1).
  let dealCompanyById: Map<string, string>;
  try {
    const referencedDealIds = smartProcessItems
      .map((row: BitrixRow) => String(row.parentId2 ?? "").trim())
      .filter((id: string) => id && id !== "0");
    dealCompanyById = await fetchDealCompanyMap(referencedDealIds);
    probes.dealCompanyMap = {
      status: "PASS",
      referencedDealCount: referencedDealIds.length,
      resolvedRelationCount: dealCompanyById.size,
    };
  } catch (error) {
    probes.dealCompanyMap = failProbe("crm.deal.list", error);
    return finishWithUpstreamSkip(probes);
  }

  // ─── PROBE G: canonical aggregation (exact full-scope production call) ───
  let summaries: ReturnType<typeof buildSampleSummaries>;
  try {
    summaries = buildSampleSummaries(companies, deals, smartProcessItems, {
      labelResolver: makeLabelResolver(fieldMetadata.labels),
      liveStageLabels: stageDirectory.available ? stageDirectory.labels : undefined,
      // Full-scope production semantics: no authoritativeDealCompanyById,
      // no allowedCompanyIds — byte-identical options to the route.
    });
    // Zero summaries is a legitimate PASS (truthful complete empty dataset).
    probes.aggregation = {
      status: "PASS",
      summaryCount: summaries.summaries.length,
      orphanDealCount: summaries.orphanDeals.length,
      qualityCounts: summaries.qualityCounts,
    };
  } catch (error) {
    // Safe internal stage + safe error category only — never the payload.
    const meta = readBitrixFailureMeta(error);
    probes.aggregation = {
      status: "FAIL",
      method: meta?.method ?? "buildSampleSummaries",
      ...(meta?.httpStatus !== undefined ? { httpStatus: meta.httpStatus } : {}),
      ...(meta?.bitrixCode !== undefined ? { bitrixCode: meta.bitrixCode } : {}),
    };
    return finishWithUpstreamSkip(probes);
  }

  // ─── PROBE H: client response contract (the ONE shared parser) ───
  // Assemble the exact response shape the real route returns, run the
  // shared validator over it, and NEVER serialize the payload itself.
  const samplesRoutePayload = {
    success: true,
    samples: summaries.summaries,
    total: summaries.summaries.length,
    orphanDealCount: summaries.orphanDeals.length,
    metadataPartial: Boolean(fieldMetadata.partial),
    smartProcess: { qualityCounts: summaries.qualityCounts },
    meta: { statusLabels: fieldMetadata.labels },
    issueLabels: SAMPLE_DATA_ISSUE_LABELS,
  };
  const contract = validateSamplesClientPayload(samplesRoutePayload);
  if (!contract.ok) {
    probes.clientContract = { status: "FAIL", reason: contract.reason };
    return finishWithUpstreamSkip(probes);
  }
  probes.clientContract = { status: "PASS" };

  // ─── PROBE J: Commercial Funnel INPUT contract (downstream of Samples) ───
  // The real CF loader builds its analytical population independently of
  // the Samples HTTP response. This probe executes that EXACT production
  // input path (same selects, same activities, same user directory, same
  // canonical engine, same projection) and reports counts only.
  try {
    const [rawCompanies, rawDeals, userNames, fieldLabelMaps] = await Promise.all([
      fetchAllPages(
        "crm.company.list",
        { SELECT: COMMERCIAL_COMPANY_SELECT, ORDER: { ID: "ASC" } },
        "ID"
      ),
      fetchAllPages(
        "crm.deal.list",
        { SELECT: COMMERCIAL_DEAL_SELECT, ORDER: { ID: "ASC" } },
        "ID"
      ),
      fetchUserDirectory(),
      Promise.resolve(fieldMetadata),
    ]);
    const dealIds = rawDeals
      .map((d) => String(d.ID || d.id || "").trim())
      .filter((id) => /^\d+$/.test(id));
    const activitiesResult = await fetchDealsActivities(dealIds);
    const labels = fieldLabelMaps.labels;

    const normalizedDeals: CommercialDeal[] = normalizeDeals(rawDeals, {
      userNames,
      statusLabels: labels,
      activities: activitiesResult.byDealId,
    });
    const normalizedCompanies: CommercialCompany[] = normalizeCompanies(
      rawCompanies,
      normalizedDeals,
      { userNames, statusLabels: labels }
    );
    const sampleDomain = buildCanonicalSampleDomain(
      rawCompanies,
      rawDeals,
      smartProcessItems,
      { labelResolver: makeLabelResolver(labels) }
    );
    const companiesWithSamples = applyCanonicalSampleDomain(
      normalizedCompanies,
      sampleDomain,
      { userNames, statusLabels: labels }
    );

    probes.commercialFunnelInput = {
      status: "PASS",
      companyCount: companiesWithSamples.length,
      dealCount: normalizedDeals.length,
    };
  } catch (error) {
    probes.commercialFunnelInput = failProbe("commercial-funnel-input", error);
  }

  return { success: true, probes, diagnosis: diagnoseSamplesPipeline(probes) };
}

/**
 * ONE small server-side interpretation derived ONLY from probe states —
 * first authoritative failing layer, measured facts, never speculative
 * prose. Pure function for exhaustive testing.
 */
export function diagnoseSamplesPipeline(
  probes: SamplesPipelineDiagnosticsReport["probes"]
): SamplesPipelineDiagnosis {
  const { fieldMetadata, companies, deals, smartProcess, dealCompanyMap, aggregation, clientContract, commercialFunnelInput } = probes;

  if (fieldMetadata.status === "FAIL") return "FIELDS_METADATA_FAILED";
  if (fieldMetadata.status === "SKIPPED") return "DIAGNOSTIC_INCOMPLETE";

  if (companies.status === "FAIL") return "COMPANIES_FETCH_FAILED";
  if (companies.status === "SKIPPED") return "DIAGNOSTIC_INCOMPLETE";

  if (deals.status === "FAIL") return "DEALS_FETCH_FAILED";
  if (deals.status === "SKIPPED") return "DIAGNOSTIC_INCOMPLETE";

  if (smartProcess.status === "FAIL") return "SMART_PROCESS_HELPER_FAILED";
  if (smartProcess.status === "SKIPPED") return "DIAGNOSTIC_INCOMPLETE";

  if (dealCompanyMap.status === "FAIL") return "DEAL_COMPANY_MAP_FAILED";
  if (dealCompanyMap.status === "SKIPPED") return "DIAGNOSTIC_INCOMPLETE";

  if (aggregation.status === "FAIL") return "SAMPLES_AGGREGATION_FAILED";
  if (aggregation.status === "SKIPPED") return "DIAGNOSTIC_INCOMPLETE";

  if (clientContract.status === "FAIL") return "SAMPLES_RESPONSE_CONTRACT_FAILED";
  if (clientContract.status === "SKIPPED") return "DIAGNOSTIC_INCOMPLETE";

  if (commercialFunnelInput.status === "FAIL") return "COMMERCIAL_FUNNEL_INPUT_FAILED";
  if (commercialFunnelInput.status === "SKIPPED") return "DIAGNOSTIC_INCOMPLETE";

  return "SAMPLES_PIPELINE_OK";
}
