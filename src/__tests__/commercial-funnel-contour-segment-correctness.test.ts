// src/__tests__/commercial-funnel-contour-segment-correctness.test.ts
// ─────────────────────────────────────────────────────────────────────
// Two correctness fixes for the Commercial Funnel management analytics:
//
// FIX #1 — Manager «Компании в текущем контуре» = UNION of
//   (A) companies with a real current sample state attributed by the
//       sample provenance rules, and
//   (B) companies with ≥1 active commercial Deal owned by the manager.
//   One company counts ONCE per manager; it MAY appear under two managers
//   when the sample cycle and the commercial Deal have different owners.
//   Same portfolio definition as Segments (isActivePortfolioCompany).
//
// FIX #2 — Segment derivation is ACTIVE-FILTER AWARE: when the global
//   filter is active for the SAME dimension, that dimension's segment rows
//   may contain ONLY the selected value. Other dimensions stay fully
//   analytical (cross-dimension preservation). Factual Company fields are
//   never mutated; provenance (getAnalyticalSegmentValues) is preserved;
//   filter exclusion never becomes "Не указано".
//
// Tests A–F cover FIX #1; tests G–L cover FIX #2; the reconciliation tests
// prove the shared definitions across Managers/Segments and UI/Excel.
// ─────────────────────────────────────────────────────────────────────

import { describe, expect, it } from "vitest";
import ExcelJS from "exceljs";
import {
  computeManagerScorecard,
  filterCompaniesByDimensions,
} from "@/lib/commercial-funnel/engine";
import {
  computeSegmentBreakdown,
  isActivePortfolioCompany,
} from "@/lib/commercial-funnel/analytics";
import { computePeriodBoundaries } from "@/lib/commercial-funnel/date-utils";
import { createCommercialFunnelWorkbook } from "@/lib/commercial-funnel/export-excel";
import type {
  CommercialCompany,
  CommercialDeal,
  CommercialFilters,
  PeriodBoundaries,
} from "@/lib/commercial-funnel/types";

const FIXED_NOW = new Date(2026, 8, 29, 12, 0, 0); // 2026-09-29 12:00 local
const bounds: PeriodBoundaries = computePeriodBoundaries(
  { periodPreset: "30days" },
  FIXED_NOW
);

function deal(p: Partial<CommercialDeal> & { id: string }): CommercialDeal {
  return {
    title: `Сделка ${p.id}`,
    companyId: "1",
    responsibleId: "mgr-1",
    stageId: "NEW",
    categoryId: "0",
    opportunity: 100000,
    opportunityQuality: "VALID",
    currencyId: "RUB",
    dateCreate: "2026-09-20",
    productType: [],
    direction: [],
    industry: [],
    sampleTestingStatus: [],
    sampleTestingStatusRaw: [],
    ...p,
  } as CommercialDeal;
}

function company(p: Partial<CommercialCompany> & { id: string }): CommercialCompany {
  return {
    title: `Компания ${p.id}`,
    responsibleId: "mgr-1",
    dateCreate: "2026-09-20",
    direction: [],
    productType: [],
    gradeGel: [],
    gradeSol: [],
    deals: [],
    hasAttention: false,
    attentionReasons: [],
    ...p,
  } as CommercialCompany;
}

// ─────────────────────────────────────────────────────────────────────
// FIX #1 — Manager current contour (union rule)
// ─────────────────────────────────────────────────────────────────────

