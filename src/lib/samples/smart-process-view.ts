// src/lib/samples/smart-process-view.ts
// ─────────────────────────────────────────────────────────────────────
// ONE canonical Smart Process item display view + deterministic indexes.
//
// This module is a pure PROJECTOR over already-adapted canonical evidence
// (`SampleEvidenceUnit` with source === "SMART_PROCESS"). It never re-parses
// raw Bitrix UF fields — the single raw parser remains
// `src/lib/samples/adapters/smart-process.ts`, and the single current-state
// engine remains `src/lib/samples/reconcile.ts`.
//
// Attribution rules (hard invariants):
// - byDealId: exact `linkedDealId` (parentId2) only. A relation-conflict item
//   may remain visible under its exact linked Deal (the Deal relation itself
//   is factual) but carries its quality issue and NEVER joins Company
//   aggregation. A SP item is never assigned to a Deal merely because both
//   share a Company.
// - byCompanyId: trustworthy attribution only — direct trusted company, or
//   the existing adapter's verified linked-Deal company fallback. Relation
//   conflicts (empty companyId + smart_process_relation_conflict) and orphans
//   (smart_process_orphan_item) are excluded.
// - Multiple active items stay multiple everywhere (no fabricated winner).
//
// Display-label separation:
// - business semantics are keyed on committed stable stage IDs
//   (`SMART_PROCESS_STAGE_SEMANTICS`);
// - display labels prefer the live `crm.status.list` NAME for a known
//   committed stage ID (optional `liveStageLabels`), falling back to the
//   committed static labels only when the directory is unavailable;
// - unknown stage IDs remain user-facing `Не классифицировано`; the raw ID
//   is kept in internal provenance only.
// ─────────────────────────────────────────────────────────────────────

import type {
  NormalizedResult,
  SampleDataIssue,
  SampleGrade,
  SampleQuantity,
} from "./types";
import type { SampleEvidenceUnit } from "./model";
import {
  UNCLASSIFIED_LABEL,
  NORMALIZED_RESULT_LABELS,
} from "./constants";
import {
  isSmartProcessActiveStage,
  isSmartProcessTerminalStage,
  smartProcessStageSemantic,
  SMART_PROCESS_STAGE_LABELS,
  type SmartProcessStageSemantic,
} from "./smart-process-contract";

/** Internal provenance — never rendered into user-facing cells. */
export interface SmartProcessItemProvenance {
  rawStageId?: string;
  directCompanyId?: string;
  dealCompanyId?: string;
  evidenceUnitId: string;
}

export interface SmartProcessItemView {
  processItemId: string;
  title: string;
  /** Trustworthy company attribution; empty when conflicted/orphan. */
  companyId: string;
  /** Exact factual linked Deal (parentId2), if configured. */
  linkedDealId?: string;
  stageId?: string;
  stageLabel: string;
  stageSemantic?: SmartProcessStageSemantic;
  isActive: boolean;
  isTerminal: boolean;
  responsibleId?: string;
  /** Manual «Дата отправки» evidence only (ISO dates, deduplicated). */
  sentDates: string[];
  grades: SampleGrade[];
  quantities: SampleQuantity[];
  rawTestResult?: string;
  normalizedResult: NormalizedResult;
  createdTime?: string;
  dataIssues: SampleDataIssue[];
  /** Internal provenance — never exposed in user-facing UI/exports. */
  provenance: SmartProcessItemProvenance;
}

export interface SmartProcessItemIndexes {
  byItemId: Map<string, SmartProcessItemView>;
  byCompanyId: Map<string, SmartProcessItemView[]>;
  byDealId: Map<string, SmartProcessItemView[]>;
}

export interface SmartProcessViewOptions {
  /**
   * Live stage directory labels (crm.status.list NAME per committed stage ID).
   * Optional; static committed labels are the fallback.
   */
  liveStageLabels?: Record<string, string>;
}

function resolveStageLabel(
  stageId: string | undefined,
  liveStageLabels: Record<string, string> | undefined
): { label: string; knownStage: boolean } {
  if (!stageId) return { label: UNCLASSIFIED_LABEL, knownStage: false };
  if (liveStageLabels && Object.prototype.hasOwnProperty.call(liveStageLabels, stageId)) {
    return { label: liveStageLabels[stageId], knownStage: true };
  }
  const semantic = smartProcessStageSemantic(stageId);
  if (semantic) {
    // Known committed stage without a live directory entry: static fallback.
    return {
      label: SMART_PROCESS_STAGE_LABELS[stageId] ?? UNCLASSIFIED_LABEL,
      knownStage: true,
    };
  }
  // Unknown stage ID — neutral user-facing label; raw ID stays in provenance.
  return { label: UNCLASSIFIED_LABEL, knownStage: false };
}

