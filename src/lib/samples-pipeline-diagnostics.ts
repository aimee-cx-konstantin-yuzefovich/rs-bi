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
  buildSmartProcessListParamsWithSelect,
  buildSmartProcessPartitionSelect,
  SMART_PROCESS_SYSTEM_SELECT,
  SMART_PROCESS_REQUIRED_ROLES,
  SMART_PROCESS_ROLE_FIELD_IDS,
  SMART_PROCESS_CANDIDATE_PARTITION_ROLES,
} from "@/lib/samples/bitrix-fetch";
import { SMART_PROCESS_ENTITY_TYPE_ID } from "@/lib/samples/smart-process-contract";
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
      selectMatrix?: SmartProcessSelectMatrixReport;
    })
  | { status: "SKIPPED"; reason: string };

// ─── Select-interaction matrix (diagnostic-only; §2–§7) ────────────────
// Identifies exactly which SELECT field/combination makes Bitrix drop the
// documented `id` field on this portal, and measures whether a safe
// ID-bearing 2–3 partition read exists. STRICTLY READ-ONLY:
// crm.item.list / crm.item.fields only. Every probe reuses the exact
// production request shape (structurally shared via
// buildSmartProcessListParamsWithSelect) — the ONLY variable is `select`
// (plus the explicit Y/N diagnostic toggle on standard-only selects).
// Output carries ONLY anonymous counts / booleans / semantic role names —
// never item IDs, titles, UF field ids, field values, webhook material,
// or raw response bodies.

/** One select probe measured on the first `crm.item.list` page. */
export interface SelectProbeResult {
  /** Status: PASS = every row has a usable id; FAIL otherwise. */
  status: "PASS" | "FAIL";
  /** Row count of the probed page (envelope parsed). */
  itemCount: number;
  /** Total Bitrix reported on the page (null when absent). */
  reportedTotal: number | null;
  /** Rows carrying a usable `id`. */
  rowsWithId: number;
  /** Whether the page carried a `next` continuation token. */
  nextPresent: boolean;
  /** Envelope invalid / transport failure → safe failure metadata. */
  method?: string;
  httpStatus?: number;
  bitrixCode?: string;
  /** HTTP 200 but unusable envelope → INVALID_RESULT_ENVELOPE. */
  invalidEnvelope?: boolean;
}

/** One-field probe: A2 (system select) + exactly ONE extra role. */
export interface SelectSingleFieldProbe {
  role: string;
  result: SelectProbeResult;
}

/** Cumulative probe: SYSTEM + prefixes of the canonical role ordering. */
export interface SelectCumulativeProbe {
  roles: string[];
  result: SelectProbeResult;
}

/** One partition probe: full fail-closed pagination over a role subset. */
export interface SelectPartitionProbe {
  roles: string[];
  status: "PASS" | "FAIL";
  itemCount: number;
  reportedTotal: number | null;
  rowsWithId: number;
  nextPresent: boolean;
  /** Duplicate IDs remaining after canonical pagination (fetch dedups). */
  duplicateIdCount: number;
  /** Unique item IDs in this partition (anonymous count). */
  uniqueIdCount: number;
}

export interface SelectPartitionSetProbe {
  partitions: SelectPartitionProbe[];
  /** Whether all partitions resolved to the same exact unique ID set. */
  sameIdSets: boolean;
  /** Whether the partitions jointly cover every required role. */
  coversRequiredRoles: boolean;
  status: "PASS" | "FAIL";
}

/** §6: presence of each committed role field in live crm.item.fields. */
export interface SelectMetadataRolePresence {
  /** role → field exists in live metadata (boolean only). */
  roles: Record<string, boolean>;
  /** At least one committed custom field is missing live. */
  contractDrift: boolean;
  status: "PASS" | "FAIL";
  /** Safe failure metadata when the metadata read itself failed. */
  method?: string;
  httpStatus?: number;
  bitrixCode?: string;
}

/** §5: Y/N comparison — STANDARD fields only, never UF ids with "N". */
export interface SelectUfNamesComparison {
  result: SelectProbeResult;
}

