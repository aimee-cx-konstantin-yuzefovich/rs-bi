// src/lib/samples/adapters/smart-process.ts
// ─────────────────────────────────────────────────────────────────────
// Smart Process 1032 item adapter (Phase C).
//
// Extracts one crm.item.list row (entityTypeId=1032, categoryId=15) into a
// canonical SampleEvidenceUnit with explicit provenance
// (source = SMART_PROCESS, granularity = PROCESS_ITEM).
//
// Pure and immutable: never mutates the input row. Never invents values
// from legacy Company/Deal fields.
//
// Invariants:
// - Stage IDs are the stable key; unknown stage IDs stay unclassified and
//   emit smart_process_unknown_stage (never mapped by wording).
// - The ONLY dated samples_sent event is the manual «Дата отправки»
//   field. createdTime/updatedTime are chronology metadata, never events.
// - Result: raw value preserved; unknown enum ID → «Не классифицировано
//   (<id>)», never mapped to success/failure.
// - Terminal-stage vs explicit-result conflict →
//   smart_process_stage_result_conflict (AMBIGUOUS, no silent winner).
// - Direct Company relation vs linked-Deal COMPANY_ID conflict →
//   smart_process_relation_conflict (no silent pick).
// ─────────────────────────────────────────────────────────────────────

import type {
  BitrixFieldValue,
  BitrixRow,
  LabelResolver,
  NormalizedResult,
  SampleDataIssue,
  SampleEvidenceUnit,
  SampleSentEvidence,
} from "../types";
import {
  SMART_PROCESS_ENTITY_TYPE_ID,
  SMART_PROCESS_CATEGORY_ID,
  SMART_PROCESS_SENT_DATE_FIELD_ID,
  SMART_PROCESS_DEAL_FIELD_ID,
  SMART_PROCESS_GRADE_GEL_FIELD_ID,
  SMART_PROCESS_GRADE_SOL_FIELD_ID,
  SMART_PROCESS_TEST_RESULT_FIELD_ID,
  SMART_PROCESS_QTY_GEL_FIELD_ID,
  SMART_PROCESS_QTY_GEL_UNIT,
  SMART_PROCESS_QTY_SOL_FIELD_ID,
  SMART_PROCESS_QTY_SOL_UNIT,
  isSmartProcessActiveStage,
  isSmartProcessTerminalStage,
  smartProcessStageSemantic,
  SMART_PROCESS_STAGE_LABELS,
} from "../smart-process-contract";
import {
  extractDates,
  isSentinelValue,
  resolveValue,
  classifyResultValue,
  parseQuantity,
} from "../normalize";
import { PRODUCT_FAMILY_GEL, PRODUCT_FAMILY_SOL, UNCLASSIFIED_LABEL } from "../constants";

function firstString(value: unknown): string | undefined {
  if (value === null || value === undefined) return undefined;
  if (typeof value === "number") value = String(value);
  if (typeof value !== "string") return undefined;
  if (isSentinelValue(value)) return undefined;
  const trimmed = value.trim();
  return trimmed !== "" ? trimmed : undefined;
}

function rowValue(row: BitrixRow, key: string | null | undefined): BitrixFieldValue {
  if (!key) return undefined;
  if (row[key] !== undefined) return row[key];
  const upper = key.toUpperCase();
  if (row[upper] !== undefined) return row[upper];
  // UF_CRM_7_... <-> ufCrm7_...
  const m = key.match(/^UF_CRM_(\d+)_(.+)$/i);
  if (m) {
    const camel = `ufCrm${m[1]}_${m[2]}`;
    if (row[camel] !== undefined) return row[camel];
  }
  return undefined;
}

function rowString(row: BitrixRow, key: string | null | undefined): string | undefined {
  return firstString(rowValue(row, key));
}

/** Terminal semantic → the result meaning the stage implies. */
function terminalStageImpliedResult(
  semantic: ReturnType<typeof smartProcessStageSemantic>
): NormalizedResult | undefined {
  if (semantic === "TERMINAL_SUCCESS") return "positive";
  if (semantic === "TERMINAL_FAILURE") return "negative";
  return undefined;
}

/**
 * Resolves the explicit SP «Результат тестирования» raw value:
 * - field is verified live string (free text, e.g. technologist comments);
 * - empty / sentinel → normalized "unknown";
 * - dictionary label resolved through metadata when available;
 * - conservative result classification over resolved or raw string;
 * - unclassified text preserves raw string verbatim (never forced to "Не классифицировано (<id>)").
 */
