// src/lib/commercial-funnel/normalize.ts
// ─────────────────────────────────────────────────────────────────────
// Authoritative data normalization and reconciliation for Commercial Funnel.
//
// Phase C: sample state is NO LONGER resolved here. Commercial Funnel
// consumes the ONE canonical sample engine (src/lib/samples) via the
// CanonicalSampleDomain built in the API route. This module only projects
// canonical facts onto CommercialCompany and keeps Deal-level fields for
// register/preview. The former second sample engine (deal-based current
// state selection incl. the marker field) is removed.
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
import { isValidCalendarDate, isValidTime, parseStrictDate } from "@/lib/scalar-safety";
import { evaluateStalledDeal, isActiveDealMissingNextStep } from "./bottlenecks";
import type {
  CommercialCompany,
  CommercialDeal,
  SampleStatusEntry,
  SampleStatusSource,
} from "./types";
import {
  isDealActiveStage,
  isCommercialContinuationStage,
  isTerminalStage,
} from "./stage-utils";
import { resolveDealStage } from "@/lib/deal-preview";
import {
  COMPANY_APPLICATION_FIELD_ID,
  COMPANY_APPLICATION_OLD_FIELD_ID,
  COMPANY_DIRECTION_CURRENT_FIELD_ID,
  COMPANY_DIRECTION_FIELD_ID,
  COMPANY_INDUSTRY_CURRENT_FIELD_ID,
  COMPANY_REGION_FIELD_ID,
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
  DEAL_INDUSTRY_FIELD_ID,
  DEAL_PAYMENT_DATE_FIELD_ID,
  DEAL_PRODUCT_TYPE_FIELD_ID,
  DEAL_REGION_FIELD_ID,
  DEAL_SAMPLE_MARK_VOLUME_FIELD_ID,
  DEAL_SAMPLE_SENT_DATE_FIELD_ID,
  DEAL_SAMPLE_TESTING_FIELD_ID,
  DEAL_SAMPLE_TESTING_LEGACY_FIELD_ID,
  DEAL_SAMPLE_TRANSFER_FIELD_ID,
  DEAL_SAMPLE_TVL_DETAILS_FIELD_ID,
  DEAL_SHIPMENT_DATE_FIELD_ID,
  PAYMENT_STATUS_FIELD_ID,
} from "@/lib/crm-constants";
import type { DealActivityEntry } from "@/lib/bitrix-activities";
import type {
  CanonicalSampleDomain,
} from "@/lib/samples/aggregate";
import type {
  SampleCurrentResolutionQuality,
  SampleSentEvent,
} from "./types";

export interface NormalizeOptions {
  userNames?: Record<string, string>;
  statusLabels?: Record<string, Record<string, string>>;
  activities?: Record<string, DealActivityEntry>;
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

/**
 * Canonical helper for non-boolean CRM enum/text classification fields.
 * Treats null, undefined, false, "false", "null", "undefined", "", and whitespace-only
 * strings as empty. Preserves "0", valid enum IDs, and unknown non-empty enums ("265", "9999").
 * Does NOT drop true or "true" unless explicitly defined.
 */
export function isCrmClassificationEmpty(value: unknown): boolean {
  if (value === null || value === undefined || value === false) return true;
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (trimmed === "") return true;
    const lower = trimmed.toLowerCase();
    if (lower === "false" || lower === "null" || lower === "undefined") {
      return true;
    }
  }
  return false;
}

export function cleanCrmClassificationString(value: unknown): string | undefined {
  if (isCrmClassificationEmpty(value)) return undefined;
  const s = String(value).trim();
  return s ? s : undefined;
}

export function toCrmClassificationArray(value: unknown): string[] {
  if (isCrmClassificationEmpty(value)) return [];
  if (Array.isArray(value)) {
    return value
      .map(cleanCrmClassificationString)
      .filter((v): v is string => Boolean(v));
  }
  const s = cleanCrmClassificationString(value);
  return s ? [s] : [];
}

function toStringArray(value: unknown): string[] {
  return toCrmClassificationArray(value);
}

/**
 * Strict numeric parser for domain metrics and quantities.
 * Accepts numbers, numeric strings with dot/comma, and space-separated thousands.
 * Strictly rejects malformed numeric strings (e.g. "12abc", "1.2.3", "---", "RUB 100").
 */
export function parseStrictNumber(value: unknown): number | undefined {
  if (value === null || value === undefined) return undefined;
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : undefined;
  }
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  if (!trimmed) return undefined;

  const normalized = trimmed.replace(/[\s\u00A0]+/g, "").replace(",", ".");
  if (!/^[+-]?\d+(?:\.\d+)?$/.test(normalized)) {
    return undefined;
  }

  const num = Number(normalized);
  return Number.isFinite(num) ? num : undefined;
}

function parseQuantity(val: unknown): number | undefined {
  if (val === null || val === undefined || val === "") return undefined;
  const num = parseStrictNumber(val);
  return num !== undefined && num > 0 ? num : undefined;
}

const MOSCOW_DATE_FORMATTER = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Europe/Moscow",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

