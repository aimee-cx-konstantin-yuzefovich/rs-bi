// src/lib/commercial-funnel/types.ts
// ─────────────────────────────────────────────────────────────────────
// Domain contract for Commercial Funnel Release 1.
// All analytics metrics and Excel sheets consume these types.
// ─────────────────────────────────────────────────────────────────────

export type PeriodPreset = "7days" | "30days" | "90days" | "quarter" | "custom" | "all";

export interface CommercialFilters {
  periodPreset: PeriodPreset;
  customFrom?: string; // YYYY-MM-DD
  customTo?: string;   // YYYY-MM-DD
  responsibleId?: string; // "all" or specific ID
  productType?: string;   // "all" or value
  industry?: string;      // "all" or value
  direction?: string;     // "all" or value
  region?: string;        // "all" or value
}

export interface PeriodBoundaries {
  currentStart: Date | null;
  currentEnd: Date;
  previousStart: Date | null;
  previousEnd: Date | null;
  currentStartStr: string;
  currentEndStr: string;
  previousStartStr: string;
  previousEndStr: string;
  isAllTime?: boolean;
  comparisonAvailable?: boolean;
}

export interface CommercialDeal {
  id: string;
  title: string;
  companyId: string;
  responsibleId: string;
  responsibleName?: string;
  stageId: string;
  stageName?: string;
  categoryId: string;
  opportunity: number | null;
  opportunityQuality?: "VALID" | "UNKNOWN" | "INVALID";
  currencyId: string;
  dateCreate?: string;
  beginDate?: string;
  closeDate?: string;
  sampleTransferStatus?: string;
  sampleTransferStatusRaw?: string;
  /**
   * Preserved raw values of legacy deal testing marker for debug/registry inspection only.
   * MARKER_ONLY: must NEVER be interpreted as sample status or analytical state.
   */
  legacyTestingMarkerRaw?: string[];
  sampleSentDate?: string;
  tvlDetails?: string;
  markVolume?: string;
  paymentStatus?: string;
  paymentStatusLabel?: string;
  paymentDate?: string;
  shipmentDate?: string;
  productType: string[];
  productTypeRaw?: string[];
  industry: string[];
  industryRaw?: string[];
  direction: string[];
  directionRaw?: string[];
  region?: string;
  activityLast?: string;
  activityNext?: string;
  activityNextDate?: string;
  activityDataKnown?: boolean;
}

export type SampleStatusSource = "SMART_PROCESS" | "DEAL" | "COMPANY" | "NONE";

/** Resolution quality of the canonical current sample state. */
export type SampleCurrentResolutionQuality =
  | "RESOLVED"
  | "AMBIGUOUS"
  | "AMBIGUOUS_MULTIPLE_ACTIVE"
  | "NONE";

/**
 * One dated samples_sent event with per-event attribution.
 * Global KPI counts unique companies; manager flow attributes each event
 * to its own responsible (SP event → SP ASSIGNED_BY_ID, etc.).
 */
export interface SampleSentEvent {
  date: string;
  source: SampleStatusSource;
  /** Responsible of the SOURCE entity that owns this event. */
  responsibleId?: string;
  dealId?: string;
  /** Smart Process item id (SP events only; never a Deal ID). */
  processItemId?: string;
}

export interface SampleStatusEntry {
  rawValue: string;
  label: string;
  source: SampleStatusSource;
  fieldId: string;
  dealId?: string;
  eventDate?: string;
}

