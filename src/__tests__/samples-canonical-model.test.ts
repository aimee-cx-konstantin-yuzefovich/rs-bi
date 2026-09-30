// @vitest-environment node
// src/__tests__/samples-canonical-model.test.ts
// Unit tests for Samples Phase B canonical model, provenance, legacy adapters,
// current-vs-history separation, and marker isolation.

import { describe, expect, it } from "vitest";
import { adaptLegacyCompanySampleEvidence } from "@/lib/samples/adapters/company-legacy";
import { adaptLegacyDealSampleEvidence } from "@/lib/samples/adapters/deal-legacy";
import { reconcileCompanySample } from "@/lib/samples/reconcile";
import { projectCanonicalCompanyToSummary } from "@/lib/samples/project";
import { identityLabelResolver } from "@/lib/samples/normalize";
import {
  COMPANY_SAMPLES_DATE_MULTI_FIELD_ID,
  COMPANY_SAMPLES_FIELD_ID,
  COMPANY_SAMPLES_GRADE_GEL_FIELD_ID,
  COMPANY_SAMPLES_GRADE_SOL_FIELD_ID,
  COMPANY_TEST_RESULT_FIELD_ID,
  DEAL_SAMPLE_SENT_DATE_FIELD_ID,
  DEAL_SAMPLE_TESTING_FIELD_ID,
  DEAL_SAMPLE_TRANSFER_FIELD_ID,
} from "@/lib/samples/constants";
import type { BitrixRow } from "@/lib/samples/types";

describe("Canonical Model — Historical Evidence & Provenance (H1–H4)", () => {
  it("TEST H1 — Company history preserved (two sent dates)", () => {
    const row: BitrixRow = {
      ID: "10",
      TITLE: "ООО «Тест»",
      ASSIGNED_BY_ID: "5",
      [COMPANY_SAMPLES_DATE_MULTI_FIELD_ID]: ["2026-01-10", "2026-02-15"],
    };
    const unit = adaptLegacyCompanySampleEvidence(row, identityLabelResolver)!;
    expect(unit).not.toBeNull();
    expect(unit.sentDates).toHaveLength(2);
    expect(unit.sentDates.map((s) => s.date)).toEqual(["2026-01-10", "2026-02-15"]);

    const canonical = reconcileCompanySample({
      companyId: "10",
      companyTitle: "ООО «Тест»",
      companyResponsibleId: "5",
      companyEvidence: unit,
      dealEvidences: [],
    });
    expect(canonical.historicalSentDates).toHaveLength(2);

    const summary = projectCanonicalCompanyToSummary(canonical);
    expect(summary.sentDates).toEqual(["2026-01-10", "2026-02-15"]);
  });

  it("TEST H2 — Company aggregate does not fabricate pairings between parallel arrays", () => {
    const row: BitrixRow = {
      ID: "20",
      TITLE: "ООО «Тест 20»",
      [COMPANY_SAMPLES_DATE_MULTI_FIELD_ID]: ["2026-03-01", "2026-04-01"],
      [COMPANY_SAMPLES_GRADE_GEL_FIELD_ID]: ["КСМГ-1", "КСМГ-2"],
      [COMPANY_TEST_RESULT_FIELD_ID]: "Положительный",
    };
    const unit = adaptLegacyCompanySampleEvidence(row, identityLabelResolver)!;
    expect(unit.sourceGranularity).toBe("COMPANY_AGGREGATE");
    expect(unit.sentDates.map((d) => d.date)).toEqual(["2026-03-01", "2026-04-01"]);
    expect(unit.grades.map((g) => g.value)).toEqual(["КСМГ-1", "КСМГ-2"]);
    // Invariant: no individual pairing of date to grade exists in the unit
    expect(unit.sentDates[0]).not.toHaveProperty("grade");
    expect(unit.grades[0]).not.toHaveProperty("sentDate");
  });

  it("TEST H3 — Deal provenance retained strictly", () => {
    const dealRow: BitrixRow = {
      ID: "501",
      TITLE: "Сделка 501",
      COMPANY_ID: "30",
      ASSIGNED_BY_ID: "77",
      STAGE_ID: "PREPARATION",
      [DEAL_SAMPLE_TRANSFER_FIELD_ID]: "Переданы",
      [DEAL_SAMPLE_SENT_DATE_FIELD_ID]: "2026-05-01",
    };
    const unit = adaptLegacyDealSampleEvidence(dealRow, identityLabelResolver)!;
    expect(unit).not.toBeNull();
    expect(unit.source).toBe("DEAL_LEGACY");
    expect(unit.sourceGranularity).toBe("DEAL_RECORD");
    expect(unit.dealId).toBe("501");
    expect(unit.companyId).toBe("30");
    expect(unit.responsibleId).toBe("77");
    expect(unit.stageId).toBe("PREPARATION");
    expect(unit.sentDates[0].source).toBe("DEAL_LEGACY");
    expect(unit.sentDates[0].sourceEntityId).toBe("501");
  });

  it("TEST H4 — Company provenance retained strictly", () => {
    const compRow: BitrixRow = {
      ID: "40",
      TITLE: "ООО «Тест 40»",
      ASSIGNED_BY_ID: "88",
      [COMPANY_TEST_RESULT_FIELD_ID]: "Положительный",
    };
    const unit = adaptLegacyCompanySampleEvidence(compRow, identityLabelResolver)!;
    expect(unit).not.toBeNull();
    expect(unit.source).toBe("COMPANY_LEGACY");
    expect(unit.sourceGranularity).toBe("COMPANY_AGGREGATE");
    expect(unit.companyId).toBe("40");
    expect(unit.responsibleId).toBe("88");
  });
});

