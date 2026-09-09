import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { CompanyPreview } from "@/components/dashboard/company-preview";
import { CompanyBrowser } from "@/components/dashboard/company-browser";

const store = vi.hoisted(() => ({
  fields: [], companyResponsibleCounts: {}, userNames: { "7": "Анна" }, selectedColumns: [],
  companyBrowserItems: [{ ID: "42", TITLE: "Компания из таблицы", ASSIGNED_BY_ID: "7" }],
  companyBrowserResponsibleId: "all", companyColumnWidths: {},
  fetchCompanyBrowser: vi.fn(), setCompanyBrowserResponsibleId: vi.fn(),
  setCompanyColumnSelectorOpen: vi.fn(), setCompanyColumnWidth: vi.fn(),
}));
vi.mock("@/store/dashboard-store", () => ({ useDashboardStore: () => store }));
vi.mock("@/components/dashboard/company-column-selector", () => ({ CompanyColumnSelector: () => null }));
vi.mock("@/components/dashboard/company-date-filter", () => ({ CompanyDateFilter: () => null }));
vi.mock("@/lib/export-utils", () => ({ exportToExcelWysiwyg: vi.fn() }));

const fetchMock = vi.fn();
const detail = (id = "42", title = "Свежая компания") => ({ success: true,
  company: { ID: id, TITLE: title, ASSIGNED_BY_ID: "7", PHONE: "+70000000000" },
  bitrixUrl: `https://portal.example/crm/company/details/${id}/` });
const ok = (body: unknown = detail()) => ({ ok: true, json: async () => body });
beforeEach(() => { vi.stubGlobal("fetch", fetchMock); fetchMock.mockResolvedValue(ok()); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); fetchMock.mockReset(); });

it("opens a data row, uses real Bitrix company names and preserves the table on close/reopen", async () => {
  render(<CompanyBrowser />);
  expect(screen.getByRole("button", { name: "Компания из таблицы" })).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "ID 42" })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("cell", { name: "Анна" }));
  expect(await screen.findByRole("heading", { name: "Свежая компания" })).toBeInTheDocument();
  expect(screen.queryByRole("heading", { name: "Компания 42" })).not.toBeInTheDocument();
  expect(screen.getByText("+70000000000")).toBeInTheDocument();
  const link = screen.getByRole("link", { name: "Открыть карточку в Bitrix24" });
  expect(link).toHaveAttribute("href", "https://portal.example/crm/company/details/42/");
  expect(link).toHaveAttribute("target", "_blank");
  fireEvent.click(screen.getByRole("button", { name: "Close" }));
  const trigger = screen.getByRole("button", { name: "Компания из таблицы" });
  await waitFor(() => expect(trigger).toHaveFocus());
  fireEvent.click(trigger);
  await screen.findByRole("heading", { name: "Свежая компания" });
  expect(fetchMock).toHaveBeenCalledTimes(2);
});

it("never substitutes the internal company ID for a missing drawer title", async () => {
  fetchMock.mockResolvedValue(ok(detail("42", "")));
  render(<CompanyPreview id="42" onClose={() => {}} fieldsFor={() => []} />);
  expect(await screen.findByRole("heading", { name: "Без названия" })).toBeInTheDocument();
  expect(screen.queryByRole("heading", { name: "Компания 42" })).not.toBeInTheDocument();
});

it("does not open the drawer from table controls", () => {
  const { container } = render(<CompanyBrowser />);
  fireEvent.click(screen.getByRole("button", { name: "Столбцы" }));
  fireEvent.click(screen.getByRole("checkbox"));
  fireEvent.click(screen.getByText("Наименование компании"));
  const resize = container.querySelector(".cursor-col-resize")!;
  fireEvent.click(resize);
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  expect(fetchMock).not.toHaveBeenCalled();
});

it.each([[404, "Компания не найдена"], [403, "Нет доступа к компании"], [502, "Не удалось загрузить компанию. Попробуйте ещё раз."]])("handles HTTP %s without breaking the table", async (status, message) => {
  fetchMock.mockResolvedValue({ ok: false, status });
  render(<CompanyBrowser />);
  fireEvent.click(screen.getByRole("button", { name: "Компания из таблицы" }));
  expect(await screen.findByRole("alert")).toHaveTextContent(String(message));
  if (status === 502) {
    fetchMock.mockResolvedValue(ok());
    fireEvent.click(screen.getByRole("button", { name: "Повторить" }));
    await screen.findByRole("heading", { name: "Свежая компания" });
  }
  fireEvent.click(screen.getByRole("button", { name: "Close" }));
  expect(screen.getByRole("button", { name: "Компания из таблицы" })).toBeInTheDocument();
});

it("shows loading and ignores a response from a closed drawer", async () => {
  let resolve!: (value: unknown) => void;
  fetchMock.mockReturnValueOnce(new Promise((done) => { resolve = done; }));
  const fieldsFor = () => [];
  const first = render(<CompanyPreview id="42" onClose={() => {}} fieldsFor={fieldsFor} />);
  expect(screen.getByRole("status")).toHaveTextContent("Загрузка компании");
  const signal = fetchMock.mock.calls[0][1].signal;
  first.unmount();
  fetchMock.mockResolvedValue(ok(detail("43", "Другая компания")));
  render(<CompanyPreview id="43" onClose={() => {}} fieldsFor={fieldsFor} />);
  await screen.findByRole("heading", { name: "Другая компания" });
  // Resolve the obsolete request after the new company has loaded.
  await act(async () => resolve(ok(detail("42", "Устаревшая компания"))));
  expect(signal.aborted).toBe(true);
  expect(screen.queryByText("Устаревшая компания")).not.toBeInTheDocument();
  await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
});

it("keeps details visible when the portal link is not configured", async () => {
  fetchMock.mockResolvedValue(ok({ ...detail(), bitrixUrl: null }));
  render(<CompanyBrowser />);
  fireEvent.click(screen.getByRole("button", { name: "Компания из таблицы" }));
  await screen.findByRole("heading", { name: "Свежая компания" });
  expect(screen.getByRole("button", { name: "Открыть карточку в Bitrix24" })).toBeDisabled();
  expect(screen.getByText("Ссылка на портал Bitrix24 не настроена.")).toBeInTheDocument();
});
