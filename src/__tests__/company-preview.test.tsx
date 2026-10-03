import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { CompanyPreview } from "@/components/dashboard/company-preview";
import { CompanyBrowser } from "@/components/dashboard/company-browser";

const store = vi.hoisted(() => ({
  fields: [], companyResponsibleCounts: {}, userNames: { "7": "Анна" }, selectedColumns: [],
  fieldsLoading: false, userNamesLoading: false,
  fetchFields: vi.fn(async () => {}), fetchUserNames: vi.fn(async () => {}),
  companyBrowserItems: [{ ID: "42", TITLE: "Компания из таблицы", ASSIGNED_BY_ID: "7" }],
  companyBrowserResponsibleId: "all", companyColumnWidths: {},
  allDeals: [] as Array<Record<string, unknown>>,
  dealsCoverage: null as import("@/lib/dataset-coverage").DatasetCoverage | null,
  fetchCompanyBrowser: vi.fn(), setCompanyBrowserResponsibleId: vi.fn(),
  setCompanyColumnSelectorOpen: vi.fn(), setCompanyColumnWidth: vi.fn(),
}));
vi.mock("next-auth/react", () => ({
  useSession: () => ({ data: null, status: "unauthenticated" }),
}));
vi.mock("@/store/dashboard-store", () => ({ useDashboardStore: () => store }));
vi.mock("@/components/dashboard/company-column-selector", () => ({ CompanyColumnSelector: () => null }));
vi.mock("@/components/dashboard/company-date-filter", () => ({ CompanyDateFilter: () => null }));
vi.mock("@/lib/export-utils", () => ({
  exportToExcelWysiwyg: vi.fn(),
  exportCompanyToExcel: vi.fn(),
}));

const fetchMock = vi.fn();
const detail = (id = "42", title = "Свежая компания") => ({ success: true,
  company: { ID: id, TITLE: title, ASSIGNED_BY_ID: "7", PHONE: "+70000000000" },
  bitrixUrl: `https://portal.example/crm/company/details/${id}/` });
const ok = (body: unknown = detail()) => ({ ok: true, json: async () => body });
beforeEach(() => { vi.stubGlobal("fetch", fetchMock); fetchMock.mockResolvedValue(ok()); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); fetchMock.mockReset(); vi.clearAllMocks(); });

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
  expect(fetchMock.mock.calls.filter(([url]) => String(url).endsWith("/42"))).toHaveLength(2);
});

it("never substitutes the internal company ID for a missing drawer title", async () => {
  fetchMock.mockResolvedValue(ok(detail("42", "")));
  render(<CompanyPreview id="42" onClose={() => {}} />);
  expect(await screen.findByRole("heading", { name: "Без названия" })).toBeInTheDocument();
  expect(screen.queryByRole("heading", { name: "Компания 42" })).not.toBeInTheDocument();
});

it("never substitutes the internal company ID for a missing table title", () => {
  const previousItems = store.companyBrowserItems;
  store.companyBrowserItems = [{ ID: "42", TITLE: "", ASSIGNED_BY_ID: "7" }];
  try {
    render(<CompanyBrowser />);
    expect(screen.getByRole("button", { name: "Без названия" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^(ID 42|42|Компания 42)$/ })).not.toBeInTheDocument();
  } finally {
    store.companyBrowserItems = previousItems;
  }
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
  const first = render(<CompanyPreview id="42" onClose={() => {}} />);
  expect(screen.getByRole("status")).toHaveTextContent("Загрузка компании");
  const signal = fetchMock.mock.calls[0][1].signal;
  first.unmount();
  fetchMock.mockResolvedValue(ok(detail("43", "Другая компания")));
  render(<CompanyPreview id="43" onClose={() => {}} />);
  await screen.findByRole("heading", { name: "Другая компания" });
  // Resolve the obsolete request after the new company has loaded.
  await act(async () => resolve(ok(detail("42", "Устаревшая компания"))));
  expect(signal.aborted).toBe(true);
  expect(screen.queryByText("Устаревшая компания")).not.toBeInTheDocument();
  await waitFor(() => expect(fetchMock.mock.calls.filter(([url]) => !String(url).endsWith("/deals") && !String(url).endsWith("/api/bitrix/samples"))).toHaveLength(2));
});

it("keeps details visible when the portal link is not configured", async () => {
  fetchMock.mockResolvedValue(ok({ ...detail(), bitrixUrl: null }));
  render(<CompanyBrowser />);
  fireEvent.click(screen.getByRole("button", { name: "Компания из таблицы" }));
  await screen.findByRole("heading", { name: "Свежая компания" });
  expect(screen.getByRole("button", { name: "Открыть карточку в Bitrix24" })).toBeDisabled();
  expect(screen.getByText("Ссылка на портал Bitrix24 не настроена.")).toBeInTheDocument();
});

