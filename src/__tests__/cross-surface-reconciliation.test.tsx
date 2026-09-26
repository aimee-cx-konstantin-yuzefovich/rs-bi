// @vitest-environment jsdom
// ─────────────────────────────────────────────────────────────────────
// Cross-surface reconciliation (UI + table layer) — companion to the
// node-mode independent ledger. Same fixture, same hand-defined ledger.
// ─────────────────────────────────────────────────────────────────────
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup, act } from "@testing-library/react";
import React from "react";
import ExcelJS from "exceljs";
import * as authGuard from "@/lib/auth-guard";
import { useDashboardStore } from "@/store/dashboard-store";
import { StatsCards } from "@/components/dashboard/stats-cards";
import { buildWysiwygWorkbook } from "@/lib/export-utils";
import { useTableState } from "@/hooks/use-table-state";

vi.mock("@/lib/auth-guard", () => ({
  requireAuth: vi.fn().mockResolvedValue({ id: "1", role: "admin" }),
  isAuthError: vi.fn().mockReturnValue(false),
}));

// Same fixture rows (active set) as the node-mode ledger.
const ACTIVE_ROWS: Array<Record<string, unknown>> = [
  { ID: "D1", TITLE: "Сделка А", OPPORTUNITY: "100000", CURRENCY_ID: "RUB", STAGE_ID: "NEW", ASSIGNED_BY_ID: "1", DATE_CREATE: "2026-09-05T10:00:00" },
  { ID: "D2", TITLE: "Сделка Б", OPPORTUNITY: "0", CURRENCY_ID: "RUB", STAGE_ID: "NEW", ASSIGNED_BY_ID: "1", DATE_CREATE: "2026-09-10T10:00:00" },
  { ID: "D3", TITLE: "Сделка В", OPPORTUNITY: "12abc", CURRENCY_ID: "RUB", STAGE_ID: "NEW", ASSIGNED_BY_ID: "2", DATE_CREATE: "2026-09-12T10:00:00" },
  { ID: "D4", TITLE: "Сделка Г", OPPORTUNITY: null, CURRENCY_ID: "RUB", STAGE_ID: "NEW", ASSIGNED_BY_ID: "1", DATE_CREATE: "2026-09-14T10:00:00" },
  { ID: "D5", TITLE: "Deal US", OPPORTUNITY: "50000", CURRENCY_ID: "USD", STAGE_ID: "NEW", ASSIGNED_BY_ID: "2", DATE_CREATE: "2026-09-08T10:00:00" },
  { ID: "D12", TITLE: "Сделка К", OPPORTUNITY: "15000", CURRENCY_ID: "", STAGE_ID: "NEW", ASSIGNED_BY_ID: "1", DATE_CREATE: "2026-09-13T10:00:00" },
  { ID: "D14", TITLE: "Сделка Силика-М", OPPORTUNITY: "99999", CURRENCY_ID: "RUB", STAGE_ID: "NEW", ASSIGNED_BY_ID: "2", DATE_CREATE: "2026-09-15T10:00:00" },
  { ID: "D15", TITLE: "Сделка Н", OPPORTUNITY: "1", CURRENCY_ID: "RUB", STAGE_ID: "NEW", ASSIGNED_BY_ID: "1", DATE_CREATE: "2026-09-16T10:00:00" },
];

const EXPECTED_TABLE_IDS_WITH_SEARCH = ["D14"];

function seedActive() {
  act(() => {
    useDashboardStore.setState({
      allDeals: ACTIVE_ROWS as any,
      deals: ACTIVE_ROWS as any,
      dateFilter: { preset: "custom", customFrom: "2026-09-01", customTo: "2026-09-30" },
      pipelineFilter: "in_work",
      responsibleFilter: "all",
      searchQuery: "",
      columnFilters: [],
      dealsLoading: false,
      fields: [
        { id: "ID", title: "ID", type: "string", isMultiple: false, isSortable: true },
        { id: "TITLE", title: "Название", type: "string", isMultiple: false, isSortable: true },
      ] as any,
      selectedColumns: ["ID", "TITLE"],
      userNames: {},
      companiesData: {},
    });
    useDashboardStore.getState().applyClientFilters();
  });
}

function resetStore() {
  act(() => {
    useDashboardStore.setState({
      allDeals: [],
      deals: [],
      searchQuery: "",
      dateFilter: { preset: "all" },
      pipelineFilter: "all",
    });
    useDashboardStore.getState().applyClientFilters();
  });
}

describe("cross-surface reconciliation — StatsCards and Table", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(authGuard, "requireAuth").mockResolvedValue({ id: "1", role: "admin" } as any);
    vi.spyOn(authGuard, "isAuthError").mockReturnValue(false);
  });

  afterEach(() => {
    cleanup();
    resetStore();
  });

  it("StatsCards UI renders the ledger amounts", () => {
    seedActive();
    render(<StatsCards />);
    // Multi-currency breakdown: per-currency rows with amounts and symbols
    // in separate spans; quality preserved per currency.
    const rubRow = screen.getByText(/200\s?000/).closest("[data-currency]");
    expect(rubRow).toHaveAttribute("data-currency", "RUB");
    expect(rubRow).toHaveAttribute("data-quality", "PARTIAL");
    expect(screen.getByText("₽")).toBeInTheDocument();

    const usdRow = screen.getByText(/50\s?000/).closest("[data-currency]");
    expect(usdRow).toHaveAttribute("data-currency", "USD");
    expect(usdRow).toHaveAttribute("data-quality", "COMPLETE");
    expect(screen.getByText("$")).toBeInTheDocument();

    const unkRow = screen.getByText(/15\s?000/).closest("[data-currency]");
    expect(unkRow).toHaveAttribute("data-currency", "UNKNOWN");
    expect(unkRow).toHaveAttribute("data-quality", "COMPLETE");
    expect(screen.getByText(/— валюта не указана/)).toBeInTheDocument();
  });

  it("table-only search scope yields exactly D14 for Table and Excel", async () => {
    seedActive();
    act(() => {
      useDashboardStore.setState({ searchQuery: "Силика" });
      useDashboardStore.getState().applyClientFilters();
    });

    // Table layer (useTableState) applies the table-only search. The hook
    // must run inside a component, so probe it via a tiny host component.
    let tableIds: string[] = [];
    function TableProbe() {
      const { sortedDeals } = useTableState();
      tableIds = sortedDeals.map((d) => String(d.ID));
      return null;
    }
    render(<TableProbe />);
    expect([...tableIds].sort()).toEqual(EXPECTED_TABLE_IDS_WITH_SEARCH);

    // Excel exports exactly the same scope (rows the table shows).
    const excelRows = tableIds.map((id) => {
      const deal = ACTIVE_ROWS.find((r) => String(r.ID) === id)!;
      return [id, String(deal.TITLE)];
    });
    const wb = await buildWysiwygWorkbook(
      excelRows,
      ["ID", "TITLE"],
      {
        title: "Отчёт по сделкам",
        filtersText: 'Поиск (только таблица): "Силика"',
      }
    );
    const buffer = await wb.xlsx.writeBuffer();
    const fresh = new ExcelJS.Workbook();
    await fresh.xlsx.load(buffer as ArrayBuffer);
    const ws = fresh.getWorksheet("Сделки")!;
    const excelIds: string[] = [];
    ws.eachRow((row, num) => {
      if (num <= 6) return; // header rows
      const v = row.getCell(1).value;
      if (typeof v === "string") excelIds.push(v);
    });
    expect(excelIds.sort()).toEqual(EXPECTED_TABLE_IDS_WITH_SEARCH);
  });
});
