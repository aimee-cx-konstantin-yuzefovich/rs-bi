// src/lib/stage-utils.ts
// ─────────────────────────────────────────────────────────────────────
// Central authoritative stage semantic helpers for Commercial Funnel.
// Handles category-prefixed Bitrix deal stages (e.g. C1:WON, C7:LOSE, C7:LOST).
// ─────────────────────────────────────────────────────────────────────

/**
 * Checks whether a stage represents a terminal WON state.
 * Matches "WON" and category-prefixed "*:WON" (case-insensitive).
 */
export function isTerminalWonStage(stageId?: string | null): boolean {
  if (!stageId || typeof stageId !== "string") return false;
  const s = stageId.trim().toUpperCase();
  return s === "WON" || s.endsWith(":WON");
}

/**
 * Verified live Bitrix terminal lost/apology stages across pipeline categories.
 * For analytics, apology = terminal non-success.
 */
const TERMINAL_LOST_STAGES = new Set([
  // Category 0 (Общая воронка)
  "LOSE",
  "LOST",
  "APOLOGY",
  "1", // apology — Не согласовали договор
  "2", // apology — Не устроили параметры продукта
  "4", // apology — Другое
  "C0:LOSE",
  "C0:LOST",
  "C0:APOLOGY",
  "C0:1",
  "C0:2",
  "C0:4",
  // Category 1 (Сборка и Доставка заказа)
  "C1:LOSE",
  "C1:LOST",
  "C1:APOLOGY",
  "C1:3",
  "C1:4",
  "C1:5",
  "C1:6",
  // Category 3 (Постпродажное сотрудничество)
  "C3:LOSE",
  "C3:LOST",
  "C3:APOLOGY",
  "C3:2",
  "C3:3",
  // Category 5 (Работа с потенциальными клиентами)
  "C5:LOSE",
  "C5:LOST",
  "C5:APOLOGY",
  // Category 7 (Разработка продукта)
  "C7:LOSE",
  "C7:LOST",
]);

/**
 * Checks whether a stage represents a terminal LOST / APOLOGY state.
 * Matches exact registered terminal lost stages and category-prefixed "*:LOSE", "*:LOST", "*:APOLOGY".
 */
export function isTerminalLostStage(stageId?: string | null): boolean {
  if (!stageId || typeof stageId !== "string") return false;
  const s = stageId.trim().toUpperCase();
  if (TERMINAL_LOST_STAGES.has(s)) return true;
  return (
    s.endsWith(":LOSE") ||
    s.endsWith(":LOST") ||
    s.endsWith(":APOLOGY")
  );
}

/**
 * Checks whether a stage is terminal (either WON or LOST/APOLOGY).
 */
export function isTerminalStage(stageId?: string | null): boolean {
  return isTerminalWonStage(stageId) || isTerminalLostStage(stageId);
}

/**
 * Verified known active base stages across pipelines.
 */
const KNOWN_ACTIVE_BASE_STAGES = new Set([
  "NEW",
  "EXECUTING",
  "UC_SP94UZ",
  "8",
  "PREPARATION",
  "5",
  "6",
  "9",
  "10",
  "11",
  "7",
  "PREPAYMENT_INVOICE",
  "FINAL_INVOICE",
  "INVOICE_SENT",
  "IN_PROGRESS",
  "PROCESS",
]);

export type DealStageSemantics = "ACTIVE" | "TERMINAL_WON" | "TERMINAL_LOST" | "UNKNOWN";

/**
 * Checks whether a stage is a verified known active stage.
 */
export function isKnownActiveStage(stageId?: string | null): boolean {
  if (!stageId || typeof stageId !== "string" || !stageId.trim()) return false;
  const s = stageId.trim().toUpperCase();
  if (isTerminalStage(s)) return false;
  const colonIdx = s.lastIndexOf(":");
  const key = colonIdx !== -1 ? s.slice(colonIdx + 1) : s;
  return KNOWN_ACTIVE_BASE_STAGES.has(key);
}

/**
 * Evaluates canonical stage semantics: ACTIVE, TERMINAL_WON, TERMINAL_LOST, or UNKNOWN.
 * Unknown or empty stages fail closed to "UNKNOWN".
 */
export function getDealStageSemantics(stageId?: string | null): DealStageSemantics {
  if (!stageId || typeof stageId !== "string" || !stageId.trim()) return "UNKNOWN";
  if (isTerminalWonStage(stageId)) return "TERMINAL_WON";
  if (isTerminalLostStage(stageId)) return "TERMINAL_LOST";
  if (isKnownActiveStage(stageId)) return "ACTIVE";
  return "UNKNOWN";
}

/**
 * Checks whether a deal stage is active (in-progress).
 * Fail-closed: only known ACTIVE stages evaluate to true; unknown or empty stages return false.
 */
export function isDealActiveStage(stageId?: string | null): boolean {
  return isKnownActiveStage(stageId);
}

/**
 * Category 0 commercial progression stages after initial technical/sample path.
 * 8: Согласование предложения с руководством
 * PREPARATION: Согласование / подписание договора
 * 5: Выставление счета
 * 6: Подписание спецификации
 * 9: Получение оплаты
 * 10: Производство
 * 11: Склад
 * 7: Отгрузка
 * WON: Успешная сделка
 */
const CATEGORY_0_COMMERCIAL_CONTINUATION_STAGES = new Set([
  "8",
  "PREPARATION",
  "5",
  "6",
  "9",
  "10",
  "11",
  "7",
  "WON",
]);

/**
 * Evaluates whether a deal stage represents genuine commercial continuation
 * after a positive sample testing outcome («Положительный результат → коммерческое продолжение»).
 *
 * For Category 0:
 * - Includes: 8, PREPARATION, 5, 6, 9, 10, 11, 7, WON
 * - Excludes: UC_SP94UZ (sample testing), NEW, EXECUTING, and all terminal failure/apology stages (1, 2, 4, LOSE, APOLOGY)
 * For Category 1/3/5/7:
 * - Conservative: returns false unless an explicit accepted business mapping exists.
 */
export function isCommercialContinuationStage(
  stageId?: string | null,
  categoryId?: string | number | null
): boolean {
  if (!stageId || typeof stageId !== "string") return false;
  const s = stageId.trim().toUpperCase();

  const colonIdx = s.lastIndexOf(":");
  let categoryStr: string;
  let stageKey: string;

  if (colonIdx !== -1) {
    const prefix = s.slice(0, colonIdx);
    stageKey = s.slice(colonIdx + 1);
    categoryStr = prefix.startsWith("C") ? prefix.slice(1) : prefix;
  } else {
    stageKey = s;
    categoryStr =
      categoryId !== undefined && categoryId !== null ? String(categoryId).trim() : "0";
  }

  // Only Category 0 has an authoritative accepted commercial continuation mapping
  if (categoryStr === "0" || categoryStr === "") {
    return CATEGORY_0_COMMERCIAL_CONTINUATION_STAGES.has(stageKey);
  }

  return false;
}

/**
 * @deprecated Use isCommercialContinuationStage(stageId, categoryId).
 * Preserved as backward-compatibility shim for Category 0 default context.
 */
export function isProgressedCommercialStage(stageId?: string | null): boolean {
  return isCommercialContinuationStage(stageId, "0");
}
