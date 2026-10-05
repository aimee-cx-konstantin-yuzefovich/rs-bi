// src/__tests__/cf-interaction-colors.test.ts
// ─────────────────────────────────────────────────────────────────────
// UI-COL-1 .. UI-COL-4: Commercial Funnel interaction colors (WP9).
//
// - Only INTERACTION/SELECTION colors change: orange (accent) hover /
//   selected tints are replaced by the corporate blue family (bg-primary).
// - Semantic warning/error colors (rose/amber/destructive KPI accents,
//   data-quality banners) remain unchanged.
// ─────────────────────────────────────────────────────────────────────

import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

const repoRoot = process.cwd();
const read = (rel: string) =>
  fs.readFileSync(path.resolve(repoRoot, rel), "utf-8");

const CF_FILES = [
  "src/components/commercial-funnel/funnel-tab.tsx",
  "src/components/commercial-funnel/overview-tab.tsx",
  "src/components/commercial-funnel/segments-tab.tsx",
  "src/components/commercial-funnel/bottlenecks-tab.tsx",
];

describe("CF Interaction Colors (UI-COL-1 .. UI-COL-4)", () => {
  it("UI-COL-1: no orange accent interaction hover remains in CF tables/cards", () => {
    for (const file of CF_FILES) {
      const src = read(file);
      expect(src, file).not.toMatch(/hover:bg-accent\/\d+/);
      expect(src, file).not.toMatch(/bg-accent\/\d+\s/);
    }
  });

  it("UI-COL-2: selected/active rows and cards use the corporate blue family", () => {
    for (const file of CF_FILES) {
      const src = read(file);
      // Selected state token exists wherever selection state exists.
      if (src.includes("isSelected")) {
        expect(src.match(/bg-primary\/10/g)?.length ?? 0, file).toBeGreaterThan(0);
      }
      // Hover treatment uses the shared blue tint.
      if (src.includes("hover:bg-")) {
        expect(src.match(/hover:bg-primary\/5/g)?.length ?? 0, file).toBeGreaterThan(0);
      }
    }
  });

  it("UI-COL-3: semantic warning/error colors remain unchanged", () => {
    // Bottlenecks activity disclosure stays amber (warning semantic).
    const bottlenecks = read(CF_FILES[3]);
    expect(bottlenecks).toContain("bg-amber-50 dark:bg-amber-950/30");

    // At least one file retains a deliberate semantic rose/destructive accent
    // (KPI attention card) — warning semantics untouched.
    const overview = read(CF_FILES[1]);
    const hasSemanticAccent =
      overview.includes("text-rose-") ||
      overview.includes("bg-rose-") ||
      overview.includes("border-rose-") ||
      overview.includes("text-amber-");
    expect(hasSemanticAccent).toBe(true);
  });

  it("UI-COL-4: no new hardcoded hex blues invented (token discipline)", () => {
    for (const file of CF_FILES) {
      const src = read(file);
      // Only token classes: bg-primary/*, text-primary, border-primary/*.
      const hexBlues = src.match(/bg-\[#?[0-9a-fA-F]{3,8}\b/g) ?? [];
      for (const hex of hexBlues) {
        // Allowlist none — CF must not introduce hex interaction blues.
        expect(hex.toLowerCase(), file).not.toMatch(/bg-#(00|1e|25|3b|60a5|3b82)/);
      }
    }
  });
});
