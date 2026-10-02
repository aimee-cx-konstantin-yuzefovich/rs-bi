import { describe, it, expect } from "vitest";
import { resolveDealStage, buildDealPreviewModel } from "@/lib/deal-preview";

describe("Deal Stage — Category-Safe Disambiguation Contract", () => {
  const fields = [
    {
      id: "STAGE_ID",
      title: "Стадия",
      type: "crm_status",
      listValues: [
        { ID: "NEW", VALUE: "Новая сделка" },
        { ID: "C1:10", VALUE: "Переговоры (Воронка 1)" },
        { ID: "C2:10", VALUE: "Согласование договора (Воронка 2)" },
        { ID: "C3:UNIQUE", VALUE: "Уникальная стадия (Воронка 3)" },
      ],
    },
  ];

  it("Exact match on raw stage ID with category prefix always wins", () => {
    expect(resolveDealStage("C1:10", fields)).toBe("Переговоры (Воронка 1)");
    expect(resolveDealStage("C2:10", fields)).toBe("Согласование договора (Воронка 2)");
  });

  it("Disambiguates unprefixed base ID when categoryId context is supplied", () => {
    // Deal in Category 1 with stage '10' resolves to Category 1 stage
    expect(resolveDealStage("10", fields, "1")).toBe("Переговоры (Воронка 1)");
    // Deal in Category 2 with stage '10' resolves to Category 2 stage
    expect(resolveDealStage("10", fields, "2")).toBe("Согласование договора (Воронка 2)");
    // Numeric categoryId also supported
    expect(resolveDealStage("10", fields, 1)).toBe("Переговоры (Воронка 1)");
    expect(resolveDealStage("10", fields, 2)).toBe("Согласование договора (Воронка 2)");
  });

  it("Returns truthful unknown classification when base ID is ambiguous across categories and no categoryId is provided", () => {
    // Stage '10' exists in both C1 and C2. Without categoryId, must NOT pick first candidate arbitrarily!
    expect(resolveDealStage("10", fields)).toBe("Не классифицировано");
    expect(resolveDealStage("10", fields, null)).toBe("Не классифицировано");
    expect(resolveDealStage("10", fields, "")).toBe("Не классифицировано");
  });

  it("Allows base-ID fallback when exactly ONE candidate across all categories matches the base ID", () => {
    expect(resolveDealStage("UNIQUE", fields)).toBe("Уникальная стадия (Воронка 3)");
  });

  it("buildDealPreviewModel automatically passes deal CATEGORY_ID to resolveDealStage", () => {
    const dealCat1 = {
      ID: "701",
      TITLE: "Сделка Категории 1",
      STAGE_ID: "10",
      CATEGORY_ID: "1",
    };

    const model1 = buildDealPreviewModel(dealCat1, { fields });
    expect(model1.mainFields[0].value).toBe("Переговоры (Воронка 1)");

    const dealCat2 = {
      ID: "702",
      TITLE: "Сделка Категории 2",
      STAGE_ID: "10",
      CATEGORY_ID: "2",
    };

    const model2 = buildDealPreviewModel(dealCat2, { fields });
    expect(model2.mainFields[0].value).toBe("Согласование договора (Воронка 2)");
  });
});
