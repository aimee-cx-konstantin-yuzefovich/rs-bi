import type { FieldInfo } from "@/store/dashboard-store";

/**
 * Demo data based on real Bitrix24 CRM deal fields schema.
 * These fields match the actual custom fields from the user's Bitrix24 instance.
 */

export const DEMO_FIELDS: FieldInfo[] = [
  // Standard informative fields
  { id: "TITLE", title: "Название", type: "string", isMultiple: false, isSortable: true },
  { id: "TYPE_ID", title: "Тип", type: "crm_status", isMultiple: false, isSortable: true },
  { id: "CATEGORY_ID", title: "Воронка", type: "crm_category", isMultiple: false, isSortable: true },
  { id: "STAGE_ID", title: "Стадия сделки", type: "crm_status", isMultiple: false, isSortable: true, listValues: [
    { ID: "NEW", VALUE: "Новая" },
    { ID: "PREPARATION", VALUE: "Подготовка" },
    { ID: "PREPAYMENT_INVOICE", VALUE: "Счёт выставлен" },
    { ID: "EXECUTING", VALUE: "В работе" },
    { ID: "WON", VALUE: "Сделка успешна" },
    { ID: "LOSE", VALUE: "Сделка провалена" },
  ]},
  { id: "CURRENCY_ID", title: "Валюта", type: "crm_currency", isMultiple: false, isSortable: true },
  { id: "OPPORTUNITY", title: "Сумма", type: "double", isMultiple: false, isSortable: true },
  { id: "TAX_VALUE", title: "Ставка налога", type: "double", isMultiple: false, isSortable: true },
  { id: "BEGINDATE", title: "Дата начала", type: "date", isMultiple: false, isSortable: true },
  { id: "CLOSEDATE", title: "Дата завершения", type: "date", isMultiple: false, isSortable: true },
  { id: "COMMENTS", title: "Комментарий", type: "string", isMultiple: false, isSortable: true },
  { id: "SOURCE_ID", title: "Источник", type: "crm_status", isMultiple: false, isSortable: true },
  { id: "DATE_CREATE", title: "Дата создания", type: "datetime", isMultiple: false, isSortable: true },
  { id: "DATE_MODIFY", title: "Дата изменения", type: "datetime", isMultiple: false, isSortable: true },

  // Custom fields from real Bitrix24 CRM
  { id: "UF_CRM_1584459653509", title: "Склад отгрузки", type: "enumeration", isMultiple: false, isSortable: true, listValues: [
    { ID: "87", VALUE: "Склад №1" },
    { ID: "89", VALUE: "Склад №2" },
  ]},
  { id: "UF_CRM_1584459666824", title: "Дата отгрузки", type: "date", isMultiple: false, isSortable: true },
  { id: "UF_CRM_1584459858509", title: "Тип доставки", type: "enumeration", isMultiple: false, isSortable: true, listValues: [
    { ID: "91", VALUE: "Самовывоз" },
    { ID: "93", VALUE: "Доставка курьерской службой" },
    { ID: "95", VALUE: "Доставка логистической системой компании" },
  ]},
  { id: "UF_CRM_1584460062014", title: "Дата оплаты", type: "date", isMultiple: false, isSortable: true },
  { id: "UF_CRM_1584463812262", title: "Стоимость доставки", type: "money", isMultiple: false, isSortable: true },
  { id: "UF_CRM_1584464068013", title: "Статус оплаты", type: "enumeration", isMultiple: false, isSortable: true, listValues: [
    { ID: "103", VALUE: "Не оплачен" },
    { ID: "105", VALUE: "Выставлен счет" },
    { ID: "107", VALUE: "Ожидает подтверждения" },
    { ID: "109", VALUE: "Платеж проведен" },
    { ID: "111", VALUE: "Ошибка" },
    { ID: "113", VALUE: "Оплачен" },
    { ID: "115", VALUE: "Возвращен" },
  ]},
  { id: "UF_CRM_1585653172826", title: "Дата и время доставки", type: "datetime", isMultiple: false, isSortable: true },
  { id: "UF_CRM_1586467706342", title: "Комментарий клиента к заказу", type: "string", isMultiple: false, isSortable: true },
  { id: "UF_CRM_1586468182934", title: "Оптовая скидка %", type: "double", isMultiple: false, isSortable: true },
  { id: "UF_CRM_DEAL_3861467182211", title: "Номер 1С", type: "string", isMultiple: false, isSortable: true },
  { id: "UF_CRM_DEAL_3861467182227", title: "Организация", type: "enumeration", isMultiple: false, isSortable: true, listValues: [
    { ID: "225", VALUE: 'ООО "РусСилика"' },
    { ID: "227", VALUE: "Управленческая организация" },
  ]},
  { id: "UF_CRM_6915D8C25162A", title: "Номер карты лояльности", type: "string", isMultiple: false, isSortable: true },
  { id: "UF_CRM_6915D8C2688B8", title: "Способ оплаты", type: "enumeration", isMultiple: false, isSortable: true, listValues: [
    { ID: "951", VALUE: "Картой курьеру" },
    { ID: "953", VALUE: "Наличными" },
    { ID: "955", VALUE: "Оплата по счету" },
  ]},
  { id: "UF_CRM_6915D8C2C31D0", title: "Отрасль", type: "enumeration", isMultiple: true, isSortable: true, listValues: [
    { ID: "961", VALUE: "Агросектор" },
    { ID: "963", VALUE: "Волокнистые материалы" },
    { ID: "965", VALUE: "Катализаторы" },
    { ID: "967", VALUE: "Керамика" },
    { ID: "969", VALUE: "Клеи" },
    { ID: "971", VALUE: "Косметика" },
    { ID: "973", VALUE: "ЛКМ" },
    { ID: "975", VALUE: "Металлургическая промышленность" },
    { ID: "977", VALUE: "Микроэлектроника" },
    { ID: "979", VALUE: "Модельное литье" },
    { ID: "981", VALUE: "Нефтегаз" },
    { ID: "983", VALUE: "НИР" },
    { ID: "985", VALUE: "Огнеупоры" },
    { ID: "987", VALUE: "Пищевая отрасль" },
    { ID: "991", VALUE: "Полимеры" },
    { ID: "993", VALUE: "РТИ" },
    { ID: "997", VALUE: "Фармацевтическая промышленность" },
    { ID: "999", VALUE: "Химия промышленная" },
    { ID: "1001", VALUE: "ЦБП" },
    { ID: "1003", VALUE: "Электроды" },
  ]},
  { id: "UF_CRM_6915D8C328208", title: "Направление", type: "enumeration", isMultiple: true, isSortable: true, listValues: [
    { ID: "1007", VALUE: "Агрохимия" },
    { ID: "1059", VALUE: "Аккумуляторы/электролиты" },
    { ID: "1065", VALUE: "Бетоны, Строительные составы" },
    { ID: "1017", VALUE: "Бытовая химия" },
    { ID: "1023", VALUE: "Водные составы" },
    { ID: "1035", VALUE: "Бурение скважин" },
    { ID: "1019", VALUE: "Декоративная косметика" },
    { ID: "1693", VALUE: "Дистрибьютор" },
    { ID: "1073", VALUE: "Другое" },
    { ID: "1013", VALUE: "Затирки Водная основа" },
    { ID: "1015", VALUE: "Затирки Органика" },
    { ID: "1021", VALUE: "Зубные пасты" },
    { ID: "1697", VALUE: "Катализаторы" },
    { ID: "1061", VALUE: "Кислотоупоры" },
    { ID: "1009", VALUE: "Корма" },
    { ID: "1699", VALUE: "Краски" },
    { ID: "1701", VALUE: "Лак" },
    { ID: "1037", VALUE: "Нефтехимия" },
    { ID: "1039", VALUE: "НИОКР" },
    { ID: "1025", VALUE: "Органические составы" },
    { ID: "1027", VALUE: "Пигменты" },
    { ID: "1047", VALUE: "Пленка Производство" },
    { ID: "1029", VALUE: "Полиграфические краски" },
    { ID: "1063", VALUE: "Реагенты для промышленности" },
    { ID: "1791", VALUE: "РТИ" },
    { ID: "1053", VALUE: "Силиконы" },
    { ID: "1049", VALUE: "Смолы" },
    { ID: "1043", VALUE: "Соки/Вино" },
    { ID: "1051", VALUE: "Спецсоставы" },
    { ID: "1057", VALUE: "Спецтекстиль" },
    { ID: "1067", VALUE: "Текстиль" },
    { ID: "1011", VALUE: "Цеолиты" },
    { ID: "1055", VALUE: "Шины/Резина" },
    { ID: "2393", VALUE: "Электроды" },
  ]},
  { id: "UF_CRM_1763541960", title: "Комментарий к доставке", type: "string", isMultiple: false, isSortable: true },
  { id: "UF_CRM_1763542027", title: "Адрес доставки", type: "address", isMultiple: false, isSortable: false },
  { id: "UF_CRM_1763542249", title: "Тип оплаты", type: "enumeration", isMultiple: false, isSortable: true, listValues: [
    { ID: "1081", VALUE: "100% предоплата" },
    { ID: "1083", VALUE: "Аванс" },
    { ID: "1085", VALUE: "Постоплата" },
  ]},
  { id: "UF_CRM_1763546892", title: "Причина закрытия (Продажа)", type: "string", isMultiple: false, isSortable: true },
  { id: "UF_CRM_1763546915", title: "Причина закрытия (Разработка продукта)", type: "string", isMultiple: false, isSortable: true },
  { id: "UF_CRM_69257337C8C0D", title: "Откуда узнал о компании", type: "string", isMultiple: false, isSortable: true },
  { id: "UF_CRM_69257337D66F5", title: "Предпочтительный способ доставки", type: "enumeration", isMultiple: false, isSortable: true, listValues: [
    { ID: "1583", VALUE: "Курьером" },
    { ID: "1585", VALUE: "Самовывоз" },
  ]},
  { id: "UF_CRM_69257337E7E9B", title: "Причина закрытия Лида", type: "string", isMultiple: false, isSortable: true },
  { id: "UF_CRM_692573380C4F0", title: "Импорт базы", type: "enumeration", isMultiple: false, isSortable: true, listValues: [
    { ID: "1587", VALUE: "Импорт Астафьев Rento" },
    { ID: "2227", VALUE: "Импорт Н. Чавыкина Rento" },
    { ID: "2229", VALUE: "Импорт М. Ежкова Rento" },
  ]},
  { id: "UF_CRM_6925733827A0F", title: "Область применения", type: "string", isMultiple: false, isSortable: true },
  { id: "UF_CRM_69257BBACD471", title: "Тип продукта", type: "enumeration", isMultiple: true, isSortable: true, listValues: [
    { ID: "1613", VALUE: "Гель" },
    { ID: "1855", VALUE: "Гель/Золь" },
    { ID: "1615", VALUE: "Золь" },
    { ID: "1847", VALUE: "Золь/НЖС" },
    { ID: "1825", VALUE: "КСМГ/КСКГ" },
    { ID: "1617", VALUE: "НЖС" },
    { ID: "1827", VALUE: "Силикат кальция" },
    { ID: "1829", VALUE: "Сульфонат натрия" },
    { ID: "1831", VALUE: "другие продукты" },
  ]},
  { id: "UF_CRM_69259C45EC14B", title: "Регион", type: "string", isMultiple: false, isSortable: true },
  { id: "UF_CRM_1766405164", title: "ИНН", type: "string", isMultiple: false, isSortable: true },
  { id: "UF_CRM_1774878835644", title: "Сумма счетов (из 1С)", type: "double", isMultiple: false, isSortable: true },
  { id: "UF_CRM_1774878993375", title: "Количество счетов (из 1С)", type: "double", isMultiple: false, isSortable: true },
  { id: "UF_CRM_1774879911841", title: "Плановый объем потребления (тонн)", type: "double", isMultiple: false, isSortable: true },
  { id: "UF_CRM_1774879952785", title: "Дата отправки образцов", type: "date", isMultiple: false, isSortable: true },
  { id: "UF_CRM_1774880017", title: "Детали для Технолога (ТВЛ)", type: "string", isMultiple: false, isSortable: true },
  { id: "UF_CRM_1774880111684", title: "R&D", type: "boolean", isMultiple: false, isSortable: true },
  { id: "UF_CRM_1774880251970", title: "Причина отказа/брака", type: "enumeration", isMultiple: false, isSortable: true, listValues: [
    { ID: "2657", VALUE: "Не пройден по дисперсности / физико-химии" },
    { ID: "2659", VALUE: "Не устроила цена" },
    { ID: "2661", VALUE: "Проблемы с логистикой" },
    { ID: "2663", VALUE: "Не смогли вытеснить текущего поставщика" },
    { ID: "2665", VALUE: "Проект у клиента заморожен" },
  ]},
];