/**
 * Projects ONE adapted Smart Process evidence unit into the canonical display
 * view. Consumes ONLY adapted evidence — no raw Bitrix rows, no UF parsing.
 */
export function buildSmartProcessItemView(
  unit: SampleEvidenceUnit,
  options: SmartProcessViewOptions = {}
): SmartProcessItemView | null {
  if (unit.source !== "SMART_PROCESS" || !unit.processItemId) return null;

  const { liveStageLabels } = options;
  const stageId = unit.stageId?.trim() || undefined;
  const { label: stageLabel } = resolveStageLabel(stageId, liveStageLabels);

  const isActive = stageId ? isSmartProcessActiveStage(stageId) : false;
  const isTerminal = stageId ? isSmartProcessTerminalStage(stageId) : false;

  // Manual sent dates only (the adapter already guarantees this provenance).
  const sentDates = [
    ...new Set(
      unit.sentDates
        .filter((e) => e.source === "SMART_PROCESS")
        .map((e) => e.date)
        .filter((d): d is string => Boolean(d))
    ),
  ];

  // Trustworthy company attribution: the adapter fail-closes conflicts to an
  // empty companyId and records `smart_process_relation_conflict`; orphans
  // carry `smart_process_orphan_item`. Neither joins the company index.
  const conflicted = unit.issues.includes("smart_process_relation_conflict");
  const orphan = unit.issues.includes("smart_process_orphan_item");

  return {
    processItemId: unit.processItemId,
    title: unit.title?.trim() || "Тестирование образца",
    companyId: conflicted || orphan ? "" : unit.companyId,
    linkedDealId: unit.linkedDealId,
    stageId,
    stageLabel,
    stageSemantic: stageId ? smartProcessStageSemantic(stageId) : undefined,
    isActive,
    isTerminal,
    responsibleId: unit.responsibleId,
    sentDates,
    grades: unit.grades,
    quantities: unit.quantities,
    rawTestResult: unit.rawTestResult,
    normalizedResult: unit.normalizedResult ?? "unknown",
    createdTime: unit.createdTime,
    dataIssues: [...unit.issues],
    provenance: {
      rawStageId: stageId,
      directCompanyId: unit.directCompanyId,
      dealCompanyId: unit.dealCompanyId,
      evidenceUnitId: unit.id,
    },
  };
}

/**
 * Builds ALL canonical Smart Process item views from adapted evidence,
 * ordered: active → terminal → other/unclassified; newest `createdTime`
 * first within each group; stable `processItemId` tie-break.
 */
export function buildSmartProcessItemViews(
  evidenceUnits: readonly SampleEvidenceUnit[],
  options: SmartProcessViewOptions = {}
): SmartProcessItemView[] {
  const views: SmartProcessItemView[] = [];
  for (const unit of evidenceUnits) {
    const view = buildSmartProcessItemView(unit, options);
    if (view) views.push(view);
  }

  const rank = (v: SmartProcessItemView): number =>
    v.isActive ? 0 : v.isTerminal ? 1 : 2;

  return views.sort((a, b) => {
    const r = rank(a) - rank(b);
    if (r !== 0) return r;
    const ta = a.createdTime ? Date.parse(a.createdTime) : Number.NaN;
    const tb = b.createdTime ? Date.parse(b.createdTime) : Number.NaN;
    // Newest first; items without createdTime sort last within the group.
    if (!Number.isNaN(ta) && !Number.isNaN(tb) && ta !== tb) return tb - ta;
    if (!Number.isNaN(ta) && Number.isNaN(tb)) return -1;
    if (Number.isNaN(ta) && !Number.isNaN(tb)) return 1;
    return a.processItemId.localeCompare(b.processItemId, "en", { numeric: true });
  });
}

/**
 * Deterministic indexes over the ordered views.
 * - byItemId: every view (including conflicted/orphan items).
 * - byCompanyId: trustworthy attribution only.
 * - byDealId: exact linkedDealId only (conflicted items remain visible under
 *   their exact linked Deal with their quality issue).
 */
