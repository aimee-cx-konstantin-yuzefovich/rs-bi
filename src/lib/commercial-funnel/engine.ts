// src/lib/commercial-funnel/engine.ts
// ─────────────────────────────────────────────────────────────────────
// Pure Analytics Engine for Commercial Funnel Release 1.
// Single source of truth consumed by BOTH the UI and Excel report.
// Guaranteed exact reconciliation between KPI counts and drill-down lists.
// ─────────────────────────────────────────────────────────────────────

import {
  COMMERCIAL_THRESHOLDS,
  INVOICE_SENT_STATUS_CODES,
  PAID_STATUS_CODES,
  UNCLASSIFIED_LABEL,
  WIP_STATUS_KEYS,
} from "./constants";
import {
  calculateDaysWaiting,
  computePeriodBoundaries,
  isDateInPeriod,
  safeDeltaPercent,
} from "./date-utils";
import type {
  BottleneckItem,
  CommercialCompany,
  CommercialDeal,
  CommercialFilters,
  DatedKpi,
  ManagerScorecardRow,
  PeriodBoundaries,
  SampleRegisterRow,
  WipKpi,
} from "./types";

/**
 * Filter dataset by dimensional filters (responsible, product, industry, direction, region).
 * Note: Date filtering is applied to DATED EVENTS only, never to current WIP.
 */
export function filterCompaniesByDimensions(
  companies: CommercialCompany[],
  filters: CommercialFilters
): CommercialCompany[] {
  return companies.filter((company) => {
    // 1. Responsible filter
    if (filters.responsibleId && filters.responsibleId !== "all") {
      const matchCompany = company.responsibleId === filters.responsibleId;
      const matchDeal = company.deals.some((d) => d.responsibleId === filters.responsibleId);
      if (!matchCompany && !matchDeal) return false;
    }

    // 2. Product type filter
    if (filters.productType && filters.productType !== "all") {
      const matchCompany = company.productType.includes(filters.productType);
      const matchDeal = company.deals.some((d) => d.productType.includes(filters.productType!));
      if (!matchCompany && !matchDeal) return false;
    }

    // 3. Industry filter
    if (filters.industry && filters.industry !== "all") {
      const matchCompany = company.industry === filters.industry;
      const matchDeal = company.deals.some((d) => d.industry.includes(filters.industry!));
      if (!matchCompany && !matchDeal) return false;
    }

    // 4. Direction filter
    if (filters.direction && filters.direction !== "all") {
      const matchCompany = company.direction.includes(filters.direction);
      const matchDeal = company.deals.some((d) => d.direction.includes(filters.direction!));
      if (!matchCompany && !matchDeal) return false;
    }

    // 5. Region filter
    if (filters.region && filters.region !== "all") {
      const matchCompany = company.region === filters.region;
      const matchDeal = company.deals.some((d) => d.region === filters.region);
      if (!matchCompany && !matchDeal) return false;
    }

    return true;
  });
}

/**
 * Calculate Period Activity KPIs with previous-period comparison (DATED EVENTS ONLY).
 * Primary counting unit: UNIQUE COMPANY.
 */
