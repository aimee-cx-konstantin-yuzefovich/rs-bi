// src/__tests__/samples-page-copy.test.ts
// ─────────────────────────────────────────────────────────────────────
// SMP-COPY-1 .. SMP-COPY-3: Samples page copy cleanup (WP2).
//
// - The registry granularity paragraph is fully removed from /samples
//   (no replacement, underlying Samples grain untouched).
// - KPI #2 communicates the distinct concept: «Компании с подтверждённой
//   передачей» / «есть ≥1 подтверждённая дата передачи».
// - KPI formulas are unchanged (computeSampleKpis invariants hold).
// ─────────────────────────────────────────────────────────────────────

import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";
import { SampleSummary } from "@/lib/samples/types";
import { computeSampleKpis } from "@/lib/samples/aggregate";

const repoRoot = process.cwd();
const readSrc = (rel: string): string =>
  fs.readFileSync(path.resolve(repoRoot, rel), "utf-8");

const GRANULARITY_SNIPPET =
  "Зернистость реестра – компания: одна компания с активностью по образцам";

describe("Samples Page Copy (SMP-COPY-1 .. SMP-COPY-3)", () => {
  it("SMP-COPY-1: granularity paragraph is completely removed from /samples", () => {
    const page = readSrc("src/app/samples/page.tsx");
    expect(page).not.toContain(GRANULARITY_SNIPPET);
    expect(page).not.toContain("не является количеством физических");
  });

  it("SMP-COPY-2: KPI #2 title and subtitle communicate confirmed transfer", () => {
    const kpiCards = readSrc(
      "src/components/dashboard/samples/samples-kpi-cards.tsx"
    );
    expect(kpiCards).toContain("Компании с подтверждённой передачей");
    expect(kpiCards).toContain("есть ≥1 подтверждённая дата передачи");
    // Old copy is gone.
    expect(kpiCards).not.toContain("С переданными образцами");
    expect(kpiCards).not.toContain('"есть ≥1 дата передачи"');
  });

  it("SMP-COPY-3: KPI formulas unchanged (company grain, marker excluded)", () => {
    const summaries = [
      {
        companyId: "1",
        sentDates: ["2026-01-02"],
        processStatuses: ["Образцы отправлены"],
        sampleIndicators: [],
        normalizedResult: "pending",
        sourceQuality: "structured",
        relatedDeals: [],
      },
      {
        companyId: "2",
        sentDates: [],
        processStatuses: ["На испытании"],
        sampleIndicators: [],
        normalizedResult: "pending",
        sourceQuality: "structured",
        relatedDeals: [],
      },
    ] as unknown as SampleSummary[];

    const kpis = computeSampleKpis(summaries);
    // total = companies with sample activity; withSentDates = has ≥1 sent date.
    expect(kpis.total).toBe(2);
    expect(kpis.withSentDates).toBe(1);
    expect(kpis.inTesting).toBe(2);
  });
});
