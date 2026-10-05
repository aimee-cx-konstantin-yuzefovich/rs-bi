// @vitest-environment node
// src/__tests__/samples-n-mode-integration.test.ts
// ─────────────────────────────────────────────────────────────────────
// INTEGRATED PRODUCTION PATH (deterministic, no live network):
//
//   N-mode Bitrix SP fixture (crm.item.list row, useOriginalUfNames="N")
//     → REAL production transport normalizer (normalizeSmartProcessNModeRow)
//     → REAL canonical SP adapter (adaptSmartProcessSampleEvidence)
//     → REAL Samples aggregation (buildCanonicalSampleDomain /
//       buildSampleSummaries / projectCanonicalCompanyToSummary)
//     → REAL KPI derivation (computeSampleKpis)
//
// The test exercises the ACTUAL production modules — no copied or
// re-implemented business logic. Non-regression for the frozen N-mode
// contract:
//
// - all six verified N-mode aliases reach the canonical original UF keys
//   (downstream code never sees N-mode names);
// - the documented `id` remains required (missing id fails closed);
// - the manual «Дата отправки» field is the ONLY dated samples_sent
//   source (createdTime is chronology, never an event);
// - Deal UF `UF_CRM_1779394379` («Тестирование образцов») remains
//   MARKER_ONLY: never a sample status/result/KPI/current-contour fact;
// - Company/Deal relation conflict and multiple-active ambiguity behavior
//   unchanged (fail-closed / no fabricated winner);
// - SP responsible (item's own ASSIGNED_BY_ID) and Company responsible
//   (Company ASSIGNED_BY_ID) remain separate facts.
// ─────────────────────────────────────────────────────────────────────
import { describe, it, expect } from "vitest";
import {
  normalizeSmartProcessNModeRow,
  SMART_PROCESS_ITEM_SELECT_N,
  SMART_PROCESS_ROLE_FIELD_IDS,
} from "@/lib/samples/bitrix-fetch";
import {
  SMART_PROCESS_N_MODE_CUSTOM_ROLES,
  SMART_PROCESS_N_MODE_FIELD_NAMES,
  SMART_PROCESS_SENT_DATE_FIELD_ID,
  SMART_PROCESS_DEAL_FIELD_ID,
} from "@/lib/samples/smart-process-contract";
import { adaptSmartProcessSampleEvidence } from "@/lib/samples/adapters/smart-process";
import {
  buildCanonicalSampleDomain,
  buildSampleSummaries,
  computeSampleKpis,
} from "@/lib/samples/aggregate";
import type { BitrixRow } from "@/lib/samples/types";

// ─── N-mode Bitrix fixture keys (production transport shape) ───
const N = {
  SENT_DATE: SMART_PROCESS_N_MODE_FIELD_NAMES.SENT_DATE, // ufCrm7_1766059943
  GRADE_GEL: SMART_PROCESS_N_MODE_FIELD_NAMES.GRADE_GEL,
  GRADE_SOL: SMART_PROCESS_N_MODE_FIELD_NAMES.GRADE_SOL,
  QTY_GEL: SMART_PROCESS_N_MODE_FIELD_NAMES.QTY_GEL,
  QTY_SOL: SMART_PROCESS_N_MODE_FIELD_NAMES.QTY_SOL,
  TEST_RESULT: SMART_PROCESS_N_MODE_FIELD_NAMES.TEST_RESULT,
};

const CANONICAL = {
  SENT_DATE: SMART_PROCESS_ROLE_FIELD_IDS.SENT_DATE,
  GRADE_GEL: SMART_PROCESS_ROLE_FIELD_IDS.GRADE_GEL,
  GRADE_SOL: SMART_PROCESS_ROLE_FIELD_IDS.GRADE_SOL,
  QTY_GEL: SMART_PROCESS_ROLE_FIELD_IDS.QTY_GEL,
  QTY_SOL: SMART_PROCESS_ROLE_FIELD_IDS.QTY_SOL,
  TEST_RESULT: SMART_PROCESS_ROLE_FIELD_IDS.TEST_RESULT,
};

/** Bitrix system keys are documented standard camelCase under Y and N. */
const spSystemRow = (over: BitrixRow): BitrixRow => ({
  id: "9001",
  title: "Цикл 1",
  stageId: "DT1032_15:CLIENT", // TESTING_IN_PROGRESS (active)
  assignedById: "55",
  createdTime: "2026-03-01T10:00:00+03:00",
  companyId: "42",
  [SMART_PROCESS_DEAL_FIELD_ID]: "505",
  ...over,
});

/** A full N-mode production-shaped SP row with all six custom roles. */
const nModeSpRow = (over: BitrixRow = {}): BitrixRow =>
  spSystemRow({
    [N.SENT_DATE]: "2026-03-10", // manual «Дата отправки»
    [N.GRADE_GEL]: "КРТ-2",
    [N.GRADE_SOL]: "КСМГ-5",
    [N.QTY_GEL]: 5,
    [N.QTY_SOL]: 10.5,
    [N.TEST_RESULT]: "Соответствует требованиям",
    ...over,
  });

