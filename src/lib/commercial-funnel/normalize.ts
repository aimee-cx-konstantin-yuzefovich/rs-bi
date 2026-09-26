// src/lib/commercial-funnel/normalize.ts
// ─────────────────────────────────────────────────────────────────────
// Authoritative data normalization and reconciliation for Commercial Funnel.
// Reconciles Deal precedence over Company fallback, maps unknown enums
// to "Не классифицировано", and deduplicates by authoritative Company ID.
// ─────────────────────────────────────────────────────────────────────

import {
  COMMERCIAL_THRESHOLDS,
  COMPANY_SAMPLE_STATUS_MAP,
  DEAL_SAMPLE_PROCESS_MAP,
  INVOICE_SENT_STATUS_CODES,
  PAID_STATUS_CODES,
  PAYMENT_STATUS_LABELS,
  UNCLASSIFIED_LABEL,
} from "./constants";
import { calculateDaysWaiting } from "./date-utils";
import type {
  CommercialCompany,
  CommercialDeal,
  SampleStatusEntry,
  SampleStatusSource,
} from "./types";
import {
  isDealActiveStage,
  isProgressedCommercialStage,
  isTerminalStage,
} from "./stage-utils";
import {
  COMPANY_APPLICATION_NEW_FIELD_ID,
  COMPANY_APPLICATION_OLD_FIELD_ID,
  COMPANY_DIRECTION_FIELD_ID,
  COMPANY_PRODUCT_TYPE_FIELD_ID,
  COMPANY_SAMPLES_DATE_MULTI_FIELD_ID,
  COMPANY_SAMPLES_DATE_SINGLE_FIELD_ID,
  COMPANY_SAMPLES_FIELD_ID,
  COMPANY_SAMPLES_GRADE_GEL_FIELD_ID,
  COMPANY_SAMPLES_GRADE_SOL_FIELD_ID,
  COMPANY_SAMPLES_QTY_GEL_FIELD_ID,
  COMPANY_SAMPLES_QTY_SOL_FIELD_ID,
  COMPANY_TEST_RESULT_FIELD_ID,
  DEAL_DIRECTION_FIELD_ID,
  DEAL_SAMPLE_MARK_VOLUME_FIELD_ID,
  DEAL_SAMPLE_SENT_DATE_FIELD_ID,
  DEAL_SAMPLE_TESTING_FIELD_ID,
  DEAL_SAMPLE_TRANSFER_FIELD_ID,
  DEAL_SAMPLE_TVL_DETAILS_FIELD_ID,
  PAYMENT_STATUS_FIELD_ID,
} from "@/lib/crm-constants";

export interface NormalizeOptions {
  userNames?: Record<string, string>;
  statusLabels?: Record<string, Record<string, string>>;
  now?: Date;
}

import {
  formatCurrencyAmount,
  getCurrencySymbol,
  normalizeCurrencyCode,
} from "@/lib/currency";

export {
  formatCurrencyAmount,
  getCurrencySymbol,
  normalizeCurrencyCode,
};

function toStringArray(value: unknown): string[] {
  if (value === null || value === undefined) return [];
  if (Array.isArray(value)) {
    return value.map((v) => String(v).trim()).filter(Boolean);
  }
  const s = String(value).trim();
  return s ? [s] : [];
}

function parseQuantity(val: unknown): number | undefined {
  if (val === null || val === undefined || val === "") return undefined;
  const num = typeof val === "number" ? val : parseFloat(String(val).replace(",", "."));
  return Number.isFinite(num) && num > 0 ? num : undefined;
}

function extractIsoDates(raw: unknown): string[] {
  const strings = toStringArray(raw);
  const out: string[] = [];
  for (const s of strings) {
    const match = s.match(/\d{4}-\d{2}-\d{2}/);
    if (match && !out.includes(match[0])) {
      out.push(match[0]);
    }
  }
  return out;
}

/**
 * Resolve sample status from deal-level "Передача образцов"
 */
