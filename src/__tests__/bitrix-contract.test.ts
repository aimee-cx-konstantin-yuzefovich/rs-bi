// src/__tests__/bitrix-contract.test.ts
// ─────────────────────────────────────────────────────────────────────
// Comprehensive regression tests for Bitrix upstream contract validation.
// Covers presence, typing, multiplicity, enum IDs, stage semantics,
// live SKIP/PASS/FAIL behaviors, and CLI identity.
// ─────────────────────────────────────────────────────────────────────

import { describe, it, expect } from "vitest";
import {
  validateAllBitrixContracts,
  validateDealFieldsContract,
  validateCompanyFieldsContract,
  validateDealListContract,
  validateCompanyListContract,
  validateStatusListContract,
  verifyLiveBitrixContract,
  OFFLINE_CONTRACT_SNAPSHOT,
} from "../lib/bitrix-contract";
import {
  PAYMENT_STATUS_FIELD_ID,
  PAYMENT_STATUS_VALUES,
  COMPANY_SAMPLES_FIELD_ID,
  COMPANY_SAMPLES_DATE_MULTI_FIELD_ID,
  COMPANY_SAMPLES_DATE_SINGLE_FIELD_ID,
  DEAL_SAMPLE_TRANSFER_FIELD_ID,
  DEAL_SAMPLE_TESTING_FIELD_ID,
  DEAL_SAMPLE_SENT_DATE_FIELD_ID,
  DEAL_SAMPLE_TVL_DETAILS_FIELD_ID,
} from "../lib/crm-constants";
import { validateContract as cliValidateContract } from "../../scripts/verify-bitrix-contract.mjs";