// Demo data generators using real field IDs
const STAGES = ["NEW", "PREPARATION", "PREPAYMENT_INVOICE", "EXECUTING", "WON", "LOSE"];
const SKLADS = ["87", "89"];
const DELIVERY_TYPES = ["91", "93", "95"];
const PAYMENT_STATUSES = ["103", "105", "107", "109", "111", "113", "115"];
const ORGS = ["225", "227"];
const PAYMENT_METHODS = ["951", "953", "955"];
const OTDELS = ["961", "963", "965", "967", "969", "971", "973", "975", "977", "981", "985", "987", "991", "993", "997", "999", "1001", "1003"];
const NAPRAVLENIA = ["1007", "1059", "1065", "1017", "1023", "1035", "1073", "1013", "1025", "1027", "1049", "1043", "1051", "1053", "1057", "1067", "1055", "2393"];
const PAYMENT_TYPES = ["1081", "1083", "1085"];
const DELIVERY_PREFS = ["1583", "1585"];
const IMPORT_BASES = ["1587", "2227", "2229"];
const PRODUCT_TYPES = ["1613", "1615", "1617", "1825", "1827", "1829", "1831"];
const REFUSAL_REASONS = ["2657", "2659", "2661", "2663", "2665"];

const RESPONSIBLE_PERSONS = [
  { ID: "1", NAME: "Иванов А.С." },
  { ID: "2", NAME: "Петрова М.В." },
  { ID: "3", NAME: "Сидоров К.Н." },
  { ID: "4", NAME: "Козлова Е.А." },
  { ID: "5", NAME: "Новиков Д.И." },
];