function extractSingleIsoDate(rawStr: string): string | null {
  const str = rawStr.trim();
  if (!str || str === "—") return null;

  // 1. ISO Date: YYYY-MM-DD
  const m1 = str.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (m1) {
    const y = Number(m1[1]);
    const m = Number(m1[2]);
    const d = Number(m1[3]);
    return isValidCalendarDate(y, m, d) ? `${m1[1]}-${m1[2]}-${m1[3]}` : null;
  }

  // 2. Russian Date: DD.MM.YYYY
  const m2 = str.match(/^(\d{2})\.(\d{2})\.(\d{4})$/);
  if (m2) {
    const d = Number(m2[1]);
    const m = Number(m2[2]);
    const y = Number(m2[3]);
    return isValidCalendarDate(y, m, d) ? `${m2[3]}-${m2[2]}-${m2[1]}` : null;
  }

  // 3. ISO Datetime: YYYY-MM-DD[T ]HH:mm(:ss)?
  const m3 = str.match(/^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2}))?/);
  if (m3) {
    const y = Number(m3[1]);
    const m = Number(m3[2]);
    const d = Number(m3[3]);
    const hh = Number(m3[4]);
    const mm = Number(m3[5]);
    const ss = Number(m3[6] || 0);
    if (!isValidCalendarDate(y, m, d) || !isValidTime(hh, mm, ss)) return null;
    if (str.includes("Z") || str.match(/[+-]\d{2}:?\d{2}$/)) {
      const dt = parseStrictDate(str, { mode: "DATETIME_BUSINESS_TIMEZONE" });
      return dt ? MOSCOW_DATE_FORMATTER.format(dt) : null;
    }
    return `${m3[1]}-${m3[2]}-${m3[3]}`;
  }

  // 4. Russian Datetime: DD.MM.YYYY[T ]HH:mm(:ss)?
  const m4 = str.match(/^(\d{2})\.(\d{2})\.(\d{4})[T ](\d{2}):(\d{2})(?::(\d{2}))?/);
  if (m4) {
    const d = Number(m4[1]);
    const m = Number(m4[2]);
    const y = Number(m4[3]);
    const hh = Number(m4[4]);
    const mm = Number(m4[5]);
    const ss = Number(m4[6] || 0);
    if (!isValidCalendarDate(y, m, d) || !isValidTime(hh, mm, ss)) return null;
    if (str.includes("Z") || str.match(/[+-]\d{2}:?\d{2}$/)) {
      const dt = parseStrictDate(str, { mode: "DATETIME_BUSINESS_TIMEZONE" });
      return dt ? MOSCOW_DATE_FORMATTER.format(dt) : null;
    }
    return `${m4[3]}-${m4[2]}-${m4[1]}`;
  }

  return null;
}