describe("Canonical Model — Current-State Resolution (C1–C5)", () => {
  it("TEST C1 — Only Company current-state evidence resolves to COMPANY_LEGACY", () => {
    const compRow: BitrixRow = {
      ID: "101",
      TITLE: "Ко 101",
      [COMPANY_SAMPLES_FIELD_ID]: ["Образцы отправлены"],
    };
    const compUnit = adaptLegacyCompanySampleEvidence(compRow, identityLabelResolver)!;
    const canonical = reconcileCompanySample({
      companyId: "101",
      companyTitle: "Ко 101",
      companyEvidence: compUnit,
      dealEvidences: [],
    });
    expect(canonical.currentState.source).toBe("COMPANY_LEGACY");
    expect(canonical.currentState.quality).toBe("RESOLVED");
    expect(canonical.currentState.statusValues).toEqual(["Образцы отправлены"]);
  });

  it("TEST C2 — One unambiguous Deal current-state takes precedence over Company", () => {
    const compRow: BitrixRow = {
      ID: "102",
      TITLE: "Ко 102",
      [COMPANY_SAMPLES_FIELD_ID]: ["Старый статус"],
    };
    const dealRow: BitrixRow = {
      ID: "902",
      COMPANY_ID: "102",
      [DEAL_SAMPLE_TRANSFER_FIELD_ID]: "Переданы",
    };
    const compUnit = adaptLegacyCompanySampleEvidence(compRow, identityLabelResolver)!;
    const dealUnit = adaptLegacyDealSampleEvidence(dealRow, identityLabelResolver)!;

    const canonical = reconcileCompanySample({
      companyId: "102",
      companyTitle: "Ко 102",
      companyEvidence: compUnit,
      dealEvidences: [dealUnit],
    });
    expect(canonical.currentState.source).toBe("DEAL_LEGACY");
    expect(canonical.currentState.quality).toBe("RESOLVED");
    expect(canonical.currentState.winningDealId).toBe("902");
    expect(canonical.currentState.statusValues).toEqual(["Переданы"]);
  });

  it("TEST C3 — Two Deal candidates with conflicting evidence result in AMBIGUOUS (no arbitrary tie-breaking)", () => {
    const dealRow1: BitrixRow = {
      ID: "903A",
      COMPANY_ID: "103",
      [DEAL_SAMPLE_TRANSFER_FIELD_ID]: "Переданы",
    };
    const dealRow2: BitrixRow = {
      ID: "903B",
      COMPANY_ID: "103",
      [DEAL_SAMPLE_TRANSFER_FIELD_ID]: "Не переданы",
    };
    const dealUnit1 = adaptLegacyDealSampleEvidence(dealRow1, identityLabelResolver)!;
    const dealUnit2 = adaptLegacyDealSampleEvidence(dealRow2, identityLabelResolver)!;

    const canonical = reconcileCompanySample({
      companyId: "103",
      companyTitle: "Ко 103",
      companyEvidence: null,
      dealEvidences: [dealUnit1, dealUnit2],
    });
    expect(canonical.currentState.source).toBe("DEAL_LEGACY");
    expect(canonical.currentState.quality).toBe("AMBIGUOUS");
    expect(canonical.sourceQuality).toBe("ambiguous");
    expect(canonical.dataIssues).toContain("deal_company_status_mismatch");
  });

  it("TEST C4 — No state evidence resolves to NONE", () => {
    const compRow: BitrixRow = {
      ID: "104",
      TITLE: "Ко 104",
      [COMPANY_SAMPLES_GRADE_GEL_FIELD_ID]: ["КСМГ"], // has structured grade, but no state/status
    };
    const compUnit = adaptLegacyCompanySampleEvidence(compRow, identityLabelResolver)!;
    const canonical = reconcileCompanySample({
      companyId: "104",
      companyTitle: "Ко 104",
      companyEvidence: compUnit,
      dealEvidences: [],
    });
    expect(canonical.currentState.source).toBe("NONE");
    expect(canonical.currentState.quality).toBe("NONE");
  });

  it("TEST C5 — Marker-only Deal is isolated from analytical state", () => {
    const dealRow: BitrixRow = {
      ID: "905",
      COMPANY_ID: "105",
      [DEAL_SAMPLE_TESTING_FIELD_ID]: ["Тестирование образцов"],
    };
    const dealUnit = adaptLegacyDealSampleEvidence(dealRow, identityLabelResolver)!;
    expect(dealUnit.navigationMarkerPresent).toBe(true);
    expect(dealUnit.statusEvidence).toHaveLength(0); // isolated from status evidence

    const canonical = reconcileCompanySample({
      companyId: "105",
      companyTitle: "Ко 105",
      companyEvidence: null,
      dealEvidences: [dealUnit],
    });
    expect(canonical.hasMarkerOnlyDealActivity).toBe(true);
    expect(canonical.currentState.source).toBe("NONE");
    expect(canonical.currentState.quality).toBe("NONE");

    const summary = projectCanonicalCompanyToSummary(canonical);
    expect(summary.processStatuses).toHaveLength(0);
    expect(summary.relatedDeals[0].sampleTestingStatus).toEqual(["Тестирование образцов"]);
  });
});