export function resolveSmartProcessResult(
  raw: unknown,
  _resolve?: LabelResolver
): { raw?: string; label?: string; normalized: NormalizedResult } {
  if (isSentinelValue(raw)) {
    return { normalized: "unknown" };
  }
  const rawStr = String(raw).trim();
  if (rawStr === "") {
    return { normalized: "unknown" };
  }
  // Field is verified live string (free text). Preserves raw string verbatim without enum dictionary lookup.
  return { raw: rawStr, label: rawStr, normalized: classifyResultValue(rawStr) ?? "unknown" };
}

/**
 * Pure adapter: extracts one Smart Process item into a canonical
 * SampleEvidenceUnit. Returns null only when the row has no stable item id.
 */
export function adaptSmartProcessSampleEvidence(
  row: BitrixRow,
  resolve: LabelResolver,
  context: {
    /** Deal → COMPANY_ID map for relation verification (dealId → companyId). */
    dealCompanyById?: Map<string, string>;
  } = {}
): SampleEvidenceUnit | null {
  const processItemId = rowString(row, "id");
  if (!processItemId) return null;

  const issues: SampleDataIssue[] = [];

  // ── Company relation: direct verified relation first ──
  const rawDirect = rowString(row, "companyId") ?? rowString(row, "COMPANY_ID");
  const directCompanyId = rawDirect && rawDirect !== "0" ? rawDirect : undefined;

  // ── Deal relation: authoritative parentId2 only ──
  let linkedDealId = rowString(row, SMART_PROCESS_DEAL_FIELD_ID);
  if (linkedDealId === "0") linkedDealId = undefined;

  let companyId = directCompanyId ?? "";
  let dealCompanyId: string | undefined;

  // Relation conflict: direct Company relation and linked Deal's COMPANY_ID disagree.
  if (directCompanyId && linkedDealId && context.dealCompanyById) {
    dealCompanyId = context.dealCompanyById.get(linkedDealId);
    if (dealCompanyId && dealCompanyId !== "0" && dealCompanyId !== directCompanyId) {
      issues.push("smart_process_relation_conflict");
      companyId = ""; // Fail-closed: relation conflict must not be attributed to either company
    }
  } else if (!directCompanyId && linkedDealId && context.dealCompanyById) {
    // Fallback to linked Deal's COMPANY_ID when direct relation is missing
    dealCompanyId = context.dealCompanyById.get(linkedDealId);
    if (dealCompanyId && dealCompanyId !== "0") {
      companyId = dealCompanyId;
    }
  }

  // ── Stage ──
  const stageId = rowString(row, "stageId");
  const semantic = smartProcessStageSemantic(stageId);
  if (stageId && !semantic) {
    issues.push("smart_process_unknown_stage");
  }

  // ── Manual «Дата отправки»: the ONLY dated sent event ──
  const sentDates: SampleSentEvidence[] = [];
  if (SMART_PROCESS_SENT_DATE_FIELD_ID) {
    const manualDates = extractDates(rowValue(row, SMART_PROCESS_SENT_DATE_FIELD_ID));
    for (const date of manualDates) {
      sentDates.push({
        date,
        source: "SMART_PROCESS",
        sourceGranularity: "PROCESS_ITEM",
        sourceEntityId: processItemId,
        companyId,
        dealId: linkedDealId,
      });
    }
  }

  // Sent-or-later active stage without a manual date → factual gap issue.
  // (createdTime is NEVER substituted.)
  if (
    !sentDates.length &&
    (semantic === "SAMPLES_SENT" || semantic === "TESTING_IN_PROGRESS")
  ) {
    issues.push("smart_process_missing_sent_date");
  }

  // ── Result ──
  let rawTestResult: string | undefined;
  let normalizedResult: NormalizedResult = "unknown";
  if (SMART_PROCESS_TEST_RESULT_FIELD_ID) {
    const resolvedResult = resolveSmartProcessResult(
      rowValue(row, SMART_PROCESS_TEST_RESULT_FIELD_ID)
    );
    rawTestResult = resolvedResult.label;
    normalizedResult = resolvedResult.normalized;
  }

  // Stage/result conflict: terminal stage implies one outcome, explicit
  // result classifies to the opposite — AMBIGUOUS, no silent winner.
  const implied = terminalStageImpliedResult(semantic);
  if (implied) {
    if (normalizedResult !== "unknown" && normalizedResult !== implied) {
      issues.push("smart_process_stage_result_conflict");
      normalizedResult = "unknown";
    } else if (normalizedResult === "unknown") {
      normalizedResult = implied;
    }
  }

  // ── Grades (marks) ──
  const grades: SampleEvidenceUnit["grades"] = [];
  const rawGel = rowValue(row, SMART_PROCESS_GRADE_GEL_FIELD_ID);
  const gelGrades = SMART_PROCESS_GRADE_GEL_FIELD_ID && rawGel !== undefined
    ? resolveValue(SMART_PROCESS_GRADE_GEL_FIELD_ID, rawGel, resolve)
    : undefined;
  if (gelGrades) {
    for (const value of gelGrades) grades.push({ productFamily: PRODUCT_FAMILY_GEL, value });
  }
  const rawSol = rowValue(row, SMART_PROCESS_GRADE_SOL_FIELD_ID);
  const solGrades = SMART_PROCESS_GRADE_SOL_FIELD_ID && rawSol !== undefined
    ? resolveValue(SMART_PROCESS_GRADE_SOL_FIELD_ID, rawSol, resolve)
    : undefined;
  if (solGrades) {
    for (const value of solGrades) grades.push({ productFamily: PRODUCT_FAMILY_SOL, value });
  }

  // ── Quantities ──
  const quantities: SampleEvidenceUnit["quantities"] = [];
  const rawGelQty = parseQuantity(rowValue(row, SMART_PROCESS_QTY_GEL_FIELD_ID));
  if (rawGelQty !== undefined) {
    quantities.push({ productFamily: PRODUCT_FAMILY_GEL, value: rawGelQty, unit: SMART_PROCESS_QTY_GEL_UNIT });
  }
  const rawSolQty = parseQuantity(rowValue(row, SMART_PROCESS_QTY_SOL_FIELD_ID));
  if (rawSolQty !== undefined) {
    quantities.push({ productFamily: PRODUCT_FAMILY_SOL, value: rawSolQty, unit: SMART_PROCESS_QTY_SOL_UNIT });
  }

  // ── Status evidence: stage label (display) + stage semantic marker ──
  // Data-trust: known stage → stable Russian label; unknown stage → the
  // neutral «Не классифицировано» label. Raw stageId stays in `stageId`
  // (internal provenance) and the smart_process_unknown_stage issue — the
  // raw Smart Process stage token NEVER reaches user-facing evidence.
  const statusEvidence: string[] = [];
  if (stageId) {
    const stageLabel = SMART_PROCESS_STAGE_LABELS[stageId];
    statusEvidence.push(stageLabel ?? UNCLASSIFIED_LABEL);
  }

  const responsibleId = rowString(row, "assignedById") ?? rowString(row, "ASSIGNED_BY_ID");
  const createdTime = rowString(row, "createdTime");

  // Orphan: no company relation at all (distinct from relation conflict).
  if (!companyId && !issues.includes("smart_process_relation_conflict")) {
    issues.push("smart_process_orphan_item");
  }

  return {
    id: `sp-item-${processItemId}`,
    source: "SMART_PROCESS",
    sourceGranularity: "PROCESS_ITEM",
    sourceEntityId: processItemId,
    companyId,
    dealId: linkedDealId,
    responsibleId,
    title: rowString(row, "title") ?? rowString(row, "TITLE"),
    stageId,
    processItemId,
    entityTypeId: SMART_PROCESS_ENTITY_TYPE_ID,
    categoryId: SMART_PROCESS_CATEGORY_ID,
    createdTime,
    linkedDealId,
    directCompanyId,
    dealCompanyId,
    productFamilies: [],
    grades,
    quantities,
    sentDates,
    statusEvidence,
    rawTestResult,
    normalizedResult,
    issues,
  };
}

/** Whether this SP evidence unit is an active (WIP) cycle. */
export function isSmartProcessActiveUnit(unit: SampleEvidenceUnit): boolean {
  return unit.source === "SMART_PROCESS" && isSmartProcessActiveStage(unit.stageId);
}

/** Whether this SP evidence unit terminates a cycle. */
export function isSmartProcessTerminalUnit(unit: SampleEvidenceUnit): boolean {
  return unit.source === "SMART_PROCESS" && isSmartProcessTerminalStage(unit.stageId);
}
