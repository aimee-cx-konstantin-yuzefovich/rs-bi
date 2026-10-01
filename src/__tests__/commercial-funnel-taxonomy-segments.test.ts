// @vitest-environment node
import { describe, expect, it } from "vitest";
import { normalizeCompanies } from "@/lib/commercial-funnel/normalize";
import { computeSegmentBreakdown, getCompanyDimensionValues } from "@/lib/commercial-funnel/analytics";
import { DEFAULT_COMMERCIAL_FILTERS } from "@/lib/commercial-funnel/constants";
import {
  COMPANY_DIRECTION_CURRENT_FIELD_ID,
  COMPANY_INDUSTRY_CURRENT_FIELD_ID,
  COMPANY_PRODUCT_TYPE_FIELD_ID,
} from "@/lib/crm-constants";
import { computePeriodBoundaries } from "@/lib/commercial-funnel/date-utils";
import type { CommercialCompany } from "@/lib/commercial-funnel/types";

describe("Commercial Funnel Authoritative Taxonomy and 4 Segments", () => {
  it("CF-TAX-1: maps authoritative Company fields strictly: Industry, Direction, Product, Region", () => {
    const rawCompanies = [
      {
        ID: "100",
        TITLE: "ООО Силика",
        ASSIGNED_BY_ID: "1",
        [COMPANY_INDUSTRY_CURRENT_FIELD_ID]: "501", // Industry enum ID
        [COMPANY_DIRECTION_CURRENT_FIELD_ID]: "601", // Direction enum ID
        [COMPANY_PRODUCT_TYPE_FIELD_ID]: ["701", "702"], // Product enum IDs
        UF_CRM_69259C45D3399: "Урал", // Region string
      },
    ];

    const options = {
      statusLabels: {
        [COMPANY_INDUSTRY_CURRENT_FIELD_ID]: { "501": "Химическая промышленность" },
        [COMPANY_DIRECTION_CURRENT_FIELD_ID]: { "601": "Кремнезоли" },
        [COMPANY_PRODUCT_TYPE_FIELD_ID]: { "701": "Силикагель", "702": "Силиказоль" },
      },
    };

    const normalized = normalizeCompanies(rawCompanies as any, [], options);
    expect(normalized).toHaveLength(1);
    const c = normalized[0];

    // Authoritative mapping
    expect(c.industry).toBe("Химическая промышленность");
    expect(c.direction).toEqual(["Кремнезоли"]);
    expect(c.productType).toEqual(["Силикагель", "Силиказоль"]);
    expect(c.region).toBe("Урал");

    // No raw numeric enum IDs
    expect(c.industry).not.toBe("501");
    expect(c.direction).not.toContain("601");
    expect(c.productType).not.toContain("701");
  });

  it("CF-TAX-2: resolves unknown enum IDs to 'Не классифицировано' fallback and never leaks bare numeric IDs", () => {
    const rawCompanies = [
      {
        ID: "101",
        TITLE: "ООО Неизвестность",
        ASSIGNED_BY_ID: "1",
        [COMPANY_INDUSTRY_CURRENT_FIELD_ID]: "1801", // unmapped ID
        [COMPANY_DIRECTION_CURRENT_FIELD_ID]: "1841", // unmapped ID
        [COMPANY_PRODUCT_TYPE_FIELD_ID]: ["1849"], // unmapped ID
        UF_CRM_69259C45D3399: "Сибирь",
      },
    ];

    // Empty fields metadata
    const normalized = normalizeCompanies(rawCompanies as any, [], {});
    const c = normalized[0];

    expect(c.industry).toBe("Не классифицировано (1801)");
    expect(c.direction).toEqual(["Не классифицировано (1841)"]);
    expect(c.productType).toEqual(["Не классифицировано (1849)"]);
    expect(c.region).toBe("Сибирь");
  });

  it("CF-TAX-3: supports exactly 4 dimensions in getCompanyDimensionValues: industry, direction, region, product", () => {
    const company: CommercialCompany = {
      id: "1",
      title: "Test",
      responsibleId: "1",
      responsibleName: "Менеджер",
      industry: "Химия",
      direction: ["Кремнезоли"],
      region: "Северо-Запад",
      productType: ["Силикагель", "Силиказоль"],
      gradeGel: [],
      gradeSol: [],
      sampleStatus: "—",
      sampleStatusSource: "NONE",
      sampleAllDates: [],
      deals: [],
      hasAttention: false,
      attentionReasons: [],
    };

    expect(getCompanyDimensionValues(company, "industry")).toEqual(["Химия"]);
    expect(getCompanyDimensionValues(company, "direction")).toEqual(["Кремнезоли"]);
    expect(getCompanyDimensionValues(company, "region")).toEqual(["Северо-Запад"]);
    expect(getCompanyDimensionValues(company, "product")).toEqual(["Силикагель", "Силиказоль"]);
  });

  it("CF-TAX-4: computes region segment breakdown correctly with unique company union totals", () => {
    const companies: CommercialCompany[] = [
      {
        id: "1",
        title: "Компания 1",
        responsibleId: "1",
        responsibleName: "М1",
        industry: "Химия",
        direction: ["Кремнезоли"],
        region: "Москва",
        productType: ["Силикагель"],
        gradeGel: [],
        gradeSol: [],
        sampleStatus: "—",
        sampleStatusSource: "NONE",
        sampleAllDates: [],
        deals: [],
        hasAttention: false,
        attentionReasons: [],
      },
      {
        id: "2",
        title: "Компания 2",
        responsibleId: "2",
        responsibleName: "М2",
        industry: "Металлургия",
        direction: ["Силикаты"],
        region: "Москва",
        productType: ["Силиказоль"],
        gradeGel: [],
        gradeSol: [],
        sampleStatus: "—",
        sampleStatusSource: "NONE",
        sampleAllDates: [],
        deals: [],
        hasAttention: false,
        attentionReasons: [],
      },
      {
        id: "3",
        title: "Компания 3",
        responsibleId: "1",
        responsibleName: "М1",
        industry: "Химия",
        direction: ["Кремнезоли"],
        region: "Урал",
        productType: ["Силикагель"],
        gradeGel: [],
        gradeSol: [],
        sampleStatus: "—",
        sampleStatusSource: "NONE",
        sampleAllDates: [],
        deals: [],
        hasAttention: false,
        attentionReasons: [],
      },
    ];

    const boundaries = computePeriodBoundaries(
      DEFAULT_COMMERCIAL_FILTERS,
      new Date("2026-02-01T12:00:00Z")
    );

    const breakdown = computeSegmentBreakdown(
      companies,
      boundaries,
      "region",
      DEFAULT_COMMERCIAL_FILTERS
    );

    expect(breakdown.rows).toHaveLength(2); // Москва and Урал
    const mskRow = breakdown.rows.find((r) => r.label === "Москва");
    const uralRow = breakdown.rows.find((r) => r.label === "Урал");

    expect(mskRow).toBeDefined();
    expect(uralRow).toBeDefined();
    expect(breakdown.totalUniqueCompanyIds).toHaveLength(3);
    expect(breakdown.isMultiValueDimension).toBe(false);
  });
});