export function computePeriodMetrics(
  companies: CommercialCompany[],
  boundaries: PeriodBoundaries
): DatedKpi[] {
  const { currentStart, currentEnd, previousStart, previousEnd } = boundaries;

  // 1. Новые компании (Company DATE_CREATE in period)
  const currentNewCompanyIds = new Set<string>();
  const prevNewCompanyIds = new Set<string>();

  for (const c of companies) {
    if (isDateInPeriod(c.dateCreate, currentStart, currentEnd)) {
      currentNewCompanyIds.add(c.id);
    }
    if (isDateInPeriod(c.dateCreate, previousStart, previousEnd)) {
      prevNewCompanyIds.add(c.id);
    }
  }

  // 2. Образцы отправлены (Sample shipment date in period, unique companies)
  const currentSampleSentCompanyIds = new Set<string>();
  const prevSampleSentCompanyIds = new Set<string>();

  for (const c of companies) {
    // Check deal sent dates or company transfer dates
    const hasCurrentShipment = c.sampleAllDates.some((d) => isDateInPeriod(d, currentStart, currentEnd));
    if (hasCurrentShipment) {
      currentSampleSentCompanyIds.add(c.id);
    }
    const hasPrevShipment = c.sampleAllDates.some((d) => isDateInPeriod(d, previousStart, previousEnd));
    if (hasPrevShipment) {
      prevSampleSentCompanyIds.add(c.id);
    }
  }

  // 3. Создано сделок (Deal DATE_CREATE in period, unique companies)
  const currentDealCreatedCompanyIds = new Set<string>();
  const prevDealCreatedCompanyIds = new Set<string>();

  for (const c of companies) {
    for (const d of c.deals) {
      if (isDateInPeriod(d.dateCreate, currentStart, currentEnd)) {
        currentDealCreatedCompanyIds.add(c.id);
      }
      if (isDateInPeriod(d.dateCreate, previousStart, previousEnd)) {
        prevDealCreatedCompanyIds.add(c.id);
      }
    }
  }

  // 4. Получено оплат (Payment date in period + paid status, unique companies)
  const currentPaidCompanyIds = new Set<string>();
  const prevPaidCompanyIds = new Set<string>();
  let currentPaymentSum = 0;
  let prevPaymentSum = 0;
  const currentPaymentSumCompanyIds = new Set<string>();
  const prevPaymentSumCompanyIds = new Set<string>();

  for (const c of companies) {
    for (const d of c.deals) {
      if (d.paymentStatus && PAID_STATUS_CODES.has(d.paymentStatus) && d.paymentDate) {
        if (isDateInPeriod(d.paymentDate, currentStart, currentEnd)) {
          currentPaidCompanyIds.add(c.id);
          currentPaymentSum += d.opportunity;
          currentPaymentSumCompanyIds.add(c.id);
        }
        if (isDateInPeriod(d.paymentDate, previousStart, previousEnd)) {
          prevPaidCompanyIds.add(c.id);
          prevPaymentSum += d.opportunity;
          prevPaymentSumCompanyIds.add(c.id);
        }
      }
    }
  }

  // 5. Отгрузки (Shipment date in period, unique companies)
  const currentShipmentCompanyIds = new Set<string>();
  const prevShipmentCompanyIds = new Set<string>();

  for (const c of companies) {
    for (const d of c.deals) {
      if (d.shipmentDate) {
        if (isDateInPeriod(d.shipmentDate, currentStart, currentEnd)) {
          currentShipmentCompanyIds.add(c.id);
        }
        if (isDateInPeriod(d.shipmentDate, previousStart, previousEnd)) {
          prevShipmentCompanyIds.add(c.id);
        }
      }
    }
  }

  const buildKpi = (
    id: string,
    label: string,
    curr: number,
    prev: number,
    companyIds: string[],
    isCurrency = false
  ): DatedKpi => ({
    id,
    label,
    currentValue: curr,
    previousValue: prev,
    delta: curr - prev,
    deltaPercent: safeDeltaPercent(curr, prev),
    companyIds,
    isCurrency,
  });

  return [
    buildKpi(
      "new_companies",
      "Новые компании",
      currentNewCompanyIds.size,
      prevNewCompanyIds.size,
      Array.from(currentNewCompanyIds)
    ),
    buildKpi(
      "samples_sent",
      "Образцы отправлены",
      currentSampleSentCompanyIds.size,
      prevSampleSentCompanyIds.size,
      Array.from(currentSampleSentCompanyIds)
    ),
    buildKpi(
      "deals_created",
      "Создано сделок",
      currentDealCreatedCompanyIds.size,
      prevDealCreatedCompanyIds.size,
      Array.from(currentDealCreatedCompanyIds)
    ),
    buildKpi(
      "payments_received",
      "Получено оплат",
      currentPaidCompanyIds.size,
      prevPaidCompanyIds.size,
      Array.from(currentPaidCompanyIds)
    ),
    buildKpi(
      "payment_amount",
      "Сумма оплат",
      Math.round(currentPaymentSum),
      Math.round(prevPaymentSum),
      Array.from(currentPaymentSumCompanyIds),
      true
    ),
    buildKpi(
      "shipments",
      "Отгрузки",
      currentShipmentCompanyIds.size,
      prevShipmentCompanyIds.size,
      Array.from(currentShipmentCompanyIds)
    ),
  ];
}

/**
 * Calculate Current State / WIP KPIs (WHERE COMPANIES/DEALS ARE NOW).
 * Never filtered by event date. Counting unit: UNIQUE COMPANY.
 */
