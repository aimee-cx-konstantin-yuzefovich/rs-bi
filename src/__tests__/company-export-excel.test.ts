import { afterEach, describe, expect, it, vi } from "vitest";
import { createCompanyExcelWorkbook } from "@/lib/export-utils";

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("createCompanyExcelWorkbook", () => {
  it("creates a branded Account Report with logo, corporate header, sections, samples, and deals", () => {
    const fixedDate = new Date("2026-09-10T12:00:00Z");
    const workbook = createCompanyExcelWorkbook({
      companyTitle: "ООО РусСилика",
      companyId: "123",
      companyFields: [
        { label: "Ответственный компании", value: "Иван Иванов" },
        { label: "Телефон", value: "+7 999 123-45-67" },
        { label: "Дата создания", value: "10.01.2025" },
        { label: "Дата изменения", value: "01.07.2026" },
      ],
      sampleFields: [
        { label: "Марка предоставленных образцов (ГЕЛЬ)", value: "Гель-1" },
        { label: "Кол-во переданного образца (ГЕЛЬ) кг", value: "50" },
        { label: "Марка предоставленных образцов (ЗОЛЬ)", value: "Золь-2" },
        { label: "Кол-во переданного образца (ЗОЛЬ) л", value: "30" },
        { label: "Дата передачи образцов", value: "15.06.2026" },
        { label: "Результат испытаний", value: "Успешно пройдены" },
        { label: "Комментарий", value: "Тестовая партия" },
      ],
      deals: [
        {
          id: "999",
          title: "Поставка партии кремния",
          stage: "В работе",
          opportunity: 500000,
          currency: "RUB",
        },
      ],
      currentDate: fixedDate,
    });

    const worksheet = workbook.getWorksheet("Отчёт по компании");
    expect(worksheet).toBeDefined();

    // Check branded corporate header
    const titleCell = worksheet?.getCell("B1");
    expect(titleCell?.value).toBe("ОТЧЁТ ПО КОМПАНИИ");

    const compCell = worksheet?.getCell("B2");
    expect(compCell?.value).toBe("ООО РусСилика");

    const metaCell = worksheet?.getCell("B3");
    expect(metaCell?.value).toContain("CRM ID: 123");
    expect(metaCell?.value).toContain("10.09.2026");

    // Check sections exist
    const rowsValues: string[] = [];
    worksheet?.eachRow((row) => {
      const val = row.getCell(1).value;
      if (typeof val === "string") {
        rowsValues.push(val);
      }
    });

    expect(rowsValues).toContain("Основная информация");
    expect(rowsValues).toContain("Образцы");
    expect(rowsValues).toContain("Связанные сделки (1)");

    // Check sample fields in column 1
    expect(rowsValues).toContain("Марка предоставленных образцов (ГЕЛЬ)");
    expect(rowsValues).toContain("Кол-во переданного образца (ГЕЛЬ) кг");
    expect(rowsValues).toContain("Марка предоставленных образцов (ЗОЛЬ)");
    expect(rowsValues).toContain("Кол-во переданного образца (ЗОЛЬ) л");
    expect(rowsValues).toContain("Дата передачи образцов");
    expect(rowsValues).toContain("Результат испытаний");
    expect(rowsValues).toContain("Комментарий");

    // Check footer exists
    expect(worksheet?.headerFooter.oddFooter).toContain("RusSilica BI Terminal");
  });

  it("handles empty deals and empty sample fields gracefully", () => {
    const workbook = createCompanyExcelWorkbook({
      companyTitle: "Пустая компания",
      companyId: "456",
      companyFields: [],
      sampleFields: [],
      deals: [],
    });

    const worksheet = workbook.getWorksheet("Отчёт по компании");
    expect(worksheet).toBeDefined();

    let foundEmptyDealsMessage = false;
    let foundEmptySamplesMessage = false;
    worksheet?.eachRow((row) => {
      if (row.getCell(1).value === "Нет связанных сделок") {
        foundEmptyDealsMessage = true;
      }
      if (row.getCell(1).value === "Нет данных по образцам") {
        foundEmptySamplesMessage = true;
      }
    });

    expect(foundEmptyDealsMessage).toBe(true);
    expect(foundEmptySamplesMessage).toBe(true);
  });

  it("handles special characters and newlines in company title", () => {
    const fixedDate = new Date("2026-09-10T12:00:00Z");
    const workbook = createCompanyExcelWorkbook({
      companyTitle: 'ООО "Рога & Копыта / РусСилика"\r\n(Филиал)\t',
      companyId: "789",
      companyFields: [],
      sampleFields: [],
      deals: [],
      currentDate: fixedDate,
    });

    const worksheet = workbook.getWorksheet("Отчёт по компании");
    const compCell = worksheet?.getCell("B2");
    expect(compCell?.value).toBe('ООО "Рога & Копыта / РусСилика" (Филиал)');
    expect(String(compCell?.value)).not.toContain("\r");
    expect(String(compCell?.value)).not.toContain("\n");
  });

  it("strictly writes native null for empty date fields while preserving '—' for empty text fields", async () => {
    const { NUMFMT } = await import("@/lib/excel-brand");
    const ExcelJS = (await import("exceljs")).default;

    const {
      COMPANY_SAMPLES_FIELD_ID,
      COMPANY_SAMPLES_DATE_MULTI_FIELD_ID,
      COMPANY_SAMPLES_DATE_SINGLE_FIELD_ID,
      DEAL_SAMPLE_SENT_DATE_FIELD_ID,
    } = await import("@/lib/crm-constants");

    const workbook = createCompanyExcelWorkbook({
      companyTitle: "Тест Дат",
      companyId: "555",
      companyFields: [
        { id: "DATE_CREATE", label: "Дата создания", value: "15.03.2026" },
        { id: "DATE_MODIFY", label: "Дата изменения", value: null },
        { id: COMPANY_SAMPLES_DATE_MULTI_FIELD_ID, label: "Дата образцов (мульти)", value: "" },
        { id: COMPANY_SAMPLES_DATE_SINGLE_FIELD_ID, label: "Дата образцов (сингл пустая)", value: "—" },
        { id: COMPANY_SAMPLES_DATE_SINGLE_FIELD_ID, label: "Дата образцов (сингл заполнена)", value: "20.03.2026" },
        { id: COMPANY_SAMPLES_FIELD_ID, label: "Образцы", value: "требуются образцы" },
        { id: COMPANY_SAMPLES_FIELD_ID, label: "Образцы множественные", value: "требуются образцы, образцы отправлены" },
        { label: "Дата следующего контакта", value: "", type: "date" },
        { label: "Комментарий", value: null, type: "string" },
      ],
      sampleFields: [
        { id: DEAL_SAMPLE_SENT_DATE_FIELD_ID, label: "Дата отправки сделки", value: undefined },
        { label: "Дата отправки образцов", value: "2026-04-10", type: "date" },
        { label: "Дата передачи образцов", value: null, type: "date" },
        { label: "Результат испытаний", value: "", type: "string" },
      ],
      deals: [],
    });

    const worksheet = workbook.getWorksheet("Отчёт по компании")!;
    expect(worksheet).toBeDefined();

    // Map rows to label and cell value
    const cellMap = new Map<string, any>();
    const numFmtMap = new Map<string, any>();

    worksheet.eachRow((row) => {
      if (row.getCell(1).isMerged) return;
      const label = String(row.getCell(1).value || "");
      const val = row.getCell(2).value;
      const fmt = row.getCell(2).numFmt;
      if (label) {
        cellMap.set(label, val);
        numFmtMap.set(label, fmt);
      }
    });

    // 1. Populated dates must be native Date instances with date numFmt
    expect(cellMap.get("Дата создания")).toBeInstanceOf(Date);
    expect(numFmtMap.get("Дата создания")).toBe(NUMFMT.DATE);

    expect(cellMap.get("Дата отправки образцов")).toBeInstanceOf(Date);
    expect(numFmtMap.get("Дата отправки образцов")).toBe(NUMFMT.DATE);

    expect(cellMap.get("Дата образцов (сингл заполнена)")).toBeInstanceOf(Date);
    expect(numFmtMap.get("Дата образцов (сингл заполнена)")).toBe(NUMFMT.DATE);

    // 2. Sample status fields (UF_CRM_1753187313314) must NOT be null and NOT Date — full text preserved
    expect(cellMap.get("Образцы")).toBe("требуются образцы");
    expect(cellMap.get("Образцы множественные")).toBe("требуются образцы, образцы отправлены");

    // 3. Empty dates (null or "") must be genuinely null in Excel cell
    expect(cellMap.get("Дата изменения")).toBeNull();
    expect(cellMap.get("Дата следующего контакта")).toBeNull();
    expect(cellMap.get("Дата передачи образцов")).toBeNull();
    expect(cellMap.get("Дата образцов (мульти)")).toBeNull();
    expect(cellMap.get("Дата образцов (сингл пустая)")).toBeNull();
    expect(cellMap.get("Дата отправки сделки")).toBeNull();

    // 4. Ordinary empty text fields may remain "—"
    expect(cellMap.get("Комментарий")).toBe("—");
    expect(cellMap.get("Результат испытаний")).toBe("—");

    // 5. Binary serialization round-trip: blank date remains blank/null, populated date remains Date, status remains text
    const buffer = await workbook.xlsx.writeBuffer();
    const reloaded = new ExcelJS.Workbook();
    await reloaded.xlsx.load(buffer as any);
    const reloadedSheet = reloaded.getWorksheet("Отчёт по компании")!;

    const reloadedMap = new Map<string, any>();
    reloadedSheet.eachRow((row) => {
      if (row.getCell(1).isMerged) return;
      const label = String(row.getCell(1).value || "");
      const val = row.getCell(2).value;
      if (label) reloadedMap.set(label, val);
    });

    expect(reloadedMap.get("Дата создания")).toBeInstanceOf(Date);
    expect(reloadedMap.get("Дата изменения")).toBeNull();
    expect(reloadedMap.get("Дата следующего контакта")).toBeNull();
    expect(reloadedMap.get("Дата передачи образцов")).toBeNull();
    expect(reloadedMap.get("Дата образцов (мульти)")).toBeNull();
    expect(reloadedMap.get("Дата образцов (сингл пустая)")).toBeNull();
    expect(reloadedMap.get("Дата образцов (сингл заполнена)")).toBeInstanceOf(Date);
    expect(reloadedMap.get("Образцы")).toBe("требуются образцы");
    expect(reloadedMap.get("Образцы множественные")).toBe("требуются образцы, образцы отправлены");
    expect(reloadedMap.get("Дата отправки сделки")).toBeNull();
    expect(reloadedMap.get("Комментарий")).toBe("—");
  });

  it("exports linked deals with truthful currency and never defaults missing currency to RUB", async () => {
    const ExcelJS = (await import("exceljs")).default;

    const workbook = createCompanyExcelWorkbook({
      companyTitle: "Компания с мультивалютными сделками",
      companyId: "777",
      companyFields: [],
      sampleFields: [],
      deals: [
        {
          id: "deal-no-currency",
          title: "Сделка без валюты",
          stage: "PREPARATION",
          opportunity: 100000,
          currency: undefined, // Missing currency
        },
        {
          id: "deal-rub",
          title: "Сделка в рублях",
          stage: "WON",
          opportunity: 200000,
          currency: "RUB",
        },
        {
          id: "deal-usd",
          title: "Сделка в долларах",
          stage: "EXECUTING",
          opportunity: 5000,
          currency: "USD",
        },
        {
          id: "deal-eur",
          title: "Сделка в евро",
          stage: "FINAL_INVOICE",
          opportunity: 3000,
          currency: "EUR",
        },
      ],
    });

    const worksheet = workbook.getWorksheet("Отчёт по компании")!;
    expect(worksheet).toBeDefined();

    // Find deal rows in Section 3
    const dealRows: Array<{
      id: string;
      title: string;
      opportunity: any;
      numFmt: string | undefined;
      currency: any;
    }> = [];

    worksheet.eachRow((row) => {
      const cell1 = String(row.getCell(1).value || "");
      if (cell1.startsWith("deal-")) {
        dealRows.push({
          id: cell1,
          title: String(row.getCell(2).value || ""),
          opportunity: row.getCell(4).value,
          numFmt: row.getCell(4).numFmt,
          currency: row.getCell(5).value,
        });
      }
    });

    expect(dealRows).toHaveLength(4);

    // 1. Missing currency deal: amount is numeric 100000, numFmt has NO ₽, $, €, currency cell is "—"
    const noCurDeal = dealRows.find((d) => d.id === "deal-no-currency")!;
    expect(noCurDeal.opportunity).toBe(100000);
    expect(typeof noCurDeal.opportunity).toBe("number");
    expect(noCurDeal.numFmt).toBe("#,##0");
    expect(noCurDeal.numFmt).not.toContain("₽");
    expect(noCurDeal.numFmt).not.toContain("$");
    expect(noCurDeal.numFmt).not.toContain("€");
    expect(noCurDeal.currency).toBe("—");

    // 2. RUB deal: numFmt has ₽, currency cell has ₽
    const rubDeal = dealRows.find((d) => d.id === "deal-rub")!;
    expect(rubDeal.opportunity).toBe(200000);
    expect(rubDeal.numFmt).toContain("₽");
    expect(rubDeal.currency).toBe("₽");

    // 3. USD deal: numFmt has $, currency cell has $
    const usdDeal = dealRows.find((d) => d.id === "deal-usd")!;
    expect(usdDeal.opportunity).toBe(5000);
    expect(usdDeal.numFmt).toContain("$");
    expect(usdDeal.currency).toBe("$");

    // 4. EUR deal: numFmt has €, currency cell has €
    const eurDeal = dealRows.find((d) => d.id === "deal-eur")!;
    expect(eurDeal.opportunity).toBe(3000);
    expect(eurDeal.numFmt).toContain("€");
    expect(eurDeal.currency).toBe("€");

    // 5. Binary round-trip verification
    const buffer = await workbook.xlsx.writeBuffer();
    const reloaded = new ExcelJS.Workbook();
    await reloaded.xlsx.load(buffer as any);
    const reloadedSheet = reloaded.getWorksheet("Отчёт по компании")!;

    let reloadedNoCurOpportunity: any;
    let reloadedNoCurFmt: any;
    let reloadedNoCurCurrency: any;

    reloadedSheet.eachRow((row) => {
      if (String(row.getCell(1).value || "") === "deal-no-currency") {
        reloadedNoCurOpportunity = row.getCell(4).value;
        reloadedNoCurFmt = row.getCell(4).numFmt;
        reloadedNoCurCurrency = row.getCell(5).value;
      }
    });

    expect(reloadedNoCurOpportunity).toBe(100000);
    expect(reloadedNoCurFmt).toBe("#,##0");
    expect(reloadedNoCurFmt).not.toContain("₽");
    expect(reloadedNoCurCurrency).toBe("—");
  });
});