export interface SmartProcessSelectMatrixReport {
  /** A1/A2/A3: documented id baseline → system select → + relation. */
  baseline: {
    A1: SelectProbeResult;
    A2: SelectProbeResult;
    A3: SelectProbeResult;
  };
  /** A2 + exactly one required role each. */
  singleField: SelectSingleFieldProbe[];
  /** Cumulative canonical prefixes; stops at the first failing prefix. */
  cumulative: SelectCumulativeProbe[];
  /** useOriginalUfNames Y/N comparison on selects WITHOUT custom fields. */
  ufNames: {
    N1: SelectUfNamesComparison;
    N2: SelectUfNamesComparison;
    /** Y on the same standard selects, for direct comparison. */
    Y1: SelectUfNamesComparison;
    Y2: SelectUfNamesComparison;
  };
  /** Live crm.item.fields role presence (booleans only). */
  metadataRoles: SelectMetadataRolePresence;
  /** §7 partition feasibility probes (only when baseline A3 passed). */
  partitions?: SelectPartitionSetProbe;
  /** §12 diagnostic-only star read (only when NO safe partition exists). */
  star?: SelectProbeResult & { requiredRolesPresentCount: number };
  /** ONE machine-readable verdict derived from the measured probes. */
  verdict: SelectMatrixVerdict;
}

export type SelectMatrixVerdict =
  | "SELECT_MATRIX_OK"
  | "SELECT_MATRIX_INCONCLUSIVE"
  | "NO_SAFE_LIST_PARTITION"
  | "USE_ORIGINAL_UF_NAMES_Y_BREAKS_ID"
  | "SMART_PROCESS_CONTRACT_DRIFT"
  | `OFFENDING_ROLE:${string}`;

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

// ─── Select-interaction matrix runner (diagnostic-only, read-only) ─────

/** Minimal documented id-only select (baseline A1). */
const ID_ONLY_SELECT: readonly string[] = ["id"];

/**
 * §12 diagnostic-only full-field select. NEVER used by any production
 * read path (guarded by a source-scan regression on bitrix-fetch.ts).
 */
const STAR_SELECT: readonly string[] = ["*"];

/** Canonical cumulative probe ordering (§4): relation first, then roles. */
const CUMULATIVE_ROLE_ORDER: readonly string[] = [
  "DEAL_RELATION",
  "SENT_DATE",
  "GRADE_GEL",
  "GRADE_SOL",
  "QTY_GEL",
  "QTY_SOL",
  "TEST_RESULT",
];

/**
 * Parses a raw `crm.item.list` response envelope into rows (official
 * `result.items` array or a top-level array). Same acceptance as the
 * existing first-page comparison pre-step.
 */
function parseListEnvelope(rawResult: unknown): unknown[] | undefined {
  if (Array.isArray(rawResult)) return rawResult;
  if (
    rawResult !== null &&
    rawResult !== undefined &&
    typeof rawResult === "object" &&
    Array.isArray((rawResult as { items?: unknown }).items)
  ) {
    return (rawResult as { items: unknown[] }).items;
  }
  return undefined;
}

/** Counts rows carrying a usable (non-empty) documented `id`. */
function countRowsWithUsableId(rows: readonly unknown[]): number {
  let count = 0;
  for (const row of rows) {
    const rawId =
      row !== null && typeof row === "object"
        ? (row as { id?: unknown; ID?: unknown }).id ?? (row as { id?: unknown; ID?: unknown }).ID
        : undefined;
    const id = rawId === undefined || rawId === null ? "" : String(rawId).trim();
    if (id !== "") count++;
  }
  return count;
}

/**
 * ONE first-page select probe with the exact production request shape —
 * the ONLY variables are `select` and the explicit diagnostic
 * useOriginalUfNames toggle. Records anonymous structure facts only.
 */
