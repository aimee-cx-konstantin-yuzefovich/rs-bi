// @vitest-environment node
import { describe, it, expect, vi } from "vitest";

vi.mock("@/lib/samples/smart-process-contract", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/lib/samples/smart-process-contract")>();
  return {
    ...real,
    SMART_PROCESS_HAS_DISCOVERED_CONTRACT: true,
  };
});

import { adaptSmartProcessSampleEvidence } from "@/lib/samples/adapters/smart-process";
import { identityLabelResolver } from "@/lib/samples/normalize";
import { EXPECTED_DEAL_FIELDS } from "@/lib/bitrix-contract-spec";
import { SYSTEM_FIELDS_TO_EXCLUDE } from "@/lib/bitrix";
import {
  SMART_PROCESS_DEAL_FIELD_ID,
  SMART_PROCESS_DEAL_UF_FIELD_ID,
} from "@/lib/samples/smart-process-contract";

describe("Phase C §35: Smart Process Deal Relation & PARENT_ID_1032 Independence", () => {
  const resolve = identityLabelResolver;

  it("A. Runtime Deal contract strictly DOES NOT require PARENT_ID_1032 on Deal schema", () => {
    // 1. EXPECTED_DEAL_FIELDS must NOT contain PARENT_ID_1032
    const dealFieldIds = EXPECTED_DEAL_FIELDS.map((f) => f.id);
    expect(dealFieldIds).not.toContain("PARENT_ID_1032");

    // 2. SYSTEM_FIELDS_TO_EXCLUDE contains PARENT_ID_1032 strictly as defensive exclusion
    expect(SYSTEM_FIELDS_TO_EXCLUDE.has("PARENT_ID_1032")).toBe(true);

    // 3. Canonical Smart Process Deal relation is parentId2
    expect(SMART_PROCESS_DEAL_FIELD_ID).toBe("parentId2");
  });

  it("B. Smart Process exact Deal relation works authoritatively via parentId2", () => {
    const spRow = {
      id: "9001",
      title: "Тестирование образцов",
      stageId: "DT1032_15:NEW",
      assignedById: "15",
      companyId: "100",
      parentId2: "505",
    };

    const unit = adaptSmartProcessSampleEvidence(spRow, resolve);
    expect(unit).not.toBeNull();
    expect(unit?.linkedDealId).toBe("505");
  });

  it("C. Auxiliary UF relation (UF_CRM_7_1779385642) acts as fallback when parentId2 is absent or '0'", () => {
    // Case 1: parentId2 absent
    const rowNoParent = {
      id: "9002",
      title: "Тестирование",
      stageId: "DT1032_15:NEW",
      assignedById: "15",
      companyId: "100",
      [SMART_PROCESS_DEAL_UF_FIELD_ID]: "606",
    };
    const unit1 = adaptSmartProcessSampleEvidence(rowNoParent, resolve);
    expect(unit1?.linkedDealId).toBe("606");

    // Case 2: parentId2 is "0" (empty foreign key representation in Bitrix)
    const rowZeroParent = {
      id: "9003",
      title: "Тестирование",
      stageId: "DT1032_15:NEW",
      assignedById: "15",
      companyId: "100",
      parentId2: "0",
      [SMART_PROCESS_DEAL_UF_FIELD_ID]: "707",
    };
    const unit2 = adaptSmartProcessSampleEvidence(rowZeroParent, resolve);
    expect(unit2?.linkedDealId).toBe("707");
  });

  it("D. Primary parentId2 takes precedence over auxiliary UF field", () => {
    const rowBoth = {
      id: "9004",
      title: "Тестирование",
      stageId: "DT1032_15:NEW",
      assignedById: "15",
      companyId: "100",
      parentId2: "505",
      [SMART_PROCESS_DEAL_UF_FIELD_ID]: "999",
    };
    const unit = adaptSmartProcessSampleEvidence(rowBoth, resolve);
    expect(unit?.linkedDealId).toBe("505");
  });

  it("E. Absence of PARENT_ID_1032 on Deal record does not affect sample evidence linking", () => {
    const regularDeal = {
      ID: "505",
      TITLE: "Поставка партии",
      COMPANY_ID: "100",
      STAGE_ID: "PREPARATION",
      // PARENT_ID_1032 is completely absent
    };
    expect(regularDeal).not.toHaveProperty("PARENT_ID_1032");

    const spRow = {
      id: "9005",
      title: "Тестирование",
      stageId: "DT1032_15:CLIENT",
      companyId: "100",
      parentId2: "505",
    };

    const unit = adaptSmartProcessSampleEvidence(spRow, resolve, {
      dealCompanyById: new Map([["505", "100"]]),
    });

    expect(unit?.linkedDealId).toBe("505");
    expect(unit?.companyId).toBe("100");
    expect(unit?.issues).not.toContain("smart_process_relation_conflict");
  });
});
