import { describe, it, expect } from "vitest";
import { normalizeCompanies } from "@/lib/commercial-funnel/normalize";
import {
  computePeriodMetrics,
  filterCompaniesByDimensions,
  buildSampleRegister,
  computeBottlenecks,
  computeManagerScorecard,
} from "@/lib/commercial-funnel/engine";
import { computePeriodBoundaries } from "@/lib/commercial-funnel/date-utils";
import {
  CommercialCompany,
  CommercialDeal,
  CommercialFilters,
} from "@/lib/commercial-funnel/types";

describe("Commercial Funnel — Phase D Adversarial Filtering Reconciliation", () => {
  // Set up 1 Company with 3 deals:
  // - Deal A: Product = Gel, Sample = Testing, no shipment, no payment
  // - Deal B: Product = Sol, Sample = Succeeded, shipped 2026-09-10, no payment
  // - Deal C: Product = Gel, No sample, Stage = WON (paid 2026-09-12, 500k RUB, shipped 2026-09-15)
  const rawCompany = {
    ID: "100",
    TITLE: "ПромХимИнвест",
    ASSIGNED_BY_ID: "5",
    DATE_CREATE: "2026-07-01",
    UF_CRM_69257BBAB86F6: ["Гель", "Золь"],
  };

  const dealA: CommercialDeal = {
    id: "1001",
    title: "Сделка А (Гель - Тестирование)",
    companyId: "100",
    responsibleId: "5",
    stageId: "C4:EXECUTING",
    categoryId: "0",
    opportunity: 250000,
    opportunityQuality: "VALID",
    currencyId: "RUB",
    dateCreate: "2026-08-01",
    sampleTestingStatus: ["На испытании"],
    sampleSentDate: undefined,
    productType: ["Гель"],
    direction: [],
    industry: [],
  };

  const dealB: CommercialDeal = {
    id: "1002",
    title: "Сделка Б (Золь - Успех)",
    companyId: "100",
    responsibleId: "5",
    stageId: "C4:FINAL_INVOICE",
    categoryId: "0",
    opportunity: 350000,
    opportunityQuality: "VALID",
    currencyId: "RUB",
    dateCreate: "2026-08-15",
    sampleTransferStatus: "Подошли",
    sampleTestingStatus: [],
    sampleSentDate: "2026-09-10", // Sent in September 2026
    productType: ["Золь"],
    direction: [],
    industry: [],
  };

  const dealC: CommercialDeal = {
    id: "1003",
    title: "Сделка В (Гель - Оплата и Отгрузка)",
    companyId: "100",
    responsibleId: "5",
    stageId: "C4:WON",
    categoryId: "0",
    opportunity: 500000,
    opportunityQuality: "VALID",
    currencyId: "RUB",
    dateCreate: "2026-08-20",
    paymentStatus: "113",
    paymentStatusLabel: "Оплачен",
    paymentDate: "2026-09-12", // Paid in September 2026
    shipmentDate: "2026-09-15", // Shipped in September 2026
    sampleTestingStatus: [],
    productType: ["Гель"],
    direction: [],
    industry: [],
  };

  const allCompanies = normalizeCompanies([rawCompany], [dealA, dealB, dealC]);
  const septBoundaries = computePeriodBoundaries({
    periodPreset: "custom",
    customFrom: "2026-09-01",
    customTo: "2026-09-30",
  });

  // --------------------------------------------------------------------------
  // Slice 1: No filters (All Products)
  // --------------------------------------------------------------------------
  it("Slice 1 (Unfiltered): aggregates all 3 deals correctly across all tabs", () => {
    const filters: CommercialFilters = {
      periodPreset: "custom",
      customFrom: "2026-09-01",
      customTo: "2026-09-30",
      responsibleId: "all",
      productType: "all",
      industry: "all",
      direction: "all",
      region: "all",
    };

    const companies = filterCompaniesByDimensions(allCompanies, filters);
    expect(companies).toHaveLength(1);
    expect(companies[0].deals).toHaveLength(3);

    // Overview Dated KPIs
    const metrics = computePeriodMetrics(companies, septBoundaries);
    const samplesSentKpi = metrics.find((k) => k.id === "samples_sent")!;
    const paymentsReceivedKpi = metrics.find((k) => k.id === "payments_received")!;
    const shipmentsKpi = metrics.find((k) => k.id === "shipments")!;
    const paymentAmountKpi = metrics.find((k) => k.id === "payment_amount")!;

    expect(samplesSentKpi.currentValue).toBe(1); // via Deal B
    expect(paymentsReceivedKpi.currentValue).toBe(1); // via Deal C
    expect(shipmentsKpi.currentValue).toBe(1); // via Deal C
    expect(paymentAmountKpi.currentValue).toBe(500000); // Deal C opportunity

    // Samples Tab: 2 deals have sample evidence (A and B)
    const registerRows = buildSampleRegister(companies);
    expect(registerRows).toHaveLength(2);
    const dealIdsInRegister = registerRows.map((r) => r.dealId).sort();
    expect(dealIdsInRegister).toEqual(["1001", "1002"]);

    // Managers Tab
    const managerRows = computeManagerScorecard(companies, septBoundaries);
    expect(managerRows).toHaveLength(1);
    expect(managerRows[0].responsibleId).toBe("5");
    expect(managerRows[0].samplesSent).toBe(1);
    expect(managerRows[0].paymentsReceived).toBe(1);
  });

  // --------------------------------------------------------------------------
  // Slice 2: Filter by Product = "Гель"
  // --------------------------------------------------------------------------
  it("Slice 2 (Product = Гель): excludes Deal B completely, preventing sample leak", () => {
    const filters: CommercialFilters = {
      periodPreset: "custom",
      customFrom: "2026-09-01",
      customTo: "2026-09-30",
      responsibleId: "all",
      productType: "Гель",
      industry: "all",
      direction: "all",
      region: "all",
    };

    const companies = filterCompaniesByDimensions(allCompanies, filters);
    expect(companies).toHaveLength(1);
    const comp = companies[0];

    // Only Deal A and Deal C are "Гель"
    expect(comp.deals).toHaveLength(2);
    const dealIds = comp.deals.map((d) => d.id).sort();
    expect(dealIds).toEqual(["1001", "1003"]);

    // CRITICAL: Deal B's "Подошли" status must NOT leak to company WIP status!
    // Deal A is "На испытании"
    expect(comp.sampleStatus).toBe("На испытании");
    expect(comp.sampleStatuses).toEqual(["На испытании"]);

    // Overview Dated KPIs
    const metrics = computePeriodMetrics(companies, septBoundaries);
    const samplesSentKpi = metrics.find((k) => k.id === "samples_sent")!;
    const paymentsReceivedKpi = metrics.find((k) => k.id === "payments_received")!;
    const shipmentsKpi = metrics.find((k) => k.id === "shipments")!;
    const paymentAmountKpi = metrics.find((k) => k.id === "payment_amount")!;

    // CRITICAL: Deal B's shipment date (2026-09-10) must NOT leak into "samples_sent" KPI!
    expect(samplesSentKpi.currentValue).toBe(0);
    expect(samplesSentKpi.companyIds).toEqual([]);

    // Gel deals have payment and shipment via Deal C
    expect(paymentsReceivedKpi.currentValue).toBe(1);
    expect(shipmentsKpi.currentValue).toBe(1);
    expect(paymentAmountKpi.currentValue).toBe(500000);

    // Samples Tab: ONLY Deal A has sample evidence among Gel deals
    const registerRows = buildSampleRegister(companies);
    expect(registerRows).toHaveLength(1);
    expect(registerRows[0].dealId).toBe("1001");
    expect(registerRows[0].status).toBe("На испытании");

    // Managers Tab
    const managerRows = computeManagerScorecard(companies, septBoundaries);
    expect(managerRows).toHaveLength(1);
    expect(managerRows[0].samplesSent).toBe(0); // 0 samples sent for Gel in Sept
    expect(managerRows[0].paymentsReceived).toBe(1);
  });

  // --------------------------------------------------------------------------
  // Slice 3: Filter by Product = "Золь"
  // --------------------------------------------------------------------------
  it("Slice 3 (Product = Золь): excludes Deals A and C completely, isolating Deal B", () => {
    const filters: CommercialFilters = {
      periodPreset: "custom",
      customFrom: "2026-09-01",
      customTo: "2026-09-30",
      responsibleId: "all",
      productType: "Золь",
      industry: "all",
      direction: "all",
      region: "all",
    };

    const companies = filterCompaniesByDimensions(allCompanies, filters);
    expect(companies).toHaveLength(1);
    const comp = companies[0];

    // Only Deal B is "Золь"
    expect(comp.deals).toHaveLength(1);
    expect(comp.deals[0].id).toBe("1002");

    // Status is Deal B's status
    expect(comp.sampleStatus).toBe("Подошли");
    expect(comp.sampleStatuses).toEqual(["Подошли"]);

    // Overview Dated KPIs
    const metrics = computePeriodMetrics(companies, septBoundaries);
    const samplesSentKpi = metrics.find((k) => k.id === "samples_sent")!;
    const paymentsReceivedKpi = metrics.find((k) => k.id === "payments_received")!;
    const shipmentsKpi = metrics.find((k) => k.id === "shipments")!;
    const paymentAmountKpi = metrics.find((k) => k.id === "payment_amount")!;

    // Deal B had samples sent in September
    expect(samplesSentKpi.currentValue).toBe(1);
    expect(samplesSentKpi.companyIds).toEqual(["100"]);

    // CRITICAL: Deal C's payment and shipment must NOT leak into "Золь" slice!
    expect(paymentsReceivedKpi.currentValue).toBe(0);
    expect(paymentsReceivedKpi.companyIds).toEqual([]);
    expect(shipmentsKpi.currentValue).toBe(0);
    expect(shipmentsKpi.companyIds).toEqual([]);
    expect(paymentAmountKpi.currentValue).toBe(0);

    // Samples Tab: ONLY Deal B
    const registerRows = buildSampleRegister(companies);
    expect(registerRows).toHaveLength(1);
    expect(registerRows[0].dealId).toBe("1002");
    expect(registerRows[0].status).toBe("Подошли");

    // Managers Tab
    const managerRows = computeManagerScorecard(companies, septBoundaries);
    expect(managerRows).toHaveLength(1);
    expect(managerRows[0].samplesSent).toBe(1);
    expect(managerRows[0].paymentsReceived).toBe(0);
  });
});