describe("FIX #1: manager current contour = sample-current ∪ active-deal companies", () => {
  it("TEST A: sample-only company (DEAL source) counts for sampleResponsibleId — previously zero", () => {
    const c1 = company({
      id: "C1",
      sampleStatus: "На испытании",
      sampleStatusSource: "DEAL",
      sampleResponsibleId: "M1",
      deals: [], // no active Deals
    });

    const scorecard = computeManagerScorecard([c1], bounds, [], { M1: "Менеджер 1" });
    const m1 = scorecard.find((r) => r.responsibleId === "M1")!;

    expect(m1).toBeDefined();
    expect(m1.activeCompanies).toBe(1);
    expect(m1.activeCompaniesIds).toEqual(["C1"]);
  });

  it("TEST B: sample-only company (COMPANY source, facts included) counts for the company owner", () => {
    const c2 = company({
      id: "C2",
      sampleStatus: "Подошли",
      sampleStatusSource: "COMPANY",
      responsibleId: "M2",
      companyFactsIncluded: true,
      deals: [],
    });

    const scorecard = computeManagerScorecard([c2], bounds, [], { M2: "Менеджер 2" });
    const m2 = scorecard.find((r) => r.responsibleId === "M2")!;

    expect(m2).toBeDefined();
    expect(m2.activeCompanies).toBe(1);
    expect(m2.activeCompaniesIds).toEqual(["C2"]);
  });

  it("TEST B-negative: COMPANY-source sample with companyFactsIncluded === false is NOT attributed to the company owner", () => {
    const c = company({
      id: "C2x",
      sampleStatus: "Подошли",
      sampleStatusSource: "COMPANY",
      responsibleId: "M2",
      companyFactsIncluded: false, // company facts excluded from this slice
      deals: [],
    });

    const scorecard = computeManagerScorecard([c], bounds, [], { M2: "Менеджер 2" });
    expect(scorecard.find((r) => r.responsibleId === "M2")).toBeUndefined();
  });

  it("TEST C: active-Deal-only company counts for the deal owner (existing behavior preserved)", () => {
    const c3 = company({
      id: "C3",
      sampleStatus: "—",
      sampleStatusSource: "NONE",
      deals: [deal({ id: "d3", stageId: "EXECUTING", responsibleId: "M3" })],
    });

    const scorecard = computeManagerScorecard([c3], bounds, [], { M3: "Менеджер 3" });
    const m3 = scorecard.find((r) => r.responsibleId === "M3")!;

    expect(m3).toBeDefined();
    expect(m3.activeCompanies).toBe(1);
    expect(m3.activeCompaniesIds).toEqual(["C3"]);
  });

  it("TEST D: same manager owns sample state AND active deal → company counted exactly ONCE", () => {
    const c4 = company({
      id: "C4",
      sampleStatus: "На испытании",
      sampleStatusSource: "DEAL",
      sampleResponsibleId: "M4",
      deals: [deal({ id: "d4", stageId: "EXECUTING", responsibleId: "M4" })],
    });

    const scorecard = computeManagerScorecard([c4], bounds, [], { M4: "Менеджер 4" });
    const m4 = scorecard.find((r) => r.responsibleId === "M4")!;

    expect(m4).toBeDefined();
    expect(m4.activeCompanies).toBe(1);
    expect(m4.activeCompaniesIds).toEqual(["C4"]);
  });

  it("TEST E: sample manager M5 and deal manager M6 both contain the company — valid cross-manager attribution", () => {
    const c5 = company({
      id: "C5",
      sampleStatus: "На испытании",
      sampleStatusSource: "DEAL",
      sampleResponsibleId: "M5",
      deals: [deal({ id: "d5", stageId: "EXECUTING", responsibleId: "M6" })],
    });

    const scorecard = computeManagerScorecard([c5], bounds, [], {
      M5: "Менеджер 5",
      M6: "Менеджер 6",
    });

    const m5 = scorecard.find((r) => r.responsibleId === "M5")!;
    const m6 = scorecard.find((r) => r.responsibleId === "M6")!;

    expect(m5).toBeDefined();
    expect(m5.activeCompanies).toBe(1);
    expect(m5.activeCompaniesIds).toEqual(["C5"]);

    expect(m6).toBeDefined();
    expect(m6.activeCompanies).toBe(1);
    expect(m6.activeCompaniesIds).toEqual(["C5"]);
  });

  it("TEST F: Managers Excel reconciles with the corrected scorecard (single source)", async () => {
    const c1 = company({
      id: "C1",
      sampleStatus: "На испытании",
      sampleStatusSource: "DEAL",
      sampleResponsibleId: "M1",
      deals: [],
    });

    const userNames = { M1: "Менеджер Один" };
    const scorecard = computeManagerScorecard([c1], bounds, [], userNames);
    const m1 = scorecard.find((r) => r.responsibleId === "M1")!;
    expect(m1.activeCompanies).toBe(1);

    const wb = await createCommercialFunnelWorkbook({
      companies: [c1],
      deals: c1.deals,
      filters: { periodPreset: "30days" },
      userNames,
      now: FIXED_NOW,
    });
    const managersSheet = wb.getWorksheet("Managers")!;

    // Locate the header row by its exact label, then the column index.
    let headerRow: ExcelJS.Row | undefined;
    let contourCol = -1;
    managersSheet.eachRow((row) => {
      row.eachCell((cell, colNumber) => {
        if (String(cell.value || "") === "Компании в текущем контуре (сейчас)") {
          headerRow = row;
          contourCol = colNumber;
        }
      });
    });
    expect(headerRow).toBeDefined();
    expect(contourCol).toBeGreaterThan(0);

    // Locate M1's data row by manager name.
    let m1Row: ExcelJS.Row | undefined;
    managersSheet.eachRow((row) => {
      if (String(row.getCell(1).value || "") === "Менеджер Один") m1Row = row;
    });
    expect(m1Row).toBeDefined();
    expect(m1Row!.getCell(contourCol).value).toBe(m1.activeCompanies);
    expect(m1Row!.getCell(contourCol).value).toBe(1);
  });

  it("RECONCILIATION: union of manager contours === Segments isActivePortfolioCompany population", () => {
    // C0 has neither a sample state nor an active deal → outside the contour.
    const c0 = company({ id: "C0", sampleStatus: "—", sampleStatusSource: "NONE" });
    const c1 = company({
      id: "C1",
      sampleStatus: "На испытании",
      sampleStatusSource: "DEAL",
      sampleResponsibleId: "M1",
      deals: [],
    });
    const c2 = company({
      id: "C2",
      sampleStatus: "Подошли",
      sampleStatusSource: "COMPANY",
      responsibleId: "M2",
      companyFactsIncluded: true,
      deals: [],
    });
    const c3 = company({
      id: "C3",
      sampleStatus: "—",
      sampleStatusSource: "NONE",
      deals: [deal({ id: "d3", stageId: "EXECUTING", responsibleId: "M3" })],
    });
    const c4 = company({
      id: "C4",
      sampleStatus: "На испытании",
      sampleStatusSource: "DEAL",
      sampleResponsibleId: "M4",
      deals: [deal({ id: "d4", stageId: "EXECUTING", responsibleId: "M4" })],
    });
    const c5 = company({
      id: "C5",
      sampleStatus: "На испытании",
      sampleStatusSource: "DEAL",
      sampleResponsibleId: "M5",
      deals: [deal({ id: "d5", stageId: "EXECUTING", responsibleId: "M6" })],
    });

    const companies = [c0, c1, c2, c3, c4, c5];
    const scorecard = computeManagerScorecard(
      companies,
      bounds,
      [],
      { M1: "1", M2: "2", M3: "3", M4: "4", M5: "5", M6: "6" }
    );

    const managerUnion = new Set<string>();
    for (const row of scorecard) {
      for (const id of row.activeCompaniesIds) managerUnion.add(id);
    }

    const segmentsPopulation = new Set(
      companies.filter(isActivePortfolioCompany).map((c) => c.id)
    );

    expect(managerUnion).toEqual(segmentsPopulation);
    expect(managerUnion.has("C0")).toBe(false);
    expect([...managerUnion].sort()).toEqual(["C1", "C2", "C3", "C4", "C5"]);
  });
});