export interface CommercialCompany {
  id: string;
  title: string;
  responsibleId: string;
  responsibleName?: string;
  companyFactsIncluded?: boolean;
  sampleResponsibleId?: string;
  sampleResponsibleName?: string;
  sampleResponsibleDealId?: string;
  /**
   * Smart Process item id of the resolved current cycle (SP source only).
   * NEVER a Deal ID — Deal provenance stays in sampleResponsibleDealId.
   */
  sampleResponsibleProcessItemId?: string;
  /** Exact factual linked sample Deal (SP current cycle) when configured. */
  sampleRelatedDealId?: string;
  /** Canonical current-state resolution quality. */
  sampleCurrentResolutionQuality?: SampleCurrentResolutionQuality;
  dateCreate?: string;
  industry?: string;
  industryRaw?: string;
  direction: string[];
  directionRaw?: string[];
  region?: string;
  productType: string[];
  productTypeRaw?: string[];
  application?: string;
  sampleStatus: string;
  sampleStatusRaw?: string;
  sampleStatusSource: SampleStatusSource;
  sampleStatuses?: string[];
  sampleStatusRawValues?: string[];
  sampleStatusEntries?: SampleStatusEntry[];
  sampleShipmentDate?: string;
  sampleDealSentDates?: string[];
  sampleCompanyTransferDates?: string[];
  sampleEventDatesForPeriodMetrics?: string[];
  sampleAllDates: string[];
  /**
   * Canonical per-event sent events with per-event attribution.
   * Consumed by computePeriodMetrics (global KPI) and the manager
   * samplesSent flow (per-event responsible attribution).
   */
  sampleSentEvents?: SampleSentEvent[];
  sampleTestResult?: string;
  gradeGel: string[];
  gradeSol: string[];
  qtyGel?: number;
  qtySol?: number;
  deals: CommercialDeal[];
  primaryDealId?: string;
  primaryDealTitle?: string;
  primaryDealStageId?: string;
  primaryDealStageName?: string;
  primaryDealOpportunity?: number | null;
  primaryDealOpportunityQuality?: "VALID" | "UNKNOWN" | "INVALID";
  primaryDealCurrencyId?: string;
  primaryDealPaymentStatus?: string;
  primaryDealPaymentDate?: string;
  primaryDealActivityNext?: string;
  primaryDealActivityDataKnown?: boolean;
  hasAttention: boolean;
  attentionReasons: string[];
}

export type AggregateAmountQuality =
  | "COMPLETE"
  | "PARTIAL"
  | "UNKNOWN"
  | "INVALID_ONLY";

export interface DatedKpi {
  id: string;
  label: string;
  currentValue: number | null;
  previousValue: number | null;
  delta: number | null;
  deltaPercent: number | null; // null if denominator is 0
  companyIds: string[];
  isCurrency?: boolean;
  currencyId?: string;
  isMultiCurrency?: boolean;
  amountQuality?: AggregateAmountQuality;
  currencyBreakdown?: {
    current: Record<string, number>;
    previous: Record<string, number>;
  };
  currencyBreakdownQuality?: {
    current: Record<string, AggregateAmountQuality>;
    previous: Record<string, AggregateAmountQuality>;
  };
  currencyCompanyIds?: {
    current: Record<string, string[]>;
    previous: Record<string, string[]>;
  };
  comparisonAvailable?: boolean;
}

export interface WipKpi {
  id: string;
  label: string;
  companyCount: number;
  dealCount: number;
  companyIds: string[];
}

export type BottleneckType =
  | "sample_testing_stalled"
  | "sample_success_no_deal"
  | "payment_overdue"
  | "stalled_deal";

export interface BottleneckItem {
  id: string;
  companyId: string;
  companyTitle: string;
  responsibleId: string;
  responsibleName: string;
  type: BottleneckType;
  issueLabel: string;
  currentState: string;
  relevantDate?: string;
  daysWaiting: number | null;
  dealId?: string;
  dealTitle?: string;
  amount?: number | null;
  amountQuality?: "VALID" | "UNKNOWN" | "INVALID";
  currencyId?: string;
  nextAction?: string;
  activityEvidence?: "KNOWN" | "UNKNOWN";
  missingNextStep?: boolean;
  isStalled?: boolean;
}

// ─────────────────────────────────────────────────────────────────────
// Commercial Drill-Down Evidence Contract (Factual Provenance)
// ─────────────────────────────────────────────────────────────────────

export type CommercialDrillDownEvidenceKind =
  | "COMPANY"
  | "DEAL"
  | "SAMPLE_SP"
  | "SAMPLE_DEAL"
  | "SAMPLE_COMPANY"
  | "SAMPLE_SENT_EVIDENCE";

