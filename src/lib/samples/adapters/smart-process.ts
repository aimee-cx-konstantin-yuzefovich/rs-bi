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
  isSmartProcessActiveStage,
  isSmartProcessTerminalStage,
  smartProcessStageSemantic,
  SMART_PROCESS_STAGE_LABELS,
} from "../smart-process-contract";
import { extractDates, isSentinelValue, resolveValue, classifyResultValue } from "../normalize";
import { PRODUCT_FAMILY_GEL, PRODUCT_FAMILY_SOL } from "../constants";

function firstString(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  if (isSentinelValue(value)) return undefined;
  const trimmed = value.trim();
  return trimmed !== "" ? trimmed : undefined;
}

function rowString(row: BitrixRow, key: string): string | undefined {
  return firstString(row[key]);
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
 * - enum ID resolved through metadata when available;
 * - unknown enum ID → «Не классифицировано (<id>)» (never success/failure);
 * - normalized via the conservative keyword classifier over the RESOLVED
 *   label (unknown enum labels classify as unknown).
 */
export function resolveSmartProcessResult(
  raw: unknown,
  resolve: LabelResolver
): { raw?: string; label?: string; normalized: NormalizedResult; unknownEnumId?: string } {
  if (isSentinelValue(raw)) {
    return { normalized: "unknown" };
  }
  const rawStr = String(raw).trim();
  if (rawStr === "") {
    return { normalized: "unknown" };
  }
  const label = resolve(SMART_PROCESS_TEST_RESULT_FIELD_ID ?? "", rawStr);
  if (label !== rawStr) {
    // Metadata resolved the enum ID to a human label.
    return { raw: rawStr, label, normalized: classifyResultValue(label) ?? "unknown" };
  }
  // Unresolved: numeric enum ID stays unclassified; free text classifies conservatively.
  if (/^\d+$/.test(rawStr)) {
    return {
      raw: rawStr,
      label: `Не классифицировано (${rawStr})`,
      normalized: "unknown",
      unknownEnumId: rawStr,
    };
  }
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
  const directCompanyId = rowString(row, "companyId");

  // ── Deal relation: exact verified relation only ──
  const linkedDealId = SMART_PROCESS_DEAL_FIELD_ID
    ? rowString(row, SMART_PROCESS_DEAL_FIELD_ID)
    : undefined;

  // Relation conflict: direct Company relation and linked Deal's COMPANY_ID disagree.
  if (directCompanyId && linkedDealId && context.dealCompanyById) {
    const dealCompanyId = context.dealCompanyById.get(linkedDealId);
    if (dealCompanyId && dealCompanyId !== directCompanyId) {
      issues.push("smart_process_relation_conflict");
    }
  }

  const companyId = directCompanyId ?? "";

  // ── Stage ──
  const stageId = rowString(row, "stageId");
  const semantic = smartProcessStageSemantic(stageId);
  if (stageId && !semantic) {
    issues.push("smart_process_unknown_stage");
  }

  // ── Manual «Дата отправки»: the ONLY dated sent event ──
  const sentDates: SampleSentEvidence[] = [];
  if (SMART_PROCESS_SENT_DATE_FIELD_ID) {
    const manualDates = extractDates(row[SMART_PROCESS_SENT_DATE_FIELD_ID]);
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
      row[SMART_PROCESS_TEST_RESULT_FIELD_ID],
      resolve
    );
    rawTestResult = resolvedResult.label;
    normalizedResult = resolvedResult.normalized;
    if (resolvedResult.unknownEnumId) {
      issues.push("smart_process_unknown_result");
    }
  }

  // Stage/result conflict: terminal stage implies one outcome, explicit
  // result classifies to the opposite — AMBIGUOUS, no silent winner.
  const implied = terminalStageImpliedResult(semantic);
  if (
    implied &&
    normalizedResult !== "unknown" &&
    normalizedResult !== implied
  ) {
    issues.push("smart_process_stage_result_conflict");
  }

  // ── Grades (marks) ──
  const grades: SampleEvidenceUnit["grades"] = [];
  const gelGrades = SMART_PROCESS_GRADE_GEL_FIELD_ID
    ? resolveValue(SMART_PROCESS_GRADE_GEL_FIELD_ID, row[SMART_PROCESS_GRADE_GEL_FIELD_ID], resolve)
    : undefined;
  if (gelGrades) {
    for (const value of gelGrades) grades.push({ productFamily: PRODUCT_FAMILY_GEL, value });
  }
  const solGrades = SMART_PROCESS_GRADE_SOL_FIELD_ID
    ? resolveValue(SMART_PROCESS_GRADE_SOL_FIELD_ID, row[SMART_PROCESS_GRADE_SOL_FIELD_ID], resolve)
    : undefined;
  if (solGrades) {
    for (const value of solGrades) grades.push({ productFamily: PRODUCT_FAMILY_SOL, value });
  }

  // ── Status evidence: stage label (display) + stage semantic marker ──
  const statusEvidence: string[] = [];
  if (stageId) {
    statusEvidence.push(SMART_PROCESS_STAGE_LABELS[stageId] ?? stageId);
  }

  const responsibleId = rowString(row, "assignedById") ?? rowString(row, "ASSIGNED_BY_ID");
  const createdTime = rowString(row, "createdTime");

  // Orphan: no company relation at all.
  if (!companyId) {
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
    productFamilies: [],
    grades,
    quantities: [],
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