async function probeSelectFirstPage(
  select: readonly string[],
  useOriginalUfNames: "Y" | "N"
): Promise<SelectProbeResult> {
  try {
    const rawPage = await bitrixPost<{
      result?: unknown;
      total?: unknown;
      next?: unknown;
    }>(
      "crm.item.list",
      {
        ...buildSmartProcessListParamsWithSelect({}, select, { useOriginalUfNames }),
        start: 0,
      }
    );
    const items = parseListEnvelope(rawPage?.result);
    if (!items) {
      return {
        status: "FAIL",
        itemCount: 0,
        reportedTotal: null,
        rowsWithId: 0,
        nextPresent: false,
        invalidEnvelope: true,
      };
    }
    const parsedTotal =
      rawPage?.total === undefined || rawPage?.total === null ? null : Number(rawPage.total);
    const rowsWithId = countRowsWithUsableId(items);
    return {
      status: rowsWithId === items.length ? "PASS" : "FAIL",
      itemCount: items.length,
      reportedTotal:
        parsedTotal !== null && Number.isFinite(parsedTotal) && parsedTotal >= 0
          ? parsedTotal
          : null,
      rowsWithId,
      nextPresent: rawPage?.next !== undefined && rawPage?.next !== null,
    };
  } catch (error) {
    const meta = readBitrixFailureMeta(error);
    return {
      status: "FAIL",
      itemCount: 0,
      reportedTotal: null,
      rowsWithId: 0,
      nextPresent: false,
      ...(meta
        ? {
            method: meta.method,
            ...(meta.httpStatus !== undefined ? { httpStatus: meta.httpStatus } : {}),
            ...(meta.bitrixCode !== undefined ? { bitrixCode: meta.bitrixCode } : {}),
          }
        : {}),
    };
  }
}

/** §6: live crm.item.fields role presence — booleans only, never names. */
async function probeMetadataRolePresence(): Promise<SelectMetadataRolePresence> {
  try {
    const raw = await bitrixPost<{ result?: unknown }>("crm.item.fields", {
      entityTypeId: SMART_PROCESS_ENTITY_TYPE_ID,
      useOriginalUfNames: "Y",
    });
    const rawResult = raw?.result;
    const fields =
      rawResult && typeof rawResult === "object" && (rawResult as Record<string, unknown>).fields
        ? ((rawResult as Record<string, unknown>).fields as Record<string, unknown>)
        : rawResult;
    if (!fields || typeof fields !== "object") {
      return { roles: {}, contractDrift: true, status: "FAIL" };
    }
    const fieldIds = new Set(Object.keys(fields));
    const roles: Record<string, boolean> = {};
    let contractDrift = false;
    for (const role of SMART_PROCESS_REQUIRED_ROLES) {
      const fieldId = SMART_PROCESS_ROLE_FIELD_IDS[role];
      // Standard universal fields (e.g. parentId2) are documented contract
      // fields — verified against the official standard-field contract,
      // not live metadata listing only.
      const present = STANDARD_UNIVERSAL_ROLES.has(role) || fieldIds.has(fieldId);
      roles[role] = present;
      if (!present) contractDrift = true;
    }
    return { roles, contractDrift, status: contractDrift ? "FAIL" : "PASS" };
  } catch (error) {
    const meta = readBitrixFailureMeta(error);
    return {
      roles: {},
      contractDrift: false,
      status: "FAIL",
      ...(meta
        ? {
            method: meta.method,
            ...(meta.httpStatus !== undefined ? { httpStatus: meta.httpStatus } : {}),
            ...(meta.bitrixCode !== undefined ? { bitrixCode: meta.bitrixCode } : {}),
          }
        : {}),
    };
  }
}

/**
 * Roles whose field ids are documented standard Universal CRM fields
 * (relation field) — verified against the official standard-field
 * contract rather than the live UF metadata listing.
 */
const STANDARD_UNIVERSAL_ROLES: ReadonlySet<string> = new Set(["DEAL_RELATION"]);

/**
 * §7 partition feasibility: per candidate partition — one full fail-closed
 * canonical pagination read (fetchAllPages) plus one raw first-page probe
 * for envelope/total facts. ID sets collected for strict set comparison.
 */
