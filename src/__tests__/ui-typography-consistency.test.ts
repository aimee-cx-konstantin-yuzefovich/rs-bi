// src/__tests__/ui-typography-consistency.test.ts
// ─────────────────────────────────────────────────────────────────────
// UI-TYPO-1 .. UI-TYPO-4: Global typography + visible app version.
//
// Invariants:
// - Roboto is the ONE visible portal font family, applied through the
//   existing root/layout/global font architecture (no per-component loads).
// - Nunito (the previous --font-sans override) must be fully unwired.
// - The visible app version is 3.9 from the ONE canonical source
//   (src/lib/product-identity.ts) — no old visible version anywhere.
// ─────────────────────────────────────────────────────────────────────

import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";
import * as ProductIdentity from "@/lib/product-identity";

const repoRoot = process.cwd();
const readSrc = (rel: string): string =>
  fs.readFileSync(path.resolve(repoRoot, rel), "utf-8");

describe("UI Typography Consistency (UI-TYPO-1 .. UI-TYPO-4)", () => {
  it("UI-TYPO-1: global --font-sans resolves to Roboto in globals.css", () => {
    const css = readSrc("src/app/globals.css");
    expect(css).toMatch(/--font-sans:\s*var\(--font-roboto\)/);
    // Heading token also stays on Roboto.
    expect(css).toMatch(/--font-heading:\s*var\(--font-roboto\)/);
  });

  it("UI-TYPO-2: Nunito override is fully unwired from the root architecture", () => {
    const css = readSrc("src/app/globals.css");
    expect(css).not.toMatch(/--font-nunito/);

    const layout = readSrc("src/app/layout.tsx");
    expect(layout).not.toMatch(/Nunito/);
    expect(layout).not.toMatch(/font-nunito/);
    // Roboto is loaded once via next/font with the --font-roboto variable.
    expect(layout).toMatch(/import\s*\{\s*Roboto,\s*Roboto_Mono\s*\}\s*from\s*"next\/font\/google"/);
    expect(layout).toMatch(/variable:\s*"--font-roboto"/);
    expect(layout).toMatch(/roboto\.variable/);
  });

  it("UI-TYPO-3: canonical visible app version is 3.9", () => {
    expect(ProductIdentity.PRODUCT_VERSION).toBe("3.9");
    expect(ProductIdentity.PRODUCT_FOOTER_TEXT).toContain("v3.9");
  });

  it("UI-TYPO-4: no old visible portal version remains in product surfaces", () => {
    // Scan all visible product source for stale version strings.
    // Excludes numeric coincidences (IPs, dates) by requiring the
    // version-prefixed token form (v3.x) or PRODUCT_VERSION literals.
    const srcDir = path.resolve(repoRoot, "src");
    const offenders: string[] = [];
    const walk = (dir: string) => {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          walk(full);
          continue;
        }
        if (!/\.(tsx?|css)$/.test(entry.name)) continue;
        // Skip this test file itself (it contains the stale-version pattern
        // as the very string it guards against).
        if (full.endsWith("ui-typography-consistency.test.ts")) continue;
        const content = fs.readFileSync(full, "utf-8");
        // Visible old version token "v3.1" (preceded by whitespace, quote,
        // or markup) — IP addresses / dates never match this form.
        if (/["'`\s>]v3\.1\b/.test(content)) {
          offenders.push(path.relative(repoRoot, full));
        }
      }
    };
    walk(srcDir);
    expect(offenders).toEqual([]);
  });
});