const companyRow = (over: BitrixRow): BitrixRow => ({
  ID: "42",
  TITLE: "ООО «Интеграция»",
  ASSIGNED_BY_ID: "7",
  ...over,
});

const dealRow = (over: BitrixRow): BitrixRow => ({
  ID: "505",
  TITLE: "Сделка 505",
  COMPANY_ID: "42",
  ASSIGNED_BY_ID: "7",
  STAGE_ID: "C5:1",
  ...over,
});

describe("N-mode integrated production path (normalizer → adapter → aggregation → KPIs)", () => {
  it("select contract sanity: N-mode select carries system fields + six verified N-mode names, never canonical UF keys", () => {
    expect(SMART_PROCESS_ITEM_SELECT_N).toContain("id");
    expect(SMART_PROCESS_ITEM_SELECT_N).toContain("parentId2");
    for (const role of SMART_PROCESS_N_MODE_CUSTOM_ROLES) {
      expect(SMART_PROCESS_ITEM_SELECT_N).toContain(SMART_PROCESS_N_MODE_FIELD_NAMES[role]);
      expect(SMART_PROCESS_ITEM_SELECT_N).not.toContain(SMART_PROCESS_ROLE_FIELD_IDS[role]);
    }
  });

  it("all six verified N-mode aliases normalize to canonical original UF keys", () => {
    const raw = nModeSpRow();
    const normalized = normalizeSmartProcessNModeRow(raw);

    // All six canonical keys present with the fixture values.
    expect(normalized[CANONICAL.SENT_DATE]).toBe("2026-03-10");
    expect(normalized[CANONICAL.GRADE_GEL]).toBe("КРТ-2");
    expect(normalized[CANONICAL.GRADE_SOL]).toBe("КСМГ-5");
    expect(normalized[CANONICAL.QTY_GEL]).toBe(5);
    expect(normalized[CANONICAL.QTY_SOL]).toBe(10.5);
    expect(normalized[CANONICAL.TEST_RESULT]).toBe("Соответствует требованиям");

    // No N-mode alias key survives normalization.
    for (const alias of Object.values(N)) {
      expect(normalized).not.toHaveProperty(alias);
    }

    // System keys pass through untouched.
    expect(normalized.id).toBe("9001");
    expect(normalized.stageId).toBe("DT1032_15:CLIENT");
    expect(normalized.assignedById).toBe("55");
    expect(normalized.companyId).toBe("42");
    expect(normalized.parentId2).toBe("505");
  });

  it("END-TO-END: N-mode row → normalizer → adapter → aggregation → summary/KPIs with correct semantics", () => {
    const rows = [normalizeSmartProcessNModeRow(nModeSpRow())];
    const companies = [companyRow({})];
    const deals = [dealRow({})];

    // The REAL adapter consumes the normalized (canonical) row.
    const unit = adaptSmartProcessSampleEvidence(rows[0], (fieldId, raw) => raw);
    expect(unit).not.toBeNull();
    expect(unit!.source).toBe("SMART_PROCESS");
    expect(unit!.processItemId).toBe("9001");
    expect(unit!.companyId).toBe("42");
    expect(unit!.sentDates.map((s) => s.date)).toEqual(["2026-03-10"]);

    // The REAL aggregation consumes companies + deals + normalized rows.
    const { summaries, orphanDeals, qualityCounts } = buildSampleSummaries(
      companies,
      deals,
      rows
    );

    expect(summaries).toHaveLength(1);
    const summary = summaries[0];
    expect(summary.companyId).toBe("42");
    expect(summary.companyTitle).toBe("ООО «Интеграция»");

    // Current state resolved from the Smart Process (top precedence).
    expect(summary.sourceQuality).toBe("structured");
    expect(summary.responsibleId).toBe("55"); // SP item's own responsible
    expect(summary.companyResponsibleId).toBe("7"); // Company owner — separate fact

    // Manual sent date reached the summary; createdTime never fabricates one.
    expect(summary.sentDates).toContain("2026-03-10");

    // Physical cycle enrichment (grades/quantities from N-mode roles).
    expect(summary.smartProcessItems).toHaveLength(1);
    const cycle = summary.smartProcessItems![0];
    expect(cycle.processItemId).toBe("9001");
    expect(cycle.stageId).toBe("DT1032_15:CLIENT");
    expect(cycle.isActive).toBe(true);
    expect(cycle.isTerminal).toBe(false);
    expect(cycle.responsibleId).toBe("55");
    expect(cycle.grades).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ productFamily: "Гель", value: "КРТ-2" }),
        expect.objectContaining({ productFamily: "Золь", value: "КСМГ-5" }),
      ])
    );

    expect(orphanDeals).toHaveLength(0);
    expect(qualityCounts.relationConflictCount).toBe(0);

    // KPIs: 1 company, testing in progress (active SP stage), no marker leak.
    const kpis = computeSampleKpis(summaries);
    expect(kpis.total).toBe(1);
    expect(kpis.withSentDates).toBe(1);
    expect(kpis.inTesting).toBe(1);
  });

  it("createdTime is NEVER a sent event: N-mode row without the manual date has no dated sent fact", () => {
    const normalized = normalizeSmartProcessNModeRow(
      nModeSpRow({ [N.SENT_DATE]: "" }) // no manual «Дата отправки»
    );
    const unit = adaptSmartProcessSampleEvidence(normalized, (fieldId, raw) => raw);
    expect(unit).not.toBeNull();
    expect(unit!.sentDates).toHaveLength(0); // only createdTime exists
    // Sent-or-later active stage without a manual date → factual gap issue;
    // createdTime is never substituted as an event.
    expect(unit!.issues).toContain("smart_process_missing_sent_date");
  });

  it("missing documented id fails closed (adapter returns null; no fabrication)", () => {
    const normalized = normalizeSmartProcessNModeRow(nModeSpRow({ id: "" }));
    const unit = adaptSmartProcessSampleEvidence(normalized, (fieldId, raw) => raw);
    expect(unit).toBeNull();
  });

  it("Company/Deal relation conflict remains fail-closed through the integrated path", () => {
    // Deal 505 belongs to company 77, SP row claims direct companyId 42.
    const rows = [normalizeSmartProcessNModeRow(nModeSpRow())];
    const companies = [
      companyRow({}),
      companyRow({ ID: "77", TITLE: "ООО «Другая»" }),
    ];
    const deals = [dealRow({ COMPANY_ID: "77" })];

    const domain = buildCanonicalSampleDomain(companies, deals, rows);
    expect(domain.qualityCounts.relationConflictCount).toBe(1);

    // The conflicted item is attributed to NEITHER company: it surfaces as
    // an orphan raw item with its quality issue (canonical fail-closed
    // conflict semantics), never silently assigned to 42 or 77.
    expect(domain.canonicalByCompany.get("42")).toBeUndefined();
    expect(domain.canonicalByCompany.get("77")).toBeUndefined();
    expect(domain.orphanSmartProcessItems).toHaveLength(1);

    // Adapter-level truth: the conflict issue is on the evidence unit and
    // its canonical companyId was cleared (no silent pick).
    const unit = adaptSmartProcessSampleEvidence(rows[0], (fieldId, raw) => raw, {
      dealCompanyById: new Map([["505", "77"]]),
    });
    expect(unit!.issues).toContain("smart_process_relation_conflict");
    expect(unit!.companyId).toBe("");
  });

  it("multiple active SP items for one company remain ambiguous (no fabricated winner)", () => {
    const rows = [
      normalizeSmartProcessNModeRow(nModeSpRow({ id: "9001" })),
      normalizeSmartProcessNModeRow(nModeSpRow({ id: "9002", title: "Цикл 2" })),
    ];
    const companies = [companyRow({})];
    const deals = [dealRow({})];

    const { summaries, qualityCounts } = buildSampleSummaries(companies, deals, rows);
    expect(qualityCounts.multipleActiveCount).toBe(1);
    // Both physical cycles stay visible — never collapsed to one winner.
    expect(summaries[0].smartProcessItems).toHaveLength(2);
    expect(summaries[0].sourceQuality).toBe("ambiguous");
  });

  it("Deal marker field UF_CRM_1779394379 remains marker-only through the integrated path", () => {
    const markerValue = ["Положительный результат"];
    const rows = [normalizeSmartProcessNModeRow(nModeSpRow())];
    const companies = [companyRow({})];
    // Deal carries ONLY the marker field (no legacy sample data at all).
    const deals = [dealRow({ UF_CRM_1779394379: markerValue })];

    // The marker alone creates NO sample state, NO sent date, NO result.
    // (The company row still factually appears — its Deal carries sample
    // fields — but with no current sample state and no result KPIs.)
    const { summaries: markerOnly } = buildSampleSummaries(companies, deals, []);
    expect(markerOnly).toHaveLength(1);
    expect(markerOnly[0].sentDates).toHaveLength(0); // marker has no date
    expect(markerOnly[0].normalizedResult).toBe("unknown"); // marker is NOT a result
    const kpisMarker = computeSampleKpis(markerOnly);
    expect(kpisMarker.withResult).toBe(0);
    expect(kpisMarker.withSentDates).toBe(0);
    expect(kpisMarker.inTesting).toBe(0);

    // With a real SP cycle present: the marker stays a preview-only value
    // on the related Deal (navigation/preview/display), never a testing
    // status or result fact — the SP result drives the analytics.
    const { summaries } = buildSampleSummaries(companies, deals, rows);
    expect(summaries).toHaveLength(1);
    const s = summaries[0];
    const related = s.relatedDeals.find((d) => d.id === "505");
    expect(related).toBeDefined();
    expect(related!.sampleTestingStatus).toEqual(markerValue); // visible in preview only
    expect(s.normalizedResult).toBe("positive"); // SP «Соответствует требованиям»
    const kpis = computeSampleKpis(summaries);
    expect(kpis.withResult).toBe(1); // from the SP result, not the marker
  });
});
