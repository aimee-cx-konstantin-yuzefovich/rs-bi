// src/__tests__/bitrix-contract.test.ts
// ─────────────────────────────────────────────────────────────────────
// Regression tests for Bitrix upstream schema and contract validation.
// ─────────────────────────────────────────────────────────────────────

import { describe, it, expect } from "vitest";
import {
  validateAllBitrixContracts,
  validateDealFieldsContract,
  validateCompanyFieldsContract,
  validateDealListContract,
  validateStatusListContract,
} from "../lib/bitrix-contract";
import {
  COMPANY_SAMPLES_FIELD_ID,
  DEAL_SAMPLE_TRANSFER_FIELD_ID,
  DEAL_SAMPLE_TESTING_FIELD_ID,
} from "../lib/crm-constants";

describe("Bitrix Contract Validator", () => {
  const validDealFields = {
    ID: { type: "integer", title: "ID" },
    TITLE: { type: "string", title: "Название" },
    STAGE_ID: { type: "crm_status", title: "Стадия" },
    CATEGORY_ID: { type: "integer", title: "Воронка" },
    OPPORTUNITY: { type: "double", title: "Сумма" },
    CURRENCY_ID: { type: "crm_currency", title: "Валюта" },
    ASSIGNED_BY_ID: { type: "user", title: "Ответственный" },
    COMPANY_ID: { type: "crm_company", title: "Компания" },
    DATE_CREATE: { type: "datetime", title: "Дата создания" },
    BEGINDATE: { type: "date", title: "Дата начала" },
    CLOSEDATE: { type: "date", title: "Дата завершения" },
    [DEAL_SAMPLE_TRANSFER_FIELD_ID]: {
      type: "enumeration",
      title: "Статус передачи образца",
      items: [{ ID: "1", VALUE: "Передано" }],
    },
    [DEAL_SAMPLE_TESTING_FIELD_ID]: {
      type: "enumeration",
      title: "Статус тестирования образца",
      items: [{ ID: "2", VALUE: "В работе" }],
    },
  };

  const validCompanyFields = {
    ID: { type: "integer", title: "ID" },
    TITLE: { type: "string", title: "Название компании" },
    ASSIGNED_BY_ID: { type: "user", title: "Ответственный" },
    DATE_CREATE: { type: "datetime", title: "Дата создания" },
    [COMPANY_SAMPLES_FIELD_ID]: { type: "date", title: "Дата отгрузки образца" },
  };

  it("TC-CONTRACT-01: valid schemas and lists pass validation with ok=true", () => {
    const res = validateAllBitrixContracts({
      dealFields: { result: validDealFields },
      companyFields: { result: validCompanyFields },
      dealList: { result: [{ ID: "1", STAGE_ID: "WON" }] },
      companyList: { result: [{ ID: "10", TITLE: "Company A" }] },
      statusList: { result: [{ STATUS_ID: "WON", NAME: "Сделка успешна" }] },
    });

    expect(res.ok).toBe(true);
    expect(res.errors).toHaveLength(0);
    expect(res.warnings).toHaveLength(0);
  });

  it("TC-CONTRACT-02: missing critical deal field (e.g. OPPORTUNITY) triggers critical error", () => {
    const brokenFields = { ...validDealFields };
    delete (brokenFields as any).OPPORTUNITY;

    const issues = validateDealFieldsContract(brokenFields);
    const error = issues.find((i) => i.field === "OPPORTUNITY" && i.severity === "error");

    expect(error).toBeDefined();
    expect(error?.message).toContain("Missing critical deal field 'OPPORTUNITY'");

    const overall = validateAllBitrixContracts({ dealFields: brokenFields });
    expect(overall.ok).toBe(false);
    expect(overall.errors.length).toBeGreaterThanOrEqual(1);
  });

  it("TC-CONTRACT-03: invalid items property structure triggers critical error", () => {
    const brokenFields = {
      ...validDealFields,
      [DEAL_SAMPLE_TRANSFER_FIELD_ID]: {
        type: "enumeration",
        title: "Broken items",
        items: "not an array", // Invalid!
      },
    };

    const issues = validateDealFieldsContract(brokenFields);
    const error = issues.find(
      (i) => i.field === DEAL_SAMPLE_TRANSFER_FIELD_ID && i.severity === "error"
    );
    expect(error).toBeDefined();
    expect(error?.message).toContain("must be an array");
  });

  it("TC-CONTRACT-04: missing optional custom field triggers warning but ok=true if no errors", () => {
    const fieldsWithoutCustom = {
      ID: { type: "integer", title: "ID" },
      TITLE: { type: "string", title: "Название компании" },
      ASSIGNED_BY_ID: { type: "user", title: "Ответственный" },
      // COMPANY_SAMPLES_FIELD_ID is omitted
    };

    const issues = validateCompanyFieldsContract(fieldsWithoutCustom);
    const warning = issues.find(
      (i) => i.severity === "warning" && i.field === COMPANY_SAMPLES_FIELD_ID
    );

    expect(warning).toBeDefined();
    const overall = validateAllBitrixContracts({ companyFields: fieldsWithoutCustom });
    // Warnings do NOT make ok false
    expect(overall.ok).toBe(true);
    expect(overall.warnings.length).toBeGreaterThanOrEqual(1);
    expect(overall.errors).toHaveLength(0);
  });

  it("TC-CONTRACT-05: invalid deal or status list envelope triggers error", () => {
    const dealListIssues = validateDealListContract({ result: "not an array" });
    expect(dealListIssues.some((i) => i.severity === "error")).toBe(true);

    const statusListIssues = validateStatusListContract({ result: [{ no_status_id: true }] });
    expect(statusListIssues.some((i) => i.severity === "error" && i.field === "STATUS_ID")).toBe(true);
  });
});
