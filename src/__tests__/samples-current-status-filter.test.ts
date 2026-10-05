import { describe, it, expect } from "vitest";
import { buildSampleSummaries, computeSampleKpis } from "@/lib/samples/aggregate";
import { UNCLASSIFIED_LABEL } from "@/lib/samples/constants";
import type { BitrixRow } from "@/lib/samples/types";

// Field IDs
const COMPANY_SAMPLES_FIELD = "UF_CRM_1753187313314";
const DEAL_SAMPLE_TRANSFER_FIELD = "UF_CRM_1779386185";

describe("Samples Current Status Filter (Section 3)", () => {
  const baseCompany: BitrixRow = {
    ID: "100",
    TITLE: "ООО «Тест Контура»",
    ASSIGNED_BY_ID: "5",
  };

  it("1. SP current state wins over legacy Company status", () => {
    // Legacy Company status = "Требуются образцы", SP item = "DT1032_15:CLIENT" ("На испытании")
    const company: BitrixRow = {
      ...baseCompany,
      [COMPANY_SAMPLES_FIELD]: ["Требуются образцы"],
    };
    const spItem: BitrixRow = {
      id: "1",
      companyId: "100",
      stageId: "DT1032_15:CLIENT",
      assignedById: "10",
    };

    const { summaries } = buildSampleSummaries([company], [], [spItem]);
    expect(summaries).toHaveLength(1);
    const summary = summaries[0];

    expect(summary.currentStatusSource).toBe("SMART_PROCESS");
    expect(summary.currentStatusValues).toEqual(["На испытании"]);
    expect(summary.currentStatusValues).not.toContain("Требуются образцы");

    // Filter simulation
    const matchesTesting = summary.currentStatusValues.includes("На испытании");
    const matchesRequired = summary.currentStatusValues.includes("Требуются образцы");
    expect(matchesTesting).toBe(true);
    expect(matchesRequired).toBe(false);
  });

  it("2. SP terminal current state wins over old legacy state", () => {
    // Legacy Company status = "На испытании", SP item = "DT1032_15:SUCCESS" ("Подошли")
    const company: BitrixRow = {
      ...baseCompany,
      [COMPANY_SAMPLES_FIELD]: ["На испытании"],
    };
    const spItem: BitrixRow = {
      id: "2",
      companyId: "100",
      stageId: "DT1032_15:SUCCESS",
      createdTime: "2026-01-01T10:00:00Z",
      assignedById: "10",
    };

    const { summaries } = buildSampleSummaries([company], [], [spItem]);
    expect(summaries).toHaveLength(1);
    const summary = summaries[0];

    expect(summary.currentStatusSource).toBe("SMART_PROCESS");
    expect(summary.currentStatusValues).toEqual(["Подошли"]);
    expect(summary.currentStatusValues).not.toContain("На испытании");

    const matchesSuccess = summary.currentStatusValues.includes("Подошли");
    const matchesTesting = summary.currentStatusValues.includes("На испытании");
    expect(matchesSuccess).toBe(true);
    expect(matchesTesting).toBe(false);
  });

  it("3. SP evidence with no authoritative current state correctly falls through", () => {
    // SP item has unknown stage -> fallback chain proceeds to Company legacy
    const company: BitrixRow = {
      ...baseCompany,
      [COMPANY_SAMPLES_FIELD]: ["Требуются образцы"],
    };
    const spItemUnknown: BitrixRow = {
      id: "3",
      companyId: "100",
      stageId: "UNKNOWN_CUSTOM_STAGE",
      assignedById: "10",
    };

    const { summaries } = buildSampleSummaries([company], [], [spItemUnknown]);
    expect(summaries).toHaveLength(1);
    const summary = summaries[0];

    expect(summary.currentStatusSource).toBe("COMPANY_LEGACY");
    expect(summary.currentStatusValues).toEqual(["Требуются образцы"]);
  });

  it("4. Deal legacy fallback works", () => {
    // Deal has legacy status "На испытании", Company has "Требуются образцы", no SP
    const company: BitrixRow = {
      ...baseCompany,
      [COMPANY_SAMPLES_FIELD]: ["Требуются образцы"],
    };
    const deal: BitrixRow = {
      ID: "501",
      COMPANY_ID: "100",
      [DEAL_SAMPLE_TRANSFER_FIELD]: "На испытании",
    };

    const { summaries } = buildSampleSummaries([company], [deal], []);
    expect(summaries).toHaveLength(1);
    const summary = summaries[0];

    expect(summary.currentStatusSource).toBe("DEAL_LEGACY");
    expect(summary.currentStatusValues).toEqual(["На испытании"]);
  });

  it("5. Company legacy fallback works", () => {
    // Company has "Требуются образцы", no Deal status, no SP
    const company: BitrixRow = {
      ...baseCompany,
      [COMPANY_SAMPLES_FIELD]: ["Требуются образцы"],
    };

    const { summaries } = buildSampleSummaries([company], [], []);
    expect(summaries).toHaveLength(1);
    const summary = summaries[0];

    expect(summary.currentStatusSource).toBe("COMPANY_LEGACY");
    expect(summary.currentStatusValues).toEqual(["Требуются образцы"]);
  });

  it("6. unknown -> Не классифицировано", () => {
    // Company has completely unmapped string
    const company: BitrixRow = {
      ...baseCompany,
      [COMPANY_SAMPLES_FIELD]: ["Неизвестный статус 9999"],
    };

    const { summaries } = buildSampleSummaries([company], [], []);
    expect(summaries).toHaveLength(1);
    const summary = summaries[0];

    expect(summary.currentStatusSource).toBe("COMPANY_LEGACY");
    expect(summary.currentStatusValues).toEqual([UNCLASSIFIED_LABEL]);
  });

  it("7. KPI results remain unchanged", () => {
    const company: BitrixRow = {
      ...baseCompany,
      [COMPANY_SAMPLES_FIELD]: ["Требуются образцы"],
    };
    const spItem: BitrixRow = {
      id: "1",
      companyId: "100",
      stageId: "DT1032_15:CLIENT",
      assignedById: "10",
    };

    const { summaries } = buildSampleSummaries([company], [], [spItem]);
    const kpis = computeSampleKpis(summaries);

    // One company in testing
    expect(kpis.inTesting).toBe(1);
    expect(kpis.total).toBe(1);
  });
});
