import { afterEach, describe, expect, it, vi } from "vitest";
import { createCompanyExcelWorkbook } from "@/lib/export-utils";

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("createCompanyExcelWorkbook", () => {
  it("creates a branded Account Report with logo, corporate header, sections, marker, Smart Process cycles and deals", () => {
    const fixedDate = new Date("2026-09-10T12:00:00Z");
    const workbook = createCompanyExcelWorkbook({
      companyTitle: "ООО РусСилика",
      companyId: "123",
      companyFields: [
        { label: "Ответственный компании", value: "Иван Иванов" },
        { label: "Телефон", value: "+7 999 123-45-67" },
      ],
      companyModel: {
        fields: [
          { id: "ASSIGNED_BY_ID", label: "Ответственный", value: "Иван Иванов", type: "user" },
          { id: "DATE_CREATE", label: "Дата создания", value: "10.01.2025", type: "date" },
          { id: "DATE_MODIFY", label: "Дата изменения", value: "01.07.2026", type: "date" },
        ],
      },
      testingMarkerField: { label: "Тестирование образцов", value: "Да" },
      smartProcess: {
        activeCount: 1,
        completedCount: 0,
        items: [
          {
            processItemId: "551",
            title: "Тестирование образца",
            stageLabel: "Испытания",
            linkedDealId: "999",
            sentDates: ["15.06.2026"],
            grades: [{ productFamily: "Гель", value: "Гель-1" }],
            quantities: [{ productFamily: "Гель", value: 50 }],
            rawTestResult: "Успешно пройдены",
            normalizedResult: "SUCCESS",
            responsibleId: "7",
            dataIssues: [],
          },
        ],
      },
      dealTitleById: new Map([["999", "Поставка партии кремния"]]),
      userNames: { "7": "Иван Иванов" },
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
      for (let c = 1; c <= 12; c++) {
        const val = row.getCell(c).value;
        if (typeof val === "string") rowsValues.push(val);
      }
    });

    expect(rowsValues).toContain("Информация о компании");
    expect(rowsValues).toContain("Информация об образцах");
    expect(rowsValues).toContain("Тестирование образцов");
    expect(rowsValues).toContain("Связанные сделки (1)");
    expect(rowsValues).toContain("Системная информация");

    // Check the Smart Process cycle table (12-column contract).
    expect(rowsValues).toContain("ID процесса");
    expect(rowsValues).toContain("Количество ГЕЛЬ, кг");
    expect(rowsValues).toContain("Количество ЗОЛЬ, л");
    expect(rowsValues).toContain("Качество данных / предупреждение");
    expect(rowsValues).toContain("551");
    expect(rowsValues).toContain("Поставка партии кремния (ID 999)");
    expect(rowsValues).toContain("Активных процессов");
    expect(rowsValues).toContain("Завершённых процессов");

    // Check footer exists
    expect(worksheet?.headerFooter.oddFooter).toContain("RusSilica BI Terminal");
  });

  it("handles empty deals and empty Smart Process data gracefully", () => {
    const workbook = createCompanyExcelWorkbook({
      companyTitle: "Пустая компания",
      companyId: "456",
      companyFields: [],
      deals: [],
      smartProcess: {
        activeCount: 0,
        completedCount: 0,
        items: [],
      },
    });

    const worksheet = workbook.getWorksheet("Отчёт по компании");
    expect(worksheet).toBeDefined();

    let foundEmptyDealsMessage = false;
    let foundEmptyCyclesMessage = false;
    worksheet?.eachRow((row) => {
      for (let c = 1; c <= 12; c++) {
        const v = row.getCell(c).value;
        if (v === "Нет связанных сделок") foundEmptyDealsMessage = true;
        if (v === "Циклы тестирования не найдены") foundEmptyCyclesMessage = true;
      }
    });

    expect(foundEmptyDealsMessage).toBe(true);
    expect(foundEmptyCyclesMessage).toBe(true);
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
      COMPANY_SAMPLES_DATE_MULTI_FIELD_ID,
      COMPANY_SAMPLES_DATE_SINGLE_FIELD_ID,
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
        { label: "Дата следующего контакта", value: "", type: "date" },
        { label: "Комментарий", value: null, type: "string" },
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

    expect(cellMap.get("Дата образцов (сингл заполнена)")).toBeInstanceOf(Date);
    expect(numFmtMap.get("Дата образцов (сингл заполнена)")).toBe(NUMFMT.DATE);

    // 2. Empty dates (null or "") must be genuinely null in Excel cell
    expect(cellMap.get("Дата изменения")).toBeNull();
    expect(cellMap.get("Дата следующего контакта")).toBeNull();
    expect(cellMap.get("Дата образцов (мульти)")).toBeNull();
    expect(cellMap.get("Дата образцов (сингл пустая)")).toBeNull();

    // 3. Ordinary empty text fields may remain "—"
    expect(cellMap.get("Комментарий")).toBe("—");

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
    expect(reloadedMap.get("Дата образцов (мульти)")).toBeNull();
    expect(reloadedMap.get("Дата образцов (сингл пустая)")).toBeNull();
    expect(reloadedMap.get("Дата образцов (сингл заполнена)")).toBeInstanceOf(Date);
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

describe("Company Excel Formula-Injection Security & Binary Round-Trip Regression", () => {
  it("sanitizes formula-injection characters (=, +, -, @) across all sections and proves non-formula binary round-trip", async () => {
    const ExcelJS = (await import("exceljs")).default;
    const fixedDate = new Date("2026-09-10T12:00:00Z");

    const workbook = createCompanyExcelWorkbook({
      companyTitle: "=2+2 Вредоносная Компания",
      companyId: "+12345",
      companyFields: [
        { label: "Комментарий", value: "=2+2" },
        { label: "Телефон", value: "+SUM(A1:A2)" },
        { label: "Email", value: "-1+1" },
        { label: "Дополнительно", value: "@SUM(A1:A2)" },
        { label: "Дата создания", value: "10.01.2025" }, // Native date invariant
      ],
      testingMarkerField: { label: "Тестирование образцов", value: "=2+2" },
      smartProcess: {
        activeCount: 0,
        completedCount: 0,
        items: [
          {
            processItemId: "proc-1",
            title: "=2+2",
            stageLabel: "+SUM(A1:A2)",
            linkedDealId: "deal-1",
            sentDates: [],
            grades: [{ productFamily: "Гель", value: "=2+2" }],
            quantities: [{ productFamily: "Гель", value: "+SUM(A1:A2)" }],
            rawTestResult: "-1+1",
            normalizedResult: "UNKNOWN",
            responsibleId: "@bad",
            dataIssues: [],
          },
        ],
      },
      userNames: {},
      deals: [
        {
          id: "deal-1",
          title: "=2+2",
          stage: "@SUM(A1:A2)",
          opportunity: 500000, // Native number invariant
          currency: "RUB",
        },
        {
          id: "deal-2",
          title: "+SUM(A1:A2)",
          stage: "WON", // Enum stage -> translates safely to Russian
          opportunity: 150000,
          currency: "RUB",
        },
        {
          id: "deal-3",
          title: "-1+1",
          stage: "=2+2",
          opportunity: 250000,
          currency: "USD",
        },
        {
          id: "deal-4",
          title: "@SUM(A1:A2)",
          stage: "-1+1",
          opportunity: 350000,
          currency: "EUR",
        },
      ],
      currentDate: fixedDate,
    });

    const worksheet = workbook.getWorksheet("Отчёт по компании");
    expect(worksheet).toBeDefined();

    // ─── 1. In-Memory Pre-Serialization Verification ───
    // Account Header Title (Row 2, Col 2)
    const titleCell = worksheet!.getCell("B2");
    expect(String(titleCell.value)).toBe("'=2+2 Вредоносная Компания");

    // Section 1 & Section 2 map
    const preMap = new Map<string, any>();
    worksheet!.eachRow((row) => {
      if (row.getCell(1).isMerged) return;
      const label = String(row.getCell(1).value || "");
      const val = row.getCell(2).value;
      if (label) preMap.set(label, val);
    });

    // A. Информация о компании
    expect(preMap.get("Комментарий")).toBe("'=2+2");
    expect(preMap.get("Телефон")).toBe("'+SUM(A1:A2)");
    expect(preMap.get("Эл. почта")).toBe("'-1+1");
    expect(preMap.get("Дополнительно")).toBe("'@SUM(A1:A2)");
    expect(preMap.get("Дата создания")).toBeInstanceOf(Date);

    // B. Информация об образцах (marker) + Smart Process cycle table
    expect(preMap.get("Тестирование образцов")).toBe("'=2+2");

    // SP cycle row (one physical process): find by its process ID column.
    const spRows: Array<{ cells: any[]; types: number[] }> = [];
    worksheet!.eachRow((row) => {
      const c1 = String(row.getCell(1).value || "");
      if (c1 === "proc-1") {
        const cells: any[] = [];
        const types: number[] = [];
        for (let c = 1; c <= 12; c++) {
          cells.push(row.getCell(c).value);
          types.push(row.getCell(c).type);
        }
        spRows.push({ cells, types });
      }
    });
    expect(spRows).toHaveLength(1);
    const sp = spRows[0]!;
    // stage label (col 3) sanitized
    expect(sp.cells[2]).toBe("'+SUM(A1:A2)");
    expect(sp.types[2]).not.toBe(ExcelJS.ValueType.Formula);
    // relation (col 4): title + retained ID
    expect(String(sp.cells[3])).toContain("deal-1");
    // quantity (col 7) sanitized string, not formula
    expect(sp.cells[6]).toBe("'+SUM(A1:A2)");
    expect(sp.types[6]).not.toBe(ExcelJS.ValueType.Formula);
    // result (col 10)
    expect(sp.cells[9]).toBe("'-1+1");
    expect(sp.types[9]).not.toBe(ExcelJS.ValueType.Formula);
    // responsible (col 11): never a raw user ID as a label
    expect(String(sp.cells[10])).not.toBe("@bad");

    // ─── 2. Full Binary XLSX Serialization Round-Trip ───
    const buffer = await workbook.xlsx.writeBuffer();
    expect(buffer).toBeDefined();
    expect(buffer.byteLength).toBeGreaterThan(0);

    const reloaded = new ExcelJS.Workbook();
    await reloaded.xlsx.load(buffer as any);
    const reloadedSheet = reloaded.getWorksheet("Отчёт по компании")!;
    expect(reloadedSheet).toBeDefined();

    // Verify Title cell after reload: not Formula, is String, retains safe apostrophe prefix
    const reloadedTitle = reloadedSheet.getCell("B2");
    expect(reloadedTitle.type).not.toBe(ExcelJS.ValueType.Formula);
    expect(reloadedTitle.type).toBe(ExcelJS.ValueType.String);
    expect(reloadedTitle.value).toBe("'=2+2 Вредоносная Компания");

    const reloadedMap = new Map<string, { value: any; type: number }>();
    reloadedSheet.eachRow((row) => {
      if (row.getCell(1).isMerged) return;
      const label = String(row.getCell(1).value || "");
      const cell = row.getCell(2);
      if (label) reloadedMap.set(label, { value: cell.value, type: cell.type });
    });

    // A. Информация о компании verification after binary reload
    const c1 = reloadedMap.get("Комментарий")!;
    expect(c1.type).not.toBe(ExcelJS.ValueType.Formula);
    expect(c1.value).toBe("'=2+2");

    const c2 = reloadedMap.get("Телефон")!;
    expect(c2.type).not.toBe(ExcelJS.ValueType.Formula);
    expect(c2.value).toBe("'+SUM(A1:A2)");

    const c3 = reloadedMap.get("Эл. почта")!;
    expect(c3.type).not.toBe(ExcelJS.ValueType.Formula);
    expect(c3.value).toBe("'-1+1");

    const c4 = reloadedMap.get("Дополнительно")!;
    expect(c4.type).not.toBe(ExcelJS.ValueType.Formula);
    expect(c4.value).toBe("'@SUM(A1:A2)");

    // Invariant: Native date remains Date instance
    const cDate = reloadedMap.get("Дата создания")!;
    expect(cDate.type).toBe(ExcelJS.ValueType.Date);
    expect(cDate.value).toBeInstanceOf(Date);

    // B. Smart Process cycle row after binary reload — no formula cells
    let reloadedSpStage: any;
    let reloadedSpStageType: number | undefined;
    let reloadedSpQty: any;
    let reloadedSpQtyType: number | undefined;
    reloadedSheet.eachRow((row) => {
      if (String(row.getCell(1).value || "") === "proc-1") {
        reloadedSpStage = row.getCell(3).value;
        reloadedSpStageType = row.getCell(3).type;
        reloadedSpQty = row.getCell(7).value;
        reloadedSpQtyType = row.getCell(7).type;
      }
    });
    expect(reloadedSpStageType).not.toBe(ExcelJS.ValueType.Formula);
    expect(reloadedSpStage).toBe("'+SUM(A1:A2)");
    expect(reloadedSpQtyType).not.toBe(ExcelJS.ValueType.Formula);
    expect(reloadedSpQty).toBe("'+SUM(A1:A2)");

    // C. Связанные сделки — title & D. Связанные сделки — stage
    const dealRowsReloaded: Array<{
      id: string;
      title: any;
      titleType: number;
      stage: any;
      stageType: number;
      opportunity: any;
      oppType: number;
    }> = [];

    reloadedSheet.eachRow((row) => {
      const cell1 = String(row.getCell(1).value || "");
      if (cell1.startsWith("deal-")) {
        dealRowsReloaded.push({
          id: cell1,
          title: row.getCell(2).value,
          titleType: row.getCell(2).type,
          stage: row.getCell(3).value,
          stageType: row.getCell(3).type,
          opportunity: row.getCell(4).value,
          oppType: row.getCell(4).type,
        });
      }
    });

    expect(dealRowsReloaded).toHaveLength(4);

    const d1 = dealRowsReloaded.find((d) => d.id === "deal-1")!;
    expect(d1.titleType).not.toBe(ExcelJS.ValueType.Formula);
    expect(d1.title).toBe("'=2+2");
    expect(d1.stageType).not.toBe(ExcelJS.ValueType.Formula);
    expect(d1.stage).toBe("'@SUM(A1:A2)");
    // Invariant: Native number remains numeric
    expect(d1.oppType).toBe(ExcelJS.ValueType.Number);
    expect(d1.opportunity).toBe(500000);

    const d2 = dealRowsReloaded.find((d) => d.id === "deal-2")!;
    expect(d2.titleType).not.toBe(ExcelJS.ValueType.Formula);
    expect(d2.title).toBe("'+SUM(A1:A2)");
    expect(d2.stageType).not.toBe(ExcelJS.ValueType.Formula);
    expect(d2.stage).toBe("Успешно завершена"); // WON translated safely

    const d3 = dealRowsReloaded.find((d) => d.id === "deal-3")!;
    expect(d3.titleType).not.toBe(ExcelJS.ValueType.Formula);
    expect(d3.title).toBe("'-1+1");
    expect(d3.stageType).not.toBe(ExcelJS.ValueType.Formula);
    expect(d3.stage).toBe("'=2+2");

    const d4 = dealRowsReloaded.find((d) => d.id === "deal-4")!;
    expect(d4.titleType).not.toBe(ExcelJS.ValueType.Formula);
    expect(d4.title).toBe("'@SUM(A1:A2)");
    expect(d4.stageType).not.toBe(ExcelJS.ValueType.Formula);
    expect(d4.stage).toBe("'-1+1");
  });
});

describe("Company Excel — 12-column report layout contract (binary round-trip)", () => {
  const fixedDate = new Date("2026-09-10T12:00:00Z");

  async function buildWithSpTable() {
    const ExcelJS = (await import("exceljs")).default;
    const workbook = createCompanyExcelWorkbook({
      companyTitle: "Компания макет 12 колонок",
      companyId: "300",
      companyFields: [
        { id: "ASSIGNED_BY_ID", label: "Ответственный", value: "Анна Иванова", type: "user" },
      ],
      companyModel: {
        fields: [
          { id: "ASSIGNED_BY_ID", label: "Ответственный", value: "Анна Иванова", type: "user", rawValue: "7" },
          { id: "DATE_CREATE", label: "Дата создания", value: "10.01.2025", type: "date", rawValue: "2025-01-10T10:00:00Z" },
          { id: "DATE_MODIFY", label: "Дата изменения", value: "01.07.2026", type: "date", rawValue: "2026-07-01T11:59:00Z" },
        ],
      },
      testingMarkerField: { label: "Тестирование образцов", value: "Да" },
      smartProcess: {
        activeCount: 1,
        completedCount: 0,
        items: [
          {
            processItemId: "701",
            title: "Цикл с длинным названием для проверки переноса текста",
            stageLabel: "На испытании",
            linkedDealId: "900",
            sentDates: ["15.06.2026"],
            grades: [{ productFamily: "Гель", value: "КСМГ-9" }],
            quantities: [
              { productFamily: "Гель", value: 12.5, unit: "кг" },
              { productFamily: "Золь", value: 3, unit: "л" },
            ],
            rawTestResult: "Соответствует",
            normalizedResult: "positive",
            responsibleId: "7",
            dataIssues: [],
          },
        ],
      },
      dealTitleById: new Map([["900", "Сделка 900"]]),
      userNames: { "7": "Анна Иванова" },
      deals: [
        { id: "900", title: "Сделка 900", stage: "В работе", opportunity: 420000, currency: "RUB" },
      ],
      currentDate: fixedDate,
    });
    const buffer = await workbook.xlsx.writeBuffer();
    const reloaded = new ExcelJS.Workbook();
    await reloaded.xlsx.load(buffer as any);
    return { workbook, reloaded };
  }

  it("12 SP headers, intentional widths for columns 1–12, landscape orientation (binary reload)", async () => {
    const { reloaded } = await buildWithSpTable();
    const ws = reloaded.getWorksheet("Отчёт по компании")!;

    // 1. Exactly 12 SP table headers in order.
    const rows: string[][] = [];
    ws.eachRow((row) => {
      const cells: string[] = [];
      for (let c = 1; c <= 13; c++) {
        const v = row.getCell(c).value;
        cells.push(v === null || v === undefined ? "" : String(v));
      }
      rows.push(cells);
    });
    const headerIdx = rows.findIndex((cells) => cells[0] === "ID процесса");
    expect(headerIdx).toBeGreaterThan(0);
    expect(rows[headerIdx].slice(0, 12)).toEqual([
      "ID процесса", "Название", "Стадия", "Связанная сделка", "Дата отправки",
      "Марка ГЕЛЬ", "Количество ГЕЛЬ, кг", "Марка ЗОЛЬ", "Количество ЗОЛЬ, л",
      "Результат испытаний", "Ответственный", "Качество данных / предупреждение",
    ]);
    expect(rows[headerIdx][12]).toBe("");

    // 2. Columns 1–12 all have intentional widths (no default-width columns).
    for (let c = 1; c <= 12; c++) {
      const width = ws.getColumn(c).width;
      expect(typeof width).toBe("number");
      expect(width as number).toBeGreaterThanOrEqual(12);
    }

    // 3. Landscape print setup (12-column table cannot be portrait).
    expect(ws.pageSetup?.orientation).toBe("landscape");
    expect(ws.pageSetup?.fitToWidth).toBe(1);
  });

  it("report-width merges: account header, section headers and SP summary rows span the 12-column report width", async () => {
    const { reloaded } = await buildWithSpTable();
    const ws = reloaded.getWorksheet("Отчёт по компании")!;

    // Section header bars and summary/label rows merge across columns 1–12
    // (merge ranges cover the intended report width).
    const wideMerges: string[] = [];
    for (const range of Object.values(ws.model.merges ?? {})) {
      const m = String(range);
      const [, a, b] = m.match(/([A-Z]+\d+):([A-Z]+\d+)/) ?? [];
      if (!a || !b) continue;
      const colOf = (ref: string) => {
        const letters = ref.replace(/\d+/, "");
        let n = 0;
        for (const ch of letters) n = n * 26 + (ch.charCodeAt(0) - 64);
        return n;
      };
      if (colOf(a) === 1 && colOf(b) >= 12) wideMerges.push(m);
    }
    // Account header title row (A1:L1), section headers (Информация о компании,
    // Тестирование образцов, …) and the SP stale/empty rows must all be wide.
    expect(wideMerges.length).toBeGreaterThanOrEqual(5);
  });

  it("Gel/Sol quantity cells remain numeric after binary reload; company ID stays in the account header", async () => {
    const { reloaded } = await buildWithSpTable();
    const ws = reloaded.getWorksheet("Отчёт по компании")!;

    let gelQty: unknown;
    let solQty: unknown;
    ws.eachRow((row) => {
      if (String(row.getCell(1).value ?? "") === "701") {
        gelQty = row.getCell(7).value;
        solQty = row.getCell(9).value;
      }
    });
    expect(gelQty).toBe(12.5);
    expect(solQty).toBe(3);

    // Company ID lives in the account header (CRM ID), never as a business row.
    const metaCell = ws.getCell("B3");
    expect(String(metaCell.value ?? "")).toContain("CRM ID: 300");
    const labelValues: string[] = [];
    ws.eachRow((row) => {
      const v = row.getCell(1).value;
      if (typeof v === "string") labelValues.push(v);
    });
    expect(labelValues).not.toContain("ID компании");
  });
});
