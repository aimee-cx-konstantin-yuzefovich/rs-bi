// @vitest-environment node
// §8.18: Commercial Funnel consumes ONLY the canonical sample state.
// Static repository assertions mirror the marker-isolation pattern:
// funnel surfaces never import the raw SP adapter, never parse raw
// UF fields, and never classify stages by Russian wording.
import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";

const FUNNEL_DIR = resolve(process.cwd(), "src/lib/commercial-funnel");
const FUNNEL_UI_DIR = resolve(process.cwd(), "src/components/commercial-funnel");

function listFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry);
    if (statSync(p).isDirectory()) out.push(...listFiles(p));
    else if (/\.(ts|tsx)$/.test(entry)) out.push(p);
  }
  return out;
}

const funnelFiles = [...listFiles(FUNNEL_DIR), ...listFiles(FUNNEL_UI_DIR)];

describe("Commercial Funnel canonical-only SP integration (§8.18)", () => {
  it("no funnel file imports the raw Smart Process adapter or fetches SP directly", () => {
    for (const file of funnelFiles) {
      const src = readFileSync(file, "utf8");
      expect(src, file).not.toMatch(/adapters\/smart-process/);
      expect(src, file).not.toMatch(/from ["']@\/lib\/samples\/bitrix-fetch["']/);
      expect(src, file).not.toMatch(/fetchSmartProcessSampleItems/);
      expect(src, file).not.toMatch(/smart-process-client-cache/);
    }
  });

  it("no funnel file contains raw DT1032_* stage literals or wording-based stage classification", () => {
    // Pre-existing committed exceptions: demo-data fixtures and the static
    // stage-label map (constants.ts) legitimately reference stable stage IDs.
    const allowed = new Set(
      ["constants.ts", "demo-data.ts"].map((f) => join(FUNNEL_DIR, f))
    );
    for (const file of funnelFiles) {
      const src = readFileSync(file, "utf8");
      if (!allowed.has(file)) {
        expect(src, file).not.toMatch(/DT1032_/);
      }
      // Never classify by Russian wording: no classifying a raw stage value
      // by matching it against a human stage NAME (pre-existing attention
      // WAITING-day strings are labels, not stage classification).
      expect(src, file).not.toMatch(/===\s*["']Образцы на испытании["']/);
      expect(src, file).not.toMatch(/match\(\s*["']\/Образцы/);
      expect(src, file).not.toMatch(/stageId.*===.*["']Подошли["']/);
    }
  });

  it("funnel normalization derives active SP presentation facts through the canonical stage contract", () => {
    const normalize = readFileSync(join(FUNNEL_DIR, "normalize.ts"), "utf8");
    // Canonical source: the committed stage contract helper (stable IDs).
    expect(normalize).toMatch(/isSmartProcessActiveStage/);
    expect(normalize).toMatch(/smart-process-contract/);
    // Presentation fields are additive; canonical semantics untouched.
    expect(normalize).toMatch(/sampleActiveSmartProcessCount/);
    expect(normalize).toMatch(/sampleActiveStageLabels/);
  });

  it("the canonical sample engine remains the single domain builder used by the funnel route", () => {
    const route = readFileSync(
      resolve(process.cwd(), "src/app/api/bitrix/commercial-funnel/route.ts"),
      "utf8"
    );
    expect(route).toMatch(/buildCanonicalSampleDomain/);
    expect(route).toMatch(/applyCanonicalSampleDomain/);
    // The funnel route fetches SP through the SAME authoritative fetch seam.
    expect(route).toMatch(/fetchSmartProcessSampleItems/);
  });
});