it("shows the marker section separate from the analytical section and never renders legacy sample card rows", async () => {
  fetchMock.mockResolvedValue(
    ok({
      success: true,
      company: {
        ID: "42",
        TITLE: "Тестовая компания",
        ASSIGNED_BY_ID: "7",
        DATE_CREATE: "2025-12-15T14:00:00Z",
        DATE_MODIFY: "2026-07-01T11:59:00Z",
        LAST_ACTIVITY_TIME: "2025-12-15T14:00:00Z",
        COMMENTS: "Тестовый комментарий",
        // Legacy Company sample fields — MUST NOT appear as card rows.
        UF_CRM_1764155817232: "Гель-А",
        UF_CRM_1764156004815: "150",
        UF_CRM_1764155891815: "Золь-Б",
        UF_CRM_1764156064272: "200",
        UF_CRM_1764156557536: "2026-06-20",
        UF_CRM_1764156593: "Успешно",
      },
      bitrixUrl: "https://portal.example/crm/company/details/42/",
    })
  );

  render(<CompanyBrowser />);
  fireEvent.click(screen.getByRole("button", { name: "Компания из таблицы" }));
  await screen.findByRole("heading", { name: "Тестовая компания" });

  // 1. "Последняя активность" should NOT be present
  expect(screen.queryByText("Последняя активность")).not.toBeInTheDocument();

  // 2. "Дата изменения" renders date-only (Section: Системная информация)
  expect(screen.getByText("01.07.2026")).toBeInTheDocument();
  expect(screen.queryByText("01.07.2026 11:59")).not.toBeInTheDocument();

  // 3. Marker section («Информация об образцах») is distinct from the
  //    analytical section («Тестирование образцов»).
  expect(screen.getByRole("heading", { name: "Информация об образцах" })).toBeInTheDocument();
  expect(screen.getByRole("heading", { name: "Тестирование образцов" })).toBeInTheDocument();

  // 4. Legacy sample fields NEVER render as card rows.
  expect(screen.queryByText("Марка предоставленных образцов (ГЕЛЬ)")).not.toBeInTheDocument();
  expect(screen.queryByText("Кол-во переданного образца (ГЕЛЬ) кг")).not.toBeInTheDocument();
  expect(screen.queryByText("Марка предоставленных образцов (ЗОЛЬ)")).not.toBeInTheDocument();
  expect(screen.queryByText("Кол-во переданного образца (ЗОЛЬ) л")).not.toBeInTheDocument();
  expect(screen.queryByText("Дата передачи образцов")).not.toBeInTheDocument();

  // 5. The general comment field renders (canonical card field).
  expect(screen.getByText("Тестовый комментарий")).toBeInTheDocument();
});

it("renders the export button and triggers export with the canonical model, SP cycles and no sampleFields", async () => {
  const { exportCompanyToExcel } = await import("@/lib/export-utils");
  fetchMock.mockImplementation(async (url: string) => {
    if (String(url).endsWith("/deals")) {
      return { ok: true, json: async () => ({ success: true, deals: [] }) };
    }
    if (String(url).endsWith("/api/bitrix/samples")) {
      return {
        ok: true,
        json: async () => ({
          success: true,
          samples: [
            {
              companyId: "42",
              companyTitle: "Экспортная компания",
              responsibleId: "7",
              productFamilies: ["Гель"],
              grades: [{ productFamily: "Гель", value: "Гель-100" }],
              quantities: [],
              sentDates: ["2026-06-20"],
              sampleIndicators: ["В работе"],
              processStatuses: [],
              normalizedResult: "positive",
              relatedDeals: [],
              dataIssues: [],
              smartProcessItems: [
                {
                  processItemId: "9001",
                  title: "Тестирование образца",
                  stageLabel: "Испытания",
                  stageId: "DT1032_15:UC_SP94UZ",
                  isActive: true,
                  isTerminal: false,
                  linkedDealId: undefined,
                  sentDates: ["2026-06-20"],
                  grades: [{ productFamily: "Гель", value: "Гель-100" }],
                  quantities: [],
                  normalizedResult: "positive",
                  responsibleId: "7",
                  dataIssues: [],
                },
              ],
              activeSmartProcessCount: 1,
              currentActiveStageLabels: ["Испытания"],
            },
          ],
        }),
      };
    }
    return ok({
      success: true,
      company: {
        ID: "42",
        TITLE: "Экспортная компания",
        ASSIGNED_BY_ID: "7",
        DATE_CREATE: "2025-12-15T14:00:00Z",
        DATE_MODIFY: "2026-07-01T11:59:00Z",
        COMMENTS: "Комментарий для экспорта",
      },
      bitrixUrl: "https://portal.example/crm/company/details/42/",
    });
  });

  render(<CompanyBrowser />);
  fireEvent.click(screen.getByRole("button", { name: "Компания из таблицы" }));
  await screen.findByRole("heading", { name: "Экспортная компания" });
  // Full report export requires related deals AND Samples/SP data first.
  await waitFor(() => {
    const btn = screen.getByRole("button", { name: "Экспорт отчёта" });
    expect(btn).not.toBeDisabled();
  });

  const exportBtn = screen.getByRole("button", { name: "Экспорт отчёта" });
  expect(exportBtn).toBeInTheDocument();
  expect(exportBtn.className).toContain("border-brand-blue");

  fireEvent.click(exportBtn);

  await waitFor(() => {
    expect(exportCompanyToExcel).toHaveBeenCalledWith(
      expect.objectContaining({
        companyId: "42",
        companyTitle: "Экспортная компания",
        companyFields: expect.any(Array),
        companyModel: expect.any(Object),
        testingMarkerField: expect.any(Object),
        smartProcess: expect.objectContaining({
          activeCount: 1,
          completedCount: 0,
          items: expect.arrayContaining([expect.objectContaining({ processItemId: "9001" })]),
        }),
      })
    );
  });
  // Legacy sample fields can never ride the export call again.
  const call = (exportCompanyToExcel as unknown as ReturnType<typeof vi.fn>).mock
    .calls[0][0] as Record<string, unknown>;
  expect(call).not.toHaveProperty("sampleFields");
});