export interface CommercialDrillDownEvidence {
  companyId: string;
  kind: CommercialDrillDownEvidenceKind;
  dealId?: string;
  processItemId?: string;
  date?: string;
  source?: SampleStatusSource;
  reason?: string;
}

export interface CommercialDrillDownPayload {
  title: string;
  subtitle?: string;
  companyIds: string[];
  evidence: CommercialDrillDownEvidence[];
  expectedCompanyCount: number;
  expectedDealCount?: number;
}

export interface ManagerScorecardRow {
  responsibleId: string;
  name: string;
  newCompanies: number;
  samplesSent: number;
  inTesting: number;
  sampleSuccess: number;
  sampleFail: number;
  sampleRework: number;
  dealsCreated: number;
  paymentsReceived: number;
  paymentAmount: number | null;
  paymentAmountQuality?: AggregateAmountQuality;
  paymentAmountsByCurrency: Record<string, number>;
  paymentAmountsQualityByCurrency?: Record<string, AggregateAmountQuality>;
  bottlenecksCount: number;
  companyIds: string[];
  // ── Portfolio / Load group (current state, never date-filtered) ──
  /**
   * «Компании в текущем контуре» — unique companies attributable to this
   * manager through a REAL current sample state (DEAL → sampleResponsibleId;
   * COMPANY → company owner when companyFactsIncluded !== false; NONE/blank/
   * "—" never counted) UNION companies with ≥1 active (non-terminal) Deal
   * owned by this manager. One company counts once per manager even when the
   * same manager owns both the sample cycle and the active Deal; it may
   * legitimately appear under two managers when the sample cycle and the
   * commercial Deal have different owners.
   */
  activeCompanies: number;
  activeCompaniesIds: string[];
  /** Unique companies with a deal awaiting payment (INVOICE_SENT statuses). */
  awaitingPayment: number;
  awaitingPaymentIds: string[];
  /**
   * Unique companies whose active deals have known activity data but no
   * next step (factual data-gap metric; only provable via activityDataKnown).
   */
  noNextStep: number;
  noNextStepIds: string[];
}

export interface SampleRegisterRow {
  id: string;
  companyId: string;
  companyTitle: string;
  responsibleId: string;
  responsibleName: string;
  dealId?: string;
  dealTitle?: string;
  productType: string;
  status: string;
  statuses?: string[];
  statusRawValues?: string[];
  statusSource: SampleStatusSource;
  shipmentDate?: string;
  daysSinceSent?: number;
  testResult?: string;
  gradeGel?: string;
  gradeSol?: string;
  qtyGel?: string;
  qtySol?: string;
  nextAction?: string;
}

// ─────────────────────────────────────────────────────────────────────
// Management Rebuild analytics contracts (UI + Excel share these types).
// ─────────────────────────────────────────────────────────────────────

/** A count with its exact underlying unique company IDs (drill-down truth). */
export interface CountedPopulation {
  count: number;
  companyIds: string[];
}

/** One stage row of the Samples & Testing funnel track (current snapshot). */
export interface FunnelStageRow {
  id: string;
  label: string;
  companyCount: number;
  dealCount: number;
  companyIds: string[];
  /**
   * Period company count: unique companies with a dated sent fact in period.
   * Present ONLY where a reliable dated event exists (currently: "Образцы отправлены").
   * null means: no reliable dated event → UI/Excel show "–". Never fake.
   */
  periodCompanyCount: number | null;
  periodCompanyIds: string[] | null;
  /** @deprecated Alias for periodCompanyCount (Defect 2 transition) */
  periodEventCount?: number | null;
  /** @deprecated Alias for periodCompanyIds (Defect 2 transition) */
  periodEventCompanyIds?: string[] | null;
}