function resolveDealSampleStatus(
  rawStatus?: string | null,
  labels?: Record<string, string>
): string | undefined {
  if (!rawStatus) return undefined;
  const trimmed = rawStatus.trim();
  if (DEAL_SAMPLE_PROCESS_MAP[trimmed]) {
    return DEAL_SAMPLE_PROCESS_MAP[trimmed];
  }
  if (labels && labels[trimmed]) {
    return labels[trimmed];
  }
  if (/^\d+$/.test(trimmed)) {
    return `${UNCLASSIFIED_LABEL} (${trimmed})`;
  }
  return trimmed;
}

/**
 * Resolve ALL company-level "Образцы" statuses without collapsing multiple values.
 * Unknown enum IDs are explicitly preserved as "Не классифицировано (ID)".
 */
export function resolveCompanySampleStatuses(
  rawValues: string[],
  labels?: Record<string, string>
): SampleStatusEntry[] {
  return rawValues.map((raw) => {
    let label: string;
    if (COMPANY_SAMPLE_STATUS_MAP[raw]) {
      label = COMPANY_SAMPLE_STATUS_MAP[raw];
    } else if (labels && labels[raw]) {
      label = labels[raw];
    } else if (/^\d+$/.test(raw)) {
      label = `${UNCLASSIFIED_LABEL} (${raw})`;
    } else {
      label = raw;
    }
    return {
      rawValue: raw,
      label,
      source: "COMPANY" as const,
      fieldId: COMPANY_SAMPLES_FIELD_ID,
    };
  });
}

/**
 * Normalize raw Bitrix Deal records into CommercialDeal domain objects
 */