export function indexSmartProcessItemViews(
  views: readonly SmartProcessItemView[]
): SmartProcessItemIndexes {
  const byItemId = new Map<string, SmartProcessItemView>();
  const byCompanyId = new Map<string, SmartProcessItemView[]>();
  const byDealId = new Map<string, SmartProcessItemView[]>();

  for (const view of views) {
    byItemId.set(view.processItemId, view);

    if (view.companyId) {
      const arr = byCompanyId.get(view.companyId);
      if (arr) arr.push(view);
      else byCompanyId.set(view.companyId, [view]);
    }

    if (view.linkedDealId) {
      const arr = byDealId.get(view.linkedDealId);
      if (arr) arr.push(view);
      else byDealId.set(view.linkedDealId, [view]);
    }
  }

  return { byItemId, byCompanyId, byDealId };
}

/** Convenience: build views + indexes in one pass. */
export function buildSmartProcessIndex(
  evidenceUnits: readonly SampleEvidenceUnit[],
  options: SmartProcessViewOptions = {}
): { views: SmartProcessItemView[]; indexes: SmartProcessItemIndexes } {
  const views = buildSmartProcessItemViews(evidenceUnits, options);
  return { views, indexes: indexSmartProcessItemViews(views) };
}

// ─── Deals-table compact cell helpers (pure; no UI imports) ─────────────

export interface SmartProcessDealStageCell {
  /** `—` when no items. */
  text: string;
  /** Appended active stage labels (deduplicated), when useful. */
  activeStageLabels: string[];
}

/**
 * Stage cell: 0 items → `—`; 1 → its label; multiple → multiplicity
 * disclosure `N процессов · M активных`, never a silent single pick.
 */
export function buildSmartProcessDealStageCell(
  items: readonly SmartProcessItemView[] | undefined
): SmartProcessDealStageCell {
  if (!items || items.length === 0) {
    return { text: "—", activeStageLabels: [] };
  }
  if (items.length === 1) {
    const only = items[0];
    return { text: only.stageLabel, activeStageLabels: only.isActive ? [only.stageLabel] : [] };
  }
  const activeCount = items.filter((i) => i.isActive).length;
  const activeLabels = [
    ...new Set(items.filter((i) => i.isActive).map((i) => i.stageLabel)),
  ];
  return {
    text: `${items.length} процесса · ${activeCount} активный`,
    activeStageLabels: activeLabels,
  };
}

/**
 * Sent-date cell: ONLY authoritative manual Smart Process sent dates.
 * Multiple distinct dates disclose multiplicity instead of pretending one
 * physical event; createdTime/movedTime are never substituted.
 */
export function buildSmartProcessDealSentDateCell(
  items: readonly SmartProcessItemView[] | undefined
): string {
  if (!items || items.length === 0) return "—";
  const dates = [...new Set(items.flatMap((i) => i.sentDates))].sort();
  if (dates.length === 0) return "—";
  if (dates.length === 1) return dates[0];
  return `${dates.length} даты отправки: ${dates.join(", ")}`;
}

/**
 * Result cell: one factual consistent result → it; several distinct item
 * results → «Несколько результатов»; unknown/unclassified stays neutral.
 */
export function buildSmartProcessDealResultCell(
  items: readonly SmartProcessItemView[] | undefined
): string {
  if (!items || items.length === 0) return "—";
  const known = items
    .map((i) => i.rawTestResult?.trim())
    .filter((r): r is string => Boolean(r));
  const distinct = [...new Set(known)];
  if (distinct.length === 0) return "—";
  if (distinct.length === 1) return distinct[0];
  return "Несколько результатов";
}

/**
 * Samples cell: compact distinct Gel/Sol grades without merging several
 * physical items into one invented shipment.
 */
export function buildSmartProcessDealSamplesCell(
  items: readonly SmartProcessItemView[] | undefined
): string {
  if (!items || items.length === 0) return "—";
  const parts: string[] = [];
  const gel = [
    ...new Set(
      items.flatMap((i) =>
        i.grades.filter((g) => g.productFamily === "Гель").map((g) => g.value)
      )
    ),
  ];
  const sol = [
    ...new Set(
      items.flatMap((i) =>
        i.grades.filter((g) => g.productFamily === "Золь").map((g) => g.value)
      )
    ),
  ];
  if (gel.length > 0) parts.push(`Гель: ${gel.join(", ")}`);
  if (sol.length > 0) parts.push(`Золь: ${sol.join(", ")}`);
  return parts.length > 0 ? parts.join(" · ") : "—";
}

/** Normalized-result display label shared by previews. */
export function smartProcessResultDisplayLabel(
  view: SmartProcessItemView
): string {
  return NORMALIZED_RESULT_LABELS[view.normalizedResult] ?? view.normalizedResult;
}