it("full report export stays disabled while related deals or Samples data are loading, and becomes enabled once loaded", async () => {
  const { exportCompanyToExcel } = await import("@/lib/export-utils");
  let resolveDeals!: (value: unknown) => void;
  fetchMock.mockImplementation(async (url: string) => {
    if (String(url).endsWith("/deals")) {
      return new Promise((done) => { resolveDeals = done; });
    }
    if (String(url).endsWith("/api/bitrix/samples")) {
      return {
        ok: true,
        json: async () => ({ success: true, samples: [] }),
      };
    }
    return ok(detail("42", "Компания с ожидающими сделками"));
  });

  render(<CompanyBrowser />);
  fireEvent.click(screen.getByRole("button", { name: "Компания из таблицы" }));
  await screen.findByRole("heading", { name: "Компания с ожидающими сделками" });

  const fullBtn = screen.getByRole("button", { name: "Экспорт отчёта" });
  expect(fullBtn).toBeDisabled();

  // Exactly two footer actions exist: no 3rd card-only export button
  expect(screen.queryByRole("button", { name: "Экспортировать только карточку компании" })).not.toBeInTheDocument();
  expect(screen.getByRole("link", { name: "Открыть карточку в Bitrix24" })).toBeInTheDocument();

  // Once deals succeed, the full report becomes available.
  (exportCompanyToExcel as unknown as ReturnType<typeof vi.fn>).mockClear();
  resolveDeals({
    ok: true,
    json: async () => ({ success: true, deals: [{ ID: "1", TITLE: "Сделка 1", OPPORTUNITY: "100", CURRENCY_ID: "RUB" }] }),
  });
  await waitFor(() => {
    expect(screen.getByRole("button", { name: "Экспорт отчёта" })).not.toBeDisabled();
  });
  fireEvent.click(screen.getByRole("button", { name: "Экспорт отчёта" }));
  await waitFor(() => {
    expect(exportCompanyToExcel).toHaveBeenCalledWith(
      expect.objectContaining({
        companyId: "42",
        deals: [expect.objectContaining({ id: "1", title: "Сделка 1" })],
      })
    );
  });
});

