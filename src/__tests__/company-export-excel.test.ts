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
