import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook } from "@testing-library/react";
import { useTableState } from "@/hooks/use-table-state";
import { useDashboardStore } from "@/store/dashboard-store";

describe("Deal Display Sentinels (Non-Boolean vs Boolean Resolution)", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    useDashboardStore.setState({
      fields: [
        {
          id: "PRODUCT_TYPE",
          title: "Тип продукта",
          type: "enumeration",
          isMultiple: false,
          isSortable: true,
          listValues: [
            { ID: "10", VALUE: "Силикагель" },
            { ID: "20", VALUE: "Золь" },
          ],
        },
        {
          id: "UF_TEXT_FIELD",
          title: "Комментарий",
          type: "string",
          isMultiple: false,
          isSortable: true,
        },
        {
          id: "IS_ACTIVE_DEAL",
          title: "Активная",
          type: "boolean",
          isMultiple: false,
          isSortable: true,
        },
        {
          id: "IS_CHAR_BOOL",
          title: "Флаг",
          type: "char",
          isMultiple: false,
          isSortable: true,
        },
      ],
      userNames: {},
      companiesData: {},
      activitiesData: {},
    });
  });

  it("resolves non-boolean raw false to empty string (which renders as '–')", () => {
    const { result } = renderHook(() => useTableState());

    // Non-boolean enumeration field with raw boolean false
    const resEnum = result.current.resolveValue(
      { PRODUCT_TYPE: false } as any,
      "PRODUCT_TYPE"
    );
    expect(resEnum).toBe("");

    // Non-boolean string field with raw boolean false
    const resText = result.current.resolveValue(
      { UF_TEXT_FIELD: false } as any,
      "UF_TEXT_FIELD"
    );
    expect(resText).toBe("");
  });

  it("resolves non-boolean raw 'false' / 'null' to empty string", () => {
    const { result } = renderHook(() => useTableState());

    const resEnum = result.current.resolveValue(
      { PRODUCT_TYPE: "false" } as any,
      "PRODUCT_TYPE"
    );
    expect(resEnum).toBe("");

    const resText = result.current.resolveValue(
      { UF_TEXT_FIELD: "false" } as any,
      "UF_TEXT_FIELD"
    );
    expect(resText).toBe("");

    const resNullStr = result.current.resolveValue(
      { UF_TEXT_FIELD: "null" } as any,
      "UF_TEXT_FIELD"
    );
    expect(resNullStr).toBe("");
  });

  it("resolves true boolean/char fields correctly to 'Нет' / 'Да'", () => {
    const { result } = renderHook(() => useTableState());

    // Boolean field with false -> "Нет"
    expect(
      result.current.resolveValue({ IS_ACTIVE_DEAL: false } as any, "IS_ACTIVE_DEAL")
    ).toBe("Нет");

    // Boolean field with string "false" -> "Нет"
    expect(
      result.current.resolveValue({ IS_ACTIVE_DEAL: "false" } as any, "IS_ACTIVE_DEAL")
    ).toBe("Нет");

    // Char field with "N" -> "Нет"
    expect(
      result.current.resolveValue({ IS_CHAR_BOOL: "N" } as any, "IS_CHAR_BOOL")
    ).toBe("Нет");

    // Char field with "0" -> "Нет"
    expect(
      result.current.resolveValue({ IS_CHAR_BOOL: "0" } as any, "IS_CHAR_BOOL")
    ).toBe("Нет");

    // Boolean field with true -> "Да"
    expect(
      result.current.resolveValue({ IS_ACTIVE_DEAL: true } as any, "IS_ACTIVE_DEAL")
    ).toBe("Да");

    // Char field with "Y" -> "Да"
    expect(
      result.current.resolveValue({ IS_CHAR_BOOL: "Y" } as any, "IS_CHAR_BOOL")
    ).toBe("Да");
  });

  it("filters sentinels out of array values", () => {
    const { result } = renderHook(() => useTableState());

    const res = result.current.resolveValue(
      { PRODUCT_TYPE: [false, "false", "10"] } as any,
      "PRODUCT_TYPE"
    );
    expect(res).toBe("Силикагель");
  });
});