async function probePartitions(): Promise<SelectPartitionSetProbe> {
  const partitions: SelectPartitionProbe[] = [];
  const idSets: Set<string>[] = [];
  let allPassed = true;

  for (const partition of SMART_PROCESS_CANDIDATE_PARTITION_ROLES) {
    const select = buildSmartProcessPartitionSelect(partition);
    try {
      const rows = await fetchAllPages("crm.item.list", buildSmartProcessListParamsWithSelect({}, select), "id");
      const uniqueIds = new Set(
        rows.map((row) => String(row.id ?? row.ID ?? "").trim()).filter((id) => id !== "")
      );
      idSets.push(uniqueIds);
      const firstPage = await probeSelectFirstPage(select, "Y");
      partitions.push({
        roles: [...partition.roles],
        status: firstPage.status,
        itemCount: firstPage.itemCount,
        reportedTotal: firstPage.reportedTotal,
        rowsWithId: firstPage.rowsWithId,
        nextPresent: firstPage.nextPresent,
        duplicateIdCount: 0, // fetchAllPages dedups by ID; duplicates never survive
        uniqueIdCount: uniqueIds.size,
      });
      if (firstPage.status !== "PASS") allPassed = false;
    } catch {
      allPassed = false;
      partitions.push({
        roles: [...partition.roles],
        status: "FAIL",
        itemCount: 0,
        reportedTotal: null,
        rowsWithId: 0,
        nextPresent: false,
        duplicateIdCount: 0,
        uniqueIdCount: 0,
      });
      idSets.push(new Set());
    }
  }

  let sameIdSets = idSets.length > 0;
  for (const set of idSets) {
    if (set.size !== idSets[0].size) {
      sameIdSets = false;
      break;
    }
    for (const id of set) {
      if (!idSets[0].has(id)) {
        sameIdSets = false;
        break;
      }
    }
    if (!sameIdSets) break;
  }

  const covered = new Set<string>();
  for (const partition of SMART_PROCESS_CANDIDATE_PARTITION_ROLES) {
    for (const role of partition.roles) covered.add(role);
  }
  const coversRequiredRoles = SMART_PROCESS_REQUIRED_ROLES.every((role) => covered.has(role));

  return {
    partitions,
    sameIdSets,
    coversRequiredRoles,
    status: allPassed && sameIdSets && coversRequiredRoles ? "PASS" : "FAIL",
  };
}

/**
 * Derives ONE machine-readable verdict from the measured probes (pure).
 * Never exposes raw field ids — role names only. Probe stages are run
 * conditionally by the runner (later stages only after earlier ones
 * pass), so absent stages here mean "not reached", never "passed".
 *
 * Precedence:
 *  1. live contract drift (committed field missing from metadata);
 *  2. useOriginalUfNames="Y" mode breaking STANDARD-field selects while
 *     "N" passes on the identical selects — the id drop is caused by the
 *     UF-name mode itself, not by any semantic role (measured live);
 *  3. system-select id drop (partitions cannot exist without it);
 *  4. one-field offender (relation, then any role) — per §11 a field that
 *     kills `id` alone makes the list-partition workaround impossible;
 *  5. transport/infrastructure failure (rows never arrived) — evidence
 *     quality, never an offender verdict;
 *  6. partition measurement — the workaround is viable ONLY when the
 *     measured partitions PASS (equal ID sets, coverage). A cumulative
 *     boundary in a combined select does NOT block remediation when the
 *     partitioned reads themselves preserve ids; the boundary detail
 *     remains visible in the cumulative[] report entries.
 */
