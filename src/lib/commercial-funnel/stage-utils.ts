// src/lib/commercial-funnel/stage-utils.ts
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
 * Checks whether a stage represents a terminal LOST state.
 * Matches "LOSE", "LOST", and category-prefixed "*:LOSE", "*:LOST" (case-insensitive).
 */
export function isTerminalLostStage(stageId?: string | null): boolean {
  if (!stageId || typeof stageId !== "string") return false;
  const s = stageId.trim().toUpperCase();
  return s === "LOSE" || s === "LOST" || s.endsWith(":LOSE") || s.endsWith(":LOST");
}

/**
 * Checks whether a stage is terminal (either WON or LOST).
 */
export function isTerminalStage(stageId?: string | null): boolean {
  return isTerminalWonStage(stageId) || isTerminalLostStage(stageId);
}

/**
 * Checks whether a deal stage is active (in-progress, not terminal WON or LOST).
 */
export function isDealActiveStage(stageId?: string | null): boolean {
  return !isTerminalStage(stageId);
}

/**
 * Checks whether a stage represents commercial progression beyond initial
 * exploratory/lost stages (not NEW, not PREPARATION, and not terminal lost).
 */
export function isProgressedCommercialStage(stageId?: string | null): boolean {
  if (!stageId || typeof stageId !== "string") return false;
  if (isTerminalLostStage(stageId)) return false;
  const s = stageId.trim().toUpperCase();
  const colonIdx = s.lastIndexOf(":");
  const key = colonIdx !== -1 ? s.slice(colonIdx + 1) : s;
  return key !== "NEW" && key !== "PREPARATION";
}
