// src/__tests__/deals-sticky.test.tsx
// ─────────────────────────────────────────────────────────────────────
// DEAL-STICKY-1 regression test:
// Proves the Deals table header remains sticky within its vertical
// scroll container (parentRef), the page container constrains viewport
// height (h-dvh overflow-hidden), and intersection th has top-0 left-0 z-30.
// ─────────────────────────────────────────────────────────────────────

import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { DataTable } from "@/components/dashboard/data-table";

vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock("nuqs", () => ({
  useQueryState: (key: string, def: any) => [def?.defaultValue ?? (key === "page" ? 1 : key === "size" ? 50 : []), vi.fn()],
}));

vi.mock("@/store/dashboard-store", () => ({
  useDashboardStore: (selector?: (s: any) => any) => {
    const state = {
      deals: Array.from({ length: 25 }, (_, i) => ({
        ID: String(i + 1),
        id: String(i + 1),
        TITLE: `Сделка ${i + 1}`,
        OPPORTUNITY: 100000 * (i + 1),
        CURRENCY_ID: "RUB",
        STAGE_ID: "NEW",
        ASSIGNED_BY_ID: "1",
        COMPANY_ID: String(100 + i),
        COMPANY_TITLE: `Компания ${i + 1}`,
      })),
      allDeals: [],
      dealsLoading: false,
      dealsError: null,
      dealsTotal: 25,
      dealsTruncated: false,
      dealsFetched: 25,
      fields: [
        { id: "TITLE", title: "Название сделки", type: "string" },
        { id: "OPPORTUNITY", title: "Сумма", type: "double" },
      ],
      selectedColumns: ["TITLE", "OPPORTUNITY"],
      searchQuery: "",
      columnSort: { columnId: "", direction: null },
      columnWidths: {},
      columnFilters: [],
      toggleColumnSort: vi.fn(),
      setColumnWidth: vi.fn(),
      setColumnFilter: vi.fn(),
      clearColumnFilter: vi.fn(),
      clearAllColumnFilters: vi.fn(),
      setCurrentPage: vi.fn(),
      setPageSize: vi.fn(),
      companiesDataLoading: false,
      activitiesDataLoading: false,
      userNamesLoading: false,
    };
    return selector ? selector(state) : state;
  },
}));

vi.mock("@/hooks/use-table-state", () => ({
  useTableState: () => ({
    fieldMap: new Map([
      ["TITLE", { id: "TITLE", title: "Название сделки", type: "string" }],
      ["OPPORTUNITY", { id: "OPPORTUNITY", title: "Сумма", type: "double" }],
    ]),
    resolveValue: (deal: any, colId: string) => String(deal[colId] ?? ""),
    sortedDeals: Array.from({ length: 25 }, (_, i) => ({
      ID: String(i + 1),
      id: String(i + 1),
      TITLE: `Сделка ${i + 1}`,
      OPPORTUNITY: 100000 * (i + 1),
    })),
    columns: ["TITLE", "OPPORTUNITY"],
    userNamesLoading: false,
  }),
}));

describe("DEAL-STICKY-1 — Deals table header sticky contract", () => {
  it("table th elements have sticky top-0 and no conflicting relative class", () => {
    const { container } = render(<DataTable />);

    // 1. First column header (№) has sticky top-0 left-0 z-30 bg-card
    const headers = container.querySelectorAll("thead th");
    expect(headers.length).toBeGreaterThanOrEqual(3); // №, TITLE, OPPORTUNITY

    const numberHeader = headers[0];
    expect(numberHeader.textContent?.trim()).toBe("№");
    expect(numberHeader.className).toContain("sticky");
    expect(numberHeader.className).toContain("top-0");
    expect(numberHeader.className).toContain("left-0");
    expect(numberHeader.className).toContain("z-30");
    expect(numberHeader.className).toContain("bg-card");

    // 2. Data column headers have sticky top-0 z-20 bg-card and NO relative class
    for (let i = 1; i < headers.length; i++) {
      const th = headers[i];
      expect(th.className).toContain("sticky");
      expect(th.className).toContain("top-0");
      expect(th.className).toContain("z-20");
      expect(th.className).toContain("bg-card");
      expect(th.className).not.toContain("relative");
    }

    // 3. Scroll container (parent of the table's wrapper) has h-full and overflow-auto
    const table = container.querySelector("table.data-table");
    expect(table).not.toBeNull();
    const tableWrapper = table?.parentElement;
    const scrollContainer = tableWrapper?.parentElement;
    expect(scrollContainer?.className).toContain("overflow-auto");
    expect(scrollContainer?.className).toContain("h-full");
  });
});