it("Company Preview fields are independent of selected table columns", async () => {
  fetchMock.mockResolvedValue(
    ok({
      success: true,
      company: {
        ID: "42",
        TITLE: "Колончатая компания",
        ASSIGNED_BY_ID: "7",
        COMMENTS: "Проверка независимости",
      },
      bitrixUrl: null,
    })
  );

  const { useDashboardStore: mockStore } = (await import("@/store/dashboard-store")) as any;
  const previous = mockStore.selectedColumns;

  mockStore.selectedColumns = ["COMPANY_INN", "COMPANY_REGION", "COMPANY_PRODUCT"];
  const first = render(<CompanyPreview id="42" onClose={() => {}} />);
  await screen.findByRole("heading", { name: "Колончатая компания" });
  const fieldLabelsFirst = Array.from(
    document.querySelectorAll("dt.text-xs")
  ).map((el) => el.textContent);

  first.unmount();
  mockStore.selectedColumns = ["ASSIGNED_BY_ID", "PHONE"];

  render(<CompanyPreview id="42" onClose={() => {}} />);
  await screen.findByRole("heading", { name: "Колончатая компания" });
  const fieldLabelsSecond = Array.from(
    document.querySelectorAll("dt.text-xs")
  ).map((el) => el.textContent);

  // Selected table columns must not change the canonical Preview card fields.
  expect(fieldLabelsSecond).toEqual(fieldLabelsFirst);
  expect(fieldLabelsFirst.length).toBeGreaterThan(0);
  mockStore.selectedColumns = previous;
});

it("shows cached related deals immediately and discloses stale cache when refresh fails", async () => {
  const previousDeals = store.allDeals;
  const previousCoverage = store.dealsCoverage;
  // Cache seeding requires COMPLETE store coverage (COMPLETE-only trust).
  store.dealsCoverage = { status: "COMPLETE", fetched: 3, total: 3 };
  store.allDeals = [
    { ID: "501", TITLE: "Кэш сделка 501", COMPANY_ID: "42", STAGE_ID: "NEW" },
    { ID: "502", TITLE: "Кэш сделка 502", COMPANY_ID: "42", STAGE_ID: "WON" },
    { ID: "503", TITLE: "Чужая сделка", COMPANY_ID: "43", STAGE_ID: "NEW" },
  ];
  try {
    fetchMock.mockImplementation(async (url: string) => {
      if (String(url).endsWith("/deals")) {
        return { ok: false, status: 502, json: async () => ({ success: false }) };
      }
      return ok(detail("42", "Кэш-компания"));
    });

    render(<CompanyPreview id="42" onClose={() => {}} />);

    // Cache-first: cached rows are visible BEFORE the server refresh resolves.
    expect(await screen.findByText("Кэш сделка 501")).toBeInTheDocument();
    expect(screen.getByText("Кэш сделка 502")).toBeInTheDocument();
    // No duplicate/foreign rows from cache
    expect(screen.queryByText("Чужая сделка")).not.toBeInTheDocument();

    // After refresh fails, cached rows stay with a non-blocking stale warning.
    expect(await screen.findByText("Показаны кэшированные сделки; обновление с сервера не удалось.")).toBeInTheDocument();
    expect(screen.getByText("Кэш сделка 501")).toBeInTheDocument();
  } finally {
    store.allDeals = previousDeals;
    store.dealsCoverage = previousCoverage;
  }
});

it("replaces cached related deals with refreshed server data without duplicates", async () => {
  const previousDeals = store.allDeals;
  const previousCoverage = store.dealsCoverage;
  store.dealsCoverage = { status: "COMPLETE", fetched: 1, total: 1 };
  store.allDeals = [
    { ID: "501", TITLE: "Устаревшая кэш сделка", COMPANY_ID: "42", STAGE_ID: "NEW" },
  ];
  try {
    fetchMock.mockImplementation(async (url: string) => {
      if (String(url).endsWith("/deals")) {
        return {
          ok: true,
          json: async () => ({
            success: true,
            deals: [
              { ID: "601", TITLE: "Свежая сделка 601", COMPANY_ID: "42" },
              { ID: "601", TITLE: "Свежая сделка 601 дубль", COMPANY_ID: "42" },
            ],
          }),
        };
      }
      return ok(detail("42", "Компания с обновлением сделок"));
    });

    render(<CompanyPreview id="42" onClose={() => {}} />);

    // Server data replaces cache; duplicates removed.
    expect(await screen.findByText("Свежая сделка 601")).toBeInTheDocument();
    expect(screen.queryByText("Устаревшая кэш сделка")).not.toBeInTheDocument();
    expect(screen.queryAllByText("Свежая сделка 601")).toHaveLength(1);
    expect(screen.queryByText(/Показаны кэшированные сделки/)).not.toBeInTheDocument();
  } finally {
    store.allDeals = previousDeals;
    store.dealsCoverage = previousCoverage;
  }
});