describe("Bitrix Contract Validator — Canonical Engine", () => {
  it("TC-CONTRACT-01: canonical offline snapshot passes validation with 0 errors and 0 warnings", () => {
    const res = validateAllBitrixContracts(OFFLINE_CONTRACT_SNAPSHOT);
    expect(res.ok).toBe(true);
    expect(res.errors).toHaveLength(0);
    expect(res.warnings).toHaveLength(0);
  });

  describe("Field Presence Contract", () => {
    it("TC-CONTRACT-02a: missing required standard Deal field (OPPORTUNITY) -> FAIL", () => {
      const broken = JSON.parse(JSON.stringify(OFFLINE_CONTRACT_SNAPSHOT.dealFields.result));
      delete broken.OPPORTUNITY;

      const issues = validateDealFieldsContract(broken);
      const err = issues.find((i) => i.field === "OPPORTUNITY" && i.severity === "error");
      expect(err).toBeDefined();
      expect(err?.message).toContain("Missing critical deal field 'OPPORTUNITY'");

      const overall = validateAllBitrixContracts({ dealFields: { result: broken } });
      expect(overall.ok).toBe(false);
    });

    it("TC-CONTRACT-02b: missing required custom Deal field (PAYMENT_STATUS_FIELD_ID) -> FAIL", () => {
      const broken = JSON.parse(JSON.stringify(OFFLINE_CONTRACT_SNAPSHOT.dealFields.result));
      delete broken[PAYMENT_STATUS_FIELD_ID];

      const issues = validateDealFieldsContract(broken);
      const err = issues.find((i) => i.field === PAYMENT_STATUS_FIELD_ID && i.severity === "error");
      expect(err).toBeDefined();
      expect(err?.message).toContain(`Missing critical deal field '${PAYMENT_STATUS_FIELD_ID}'`);

      const overall = validateAllBitrixContracts({ dealFields: { result: broken } });
      expect(overall.ok).toBe(false);
    });

    it("TC-CONTRACT-02c: missing required standard Company field (TITLE) -> FAIL", () => {
      const broken = JSON.parse(JSON.stringify(OFFLINE_CONTRACT_SNAPSHOT.companyFields.result));
      delete broken.TITLE;

      const issues = validateCompanyFieldsContract(broken);
      const err = issues.find((i) => i.field === "TITLE" && i.severity === "error");
      expect(err).toBeDefined();
      expect(err?.message).toContain("Missing critical company field 'TITLE'");

      const overall = validateAllBitrixContracts({ companyFields: { result: broken } });
      expect(overall.ok).toBe(false);
    });

    it("TC-CONTRACT-02d: missing required custom Company field (COMPANY_SAMPLES_FIELD_ID) -> FAIL", () => {
      const broken = JSON.parse(JSON.stringify(OFFLINE_CONTRACT_SNAPSHOT.companyFields.result));
      delete broken[COMPANY_SAMPLES_FIELD_ID];

      const issues = validateCompanyFieldsContract(broken);
      const err = issues.find((i) => i.field === COMPANY_SAMPLES_FIELD_ID && i.severity === "error");
      expect(err).toBeDefined();
      expect(err?.message).toContain(`Missing critical company field '${COMPANY_SAMPLES_FIELD_ID}'`);

      const overall = validateAllBitrixContracts({ companyFields: { result: broken } });
      expect(overall.ok).toBe(false);
    });

    it("TC-CONTRACT-02e: missing optional display-only field (DEAL_SAMPLE_TVL_DETAILS_FIELD_ID) -> WARNING (ok: true)", () => {
      const fields = JSON.parse(JSON.stringify(OFFLINE_CONTRACT_SNAPSHOT.dealFields.result));
      delete fields[DEAL_SAMPLE_TVL_DETAILS_FIELD_ID];

      const issues = validateDealFieldsContract(fields);
      const warn = issues.find((i) => i.field === DEAL_SAMPLE_TVL_DETAILS_FIELD_ID && i.severity === "warning");
      expect(warn).toBeDefined();
      expect(warn?.message).toContain(`Missing optional deal field '${DEAL_SAMPLE_TVL_DETAILS_FIELD_ID}'`);

      const overall = validateAllBitrixContracts({ dealFields: { result: fields } });
      expect(overall.ok).toBe(true);
      expect(overall.errors).toHaveLength(0);
      expect(overall.warnings.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe("Field Type Contract", () => {
    it("TC-CONTRACT-03a: OPPORTUNITY changed to string -> FAIL", () => {
      const broken = JSON.parse(JSON.stringify(OFFLINE_CONTRACT_SNAPSHOT.dealFields.result));
      broken.OPPORTUNITY.type = "string";

      const issues = validateDealFieldsContract(broken);
      const err = issues.find((i) => i.field === "OPPORTUNITY" && i.severity === "error");
      expect(err).toBeDefined();
      expect(err?.message).toContain("expected type [double, float, number], found 'string'");

      const overall = validateAllBitrixContracts({ dealFields: { result: broken } });
      expect(overall.ok).toBe(false);
    });

    it("TC-CONTRACT-03b: sample sent date changed to string -> FAIL", () => {
      const broken = JSON.parse(JSON.stringify(OFFLINE_CONTRACT_SNAPSHOT.dealFields.result));
      broken[DEAL_SAMPLE_SENT_DATE_FIELD_ID].type = "string";

      const issues = validateDealFieldsContract(broken);
      const err = issues.find((i) => i.field === DEAL_SAMPLE_SENT_DATE_FIELD_ID && i.severity === "error");
      expect(err).toBeDefined();
      expect(err?.message).toContain("expected type [date, datetime], found 'string'");
    });

    it("TC-CONTRACT-03c: enum field changed to date or string -> FAIL", () => {
      const broken = JSON.parse(JSON.stringify(OFFLINE_CONTRACT_SNAPSHOT.dealFields.result));
      broken[DEAL_SAMPLE_TRANSFER_FIELD_ID].type = "date";

      const issues = validateDealFieldsContract(broken);
      const err = issues.find((i) => i.field === DEAL_SAMPLE_TRANSFER_FIELD_ID && i.severity === "error");
      expect(err).toBeDefined();
      expect(err?.message).toContain("expected type [enumeration], found 'date'");
    });
  });

  describe("Field Multiplicity Contract", () => {
    it("TC-CONTRACT-04a: expected multiple changed to single (COMPANY_SAMPLES_DATE_MULTI_FIELD_ID) -> FAIL", () => {
      const broken = JSON.parse(JSON.stringify(OFFLINE_CONTRACT_SNAPSHOT.companyFields.result));
      broken[COMPANY_SAMPLES_DATE_MULTI_FIELD_ID].isMultiple = false;

      const issues = validateCompanyFieldsContract(broken);
      const err = issues.find((i) => i.field === COMPANY_SAMPLES_DATE_MULTI_FIELD_ID && i.severity === "error");
      expect(err).toBeDefined();
      expect(err?.message).toContain("expected multiplicity MULTIPLE, found SINGLE");

      const overall = validateAllBitrixContracts({ companyFields: { result: broken } });
      expect(overall.ok).toBe(false);
    });

    it("TC-CONTRACT-04b: expected single changed to multiple (COMPANY_SAMPLES_DATE_SINGLE_FIELD_ID) -> FAIL", () => {
      const broken = JSON.parse(JSON.stringify(OFFLINE_CONTRACT_SNAPSHOT.companyFields.result));
      broken[COMPANY_SAMPLES_DATE_SINGLE_FIELD_ID].isMultiple = "Y";

      const issues = validateCompanyFieldsContract(broken);
      const err = issues.find((i) => i.field === COMPANY_SAMPLES_DATE_SINGLE_FIELD_ID && i.severity === "error");
      expect(err).toBeDefined();
      expect(err?.message).toContain("expected multiplicity SINGLE, found MULTIPLE");

      const overall = validateAllBitrixContracts({ companyFields: { result: broken } });
      expect(overall.ok).toBe(false);
    });

    it("TC-CONTRACT-04c: correctly normalizes Bitrix 'Y'/'N' representations", () => {
      const comp = JSON.parse(JSON.stringify(OFFLINE_CONTRACT_SNAPSHOT.companyFields.result));
      comp[COMPANY_SAMPLES_DATE_MULTI_FIELD_ID].isMultiple = "Y"; // true
      comp[COMPANY_SAMPLES_DATE_SINGLE_FIELD_ID].isMultiple = "N"; // false

      const issues = validateCompanyFieldsContract(comp);
      const multErr = issues.find(
        (i) => (i.field === COMPANY_SAMPLES_DATE_MULTI_FIELD_ID || i.field === COMPANY_SAMPLES_DATE_SINGLE_FIELD_ID) && i.severity === "error"
      );
      expect(multErr).toBeUndefined();
    });
  });

  describe("Enum IDs Contract", () => {
    it("TC-CONTRACT-05a: payment status missing enum 113 (PAID) -> FAIL", () => {
      const broken = JSON.parse(JSON.stringify(OFFLINE_CONTRACT_SNAPSHOT.dealFields.result));
      broken[PAYMENT_STATUS_FIELD_ID].items = broken[PAYMENT_STATUS_FIELD_ID].items.filter(
        (item: any) => item.ID !== PAYMENT_STATUS_VALUES.PAID
      );

      const issues = validateDealFieldsContract(broken);
      const err = issues.find((i) => i.field === PAYMENT_STATUS_FIELD_ID && i.message.includes("'113'"));
      expect(err).toBeDefined();
      expect(err?.message).toContain("missing required enum ID '113' (Оплачен)");

      const overall = validateAllBitrixContracts({ dealFields: { result: broken } });
      expect(overall.ok).toBe(false);
    });

    it("TC-CONTRACT-05b: payment status enum ID changed while label remains similar -> FAIL", () => {
      const broken = JSON.parse(JSON.stringify(OFFLINE_CONTRACT_SNAPSHOT.dealFields.result));
      broken[PAYMENT_STATUS_FIELD_ID].items = broken[PAYMENT_STATUS_FIELD_ID].items.map((item: any) =>
        item.ID === "113" ? { ID: "999", VALUE: "Оплачен" } : item
      );

      const issues = validateDealFieldsContract(broken);
      const err = issues.find((i) => i.field === PAYMENT_STATUS_FIELD_ID && i.message.includes("'113'"));
      expect(err).toBeDefined();
    });

    it("TC-CONTRACT-05c: unrelated additional enum values remain compatible -> PASS", () => {
      const validWithExtra = JSON.parse(JSON.stringify(OFFLINE_CONTRACT_SNAPSHOT.dealFields.result));
      validWithExtra[PAYMENT_STATUS_FIELD_ID].items.push({ ID: "999", VALUE: "Специальный статус" });

      const issues = validateDealFieldsContract(validWithExtra);
      const err = issues.find((i) => i.field === PAYMENT_STATUS_FIELD_ID && i.severity === "error");
      expect(err).toBeUndefined();
    });
  });

  describe("Stage Semantics Contract", () => {
    it("TC-CONTRACT-06a: WON missing from status registry -> FAIL", () => {
      const broken = [{ STATUS_ID: "LOSE", NAME: "Сделка проиграна" }];

      const issues = validateStatusListContract({ result: broken });
      const err = issues.find((i) => i.field === "WON" && i.severity === "error");
      expect(err).toBeDefined();
      expect(err?.message).toContain("Missing required base stage 'WON'");

      const overall = validateAllBitrixContracts({ statusList: { result: broken } });
      expect(overall.ok).toBe(false);
    });

    it("TC-CONTRACT-06b: LOSE missing from status registry -> FAIL", () => {
      const broken = [{ STATUS_ID: "WON", NAME: "Сделка успешна" }];

      const issues = validateStatusListContract({ result: broken });
      const err = issues.find((i) => i.field === "LOSE" && i.severity === "error");
      expect(err).toBeDefined();
      expect(err?.message).toContain("Missing required base stage 'LOSE'");

      const overall = validateAllBitrixContracts({ statusList: { result: broken } });
      expect(overall.ok).toBe(false);
    });

    it("TC-CONTRACT-06c: category-prefixed stages (e.g. C1:WON, C2:LOSE) satisfy base stage requirement", () => {
      const valid = [
        { STATUS_ID: "C1:WON", NAME: "Сделка успешна (воронка 1)" },
        { STATUS_ID: "C1:LOSE", NAME: "Сделка проиграна (воронка 1)" },
      ];

      const issues = validateStatusListContract({ result: valid });
      const stageErrs = issues.filter((i) => (i.field === "WON" || i.field === "LOSE") && i.severity === "error");
      expect(stageErrs).toHaveLength(0);
    });
  });

  describe("Live Contract Gate", () => {
    it("TC-CONTRACT-07a: unset webhook URL reports SKIPPED and never PASS", async () => {
      const resUndefined = await verifyLiveBitrixContract(undefined);
      expect(resUndefined.status).toBe("SKIPPED");
      expect(resUndefined.message).toContain("SKIPPED — LIVE BITRIX NOT CONFIGURED");
      expect(resUndefined.errors).toHaveLength(0);

      const resEmpty = await verifyLiveBitrixContract("   ");
      expect(resEmpty.status).toBe("SKIPPED");
      expect(resEmpty.message).toContain("SKIPPED — LIVE BITRIX NOT CONFIGURED");
      expect(resEmpty.errors).toHaveLength(0);
    });

    it("TC-CONTRACT-07b: mock valid live contract reports PASS", async () => {
      const mockFetch = async (url: string | URL | Request) => {
        const urlStr = String(url);
        if (urlStr.includes("crm.deal.fields")) {
          return { ok: true, json: async () => OFFLINE_CONTRACT_SNAPSHOT.dealFields } as Response;
        }
        if (urlStr.includes("crm.company.fields")) {
          return { ok: true, json: async () => OFFLINE_CONTRACT_SNAPSHOT.companyFields } as Response;
        }
        if (urlStr.includes("crm.deal.list")) {
          return { ok: true, json: async () => OFFLINE_CONTRACT_SNAPSHOT.dealList } as Response;
        }
        if (urlStr.includes("crm.company.list")) {
          return { ok: true, json: async () => OFFLINE_CONTRACT_SNAPSHOT.companyList } as Response;
        }
        if (urlStr.includes("crm.status.list")) {
          return { ok: true, json: async () => OFFLINE_CONTRACT_SNAPSHOT.statusList } as Response;
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

    it("TC-CONTRACT-07c: mock incompatible live contract reports FAIL", async () => {
      const mockBrokenFetch = async (url: string | URL | Request) => {
        const urlStr = String(url);
        if (urlStr.includes("crm.deal.fields")) {
          return {
            ok: true,
            json: async () => ({
              result: {
                ID: { type: "integer" }, // missing OPPORTUNITY, STAGE_ID, etc.
              },
            }),
          } as Response;
        }
        return { ok: true, json: async () => ({ result: [] }) } as Response;
      };

      const res = await verifyLiveBitrixContract("https://mock-b24.test/rest/1/token", {
        fetchFn: mockBrokenFetch as any,
      });

      expect(res.status).toBe("FAIL");
      expect(res.errors.some((e) => e.field === "OPPORTUNITY")).toBe(true);
    });

    it("TC-CONTRACT-07d: live network failure reports FAIL", async () => {
      const mockNetworkFailure = async () => {
        throw new Error("ETIMEDOUT: Connection timed out");
      };

      const res = await verifyLiveBitrixContract("https://mock-b24.test/rest/1/token", {
        fetchFn: mockNetworkFailure as any,
      });

      expect(res.status).toBe("FAIL");
      expect(res.message).toContain("ETIMEDOUT");
      expect(res.errors.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe("CLI and Library Validation Identity", () => {
    it("TC-CONTRACT-08: proves CLI validateContract produces identical result to library validateAllBitrixContracts", () => {
      const cliRes = cliValidateContract(OFFLINE_CONTRACT_SNAPSHOT);
      const libRes = validateAllBitrixContracts(OFFLINE_CONTRACT_SNAPSHOT);

      expect(cliRes.ok).toBe(libRes.ok);
      expect(cliRes.errors).toEqual(libRes.errors);
      expect(cliRes.warnings).toEqual(libRes.warnings);

      // Mutational test through CLI adapter
      const brokenDeal = JSON.parse(JSON.stringify(OFFLINE_CONTRACT_SNAPSHOT));
      delete brokenDeal.dealFields.result.OPPORTUNITY;

      const cliBrokenRes = cliValidateContract(brokenDeal);
      const libBrokenRes = validateAllBitrixContracts(brokenDeal);

      expect(cliBrokenRes.ok).toBe(false);
      expect(cliBrokenRes.ok).toBe(libBrokenRes.ok);
      expect(cliBrokenRes.errors.some((e: any) => e.field === "OPPORTUNITY")).toBe(true);
      expect(cliBrokenRes.errors).toEqual(libBrokenRes.errors);
    });
  });
});
