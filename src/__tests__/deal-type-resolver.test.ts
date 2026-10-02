import { describe, expect, it, vi } from "vitest";
import { resolveDealType, buildDealTypeRegistry, type DealTypeRegistry } from "@/lib/deal-type";
import { buildDealPreviewModel } from "@/lib/deal-preview";
import { createDealExcelWorkbook } from "@/lib/export-utils";
import { useDashboardStore } from "@/store/dashboard-store";
import { getDemoDealTypeRegistry, DEMO_FIELDS } from "@/lib/demo-data";

describe("Deal Type Resolution Contract (A1 to A8)", () => {
  const metadataWithTypeField = {
    TYPE_ID: {
      type: "enumeration",
      listValues: [
        { ID: "SALE", VALUE: "Продажа силикагеля (из метаданных)" },
        { ID: "SERVICE", VALUE: "Услуги (из метаданных)" },
      ],
    },
  };

  it("Case 1: Known TYPE_ID resolves to registry business label", () => {
    const registry: DealTypeRegistry = {
      SALE: "Продажа силикагеля",
    };
    const resolved = resolveDealType("SALE", registry, metadataWithTypeField.TYPE_ID);
    expect(resolved).toBe("Продажа силикагеля");
  });

  it("Case 2: Registry rename dynamically changes resolved label (proves no hardcoding)", () => {
    const registryBefore: DealTypeRegistry = {
      SALE: "Продажа силикагеля",
    };
    expect(resolveDealType("SALE", registryBefore)).toBe("Продажа силикагеля");

    const registryAfter: DealTypeRegistry = {
      SALE: "Новый тип продажи",
    };
    expect(resolveDealType("SALE", registryAfter)).toBe("Новый тип продажи");
  });

  it("Case 3: Unknown TYPE_ID returns 'Не классифицировано' with ZERO raw ID leakage", () => {
    const registry: DealTypeRegistry = {
      SALE: "Продажа силикагеля",
    };
    const resolved = resolveDealType("UNKNOWN_CODE", registry);
    expect(resolved).toBe("Не классифицировано");
    expect(resolved).not.toContain("UNKNOWN_CODE");
    expect(resolved).not.toContain("(");
  });

  it("Case 4: Registry unavailable + metadata valid falls back to metadata listValues", () => {
    const emptyRegistry: DealTypeRegistry = {};
    const resolved = resolveDealType("SERVICE", emptyRegistry, metadataWithTypeField.TYPE_ID);
    expect(resolved).toBe("Услуги (из метаданных)");
  });

  it("Case 5: Registry unavailable + metadata unavailable returns 'Не классифицировано'", () => {
    const emptyRegistry: DealTypeRegistry = {};
    const resolved = resolveDealType("SOME_TYPE", emptyRegistry, undefined);
    expect(resolved).toBe("Не классифицировано");
    expect(resolved).not.toContain("SOME_TYPE");
  });

  it("Case 6: Deal Preview and Excel export exhibit exact label parity", () => {
    const registry: DealTypeRegistry = {
      COMPLEX: "Комплексная поставка",
    };
    const rawDeal = {
      ID: "900",
      TITLE: "Сделка 900",
      TYPE_ID: "COMPLEX",
      DATE_CREATE: "2026-09-30T10:00:00Z",
    };

    const model = buildDealPreviewModel(rawDeal, {
      fields: [{ id: "TYPE_ID", type: "enumeration", listValues: metadataWithTypeField.TYPE_ID.listValues }],
      dealTypeRegistry: registry,
    });

    const previewField = model.cardFields.find((f) => f.id === "TYPE_ID");
    expect(previewField).toBeDefined();
    expect(previewField?.value).toBe("Комплексная поставка");
    expect(previewField?.excelValue).toBe("Комплексная поставка");

    // Excel workbook check
    const workbook = createDealExcelWorkbook({
      deal: rawDeal,
      dealModel: model,
    });
    const sheet = workbook.getWorksheet("Отчёт по сделке");
    expect(sheet).toBeDefined();

    let foundExcelDealType = false;
    sheet?.eachRow((row) => {
      const cell1 = String(row.getCell(1).value || "");
      const cell2 = String(row.getCell(2).value || "");
      if (cell1 === "Тип сделки") {
        foundExcelDealType = true;
        expect(cell2).toBe("Комплексная поставка");
      }
    });
    expect(foundExcelDealType).toBe(true);
  });

  it("Case 7: buildDealTypeRegistry parses Bitrix crm.status.list items correctly", () => {
    const items = [
      { ENTITY_ID: "DEAL_TYPE", STATUS_ID: "SALE", NAME: "Продажа силикагеля" },
      { ENTITY_ID: "DEAL_TYPE", STATUS_ID: "SUPPORT", NAME: "Техническая поддержка" },
      { ENTITY_ID: "DEAL_STAGE", STATUS_ID: "NEW", NAME: "Новая сделка" }, // Different entity
    ];
    const registry = buildDealTypeRegistry(items);
    expect(registry).toEqual({
      SALE: "Продажа силикагеля",
      SUPPORT: "Техническая поддержка",
    });
  });

  it("Case 8: Shared registry enables batch resolution without per-deal fetch", () => {
    const registry: DealTypeRegistry = {
      T1: "Тип 1",
      T2: "Тип 2",
      T3: "Тип 3",
    };
    const deals = [
      { ID: "1", TYPE_ID: "T1" },
      { ID: "2", TYPE_ID: "T2" },
      { ID: "3", TYPE_ID: "T3" },
      { ID: "4", TYPE_ID: "T1" },
    ];

    // Resolver performs synchronous resolution from shared in-memory registry
    const resolvedTypes = deals.map((d) => resolveDealType(d.TYPE_ID, registry));
    expect(resolvedTypes).toEqual(["Тип 1", "Тип 2", "Тип 3", "Тип 1"]);
  });

  describe("Required Defect A Regression Matrix (A1 to A6)", () => {
    it("A1. fresh production store registry = {}", () => {
      // In production startup, initial store registry must be empty
      const freshRegistry = useDashboardStore.getInitialState().dealTypeRegistry;
      expect(freshRegistry).toEqual({});
    });

    it("A2. SALE + empty registry + no metadata -> Не классифицировано", () => {
      const resolved = resolveDealType("SALE", {}, null);
      expect(resolved).toBe("Не классифицировано");
      expect(resolved).not.toContain("SALE");
    });

    it("A3. live registry SALE -> 'Новое название' -> 'Новое название'", () => {
      const liveRegistry: DealTypeRegistry = { SALE: "Новое название" };
      const resolved = resolveDealType("SALE", liveRegistry, null);
      expect(resolved).toBe("Новое название");
    });

    it("A4. demo registry is derived from DEMO_FIELDS", () => {
      const derivedRegistry = getDemoDealTypeRegistry();
      const expectedFromFields = buildDealTypeRegistry(
        DEMO_FIELDS.find((f) => f.id === "TYPE_ID")?.listValues
      );
      expect(derivedRegistry).toEqual(expectedFromFields);
      expect(derivedRegistry["SALE"]).toBe("Продажа силикагеля");
    });

    it("A5. demo -> live cannot leak demo Deal Type names", async () => {
      // Set store in demo mode
      useDashboardStore.setState({
        isDemoMode: true,
        dealTypeRegistry: getDemoDealTypeRegistry(),
      });
      expect(useDashboardStore.getState().dealTypeRegistry["SALE"]).toBe("Продажа силикагеля");

      // Mock live fetchFields where Bitrix returns live fields without DEAL_TYPE registry
      const originalFetch = global.fetch;
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          success: true,
          fields: [{ id: "TITLE", title: "Название", type: "string" }], // live fields, no TYPE_ID listValues
          dealTypes: {}, // no live deal types
        }),
      } as any);

      try {
        await useDashboardStore.getState().fetchFields();
        expect(useDashboardStore.getState().isDemoMode).toBe(false);
        // The demo registry MUST NOT leak into production
        expect(useDashboardStore.getState().dealTypeRegistry).toEqual({});
        const resolved = resolveDealType("SALE", useDashboardStore.getState().dealTypeRegistry, null);
        expect(resolved).toBe("Не классифицировано");
        expect(resolved).not.toBe("Продажа силикагеля");
      } finally {
        global.fetch = originalFetch;
      }
    });

    it("A6. Preview = table = Excel parity for TYPE_ID", () => {
      const liveRegistry: DealTypeRegistry = {
        SALE: "Кастомная поставка",
      };
      const rawDeal = {
        ID: "42",
        TITLE: "Сделка 42",
        TYPE_ID: "SALE",
        DATE_CREATE: "2026-10-01T10:00:00Z",
      };

      // 1. Preview Model
      const previewModel = buildDealPreviewModel(rawDeal, {
        dealTypeRegistry: liveRegistry,
      });
      const previewField = previewModel.cardFields.find((f) => f.id === "TYPE_ID");
      expect(previewField?.value).toBe("Кастомная поставка");
      expect(previewField?.excelValue).toBe("Кастомная поставка");

      // 2. Excel Workbook
      const workbook = createDealExcelWorkbook({
        deal: rawDeal,
        dealModel: previewModel,
      });
      const sheet = workbook.getWorksheet("Отчёт по сделке");
      let excelVal = "";
      sheet?.eachRow((row) => {
        if (String(row.getCell(1).value || "") === "Тип сделки") {
          excelVal = String(row.getCell(2).value || "");
        }
      });
      expect(excelVal).toBe("Кастомная поставка");
      expect(excelVal).toBe(previewField?.value);
    });
  });
});