it("does not seed cached deals when the store deals coverage is PARTIAL", async () => {
  const previousDeals = store.allDeals;
  const previousCoverage = store.dealsCoverage;
  store.allDeals = [
    { ID: "501", TITLE: "Ненадёжная кэш сделка", COMPANY_ID: "42", STAGE_ID: "NEW" },
  ];
  store.dealsCoverage = { status: "PARTIAL", fetched: 1, total: 10, warning: "Частичные данные." };
  try {
    fetchMock.mockImplementation(async (url: string) => {
      if (String(url).endsWith("/deals")) {
        return new Promise(() => {}); // never resolves
      }
      return ok(detail("42", "Компания с частичным кэшем"));
    });

    render(<CompanyPreview id="42" onClose={() => {}} />);
    await screen.findByRole("heading", { name: "Компания с частичным кэшем" });

    // Partial store coverage → cached scope untrustworthy → not rendered as if fresh.
    expect(screen.queryByText("Ненадёжная кэш сделка")).not.toBeInTheDocument();
  } finally {
    store.allDeals = previousDeals;
    store.dealsCoverage = previousCoverage;
  }
});

it("does not seed cached deals when the store deals coverage is CAPPED", async () => {
  const previousDeals = store.allDeals;
  const previousCoverage = store.dealsCoverage;
  store.allDeals = [
    { ID: "801", TITLE: "Усечённая кэш сделка", COMPANY_ID: "42", STAGE_ID: "NEW" },
  ];
  store.dealsCoverage = { status: "CAPPED", fetched: 1000, total: 1200, cap: 1000, warning: "Данные усечены." };
  try {
    fetchMock.mockImplementation(async (url: string) => {
      if (String(url).endsWith("/deals")) {
        return new Promise(() => {}); // never resolves
      }
      return ok(detail("42", "Компания с усечённым кэшем"));
    });

    render(<CompanyPreview id="42" onClose={() => {}} />);
    await screen.findByRole("heading", { name: "Компания с усечённым кэшем" });

    // Capped store coverage → cached scope incomplete → never trusted as complete.
    expect(screen.queryByText("Усечённая кэш сделка")).not.toBeInTheDocument();
  } finally {
    store.allDeals = previousDeals;
    store.dealsCoverage = previousCoverage;
  }
});

it("does not seed cached deals when the store deals coverage is unknown (null)", async () => {
  const previousDeals = store.allDeals;
  const previousCoverage = store.dealsCoverage;
  store.allDeals = [
    { ID: "811", TITLE: "Неверифицированная кэш сделка", COMPANY_ID: "42", STAGE_ID: "NEW" },
  ];
  store.dealsCoverage = null;
  try {
    fetchMock.mockImplementation(async (url: string) => {
      if (String(url).endsWith("/deals")) {
        return new Promise(() => {}); // never resolves
      }
      return ok(detail("42", "Компания с неизвестным кэшем"));
    });

    render(<CompanyPreview id="42" onClose={() => {}} />);
    await screen.findByRole("heading", { name: "Компания с неизвестным кэшем" });

    // Unknown coverage → cached completeness unverifiable → not trusted.
    expect(screen.queryByText("Неверифицированная кэш сделка")).not.toBeInTheDocument();
  } finally {
    store.allDeals = previousDeals;
    store.dealsCoverage = previousCoverage;
  }
});

it("seeds cached deals only when the store deals coverage is COMPLETE", async () => {
  const previousDeals = store.allDeals;
  const previousCoverage = store.dealsCoverage;
  store.allDeals = [
    { ID: "821", TITLE: "Полная кэш сделка", COMPANY_ID: "42", STAGE_ID: "NEW" },
  ];
  store.dealsCoverage = { status: "COMPLETE", fetched: 1, total: 1 };
  try {
    fetchMock.mockImplementation(async (url: string) => {
      if (String(url).endsWith("/deals")) {
        return new Promise(() => {}); // never resolves (server refresh pending)
      }
      return ok(detail("42", "Компания с полным кэшем"));
    });

    render(<CompanyPreview id="42" onClose={() => {}} />);
    await screen.findByRole("heading", { name: "Компания с полным кэшем" });

    // COMPLETE coverage → cached seed may render immediately while refresh runs.
    expect(screen.getByText("Полная кэш сделка")).toBeInTheDocument();
  } finally {
    store.allDeals = previousDeals;
    store.dealsCoverage = previousCoverage;
  }
});

it("renders specific error message when related deals API returns 403 or 404", async () => {  fetchMock.mockImplementation(async (url: string) => {
    if (String(url).endsWith("/deals")) {
      return {
        ok: false,
        status: 403,
        json: async () => ({ success: false, error: "Нет доступа к сделкам компании" }),
      };
    }
    return ok(detail("42", "Компания с ошибкой сделок"));
  });

  render(<CompanyBrowser />);
  fireEvent.click(screen.getByRole("button", { name: "Компания из таблицы" }));
  await screen.findByRole("heading", { name: "Компания с ошибкой сделок" });

  expect(await screen.findByText("Нет доступа к сделкам компании")).toBeInTheDocument();
});