// ─────────────────────────────────────────────────────────────────────
// FIX #2 — Segment derivation respects the active same-dimension filter
// ─────────────────────────────────────────────────────────────────────

describe("FIX #2: segment rows never contradict the active same-dimension global filter", () => {
  const baseFilters: CommercialFilters = {
    periodPreset: "30days",
    productType: "all",
    industry: "all",
    direction: "all",
    region: "all",
  };

  it("TEST G: multi-product company under Product=Gel shows ONLY Gel", () => {
    const c = company({ id: "G1", productType: ["Gel", "Sol"] });
    const bd = computeSegmentBreakdown([c], bounds, "product", {
      ...baseFilters,
      productType: "Gel",
    });

    const gel = bd.rows.find((r) => r.label === "Gel");
    const sol = bd.rows.find((r) => r.label === "Sol");
    expect(gel).toBeDefined();
    expect(sol).toBeUndefined();
    // Not transformed into a missing value either.
    expect(bd.rows.find((r) => r.isMissingValue)).toBeUndefined();
    // Still in the unique grand total (no silent disappearance).
    expect(bd.totalUniqueCompanyIds).toEqual(["G1"]);
  });

  it("TEST H: no product filter → both Gel and Sol rows; company counted once in the grand total", () => {
    const c = company({ id: "G1", productType: ["Gel", "Sol"] });

    // Explicit "all" filters.
    const bdAll = computeSegmentBreakdown([c], bounds, "product", baseFilters);
    expect(bdAll.rows.map((r) => r.label).sort()).toEqual(["Gel", "Sol"]);
    expect(bdAll.totalUniqueCompanyIds).toEqual(["G1"]);

    // Omitted filters (backward-compatible callers) behave identically.
    const bdOmitted = computeSegmentBreakdown([c], bounds, "product");
    expect(bdOmitted.rows.map((r) => r.label).sort()).toEqual(["Gel", "Sol"]);
    expect(bdOmitted.totalUniqueCompanyIds).toEqual(["G1"]);
  });

  it("TEST I: direction filter Paint → Direction rows show ONLY Paint", () => {
    const c = company({ id: "D1", direction: ["Paint", "Food"] });
    const bd = computeSegmentBreakdown([c], bounds, "direction", {
      ...baseFilters,
      direction: "Paint",
    });

    const paint = bd.rows.find((r) => r.label === "Paint");
    const food = bd.rows.find((r) => r.label === "Food");
    expect(paint).toBeDefined();
    expect(food).toBeUndefined();
    expect(bd.rows.find((r) => r.isMissingValue)).toBeUndefined();
    expect(bd.totalUniqueCompanyIds).toEqual(["D1"]);
  });

  it("TEST J: Product=Gel filter does NOT erase valid Industry segmentation", () => {
    const c = company({ id: "X1", productType: ["Gel"], industry: "Coatings" });
    const filters = { ...baseFilters, productType: "Gel" };

    const products = computeSegmentBreakdown([c], bounds, "product", filters);
    expect(products.rows.map((r) => r.label)).toEqual(["Gel"]);

    const industries = computeSegmentBreakdown([c], bounds, "industry", filters);
    expect(industries.rows.map((r) => r.label)).toEqual(["Coatings"]);
    expect(industries.totalUniqueCompanyIds).toEqual(["X1"]);
  });

  it("TEST K: Segments always use Company dimensions (Section 7); Deal dimensions never override", () => {
    const c = company({
      id: "K1",
      productType: ["Sol"], // factual Company dimension
      companyFactsIncluded: false, // retained e.g. under Responsible filter via Deal
      deals: [deal({ id: "kd1", productType: ["Gel"] })],
    });
    // Under unfiltered (all) or responsible slice, company appears under its own Company product
    const bd = computeSegmentBreakdown([c], bounds, "product", baseFilters);

    expect(bd.rows.map((r) => r.label)).toEqual(["Sol"]);
    expect(bd.rows.find((r) => r.label === "Gel")).toBeUndefined();
    expect(bd.totalUniqueCompanyIds).toEqual(["K1"]);
    // Factual CRM field NOT mutated.
    expect(c.productType).toEqual(["Sol"]);
  });

  it("TEST L: Company with missing productType appears under «Не указано» even if Deal has products", () => {
    const c = company({
      id: "L1",
      productType: [], // missing at Company level
      companyFactsIncluded: false,
      deals: [deal({ id: "ld1", productType: ["Gel", "Sol"] })],
    });
    const bd = computeSegmentBreakdown([c], bounds, "product", baseFilters);

    expect(bd.rows.map((r) => r.label)).toEqual(["Не указано"]);
    expect(bd.rows.find((r) => r.label === "Gel")).toBeUndefined();
    expect(bd.rows.find((r) => r.label === "Sol")).toBeUndefined();
    expect(bd.totalUniqueCompanyIds).toEqual(["L1"]);
  });

  it("genuinely missing dimension data still becomes «Не указано» (unaffected by the fix)", () => {
    const c = company({ id: "M1", productType: [] });
    const bd = computeSegmentBreakdown([c], bounds, "product", baseFilters);
    expect(bd.rows).toHaveLength(1);
    expect(bd.rows[0].label).toBe("Не указано");
    expect(bd.rows[0].isMissingValue).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────
// Reconciliation: Segments UI ↔ Segments Excel under the SAME filters
// ─────────────────────────────────────────────────────────────────────

describe("RECONCILIATION: Segments UI == Segments Excel under identical filters", () => {
  const FIXED_NOW_RECON = new Date(2026, 8, 29, 12, 0, 0);
  const boundsRecon = computePeriodBoundaries({ periodPreset: "30days" }, FIXED_NOW_RECON);

  // Raw (unfiltered) fixture: companies with multi-value factual dimensions
  // and one deal-retained company, so filtering actually re-grains the slice.
  function makeRawCompanies(): CommercialCompany[] {
    return [
      company({
        id: "101",
        productType: ["Гель", "Золь"],
        industry: "Химия",
        direction: ["Авто", "Пищевая"],
        sampleStatus: "На испытании",
        sampleStatusSource: "DEAL",
        sampleResponsibleId: "u1",
        sampleResponsibleDealId: "rd1",
        deals: [
          deal({
            id: "rd1",
            responsibleId: "u1",
            stageId: "EXECUTING",
            productType: ["Гель", "Золь"],
            industry: ["Химия"],
            direction: ["Авто", "Пищевая"],
            sampleTransferStatus: "На испытании",
          }),
        ],
      }),
      company({
        id: "102",
        productType: ["Золь"],
        industry: "Строительство",
        direction: ["Строительство"],
        sampleStatus: "—",
        sampleStatusSource: "NONE",
        deals: [
          deal({
            id: "rd2",
            responsibleId: "u2",
            stageId: "EXECUTING",
            productType: ["Гель"], // Gel-only deal → company survives a Gel filter via the Deal path
            industry: ["Строительство"],
            direction: ["Строительство"],
          }),
        ],
      }),
    ];
  }

  /**
   * Reads one segment section from the Segments sheet of the workbook:
   * rows between the section title row and the "Итого по уникальным компаниям"
   * row, mapped label → «Компании в текущем контуре» count.
   */
  function readSegmentSection(
    wb: ExcelJS.Workbook,
    sectionTitle: string
  ): Array<{ label: string; activeCompanies: number }> {
    const sheet = wb.getWorksheet("Segments")!;
    const rows: Array<{ label: string; activeCompanies: number }> = [];
    let inSection = false;
    sheet.eachRow((row, rowNumber) => {
      const first = String(row.getCell(1).value || "");
      if (rowNumber > 6 && first === sectionTitle) {
        inSection = true;
        return;
      }
      if (!inSection) return;
      if (first === "Итого по уникальным компаниям" || (first !== "" && row.getCell(2).value === undefined && first !== sectionTitle && rows.length > 0)) {
        inSection = false;
        return;
      }
      if (first === "" || first === sectionTitle) return;
      const count = row.getCell(2).value;
      if (typeof count === "number") {
        rows.push({ label: first, activeCompanies: count });
      }
    });
    return rows;
  }

  function runCase(dimension: "product" | "industry" | "direction", filterKey: "productType" | "industry" | "direction", filterValue: string) {
    const rawCompanies = makeRawCompanies();
    const filters: CommercialFilters = {
      periodPreset: "30days",
      productType: "all",
      industry: "all",
      direction: "all",
      region: "all",
      [filterKey]: filterValue,
    } as CommercialFilters;

    // UI path: identical computation to page.tsx.
    const filtered = filterCompaniesByDimensions(rawCompanies, filters);
    const uiBreakdown = computeSegmentBreakdown(filtered, boundsRecon, dimension, filters);

    return { rawCompanies, filters, filtered, uiBreakdown };
  }

  it("Product filter (Гель): UI breakdown == Excel Segments section", async () => {
    const { rawCompanies, filters, filtered, uiBreakdown } = runCase("product", "productType", "Гель");

    // UI-side invariant first: no Золь row inside a Гель slice.
    expect(uiBreakdown.rows.find((r) => r.label === "Золь")).toBeUndefined();
    expect(uiBreakdown.rows.find((r) => r.label === "Гель")).toBeDefined();

    const wb = await createCommercialFunnelWorkbook({
      companies: rawCompanies,
      deals: rawCompanies.flatMap((c) => c.deals),
      filters,
      userNames: { u1: "Менеджер 1", u2: "Менеджер 2" },
      now: FIXED_NOW_RECON,
    });

    const excelRows = readSegmentSection(wb, "По продуктам");
    const uiRows = uiBreakdown.rows.map((r) => ({
      label: r.label,
      activeCompanies: r.current.activeCompanies.count,
    }));
    expect(excelRows).toEqual(uiRows);
  });

  it("Direction filter (Авто): UI breakdown == Excel Segments section", async () => {
    const { rawCompanies, filters, uiBreakdown } = runCase("direction", "direction", "Авто");

    expect(uiBreakdown.rows.find((r) => r.label === "Строительство")).toBeUndefined();
    expect(uiBreakdown.rows.find((r) => r.label === "Авто")).toBeDefined();

    const wb = await createCommercialFunnelWorkbook({
      companies: rawCompanies,
      deals: rawCompanies.flatMap((c) => c.deals),
      filters,
      userNames: { u1: "Менеджер 1", u2: "Менеджер 2" },
      now: FIXED_NOW_RECON,
    });

    const excelRows = readSegmentSection(wb, "По направлениям");
    const uiRows = uiBreakdown.rows.map((r) => ({
      label: r.label,
      activeCompanies: r.current.activeCompanies.count,
    }));
    expect(excelRows).toEqual(uiRows);
  });

  it("Industry filter (Химия): UI breakdown == Excel Segments section", async () => {
    const { rawCompanies, filters, uiBreakdown } = runCase("industry", "industry", "Химия");

    expect(uiBreakdown.rows.find((r) => r.label === "Строительство")).toBeUndefined();
    expect(uiBreakdown.rows.find((r) => r.label === "Химия")).toBeDefined();

    const wb = await createCommercialFunnelWorkbook({
      companies: rawCompanies,
      deals: rawCompanies.flatMap((c) => c.deals),
      filters,
      userNames: { u1: "Менеджер 1", u2: "Менеджер 2" },
      now: FIXED_NOW_RECON,
    });

    const excelRows = readSegmentSection(wb, "По отраслям");
    const uiRows = uiBreakdown.rows.map((r) => ({
      label: r.label,
      activeCompanies: r.current.activeCompanies.count,
    }));
    expect(excelRows).toEqual(uiRows);
  });
});
