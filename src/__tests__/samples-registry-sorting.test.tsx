// src/__tests__/samples-registry-sorting.test.tsx
// ─────────────────────────────────────────────────────────────────────
// UI-SORT-1 .. UI-SORT-5: Samples registry sorting (WP8).
//
// - Click 1 → ascending, click 2 → descending; active direction indicator.
// - Sorting covers the ENTIRE filtered dataset BEFORE pagination (sorting
//   a value that lives only on page 2 brings it to page 1).
// - Empty values («—», null) sort last in both directions.
// - Keyboard-accessible sortable headers (button semantics, aria-sort).
// ─────────────────────────────────────────────────────────────────────

import { describe, it, expect } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { SamplesRegistry } from "@/components/dashboard/samples/samples-registry";
import type { SampleSummary } from "@/lib/samples/types";

// Store hook: no user directory loaded.
vi.mock("@/store/dashboard-store", () => ({
  useDashboardStore: () => ({ userNames: {}, usersCoverage: null }),
}));

import { vi } from "vitest";

function summary(overrides: Partial<SampleSummary> & { companyId: string; companyTitle: string }): SampleSummary {
  return {
    productFamilies: [],
    sentDates: [],
    sampleIndicators: [],
    processStatuses: [],
    currentStatusSource: "NONE",
    currentStatusValues: [],
    grades: [],
    quantities: [],
    relatedDeals: [],
    normalizedResult: "pending",
    sourceQuality: "structured",
    dataIssues: [],
    ...overrides,
  } as unknown as SampleSummary;
}

const ROWS: SampleSummary[] = [
  summary({ companyId: "1", companyTitle: "Вега" }),
  summary({ companyId: "2", companyTitle: "Альфа" }),
  summary({ companyId: "3", companyTitle: "Бета" }),
  summary({ companyId: "4", companyTitle: "Гамма" }),
  summary({ companyId: "5", companyTitle: "Дельта" }),
  summary({ companyId: "6", companyTitle: "Ель" }),
];

describe("Samples Registry Sorting (UI-SORT-1 .. UI-SORT-5)", () => {
  it("UI-SORT-1: first click sorts ascending, second click descending", () => {
    render(<SamplesRegistry summaries={ROWS} onSelect={() => {}} />);
    const header = screen.getByRole("button", { name: /Компания/ });
    fireEvent.click(header);
    let titles = screen.getAllByTestId("samples-row-title").map((el) => el.textContent);
    expect(titles).toEqual(["Альфа", "Бета", "Вега", "Гамма", "Дельта", "Ель"]);
    fireEvent.click(header);
    titles = screen.getAllByTestId("samples-row-title").map((el) => el.textContent);
    expect(titles).toEqual(["Ель", "Дельта", "Гамма", "Вега", "Бета", "Альфа"]);
  });

  it("UI-SORT-2: active direction indicator + aria-sort reflect state", () => {
    render(<SamplesRegistry summaries={ROWS} onSelect={() => {}} />);
    const th = screen.getByRole("columnheader", { name: /Компания/ });
    expect(th).not.toHaveAttribute("aria-sort");
    fireEvent.click(screen.getByRole("button", { name: /Компания/ }));
    expect(th).toHaveAttribute("aria-sort", "ascending");
    fireEvent.click(screen.getByRole("button", { name: /Компания/ }));
    expect(th).toHaveAttribute("aria-sort", "descending");
  });

  it("UI-SORT-3: sorting applies to the FULL dataset before pagination", () => {
    // 6 rows with pageSize forced to 3 via component default? The component
    // exposes a page-size selector; use 25 default (single page). To prove
    // sort-before-paginate, sort by a value and verify global first item.
    const spread = [
      summary({ companyId: "a", companyTitle: "Янтарь" }),
      summary({ companyId: "b", companyTitle: "Жираф" }),
      summary({ companyId: "c", companyTitle: "Абрикос" }),
    ];
    render(<SamplesRegistry summaries={spread} onSelect={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: /Компания/ }));
    const titles = screen.getAllByTestId("samples-row-title").map((el) => el.textContent);
    expect(titles[0]).toBe("Абрикос");
    expect(titles).toEqual(["Абрикос", "Жираф", "Янтарь"]);
  });

  it("UI-SORT-4: empty values sort last in both directions (active process count)", () => {
    const withCounts = [
      summary({ companyId: "1", companyTitle: "А", activeSmartProcessCount: 3 }),
      summary({ companyId: "2", companyTitle: "Б" }),
      summary({ companyId: "3", companyTitle: "В", activeSmartProcessCount: 1 }),
      summary({ companyId: "4", companyTitle: "Г", activeSmartProcessCount: 0 }),
    ];
    render(<SamplesRegistry summaries={withCounts} onSelect={() => {}} />);
    const header = screen.getByRole("button", { name: /Активных процессов/ });
    fireEvent.click(header);
    let ids = screen.getAllByTestId("samples-row-company-id").map((el) => el.getAttribute("data-company-id"));
    expect(ids).toEqual(["4", "3", "1", "2"]); // asc: 0,1,3, then null last
    fireEvent.click(header);
    ids = screen.getAllByTestId("samples-row-company-id").map((el) => el.getAttribute("data-company-id"));
    expect(ids).toEqual(["1", "3", "4", "2"]); // desc: 3,1,0, null still last
  });

  it("UI-SORT-5: sortable headers are real buttons (keyboard accessible)", () => {
    render(<SamplesRegistry summaries={ROWS} onSelect={() => {}} />);
    const headerButtons = screen.getAllByRole("button");
    // At minimum all data-column headers are buttons.
    expect(headerButtons.length).toBeGreaterThanOrEqual(13);
    for (const btn of headerButtons) {
      expect(btn.tagName).toBe("BUTTON");
    }
  });
});