export { RESPONSIBLE_PERSONS };

const COMPANIES = [
  "АО «ТехноПром»", "ООО «Инновации»", "ПАО «СтройИнвест»",
  "ООО «ДатаСервис»", "ИП Козлов", "ООО «МедФарм»",
  "АО «Ритейл Групп»", "ООО «ЭнергоПлюс»", "ПАО «ФинТех»",
  "ООО «ЛогистикПро»", "АО «АгроХим»", "ООО «КонсалтГрупп»",
  "ПАО «ТелеКом»", "ООО «АвтоМотив»", "АО «Девелопмент»",
  'ООО «РусСилика»', "ЗАО «НаноХим»", "ООО «ПолимерТрейд»",
  "ПАО «КерамикИнвест»", "ООО «СиликаПром»",
];

const REGIONS = [
  "Москва", "Санкт-Петербург", "Казань", "Новосибирск", "Екатеринбург",
  "Нижний Новгород", "Самара", "Ростов-на-Дону", "Уфа", "Краснодар",
  "Воронеж", "Пермь", "Волгоград", "Челябинск", "Тюмень",
];

const INNS = [
  "7701234567", "7820123456", "1650123456", "5401234567", "6670123456",
  "5250123456", "6310123456", "6160123456", "0270123456", "2310123456",
];

