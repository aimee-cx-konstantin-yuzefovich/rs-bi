// @vitest-environment node
// src/__tests__/request-generation.test.ts
// Unit tests for the ONE shared request-generation guard primitive used by
// all three client session caches (Samples, Commercial Funnel, Smart Process).
import { describe, it, expect } from "vitest";
import { createRequestGenerationGuard } from "@/lib/request-generation";

describe("createRequestGenerationGuard", () => {
  it("allocates monotonic generations", () => {
    const guard = createRequestGenerationGuard();
    const a = guard.begin();
    const b = guard.begin();
    const c = guard.begin();
    expect(a).toBe(1);
    expect(b).toBe(2);
    expect(c).toBe(3);
  });

  it("only the latest allocated generation may commit", () => {
    const guard = createRequestGenerationGuard();
    const a = guard.begin();
    const b = guard.begin();
    expect(guard.canCommit(a)).toBe(false); // A is stale
    expect(guard.canCommit(b)).toBe(true); // B is latest
  });

  it("invalidate retires the current generation: nothing may commit", () => {
    const guard = createRequestGenerationGuard();
    const a = guard.begin();
    guard.invalidate();
    expect(guard.canCommit(a)).toBe(false);
    // After invalidation, only a NEW begin can commit again.
    const b = guard.begin();
    expect(guard.canCommit(b)).toBe(true);
  });

  it("a completion from before invalidation can never commit afterwards", () => {
    const guard = createRequestGenerationGuard();
    const a = guard.begin();
    const b = guard.begin(); // B starts later
    expect(guard.canCommit(b)).toBe(true);
    guard.invalidate(); // principal change mid-flight
    expect(guard.canCommit(b)).toBe(false);
    const c = guard.begin();
    expect(guard.canCommit(a)).toBe(false);
    expect(guard.canCommit(c)).toBe(true);
  });
});
