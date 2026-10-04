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

/** Auxiliary custom UF deal field in Smart Process (unverified; must not determine linkedDealId). */
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

// ─── N-mode (useOriginalUfNames = "N") custom field-name contract ─────
// Official Bitrix24 REST contract (apidocs.bitrix24.com — Universal CRM
// Methods → Field Naming Conventions, crm.item.list, crm.item.fields):
// under `useOriginalUfNames = "N"` (the documented DEFAULT) custom field
// names are camelCase conversions of the original UF names, while standard
// fields stay standard camelCase and `id` remains the documented item
// identifier. The conversion is deterministic BUT has documented edge
// cases (mixed-letter names keep the original suffix after `ufCrm_`; on a
// converted-name collision the field is returned in original UPPER_CASE),
// so the N-mode transport name is NEVER hand-derived in production code:
// it is correlated from live `crm.item.fields` metadata via the documented
// `upperName` attribute, fail-closed.
// ─────────────────────────────────────────────────────────────────────

/**
 * The six required CUSTOM (UF) semantic roles whose N-mode transport names
 * must be resolved before any N-mode production read. The Deal relation
 (`parentId2`) and all other system fields are documented standard
 * Universal CRM fields — identical under Y and N — and never participate
 * in UF-name correlation.
 */
export const SMART_PROCESS_N_MODE_CUSTOM_ROLES: readonly string[] = [
  "SENT_DATE",
  "GRADE_GEL",
  "GRADE_SOL",
  "QTY_GEL",
  "QTY_SOL",
  "TEST_RESULT",
];

/** Minimal shape of one `crm.item.fields` field description (N-mode). */
export interface SmartProcessNModeFieldDescription {
  /** Documented metadata attribute: the original UPPER_CASE field name. */
  upperName?: unknown;
}

/** N-mode `crm.item.fields` `result.fields` map: N-mode name → description. */
export type SmartProcessNModeFieldMetadata = Record<
  string,
  SmartProcessNModeFieldDescription | undefined
>;

export interface SmartProcessNModeCorrelation {
  /** role → resolved N-mode transport name (ONLY uniquely-resolved roles). */
  resolved: Record<string, string>;
  /** role → candidate count (0 = missing, 1 = unique, >1 = ambiguous). */
  candidates: Record<string, number>;
  /** True when every required custom role resolved to EXACTLY ONE name. */
  complete: boolean;
}

/**
 * Correlates each required custom role's original UF field name to its
 * N-mode transport name using the documented `upperName` metadata
 * attribute ONLY. Pure and deterministic: a role matches an N-mode field
 * if and only if the field's `upperName` EQUALS the role's original field
 * name. Never positional, never display-title similarity, never
 * business-value based.
 *
 * Zero or multiple candidates for any role make the role unresolved —
 * callers MUST fail closed (N_MODE_FIELD_MAPPING_AMBIGUOUS).
 */
export function correlateSmartProcessNModeFieldNames(
  roleOriginalNames: Record<string, string>,
  nModeFields: SmartProcessNModeFieldMetadata | undefined | null
): SmartProcessNModeCorrelation {
  const resolved: Record<string, string> = {};
  const candidates: Record<string, number> = {};
  let complete = true;

  for (const role of SMART_PROCESS_N_MODE_CUSTOM_ROLES) {
    const originalName = roleOriginalNames[role];
    let count = 0;
    let matchedName: string | undefined;
    if (originalName && nModeFields && typeof nModeFields === "object") {
      for (const [fieldName, meta] of Object.entries(nModeFields)) {
        if (
          meta &&
          typeof meta === "object" &&
          typeof meta.upperName === "string" &&
          meta.upperName === originalName
        ) {
          count++;
          matchedName = fieldName;
        }
      }
    }
    candidates[role] = count;
    if (count === 1 && matchedName) {
      resolved[role] = matchedName;
    } else {
      complete = false;
    }
  }

  return { resolved, candidates, complete };
}

/**
 * Fail-closed gate for production N-mode reads: throws unless EVERY
 * required custom role resolved to exactly one N-mode name. Error text
 * carries semantic role names only — never raw field names or metadata.
 */
export function assertSmartProcessNModeContractComplete(
  correlation: SmartProcessNModeCorrelation
): void {
  if (correlation.complete) return;
  const broken = SMART_PROCESS_N_MODE_CUSTOM_ROLES.filter(
    (role) => correlation.candidates[role] !== 1
  ).map((role) =>
    correlation.candidates[role] === 0
      ? `${role}: MISSING`
      : `${role}: AMBIGUOUS(${correlation.candidates[role]})`
  );
  throw new Error(`N_MODE_FIELD_MAPPING_AMBIGUOUS: ${broken.join(", ")}`);
}

/**
 * Verified static N-mode (useOriginalUfNames = "N") transport names for the
 * six required custom roles. PROVENANCE: live-measured on the real portal
 * by scripts/verify-n-mode-field-contract.mjs — each name was correlated
 * deterministically from live `crm.item.fields` metadata via the
 * documented `upperName` attribute (exactly ONE candidate per role) and
 * every name was proven selectable in `crm.item.list` N-mode with the
 * documented `id` present (live verdict N_MODE_FIELD_CONTRACT_OK). The
 * names follow the officially documented regular conversion rule
 * (`UF_CRM_7_<digits>` → `ufCrm7_<digits>`); they are committed as data —
 * NEVER hand-derived at call sites — and are re-verified by the diagnostic
 * whenever portal behavior is in question.
 */
export const SMART_PROCESS_N_MODE_FIELD_NAMES: Readonly<Record<string, string>> = {
  SENT_DATE: "ufCrm7_1766059943",
  GRADE_GEL: "ufCrm7_1766135695",
  GRADE_SOL: "ufCrm7_1766136511",
  QTY_GEL: "ufCrm7_1766136470",
  QTY_SOL: "ufCrm7_1766136546",
  TEST_RESULT: "ufCrm7_1763036405",
};

/**
 * Fail-closed gate: the static N-mode mapping must cover EVERY required
 * custom role exactly once. A missing entry never reaches the transport.
 */
export function assertSmartProcessNModeMappingComplete(): void {
  const missing = SMART_PROCESS_N_MODE_CUSTOM_ROLES.filter(
    (role) => !SMART_PROCESS_N_MODE_FIELD_NAMES[role]
  );
  if (missing.length > 0) {
    throw new Error(
      `N_MODE_FIELD_MAPPING_AMBIGUOUS: missing N-mode names for ${missing.join(", ")}`
    );
  }
  const values = SMART_PROCESS_N_MODE_CUSTOM_ROLES.map(
    (role) => SMART_PROCESS_N_MODE_FIELD_NAMES[role]
  );
  if (new Set(values).size !== values.length) {
    throw new Error("N_MODE_FIELD_MAPPING_AMBIGUOUS: duplicate N-mode names across roles");
  }
}

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