export function deriveSelectMatrixVerdict(
  report: Omit<SmartProcessSelectMatrixReport, "verdict">
): SelectMatrixVerdict {
  const idDrop = (r: SelectProbeResult): boolean =>
    r.status === "FAIL" && r.itemCount > 0 && r.rowsWithId < r.itemCount;
  const transportFail = (r: SelectProbeResult): boolean =>
    r.status === "FAIL" && r.itemCount === 0;

  if (report.metadataRoles.contractDrift) return "SMART_PROCESS_CONTRACT_DRIFT";

  // Y-mode itself breaks standard-field id delivery while the identical
  // standard selects pass with "N" — no semantic role is involved, and no
  // select partitioning can bypass a mode-level id drop.
  const yModeBreaksStandardSelects =
    idDrop(report.ufNames.Y1.result) && report.ufNames.N1.result.status === "PASS";
  if (yModeBreaksStandardSelects) return "USE_ORIGINAL_UF_NAMES_Y_BREAKS_ID";

  if (idDrop(report.baseline.A2)) return "NO_SAFE_LIST_PARTITION";
  if (idDrop(report.baseline.A3)) return "OFFENDING_ROLE:DEAL_RELATION";

  for (const probe of report.singleField) {
    if (idDrop(probe.result)) return `OFFENDING_ROLE:${probe.role}`;
  }

  const transportFailed =
    transportFail(report.baseline.A1) ||
    transportFail(report.baseline.A2) ||
    transportFail(report.baseline.A3) ||
    report.singleField.some((probe) => transportFail(probe.result)) ||
    report.cumulative.some((probe) => transportFail(probe.result));
  if (transportFailed) return "SELECT_MATRIX_INCONCLUSIVE";

  if (!report.partitions || report.partitions.status !== "PASS") {
    return "NO_SAFE_LIST_PARTITION";
  }
  return "SELECT_MATRIX_OK";
}

/**
 * Runs the complete select-interaction matrix (§2–§7): baseline, one-field,
 * cumulative, Y/N standard-field comparison, live metadata role presence,
 * and partition feasibility. STRICTLY READ-ONLY — crm.item.list and
 * crm.item.fields only, exact production request shape, `select` as the
 * only variable. Bounded: one first-page request per select probe plus one
 * full canonical pagination per partition candidate. Output is safe by
 * construction (anonymous counts, booleans, semantic role names).
 *
 * §12 star read runs ONLY when the partition probes fail — diagnostic
 * evidence for NO_SAFE_LIST_PARTITION, never a production path.
 */
