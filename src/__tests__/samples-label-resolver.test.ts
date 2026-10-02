// src/__tests__/samples-label-resolver.test.ts
// Data-trust enum fallback contract for the shared Samples label resolver:
// mapped ID → label; unknown numeric ID → «Не классифицировано»;
// missing/empty metadata map → «Не классифицировано» for numeric raws;
// genuine text labels and verified free-text fields pass through verbatim.
import { describe, expect, it } from "vitest";
import { makeLabelResolver } from "@/lib/samples/bitrix-fetch";
import {
  COMPANY_SAMPLES_FIELD_ID,
  COMPANY_SAMPLES_GRADE_GEL_FIELD_ID,
  COMPANY_TEST_RESULT_FIELD_ID,
  UNCLASSIFIED_LABEL,
} from "@/lib/crm-constants";
import { identityLabelResolver } from "@/lib/samples/normalize";
import { resolveSmartProcessResult } from "@/lib/samples/adapters/smart-process";

const FIELD = COMPANY_SAMPLES_FIELD_ID;
const GRADE = COMPANY_SAMPLES_GRADE_GEL_FIELD_ID;

describe("makeLabelResolver — dictionary-backed enum protection", () => {
  it("mapped ID resolves to the mapped label", () => {
    const resolve = makeLabelResolver({ [FIELD]: { "1": "Образцы отправлены" } });
    expect(resolve(FIELD, "1")).toBe("Образцы отправлены");
  });

  it("unknown numeric ID with populated map fails closed to «Не классифицировано»", () => {
    const resolve = makeLabelResolver({ [FIELD]: { "1": "Образцы отправлены" } });
    expect(resolve(FIELD, "2695")).toBe(UNCLASSIFIED_LABEL);
    expect(resolve(FIELD, "2695")).not.toContain("2695");
  });

  it("missing metadata map: unknown numeric ID fails closed, raw ID never leaks", () => {
    const resolve = makeLabelResolver({});
    expect(resolve(FIELD, "99")).toBe(UNCLASSIFIED_LABEL);
  });

  it("empty metadata map: unknown numeric ID fails closed", () => {
    const resolve = makeLabelResolver({ [FIELD]: {} });
    expect(resolve(FIELD, "99")).toBe(UNCLASSIFIED_LABEL);
  });

  it("non-numeric text values pass through verbatim (legacy text labels preserved)", () => {
    const resolve = makeLabelResolver({});
    expect(resolve(FIELD, "Образцы отправлены")).toBe("Образцы отправлены");
    expect(resolve(FIELD, "Переданы заказчику")).toBe("Переданы заказчику");
  });
});

describe("makeLabelResolver — verified free-text fields unchanged", () => {
  it("free-text result field keeps raw values even when numeric-looking", () => {
    const resolve = makeLabelResolver({});
    // COMPANY_TEST_RESULT_FIELD_ID is NOT dictionary-backed: free text passes.
    expect(resolve(COMPANY_TEST_RESULT_FIELD_ID, "Проба прошла успешно")).toBe(
      "Проба прошла успешно"
    );
  });

  it("Smart Process result stays verified free text (identity resolver path)", () => {
    const resolved = resolveSmartProcessResult("777", identityLabelResolver);
    expect(resolved.raw).toBe("777");
    expect(resolved.label).toBe("777");
    expect(resolved.normalized).toBe("unknown");
  });

  it("grade enum over the resolver with missing metadata fails closed", () => {
    const resolve = makeLabelResolver({});
    expect(resolve(GRADE, "42")).toBe(UNCLASSIFIED_LABEL);
  });
});