export function computeWipMetrics(companies: CommercialCompany[]): WipKpi[] {
  const map = new Map<string, { companyIds: Set<string>; dealCount: number }>();

  for (const key of WIP_STATUS_KEYS) {
    map.set(key, { companyIds: new Set<string>(), dealCount: 0 });
  }

  for (const c of companies) {
    const status = c.sampleStatus;
    if (status && status !== "—") {
      let targetKey: string = UNCLASSIFIED_LABEL;
      for (const k of WIP_STATUS_KEYS) {
        if (status === k || status.startsWith(k)) {
          targetKey = k;
          break;
        }
      }
      const entry = map.get(targetKey) || map.get(UNCLASSIFIED_LABEL)!;
      entry.companyIds.add(c.id);
      entry.dealCount += c.deals.length;
    }
  }

  // Commercial WIP: deals in preparation / invoice sent
  const awaitingPaymentCompanyIds = new Set<string>();
  let awaitingPaymentDealCount = 0;

  for (const c of companies) {
    for (const d of c.deals) {
      if (d.paymentStatus && INVOICE_SENT_STATUS_CODES.has(d.paymentStatus)) {
        awaitingPaymentCompanyIds.add(c.id);
        awaitingPaymentDealCount++;
      }
    }
  }

  const kpis: WipKpi[] = WIP_STATUS_KEYS.map((key) => {
    const entry = map.get(key)!;
    return {
      id: key,
      label: key,
      companyCount: entry.companyIds.size,
      dealCount: entry.dealCount,
      companyIds: Array.from(entry.companyIds),
    };
  });

  kpis.push({
    id: "awaiting_payment",
    label: "Ожидает оплаты",
    companyCount: awaitingPaymentCompanyIds.size,
    dealCount: awaitingPaymentDealCount,
    companyIds: Array.from(awaitingPaymentCompanyIds),
  });

  return kpis;
}

/**
 * Calculate actionable bottlenecks strictly derived from reliable date + current state.
 */
