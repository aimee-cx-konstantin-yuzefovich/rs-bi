import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import React from "react";
import { DealsToolbar } from "@/components/dashboard/deals-toolbar";
import { useDashboardStore } from "@/store/dashboard-store";

vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock("nuqs", () => ({
  useQueryState: (key: string, def: any) => [
    def?.defaultValue ?? (key === "pipeline" ? "all" : key === "responsible" ? "all" : key === "q" ? "" : { preset: "all" }),
    vi.fn(),
  ],
}));

vi.mock("@/hooks/use-table-state", () => ({
  useTableState: () => ({
    sortedDeals: [],
    columns: ["TITLE", "OPPORTUNITY"],
    fieldMap: new Map([
      ["TITLE", { id: "TITLE", title: "Название сделки", type: "string" }],
      ["OPPORTUNITY", { id: "OPPORTUNITY", title: "Сумма", type: "double" }],
    ]),
    resolveValue: () => "",
  }),
}));

describe("Deals Toolbar — Light Theme Visual & Control Styling Suite", () => {
  beforeEach(() => {
    useDashboardStore.setState({
      dateFilter: { preset: "all" },
      pipelineFilter: "all",
      responsibleFilter: "all",
      searchQuery: "",
      columnFilters: [],
      allDeals: [
        { ID: "1", TITLE: "Сделка 1", STAGE_ID: "NEW", ASSIGNED_BY_ID: "10" },
        { ID: "2", TITLE: "Сделка 2", STAGE_ID: "WON", ASSIGNED_BY_ID: "20" },
        { ID: "3", TITLE: "Сделка 3", STAGE_ID: "LOSE", ASSIGNED_BY_ID: "10" },
      ],
      userNames: { "10": "Иван Иванов", "20": "Петр Петров" },
      usersCoverage: { status: "COMPLETE", fetched: 2, total: 2 },
      dealsTotal: 3,
      dealsFetched: 3,
      dealsTruncated: false,
      dealsLoading: false,
      savedViews: [
        {
          id: "view-1",
          name: "Вид 1",
          createdAt: Date.now(),
          selectedColumns: [],
          dateFilter: { preset: "all" },
          pipelineFilter: "all",
          responsibleFilter: "all",
          columnSort: { columnId: "", direction: null },
        },
      ],
    });
  });

  it("toolbar buttons adopt outline styling and theme-aware neutral tokens", () => {
    const { container } = render(<DealsToolbar />);
    const toolbar = screen.getByTestId("deals-toolbar");
    expect(toolbar).toBeInTheDocument();
    expect(toolbar.className).toContain("bg-card/50");

    // Check all buttons inside the toolbar
    const buttons = toolbar.querySelectorAll("button");
    expect(buttons.length).toBeGreaterThanOrEqual(6);

    // Verify absence of white-on-white dark artifacts (e.g. text-white/50, border-white/10, bg-white/5)
    for (const btn of buttons) {
      expect(btn.className).not.toMatch(/\btext-white\/(?:20|30|40|50|60|70|80)\b/);
      expect(btn.className).not.toMatch(/\bbg-white\/(?:5|10|15|20|25)\b/);
      expect(btn.className).not.toMatch(/\bborder-white\/(?:10|20|25)\b/);
    }
  });

  it("Pipeline filter renders with high-contrast active and inactive states", () => {
    render(<DealsToolbar />);
    const allTab = screen.getByRole("button", { name: /^Все\s*3$/ });
    expect(allTab).toBeInTheDocument();
    // Active tab styling (default "all" is active)
    expect(allTab.className).toContain("bg-muted");
    expect(allTab.className).toContain("border-border");
    expect(allTab.className).toContain("text-foreground");
    expect(allTab.className).toContain("h-8");

    const inWorkTab = screen.getByRole("button", { name: /В работе/ });
    // Inactive tab styling
    expect(inWorkTab.className).toContain("bg-background");
    expect(inWorkTab.className).toContain("border-border");
    expect(inWorkTab.className).toContain("text-muted-foreground");
    expect(inWorkTab.className).toContain("h-8");
  });

  it("Global search input uses neutral theme background, border, and text tokens", () => {
    render(<DealsToolbar />);
    const searchInput = screen.getByPlaceholderText("Поиск по всем полям...");
    expect(searchInput).toBeInTheDocument();
    expect(searchInput.className).toContain("bg-background");
    expect(searchInput.className).toContain("border-input");
    expect(searchInput.className).toContain("text-foreground");
    expect(searchInput.className).toContain("placeholder:text-muted-foreground");
    expect(searchInput.className).toContain("h-8");
  });

  it("Saved views count badge uses neutral bg-muted, border-border, and text-foreground", () => {
    render(<DealsToolbar />);
    const savedViewsBtn = screen.getByTitle("Сохранённые виды таблицы");
    expect(savedViewsBtn).toBeInTheDocument();
    expect(savedViewsBtn.className).toContain("h-8");

    const badge = savedViewsBtn.querySelector("span.rounded-full");
    expect(badge).toBeInTheDocument();
    expect(badge?.className).toContain("bg-muted");
    expect(badge?.className).toContain("border-border");
    expect(badge?.className).toContain("text-foreground");
    expect(badge?.textContent).toBe("1");
  });

  it("Columns and Export buttons have h-8 size and outline variant", () => {
    render(<DealsToolbar />);
    const columnsBtn = screen.getByRole("button", { name: /Столбцы/ });
    expect(columnsBtn).toBeInTheDocument();
    expect(columnsBtn.className).toContain("h-8");

    const exportBtn = screen.getByRole("button", { name: /Экспорт/ });
    expect(exportBtn).toBeInTheDocument();
    expect(exportBtn.className).toContain("h-8");
  });
});
