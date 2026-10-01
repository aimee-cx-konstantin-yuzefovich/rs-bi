import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import {
  COMPANY_INDUSTRY_CURRENT_FIELD_ID,
  COMPANY_DIRECTION_CURRENT_FIELD_ID,
  COMPANY_DIRECTION_FIELD_ID,
  COMPANY_REGION_FIELD_ID,
  COMPANY_GEL_GRADE_USED_FIELD_ID,
  COMPANY_COMMENTS_PRODUCT_FIELD_ID,
  COMPANY_TESTING_MARKER_FIELD_ID,
  DEAL_TESTING_MARKER_CURRENT_FIELD_ID,
  DEAL_SAMPLE_TESTING_FIELD_ID,
  DEAL_SAMPLE_TESTING_LEGACY_FIELD_ID,
} from "@/lib/crm-constants";
import {
  SMART_PROCESS_SENT_DATE_FIELD_ID,
  SMART_PROCESS_DEAL_FIELD_ID,
  SMART_PROCESS_COMPANY_FIELD_ID,
  SMART_PROCESS_GRADE_GEL_FIELD_ID,
  SMART_PROCESS_GRADE_SOL_FIELD_ID,
  SMART_PROCESS_QTY_GEL_FIELD_ID,
  SMART_PROCESS_QTY_SOL_FIELD_ID,
  SMART_PROCESS_TEST_RESULT_FIELD_ID,
} from "@/lib/samples/smart-process-contract";
import {
  COMPANY_PREVIEW_CURRENT_FIELDS,
  TOTAL_APPROVED_FIELDS,
} from "@/lib/company-preview";