export async function runSmartProcessSelectMatrix(): Promise<SmartProcessSelectMatrixReport> {
  // ─── A. Baseline ───
  const A1 = await probeSelectFirstPage(ID_ONLY_SELECT, "Y");
  const A2 = await probeSelectFirstPage(SMART_PROCESS_SYSTEM_SELECT, "Y");
  const A3 = await probeSelectFirstPage(
    buildSmartProcessPartitionSelect({
      includeSystemSelect: true,
      roles: ["DEAL_RELATION"],
    }),
    "Y"
  );

  const systemSelectHealthy = A2.status === "PASS";
  const relationHealthy = A3.status === "PASS";

  // ─── B. One extra required field at a time (A2 + role) ───
  // Runs only when the plain system select still carries ids (otherwise
  // the interaction is already system-level).
  const singleField: SelectSingleFieldProbe[] = [];
  if (systemSelectHealthy) {
    for (const role of SMART_PROCESS_REQUIRED_ROLES) {
      singleField.push({
        role,
        result: await probeSelectFirstPage(
          buildSmartProcessPartitionSelect({ includeSystemSelect: true, roles: [role] }),
          "Y"
        ),
      });
    }
  }

  // ─── C. Cumulative canonical prefixes (stop at first failing boundary) ───
  const cumulative: SelectCumulativeProbe[] = [];
  if (relationHealthy) {
    const cumulativeRoles: string[] = [];
    for (const role of CUMULATIVE_ROLE_ORDER) {
      if (!SMART_PROCESS_REQUIRED_ROLES.includes(role)) continue;
      cumulativeRoles.push(role);
      const result = await probeSelectFirstPage(
        buildSmartProcessPartitionSelect({
          includeSystemSelect: true,
          roles: [...cumulativeRoles],
        }),
        "Y"
      );
      cumulative.push({ roles: [...cumulativeRoles], result });
      if (result.status === "FAIL" && result.rowsWithId < result.itemCount) break;
    }
  }

  // ─── N. useOriginalUfNames Y/N comparison (STANDARD selects only) ───
  const N1 = { result: await probeSelectFirstPage(ID_ONLY_SELECT, "N") };
  const N2 = { result: await probeSelectFirstPage(SMART_PROCESS_SYSTEM_SELECT, "N") };
  const Y1 = { result: await probeSelectFirstPage(ID_ONLY_SELECT, "Y") };
  const Y2 = { result: await probeSelectFirstPage(SMART_PROCESS_SYSTEM_SELECT, "Y") };

  // ─── §6. Live metadata role presence (booleans only) ───
  const metadataRoles = await probeMetadataRolePresence();

  const partial: Omit<SmartProcessSelectMatrixReport, "verdict"> = {
    baseline: { A1, A2, A3 },
    singleField,
    cumulative,
    ufNames: { N1, N2, Y1, Y2 },
    metadataRoles,
  };

  // ─── §7. Partition feasibility (skipped only for verdicts that make it
  // moot: contract drift, a single-field offender, or infrastructure
  // failure — §11 stops there). A system-select id drop already maps to
  // NO_SAFE_LIST_PARTITION; every other case reaches the partition probe. ───
  const verdictWithoutPartitions = deriveSelectMatrixVerdict({
    ...partial,
    partitions: undefined,
  });
  if (
    verdictWithoutPartitions === "SMART_PROCESS_CONTRACT_DRIFT" ||
    verdictWithoutPartitions.startsWith("OFFENDING_ROLE:") ||
    verdictWithoutPartitions === "SELECT_MATRIX_INCONCLUSIVE"
  ) {
    return { ...partial, verdict: verdictWithoutPartitions };
  }

  const partitions = await probePartitions();
  const finalVerdict = deriveSelectMatrixVerdict({ ...partial, partitions });

  // ─── §12. Star diagnostic — ONLY when no safe partition exists. ───
  if (finalVerdict === "NO_SAFE_LIST_PARTITION") {
    const starPage = await probeSelectFirstPage(STAR_SELECT, "Y");
    let requiredRolesPresentCount = 0;
    try {
      const rawPage = await bitrixPost<{ result?: unknown }>(
        "crm.item.list",
        {
          ...buildSmartProcessListParamsWithSelect({}, STAR_SELECT, { useOriginalUfNames: "Y" }),
          start: 0,
        }
      );
      const items = parseListEnvelope(rawPage?.result) ?? [];
      const presentKeys = new Set<string>();
      for (const row of items) {
        if (row !== null && typeof row === "object") {
          for (const key of Object.keys(row as Record<string, unknown>)) {
            presentKeys.add(key);
          }
        }
      }
      for (const role of SMART_PROCESS_REQUIRED_ROLES) {
        const fieldId = SMART_PROCESS_ROLE_FIELD_IDS[role];
        if (STANDARD_UNIVERSAL_ROLES.has(role) || presentKeys.has(fieldId)) {
          requiredRolesPresentCount++;
        }
      }
    } catch {
      // Star probe stays diagnostic-only; the count stays at the
      // first-page-derived value (0) when the repeat read fails.
    }
    return {
      ...partial,
      partitions,
      star: { ...starPage, requiredRolesPresentCount },
      verdict: finalVerdict,
    };
  }

  return { ...partial, partitions, verdict: finalVerdict };
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
        // Select-interaction matrix (diagnostic-only, read-only): runs ONLY
        // when the helper failed with the locally-measured
        // MISSING_REQUIRED_ID invariant — the exact production anomaly
        // (rows arrive, documented `id` absent). Transport-down and other
        // invariants never trigger the matrix (bounded cost, targeted
        // evidence).
        const selectMatrix: SmartProcessSelectMatrixReport | undefined =
          error.category === "MISSING_REQUIRED_ID"
            ? await runSmartProcessSelectMatrix().catch(() => undefined)
            : undefined;
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
          ...(selectMatrix ? { selectMatrix } : {}),
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
