// src/lib/commercial-funnel/demo-data.ts
// ─────────────────────────────────────────────────────────────────────
// Realistic demo dataset for Commercial Funnel Release 1 when
// BITRIX_WEBHOOK_URL is unconfigured.
// Mirrors actual schema, field IDs, and edge cases.
// ─────────────────────────────────────────────────────────────────────

import { normalizeCompanies, normalizeDeals } from "./normalize";
import type { CommercialDataset } from "./types";

const RESPONSIBLE_USERS: Record<string, string> = {
  "1": "Иванов А.С.",
  "2": "Петрова М.В.",
  "3": "Сидоров К.Н.",
  "4": "Козлова Е.А.",
  "5": "Новиков Д.И.",
};

const COMPANY_NAMES = [
  "АО «ТехноПром»",
  "ООО «Инновации»",
  "ПАО «СтройИнвест»",
  "ООО «ДатаСервис»",
  "ИП Козлов",
  "ООО «МедФарм»",
  "АО «Ритейл Групп»",
  "ООО «ЭнергоПлюс»",
  "ПАО «ФинТех»",
  "ООО «ЛогистикПро»",
  "АО «АгроХим»",
  "ООО «КонсалтГрупп»",
  "ПАО «ТелеКом»",
  "ООО «АвтоМотив»",
  "АО «Девелопмент»",
  "ООО «РусСилика»",
  "ЗАО «НаноХим»",
  "ООО «ПолимерТрейд»",
  "ПАО «КерамикИнвест»",
  "ООО «СиликаПром»",
];

const INDUSTRIES = [
  "Химия промышленная",
  "Агросектор",
  "Керамика",
  "Нефтегаз",
  "Полимеры",
  "Строительство",
];

const DIRECTIONS = [
  "Агрохимия",
  "Бытовая химия",
  "Бурение скважин",
  "Лакокрасочные материалы",
  "Бетоны, Строительные составы",
];

const PRODUCTS = ["Гель", "Золь", "КСМГ/КСКГ", "НЖС"];
const REGIONS = ["Москва", "Санкт-Петербург", "Казань", "Екатеринбург", "Нижний Новгород"];

function dateDaysAgo(days: number): string {
  const d = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  return d.toISOString().slice(0, 10);
}

