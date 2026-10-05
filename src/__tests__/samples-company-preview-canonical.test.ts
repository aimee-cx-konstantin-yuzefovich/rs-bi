// src/__tests__/samples-company-preview-canonical.test.ts
// ─────────────────────────────────────────────────────────────────────
// SMP-CPRV-1 .. SMP-CPRV-3: ONE canonical Company Preview (WP4).
//
// One Samples registry row = one Company, therefore opening a company
// from /samples must use the SAME canonical CompanyPreview used from
// /companies. No duplicated Samples company card may exist.
// ─────────────────────────────────────────────────────────────────────

import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

const repoRoot = process.cwd();
const readSrc = (rel: string): string =>
  fs.readFileSync(path.resolve(repoRoot, rel), "utf-8");

const CANONICAL_PREVIEW_FILE = "src/components/dashboard/company-preview.tsx";

describe("Canonical Company Preview from Samples (SMP-CPRV-1 .. SMP-CPRV-3)", () => {
  it("SMP-CPRV-1: /samples imports and renders the canonical CompanyPreview", () => {
    const page = readSrc("src/app/samples/page.tsx");
    expect(page).toMatch(
      /import\s*\{\s*CompanyPreview\s*\}\s*from\s*"@\/components\/dashboard\/company-preview"/
    );
    expect(page).toMatch(/<CompanyPreview\b/);
  });

  it("SMP-CPRV-2: no second CompanyPreview implementation exists under samples/", () => {
    const dir = path.resolve(repoRoot, "src/components/dashboard/samples");
    const offenders: string[] = [];
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (!entry.isFile()) continue;
      const full = path.join(dir, entry.name);
      const content = fs.readFileSync(full, "utf-8");
      if (/CompanyPreviewModel|buildCompanyPreviewModel/.test(content)) {
        offenders.push(entry.name);
      }
    }
    expect(offenders).toEqual([]);
  });

  it("SMP-CPRV-3: canonical preview model owner unchanged", () => {
    const preview = readSrc(CANONICAL_PREVIEW_FILE);
    expect(preview).toMatch(/buildCompanyPreviewModel/);
    // The Samples page must not pass caller-specific field sets (contract:
    // callers pass navigation callbacks only).
    const page = readSrc("src/app/samples/page.tsx");
    expect(page).not.toMatch(/sampleFieldsFor|previewSampleFields|defaultSampleFields/);
  });
});
