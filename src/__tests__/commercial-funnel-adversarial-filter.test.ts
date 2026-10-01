import { describe, it, expect } from "vitest";
import {
  applyCanonicalSampleDomain,
  normalizeCompanies,
} from "@/lib/commercial-funnel/normalize";
import { buildCanonicalSampleDomain } from "@/lib/samples/aggregate";
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
    // Phase C marker isolation: testing status is carried by the Deal
    // transfer field (UF_CRM_1779386185); the marker field
    // (UF_CRM_1779394379 → sampleTestingStatus) is MARKER_ONLY and can no
    // longer create current sample state.
    sampleTransferStatus: "На испытании",
    legacyTestingMarkerRaw: ["На испытании"], // marker preview only
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
    productType: ["Гель"],
    direction: [],
    industry: [],
  };

  // Phase C: build the canonical sample domain from raw rows (the same
  // engine as production), then project onto normalized companies.
  const rawDeals = [
    {
      ID: "1001",
      COMPANY_ID: "100",
      ASSIGNED_BY_ID: "5",
      STAGE_ID: "C4:EXECUTING",
      CATEGORY_ID: "0",
      OPPORTUNITY: "250000",
      CURRENCY_ID: "RUB",
      DATE_CREATE: "2026-08-01",
      UF_CRM_1779386185: "DT1032_15:CLIENT", // На испытании
      UF_CRM_69257BBACD471: ["Гель"],
    },
    {
      ID: "1002",
      COMPANY_ID: "100",
      ASSIGNED_BY_ID: "5",
      STAGE_ID: "C4:FINAL_INVOICE",
      CATEGORY_ID: "0",
      OPPORTUNITY: "350000",
      CURRENCY_ID: "RUB",
      DATE_CREATE: "2026-08-15",
      UF_CRM_1779386185: "DT1032_15:SUCCESS", // Подошли
      UF_CRM_1774879952785: "2026-09-10",
      UF_CRM_69257BBACD471: ["Золь"],
    },
    {
      ID: "1003",
      COMPANY_ID: "100",
      ASSIGNED_BY_ID: "5",
      STAGE_ID: "C4:WON",
      CATEGORY_ID: "0",
      OPPORTUNITY: "500000",
      CURRENCY_ID: "RUB",
      DATE_CREATE: "2026-08-20",
      PAYMENT_STATUS: "113",
      UF_CRM_1584460062014: "2026-09-12",
      UF_CRM_1584459666824: "2026-09-15",
      UF_CRM_69257BBACD471: ["Гель"],
    },
  ];
  const sampleDomain = buildCanonicalSampleDomain([rawCompany], rawDeals, []);
  const allCompanies = applyCanonicalSampleDomain(
    normalizeCompanies([rawCompany], [dealA, dealB, dealC]),
    sampleDomain
  );
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

    // Under Defect C: deals of matched company are NOT pruned by deal dimensions
    expect(comp.deals).toHaveLength(3);
    const dealIds = comp.deals.map((d) => d.id).sort();
    expect(dealIds).toEqual(["1001", "1002", "1003"]);

    expect(comp.sampleStatus).toBe("Подошли");
    expect(comp.sampleStatusSource).toBe("DEAL");

    // Overview Dated KPIs
    const metrics = computePeriodMetrics(companies, septBoundaries);
    const samplesSentKpi = metrics.find((k) => k.id === "samples_sent")!;
    const paymentsReceivedKpi = metrics.find((k) => k.id === "payments_received")!;
    const shipmentsKpi = metrics.find((k) => k.id === "shipments")!;
    const paymentAmountKpi = metrics.find((k) => k.id === "payment_amount")!;

    // Under Defect C: Company's deals are intact, so company's period events remain in KPI
    expect(samplesSentKpi.currentValue).toBe(1);
    expect(samplesSentKpi.companyIds).toEqual(["100"]);

    // Gel deals have payment and shipment via Deal C
    expect(paymentsReceivedKpi.currentValue).toBe(1);
    expect(shipmentsKpi.currentValue).toBe(1);
    expect(paymentAmountKpi.currentValue).toBe(500000);

    // Samples Tab: 2 deals have sample evidence (A and B)
    const registerRows = buildSampleRegister(companies);
    expect(registerRows).toHaveLength(2);
    expect(registerRows.map((r) => r.dealId).sort()).toEqual(["1001", "1002"]);

    // Managers Tab
    const managerRows = computeManagerScorecard(companies, septBoundaries);
    expect(managerRows).toHaveLength(1);
    expect(managerRows[0].samplesSent).toBe(1);
    expect(managerRows[0].paymentsReceived).toBe(1);
  });

  // --------------------------------------------------------------------------
  // Slice 3: Filter by Product = "Золь"
  // --------------------------------------------------------------------------
  it("Slice 3 (Product = Золь): retains company and all its deals per Defect C (no deal pruning)", () => {
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

    // Under Defect C: deals are NOT pruned by deal-level productType
    expect(comp.deals).toHaveLength(3);
    const dealIds = comp.deals.map((d) => d.id).sort();
    expect(dealIds).toEqual(["1001", "1002", "1003"]);

    // Status is Deal B's status
    expect(comp.sampleStatus).toBe("Подошли");
    expect(comp.sampleStatuses).toEqual(["На испытании", "Подошли"]);

    // Overview Dated KPIs
    const metrics = computePeriodMetrics(companies, septBoundaries);
    const samplesSentKpi = metrics.find((k) => k.id === "samples_sent")!;
    const paymentsReceivedKpi = metrics.find((k) => k.id === "payments_received")!;
    const shipmentsKpi = metrics.find((k) => k.id === "shipments")!;
    const paymentAmountKpi = metrics.find((k) => k.id === "payment_amount")!;

    // Deal B had samples sent in September
    expect(samplesSentKpi.currentValue).toBe(1);
    expect(samplesSentKpi.companyIds).toEqual(["100"]);

    // Deal C's payment and shipment belong to company in the slice (no undercount)
    expect(paymentsReceivedKpi.currentValue).toBe(1);
    expect(paymentsReceivedKpi.companyIds).toEqual(["100"]);
    expect(shipmentsKpi.currentValue).toBe(1);
    expect(shipmentsKpi.companyIds).toEqual(["100"]);
    expect(paymentAmountKpi.currentValue).toBe(500000);

    // Samples Tab: both sample deals
    const registerRows = buildSampleRegister(companies);
    expect(registerRows).toHaveLength(2);

    // Managers Tab
    const managerRows = computeManagerScorecard(companies, septBoundaries);
    expect(managerRows).toHaveLength(1);
    expect(managerRows[0].samplesSent).toBe(1);
    expect(managerRows[0].paymentsReceived).toBe(1);
  });
});
