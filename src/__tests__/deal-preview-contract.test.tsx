import { render, screen, cleanup, waitForElementToBeRemoved } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DealPreview } from "@/components/dashboard/deal-preview";
import {
  buildDealPreviewModel,
  resolveDealStage,
  DEAL_PREVIEW_CARD_FIELDS,
} from "@/lib/deal-preview";
import { createDealExcelWorkbook } from "@/lib/export-utils";
import {
  DEAL_SAMPLE_TESTING_FIELD_ID,
  DEAL_SAMPLE_MARK_VOLUME_FIELD_ID,
  PAYMENT_STATUS_FIELD_ID,
  DEAL_PAYMENT_DATE_FIELD_ID,
  DEAL_SHIPMENT_DATE_FIELD_ID,
  DEAL_DELIVERY_TYPE_FIELD_ID,
  DEAL_DELIVERY_COST_FIELD_ID,
  DEAL_DELIVERY_ADDRESS_FIELD_ID,
} from "@/lib/crm-constants";

// Mock store state
const mockStore = vi.hoisted(() => ({
  fields: [
    { id: "STAGE_ID", title: "Стадия", type: "crm_status", listValues: [{ ID: "10", VALUE: "Переговоры" }] },
    {
      id: "UF_CRM_1584464068013",
      title: "Статус оплаты",
      type: "enumeration",
      listValues: [
        { ID: "103", VALUE: "Не оплачен" },
        { ID: "105", VALUE: "Выставлен счет" },
        { ID: "113", VALUE: "Оплачен" },
      ],
    },
    {
      id: "UF_CRM_1584459858509",
      title: "Тип доставки",
      type: "enumeration",
      listValues: [
        { ID: "91", VALUE: "Самовывоз" },
        { ID: "93", VALUE: "Доставка курьерской службой" },
      ],
    },
  ],
  userNames: { "7": "Анна Смирнова" } as Record<string, string>,
  usersCoverage: null,
  activitiesData: {} as Record<string, any>,
}));

vi.mock("@/store/dashboard-store", () => ({
  useDashboardStore: (selector?: (s: typeof mockStore) => any) =>
    selector ? selector(mockStore) : mockStore,
}));

const fetchMock = vi.fn();

beforeEach(() => {
  vi.stubGlobal("fetch", fetchMock);
  mockStore.activitiesData = {};
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  fetchMock.mockReset();
});