export function normalizeDeals(
  rawDeals: Array<Record<string, any>>,
  options: NormalizeOptions = {}
): CommercialDeal[] {
  const { userNames = {}, statusLabels = {} } = options;
  const dealLabels = statusLabels[DEAL_SAMPLE_TRANSFER_FIELD_ID] || {};
  const testingLabels = statusLabels[DEAL_SAMPLE_TESTING_FIELD_ID] || {};
  const dealProductLabels = statusLabels["UF_CRM_69257BBACD471"] || {};
  const dealIndustryLabels = statusLabels["UF_CRM_6915D8C2C31D0"] || {};
  const dealDirectionLabels = statusLabels[DEAL_DIRECTION_FIELD_ID] || {};

  return rawDeals.map((row) => {
    const id = String(row.ID || row.id || "").trim();
    const title = String(row.TITLE || row.title || "").trim() || "Сделка без названия";
    const companyId = String(row.COMPANY_ID || row.companyId || "").trim();
    const responsibleId = String(row.ASSIGNED_BY_ID || row.responsibleId || "").trim();
    const responsibleName = userNames[responsibleId] || (responsibleId ? `ID ${responsibleId}` : "Не назначен");
    const stageId = String(row.STAGE_ID || row.stageId || "").trim();
    const categoryId = String(row.CATEGORY_ID || row.categoryId || "0").trim();
    const opportunity = parseFloat(String(row.OPPORTUNITY || row.opportunity || "0")) || 0;
    const currencyId = normalizeCurrencyCode(String(row.CURRENCY_ID || row.currencyId || ""));
    const dateCreate = row.DATE_CREATE ? String(row.DATE_CREATE) : undefined;
    const beginDate = row.BEGINDATE ? String(row.BEGINDATE) : undefined;
    const closeDate = row.CLOSEDATE ? String(row.CLOSEDATE) : undefined;

    const rawTransfer = row[DEAL_SAMPLE_TRANSFER_FIELD_ID] ? String(row[DEAL_SAMPLE_TRANSFER_FIELD_ID]) : undefined;
    const sampleTransferStatus = resolveDealSampleStatus(rawTransfer, dealLabels);
    const sampleTransferStatusRaw = rawTransfer;

    const rawTesting = toStringArray(row[DEAL_SAMPLE_TESTING_FIELD_ID]);
    const sampleTestingStatus = rawTesting.map((val) => {
      if (testingLabels[val]) return testingLabels[val];
      if (/^\d+$/.test(val)) return `${UNCLASSIFIED_LABEL} (${val})`;
      return val;
    });
    const sampleTestingStatusRaw = rawTesting;

    const sentDates = extractIsoDates(row[DEAL_SAMPLE_SENT_DATE_FIELD_ID]);
    const sampleSentDate = sentDates[0];
    const tvlDetails = row[DEAL_SAMPLE_TVL_DETAILS_FIELD_ID] ? String(row[DEAL_SAMPLE_TVL_DETAILS_FIELD_ID]) : undefined;
    const markVolume = row[DEAL_SAMPLE_MARK_VOLUME_FIELD_ID] ? String(row[DEAL_SAMPLE_MARK_VOLUME_FIELD_ID]) : undefined;

    const rawPaymentStatus = row[PAYMENT_STATUS_FIELD_ID] ? String(row[PAYMENT_STATUS_FIELD_ID]) : undefined;
    const paymentStatusLabel = rawPaymentStatus ? PAYMENT_STATUS_LABELS[rawPaymentStatus] || rawPaymentStatus : undefined;
    const paymentDates = extractIsoDates(row["UF_CRM_1584460062014"]);
    const paymentDate = paymentDates[0];
    const shipmentDates = extractIsoDates(row["UF_CRM_1584459666824"]);
    const shipmentDate = shipmentDates[0];

    const productTypeRaw = toStringArray(row["UF_CRM_69257BBACD471"]);
    const productType = productTypeRaw.map((v) => dealProductLabels[v] || v);

    const industryRaw = toStringArray(row["UF_CRM_6915D8C2C31D0"]);
    const industry = industryRaw.map((v) => dealIndustryLabels[v] || v);

    const directionRaw = toStringArray(row[DEAL_DIRECTION_FIELD_ID]);
    const direction = directionRaw.map((v) => dealDirectionLabels[v] || v);

    const region = row["UF_CRM_69259C45EC14B"] ? String(row["UF_CRM_69259C45EC14B"]).trim() : undefined;
    const activityLast = row["ACTIVITY_LAST"] ? String(row["ACTIVITY_LAST"]).trim() : undefined;
    const activityNext = row["ACTIVITY_NEXT"] ? String(row["ACTIVITY_NEXT"]).trim() : undefined;

    return {
      id,
      title,
      companyId,
      responsibleId,
      responsibleName,
      stageId,
      categoryId,
      opportunity,
      currencyId,
      dateCreate,
      beginDate,
      closeDate,
      sampleTransferStatus,
      sampleTransferStatusRaw,
      sampleTestingStatus,
      sampleTestingStatusRaw,
      sampleSentDate,
      tvlDetails,
      markVolume,
      paymentStatus: rawPaymentStatus,
      paymentStatusLabel,
      paymentDate,
      shipmentDate,
      productType,
      productTypeRaw,
      industry,
      industryRaw,
      direction,
      directionRaw,
      region,
      activityLast,
      activityNext,
    };
  });
}

/**
 * Checks whether a deal is active (not terminal WON/LOSE or category-prefixed :WON/:LOSE).
 */
export function isDealActive(d: CommercialDeal): boolean {
  return isDealActiveStage(d.stageId);
}

/**
 * Selects representative deal for one-row company analytical view
 * using a deterministic non-monetary priority rule.
 * Priority 1: active deals (stageId not WON and not LOSE) before closed deals.
 * Priority 2: within the same active/closed class, most recent meaningful CRM activity/date:
 *             activityLast > dateCreate > beginDate > closeDate (parsed timestamp).
 * Priority 3: stable Deal ID tie-breaker.
 * NEVER uses opportunity or monetary amount to decide priority across currencies.
 */
