import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { CommercialBottlenecksTab } from "@/components/commercial-funnel/bottlenecks-tab";
import type { ActionPlanRow } from "@/lib/commercial-funnel/types";


vi.mock("next-auth/react", () => ({
  useSession: () => ({ data: null, status: "unauthenticated" }),
}));

describe("Commercial Funnel Attention Table (Deals standard)", () => {
  const createMockRows = (count: number): ActionPlanRow[] =>
    Array.from({ length: count }, (_, i) => ({
      id: `row-${i + 1}`,
      companyId: `comp-${i + 1}`,
      companyTitle: `Компания ${String(i + 1).padStart(2, "0")}`,
      responsibleId: `resp-${(i % 3) + 1}`,
      responsibleName: `Менеджер ${(i % 3) + 1}`,
      stuckAt: i % 2 === 0 ? "Сделка" : "Образцы",
      currentState: i % 2 === 0 ? "Выставлен счет" : "Согласование ТЗ",
      daysWaiting: i === 0 ? null : (i * 5) % 30, // row 1 has null daysWaiting
      lastActivity: i === 1 ? undefined : `2026-03-${String(10 + (i % 15)).padStart(2, "0")}`,
      lastActivityKnown: i !== 1,
      nextAction: i % 4 === 0 ? undefined : `Позвонить клиенту ${i + 1}`,
      nextActionDate: i % 4 === 0 ? undefined : `2026-04-${String(1 + (i % 20)).padStart(2, "0")}`,
      dealId: `deal-${i + 1}`,
      dealTitle: `Сделка ${i + 1}`,
    }));

  it("CF-ATTN-1: renders exactly 10 columns matching Deals table standard", () => {
    const rows = createMockRows(5);
    render(
      <CommercialBottlenecksTab
        actionPlan={rows}
        activityPartial={false}
        onSelectCompany={vi.fn()}
        onSelectDeal={vi.fn()}
      />
    );

    const headers = screen.getAllByRole("columnheader");
    expect(headers).toHaveLength(10);

    const headerTexts = headers.map((h) => h.textContent?.replace(/[\s\n]+/g, " ").trim());
    expect(headerTexts).toEqual([
      "№",
      "Компания",
      "Менеджер",
      "Где зависло",
      "Текущее состояние",
      "Дней ожидания",
      "Последняя активность",
      "Следующий шаг",
      "Срок следующего шага",
      "Сделка",
    ]);
  });

  it("CF-ATTN-2: paginates 50 items per page with sort-before-paginate", () => {
    const rows = createMockRows(60);
    render(
      <CommercialBottlenecksTab
        actionPlan={rows}
        activityPartial={false}
        onSelectCompany={vi.fn()}
        onSelectDeal={vi.fn()}
      />
    );

    // Initial page shows 50 rows
    const table = screen.getByTestId("action-plan-table");
    const bodyRows = table.querySelectorAll("tbody tr");
    expect(bodyRows).toHaveLength(50);

    // Row 1 shows № 1, Row 50 shows № 50
    expect(bodyRows[0].querySelector("td")?.textContent).toBe("1");
    expect(bodyRows[49].querySelector("td")?.textContent).toBe("50");

    // Pagination info
    expect(screen.getByText(/1–50/)).toBeInTheDocument();
    expect(screen.getByText("60")).toBeInTheDocument();
  });

  it("CF-ATTN-3: sorts type-aware with NULLS ALWAYS LAST in both ASC and DESC", () => {
    // 3 rows: row1 has null daysWaiting, row2 has 20, row3 has 5
    const rows: ActionPlanRow[] = [
      {
        id: "1",
        companyId: "c1",
        companyTitle: "А Компания (null days)",
        responsibleId: "r1",
        responsibleName: "Менеджер",
        stuckAt: "Сделка",
        currentState: "Выставлен счет",
        daysWaiting: null,
        lastActivity: "2026-03-01",
        lastActivityKnown: true,
        nextAction: "Действие",
        nextActionDate: "2026-04-01",
      },
      {
        id: "2",
        companyId: "c2",
        companyTitle: "Б Компания (20 days)",
        responsibleId: "r1",
        responsibleName: "Менеджер",
        stuckAt: "Сделка",
        currentState: "Выставлен счет",
        daysWaiting: 20,
        lastActivity: "2026-03-02",
        lastActivityKnown: true,
        nextAction: "Действие",
        nextActionDate: "2026-04-02",
      },
      {
        id: "3",
        companyId: "c3",
        companyTitle: "В Компания (5 days)",
        responsibleId: "r1",
        responsibleName: "Менеджер",
        stuckAt: "Сделка",
        currentState: "Выставлен счет",
        daysWaiting: 5,
        lastActivity: "2026-03-03",
        lastActivityKnown: true,
        nextAction: "Действие",
        nextActionDate: "2026-04-03",
      },
    ];

    render(
      <CommercialBottlenecksTab
        actionPlan={rows}
        activityPartial={false}
        onSelectCompany={vi.fn()}
        onSelectDeal={vi.fn()}
      />
    );

    const daysHeader = screen.getByText("Дней ожидания");

    // Click 1: ASC (should be 5, 20, null)
    fireEvent.click(daysHeader);
    let bodyRows = screen.getByTestId("action-plan-table").querySelectorAll("tbody tr");
    expect(bodyRows[0].textContent).toContain("В Компания"); // 5
    expect(bodyRows[1].textContent).toContain("Б Компания"); // 20
    expect(bodyRows[2].textContent).toContain("А Компания"); // null is last!

    // Click 2: DESC (should be 20, 5, null)
    fireEvent.click(daysHeader);
    bodyRows = screen.getByTestId("action-plan-table").querySelectorAll("tbody tr");
    expect(bodyRows[0].textContent).toContain("Б Компания"); // 20
    expect(bodyRows[1].textContent).toContain("В Компания"); // 5
    expect(bodyRows[2].textContent).toContain("А Компания"); // null is STILL last!

    // Click 3: Unsorted (original order: A, B, C)
    fireEvent.click(daysHeader);
    bodyRows = screen.getByTestId("action-plan-table").querySelectorAll("tbody tr");
    expect(bodyRows[0].textContent).toContain("А Компания");
    expect(bodyRows[1].textContent).toContain("Б Компания");
    expect(bodyRows[2].textContent).toContain("В Компания");
  });

  it("CF-ATTN-4: clicking deal title opens DealPreview with exact dealId", () => {
    const onSelectDeal = vi.fn();
    const rows = createMockRows(2);
    render(
      <CommercialBottlenecksTab
        actionPlan={rows}
        activityPartial={false}
        onSelectCompany={vi.fn()}
        onSelectDeal={onSelectDeal}
      />
    );

    const dealButton = screen.getByRole("button", { name: "Сделка 1" });
    fireEvent.click(dealButton);
    expect(onSelectDeal).toHaveBeenCalledWith("deal-1");
  });

  it("CF-ATTN-5: highlights selected row with subtle corporate blue tint (bg-primary/10)", () => {
    const rows = createMockRows(2);
    render(
      <CommercialBottlenecksTab
        actionPlan={rows}
        activityPartial={false}
        onSelectCompany={vi.fn()}
        onSelectDeal={vi.fn()}
      />
    );

    const bodyRows = screen.getByTestId("action-plan-table").querySelectorAll("tbody tr");
    expect(bodyRows[0].className).not.toContain("bg-primary/10");

    // Click row 1
    fireEvent.click(bodyRows[0]);
    expect(bodyRows[0].className).toContain("bg-primary/10");
  });
});