function extractIsoDates(raw: unknown): string[] {
  const strings = toStringArray(raw);
  const out: string[] = [];
  for (const s of strings) {
    const iso = extractSingleIsoDate(s);
    if (iso && !out.includes(iso)) {
      out.push(iso);
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
  const cleaned = cleanCrmClassificationString(rawStatus);
  if (!cleaned) return undefined;
  if (DEAL_SAMPLE_PROCESS_MAP[cleaned]) {
    return DEAL_SAMPLE_PROCESS_MAP[cleaned];
  }
  if (labels && labels[cleaned]) {
    return labels[cleaned];
  }
  if (/^\d+$/.test(cleaned)) {
    return UNCLASSIFIED_LABEL;
  }
  return cleaned;
}

/**
 * Resolve ALL company-level "Образцы" statuses without collapsing multiple values.
 * Unknown enum IDs are explicitly preserved as "Не классифицировано (ID)".
 */
export function resolveCompanySampleStatuses(
  rawValues: string[],
  labels?: Record<string, string>
): SampleStatusEntry[] {
  const cleanedValues = rawValues
    .map(cleanCrmClassificationString)
    .filter((v): v is string => Boolean(v));

  return cleanedValues.map((raw) => {
    let label: string;
    if (COMPANY_SAMPLE_STATUS_MAP[raw]) {
      label = COMPANY_SAMPLE_STATUS_MAP[raw];
    } else if (labels && labels[raw]) {
      label = labels[raw];
    } else if (/^\d+$/.test(raw)) {
      label = UNCLASSIFIED_LABEL;
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
  const dealProductLabels = statusLabels[DEAL_PRODUCT_TYPE_FIELD_ID] || {};
  const dealIndustryLabels = statusLabels[DEAL_INDUSTRY_FIELD_ID] || {};
  const dealDirectionLabels = statusLabels[DEAL_DIRECTION_FIELD_ID] || {};

  return rawDeals.map((row) => {
    const id = String(row.ID || row.id || "").trim();
    const title = String(row.TITLE || row.title || "").trim() || "Сделка без названия";
    const companyId = String(row.COMPANY_ID || row.companyId || "").trim();
    const responsibleId = String(row.ASSIGNED_BY_ID || row.responsibleId || "").trim();
    const responsibleName = userNames[responsibleId] || (responsibleId ? `ID ${responsibleId}` : "Не назначен");
    const stageId = String(row.STAGE_ID || row.stageId || "").trim();
    const categoryId = String(row.CATEGORY_ID || row.categoryId || "0").trim();
    const rawOpp = row.OPPORTUNITY ?? row.opportunity;
    let opportunity: number | null = null;
    let opportunityQuality: "VALID" | "UNKNOWN" | "INVALID" = "UNKNOWN";
    if (rawOpp !== undefined && rawOpp !== null && String(rawOpp).trim() !== "") {
      const parsedOpp = parseStrictNumber(rawOpp);
      if (parsedOpp !== undefined) {
        opportunity = parsedOpp;
        opportunityQuality = "VALID";
      } else {
        opportunity = null;
        opportunityQuality = "INVALID";
      }
    } else {
      opportunity = null;
      opportunityQuality = "UNKNOWN";
    }
    const currencyId = normalizeCurrencyCode(String(row.CURRENCY_ID || row.currencyId || ""));
    const dateCreate = extractIsoDates(row.DATE_CREATE)[0];
    const beginDate = extractIsoDates(row.BEGINDATE)[0];
    const closeDate = extractIsoDates(row.CLOSEDATE)[0];

    const rawTransfer = cleanCrmClassificationString(row[DEAL_SAMPLE_TRANSFER_FIELD_ID]);
    const sampleTransferStatus = resolveDealSampleStatus(rawTransfer, dealLabels);
    const sampleTransferStatusRaw = rawTransfer;

    const rawTesting = toStringArray(
      row[DEAL_SAMPLE_TESTING_LEGACY_FIELD_ID] ?? row[DEAL_SAMPLE_TESTING_FIELD_ID]
    );
    const legacyTestingMarkerRaw = rawTesting.length > 0 ? rawTesting : undefined;

    const sentDates = extractIsoDates(row[DEAL_SAMPLE_SENT_DATE_FIELD_ID]);
    const sampleSentDate = sentDates[0];
    const tvlDetails = cleanCrmClassificationString(row[DEAL_SAMPLE_TVL_DETAILS_FIELD_ID]);
    const markVolume = cleanCrmClassificationString(row[DEAL_SAMPLE_MARK_VOLUME_FIELD_ID]);

    const rawPaymentStatus = cleanCrmClassificationString(row[PAYMENT_STATUS_FIELD_ID]);
    const paymentStatusLabel = rawPaymentStatus ? PAYMENT_STATUS_LABELS[rawPaymentStatus] || rawPaymentStatus : undefined;
    const paymentDates = extractIsoDates(row[DEAL_PAYMENT_DATE_FIELD_ID]);
    const paymentDate = paymentDates[0];
    const shipmentDates = extractIsoDates(row[DEAL_SHIPMENT_DATE_FIELD_ID]);
    const shipmentDate = shipmentDates[0];

    const productTypeRaw = toStringArray(row[DEAL_PRODUCT_TYPE_FIELD_ID]);
    const productType = productTypeRaw.map((v) => dealProductLabels[v] || v);

    const industryRaw = toStringArray(row[DEAL_INDUSTRY_FIELD_ID]);
    const industry = industryRaw.map((v) => dealIndustryLabels[v] || v);

    const directionRaw = toStringArray(row[DEAL_DIRECTION_FIELD_ID]);
    const direction = directionRaw.map((v) => dealDirectionLabels[v] || v);

    const region = cleanCrmClassificationString(row[DEAL_REGION_FIELD_ID]);
    let activityLast: string | undefined;
    let activityNext: string | undefined;
    let activityNextDate: string | undefined;
    let activityDataKnown: boolean;

    if (options.activities) {
      const act = id ? options.activities[id] : undefined;
      if (act && act.dataKnown) {
        activityDataKnown = true;
        if (act.last?.CREATED) {
          activityLast = act.last.CREATED;
        }
        if (act.next) {
          activityNext =
            act.next.SUBJECT?.trim() ||
            (act.next.DEADLINE ? `Запланировано на ${act.next.DEADLINE}` : "Запланированная активность");
          if (act.next.DEADLINE) {
            activityNextDate = act.next.DEADLINE;
          }
        }
      } else {
        // Failed or incomplete batch or not in activities map -> UNKNOWN
        activityDataKnown = false;
      }
    } else {
      activityLast = row["ACTIVITY_LAST"]
        ? String(row["ACTIVITY_LAST"]).trim()
        : row.activityLast
        ? String(row.activityLast).trim()
        : undefined;
      activityNext = row["ACTIVITY_NEXT"]
        ? String(row["ACTIVITY_NEXT"]).trim()
        : row.activityNext
        ? String(row.activityNext).trim()
        : undefined;
      activityNextDate = row.activityNextDate ? String(row.activityNextDate).trim() : undefined;
      const hasActivityKeys =
        "ACTIVITY_LAST" in row ||
        "ACTIVITY_NEXT" in row ||
        "activityLast" in row ||
        "activityNext" in row ||
        "activityDataKnown" in row;
      activityDataKnown =
        typeof row.activityDataKnown === "boolean"
          ? row.activityDataKnown
          : Boolean(
              hasActivityKeys &&
                (row["ACTIVITY_LAST"] !== undefined ||
                  row["ACTIVITY_NEXT"] !== undefined ||
                  row.activityLast !== undefined ||
                  row.activityNext !== undefined)
            );
    }

    const stageLabels = statusLabels["STAGE_ID"] || statusLabels.STAGE_ID;
    const stageListValues = stageLabels
      ? Object.entries(stageLabels).map(([lvId, lvVal]) => ({ ID: lvId, VALUE: lvVal }))
      : undefined;
    const stageFieldsMock = stageListValues ? [{ id: "STAGE_ID", listValues: stageListValues }] : undefined;
    const resolvedStageName = resolveDealStage(stageId, stageFieldsMock, categoryId);
    const stageName =
      resolvedStageName &&
      resolvedStageName !== UNCLASSIFIED_LABEL &&
      resolvedStageName !== stageId &&
      resolvedStageName !== "—"
        ? resolvedStageName
        : UNCLASSIFIED_LABEL;

    return {
      id,
      title,
      companyId,
      responsibleId,
      responsibleName,
      stageId,
      stageName,
      categoryId,
      opportunity,
      opportunityQuality,
      currencyId,
      dateCreate,
      beginDate,
      closeDate,
      sampleTransferStatus,
      sampleTransferStatusRaw,
      legacyTestingMarkerRaw,
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
      activityNextDate,
      activityDataKnown,
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

  let best = linkedDeals[0];
  let bestActive = isDealActive(best);
  let bestTs = getDealTimestamp(best);

  for (let i = 1; i < linkedDeals.length; i++) {
    const candidate = linkedDeals[i];
    const candActive = isDealActive(candidate);
    if (candActive !== bestActive) {
      if (candActive) {
        best = candidate;
        bestActive = candActive;
        bestTs = getDealTimestamp(candidate);
      }
      continue;
    }

    const candTs = getDealTimestamp(candidate);
    if (candTs !== bestTs) {
      if (candTs > bestTs) {
        best = candidate;
        bestActive = candActive;
        bestTs = candTs;
      }
      continue;
    }

    // Stable Deal ID tie-breaker (higher ID wins)
    const numCand = Number(candidate.id);
    const numBest = Number(best.id);
    let tieWinner = false;
    if (!isNaN(numCand) && !isNaN(numBest)) {
      tieWinner = numCand > numBest;
    } else {
      tieWinner = String(candidate.id || "").localeCompare(String(best.id || "")) > 0;
    }
    if (tieWinner) {
      best = candidate;
      bestActive = candActive;
      bestTs = candTs;
    }
  }

  return best;
}



/**
 * Projects canonical sample facts (from the ONE canonical sample engine)
 * onto a normalized CommercialCompany. This replaces the former second
 * sample engine: current state, grades, result, shipment date, sent
 * events and resolution quality all come from the canonical domain.
 *
 * Sample-based attention reasons (testing stalled / success without
 * commercial progression) are recomputed from the canonical state; deal-
 * level reasons (invoice awaiting, stalled deals) are preserved from the
 * earlier reprojection.
 */
export function applyCanonicalSampleDomain(
  companies: CommercialCompany[],
  domain: CanonicalSampleDomain,
  options: NormalizeOptions = {}
): CommercialCompany[] {
  const { userNames = {}, statusLabels = {}, now = new Date() } = options;
  const companySampleLabels = statusLabels[COMPANY_SAMPLES_FIELD_ID] || {};
  return companies.map((company) => {
    const canonical = domain.canonicalByCompany.get(company.id);
    if (!canonical) return company;

    const state = canonical.currentState;

    // Resolve company enum raw values to human labels via the canonical
    // CF maps (shared with resolveCompanySampleStatuses).
    const resolveCompanyLabel = (raw: string): string => {
      if (COMPANY_SAMPLE_STATUS_MAP[raw]) return COMPANY_SAMPLE_STATUS_MAP[raw];
      if (companySampleLabels[raw]) return companySampleLabels[raw];
      if (/^\d+$/.test(raw)) return UNCLASSIFIED_LABEL;
      return raw;
    };
    const resolvedStatusValues = state.statusValues.map(resolveCompanyLabel);

    // Sent events with per-event attribution (SP/Deal/Company provenance).
    const sampleSentEvents: SampleSentEvent[] = canonical.historicalSentDates.map((s) => ({
      date: s.date,
      source:
        s.source === "SMART_PROCESS"
          ? ("SMART_PROCESS" as const)
          : s.source === "DEAL_LEGACY"
          ? ("DEAL" as const)
          : ("COMPANY" as const),
      responsibleId:
        s.source === "SMART_PROCESS"
          ? canonical.evidenceUnits.find(
              (u) => u.source === "SMART_PROCESS" && u.processItemId === s.sourceEntityId
            )?.responsibleId
          : s.source === "DEAL_LEGACY"
          ? company.deals.find((d) => d.id === s.dealId)?.responsibleId
          : company.responsibleId,
      dealId: s.source === "DEAL_LEGACY" ? s.dealId : undefined,
      processItemId: s.source === "SMART_PROCESS" ? s.sourceEntityId : undefined,
    }));

    // Map canonical source → CF SampleStatusSource.
    const sampleStatusSource: SampleStatusSource =
      state.source === "SMART_PROCESS"
        ? "SMART_PROCESS"
        : state.source === "DEAL_LEGACY"
        ? "DEAL"
        : state.source === "COMPANY_LEGACY"
        ? "COMPANY"
        : "NONE";

    // Current responsible per §25: SP → SP ASSIGNED_BY_ID; Deal → Deal
    // responsible; Company → Company owner. SP item ID never in Deal field.
    let sampleResponsibleId: string | undefined;
    let sampleResponsibleName: string | undefined;
    let sampleResponsibleDealId: string | undefined;
    let sampleResponsibleProcessItemId: string | undefined;
    let sampleRelatedDealId: string | undefined;

    if (state.source === "SMART_PROCESS" && state.quality === "RESOLVED") {
      const spUnit = canonical.evidenceUnits.find(
        (u) => u.source === "SMART_PROCESS" && u.processItemId === state.processItemId
      );
      sampleResponsibleId = spUnit?.responsibleId;
      sampleResponsibleProcessItemId = state.processItemId;
      sampleRelatedDealId = state.winningDealId;
      sampleResponsibleDealId = undefined; // SP provenance is NOT a Deal ID
    } else if (state.source === "DEAL_LEGACY" && state.winningDealId && state.quality === "RESOLVED") {
      const deal = company.deals.find((d) => d.id === state.winningDealId);
      sampleResponsibleId = deal?.responsibleId;
      sampleResponsibleDealId = state.winningDealId;
    } else if (state.source === "COMPANY_LEGACY" && state.quality === "RESOLVED") {
      sampleResponsibleId = company.responsibleId;
    }

    if (sampleResponsibleId) {
      const dealMatch = company.deals.find((d) => d.responsibleId === sampleResponsibleId)?.responsibleName;
      sampleResponsibleName =
        userNames[sampleResponsibleId] ||
        dealMatch ||
        (company.responsibleId === sampleResponsibleId ? company.responsibleName : undefined) ||
        `ID ${sampleResponsibleId}`;
    }

    // SP current grades/marks when the item provides the fact.
    const spUnit =
      state.source === "SMART_PROCESS" && state.quality === "RESOLVED"
        ? canonical.evidenceUnits.find(
            (u) => u.source === "SMART_PROCESS" && u.processItemId === state.processItemId
          )
        : undefined;
    const gradeGel = spUnit?.grades.filter((g) => g.productFamily === "Гель").map((g) => g.value) ?? company.gradeGel;
    const gradeSol = spUnit?.grades.filter((g) => g.productFamily === "Золь").map((g) => g.value) ?? company.gradeSol;

    // SP manual sent date is the authoritative shipment date for the
    // current cycle when SP resolved. DEAL source: the winning deal's OWN
    // sent date (strict provenance — never borrowed from another cycle).
    // COMPANY source: company transfer date. Legacy values never override SP.
    const spSentDate = spUnit?.sentDates[0]?.date;
    const winningDeal =
      state.source === "DEAL_LEGACY" && state.winningDealId && state.quality === "RESOLVED"
        ? company.deals.find((d) => d.id === state.winningDealId)
        : undefined;
    const dealSentDate = winningDeal?.sampleSentDate;
    const companyTransferDate = company.sampleCompanyTransferDates?.[0];
    const sampleShipmentDate = spSentDate ?? dealSentDate ?? companyTransferDate;

    // SP test result when the item provides the fact.
    const sampleTestResult = spUnit?.rawTestResult ?? company.sampleTestResult;

    // Defect 3: fail-closed current sample status projection
    let currentSampleStatus = "—";
    if (state.quality === "RESOLVED") {
      currentSampleStatus = resolvedStatusValues[0] ?? UNCLASSIFIED_LABEL;
    } else if (state.quality === "AMBIGUOUS" || state.quality === "AMBIGUOUS_MULTIPLE_ACTIVE") {
      currentSampleStatus = UNCLASSIFIED_LABEL;
    } else {
      currentSampleStatus = "—";
    }

    return {
      ...company,
      sampleStatus: currentSampleStatus,
      sampleStatusSource,
      sampleStatuses: resolvedStatusValues,
      sampleStatusRawValues: state.statusValues,
      sampleCurrentResolutionQuality: state.quality,
      sampleResponsibleId,
      sampleResponsibleName,
      sampleResponsibleDealId,
      sampleResponsibleProcessItemId,
      sampleRelatedDealId,
      gradeGel,
      gradeSol,
      sampleShipmentDate,
      sampleTestResult,
      sampleSentEvents,
      // Extend the date union with SP sent dates (dedup at Company+date level).
      sampleAllDates: Array.from(
        new Set([...company.sampleAllDates, ...sampleSentEvents.map((e) => e.date)])
      ).sort(),
      // Provenance rule (unchanged): Deal shipment dates are authoritative
      // for period metrics when present; Company transfer dates are
      // fallback only when no Deal date exists. Canonical SP sent events
      // always participate.
      sampleEventDatesForPeriodMetrics: (() => {
        const spDates = sampleSentEvents
          .filter((e) => e.source === "SMART_PROCESS")
          .map((e) => e.date);
        if (spDates.length > 0) {
          return Array.from(new Set([...spDates, ...sampleSentEvents.filter((e) => e.source !== "COMPANY").map((e) => e.date)])).sort();
        }
        const dealDates = sampleSentEvents.filter((e) => e.source === "DEAL").map((e) => e.date);
        if (dealDates.length > 0) {
          return Array.from(new Set(dealDates)).sort();
        }
        return companyMatchesShipment(company)
          ? Array.from(new Set(sampleSentEvents.filter((e) => e.source === "COMPANY").map((e) => e.date))).sort()
          : [];
      })(),
      // Recompute canonical sample-based attention reasons from the
      // canonical current state (never stale pre-canonical status).
      ...recomputeCanonicalSampleAttention(
        {
          ...company,
          sampleStatus: currentSampleStatus,
          sampleStatusSource,
          sampleStatuses: resolvedStatusValues,
          sampleShipmentDate,
        },
        now
      ),
    };
  });
}

/**
 * Company-level facts (transfer dates) may serve as period-metric
 * fallback only when the company facts are included (not filtered out).
 */
function companyMatchesShipment(company: CommercialCompany): boolean {
  return company.companyFactsIncluded !== false;
}

/**
 * Recomputes sample-based attention reasons (Bottleneck 1: testing
 * stalled; Bottleneck 2: success without commercial progression) from the
 * canonical current state. Deal-level reasons (invoice awaiting, stalled
 * deals) are preserved from the input company's attentionReasons.
 */
function recomputeCanonicalSampleAttention(
  company: CommercialCompany,
  now: Date
): Pick<CommercialCompany, "hasAttention" | "attentionReasons"> {
  const dealLevelReasons = company.attentionReasons.filter(
    (reason) =>
      !reason.startsWith("Образцы на испытании") &&
      reason !== "Образец подошел, но нет прогресса по коммерческой сделке"
  );

  const sampleReasons: string[] = [];

  if (company.sampleStatus === "На испытании" && company.sampleShipmentDate) {
    const days = calculateDaysWaiting(company.sampleShipmentDate, now);
    if (days !== null && days > COMMERCIAL_THRESHOLDS.SAMPLE_TESTING_ATTENTION_DAYS) {
      sampleReasons.push(
        `Образцы на испытании ${days} дн. (порог ${COMMERCIAL_THRESHOLDS.SAMPLE_TESTING_ATTENTION_DAYS} дн.)`
      );
    }
  }

  if (company.sampleStatus === "Подошли") {
    const hasProgressedDeal = company.deals.some((d) =>
      isCommercialContinuationStage(d.stageId, d.categoryId)
    );
    if (!hasProgressedDeal) {
      sampleReasons.push("Образец подошел, но нет прогресса по коммерческой сделке");
    }
  }

  const attentionReasons = [...dealLevelReasons, ...sampleReasons];
  return { hasAttention: attentionReasons.length > 0, attentionReasons };
}

/**
 * Reprojects a normalized company for a filtered dimensional grain.
 *
 * Phase C: current sample state is a CANONICAL COMPANY-LEVEL fact from the
 * one sample engine. It survives dimensional filtering when the company
 * itself matches (companyFactsIncluded === true). When only some deals
 * match, deal-derived historical entries remain as sampleStatusEntries
 * rows, but current state is NOT recomputed from matching deals (no
 * second engine at filter time). The canonical sent-event list is kept
 * only when the company matches.
 */
export function reprojectCompanyForFilteredGrain(
  company: CommercialCompany,
  matchingDeals: CommercialDeal[],
  companyMatches: boolean,
  now: Date = new Date(),
  /**
   * Phase C: whether the canonical current sample state (company-level
   * fact from the one sample engine) survives into this filtered grain.
   * Defaults to companyMatches. Independent of companyFactsIncluded.
   */
  includeCanonicalSampleState: boolean = companyMatches,
  responsibleFilterId?: string
): CommercialCompany {
  // 1. Historical sampleStatusEntries from matchingDeals (display/history
  //    rows only — never the current-state source) + company entries.
  const sampleStatusEntries: SampleStatusEntry[] = [];

  for (const d of matchingDeals) {
    const eventDate = d.sampleSentDate || d.activityLast || d.dateCreate;
    if (d.sampleTransferStatus) {
      sampleStatusEntries.push({
        rawValue: d.sampleTransferStatusRaw || d.sampleTransferStatus,
        label: d.sampleTransferStatus,
        source: "DEAL",
        fieldId: DEAL_SAMPLE_TRANSFER_FIELD_ID,
        dealId: d.id,
        eventDate,
      });
    }
    // Marker field (UF_CRM_1779394379) is MARKER_ONLY: it is never
    // emitted into sampleStatusEntries.
  }

  if (companyMatches && company.sampleStatusEntries) {
    for (const entry of company.sampleStatusEntries) {
      if (entry.source === "COMPANY") {
        sampleStatusEntries.push(entry);
      }
    }
  }

  // 2. Distinct sampleStatuses and raw values (historical display union)
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

  // Historical sent-event filtering is independent of includeCanonicalSampleState (P1-1).
  const matchingDealIds = new Set(matchingDeals.map((d) => d.id));
  const sampleSentEvents: SampleSentEvent[] | undefined = company.sampleSentEvents
    ? company.sampleSentEvents.filter((event) => {
        if (responsibleFilterId) {
          if (event.source === "SMART_PROCESS") {
            return event.responsibleId === responsibleFilterId;
          }
          if (event.source === "DEAL") {
            return (
              event.responsibleId === responsibleFilterId ||
              (event.dealId !== undefined && matchingDealIds.has(event.dealId))
            );
          }
          if (event.source === "COMPANY") {
            return (
              companyMatches &&
              (event.responsibleId
                ? event.responsibleId === responsibleFilterId
                : company.responsibleId === responsibleFilterId)
            );
          }
          return false;
        }

        // When no Responsible filter is active: keep all valid canonical sent events
        if (event.source === "DEAL" && event.dealId !== undefined) {
          return matchingDealIds.has(event.dealId);
        }
        if (event.source === "COMPANY") {
          return companyMatches;
        }
        return true;
      })
    : undefined;

  // 3. Dates reconciliation with explicit provenance (Section 4 A4).
  const sampleDealSentDates = Array.from(
    new Set(matchingDeals.map((d) => d.sampleSentDate).filter(Boolean) as string[])
  ).sort();
  const sampleCompanyTransferDates = companyMatches
    ? (company.sampleCompanyTransferDates || [])
    : [];
  const sampleAllDates = sampleSentEvents !== undefined
    ? Array.from(new Set(sampleSentEvents.map((e) => e.date))).sort()
    : Array.from(
        new Set([...sampleDealSentDates, ...sampleCompanyTransferDates])
      ).sort();

  const sampleEventDatesForPeriodMetrics = sampleSentEvents !== undefined
    ? Array.from(new Set(sampleSentEvents.map((e) => e.date))).sort()
    : (sampleDealSentDates.length > 0
        ? sampleDealSentDates
        : (companyMatches ? sampleCompanyTransferDates : []));

  // 4. Current sample state: canonical company-level fact survives
  //    filtering when includeCanonicalSampleState is true; otherwise truthful NONE.
  //    NEVER recomputed from matching deals (no second engine).
  let sampleStatus = "—";
  let sampleStatusRaw: string | undefined = undefined;
  let sampleStatusSource: SampleStatusSource = "NONE";
  let sampleShipmentDate: string | undefined = undefined;
  let sampleResponsibleId: string | undefined = undefined;
  let sampleResponsibleName: string | undefined = undefined;
  let sampleResponsibleDealId: string | undefined = undefined;
  let sampleResponsibleProcessItemId: string | undefined = undefined;
  let sampleRelatedDealId: string | undefined = undefined;
  let sampleCurrentResolutionQuality: SampleCurrentResolutionQuality = "NONE";
  let gradeGel = company.gradeGel;
  let gradeSol = company.gradeSol;
  let sampleTestResult = company.sampleTestResult;

  if (includeCanonicalSampleState) {
    sampleStatus = company.sampleStatus;
    sampleStatusRaw = company.sampleStatusRaw;
    sampleStatusSource = company.sampleStatusSource;
    sampleShipmentDate = company.sampleShipmentDate;
    sampleResponsibleId = company.sampleResponsibleId;
    sampleResponsibleName = company.sampleResponsibleName;
    sampleResponsibleDealId = company.sampleResponsibleDealId;
    sampleResponsibleProcessItemId = company.sampleResponsibleProcessItemId;
    sampleRelatedDealId = company.sampleRelatedDealId;
    sampleCurrentResolutionQuality = company.sampleCurrentResolutionQuality ?? "NONE";
    gradeGel = company.gradeGel;
    gradeSol = company.gradeSol;
    sampleTestResult = company.sampleTestResult;
  }

  // 5. Representative deal for commercial overview (Section 4 A5)
  const primaryDeal = selectRepresentativeDeal(matchingDeals);

  // 6. Attention / Bottlenecks
  const attentionReasons: string[] = [];

  // Bottleneck 1: Sample under testing > 14 days (canonical facts only)
  if (sampleStatus === "На испытании" && sampleShipmentDate) {
    const days = calculateDaysWaiting(sampleShipmentDate, now);
    if (days !== null && days > COMMERCIAL_THRESHOLDS.SAMPLE_TESTING_ATTENTION_DAYS) {
      attentionReasons.push(
        `Образцы на испытании ${days} дн. (порог ${COMMERCIAL_THRESHOLDS.SAMPLE_TESTING_ATTENTION_DAYS} дн.)`
      );
    }
  }

  // Bottleneck 2: Sample succeeded but no commercial deal progress in matching deals
  if (sampleStatus === "Подошли") {
    const hasProgressedDeal = matchingDeals.some((d) =>
      isCommercialContinuationStage(d.stageId, d.categoryId)
    );
    if (!hasProgressedDeal) {
      attentionReasons.push("Образец подошел, но нет прогресса по коммерческой сделке");
    }
  }

  // Bottleneck 3: Invoice sent / payment awaiting in matching deals
  for (const d of matchingDeals) {
    if (d.paymentStatus && INVOICE_SENT_STATUS_CODES.has(d.paymentStatus)) {
      attentionReasons.push(`Счёт ожидает оплаты по сделке «${d.title}»`);
    }
  }

  // Bottleneck 4: Stalled deal / missing next step in matching deals
  for (const d of matchingDeals) {
    const stalledInfo = evaluateStalledDeal(d, now);
    if (stalledInfo) {
      attentionReasons.push(stalledInfo.attentionReason);
    } else if (isActiveDealMissingNextStep(d)) {
      attentionReasons.push(`Нет следующего шага «${d.title}»`);
    }
  }

  return {
    ...company,
    // Company factual ownership: true only when the company itself
    // matches the dimensional filters (independent of whether the
    // canonical sample manager matches).
    companyFactsIncluded: companyMatches,
    sampleResponsibleId,
    sampleResponsibleName,
    sampleResponsibleDealId,
    sampleResponsibleProcessItemId,
    sampleRelatedDealId,
    sampleCurrentResolutionQuality,
    sampleSentEvents,
    gradeGel,
    gradeSol,
    sampleTestResult,
    dateCreate: companyMatches ? company.dateCreate : undefined,
    deals: matchingDeals,
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
    primaryDealId: primaryDeal?.id,
    primaryDealTitle: primaryDeal?.title,
    primaryDealStageId: primaryDeal?.stageId,
    primaryDealStageName: primaryDeal?.stageName,
    primaryDealOpportunity: primaryDeal?.opportunity ?? null,
    primaryDealOpportunityQuality: primaryDeal?.opportunityQuality,
    primaryDealCurrencyId: primaryDeal?.currencyId,
    primaryDealPaymentStatus: primaryDeal?.paymentStatusLabel,
    primaryDealPaymentDate: primaryDeal?.paymentDate,
    primaryDealActivityNext: primaryDeal?.activityNext,
    primaryDealActivityDataKnown: primaryDeal?.activityDataKnown,
    hasAttention: attentionReasons.length > 0,
    attentionReasons,
  };
}

/**
 * Normalize raw Bitrix Company records and join them with linked deals.
 *
 * Phase C: current sample state is NOT resolved here. Companies are
 * normalized with truthful "—"/NONE placeholders and canonical facts are
 * applied afterwards via applyCanonicalSampleDomain (the ONE canonical
 * sample engine). Deal-level fields remain normalized for the register
 * and preview only.
 */
export function normalizeCompanies(
  rawCompanies: Array<Record<string, any>>,
  normalizedDeals: CommercialDeal[],
  options: NormalizeOptions = {}
): CommercialCompany[] {
  const { userNames = {}, statusLabels = {}, now = new Date() } = options;
  const companySampleLabels = statusLabels[COMPANY_SAMPLES_FIELD_ID] || {};
  const companyIndustryLabels = statusLabels[COMPANY_INDUSTRY_CURRENT_FIELD_ID] || {};
  const companyDirectionLabels = statusLabels[COMPANY_DIRECTION_CURRENT_FIELD_ID] || {};
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
    const dateCreate = extractIsoDates(row.DATE_CREATE)[0];

    const industryRaw = cleanCrmClassificationString(row[COMPANY_INDUSTRY_CURRENT_FIELD_ID]);
    const industry = industryRaw
      ? companyIndustryLabels[industryRaw] ||
        (/^\d+$/.test(industryRaw) ? UNCLASSIFIED_LABEL : industryRaw)
      : undefined;

    const directionRaw = toStringArray(row[COMPANY_DIRECTION_CURRENT_FIELD_ID]);
    const direction = directionRaw.map((v) =>
      companyDirectionLabels[v] || (/^\d+$/.test(v) ? UNCLASSIFIED_LABEL : v)
    );

    const region = cleanCrmClassificationString(row[COMPANY_REGION_FIELD_ID]);

    const productTypeRaw = toStringArray(row[COMPANY_PRODUCT_TYPE_FIELD_ID]);
    const productType = productTypeRaw.map((v) =>
      companyProductLabels[v] || (/^\d+$/.test(v) ? UNCLASSIFIED_LABEL : v)
    );

    // Application: verified actual field UF_CRM_69257337B8025 (COMPANY_APPLICATION_FIELD_ID).
    // Note: Gel grade UF_CRM_1781806326214 must NEVER populate application.
    const application = cleanCrmClassificationString(row[COMPANY_APPLICATION_FIELD_ID]) || undefined;

    const gradeGel = toStringArray(row[COMPANY_SAMPLES_GRADE_GEL_FIELD_ID]);
    const gradeSol = toStringArray(row[COMPANY_SAMPLES_GRADE_SOL_FIELD_ID]);
    const qtyGel = parseQuantity(row[COMPANY_SAMPLES_QTY_GEL_FIELD_ID]);
    const qtySol = parseQuantity(row[COMPANY_SAMPLES_QTY_SOL_FIELD_ID]);
    const sampleTestResult = cleanCrmClassificationString(row[COMPANY_TEST_RESULT_FIELD_ID]);

    const companyDatesMulti = extractIsoDates(row[COMPANY_SAMPLES_DATE_MULTI_FIELD_ID]);
    const companyDatesSingle = extractIsoDates(row[COMPANY_SAMPLES_DATE_SINGLE_FIELD_ID]);
    const sampleCompanyTransferDates = Array.from(
      new Set([...companyDatesSingle, ...companyDatesMulti])
    ).sort();

    const rawCompanySamples = toStringArray(row[COMPANY_SAMPLES_FIELD_ID]);
    const companyStatusEntries = resolveCompanySampleStatuses(rawCompanySamples, companySampleLabels);

    const linkedDeals = dealsByCompany.get(id) || [];

    const baseCompany: CommercialCompany = {
      id,
      title,
      responsibleId,
      responsibleName,
      companyFactsIncluded: true,
      dateCreate,
      industry,
      industryRaw,
      direction,
      directionRaw,
      region,
      productType,
      productTypeRaw,
      application,
      sampleStatus: "—",
      sampleStatusSource: "NONE",
      sampleStatuses: [],
      sampleStatusRawValues: [],
      sampleStatusEntries: companyStatusEntries,
      sampleCompanyTransferDates,
      sampleAllDates: sampleCompanyTransferDates,
      sampleTestResult,
      gradeGel,
      gradeSol,
      qtyGel,
      qtySol,
      deals: linkedDeals,
      hasAttention: false,
      attentionReasons: [],
    };

    companies.push(reprojectCompanyForFilteredGrain(baseCompany, linkedDeals, true, now));
  }

  return companies;
}
