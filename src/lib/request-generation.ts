// src/lib/request-generation.ts
// ─────────────────────────────────────────────────────────────────────
// ONE tiny deterministic request-generation guard shared by the three
// client session caches (Samples, Commercial Funnel, full-scope Smart
// Process).
//
// Race it prevents (out-of-order cache commits):
//   request A starts → request B starts later → B succeeds first →
//   A succeeds last. Without a guard, A's late completion overwrites B
//   in the shared cache. With the guard, only the LATEST allocated
//   generation may commit; A still resolves to its own caller but can
//   never overwrite the shared snapshot.
//
// Semantics:
// - `begin()` allocates a new generation (monotonic counter) and makes
//   it the only committable one.
// - `canCommit(gen)` is true only for the latest allocated generation.
// - `invalidate()` retires the current generation so NOTHING may commit
//   until the next `begin()` — used on cache clear / principal change.
//
// In-memory only; no persistence; no timers; not reactive.
// ─────────────────────────────────────────────────────────────────────

export interface RequestGenerationGuard {
  /** Allocates the next generation; only the returned value may commit. */
  begin(): number;
  /** True only when `gen` is the latest allocated (not invalidated) generation. */
  canCommit(gen: number): boolean;
  /** Retires the current generation: no in-flight completion may commit. */
  invalidate(): void;
}

export function createRequestGenerationGuard(): RequestGenerationGuard {
  let latest = 0;
  return {
    begin() {
      latest += 1;
      return latest;
    },
    canCommit(gen: number) {
      return gen === latest;
    },
    invalidate() {
      // Bump past every previously allocated generation.
      latest += 1;
    },
  };
}