describe("exportCompanyToExcel (browser download)", () => {
  it("sanitizes filename when company title has forbidden chars, slashes and control characters", async () => {
    const { exportCompanyToExcel } = await import("@/lib/export-utils");

    let downloadedFilename = "";
    const mockClick = vi.fn();
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (this: HTMLAnchorElement) {
      downloadedFilename = this.download;
      mockClick();
    });

    vi.stubGlobal("URL", {
      createObjectURL: vi.fn(() => "blob:mock"),
      revokeObjectURL: vi.fn(),
    });

    const fixedDate = new Date("2026-09-10T12:00:00Z");

    await exportCompanyToExcel({
      companyTitle: 'ООО "ХимПром/Восток*?\\:<>|"\r\n\t',
      companyId: "100",
      companyFields: [],
      sampleFields: [],
      currentDate: fixedDate,
    });

    expect(mockClick).toHaveBeenCalled();
    expect(downloadedFilename).toBe("РусСилика_Компания_ООО _ХимПром_Восток_2026-09-10.xlsx");
    expect(downloadedFilename).not.toMatch(/[\\/:*?"<>|\r\n\t]/);
  });

  it("falls back to clean default filename if company title is completely stripped or empty", async () => {
    const { exportCompanyToExcel } = await import("@/lib/export-utils");

    let downloadedFilename = "";
    const mockClick = vi.fn();
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (this: HTMLAnchorElement) {
      downloadedFilename = this.download;
      mockClick();
    });

    const fixedDate = new Date("2026-09-10T12:00:00Z");

    await exportCompanyToExcel({
      companyTitle: "   ///:::***???   ",
      companyId: "101",
      companyFields: [],
      sampleFields: [],
      currentDate: fixedDate,
    });

    expect(mockClick).toHaveBeenCalled();
    expect(downloadedFilename).toBe("РусСилика_Компания_2026-09-10.xlsx");
  });
});
