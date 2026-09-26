// src/lib/commercial-funnel/stage-utils.ts
// ─────────────────────────────────────────────────────────────────────
// Backward-compatible re-export shim.
// The authoritative stage semantics now live in src/lib/stage-utils.ts so
// Dashboard, Commercial Funnel, filters, previews and reconciliation fixtures
// all share ONE authority (no duplicated literal arrays).
// ─────────────────────────────────────────────────────────────────────

export {
  isTerminalWonStage,
  isTerminalLostStage,
  isTerminalStage,
  isDealActiveStage,
  isProgressedCommercialStage,
} from "../stage-utils";