export function generateDemoCommercialDataset(): CommercialDataset {
  const rawCompanies: Array<Record<string, any>> = [];
  const rawDeals: Array<Record<string, any>> = [];

  let dealIdSeq = 1001;

  COMPANY_NAMES.forEach((name, idx) => {
    const compId = String(idx + 1);
    const respId = String((idx % 5) + 1);
    const dateCreate = dateDaysAgo((idx * 4) % 80 + 2);
    const industry = INDUSTRIES[idx % INDUSTRIES.length];
    const direction = [DIRECTIONS[idx % DIRECTIONS.length]];
    const product = [PRODUCTS[idx % PRODUCTS.length]];
    const region = REGIONS[idx % REGIONS.length];

    // Company sample configuration
    let companySampleEnum: string[] = [];
    let companySampleDates: string[] = [];
    let testResult: string | undefined = undefined;

    if (idx % 6 === 0) {
      companySampleEnum = ["263"]; // Требуются образцы
    } else if (idx % 6 === 1) {
      companySampleEnum = ["261"]; // Образцы отправлены
      companySampleDates = [dateDaysAgo(25)];
    } else if (idx % 6 === 2) {
      companySampleEnum = ["2695"]; // Подошли
      companySampleDates = [dateDaysAgo(40)];
      testResult = "Положительный, дисперсность соответствует ТУ";
    } else if (idx % 6 === 3) {
      companySampleEnum = ["269"]; // Не подошли
      companySampleDates = [dateDaysAgo(35)];
      testResult = "Отрицательный, не устроила вязкость";
    } else if (idx % 6 === 4) {
      companySampleEnum = ["271"]; // Требуется доработка
      companySampleDates = [dateDaysAgo(20)];
      testResult = "Требуется корректировка pH";
    } else {
      companySampleEnum = ["265"]; // Unclassified enum
      companySampleDates = [dateDaysAgo(15)];
    }

    rawCompanies.push({
      ID: compId,
      TITLE: name,
      ASSIGNED_BY_ID: respId,
      DATE_CREATE: dateCreate,
      INDUSTRY: industry,
      UF_CRM_69259C45D3399: direction,
      UF_CRM_69257BBAB86F6: product,
      UF_CRM_69259C45EC14B: region,
      UF_CRM_1753187313314: companySampleEnum,
      UF_CRM_1764156557536: companySampleDates,
      UF_CRM_1783429999269: companySampleDates[0] || "",
      UF_CRM_1764155817232: ["КСМГ-5"],
      UF_CRM_1764155891815: ["СКСГ-2"],
      UF_CRM_1764156004815: "5.0",
      UF_CRM_1764156064272: "10.0",
      UF_CRM_1764156593: testResult,
    });

    // Generate 1 to 3 deals per company
    const dealCount = (idx % 3) + 1;
    for (let d = 0; d < dealCount; d++) {
      const dealId = String(dealIdSeq++);
      const dealCreate = dateDaysAgo((idx * 3 + d * 7) % 75 + 1);

      // Stagger sample states on deals to test deal precedence
      let dealSampleTransfer: string | undefined = undefined;
      let dealSampleSentDate: string | undefined = undefined;

      if (idx === 0 && d === 0) {
        // Bottleneck candidate: stalled testing > 14 days
        dealSampleTransfer = "DT1032_15:CLIENT"; // На испытании
        dealSampleSentDate = dateDaysAgo(22);
      } else if (idx === 1 && d === 0) {
        dealSampleTransfer = "DT1032_15:UC_ZARRMX"; // Образцы отправлены
        dealSampleSentDate = dateDaysAgo(10);
      } else if (idx === 2 && d === 0) {
        dealSampleTransfer = "DT1032_15:SUCCESS"; // Подошли
        dealSampleSentDate = dateDaysAgo(30);
      } else if (idx === 3 && d === 0) {
        dealSampleTransfer = "DT1032_15:FAIL"; // Не подошли
        dealSampleSentDate = dateDaysAgo(28);
      } else if (idx === 4 && d === 0) {
        dealSampleTransfer = "DT1032_15:NEW"; // Подготовка к отправке
      }

      // Payment states
      let paymentStatus = "103"; // Unpaid
      let paymentDate: string | undefined = undefined;
      let shipmentDate: string | undefined = undefined;
      let stageId = "EXECUTING";

      if (d === 0 && idx % 4 === 0) {
        // Paid deal in period
        paymentStatus = "113"; // Оплачен
        paymentDate = dateDaysAgo(8);
        shipmentDate = dateDaysAgo(5);
        stageId = "WON";
      } else if (d === 0 && idx % 4 === 1) {
        // Awaiting payment bottleneck (> 14 days)
        paymentStatus = "105"; // Выставлен счет
        stageId = "PREPAYMENT_INVOICE";
      } else if (d === 0 && idx % 4 === 2) {
        paymentStatus = "107"; // Ожидает подтверждения
        stageId = "PREPAYMENT_INVOICE";
      }

      const opp = (idx + 1) * 250_000 + (d + 1) * 100_000;

      rawDeals.push({
        ID: dealId,
        TITLE: `Сделка ${d + 1}: ${name}`,
        COMPANY_ID: compId,
        ASSIGNED_BY_ID: respId,
        STAGE_ID: stageId,
        CATEGORY_ID: "0",
        OPPORTUNITY: String(opp),
        CURRENCY_ID: "RUB",
        DATE_CREATE: dealCreate,
        BEGINDATE: dateDaysAgo(45),
        CLOSEDATE: stageId === "WON" ? dateDaysAgo(3) : "",
        UF_CRM_1779386185: dealSampleTransfer,
        UF_CRM_1774879952785: dealSampleSentDate,
        UF_CRM_1774880017: "Требуется образец партии для испытаний клиента",
        UF_CRM_1779384164284: "КСМГ-5, 5 кг",
        UF_CRM_1584464068013: paymentStatus,
        UF_CRM_1584460062014: paymentDate,
        UF_CRM_1584459666824: shipmentDate,
        UF_CRM_69257BBACD471: product,
        UF_CRM_6915D8C2C31D0: [industry],
        UF_CRM_6915D8C328208: direction,
        UF_CRM_69259C45EC14B: region,
        ACTIVITY_NEXT: idx % 3 === 0 ? undefined : "Согласовать условия поставки с директором",
        ACTIVITY_LAST: "Отправлено коммерческое предложение",
      });
    }
  });

  const deals = normalizeDeals(rawDeals, { userNames: RESPONSIBLE_USERS });
  const companies = normalizeCompanies(rawCompanies, deals, { userNames: RESPONSIBLE_USERS });

  return {
    companies,
    deals,
    userNames: RESPONSIBLE_USERS,
    statusLabels: {},
  };
}