describe("Deal Preview — Current-Card Whitelist, Timeline, Classifications & Excel (Tests A to O)", () => {
  // ─────────────────────────────────────────────────────────────────────────
  // TEST A & TEST I: Whitelist & Legacy Fields Removal
  // ─────────────────────────────────────────────────────────────────────────
  it("TEST A & TEST I: Renders only whitelist fields; legacy/non-current fields (Тип оплаты, Тип продукта, RnD, техподдержка, DATE_MODIFY, BEGINDATE, CLOSEDATE) are strictly absent", async () => {
    const rawDeal = {
      ID: "501",
      TITLE: "Сделка Тест A",
      STAGE_ID: "NEW",
      OPPORTUNITY: 250000,
      CURRENCY_ID: "RUB",
      ASSIGNED_BY_ID: "7",
      COMPANY_ID: "42",
      COMPANY_TITLE: "ООО РусСилика",
      DATE_CREATE: "2026-09-30T07:49:00Z",
      // Legacy date fields to exclude:
      DATE_MODIFY: "2026-09-30T10:00:00Z",
      BEGINDATE: "2026-09-01",
      CLOSEDATE: "2026-09-30",
      // Current deal card fields:
      TYPE_ID: "SALE",
      [DEAL_SAMPLE_TESTING_FIELD_ID]: "Y",
      [DEAL_SAMPLE_MARK_VOLUME_FIELD_ID]: "Партия 10 т",
      [PAYMENT_STATUS_FIELD_ID]: "113",
      [DEAL_PAYMENT_DATE_FIELD_ID]: "2026-10-01",
      [DEAL_SHIPMENT_DATE_FIELD_ID]: "2026-10-05",
      [DEAL_DELIVERY_TYPE_FIELD_ID]: "91",
      [DEAL_DELIVERY_COST_FIELD_ID]: "30500|RUB",
      [DEAL_DELIVERY_ADDRESS_FIELD_ID]: "г. Москва, ул. Ленина, 10",
      // Legacy / removed fields from Section 9 & Test I:
      UF_CRM_1763542249: "1081", // Тип оплаты
      UF_CRM_69257BBACD471: "1617", // Тип продукта
      UF_CRM_1774880111684: true, // R&D
      UF_CRM_1781790245: "Ответ техподдержки текст",
      UF_CRM_1781799182248: "Ответ техподдержки файл 1",
      UF_CRM_1781799196440: "Ответ техподдержки файл 2",
      UF_CRM_UNKNOWN_999: "Неизвестное поле",
    };

    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        success: true,
        deal: rawDeal,
        bitrixUrl: "https://russilica.bitrix24.ru/crm/deal/details/501/",
        companyBitrixUrl: null,
      }),
    });

    render(<DealPreview id="501" onClose={() => {}} />);
    await waitForElementToBeRemoved(() => screen.queryByText("Загрузка сделки"));

    // Whitelist core attributes present
    expect(screen.getByText("Сделка Тест A")).toBeInTheDocument();
    expect(screen.getByText("Стадия")).toBeInTheDocument();
    expect(screen.getByText("Новые")).toBeInTheDocument();
    expect(screen.getByText("Сумма")).toBeInTheDocument();
    expect(screen.getByText("Ответственный")).toBeInTheDocument();
    expect(screen.getByText("Компания")).toBeInTheDocument();

    // Whitelist timeline dates present
    expect(screen.getByText("Дата создания сделки")).toBeInTheDocument();
    expect(screen.getByText("Последнее касание")).toBeInTheDocument();
    expect(screen.getByText("Последняя активность")).toBeInTheDocument();

    // Current deal-card fields present
    expect(screen.getByText("Тип сделки")).toBeInTheDocument();
    expect(screen.getByText("Тестирование образцов")).toBeInTheDocument();
    expect(screen.getByText("Марка и объём поставки")).toBeInTheDocument();
    expect(screen.getByText("Статус оплаты")).toBeInTheDocument();
    expect(screen.getByText("Дата оплаты")).toBeInTheDocument();
    expect(screen.getByText("Дата отгрузки")).toBeInTheDocument();
    expect(screen.getByText("Тип доставки")).toBeInTheDocument();
    expect(screen.getByText("Стоимость доставки")).toBeInTheDocument();
    expect(screen.getByText("Адрес доставки")).toBeInTheDocument();

    // Legacy fields MUST NOT be present
    expect(screen.queryByText("Тип оплаты")).not.toBeInTheDocument();
    expect(screen.queryByText("1081")).not.toBeInTheDocument();
    expect(screen.queryByText("Тип продукта")).not.toBeInTheDocument();
    expect(screen.queryByText("1617")).not.toBeInTheDocument();
    expect(screen.queryByText("R&D")).not.toBeInTheDocument();
    expect(screen.queryByText("Ответ техподдержки")).not.toBeInTheDocument();
    expect(screen.queryByText("Неизвестное поле")).not.toBeInTheDocument();
    expect(screen.queryByText("Дополнительные поля")).not.toBeInTheDocument();

    // Technical dates MUST NOT be present
    expect(screen.queryByText("Дата изменения")).not.toBeInTheDocument();
    expect(screen.queryByText("Дата начала")).not.toBeInTheDocument();
    expect(screen.queryByText("Дата завершения")).not.toBeInTheDocument();
    expect(screen.queryByText("Следующая активность")).not.toBeInTheDocument();
  });

  // ─────────────────────────────────────────────────────────────────────────
  // TEST B & TEST C: Last Activity Text
  // ─────────────────────────────────────────────────────────────────────────
  it("TEST B: activitiesData[id].last.SUBJECT exists -> 'Последняя активность' is visible with exact subject", async () => {
    mockStore.activitiesData = {
      "502": {
        last: {
          SUBJECT: "Если клиент будет осуществлять предоплату — выставите и отправьте ему счёт",
          CREATED: "2026-09-30T12:30:00Z",
        },
      },
    };

    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        success: true,
        deal: {
          ID: "502",
          TITLE: "Сделка 502",
          DATE_CREATE: "2026-09-30T07:49:00Z",
        },
        bitrixUrl: null,
        companyBitrixUrl: null,
      }),
    });

    render(<DealPreview id="502" onClose={() => {}} />);
    await waitForElementToBeRemoved(() => screen.queryByText("Загрузка сделки"));

    expect(screen.getByText("Последняя активность")).toBeInTheDocument();
    expect(
      screen.getByText("Если клиент будет осуществлять предоплату — выставите и отправьте ему счёт")
    ).toBeInTheDocument();
  });

  it("TEST C: Last activity subject missing -> 'Последняя активность' remains visible with '–'", async () => {
    mockStore.activitiesData = {};

    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        success: true,
        deal: {
          ID: "503",
          TITLE: "Сделка 503",
          DATE_CREATE: "2026-09-30T07:49:00Z",
        },
        bitrixUrl: null,
        companyBitrixUrl: null,
      }),
    });

    render(<DealPreview id="503" onClose={() => {}} />);
    await waitForElementToBeRemoved(() => screen.queryByText("Загрузка сделки"));

    expect(screen.getByText("Последняя активность")).toBeInTheDocument();
    // Field is NOT removed; displays '–'
    const lastActivityDt = screen.getByText("Последняя активность");
    const lastActivityDd = lastActivityDt.nextElementSibling;
    expect(lastActivityDd).toHaveTextContent("–");
  });

  // ─────────────────────────────────────────────────────────────────────────
  // TEST D & TEST E: Two-Date Timeline Model
  // ─────────────────────────────────────────────────────────────────────────
  it("TEST D: Renders exactly two timeline dates: 'Дата создания сделки' = A, 'Последнее касание' = E; excludes DATE_MODIFY, BEGINDATE, CLOSEDATE", async () => {
    mockStore.activitiesData = {
      "504": {
        last: {
          SUBJECT: "Звонок клиенту",
          CREATED: "2026-09-30T12:30:00Z", // E
        },
      },
    };

    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        success: true,
        deal: {
          ID: "504",
          TITLE: "Сделка 504",
          DATE_CREATE: "2026-09-30T07:49:00Z", // A
          DATE_MODIFY: "2026-09-30T18:00:00Z", // B (must not be used)
          BEGINDATE: "2026-09-01", // C (must not be displayed)
          CLOSEDATE: "2026-09-30", // D (must not be displayed)
        },
        bitrixUrl: null,
        companyBitrixUrl: null,
      }),
    });

    render(<DealPreview id="504" onClose={() => {}} />);
    await waitForElementToBeRemoved(() => screen.queryByText("Загрузка сделки"));

    expect(screen.getByText("Дата создания сделки")).toBeInTheDocument();
    expect(screen.getByText("Последнее касание")).toBeInTheDocument();
    expect(screen.getByText("Последняя активность")).toBeInTheDocument();

    expect(screen.queryByText("Дата изменения")).not.toBeInTheDocument();
    expect(screen.queryByText("Дата начала")).not.toBeInTheDocument();
    expect(screen.queryByText("Дата завершения")).not.toBeInTheDocument();
  });

  it("TEST E: No authoritative activity timestamp -> 'Последнее касание' displays '–', NEVER DATE_MODIFY", async () => {
    mockStore.activitiesData = {};

    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        success: true,
        deal: {
          ID: "505",
          TITLE: "Сделка 505",
          DATE_CREATE: "2026-09-30T07:49:00Z",
          DATE_MODIFY: "2026-09-30T18:00:00Z", // Must NEVER become last touch
        },
        bitrixUrl: null,
        companyBitrixUrl: null,
      }),
    });

    render(<DealPreview id="505" onClose={() => {}} />);
    await waitForElementToBeRemoved(() => screen.queryByText("Загрузка сделки"));

    const lastTouchDt = screen.getByText("Последнее касание");
    const lastTouchDd = lastTouchDt.nextElementSibling;
    expect(lastTouchDd).toHaveTextContent("–");
    expect(lastTouchDd).not.toHaveTextContent("18:00");
  });

  // ─────────────────────────────────────────────────────────────────────────
  // TEST F, G, H: Classification Resolution
  // ─────────────────────────────────────────────────────────────────────────
  it("TEST F: Payment status raw = 113 resolves to configured label 'Оплачен' in UI and Excel", () => {
    const deal = {
      ID: "506",
      TITLE: "Сделка 506",
      [PAYMENT_STATUS_FIELD_ID]: "113",
    };

    const model = buildDealPreviewModel(deal, { fields: mockStore.fields });
    const payField = model.cardFields.find((f) => f.id === PAYMENT_STATUS_FIELD_ID);

    expect(payField?.value).toBe("Оплачен");
    expect(payField?.excelValue).toBe("Оплачен");
  });

  it("TEST G: Stage raw = 10 resolves to authoritative stage metadata label, never raw 10", () => {
    const rawStage = "10";
    const resolved = resolveDealStage(rawStage, mockStore.fields);
    expect(resolved).toBe("Переговоры");
    expect(resolved).not.toBe("10");

    const deal = {
      ID: "507",
      TITLE: "Сделка 507",
      STAGE_ID: "10",
    };
    const model = buildDealPreviewModel(deal, { fields: mockStore.fields });
    expect(model.mainFields[0].value).toBe("Переговоры");
    expect(model.mainFields[0].excelValue).toBe("Переговоры");
  });

  it("TEST H: Unknown retained enum raw = 999999 displays 'Не классифицировано (999999)'", () => {
    const deal = {
      ID: "508",
      TITLE: "Сделка 508",
      [PAYMENT_STATUS_FIELD_ID]: "999999",
      STAGE_ID: "888888",
    };

    const model = buildDealPreviewModel(deal, { fields: mockStore.fields });
    const payField = model.cardFields.find((f) => f.id === PAYMENT_STATUS_FIELD_ID);
    const stageField = model.mainFields.find((f) => f.id === "STAGE_ID");

    expect(payField?.value).toBe("Не классифицировано (999999)");
    expect(payField?.excelValue).toBe("Не классифицировано (999999)");

    expect(stageField?.value).toBe("Не классифицировано (888888)");
    expect(stageField?.excelValue).toBe("Не классифицировано (888888)");
  });

  // ─────────────────────────────────────────────────────────────────────────
  // TEST J & TEST K: Date and Money Formatting
  // ─────────────────────────────────────────────────────────────────────────
  it("TEST J: Дата отгрузки raw ISO date formats as Russian date (DD.MM.YYYY)", () => {
    const deal = {
      ID: "509",
      TITLE: "Сделка 509",
      [DEAL_SHIPMENT_DATE_FIELD_ID]: "2026-10-05T03:00:00+03:00",
    };

    const model = buildDealPreviewModel(deal, { fields: mockStore.fields });
    const shipField = model.cardFields.find((f) => f.id === DEAL_SHIPMENT_DATE_FIELD_ID);

    expect(shipField?.value).toBe("05.10.2026");
    expect(shipField?.excelValue).toBeInstanceOf(Date);
  });

  it("TEST K: Стоимость доставки '30500|RUB' formats as '30 500,00 RUB' in UI and numeric 30500 in Excel", () => {
    const deal = {
      ID: "510",
      TITLE: "Сделка 510",
      [DEAL_DELIVERY_COST_FIELD_ID]: "30500|RUB",
    };

    const model = buildDealPreviewModel(deal, { fields: mockStore.fields });
    const costField = model.cardFields.find((f) => f.id === DEAL_DELIVERY_COST_FIELD_ID);

    expect(costField?.value).toContain("30");
    expect(costField?.value).toContain("500,00");
    expect(costField?.value).toContain("RUB");
    expect(costField?.excelValue).toBe(30500);
    expect(costField?.isMoney).toBe(true);
  });

  // ─────────────────────────────────────────────────────────────────────────
  // TEST L, M, N, O: Single-Deal Excel Workbook Structure & Reconciliation
  // ─────────────────────────────────────────────────────────────────────────
  it("TEST L, M, N, O: Excel export contains exact business field contract, reconciles with UI, includes 'Последняя активность', excludes legacy fields", () => {
    const deal = {
      ID: "511",
      TITLE: "Сделка 511",
      STAGE_ID: "10",
      OPPORTUNITY: 500000,
      CURRENCY_ID: "RUB",
      ASSIGNED_BY_ID: "7",
      COMPANY_ID: "42",
      COMPANY_TITLE: "ООО РусСилика",
      DATE_CREATE: "2026-09-30T07:49:00Z",
      // Legacy fields:
      DATE_MODIFY: "2026-09-30T10:00:00Z",
      BEGINDATE: "2026-09-01",
      CLOSEDATE: "2026-09-30",
      UF_CRM_1763542249: "1081",
      UF_CRM_69257BBACD471: "1617",
      UF_CRM_1774880111684: true,
      // Card fields:
      TYPE_ID: "SALE",
      [DEAL_SAMPLE_TESTING_FIELD_ID]: "Y",
      [DEAL_SAMPLE_MARK_VOLUME_FIELD_ID]: "Партия 10 т",
      [PAYMENT_STATUS_FIELD_ID]: "113",
      [DEAL_PAYMENT_DATE_FIELD_ID]: "2026-10-01",
      [DEAL_SHIPMENT_DATE_FIELD_ID]: "2026-10-05",
      [DEAL_DELIVERY_TYPE_FIELD_ID]: "91",
      [DEAL_DELIVERY_COST_FIELD_ID]: "30500|RUB",
      [DEAL_DELIVERY_ADDRESS_FIELD_ID]: "г. Москва",
    };

    const activity = {
      SUBJECT: "Звонок клиенту по поводу предоплаты",
      CREATED: "2026-09-30T12:30:00Z",
    };

    const model = buildDealPreviewModel(deal, {
      fields: mockStore.fields,
      userNames: mockStore.userNames,
      activity,
    });

    // TEST O: Reconciliation between UI and model
    expect(model.mainFields[0].value).toBe("Переговоры");
    expect(model.mainFields[1].value).toContain("500");
    expect(model.mainFields[2].value).toBe("Анна Смирнова");
    expect(model.mainFields[3].value).toBe("ООО РусСилика");

    expect(model.timelineFields[0].value).toContain("30.09.2026");
    expect(model.timelineFields[1].value).toContain("30.09.2026");
    expect(model.activityField.value).toBe("Звонок клиенту по поводу предоплаты");

    // Build Excel Workbook
    const workbook = createDealExcelWorkbook({
      deal,
      dealModel: model,
    });

    const worksheet = workbook.getWorksheet("Отчёт по сделке");
    expect(worksheet).toBeDefined();

    // Check section headers
    const rowValues: string[] = [];
    worksheet?.eachRow((row) => {
      rowValues.push(String(row.getCell(1).value || ""));
    });

    // TEST L: Exact sections present
    expect(rowValues).toContain("Основная информация");
    expect(rowValues).toContain("Хронология");
    expect(rowValues).toContain("Данные сделки");

    // All 9 card fields present in sheet
    for (const cardField of DEAL_PREVIEW_CARD_FIELDS) {
      expect(rowValues).toContain(cardField.label);
    }

    // TEST M: 'Последняя активность' in sheet
    expect(rowValues).toContain("Последняя активность");

    // TEST N: Excluded legacy fields are NOT in sheet
    expect(rowValues).not.toContain("Тип оплаты");
    expect(rowValues).not.toContain("Тип продукта");
    expect(rowValues).not.toContain("R&D");
    expect(rowValues).not.toContain("Дата изменения");
    expect(rowValues).not.toContain("Дата начала");
    expect(rowValues).not.toContain("Дата завершения");
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Footer Two Primary Actions Check
  // ─────────────────────────────────────────────────────────────────────────
  it("Renders exactly two footer action buttons: [ Экспорт ] and [ Открыть сделку в Bitrix24 ]", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        success: true,
        deal: { ID: "512", TITLE: "Сделка 512" },
        bitrixUrl: "https://russilica.bitrix24.ru/crm/deal/details/512/",
        companyBitrixUrl: null,
      }),
    });

    render(<DealPreview id="512" onClose={() => {}} />);
    await waitForElementToBeRemoved(() => screen.queryByText("Загрузка сделки"));

    expect(screen.getByRole("button", { name: /Экспорт/i })).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: /Открыть сделку в Bitrix24/i })
    ).toBeInTheDocument();
  });

  // ─────────────────────────────────────────────────────────────────────────
  // AUDITED REGRESSION TESTS
  // ─────────────────────────────────────────────────────────────────────────
  it("AUDIT REGRESSION 1: Category stage resolution isolates pipelines and handles prefixes", () => {
    const fields = [
      {
        id: "STAGE_ID",
        listValues: [
          { ID: "NEW", VALUE: "Новая (Основная)" },
          { ID: "C1:NEW", VALUE: "Новая (Воронка 1)" },
          { ID: "C1:10", VALUE: "Счет выставлен (Воронка 1)" },
          { ID: "C2:10", VALUE: "Тестирование (Воронка 2)" },
        ],
      },
    ];

    // Exact direct match on category stage
    expect(resolveDealStage("C1:NEW", fields)).toBe("Новая (Воронка 1)");
    expect(resolveDealStage("C1:10", fields)).toBe("Счет выставлен (Воронка 1)");
    expect(resolveDealStage("C2:10", fields)).toBe("Тестирование (Воронка 2)");

    // Input with category prefix falling back to base ID if category stage absent
    expect(resolveDealStage("C3:NEW", fields)).toBe("Новая (Основная)");

    // Unprefixed input matching category stage
    expect(resolveDealStage("10", fields)).toBe("Счет выставлен (Воронка 1)");
  });

  it("AUDIT REGRESSION 2: Multi-enum array falls back gracefully even when fields metadata is missing", () => {
    const deal = {
      ID: "515",
      TITLE: "Сделка 515",
      UF_CRM_1584464068013: ["105", "107"],
    };

    // Without fields metadata
    const model = buildDealPreviewModel(deal, {});
    const payStatusField = model.cardFields.find((f) => f.id === "UF_CRM_1584464068013");
    expect(payStatusField?.value).toBe("Выставлен счет, Ожидает подтверждения");
  });

  it("AUDIT REGRESSION 3: Excel report Row 3 metadata includes 'ID сделки' and deal ID", () => {
    const deal = {
      ID: "777",
      TITLE: "Продажа силикагеля",
    };
    const workbook = createDealExcelWorkbook({ deal });
    const sheet = workbook.getWorksheet("Отчёт по сделке");
    const row3Cell2 = String(sheet?.getRow(3).getCell(2).value || "");
    expect(row3Cell2).toContain("ID сделки: 777");
  });
});