describe("Canonical Model — Invariants & Edge Cases", () => {
  it("History ≠ Current: Current Deal precedence does not erase older Company sent dates", () => {
    const compRow: BitrixRow = {
      ID: "201",
      TITLE: "Ко 201",
      [COMPANY_SAMPLES_DATE_MULTI_FIELD_ID]: ["2025-06-01"],
    };
    const dealRow: BitrixRow = {
      ID: "801",
      COMPANY_ID: "201",
      [DEAL_SAMPLE_TRANSFER_FIELD_ID]: "Переданы",
      [DEAL_SAMPLE_SENT_DATE_FIELD_ID]: "2026-02-01",
    };
    const compUnit = adaptLegacyCompanySampleEvidence(compRow, identityLabelResolver)!;
    const dealUnit = adaptLegacyDealSampleEvidence(dealRow, identityLabelResolver)!;

    const canonical = reconcileCompanySample({
      companyId: "201",
      companyTitle: "Ко 201",
      companyEvidence: compUnit,
      dealEvidences: [dealUnit],
    });
    expect(canonical.currentState.source).toBe("DEAL_LEGACY");
    expect(canonical.historicalSentDates.map((s) => s.date)).toEqual([
      "2025-06-01",
      "2026-02-01",
    ]);

    const summary = projectCanonicalCompanyToSummary(canonical);
    expect(summary.sentDates).toEqual(["2025-06-01", "2026-02-01"]);
    expect(summary.latestRelevantDate).toBe("2026-02-01");
  });

  it("Cross-Source Date Dedupe: Identical date kept once in summary with dual internal provenance", () => {
    const compRow: BitrixRow = {
      ID: "202",
      TITLE: "Ко 202",
      [COMPANY_SAMPLES_DATE_MULTI_FIELD_ID]: ["2026-05-10"],
    };
    const dealRow: BitrixRow = {
      ID: "802",
      COMPANY_ID: "202",
      [DEAL_SAMPLE_SENT_DATE_FIELD_ID]: "2026-05-10",
    };
    const compUnit = adaptLegacyCompanySampleEvidence(compRow, identityLabelResolver)!;
    const dealUnit = adaptLegacyDealSampleEvidence(dealRow, identityLabelResolver)!;

    const canonical = reconcileCompanySample({
      companyId: "202",
      companyTitle: "Ко 202",
      companyEvidence: compUnit,
      dealEvidences: [dealUnit],
    });
    // Two provenance records preserved internally
    expect(canonical.historicalSentDates).toHaveLength(2);
    expect(canonical.historicalSentDates[0].source).toBe("COMPANY_LEGACY");
    expect(canonical.historicalSentDates[1].source).toBe("DEAL_LEGACY");

    // Projected summary collapses to a single deduplicated string
    const summary = projectCanonicalCompanyToSummary(canonical);
    expect(summary.sentDates).toEqual(["2026-05-10"]);
  });

  it("Adapters are pure and do not mutate raw BitrixRow inputs", () => {
    const compRow: BitrixRow = {
      ID: "301",
      TITLE: "Ко 301",
      [COMPANY_TEST_RESULT_FIELD_ID]: "Положительный",
    };
    const dealRow: BitrixRow = {
      ID: "701",
      TITLE: "Сделка 701",
      COMPANY_ID: "301",
      [DEAL_SAMPLE_TRANSFER_FIELD_ID]: "Переданы",
    };

    const compSnapshot = JSON.stringify(compRow);
    const dealSnapshot = JSON.stringify(dealRow);

    adaptLegacyCompanySampleEvidence(compRow, identityLabelResolver);
    adaptLegacyDealSampleEvidence(dealRow, identityLabelResolver);

    expect(JSON.stringify(compRow)).toBe(compSnapshot);
    expect(JSON.stringify(dealRow)).toBe(dealSnapshot);
  });
});