function randomItem<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function randomMultiple(arr: string[], min: number = 1, max: number = 3): string[] {
  const count = Math.floor(Math.random() * (max - min + 1)) + min;
  const shuffled = [...arr].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, count);
}

function randomDate(daysBack: number): string {
  const now = new Date();
  const offset = Math.floor(Math.random() * daysBack);
  const d = new Date(now.getTime() - offset * 24 * 60 * 60 * 1000);
  return d.toISOString().slice(0, 10);
}

function randomDatetime(daysBack: number): string {
  const now = new Date();
  const offset = Math.floor(Math.random() * daysBack) * 24 * 60 * 60 * 1000
    + Math.floor(Math.random() * 86400000);
  const d = new Date(now.getTime() - offset);
  return d.toISOString().slice(0, 19);
}

function randomAmount(): string {
  return (Math.floor(Math.random() * 5000000) + 50000).toFixed(2);
}

function randomInn(): string {
  return randomItem(INNS);
}

export function generateDemoDeals(count: number = 150): Record<string, string | string[]>[] {
  const deals: Record<string, string | string[]>[] = [];

  for (let i = 0; i < count; i++) {
    const isWon = Math.random() > 0.6;
    const isLost = !isWon && Math.random() > 0.7;
    const stage = isWon ? "WON" : isLost ? "LOSE" : randomItem(STAGES.slice(0, 4));

    deals.push({
      ID: String(1000 + i),
      TITLE: `Сделка: ${randomItem(COMPANIES)}`,
      TYPE_ID: "SALE",
      CATEGORY_ID: "0",
      STAGE_ID: stage,
      CURRENCY_ID: "RUB",
      OPPORTUNITY: randomAmount(),
      TAX_VALUE: (Math.random() * 20).toFixed(2),
      BEGINDATE: randomDate(90),
      CLOSEDATE: isWon || isLost ? randomDate(30) : "",
      COMMENTS: Math.random() > 0.7 ? "Требуется согласование с техническим отделом" : "",
      SOURCE_ID: Math.random() > 0.5 ? "WEB" : "CALL",
      ASSIGNED_BY_ID: randomItem(RESPONSIBLE_PERSONS).ID,
      ASSIGNED_BY_NAME: randomItem(RESPONSIBLE_PERSONS).NAME,
      DATE_CREATE: randomDatetime(90),
      DATE_MODIFY: randomDatetime(30),

      // Custom fields
      UF_CRM_1584459653509: randomItem(SKLADS),
      UF_CRM_1584459666824: randomDate(60),
      UF_CRM_1584459858509: randomItem(DELIVERY_TYPES),
      UF_CRM_1584460062014: randomDate(30),
      UF_CRM_1584463812262: `${(Math.random() * 15000 + 500).toFixed(2)}|RUB`,
      UF_CRM_1584464068013: randomItem(PAYMENT_STATUSES),
      UF_CRM_1585653172826: randomDatetime(30),
      UF_CRM_1586467706342: Math.random() > 0.6 ? "Просим доставить до 12:00, этаж 3" : "",
      UF_CRM_1586468182934: (Math.random() * 25 + 2).toFixed(1),
      UF_CRM_DEAL_3861467182211: `1С-${String(2024000 + i).padStart(8, "0")}`,
      UF_CRM_DEAL_3861467182227: randomItem(ORGS),
      UF_CRM_6915D8C25162A: Math.random() > 0.7 ? `LC${String(100000 + i)}` : "",
      UF_CRM_6915D8C2688B8: randomItem(PAYMENT_METHODS),
      UF_CRM_6915D8C2C31D0: randomMultiple(OTDELS, 1, 2),
      UF_CRM_6915D8C328208: randomMultiple(NAPRAVLENIA, 1, 2),
      UF_CRM_1763541960: Math.random() > 0.7 ? "Позвонить перед доставкой" : "",
      UF_CRM_1763542027: `г. ${randomItem(REGIONS)}, ул. Промышленная, д. ${Math.floor(Math.random() * 50 + 1)}`,
      UF_CRM_1763542249: randomItem(PAYMENT_TYPES),
      UF_CRM_1763546892: isWon ? "Успешно закрыта, клиент доволен" : "",
      UF_CRM_1763546915: "",
      UF_CRM_69257337C8C0D: Math.random() > 0.6 ? "Выставка Химия 2025" : "",
      UF_CRM_69257337D66F5: randomItem(DELIVERY_PREFS),
      UF_CRM_69257337E7E9B: isLost ? "Бюджет не утверждён" : "",
      UF_CRM_692573380C4F0: Math.random() > 0.8 ? randomItem(IMPORT_BASES) : "",
      UF_CRM_6925733827A0F: Math.random() > 0.6 ? "Производство силикатных материалов" : "",
      UF_CRM_69257BBACD471: randomMultiple(PRODUCT_TYPES, 1, 2),
      UF_CRM_69259C45EC14B: randomItem(REGIONS),
      UF_CRM_1766405164: randomInn(),
      UF_CRM_1774878835644: (Math.random() * 3000000 + 100000).toFixed(2),
      UF_CRM_1774878993375: String(Math.floor(Math.random() * 8 + 1)),
      UF_CRM_1774879911841: (Math.random() * 500 + 10).toFixed(1),
      UF_CRM_1774879952785: Math.random() > 0.6 ? randomDate(30) : "",
      UF_CRM_1774880017: Math.random() > 0.7 ? "Требуется анализ пробы перед отгрузкой" : "",
      UF_CRM_1774880111684: Math.random() > 0.7 ? "1" : "0",
      UF_CRM_1774880251970: isLost ? randomItem(REFUSAL_REASONS) : "",
    });
  }

  // Sort by date descending
  deals.sort((a, b) => String(b.DATE_CREATE || "").localeCompare(String(a.DATE_CREATE || "")));

  return deals;
}