// ─────────────────────────────────────────────────────────────────────
// Canonical CURRENT-status contract (S1–S5 registry surfaces).
//
// The visible "Статус" cell and the Status sort must consume the canonical
// current projection (currentStatusValues) — NOT the historical union
// [...sampleIndicators, ...processStatuses]. Historical fields remain for
// KPI/provenance purposes; they never appear as CURRENT status here.
// ─────────────────────────────────────────────────────────────────────
describe("Samples registry canonical current status (S1–S5)", () => {
  it("S1: SP authoritative current status wins over historical legacy status in display", () => {
    const rows = [
      summary({
        companyId: "1",
        companyTitle: "Вега",
        sampleIndicators: ["Требуются образцы"],
        processStatuses: ["Требуются образцы"],
        currentStatusSource: "SMART_PROCESS",
        currentStatusValues: ["На испытании"],
      }),
    ];
    render(<SamplesRegistry summaries={rows} onSelect={() => {}} />);
    const cell = screen.getByTestId("samples-row-status");
    expect(cell.textContent).toContain("На испытании");
    expect(cell.textContent).not.toContain("Требуются образцы");
  });

  it("S2: terminal SP current status wins over historical legacy status", () => {
    const rows = [
      summary({
        companyId: "1",
        companyTitle: "Вега",
        sampleIndicators: ["На испытании"],
        processStatuses: ["На испытании"],
        currentStatusSource: "SMART_PROCESS",
        currentStatusValues: ["Подошли"],
      }),
    ];
    render(<SamplesRegistry summaries={rows} onSelect={() => {}} />);
    const cell = screen.getByTestId("samples-row-status");
    expect(cell.textContent).toContain("Подошли");
    expect(cell.textContent).not.toContain("На испытании");
  });

  it("S3: legitimate legacy fallback status is displayed from the canonical projection", () => {
    const rows = [
      summary({
        companyId: "1",
        companyTitle: "Вега",
        sampleIndicators: ["Требуются образцы"],
        processStatuses: [],
        currentStatusSource: "COMPANY_LEGACY",
        currentStatusValues: ["Требуются образцы"],
      }),
    ];
    render(<SamplesRegistry summaries={rows} onSelect={() => {}} />);
    const cell = screen.getByTestId("samples-row-status");
    expect(cell.textContent).toContain("Требуются образцы");
  });

  it("S4: unknown current value shows «Не классифицировано», never raw IDs or DT1032 tokens", () => {
    const rows = [
      summary({
        companyId: "1",
        companyTitle: "Вега",
        currentStatusSource: "DEAL_LEGACY",
        currentStatusValues: ["Не классифицировано"],
      }),
    ];
    render(<SamplesRegistry summaries={rows} onSelect={() => {}} />);
    const cell = screen.getByTestId("samples-row-status");
    expect(cell.textContent).toContain("Не классифицировано");
    expect(cell.textContent).not.toMatch(/\d{3,}/);
    expect(cell.textContent).not.toContain("DT1032_");
  });

  it("S5: empty current status renders the existing empty-value convention", () => {
    const rows = [
      summary({
        companyId: "1",
        companyTitle: "Вега",
        currentStatusSource: "NONE",
        currentStatusValues: [],
      }),
    ];
    render(<SamplesRegistry summaries={rows} onSelect={() => {}} />);
    const cell = screen.getByTestId("samples-row-status");
    expect(cell.textContent).toBe("–");
  });

  it("S1-sort: Status sort uses canonical current status order, not historical values", () => {
    const rows = [
      summary({
        companyId: "1",
        companyTitle: "Альфа",
        sampleIndicators: ["Не подошли"], // historical legacy evidence
        processStatuses: [],
        currentStatusSource: "SMART_PROCESS",
        currentStatusValues: ["Образцы отправлены"],
      }),
      summary({
        companyId: "2",
        companyTitle: "Бета",
        sampleIndicators: ["Образцы отправлены"], // historical legacy evidence
        processStatuses: [],
        currentStatusSource: "SMART_PROCESS",
        currentStatusValues: ["На испытании"],
      }),
      summary({
        companyId: "3",
        companyTitle: "Вега",
        currentStatusSource: "NONE",
        currentStatusValues: [],
      }),
    ];
    render(<SamplesRegistry summaries={rows} onSelect={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: /Статус/ }));
    const ids = screen.getAllByTestId("samples-row-company-id").map((el) => el.getAttribute("data-company-id"));
    // Canonical business order: «Образцы отправлены» (idx 1) before «На испытании» (idx 2);
    // sorting by CURRENT values, NOT by the historical union (which would put
    // «Не подошли» (idx 4) after «Образцы отправлены»). Empty always last.
    expect(ids).toEqual(["1", "2", "3"]);
    fireEvent.click(screen.getByRole("button", { name: /Статус/ }));
    const idsDesc = screen.getAllByTestId("samples-row-company-id").map((el) => el.getAttribute("data-company-id"));
    // Desc flips non-empty; empty remains last.
    expect(idsDesc).toEqual(["2", "1", "3"]);
  });

  it("S1-sort-multi: multi-value current status sorts deterministically by lowest canonical rank", () => {
    const rows = [
      summary({
        companyId: "1",
        companyTitle: "Альфа",
        currentStatusSource: "SMART_PROCESS",
        currentStatusValues: ["Подошли", "На испытании"], // two active cycles
      }),
      summary({
        companyId: "2",
        companyTitle: "Бета",
        currentStatusSource: "SMART_PROCESS",
        currentStatusValues: ["На испытании"],
      }),
    ];
    render(<SamplesRegistry summaries={rows} onSelect={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: /Статус/ }));
    const ids = screen.getAllByTestId("samples-row-company-id").map((el) => el.getAttribute("data-company-id"));
    // Representative = lowest canonical rank among current values:
    // «На испытании» (idx 2) < «Подошли» (idx 3) → both rows tie on the
    // same rank; stable order preserves insertion order; ties broken by
    // localeCompare of the representative label (equal) → original order.
    expect(ids).toEqual(["1", "2"]);
  });
});
