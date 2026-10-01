import { describe, it, expect } from "vitest";
import { adaptSmartProcessSampleEvidence } from "@/lib/samples/adapters/smart-process";
import { buildCanonicalSampleDomain } from "@/lib/samples/aggregate";
import type { BitrixRow } from "@/lib/samples/types";

const SMART_PROCESS_STAGE_IN_TESTING = "DT1032_15:CLIENT";

describe("Smart Process 1032 — Relation Conflict & Attribution Matrix", () => {
  const dummyResolver = (_fieldId: string, val: string) => val;

  it("R1: Direct company only -> attributes strictly to direct company", () => {
    const row: BitrixRow = {
      id: "101",
      companyId: "C10",
      stageId: SMART_PROCESS_STAGE_IN_TESTING,
      title: "SP Тестирование 101",
    };

    const unit = adaptSmartProcessSampleEvidence(row, dummyResolver, {
      dealCompanyById: new Map([["D1", "C20"]]),
    });

    expect(unit).not.toBeNull();
    expect(unit!.companyId).toBe("C10");
    expect(unit!.issues).not.toContain("smart_process_relation_conflict");
    expect(unit!.issues).not.toContain("smart_process_orphan_item");
  });

  it("R2: Linked deal only (no direct company) -> attributes to linked deal's company", () => {
    const row: BitrixRow = {
      id: "102",
      companyId: "0",
      parentId2: "D1",
      stageId: SMART_PROCESS_STAGE_IN_TESTING,
      title: "SP Тестирование 102",
    };

    const unit = adaptSmartProcessSampleEvidence(row, dummyResolver, {
      dealCompanyById: new Map([["D1", "C20"]]),
    });

    expect(unit).not.toBeNull();
    expect(unit!.companyId).toBe("C20");
    expect(unit!.issues).not.toContain("smart_process_relation_conflict");
    expect(unit!.issues).not.toContain("smart_process_orphan_item");
  });

  it("R3: Direct company == linked deal company -> attributes to agreed company", () => {
    const row: BitrixRow = {
      id: "103",
      companyId: "C10",
      parentId2: "D1",
      stageId: SMART_PROCESS_STAGE_IN_TESTING,
      title: "SP Тестирование 103",
    };

    const unit = adaptSmartProcessSampleEvidence(row, dummyResolver, {
      dealCompanyById: new Map([["D1", "C10"]]),
    });

    expect(unit).not.toBeNull();
    expect(unit!.companyId).toBe("C10");
    expect(unit!.issues).not.toContain("smart_process_relation_conflict");
  });

  it("R4: Direct company != linked deal company -> FAIL-CLOSED: companyId = '', conflict recorded, diagnostics preserved", () => {
    const row: BitrixRow = {
      id: "104",
      companyId: "C10",
      parentId2: "D1",
      stageId: SMART_PROCESS_STAGE_IN_TESTING,
      title: "SP Тестирование 104 Conflict",
      UF_CRM_7_1766059943: "2026-03-10", // Sent date
    };

    const unit = adaptSmartProcessSampleEvidence(row, dummyResolver, {
      dealCompanyById: new Map([["D1", "C20"]]),
    });

    expect(unit).not.toBeNull();
    // 1. Fail-closed attribution: not attributed to either company
    expect(unit!.companyId).toBe("");
    // 2. Issue recorded
    expect(unit!.issues).toContain("smart_process_relation_conflict");
    // 3. Not marked as orphan (it has relations, but they conflict)
    expect(unit!.issues).not.toContain("smart_process_orphan_item");
    // 4. Diagnostic preservation of both IDs
    expect(unit!.directCompanyId).toBe("C10");
    expect(unit!.dealCompanyId).toBe("C20");
    // 5. Sent dates carry empty companyId (never attributed to either company)
    expect(unit!.sentDates.length).toBe(1);
    expect(unit!.sentDates[0].companyId).toBe("");
  });

  it("R4 (Domain Integration): Conflicted SP item does not create current sample state for either company", () => {
    const companies: BitrixRow[] = [
      { ID: "C10", TITLE: "Компания Альфа" },
      { ID: "C20", TITLE: "Компания Бета" },
    ];
    const deals: BitrixRow[] = [
      { ID: "D1", COMPANY_ID: "C20", TITLE: "Сделка Бета" },
    ];
    const smartProcessItems: BitrixRow[] = [
      {
        id: "999",
        companyId: "C10", // Disagrees with D1 which points to C20
        parentId2: "D1",
        stageId: SMART_PROCESS_STAGE_IN_TESTING,
        title: "Конфликтный образец",
      },
    ];

    const domain = buildCanonicalSampleDomain(companies, deals, smartProcessItems);

    // 1. Conflict count is incremented in domain quality counts
    expect(domain.qualityCounts.relationConflictCount).toBe(1);

    // 2. Neither company receives SMART_PROCESS current sample state
    const comp10 = domain.canonicalByCompany.get("C10");
    const comp20 = domain.canonicalByCompany.get("C20");

    if (comp10) {
      expect(comp10.currentState.source).not.toBe("SMART_PROCESS");
    }
    if (comp20) {
      expect(comp20.currentState.source).not.toBe("SMART_PROCESS");
    }
  });

  it("R5: Direct company + linked deal without company -> attributes to direct company", () => {
    const row: BitrixRow = {
      id: "105",
      companyId: "C10",
      parentId2: "D99", // Deal not in map or without company
      stageId: SMART_PROCESS_STAGE_IN_TESTING,
      title: "SP Тестирование 105",
    };

    const unit = adaptSmartProcessSampleEvidence(row, dummyResolver, {
      dealCompanyById: new Map([["D1", "C20"]]),
    });

    expect(unit).not.toBeNull();
    expect(unit!.companyId).toBe("C10");
    expect(unit!.issues).not.toContain("smart_process_relation_conflict");
  });
});