export function computeBottlenecks(
  companies: CommercialCompany[],
  now: Date = new Date()
): BottleneckItem[] {
  const items: BottleneckItem[] = [];

  for (const c of companies) {
    // 1. Sample testing stalled (> 14 days)
    if (c.sampleStatus === "На испытании" && c.sampleShipmentDate) {
      const days = calculateDaysWaiting(c.sampleShipmentDate, now);
      if (days !== null && days > COMMERCIAL_THRESHOLDS.SAMPLE_TESTING_ATTENTION_DAYS) {
        items.push({
          id: `bottleneck-testing-${c.id}`,
          companyId: c.id,
          companyTitle: c.title,
          responsibleId: c.responsibleId,
          responsibleName: c.responsibleName || `ID ${c.responsibleId}`,
          type: "sample_testing_stalled",
          issueLabel: "Испытание образцов затянулось",
          currentState: `На испытании (${days} дн.)`,
          relevantDate: c.sampleShipmentDate,
          daysWaiting: days,
          dealId: c.primaryDealId,
          dealTitle: c.primaryDealTitle,
          amount: c.primaryDealOpportunity,
          nextAction: c.primaryDealActivityNext || "Уточнить результаты испытаний у технолога клиента",
        });
      }
    }

    // 2. Sample succeeded but no commercial progression
    if (c.sampleStatus === "Подошли") {
      const hasProgressed = c.deals.some((d) => !["NEW", "PREPARATION", "LOSE"].includes(d.stageId));
      if (!hasProgressed) {
        const refDate = c.sampleShipmentDate || c.dateCreate;
        const days = calculateDaysWaiting(refDate, now) || 0;
        items.push({
          id: `bottleneck-success-${c.id}`,
          companyId: c.id,
          companyTitle: c.title,
          responsibleId: c.responsibleId,
          responsibleName: c.responsibleName || `ID ${c.responsibleId}`,
          type: "sample_success_no_deal",
          issueLabel: "Образец подошел, нет коммерческой сделки",
          currentState: "Образец одобрен",
          relevantDate: refDate,
          daysWaiting: days,
          dealId: c.primaryDealId,
          dealTitle: c.primaryDealTitle,
          amount: c.primaryDealOpportunity,
          nextAction: "Выставить коммерческое предложение / подготовить договор",
        });
      }
    }

    // 3. Invoice sent but payment overdue (> 14 days)
    for (const d of c.deals) {
      if (d.paymentStatus && INVOICE_SENT_STATUS_CODES.has(d.paymentStatus)) {
        const refDate = d.beginDate || d.dateCreate;
        const days = calculateDaysWaiting(refDate, now);
        if (days !== null && days > COMMERCIAL_THRESHOLDS.PAYMENT_WAITING_ATTENTION_DAYS) {
          items.push({
            id: `bottleneck-payment-${d.id}`,
            companyId: c.id,
            companyTitle: c.title,
            responsibleId: d.responsibleId || c.responsibleId,
            responsibleName: d.responsibleName || c.responsibleName || "Не назначен",
            type: "payment_overdue",
            issueLabel: "Счёт ожидает оплаты",
            currentState: `Счёт выставлен (${days} дн.)`,
            relevantDate: refDate,
            daysWaiting: days,
            dealId: d.id,
            dealTitle: d.title,
            amount: d.opportunity,
            nextAction: d.activityNext || "Запросить подтверждение оплаты у бухгалтерии клиента",
          });
        }
      }
    }

    // 4. Stalled active deal (no next activity or > 30 days stalled)
    for (const d of c.deals) {
      if (!["WON", "LOSE"].includes(d.stageId)) {
        const refDate = d.beginDate || d.dateCreate;
        const days = calculateDaysWaiting(refDate, now) || 0;
        const isStalledByAge = days > COMMERCIAL_THRESHOLDS.STALLED_DEAL_DAYS;
        const hasNoNextAction = !d.activityNext;

        if (isStalledByAge || hasNoNextAction) {
          const issueLabel = hasNoNextAction
            ? "Нет следующего шага по сделке"
            : `Сделка без движения (${days} дн.)`;
          items.push({
            id: `bottleneck-stalled-${d.id}`,
            companyId: c.id,
            companyTitle: c.title,
            responsibleId: d.responsibleId || c.responsibleId,
            responsibleName: d.responsibleName || c.responsibleName || "Не назначен",
            type: "stalled_deal",
            issueLabel,
            currentState: d.stageName || d.stageId,
            relevantDate: refDate,
            daysWaiting: days,
            dealId: d.id,
            dealTitle: d.title,
            amount: d.opportunity,
            nextAction: d.activityNext || "Запланировать звонок / встречу с клиентом",
          });
        }
      }
    }
  }

  // Sort bottlenecks by waiting days descending
  return items.sort((a, b) => b.daysWaiting - a.daysWaiting);
}

/**
 * Compute Manager Scorecard metrics (operational breakdown, no ranking).
 */
export function computeManagerScorecard(
  companies: CommercialCompany[],
  boundaries: PeriodBoundaries,
  bottlenecks: BottleneckItem[],
  userNames: Record<string, string> = {}
): ManagerScorecardRow[] {
  const { currentStart, currentEnd } = boundaries;

  // Group by responsible ID
  const managerMap = new Map<string, ManagerScorecardRow>();

  const getOrCreate = (respId: string): ManagerScorecardRow => {
    let row = managerMap.get(respId);
    if (!row) {
      row = {
        responsibleId: respId,
        name: userNames[respId] || (respId ? `ID ${respId}` : "Не назначен"),
        newCompanies: 0,
        samplesSent: 0,
        inTesting: 0,
        sampleSuccess: 0,
        sampleFail: 0,
        sampleRework: 0,
        dealsCreated: 0,
        paymentsReceived: 0,
        paymentAmount: 0,
        bottlenecksCount: 0,
        companyIds: [],
      };
      managerMap.set(respId, row);
    }
    return row;
  };

  for (const c of companies) {
    const row = getOrCreate(c.responsibleId);
    if (!row.companyIds.includes(c.id)) {
      row.companyIds.push(c.id);
    }

    // Dated: new company in period
    if (isDateInPeriod(c.dateCreate, currentStart, currentEnd)) {
      row.newCompanies++;
    }

    // Dated: samples sent in period
    if (c.sampleAllDates.some((d) => isDateInPeriod(d, currentStart, currentEnd))) {
      row.samplesSent++;
    }

    // Current WIP: sample status
    if (c.sampleStatus === "На испытании") row.inTesting++;
    else if (c.sampleStatus === "Подошли") row.sampleSuccess++;
    else if (c.sampleStatus === "Не подошли") row.sampleFail++;
    else if (c.sampleStatus === "Требуется доработка") row.sampleRework++;

    // Deals metrics
    for (const d of c.deals) {
      const dealManager = getOrCreate(d.responsibleId || c.responsibleId);
      if (!dealManager.companyIds.includes(c.id)) {
        dealManager.companyIds.push(c.id);
      }
      if (isDateInPeriod(d.dateCreate, currentStart, currentEnd)) {
        dealManager.dealsCreated++;
      }
      if (d.paymentStatus && PAID_STATUS_CODES.has(d.paymentStatus) && d.paymentDate) {
        if (isDateInPeriod(d.paymentDate, currentStart, currentEnd)) {
          dealManager.paymentsReceived++;
          dealManager.paymentAmount += d.opportunity;
        }
      }
    }
  }

  // Count bottlenecks per manager
  for (const b of bottlenecks) {
    const row = managerMap.get(b.responsibleId);
    if (row) {
      row.bottlenecksCount++;
    }
  }

  // Return rows sorted alphabetically by name (no best/worst ranking)
  return Array.from(managerMap.values()).sort((a, b) => a.name.localeCompare(b.name, "ru"));
}

