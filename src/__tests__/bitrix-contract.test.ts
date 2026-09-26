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

  it("TC-CONTRACT-06: offline validator detects field type mismatches", () => {
    const dealFieldsBadType = {
      ...validDealFields,
      OPPORTUNITY: { type: "string", title: "Сумма" }, // Invalid! Should be double
      DATE_CREATE: { type: "integer", title: "Дата создания" }, // Invalid! Should be datetime
    };

    const issues = validateDealFieldsContract(dealFieldsBadType);
    expect(issues.some((i) => i.field === "OPPORTUNITY" && i.message.includes("expected numeric type"))).toBe(true);
    expect(issues.some((i) => i.field === "DATE_CREATE" && i.message.includes("expected date/datetime type"))).toBe(true);

    const companyFieldsBadType = {
      ...validCompanyFields,
      TITLE: { type: "integer", title: "Название компании" }, // Invalid! Should be string
    };
    const compIssues = validateCompanyFieldsContract(companyFieldsBadType);
    expect(compIssues.some((i) => i.field === "TITLE" && i.message.includes("expected string type"))).toBe(true);
  });

  it("TC-CONTRACT-07: live contract gate reports SKIPPED when env var is unset", async () => {
    const { verifyLiveBitrixContract } = await import("../lib/bitrix-contract");

    // Test with undefined and empty string
    const resUndefined = await verifyLiveBitrixContract(undefined);
    expect(resUndefined.status).toBe("SKIPPED");
    expect(resUndefined.message).toContain("SKIPPED — LIVE BITRIX NOT CONFIGURED");
    expect(resUndefined.message).not.toContain("PASS");
    expect(resUndefined.errors).toHaveLength(0);

    const resEmpty = await verifyLiveBitrixContract("   ");
    expect(resEmpty.status).toBe("SKIPPED");
    expect(resEmpty.message).toContain("SKIPPED — LIVE BITRIX NOT CONFIGURED");
    expect(resEmpty.message).not.toContain("PASS");
    expect(resEmpty.errors).toHaveLength(0);
  });

  it("TC-CONTRACT-08: live contract gate validates against mock server returning valid payloads", async () => {
    const { verifyLiveBitrixContract } = await import("../lib/bitrix-contract");

    const mockFetch = async (url: string | URL | Request) => {
      const urlStr = String(url);
      if (urlStr.includes("crm.deal.fields")) {
        return { ok: true, json: async () => ({ result: validDealFields }) } as Response;
      }
      if (urlStr.includes("crm.company.fields")) {
        return { ok: true, json: async () => ({ result: validCompanyFields }) } as Response;
      }
      if (urlStr.includes("crm.deal.list")) {
        return { ok: true, json: async () => ({ result: [{ ID: "101", STAGE_ID: "WON" }] }) } as Response;
      }
      if (urlStr.includes("crm.company.list")) {
        return { ok: true, json: async () => ({ result: [{ ID: "201", TITLE: "Company X" }] }) } as Response;
      }
      if (urlStr.includes("crm.status.list")) {
        return {
          ok: true,
          json: async () => ({
            result: [
              { STATUS_ID: "WON", NAME: "Сделка успешна" },
              { STATUS_ID: "LOSE", NAME: "Сделка проиграна" },
            ],
          }),
        } as Response;
      }
      return { ok: false, status: 404, statusText: "Not Found" } as Response;
    };

    const res = await verifyLiveBitrixContract("https://mock-b24.test/rest/1/token", {
      fetchFn: mockFetch as any,
    });

    expect(res.status).toBe("PASS");
    expect(res.message).toContain("passed successfully");
    expect(res.errors).toHaveLength(0);
  });

  it("TC-CONTRACT-09: live contract gate reports FAIL when mock server returns invalid contract or network error", async () => {
    const { verifyLiveBitrixContract } = await import("../lib/bitrix-contract");

    // Network error scenario
    const mockFailingFetch = async () => {
      throw new Error("Connection refused");
    };

    const resFail = await verifyLiveBitrixContract("https://mock-b24.test/rest/1/token", {
      fetchFn: mockFailingFetch as any,
    });

    expect(resFail.status).toBe("FAIL");
    expect(resFail.message).toContain("Connection refused");
    expect(resFail.errors.length).toBeGreaterThanOrEqual(1);

    // Schema invalidity scenario
    const mockBrokenFetch = async (url: string | URL | Request) => {
      const urlStr = String(url);
      if (urlStr.includes("crm.deal.fields")) {
        return { ok: true, json: async () => ({ result: { ID: { type: "integer" } } }) } as Response; // missing OPPORTUNITY, STAGE_ID, etc.
      }
      return { ok: true, json: async () => ({ result: [] }) } as Response;
    };

    const resSchemaBroken = await verifyLiveBitrixContract("https://mock-b24.test/rest/1/token", {
      fetchFn: mockBrokenFetch as any,
    });

    expect(resSchemaBroken.status).toBe("FAIL");
    expect(resSchemaBroken.errors.some((e) => e.field === "OPPORTUNITY")).toBe(true);
  });
});
