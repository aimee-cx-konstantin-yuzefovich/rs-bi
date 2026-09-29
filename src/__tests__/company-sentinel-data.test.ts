import { describe, it, expect } from "vitest";
import { parseCellNativeValue, normalizeCompanyReportFieldValue } from "@/lib/export-utils";

describe("Phase B Data Correctness: Sentinel Suppression & Scalar Safety", () => {
  describe("parseCellNativeValue (Excel Export Data Layer)", () => {
    it("converts EN DASH ('–') and EM DASH ('—') to null", () => {
      expect(parseCellNativeValue("–")).toBeNull();
      expect(parseCellNativeValue("—")).toBeNull();
      expect(parseCellNativeValue(" - ")).toBeNull();
    });

    it("suppresses boolean false / string 'false' / 'null' in non-boolean fields to null", () => {
      // String field
      expect(parseCellNativeValue(false, { fieldType: "string" })).toBeNull();
      expect(parseCellNativeValue("false", { fieldType: "string" })).toBeNull();
      expect(parseCellNativeValue("null", { fieldType: "string" })).toBeNull();
      expect(parseCellNativeValue("undefined", { fieldType: "string" })).toBeNull();

      // Enumeration field
      expect(parseCellNativeValue(false, { fieldType: "enumeration" })).toBeNull();
      expect(parseCellNativeValue("false", { fieldType: "enumeration" })).toBeNull();

      // CRM Status field
      expect(parseCellNativeValue(false, { fieldType: "crm_status" })).toBeNull();
      expect(parseCellNativeValue("false", { fieldType: "crm_status" })).toBeNull();
    });

    it("preserves boolean resolution ('Да' / 'Нет') for genuine boolean and char fields", () => {
      expect(parseCellNativeValue(false, { fieldType: "boolean" })).toBe("Нет");
      expect(parseCellNativeValue(true, { fieldType: "boolean" })).toBe("Да");
      expect(parseCellNativeValue(false, { fieldType: "char" })).toBe("Нет");
      expect(parseCellNativeValue(true, { fieldType: "char" })).toBe("Да");
    });
  });

  describe("normalizeCompanyReportFieldValue (Single Company Export)", () => {
    it("normalizes non-boolean field sentinels (false, 'false', 'null') to null", () => {
      const resBoolFalse = normalizeCompanyReportFieldValue({
        label: "Комментарий",
        value: false as any,
        type: "string",
      });
      expect(resBoolFalse.value).toBeNull();

      const resStrFalse = normalizeCompanyReportFieldValue({
        label: "Комментарий",
        value: "false",
        type: "string",
      });
      expect(resStrFalse.value).toBeNull();

      const resDash = normalizeCompanyReportFieldValue({
        label: "Комментарий",
        value: "–",
        type: "string",
      });
      expect(resDash.value).toBeNull();
    });
  });
});