/**
 * Build granular Sample Register rows (one row per sample deal + company fallbacks).
 */
export function buildSampleRegister(
  companies: CommercialCompany[],
  now: Date = new Date()
): SampleRegisterRow[] {
  const rows: SampleRegisterRow[] = [];

  for (const c of companies) {
    // If company has sample-related deals, emit a row for each sample deal
    const sampleDeals = c.deals.filter((d) => Boolean(d.sampleTransferStatus || d.sampleSentDate));

    if (sampleDeals.length > 0) {
      for (const d of sampleDeals) {
        const shipmentDate = d.sampleSentDate || c.sampleShipmentDate;
        const days = calculateDaysWaiting(shipmentDate, now);

        rows.push({
          id: `sample-deal-${d.id}`,
          companyId: c.id,
          companyTitle: c.title,
          responsibleId: d.responsibleId || c.responsibleId,
          responsibleName: d.responsibleName || c.responsibleName || "Не назначен",
          dealId: d.id,
          dealTitle: d.title,
          productType: d.productType.join(", ") || c.productType.join(", ") || "—",
          status: d.sampleTransferStatus || c.sampleStatus,
          statusSource: "DEAL",
          shipmentDate,
          daysSinceSent: days !== null ? days : undefined,
          testResult: c.sampleTestResult,
          gradeGel: c.gradeGel.join(", ") || undefined,
          gradeSol: c.gradeSol.join(", ") || undefined,
          qtyGel: c.qtyGel !== undefined ? `${c.qtyGel} кг` : undefined,
          qtySol: c.qtySol !== undefined ? `${c.qtySol} л` : undefined,
          nextAction: d.activityNext || c.primaryDealActivityNext,
        });
      }
    } else if (c.sampleStatus !== "—" || c.sampleShipmentDate || c.sampleTestResult) {
      // Company-level fallback record
      const days = calculateDaysWaiting(c.sampleShipmentDate, now);
      rows.push({
        id: `sample-company-${c.id}`,
        companyId: c.id,
        companyTitle: c.title,
        responsibleId: c.responsibleId,
        responsibleName: c.responsibleName || "Не назначен",
        dealId: c.primaryDealId,
        dealTitle: c.primaryDealTitle,
        productType: c.productType.join(", ") || "—",
        status: c.sampleStatus,
        statusSource: "COMPANY",
        shipmentDate: c.sampleShipmentDate,
        daysSinceSent: days !== null ? days : undefined,
        testResult: c.sampleTestResult,
        gradeGel: c.gradeGel.join(", ") || undefined,
        gradeSol: c.gradeSol.join(", ") || undefined,
        qtyGel: c.qtyGel !== undefined ? `${c.qtyGel} кг` : undefined,
        qtySol: c.qtySol !== undefined ? `${c.qtySol} л` : undefined,
        nextAction: c.primaryDealActivityNext,
      });
    }
  }

  return rows;
}
