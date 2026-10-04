// @vitest-environment node
// src/__tests__/samples-smart-process.test.ts
// ─────────────────────────────────────────────────────────────────────
// Phase C adversarial Smart Process matrix (SP1–SP16) + marker isolation
// (SP8/SP9) + event dating rules (SP10/SP11) + relation conflicts
// (SP13/SP14) + history preservation (SP15/SP16).
//
// The Smart Process contract is mocked as DISCOVERED here (production
// gate stays fail-closed and is covered separately). Stage IDs are the
// stable key; the manual «Дата отправки» field is the ONLY dated
// samples_sent event.
// ─────────────────────────────────────────────────────────────────────

import { describe, it, expect, vi } from "vitest";
import type { BitrixRow } from "@/lib/samples/types";

vi.mock("@/lib/samples/smart-process-contract", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/lib/samples/smart-process-contract")>();
  return {
    ...real,
    SMART_PROCESS_HAS_DISCOVERED_CONTRACT: true,
    SMART_PROCESS_SENT_DATE_FIELD_ID: "UF_CRM_SP_SENT",
    SMART_PROCESS_DEAL_FIELD_ID: "UF_CRM_SP_DEAL",
    SMART_PROCESS_GRADE_GEL_FIELD_ID: "UF_CRM_SP_GEL",
    SMART_PROCESS_GRADE_SOL_FIELD_ID: "UF_CRM_SP_SOL",
    SMART_PROCESS_TEST_RESULT_FIELD_ID: "UF_CRM_SP_RESULT",
    // N-mode transport mapping mirrors the overridden canonical names.
    SMART_PROCESS_N_MODE_FIELD_NAMES: {
      ...real.SMART_PROCESS_N_MODE_FIELD_NAMES,
      SENT_DATE: "ufCrmSpSent",
      GRADE_GEL: "ufCrmSpGel",
      GRADE_SOL: "ufCrmSpSol",
      TEST_RESULT: "ufCrmSpResult",
    },
  };
});

const SP_SENT = "UF_CRM_SP_SENT";
const SP_DEAL = "UF_CRM_SP_DEAL";
const SP_GEL = "UF_CRM_SP_GEL";
const SP_SOL = "UF_CRM_SP_SOL";
const SP_RESULT = "UF_CRM_SP_RESULT";

import { buildCanonicalSampleDomain } from "@/lib/samples/aggregate";
import { adaptSmartProcessSampleEvidence } from "@/lib/samples/adapters/smart-process";
import { reconcileCompanySample } from "@/lib/samples/reconcile";
import { identityLabelResolver } from "@/lib/samples/normalize";
import { COMPANY_SAMPLES_FIELD_ID, UNCLASSIFIED_LABEL } from "@/lib/crm-constants";

const resolve = identityLabelResolver;

function spItem(overrides: Record<string, unknown>): BitrixRow {
  return {
    id: "9001",
    title: "Тестирование",
    stageId: "DT1032_15:NEW",
    assignedById: "7",
    createdTime: "2026-09-01T10:00:00+03:00",
    companyId: "100",
    ...overrides,
  };
}

function company(overrides: Record<string, unknown> = {}): BitrixRow {
  return { ID: "100", TITLE: "Компания 100", ASSIGNED_BY_ID: "5", ...overrides };
}

function domain(companies: BitrixRow[], deals: BitrixRow[], sp: BitrixRow[]) {
  return buildCanonicalSampleDomain(companies, deals, sp, { labelResolver: resolve });
}

