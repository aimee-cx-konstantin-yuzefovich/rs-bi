import { describe, it, expect } from "vitest";
import { normalizeCompanies } from "@/lib/commercial-funnel/normalize";
import {
  COMPANY_INDUSTRY_CURRENT_FIELD_ID,
  COMPANY_DIRECTION_CURRENT_FIELD_ID,
  COMPANY_REGION_FIELD_ID,
  COMPANY_PRODUCT_TYPE_FIELD_ID,
  COMPANY_APPLICATION_FIELD_ID,
  COMPANY_GEL_GRADE_USED_FIELD_ID,
} from "@/lib/crm-constants";

describe("Commercial Funnel — Company Dimensions & Segmentation Contract", () => {
  it("TC-SEG-01: Industry, Direction, and Region are completely segregated using verified live fields", () => {
    const rawCompany = {
      ID: "5001",
      TITLE: "АО «Тестовая Промышленность»",
      ASSIGNED_BY_ID: "10",
      DATE_CREATE: "2026-03-01",
      // Authoritative current industry
      [COMPANY_INDUSTRY_CURRENT_FIELD_ID]: "310",
      // Authoritative current direction
      [COMPANY_DIRECTION_CURRENT_FIELD_ID]: ["410", "411"],
      // Verified live region field (UF_CRM_69259C45D3399)
      [COMPANY_REGION_FIELD_ID]: "Приволжский федеральный округ",
      // Product type
      [COMPANY_PRODUCT_TYPE_FIELD_ID]: ["1613"],
      // Gel grade used
      [COMPANY_GEL_GRADE_USED_FIELD_ID]: "КСМГ-5",
      // Genuine application field
      [COMPANY_APPLICATION_FIELD_ID]: "Катализаторы гидроочистки",
      // Retired/legacy fields that MUST NOT override current fields
      INDUSTRY: "9999", // legacy INDUSTRY
      UF_CRM_6915D8C0C6814: "8888", // retired industry
    };

    const statusLabels: Record<string, Record<string, string>> = {
      [COMPANY_INDUSTRY_CURRENT_FIELD_ID]: {
        "310": "Химическая промышленность",
      },
      [COMPANY_DIRECTION_CURRENT_FIELD_ID]: {
        "410": "Лакокрасочные материалы",
        "411": "Бытовая химия",
      },
      [COMPANY_PRODUCT_TYPE_FIELD_ID]: {
        "1613": "Гель",
      },
    };

    const companies = normalizeCompanies([rawCompany], [], { statusLabels });
    expect(companies.length).toBe(1);
    const comp = companies[0];

    // 1. Industry uses COMPANY_INDUSTRY_CURRENT_FIELD_ID, not legacy INDUSTRY
    expect(comp.industry).toBe("Химическая промышленность");
    expect(comp.industryRaw).toBe("310");

    // 2. Direction uses COMPANY_DIRECTION_CURRENT_FIELD_ID, never Region
    expect(comp.direction).toEqual(["Лакокрасочные материалы", "Бытовая химия"]);
    expect(comp.directionRaw).toEqual(["410", "411"]);

    // 3. Region uses COMPANY_REGION_FIELD_ID (UF_CRM_69259C45D3399)
    expect(comp.region).toBe("Приволжский федеральный округ");

    // 4. Product type is resolved
    expect(comp.productType).toEqual(["Гель"]);

    // 5. Application is resolved from genuine application field, NOT Gel grade
    expect(comp.application).toBe("Катализаторы гидроочистки");
    expect(comp.application).not.toBe("КСМГ-5");
  });

  it("TC-SEG-02: Absent current Industry is truthfully absent (legacy INDUSTRY never invents fallback)", () => {
    const rawCompanyWithoutCurrentIndustry = {
      ID: "5002",
      TITLE: "ООО «Без Отрасли»",
      ASSIGNED_BY_ID: "10",
      DATE_CREATE: "2026-03-01",
      // Absent current industry
      INDUSTRY: "9999", // legacy standard field
    };

    const companies = normalizeCompanies([rawCompanyWithoutCurrentIndustry], [], {});
    expect(companies.length).toBe(1);
    const comp = companies[0];

    expect(comp.industry).toBeUndefined();
    expect(comp.industryRaw).toBeUndefined();
  });

  it("TC-SEG-03: Gel grade used (UF_CRM_1781806326214) never populates Application", () => {
    const rawCompanyWithGelGrade = {
      ID: "5003",
      TITLE: "ООО «Гель Грейд»",
      ASSIGNED_BY_ID: "10",
      DATE_CREATE: "2026-03-01",
      [COMPANY_GEL_GRADE_USED_FIELD_ID]: "Сорбент КСКГ",
      // Genuine application field absent
    };

    const companies = normalizeCompanies([rawCompanyWithGelGrade], [], {});
    expect(companies.length).toBe(1);
    const comp = companies[0];

    // Gel grade MUST NOT populate application
    expect(comp.application).toBeUndefined();
  });
});
