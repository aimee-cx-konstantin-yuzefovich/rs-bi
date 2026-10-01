// src/lib/samples/smart-process-contract.ts
// ─────────────────────────────────────────────────────────────────────
// Smart Process 1032 («Тестирование образца») contract constants.
//
// INVARIANTS (Phase C):
// 1. Stage IDs are the stable key. Russian labels are display-only and
//    may drift; analytics never depend on wording.
// 2. Custom UF_CRM field IDs are NOT guessed. They are discovered live via
//    scripts/discover-smart-process-contract.mjs (crm.item.fields,
//    useOriginalUfNames = "Y") and committed afterwards. Until then every
//    value below stays null and assertSmartProcessContractReady() throws —
//    the runtime is genuinely fail-closed, never silently analytical on
//    unverified IDs.
// 3. The only authoritative dated samples_sent event from the Smart
//    Process is the manual «Дата отправки» field. createdTime /
//    updatedTime / movedTime / stage transitions are NEVER substitutes.
// ─────────────────────────────────────────────────────────────────────

export const SMART_PROCESS_ENTITY_TYPE_ID = 1032;
export const SMART_PROCESS_CATEGORY_ID = 15;
export const SMART_PROCESS_STAGE_STATUS_ENTITY_ID = "DYNAMIC_1032_STAGE_15";

/**
 * Stage ID → stable semantic class. ACTIVE stages are current-cycle WIP;
 * TERMINAL stages close a cycle. Unknown stage IDs stay unclassified and
 * emit a data-quality issue — never mapped by wording.
 */
export type SmartProcessStageSemantic =
  | "PREPARATION"          // Подготовка к отправке
  | "SAMPLES_SENT"         // Образцы отправлены
  | "TESTING_IN_PROGRESS"  // На испытании
  | "TERMINAL_SUCCESS"     // Подошли
  | "TERMINAL_FAILURE";    // Не подошли

export const SMART_PROCESS_STAGE_SEMANTICS: Record<string, SmartProcessStageSemantic> = {
  "DT1032_15:NEW": "PREPARATION",
  "DT1032_15:UC_ZARRMX": "SAMPLES_SENT",
  "DT1032_15:CLIENT": "TESTING_IN_PROGRESS",
  "DT1032_15:SUCCESS": "TERMINAL_SUCCESS",
  "DT1032_15:FAIL": "TERMINAL_FAILURE",
};

export const SMART_PROCESS_ACTIVE_STAGES = new Set([
  "DT1032_15:NEW",
  "DT1032_15:UC_ZARRMX",
  "DT1032_15:CLIENT",
]);

export const SMART_PROCESS_TERMINAL_STAGES = new Set([
  "DT1032_15:SUCCESS",
  "DT1032_15:FAIL",
]);

/** Russian display labels (display-only; analytics use stage IDs). */
export const SMART_PROCESS_STAGE_LABELS: Record<string, string> = {
  "DT1032_15:NEW": "Подготовка к отправке",
  "DT1032_15:UC_ZARRMX": "Образцы отправлены",
  "DT1032_15:CLIENT": "На испытании",
  "DT1032_15:SUCCESS": "Подошли",
  "DT1032_15:FAIL": "Не подошли",
};

// ─── Custom UF field IDs (live-discovered; null until verified) ──────
// Each maps to the exact original API field name from crm.item.fields
// with useOriginalUfNames = "Y". DO NOT fill these by hand from memory —
// run scripts/discover-smart-process-contract.mjs and commit its output.

/** Manual «Дата отправки» — the ONLY authoritative dated samples_sent event. */
export const SMART_PROCESS_SENT_DATE_FIELD_ID: string = "UF_CRM_7_1766059943";

/** «Сделка» — exact linked Deal (relation field: parentId2 / PARENT_ID_2). */
export const SMART_PROCESS_DEAL_FIELD_ID: string = "parentId2";

/** Custom UF deal relation field in Smart Process (secondary). */
export const SMART_PROCESS_DEAL_UF_FIELD_ID: string = "UF_CRM_7_1779385642";