describe("Phase C — Smart Process adversarial matrix (SP1–SP16)", () => {
  it("SP1: one active SP + legacy → current SMART_PROCESS, legacy history preserved", () => {
    const d = domain(
      [company()],
      [{ ID: "50", COMPANY_ID: "100", [COMPANY_SAMPLES_FIELD_ID]: undefined }],
      [
        spItem({ stageId: "DT1032_15:CLIENT", [SP_SENT]: "2026-09-05" }),
      ]
    );
    const c = d.canonicalByCompany.get("100")!;
    expect(c.currentState.source).toBe("SMART_PROCESS");
    expect(c.currentState.quality).toBe("RESOLVED");
    expect(c.currentState.processItemId).toBe("9001");
    expect(c.historicalSentDates.some((s) => s.date === "2026-09-05" && s.source === "SMART_PROCESS")).toBe(true);
  });

  it("SP2: no SP, Deal legacy → Deal fallback", () => {
    const d = domain(
      [company()],
      [{ ID: "50", COMPANY_ID: "100", UF_CRM_1779386185: "DT1032_15:CLIENT", UF_CRM_1774879952785: "2026-08-01" }],
      []
    );
    const c = d.canonicalByCompany.get("100")!;
    expect(c.currentState.source).toBe("DEAL_LEGACY");
    expect(c.currentState.quality).toBe("RESOLVED");
    expect(c.currentState.winningDealId).toBe("50");
  });

  it("SP3: no SP/Deal state, Company legacy → Company fallback", () => {
    const d = domain(
      [company({ [COMPANY_SAMPLES_FIELD_ID]: ["261"], UF_CRM_1783429999269: "2026-07-01" })],
      [],
      []
    );
    const c = d.canonicalByCompany.get("100")!;
    expect(c.currentState.source).toBe("COMPANY_LEGACY");
    expect(c.currentState.quality).toBe("RESOLVED");
  });

  it("SP4: one active + terminal history → active wins", () => {
    const d = domain(
      [company()],
      [],
      [
        spItem({ id: "9001", stageId: "DT1032_15:SUCCESS", createdTime: "2026-08-01T10:00:00+03:00" }),
        spItem({ id: "9002", stageId: "DT1032_15:CLIENT", createdTime: "2026-09-01T10:00:00+03:00" }),
      ]
    );
    const c = d.canonicalByCompany.get("100")!;
    expect(c.currentState.source).toBe("SMART_PROCESS");
    expect(c.currentState.processItemId).toBe("9002");
  });

  it("SP5: multiple active → AMBIGUOUS_MULTIPLE_ACTIVE, no arbitrary winner", () => {
    const d = domain(
      [company()],
      [],
      [
        spItem({ id: "9001", stageId: "DT1032_15:CLIENT", createdTime: "2026-09-01T10:00:00+03:00" }),
        spItem({ id: "9002", stageId: "DT1032_15:UC_ZARRMX", createdTime: "2026-09-02T10:00:00+03:00" }),
      ]
    );
    const c = d.canonicalByCompany.get("100")!;
    expect(c.currentState.source).toBe("SMART_PROCESS");
    expect(c.currentState.quality).toBe("AMBIGUOUS_MULTIPLE_ACTIVE");
    expect(c.currentState.processItemId).toBeUndefined();
    expect(c.ambiguousActiveProcessItemIds).toEqual(["9001", "9002"]);
    expect(d.qualityCounts.multipleActiveCount).toBe(1);
  });

  it("SP6: no active, multiple terminal → latest by createdTime, ID tie-break only on equality", () => {
    const d = domain(
      [company()],
      [],
      [
        spItem({ id: "9001", stageId: "DT1032_15:FAIL", createdTime: "2026-08-01T10:00:00+03:00" }),
        spItem({ id: "9002", stageId: "DT1032_15:SUCCESS", createdTime: "2026-09-01T10:00:00+03:00" }),
      ]
    );
    const c = d.canonicalByCompany.get("100")!;
    expect(c.currentState.source).toBe("SMART_PROCESS");
    expect(c.currentState.processItemId).toBe("9002");

    // Exact createdTime equality → stable item-ID tie-break.
    const d2 = domain(
      [company()],
      [],
      [
        spItem({ id: "9001", stageId: "DT1032_15:FAIL", createdTime: "2026-09-01T10:00:00+03:00" }),
        spItem({ id: "9002", stageId: "DT1032_15:SUCCESS", createdTime: "2026-09-01T10:00:00+03:00" }),
      ]
    );
    expect(d2.canonicalByCompany.get("100")!.currentState.processItemId).toBe("9002");
  });

  it("SP7: SP-only Company appears in Samples (no legacy fields)", () => {
    const d = domain([company()], [], [spItem({ stageId: "DT1032_15:UC_ZARRMX", [SP_SENT]: "2026-09-05" })]);
    expect(d.canonicalByCompany.has("100")).toBe(true);
    const c = d.canonicalByCompany.get("100")!;
    expect(c.currentState.source).toBe("SMART_PROCESS");
    expect(c.evidenceUnits[0].sourceGranularity).toBe("PROCESS_ITEM");
  });

  it("SP8: marker=NO but valid SP exists → SP still authoritative", () => {
    // Company marker (Образцы=263 «требуются образцы») does not gate SP.
    const d = domain(
      [company({ [COMPANY_SAMPLES_FIELD_ID]: ["263"] })],
      [],
      [spItem({ stageId: "DT1032_15:CLIENT", [SP_SENT]: "2026-09-05" })]
    );
    const c = d.canonicalByCompany.get("100")!;
    expect(c.currentState.source).toBe("SMART_PROCESS");
  });

  it("SP9: marker=YES but no SP → marker does not create testing status", () => {
    // A marker-only deal (navigation marker present, no state evidence)
    // must not fabricate current state; Company fallback applies.
    const d = domain(
      [company({ [COMPANY_SAMPLES_FIELD_ID]: ["261"], UF_CRM_1783429999269: "2026-07-01" })],
      [{ ID: "50", COMPANY_ID: "100", UF_CRM_1779394379: ["Подошло"] }],
      []
    );
    const c = d.canonicalByCompany.get("100")!;
    expect(c.currentState.source).toBe("COMPANY_LEGACY");
    // Raw enum value preserved (label resolution happens at projection
    // with metadata; the canonical model stores raw evidence).
    expect(c.currentState.statusValues).toEqual(["261"]);
    // Marker-only deal produces an evidence unit for transitional
    // discoverability (navigationMarkerPresent) but contributes NO
    // status evidence, result, or sent dates.
    const markerUnit = c.evidenceUnits.find((u) => u.source === "DEAL_LEGACY");
    expect(markerUnit).toBeDefined();
    expect(markerUnit!.statusEvidence).toHaveLength(0);
    expect(markerUnit!.navigationMarkerPresent).toBe(true);
    expect(markerUnit!.sentDates).toHaveLength(0);
  });

  it("SP10: stage TESTING + sent date missing → current testing, NO dated sent event", () => {
    const d = domain([company()], [], [spItem({ stageId: "DT1032_15:CLIENT" })]);
    const c = d.canonicalByCompany.get("100")!;
    expect(c.currentState.source).toBe("SMART_PROCESS");
    expect(c.currentState.statusValues).toEqual(["На испытании"]);
    // No dated event from createdTime or stage transition!
    expect(c.historicalSentDates).toHaveLength(0);
    expect(d.qualityCounts.sentStageWithoutDateCount).toBe(1);
  });

  it("SP11: stage SENT + manual sent date valid → sent event exists", () => {
    const d = domain([company()], [], [spItem({ stageId: "DT1032_15:UC_ZARRMX", [SP_SENT]: "2026-09-05" })]);
    const c = d.canonicalByCompany.get("100")!;
    expect(c.currentState.statusValues).toEqual(["Образцы отправлены"]);
    expect(c.historicalSentDates).toHaveLength(1);
    expect(c.historicalSentDates[0].date).toBe("2026-09-05");
    expect(c.historicalSentDates[0].source).toBe("SMART_PROCESS");
  });

  it("SP12: stage/result terminal conflict → AMBIGUOUS quality issue", () => {
    const unit = adaptSmartProcessSampleEvidence(
      spItem({ stageId: "DT1032_15:SUCCESS", [SP_RESULT]: "Не подошло" }),
      resolve
    )!;
    expect(unit.issues).toContain("smart_process_stage_result_conflict");
    const c = reconcileCompanySample({
      companyId: "100",
      companyTitle: "C",
      companyEvidence: null,
      dealEvidences: [],
      smartProcessEvidences: [unit],
    });
    expect(c.dataIssues).toContain("smart_process_stage_result_conflict");
  });

  it("SP13: direct Company relation conflicts with linked Deal's Company → conflict, no silent choice", () => {
    const unit = adaptSmartProcessSampleEvidence(
      spItem({ stageId: "DT1032_15:CLIENT", companyId: "100", [SP_DEAL]: "50" }),
      resolve,
      { dealCompanyById: new Map([["50", "200"]]) }
    )!;
    expect(unit.issues).toContain("smart_process_relation_conflict");
    expect(unit.companyId).toBe(""); // Fail-closed: relation conflict must not be attributed to either company
    expect(unit.directCompanyId).toBe("100");
    expect(unit.dealCompanyId).toBe("200");
  });

  it("SP14: orphan SP item (no company relation) → counted and disclosed", () => {
    const d = domain([company()], [], [spItem({ companyId: undefined })]);
    expect(d.qualityCounts.orphanSmartProcessItemCount).toBe(1);
    expect(d.orphanSmartProcessItems).toHaveLength(1);
  });

  it("SP15: same date from Company + Deal + SP → visible date once, provenance retained", () => {
    const d = domain(
      [company({ [COMPANY_SAMPLES_FIELD_ID]: ["261"], UF_CRM_1783429999269: "2026-09-05" })],
      [{ ID: "50", COMPANY_ID: "100", UF_CRM_1779386185: "DT1032_15:UC_ZARRMX", UF_CRM_1774879952785: "2026-09-05" }],
      [spItem({ stageId: "DT1032_15:UC_ZARRMX", [SP_SENT]: "2026-09-05" })]
    );
    const c = d.canonicalByCompany.get("100")!;
    // Internal provenance: three sourced events retained.
    expect(c.historicalSentDates).toHaveLength(3);
    expect(new Set(c.historicalSentDates.map((s) => s.source))).toEqual(
      new Set(["COMPANY_LEGACY", "DEAL_LEGACY", "SMART_PROCESS"])
    );
  });

  it("SP16: different dates from all sources → all preserved", () => {
    const d = domain(
      [company({ [COMPANY_SAMPLES_FIELD_ID]: ["261"], UF_CRM_1783429999269: "2026-07-01" })],
      [{ ID: "50", COMPANY_ID: "100", UF_CRM_1779386185: "DT1032_15:UC_ZARRMX", UF_CRM_1774879952785: "2026-08-01" }],
      [spItem({ stageId: "DT1032_15:UC_ZARRMX", [SP_SENT]: "2026-09-05" })]
    );
    const c = d.canonicalByCompany.get("100")!;
    const dates = c.historicalSentDates.map((s) => s.date).sort();
    expect(dates).toEqual(["2026-07-01", "2026-08-01", "2026-09-05"]);
  });

  it("SP-extra: unknown stage ID → unclassified issue and neutral user-facing evidence, never the raw token", () => {
    const unit = adaptSmartProcessSampleEvidence(
      spItem({ stageId: "DT1032_15:UC_UNKNOWNXYZ" }),
      resolve
    )!;
    // Internal provenance keeps the raw stage token and the issue marker.
    expect(unit.issues).toContain("smart_process_unknown_stage");
    expect(unit.stageId).toBe("DT1032_15:UC_UNKNOWNXYZ");
    // User-facing status evidence NEVER exposes the raw stage token.
    expect(unit.statusEvidence).toEqual([UNCLASSIFIED_LABEL]);
    expect(JSON.stringify(unit.statusEvidence)).not.toContain("DT1032_15:UC_UNKNOWNXYZ");
  });

  it("SP-extra: unclassified string result → preserved verbatim, normalized unknown", () => {
    const unit = adaptSmartProcessSampleEvidence(
      spItem({ stageId: "DT1032_15:CLIENT", [SP_RESULT]: "777" }),
      resolve
    )!;
    expect(unit.rawTestResult).toBe("777");
    expect(unit.normalizedResult).toBe("unknown");
  });

  it("SP-extra: createdTime is never a sent event (terminal stage without manual date)", () => {
    const unit = adaptSmartProcessSampleEvidence(
      spItem({ stageId: "DT1032_15:SUCCESS", createdTime: "2026-09-01T10:00:00+03:00" }),
      resolve
    )!;
    expect(unit.sentDates).toHaveLength(0);
  });
});
