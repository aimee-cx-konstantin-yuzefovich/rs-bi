import { describe, it, expect } from "vitest";
import { resolveSmartProcessResult } from "@/lib/samples/adapters/smart-process";
import { SMART_PROCESS_TEST_RESULT_FIELD_ID } from "@/lib/samples/smart-process-contract";

describe("Smart Process 1032 — Test Result Free-Text String Semantics", () => {
  const emptyResolver = (_fieldId: string, val: string) => val;

  it("R1: Empty / null / sentinel -> unknown result with no label", () => {
    expect(resolveSmartProcessResult(undefined, emptyResolver)).toEqual({ normalized: "unknown" });
    expect(resolveSmartProcessResult(null, emptyResolver)).toEqual({ normalized: "unknown" });
    expect(resolveSmartProcessResult("", emptyResolver)).toEqual({ normalized: "unknown" });
    expect(resolveSmartProcessResult("—", emptyResolver)).toEqual({ normalized: "unknown" });
    expect(resolveSmartProcessResult("null", emptyResolver)).toEqual({ normalized: "unknown" });
  });

  it("R2: Positive keyword match in technologist text -> normalized positive", () => {
    const text = "Положительный, дисперсность в норме";
    const res = resolveSmartProcessResult(text, emptyResolver);
    expect(res.raw).toBe(text);
    expect(res.label).toBe(text);
    expect(res.normalized).toBe("positive");
  });

  it("R3: Negative keyword match in technologist text -> normalized negative", () => {
    const text = "Отрицательный: высокая вязкость, не соответствует ТУ";
    const res = resolveSmartProcessResult(text, emptyResolver);
    expect(res.raw).toBe(text);
    expect(res.label).toBe(text);
    expect(res.normalized).toBe("negative");
  });

  it("R4: Neutral text without match -> normalized unknown, in-progress text -> normalized pending", () => {
    const neutralText = "Не определен статус";
    const resNeutral = resolveSmartProcessResult(neutralText, emptyResolver);
    expect(resNeutral.raw).toBe(neutralText);
    expect(resNeutral.label).toBe(neutralText);
    expect(resNeutral.normalized).toBe("unknown");

    const pendingText = "Испытания в процессе";
    const resPending = resolveSmartProcessResult(pendingText, emptyResolver);
    expect(resPending.raw).toBe(pendingText);
    expect(resPending.label).toBe(pendingText);
    expect(resPending.normalized).toBe("pending");
  });

  it("R5: Arbitrary technologist text -> preserved verbatim, never forced to 'Не классифицировано'", () => {
    const text = "Образцы доставлены в лабораторию завода. Ждем заключения главного технолога до конца месяца.";
    const res = resolveSmartProcessResult(text, emptyResolver);
    expect(res.raw).toBe(text);
    expect(res.label).toBe(text);
    expect(res.label).not.toContain("Не классифицировано");
    expect(res.normalized).toBe("unknown");
    expect(res.unknownEnumId).toBeUndefined();
  });

  it("R6: Metadata dictionary resolution maps ID to label and classifies", () => {
    const dictResolver = (fieldId: string, val: string) => {
      if (fieldId === SMART_PROCESS_TEST_RESULT_FIELD_ID && val === "501") {
        return "Успешно подошли";
      }
      return val;
    };

    const res = resolveSmartProcessResult("501", dictResolver);
    expect(res.raw).toBe("501");
    expect(res.label).toBe("Успешно подошли");
    expect(res.normalized).toBe("positive");
  });

  it("R7: Numeric string without dictionary is treated as free text (verbatim, never 'Не классифицировано (<id>')", () => {
    // Because the live field is verified string (free text), numeric text without
    // a dictionary entry is preserved verbatim and classified as unknown.
    const res = resolveSmartProcessResult("100", emptyResolver);
    expect(res.raw).toBe("100");
    expect(res.label).toBe("100");
    expect(res.label).not.toContain("Не классифицировано");
    expect(res.normalized).toBe("unknown");
    expect(res.unknownEnumId).toBeUndefined();
  });
});