describe("Live Contract Consistency & Anti-Drift Guard (§30)", () => {
  const contractPath = path.resolve(__dirname, "../../contracts/live-field-contract.json");
  const contract = JSON.parse(fs.readFileSync(contractPath, "utf-8"));

  it("1. Smart Process contract constants match checked-in live field contract", () => {
    const spFields = contract.smartProcess.requiredFields;
    expect(SMART_PROCESS_SENT_DATE_FIELD_ID).toBe(spFields.UF_CRM_7_1766059943.fieldId);
    expect(SMART_PROCESS_DEAL_FIELD_ID).toBe(spFields.parentId2.fieldId);
    expect(SMART_PROCESS_COMPANY_FIELD_ID).toBe(spFields.companyId.fieldId);
    expect(SMART_PROCESS_GRADE_GEL_FIELD_ID).toBe(spFields.UF_CRM_7_1766135695.fieldId);
    expect(SMART_PROCESS_GRADE_SOL_FIELD_ID).toBe(spFields.UF_CRM_7_1766136511.fieldId);
    expect(SMART_PROCESS_TEST_RESULT_FIELD_ID).toBe(spFields.UF_CRM_7_1763036405.fieldId);
    expect(SMART_PROCESS_QTY_GEL_FIELD_ID).toBe(spFields.UF_CRM_7_1766136470.fieldId);
    expect(SMART_PROCESS_QTY_SOL_FIELD_ID).toBe(spFields.UF_CRM_7_1766136546.fieldId);
    expect(spFields.UF_CRM_7_1763036405.type).toBe("string");
  });

  it("2. Company dimension constants match checked-in live field contract", () => {
    const cardFields: Array<{ order: number; concept: string; fieldId: string }> =
      contract.companyPreview.fields;

    const ind = cardFields.find((f) => f.concept === "Отрасль");
    expect(COMPANY_INDUSTRY_CURRENT_FIELD_ID).toBe(ind?.fieldId);
    expect(COMPANY_INDUSTRY_CURRENT_FIELD_ID).toBe("UF_CRM_1784195884554");

    const dir = cardFields.find((f) => f.concept === "Направление");
    expect(COMPANY_DIRECTION_CURRENT_FIELD_ID).toBe(dir?.fieldId);
    expect(COMPANY_DIRECTION_CURRENT_FIELD_ID).toBe("UF_CRM_1784200275341");
    expect(COMPANY_DIRECTION_FIELD_ID).toBe("UF_CRM_1784200275341");

    const reg = cardFields.find((f) => f.concept === "Регион");
    expect(COMPANY_REGION_FIELD_ID).toBe(reg?.fieldId);
    expect(COMPANY_REGION_FIELD_ID).toBe("UF_CRM_69259C45D3399");

    // CRITICAL: Region must never be aliased to Direction
    expect(COMPANY_DIRECTION_CURRENT_FIELD_ID).not.toBe(COMPANY_REGION_FIELD_ID);
    expect(COMPANY_DIRECTION_FIELD_ID).not.toBe(COMPANY_REGION_FIELD_ID);
  });

  it("3. Company product and marker fields match contract", () => {
    const cardFields: Array<{ order: number; concept: string; fieldId: string }> =
      contract.companyPreview.fields;

    const gel = cardFields.find((f) => f.concept === "Используемая марка — ГЕЛЬ");
    expect(COMPANY_GEL_GRADE_USED_FIELD_ID).toBe(gel?.fieldId);
    expect(COMPANY_GEL_GRADE_USED_FIELD_ID).toBe("UF_CRM_1781806326214");

    const gelCons = cardFields.find((f) => f.concept === "Потребление — ГЕЛЬ");
    expect(gelCons?.fieldId).toBe("UF_CRM_1781806269703");

    const sol = cardFields.find((f) => f.concept === "Используемая марка — ЗОЛЬ");
    expect(sol?.fieldId).toBe("UF_CRM_1781806285641");

    const solCons = cardFields.find((f) => f.concept === "Потребление — ЗОЛЬ");
    expect(solCons?.fieldId).toBe("UF_CRM_1781806301447");

    const prices = cardFields.find((f) => f.concept === "Фактические цены");
    expect(prices?.fieldId).toBe("UF_CRM_1782743261289");

    const prodComm = cardFields.find((f) => f.concept === "Комментарий по используемым продуктам");
    expect(COMPANY_COMMENTS_PRODUCT_FIELD_ID).toBe(prodComm?.fieldId);
    expect(COMPANY_COMMENTS_PRODUCT_FIELD_ID).toBe("UF_CRM_1753080295792");

    const marker = cardFields.find((f) => f.concept === "Тестирование образцов");
    expect(COMPANY_TESTING_MARKER_FIELD_ID).toBe(marker?.fieldId);
    expect(COMPANY_TESTING_MARKER_FIELD_ID).toBe("UF_CRM_1790787974");
  });

  it("4. Deal testing markers are separated into current checkbox vs legacy marker", () => {
    expect(DEAL_TESTING_MARKER_CURRENT_FIELD_ID).toBe("UF_CRM_1790786438");
    expect(DEAL_SAMPLE_TESTING_FIELD_ID).toBe("UF_CRM_1779394379");
    expect(DEAL_SAMPLE_TESTING_LEGACY_FIELD_ID).toBe("UF_CRM_1779394379");
    expect(DEAL_TESTING_MARKER_CURRENT_FIELD_ID).not.toBe(DEAL_SAMPLE_TESTING_LEGACY_FIELD_ID);
    expect(contract.dealMarkers.currentCheckbox.fieldId).toBe(DEAL_TESTING_MARKER_CURRENT_FIELD_ID);
    expect(contract.dealMarkers.legacyMarker.fieldId).toBe(DEAL_SAMPLE_TESTING_LEGACY_FIELD_ID);
  });

  it("5. Company Preview current-card contract has exactly 23 approved fields without Product Type", () => {
    expect(contract.companyPreview.totalApprovedFields).toBe(23);
    expect(contract.companyPreview.fields).toHaveLength(23);
    expect(TOTAL_APPROVED_FIELDS).toBe(23);
    expect(COMPANY_PREVIEW_CURRENT_FIELDS).toHaveLength(23);

    // Assert "Тип продукта" (UF_CRM_69257BBAB86F6) is NOT in the current-card field list
    const hasProductType = contract.companyPreview.fields.some(
      (f: { fieldId: string }) => f.fieldId === "UF_CRM_69257BBAB86F6"
    );
    expect(hasProductType).toBe(false);

    const hasProductTypeInDefs = COMPANY_PREVIEW_CURRENT_FIELDS.some(
      (f) => f.id === "UF_CRM_69257BBAB86F6"
    );
    expect(hasProductTypeInDefs).toBe(false);
  });
});
