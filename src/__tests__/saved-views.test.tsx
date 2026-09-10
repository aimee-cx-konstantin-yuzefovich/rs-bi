import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, beforeEach } from "vitest";
import { SavedViews } from "@/components/dashboard/saved-views";
import { useDashboardStore } from "@/store/dashboard-store";

describe("SavedViews", () => {
  beforeEach(() => {
    act(() => {
      useDashboardStore.setState({
        savedViews: [],
        selectedColumns: ["ID", "TITLE"],
        pipelineFilter: "all",
        responsibleFilter: "all",
      });
    });
  });

  it("renders trigger button and opens popover with input", () => {
    render(<SavedViews />);
    const trigger = screen.getByRole("button", { name: /Виды/i });
    expect(trigger).toBeInTheDocument();

    fireEvent.click(trigger);
    expect(screen.getByText("Сохранить текущий вид")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("Название вида...")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Сохранить" })).toBeInTheDocument();
    expect(screen.getByText("Нет сохранённых видов")).toBeInTheDocument();
    expect(screen.getByText("Сохраняется локально в браузере (localStorage)")).toBeInTheDocument();
  });

  it("saves a new view with user input and displays it in the list", async () => {
    render(<SavedViews />);
    fireEvent.click(screen.getByRole("button", { name: /Виды/i }));

    const input = screen.getByPlaceholderText("Название вида...");
    fireEvent.change(input, { target: { value: "Мой рабочий вид" } });

    const saveBtn = screen.getByRole("button", { name: "Сохранить" });
    fireEvent.click(saveBtn);

    expect(await screen.findByText(/Вид «Мой рабочий вид» сохранён!/i)).toBeInTheDocument();
    expect(screen.getByText("Мой рабочий вид")).toBeInTheDocument();

    // Verify it is saved in the Zustand store (which persists to localStorage)
    const currentStoreViews = useDashboardStore.getState().savedViews;
    expect(currentStoreViews).toHaveLength(1);
    expect(currentStoreViews[0].name).toBe("Мой рабочий вид");
    expect(currentStoreViews[0].selectedColumns).toEqual(["ID", "TITLE"]);
  });

  it("saves a view with default name when input is empty", async () => {
    render(<SavedViews />);
    fireEvent.click(screen.getByRole("button", { name: /Виды/i }));

    const saveBtn = screen.getByRole("button", { name: "Сохранить" });
    fireEvent.click(saveBtn);

    const currentStoreViews = useDashboardStore.getState().savedViews;
    expect(currentStoreViews).toHaveLength(1);
    expect(currentStoreViews[0].name).toMatch(/^Вид #1/);
    expect(await screen.findByText(currentStoreViews[0].name)).toBeInTheDocument();
  });

  it("applies a saved view", async () => {
    act(() => {
      useDashboardStore.setState({
        savedViews: [
          {
            id: "view-1",
            name: "Кастомный вид",
            selectedColumns: ["TITLE", "OPPORTUNITY"],
            columnSort: { column: "TITLE", direction: "asc" },
            dateFilter: { mode: "all" },
            pipelineFilter: "1",
            responsibleFilter: "7",
            createdAt: Date.now(),
          },
        ],
      });
    });

    render(<SavedViews />);
    fireEvent.click(screen.getByRole("button", { name: /Виды/i }));

    expect(screen.getByText("Кастомный вид")).toBeInTheDocument();

    const applyBtn = screen.getByRole("button", { name: "Применить" });
    fireEvent.click(applyBtn);

    await waitFor(() => {
      expect(useDashboardStore.getState().pipelineFilter).toBe("1");
      expect(useDashboardStore.getState().responsibleFilter).toBe("7");
      expect(useDashboardStore.getState().selectedColumns).toEqual(["TITLE", "OPPORTUNITY"]);
    });
  });

  it("deletes a saved view", async () => {
    act(() => {
      useDashboardStore.setState({
        savedViews: [
          {
            id: "view-1",
            name: "Кастомный вид",
            selectedColumns: ["TITLE", "OPPORTUNITY"],
            columnSort: { column: "TITLE", direction: "asc" },
            dateFilter: { mode: "all" },
            pipelineFilter: "1",
            responsibleFilter: "7",
            createdAt: Date.now(),
          },
        ],
      });
    });

    render(<SavedViews />);
    fireEvent.click(screen.getByRole("button", { name: /Виды/i }));

    const deleteBtn = screen.getByRole("button", { name: /Удалить вид Кастомный вид/i });
    fireEvent.click(deleteBtn);

    expect(useDashboardStore.getState().savedViews).toHaveLength(0);
    expect(screen.getByText("Нет сохранённых видов")).toBeInTheDocument();
  });

  it("preserves and restores columnFilters with the saved view", async () => {
    act(() => {
      useDashboardStore.setState({
        columnFilters: [{ columnId: "STAGE_ID", value: "WON" }],
        selectedColumns: ["ID", "TITLE", "STAGE_ID"],
      });
    });

    render(<SavedViews />);
    fireEvent.click(screen.getByRole("button", { name: /Виды/i }));

    const input = screen.getByPlaceholderText("Название вида...");
    expect(input).toHaveAttribute("maxLength", "60");

    fireEvent.change(input, { target: { value: "Фильтр по выигранным" } });
    fireEvent.click(screen.getByRole("button", { name: "Сохранить" }));

    expect(await screen.findByText("Фильтр по выигранным")).toBeInTheDocument();

    const saved = useDashboardStore.getState().savedViews[0];
    expect(saved.columnFilters).toEqual([{ columnId: "STAGE_ID", value: "WON" }]);

    // Reset columnFilters in store
    act(() => {
      useDashboardStore.setState({ columnFilters: [] });
    });
    expect(useDashboardStore.getState().columnFilters).toEqual([]);

    // Apply saved view
    const applyBtn = screen.getByRole("button", { name: "Применить" });
    fireEvent.click(applyBtn);

    await waitFor(() => {
      expect(useDashboardStore.getState().columnFilters).toEqual([{ columnId: "STAGE_ID", value: "WON" }]);
    });
  });
});
