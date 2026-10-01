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
  });

  it("R6: Numeric string '12345' is treated strictly as free text, never resolved via enum dictionary", () => {
    const dictResolver = (fieldId: string, val: string) => {
      if (fieldId === SMART_PROCESS_TEST_RESULT_FIELD_ID && val === "12345") {
        return "Фальшивый статус из enum";
      }
      return val;
    };

    const res = resolveSmartProcessResult("12345", dictResolver);
    expect(res.raw).toBe("12345");
    expect(res.label).toBe("12345");
    expect(res.label).not.toBe("Фальшивый статус из enum");
    expect(res.label).not.toContain("Не классифицировано");
    expect(res.normalized).toBe("unknown");
    expect((res as any).unknownEnumId).toBeUndefined();
  });

  it("R7: 'Клиент тестирует повторно' is preserved verbatim as free text, canonical unknown", () => {
    const res = resolveSmartProcessResult("Клиент тестирует повторно");
    expect(res.raw).toBe("Клиент тестирует повторно");
    expect(res.label).toBe("Клиент тестирует повторно");
    expect(res.label).not.toContain("Не классифицировано");
    expect(res.normalized).toBe("unknown");
    expect((res as any).unknownEnumId).toBeUndefined();
  });
});