export function selectRepresentativeDeal(
  linkedDeals: CommercialDeal[]
): CommercialDeal | undefined {
  if (!linkedDeals || linkedDeals.length === 0) return undefined;
  if (linkedDeals.length === 1) return linkedDeals[0];

  const getDealTimestamp = (d: CommercialDeal): number => {
    const dates = [d.activityLast, d.dateCreate, d.beginDate, d.closeDate];
    for (const raw of dates) {
      if (raw) {
        const ts = Date.parse(raw);
        if (!isNaN(ts)) return ts;
      }
    }
    return 0;
  };

  const sorted = [...linkedDeals].sort((a, b) => {
    // Priority 1: active before closed
    const aActive = isDealActive(a);
    const bActive = isDealActive(b);
    if (aActive !== bActive) {
      return aActive ? -1 : 1;
    }

    // Priority 2: most recent timestamp
    const tsA = getDealTimestamp(a);
    const tsB = getDealTimestamp(b);
    if (tsA !== tsB) {
      return tsB - tsA; // newer first
    }

    // Priority 3: stable Deal ID tie-breaker
    return String(b.id || "").localeCompare(String(a.id || ""), undefined, { numeric: true });
  });

  return sorted[0];
}

/**
 * Normalize raw Bitrix Company records and join them with linked deals.
 * Implements deterministic precedence: Deal sample state > Company fallback.
 * Preserves ALL statuses, partitions dates by provenance, and strictly gates bottlenecks.
 */
