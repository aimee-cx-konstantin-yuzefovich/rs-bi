import { describe, it, expect } from "vitest";
import { formatDateRu } from "@/components/dashboard/samples/samples-registry";

describe("DEF-01 Adversarial: formatDateRu robustness across date and datetime representations", () => {
  it("formats pure ISO YYYY-MM-DD correctly", () => {
    expect(formatDateRu("2026-05-12")).toBe("12.05.2026");
    expect(formatDateRu("2026-11-03")).toBe("03.11.2026");
  });

  it("formats ISO datetime YYYY-MM-DDTHH:mm:ss without breaking into Invalid Date", () => {
    expect(formatDateRu("2026-05-12T14:30:00")).toBe("12.05.2026");
    expect(formatDateRu("2026-05-12T00:00:00.000Z")).toBe("12.05.2026");
  });

  it("formats space-separated datetime YYYY-MM-DD HH:mm:ss", () => {
    expect(formatDateRu("2026-05-12 14:30:00")).toBe("12.05.2026");
  });

  it("preserves already formatted Russian DD.MM.YYYY string", () => {
    expect(formatDateRu("12.05.2026")).toBe("12.05.2026");
  });

  it("safely handles non-date sentinels without throwing or producing NaN", () => {
    expect(formatDateRu("—")).toBe("—");
    expect(formatDateRu("")).toBe("");
  });
});
