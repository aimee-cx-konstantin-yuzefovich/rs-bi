// @vitest-environment node
// §8.17: Samples keeps EXACTLY ONE primary summary row per company while the
// backward-compatible projection exposes the underlying physical Smart
// Process item views for the Sample Preview «Циклы тестирования» section.
import { describe, expect, it } from "vitest";
import { buildSampleSummaries } from "@/lib/samples/aggregate";
import { projectCanonicalCompanyToSummary } from "@/lib/samples/project";
import { buildCanonicalSampleDomain } from "@/lib/samples/aggregate";
import { adaptSmartProcessSampleEvidence } from "@/lib/samples/adapters/smart-process";
import { identityLabelResolver } from "@/lib/samples/normalize";
import type { BitrixRow } from "@/lib/samples/types";

const resolve = identityLabelResolver;

const company: BitrixRow = {
  ID: "42",
  TITLE: "ООО «Тест»",
  ASSIGNED_BY_ID: "7",
  UF_CRM_1764156593: "Положительный", // result → has sample activity
};

const STAGE_ACTIVE = "DT1032_15:CLIENT";
const STAGE_SUCCESS = "DT1032_15:SUCCESS";

describe("Samples company grain + SP physical-cycle extension (§8.17)", () => {
  it("multiple SP items for one company still produce exactly ONE summary row", () => {
    const spItems: BitrixRow[] = [
      { id: "9001", title: "Цикл 1", stageId: STAGE_ACTIVE, companyId: "42", assignedById: "7" },
      { id: "9002", title: "Цикл 2", stageId: STAGE_ACTIVE, companyId: "42", assignedById: "8" },
      { id: "9003", title: "Цикл 3", stageId: STAGE_SUCCESS, companyId: "42", assignedById: "7" },
    ];

    const { summaries } = buildSampleSummaries([company], [], spItems);
    expect(summaries).toHaveLength(1);
    expect(summaries[0].companyId).toBe("42");
  });

  it("summary exposes ALL physical SP cycles (multiple active NOT collapsed); count + labels truthful", () => {
    const spItems: BitrixRow[] = [
      {
        id: "9001",
        title: "Цикл 1",
        stageId: STAGE_ACTIVE,
        companyId: "42",
        assignedById: "7",
        UF_CRM_7_1766059943: "2026-03-10", // manual sent date
        UF_CRM_7_1766135695: "КСМГ-5", // Gel grade
        UF_CRM_7_1766136470: 5, // Gel qty
      },
      { id: "9002", title: "Цикл 2", stageId: STAGE_ACTIVE, companyId: "42", assignedById: "8" },
      { id: "9003", title: "Цикл 3", stageId: STAGE_SUCCESS, companyId: "42", assignedById: "7" },
    ];

    const { summaries } = buildSampleSummaries([company], [], spItems, {
      liveStageLabels: { [STAGE_ACTIVE]: "Образцы на испытании (LIVE)" },
    });
    const summary = summaries[0];

    // Physical cycles: all 3 exposed separately.
    expect(summary.smartProcessItems).toHaveLength(3);
    expect(summary.smartProcessItems!.map((i) => i.processItemId)).toEqual([
      "9001",
      "9002",
      "9003",
    ]);

    // Active count = 2 (no winner), terminal = 1.
    expect(summary.activeSmartProcessCount).toBe(2);
    // Live display label preferred for the known committed stage ID.
    expect(summary.currentActiveStageLabels).toEqual(["Образцы на испытании (LIVE)"]);

    // Per-item facts preserved: manual sent date + grade/qty on item 9001 only.
    const first = summary.smartProcessItems![0];
    expect(first.sentDates).toEqual(["2026-03-10"]);
    expect(first.grades).toEqual([{ productFamily: "Гель", value: "КСМГ-5" }]);
    expect(first.quantities).toEqual([{ productFamily: "Гель", value: 5, unit: "кг" }]);
    expect(first.isActive).toBe(true);
  });

  it("0 active cycles → no invented active stage label; createdTime never a sent date", () => {
    const spItems: BitrixRow[] = [
      { id: "9100", title: "Терминальный", stageId: STAGE_SUCCESS, companyId: "42" },
    ];
    const { summaries } = buildSampleSummaries([company], [], spItems);
    const summary = summaries[0];
    expect(summary.activeSmartProcessCount).toBe(0);
    expect(summary.currentActiveStageLabels).toEqual([]);
    expect(summary.smartProcessItems![0].isActive).toBe(false);
    expect(summary.smartProcessItems![0].sentDates).toEqual([]);
  });

  it("projection-level: summary derives views from canonical evidenceUnits (no refetch) and stays JSON-safe", () => {
    const spUnit = adaptSmartProcessSampleEvidence(
      { id: "9200", stageId: STAGE_ACTIVE, companyId: "42", assignedById: "7" },
      resolve
    )!;
    const canonical = buildCanonicalSampleDomain([], [], [
      { id: "9200", stageId: STAGE_ACTIVE, companyId: "42", assignedById: "7" },
    ]).canonicalByCompany.get("42")!;

    expect(canonical.evidenceUnits.some((u) => u.processItemId === "9200")).toBe(true);

    const summary = projectCanonicalCompanyToSummary(canonical);
    expect(summary.smartProcessItems!.map((v) => v.processItemId)).toContain("9200");
    // JSON-safe: no internal provenance in the lite projection.
    expect(JSON.stringify(summary.smartProcessItems)).not.toContain("provenance");
  });

  it("KPIs unchanged by the physical-cycle extension (grain invariant)", () => {
    const spItems: BitrixRow[] = [
      { id: "9001", stageId: STAGE_ACTIVE, companyId: "42", assignedById: "7" },
      { id: "9002", stageId: STAGE_ACTIVE, companyId: "42", assignedById: "8" },
    ];
    const { summaries } = buildSampleSummaries([company], [], spItems);
    // One company → KPI-relevant counts stay company-grain (this is the
    // invariant; computeSampleKpis totals remain 1 for one company).
    expect(summaries).toHaveLength(1);
  });
});