/** «Марка предоставленных образцов (ГЕЛЬ)». */
export const SMART_PROCESS_GRADE_GEL_FIELD_ID: string = "UF_CRM_7_1766135695";

/** «Марка предоставленных образцов (ЗОЛЬ)». */
export const SMART_PROCESS_GRADE_SOL_FIELD_ID: string = "UF_CRM_7_1766136511";

/** «Результат тестирования» — free text / string. */
export const SMART_PROCESS_TEST_RESULT_FIELD_ID: string = "UF_CRM_7_1763036405";

/** «Кол-во переданного образца (ГЕЛЬ) кг» (double). */
export const SMART_PROCESS_QTY_GEL_FIELD_ID: string = "UF_CRM_7_1766136470";
export const SMART_PROCESS_QTY_GEL_UNIT: string = "кг";

/** «Кол-во переданного образца (ЗОЛЬ) л» (double). */
export const SMART_PROCESS_QTY_SOL_FIELD_ID: string = "UF_CRM_7_1766136546";
export const SMART_PROCESS_QTY_SOL_UNIT: string = "л";

/**
 * Native Smart Process → Company relation as returned by live metadata.
 */
export const SMART_PROCESS_COMPANY_FIELD_ID: string = "companyId";

/**
 * Whether the live discovery has been executed and all required field IDs
 * above were committed. Flipped to true in the same commit as the IDs.
 */
export const SMART_PROCESS_HAS_DISCOVERED_CONTRACT = true;

const REQUIRED_SMART_PROCESS_FIELD_IDS: Array<string | null> = [
  SMART_PROCESS_SENT_DATE_FIELD_ID,
  SMART_PROCESS_DEAL_FIELD_ID,
  SMART_PROCESS_GRADE_GEL_FIELD_ID,
  SMART_PROCESS_GRADE_SOL_FIELD_ID,
  SMART_PROCESS_TEST_RESULT_FIELD_ID,
  SMART_PROCESS_QTY_GEL_FIELD_ID,
  SMART_PROCESS_QTY_SOL_FIELD_ID,
];

/**
 * Fail-closed gate: throws until every required Smart Process field ID has
 * been live-discovered and committed. Every production Smart Process
 * consumer MUST call this before using the contract.
 */
export function assertSmartProcessContractReady(): void {
  if (!SMART_PROCESS_HAS_DISCOVERED_CONTRACT) {
    throw new Error(
      "Smart Process contract not verified — run scripts/discover-smart-process-contract.mjs"
    );
  }
  const missing = REQUIRED_SMART_PROCESS_FIELD_IDS
    .map((id, i) => ({ id, role: REQUIRED_SMART_PROCESS_FIELD_ROLE_NAMES[i] }))
    .filter((e) => !e.id);
  if (missing.length > 0) {
    throw new Error(
      `Smart Process contract incomplete — missing field IDs for: ${missing
        .map((m) => m.role)
        .join(", ")}`
    );
  }
}

const REQUIRED_SMART_PROCESS_FIELD_ROLE_NAMES = [
  "Дата отправки",
  "Сделка",
  "Марка (ГЕЛЬ)",
  "Марка (ЗОЛЬ)",
  "Результат тестирования",
  "Кол-во (ГЕЛЬ) кг",
  "Кол-во (ЗОЛЬ) л",
] as const;

/** Stable semantic class for an arbitrary stage ID (unknown → undefined). */
export function smartProcessStageSemantic(stageId: string | undefined): SmartProcessStageSemantic | undefined {
  if (!stageId) return undefined;
  return SMART_PROCESS_STAGE_SEMANTICS[stageId];
}

/** Whether the stage belongs to an active (WIP) cycle. */
export function isSmartProcessActiveStage(stageId: string | undefined): boolean {
  return Boolean(stageId && SMART_PROCESS_ACTIVE_STAGES.has(stageId));
}

/** Whether the stage terminates a cycle. */
export function isSmartProcessTerminalStage(stageId: string | undefined): boolean {
  return Boolean(stageId && SMART_PROCESS_TERMINAL_STAGES.has(stageId));
}