export function normalizeCompanies(
  rawCompanies: Array<Record<string, any>>,
  normalizedDeals: CommercialDeal[],
  options: NormalizeOptions = {}
): CommercialCompany[] {
  const { userNames = {}, statusLabels = {}, now = new Date() } = options;
  const companySampleLabels = statusLabels[COMPANY_SAMPLES_FIELD_ID] || {};
  const companyIndustryLabels = statusLabels["INDUSTRY"] || {};
  const companyDirectionLabels = statusLabels[COMPANY_DIRECTION_FIELD_ID] || {};
  const companyProductLabels = statusLabels[COMPANY_PRODUCT_TYPE_FIELD_ID] || {};

  // Group deals by company ID
  const dealsByCompany = new Map<string, CommercialDeal[]>();
  for (const deal of normalizedDeals) {
    if (!deal.companyId || deal.companyId === "0") continue;
    const list = dealsByCompany.get(deal.companyId);
    if (list) list.push(deal);
    else dealsByCompany.set(deal.companyId, [deal]);
  }

  const seenIds = new Set<string>();
  const companies: CommercialCompany[] = [];

  for (const row of rawCompanies) {
    const id = String(row.ID || row.id || "").trim();
    if (!id || seenIds.has(id)) continue;
    seenIds.add(id);

    const title = String(row.TITLE || row.title || "").trim() || "Компания без названия";
    const responsibleId = String(row.ASSIGNED_BY_ID || row.responsibleId || "").trim();
    const responsibleName = userNames[responsibleId] || (responsibleId ? `ID ${responsibleId}` : "Не назначен");
    const dateCreate = row.DATE_CREATE ? String(row.DATE_CREATE) : undefined;

    const industryRaw = row.INDUSTRY ? String(row.INDUSTRY).trim() : undefined;
    const industry = (industryRaw && companyIndustryLabels[industryRaw]) ? companyIndustryLabels[industryRaw] : industryRaw;

    const directionRaw = toStringArray(row[COMPANY_DIRECTION_FIELD_ID]);
    const direction = directionRaw.map((v) => companyDirectionLabels[v] || v);

    const region = row["UF_CRM_69259C45EC14B"] ? String(row["UF_CRM_69259C45EC14B"]).trim() : undefined;

    const productTypeRaw = toStringArray(row[COMPANY_PRODUCT_TYPE_FIELD_ID]);
    const productType = productTypeRaw.map((v) => companyProductLabels[v] || v);

    const appNew = row[COMPANY_APPLICATION_NEW_FIELD_ID] ? String(row[COMPANY_APPLICATION_NEW_FIELD_ID]).trim() : "";
    const appOld = row[COMPANY_APPLICATION_OLD_FIELD_ID] ? String(row[COMPANY_APPLICATION_OLD_FIELD_ID]).trim() : "";
    const application = appNew || appOld || undefined;

    const gradeGel = toStringArray(row[COMPANY_SAMPLES_GRADE_GEL_FIELD_ID]);
    const gradeSol = toStringArray(row[COMPANY_SAMPLES_GRADE_SOL_FIELD_ID]);
    const qtyGel = parseQuantity(row[COMPANY_SAMPLES_QTY_GEL_FIELD_ID]);
    const qtySol = parseQuantity(row[COMPANY_SAMPLES_QTY_SOL_FIELD_ID]);
    const sampleTestResult = row[COMPANY_TEST_RESULT_FIELD_ID] ? String(row[COMPANY_TEST_RESULT_FIELD_ID]).trim() : undefined;

    const companyDatesMulti = extractIsoDates(row[COMPANY_SAMPLES_DATE_MULTI_FIELD_ID]);
    const companyDatesSingle = extractIsoDates(row[COMPANY_SAMPLES_DATE_SINGLE_FIELD_ID]);

    const linkedDeals = dealsByCompany.get(id) || [];

    // Collect ALL sample status entries with complete provenance:
    const sampleStatusEntries: SampleStatusEntry[] = [];

    // 1. Deal-level sample statuses
    for (const d of linkedDeals) {
      if (d.sampleTransferStatus) {
        sampleStatusEntries.push({
          rawValue: d.sampleTransferStatusRaw || d.sampleTransferStatus,
          label: d.sampleTransferStatus,
          source: "DEAL",
          fieldId: DEAL_SAMPLE_TRANSFER_FIELD_ID,
        });
      }
      for (let i = 0; i < d.sampleTestingStatus.length; i++) {
        const label = d.sampleTestingStatus[i];
        const raw = d.sampleTestingStatusRaw?.[i] || label;
        sampleStatusEntries.push({
          rawValue: raw,
          label,
          source: "DEAL",
          fieldId: DEAL_SAMPLE_TESTING_FIELD_ID,
        });
      }
    }

    // 2. Company-level sample statuses
    const rawCompanySamples = toStringArray(row[COMPANY_SAMPLES_FIELD_ID]);
    const companyStatusEntries = resolveCompanySampleStatuses(rawCompanySamples, companySampleLabels);
    for (const entry of companyStatusEntries) {
      sampleStatusEntries.push(entry);
    }

    // Compute distinct lists of labels and raw values
    const sampleStatuses: string[] = [];
    const sampleStatusRawValues: string[] = [];
    for (const entry of sampleStatusEntries) {
      if (!sampleStatuses.includes(entry.label)) {
        sampleStatuses.push(entry.label);
      }
      if (!sampleStatusRawValues.includes(entry.rawValue)) {
        sampleStatusRawValues.push(entry.rawValue);
      }
    }

    // Backward-compatible single sampleStatus for primary UI display:
    // Deal precedence over Company fallback
    let sampleStatus = "—";
    let sampleStatusRaw: string | undefined = undefined;
    let sampleStatusSource: SampleStatusSource = "NONE";

    const dealWithStatus = linkedDeals.find((d) => Boolean(d.sampleTransferStatus));
    if (dealWithStatus && dealWithStatus.sampleTransferStatus) {
      sampleStatus = dealWithStatus.sampleTransferStatus;
      sampleStatusRaw = dealWithStatus.sampleTransferStatusRaw;
      sampleStatusSource = "DEAL";
    } else if (companyStatusEntries.length > 0) {
      sampleStatus = companyStatusEntries[0].label;
      sampleStatusRaw = companyStatusEntries[0].rawValue;
      sampleStatusSource = "COMPANY";
    }

    // Dates reconciliation with explicit provenance:
    const sampleDealSentDates = Array.from(
      new Set(linkedDeals.map((d) => d.sampleSentDate).filter(Boolean) as string[])
    ).sort();
    const sampleCompanyTransferDates = Array.from(
      new Set([...companyDatesSingle, ...companyDatesMulti])
    ).sort();
    const sampleAllDates = Array.from(
      new Set([...sampleDealSentDates, ...sampleCompanyTransferDates])
    ).sort();

    // Required Release 1 rule for period events:
    // Use valid Deal shipment dates when Deal evidence exists.
    // Use Company transfer dates only as fallback when no Deal date exists.
    const sampleEventDatesForPeriodMetrics = sampleDealSentDates.length > 0
      ? sampleDealSentDates
      : sampleCompanyTransferDates;

    const sampleShipmentDate = sampleDealSentDates[0] || sampleCompanyTransferDates[0] || undefined;

    // Representative deal for commercial overview (deterministic non-monetary priority)
    const primaryDeal = selectRepresentativeDeal(linkedDeals);

    // Evaluate attention / bottlenecks
    const attentionReasons: string[] = [];

    // Bottleneck 1: Sample under testing > 14 days
    if (sampleStatus === "На испытании" && sampleShipmentDate) {
      const days = calculateDaysWaiting(sampleShipmentDate, now);
      if (days !== null && days > COMMERCIAL_THRESHOLDS.SAMPLE_TESTING_ATTENTION_DAYS) {
        attentionReasons.push(`Образцы на испытании ${days} дн. (порог ${COMMERCIAL_THRESHOLDS.SAMPLE_TESTING_ATTENTION_DAYS} дн.)`);
      }
    }

    // Bottleneck 2: Sample succeeded but no commercial deal progress
    if (sampleStatus === "Подошли") {
      const hasProgressedDeal = linkedDeals.some((d) => isProgressedCommercialStage(d.stageId));
      if (!hasProgressedDeal) {
        attentionReasons.push("Образец подошел, но нет прогресса по коммерческой сделке");
      }
    }

    // Bottleneck 3: Invoice sent / payment awaiting
    // Do not fabricate an invoice age using deal creation/begin date.
    for (const d of linkedDeals) {
      if (d.paymentStatus && INVOICE_SENT_STATUS_CODES.has(d.paymentStatus)) {
        attentionReasons.push(`Счёт ожидает оплаты по сделке «${d.title}»`);
      }
    }

    // Bottleneck 4: Stalled deal (active deal older than STALLED_DEAL_DAYS threshold)
    for (const d of linkedDeals) {
      if (isDealActiveStage(d.stageId)) {
        const refDate = d.beginDate || d.dateCreate;
        const days = calculateDaysWaiting(refDate, now) || 0;
        if (days > COMMERCIAL_THRESHOLDS.STALLED_DEAL_DAYS) {
          const reason = !d.activityNext
            ? `Сделка без движения ${days} дн. (нет следующего шага) «${d.title}»`
            : `Сделка без движения ${days} дн. «${d.title}»`;
          attentionReasons.push(reason);
        }
      }
    }

    companies.push({
      id,
      title,
      responsibleId,
      responsibleName,
      dateCreate,
      industry,
      industryRaw,
      direction,
      directionRaw,
      region,
      productType,
      productTypeRaw,
      application,
      sampleStatus,
      sampleStatusRaw,
      sampleStatusSource,
      sampleStatuses,
      sampleStatusRawValues,
      sampleStatusEntries,
      sampleShipmentDate,
      sampleDealSentDates,
      sampleCompanyTransferDates,
      sampleEventDatesForPeriodMetrics,
      sampleAllDates,
      sampleTestResult,
      gradeGel,
      gradeSol,
      qtyGel,
      qtySol,
      deals: linkedDeals,
      primaryDealId: primaryDeal?.id,
      primaryDealTitle: primaryDeal?.title,
      primaryDealStageId: primaryDeal?.stageId,
      primaryDealStageName: primaryDeal?.stageName,
      primaryDealOpportunity: primaryDeal?.opportunity,
      primaryDealCurrencyId: primaryDeal?.currencyId,
      primaryDealPaymentStatus: primaryDeal?.paymentStatusLabel,
      primaryDealPaymentDate: primaryDeal?.paymentDate,
      primaryDealActivityNext: primaryDeal?.activityNext,
      hasAttention: attentionReasons.length > 0,
      attentionReasons,
    });
  }

  return companies;
}
