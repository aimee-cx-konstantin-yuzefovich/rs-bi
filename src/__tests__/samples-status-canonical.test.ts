// src/__tests__/samples-status-canonical.test.ts
// ─────────────────────────────────────────────────────────────────────
// SMP-CST-1 .. SMP-CST-8: Canonical Samples status filter.
//
// Contract (WP3): dropdown/filter labels flow through ONE explicit
// deterministic normalization at the canonical projection seam:
// - known duplicate aliases collapse into one canonical status;
// - SP authoritative canonical labels pass through unchanged;
// - unknown legacy values → «Не классифицировано»;
// - NO fuzzy matching, NO substring guessing, NO lowercasing merges;
// - raw duplicate strings never become dropdown options.
// ─────────────────────────────────────────────────────────────────────

import { describe, it, expect } from "vitest";
import {
  canonicalizeSampleStatusLabel,
  canonicalizeSampleStatusList,
  buildCanonicalStatusOptions,
  CANONICAL_SAMPLE_UI_STATUSES,
  SAMPLE_STATUS_ALIAS_MAP,
} from "@/lib/samples/status-canonical";
import { UNCLASSIFIED_LABEL } from "@/lib/samples/constants";

describe("Canonical Samples Status (SMP-CST-1 .. SMP-CST-8)", () => {
  it("SMP-CST-1: known duplicate aliases collapse into one canonical status", () => {
    expect(canonicalizeSampleStatusLabel("не подошли")).toBe("Не подошли");
    expect(canonicalizeSampleStatusLabel("Не подошли")).toBe("Не подошли");
    expect(canonicalizeSampleStatusLabel("Образец не подошел")).toBe("Не подошли");
    expect(canonicalizeSampleStatusLabel("Образец не подошёл")).toBe("Не подошли");

    expect(canonicalizeSampleStatusLabel("подошли")).toBe("Подошли");
    expect(canonicalizeSampleStatusLabel("Подошли")).toBe("Подошли");
    expect(canonicalizeSampleStatusLabel("Образец подошел")).toBe("Подошли");
    expect(canonicalizeSampleStatusLabel("Образец подошёл")).toBe("Подошли");

    expect(canonicalizeSampleStatusLabel("На испытании")).toBe("На испытании");
    expect(canonicalizeSampleStatusLabel("Образцы на испытании")).toBe("На испытании");

    expect(canonicalizeSampleStatusLabel("Образцы отправлены")).toBe("Образцы отправлены");
  });

  it("SMP-CST-2: SP canonical stage labels pass through unchanged (SP wins)", () => {
    // Canonical SP-facing categories are identity-mapped.
    expect(canonicalizeSampleStatusLabel("Подготовка к отправке")).toBe("Подготовка к отправке");
    expect(canonicalizeSampleStatusLabel("Образцы отправлены")).toBe("Образцы отправлены");
    expect(canonicalizeSampleStatusLabel("На испытании")).toBe("На испытании");
    expect(canonicalizeSampleStatusLabel("Подошли")).toBe("Подошли");
    expect(canonicalizeSampleStatusLabel("Не подошли")).toBe("Не подошли");
  });

  it("SMP-CST-3: legacy-only semantic states stay ONE canonical category each", () => {
    expect(canonicalizeSampleStatusLabel("Требуются образцы")).toBe("Требуются образцы");
    expect(canonicalizeSampleStatusLabel("Требуется доработка")).toBe("Требуется доработка");
  });

  it("SMP-CST-4: unknown historical values → «Не классифицировано»", () => {
    expect(canonicalizeSampleStatusLabel("2695")).toBe(UNCLASSIFIED_LABEL);
    expect(canonicalizeSampleStatusLabel("263")).toBe(UNCLASSIFIED_LABEL);
    expect(canonicalizeSampleStatusLabel("DT1032_15:NEW")).toBe(UNCLASSIFIED_LABEL);
    expect(canonicalizeSampleStatusLabel("dt1032_15:FAIL")).toBe(UNCLASSIFIED_LABEL);
    expect(canonicalizeSampleStatusLabel("Что-то историческое")).toBe(UNCLASSIFIED_LABEL);
    expect(canonicalizeSampleStatusLabel("")).toBe(UNCLASSIFIED_LABEL);
    expect(canonicalizeSampleStatusLabel("   ")).toBe(UNCLASSIFIED_LABEL);
  });

  it("SMP-CST-5: no fuzzy matching, no substring guessing", () => {
    // Near-misses of sanctioned aliases must NOT classify by wording —
    // only exact sanctioned strings map; everything else is unclassified.
    expect(canonicalizeSampleStatusLabel("частично подошли")).toBe(UNCLASSIFIED_LABEL);
    expect(canonicalizeSampleStatusLabel("не очень подошли")).toBe(UNCLASSIFIED_LABEL);
    expect(canonicalizeSampleStatusLabel("ПодОшли")).toBe(UNCLASSIFIED_LABEL);
    expect(canonicalizeSampleStatusLabel("подошли ")).toBe("Подошли"); // trim only
    expect(canonicalizeSampleStatusLabel("На испытание")).toBe(UNCLASSIFIED_LABEL);
    expect(canonicalizeSampleStatusLabel("Испытание завершено")).toBe(UNCLASSIFIED_LABEL);
  });

  it("SMP-CST-6: alias table is exact, deterministic and bounded", () => {
    // Every alias value must be a declared canonical category.
    for (const target of Object.values(SAMPLE_STATUS_ALIAS_MAP)) {
      expect(CANONICAL_SAMPLE_UI_STATUSES).toContain(target);
    }
    // No lowercase-normalizing fallback exists: distinct casing keys are
    // separate explicit entries, not a case-insensitive engine.
    expect(Object.keys(SAMPLE_STATUS_ALIAS_MAP)).toContain("не подошли");
    expect(Object.keys(SAMPLE_STATUS_ALIAS_MAP)).toContain("Не подошли");
  });

  it("SMP-CST-7: list canonicalization dedupes by canonical label preserving order", () => {
    expect(
      canonicalizeSampleStatusList(["Не подошли", "Образец не подошел", "Подошли", "подошли"])
    ).toEqual(["Не подошли", "Подошли"]);
    expect(canonicalizeSampleStatusList([])).toEqual([]);
  });

  it("SMP-CST-8: dropdown options are canonical business-ordered; raw duplicates never appear", () => {
    const observed = canonicalizeSampleStatusList([
      "Образец подошел",
      "подошли",
      "Не подошли",
      "Образцы на испытании",
      "2695",
    ]);
    const options = buildCanonicalStatusOptions(observed);
    // Every option is a canonical category, no raw variants, no raw IDs.
    for (const option of options) {
      expect(CANONICAL_SAMPLE_UI_STATUSES).toContain(option);
    }
    expect(options).not.toContain("Образец подошел");
    expect(options).not.toContain("2695");
    // Canonical business order (subset ordering of the declared list).
    const order = (s: string) => (CANONICAL_SAMPLE_UI_STATUSES as readonly string[]).indexOf(s);
    for (let i = 1; i < options.length; i++) {
      expect(order(options[i])).toBeGreaterThan(order(options[i - 1]));
    }
    expect(buildCanonicalStatusOptions([])).toEqual([]);
  });
});