/** Commercial track of the Funnel view: current snapshot + period events. */
export interface FunnelCommercialView {
  current: {
    activeDeals: CountedPopulation;
    dealCount: number;
    awaitingPayment: CountedPopulation;
    awaitingPaymentDealCount: number;
  };
  period: {
    /** Companies with deals created in period. */
    dealsCreated: CountedPopulation;
    /** Companies with payments received in period. */
    paymentsReceived: CountedPopulation;
    /** Payment amounts by currency (isolated; never cross-summed). */
    paymentAmountsByCurrency: Record<string, number>;
    paymentAmountQualityByCurrency: Record<string, AggregateAmountQuality>;
    /** Paid unique company IDs by currency. */
    paidCompanyIdsByCurrency?: Record<string, string[]>;
    /** Companies with shipments in period. */
    shipments: CountedPopulation;
  };
}

/** Positive sample result → commercial continuation evidence (NOT conversion). */
export interface FunnelContinuationLink {
  /** Companies currently at "Подошли". */
  positiveResult: CountedPopulation;
  /** Subset of positiveResult with ≥1 progressed commercial deal. */
  withCommercialContinuation: CountedPopulation;
}

export interface FunnelView {
  sampleTestingStages: FunnelStageRow[];
  commercial: FunnelCommercialView;
  continuation: FunnelContinuationLink;
}

export type SegmentDimension = "industry" | "direction" | "region" | "product";

/** Current-state metric group for one segment row. */
export interface SegmentCurrentMetrics {
  activeCompanies: CountedPopulation;
  requireSamples: CountedPopulation;
  samplesSent: CountedPopulation;
  inTesting: CountedPopulation;
  passed: CountedPopulation;
  failed: CountedPopulation;
  rework: CountedPopulation;
  activeDeals: CountedPopulation;
  awaitingPayment: CountedPopulation;
  requireAttention: CountedPopulation;
}

/** Period-event metric group for one segment row (unique companies). */
export interface SegmentPeriodMetrics {
  newCompanies: CountedPopulation;
  samplesSent: CountedPopulation;
  dealsCreated: CountedPopulation;
  paymentsReceived: CountedPopulation;
  shipments: CountedPopulation;
}

export interface SegmentRow {
  /** Segment value, or "Не указано" for missing dimension values. */
  label: string;
  isMissingValue: boolean;
  current: SegmentCurrentMetrics;
  period: SegmentPeriodMetrics;
}

export interface SegmentBreakdown {
  dimension: SegmentDimension;
  rows: SegmentRow[];
  /** Union of unique company IDs across all rows (NOT the sum of row counts). */
  totalUniqueCompanyIds: string[];
  /** Product/Direction are multi-valued: row sums may exceed unique totals. */
  isMultiValueDimension: boolean;
}

/** Action-center row (Management meeting-ready, authoritative data only). */
export interface ActionPlanRow {
  id: string;
  companyId: string;
  companyTitle: string;
  responsibleId: string;
  responsibleName: string;
  /** Where it is stuck (existing bottleneck issueLabel). */
  stuckAt: string;
  currentState: string;
  daysWaiting: number | null;
  /** activityLast when known; undefined with explicit disclosure otherwise. */
  lastActivity?: string;
  lastActivityKnown: boolean;
  /** activityNext only; NEVER invented. */
  nextAction?: string;
  nextActionDate?: string;
  dealId?: string;
  dealTitle?: string;
}

/** Management signal derived strictly from existing bottleneck rules. */
export interface ManagementSignal {
  id: string;
  label: string;
  /** Unique company count (drill-down reconciles exactly). */
  companyCount: number;
  companyIds: string[];
}

/** Sample & Testing management snapshot row (NOT the raw registry). */
export interface SampleTestingSnapshotRow {
  id: string;
  companyId: string;
  companyTitle: string;
  responsibleName: string;
  productType: string;
  industry: string;
  direction: string;
  markOrBatch: string;
  shipmentDate?: string;
  testingStatus: string;
  testResult: string;
  nextActionOrComment: string;
  dealId?: string;
  dealTitle?: string;
}

export interface CommercialDataset {
  companies: CommercialCompany[];
  deals: CommercialDeal[];
  userNames: Record<string, string>;
  statusLabels: Record<string, Record<string, string>>;
}
