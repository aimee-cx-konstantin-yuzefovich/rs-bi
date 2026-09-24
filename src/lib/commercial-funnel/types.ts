// src/lib/commercial-funnel/types.ts
// ─────────────────────────────────────────────────────────────────────
// Domain contract for Commercial Funnel Release 1.
// All analytics metrics and Excel sheets consume these types.
// ─────────────────────────────────────────────────────────────────────

export type PeriodPreset = "7days" | "30days" | "90days" | "quarter" | "custom";

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
  currentStart: Date;
  currentEnd: Date;
  previousStart: Date;
  previousEnd: Date;
  currentStartStr: string;
  currentEndStr: string;
  previousStartStr: string;
  previousEndStr: string;
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
  opportunity: number;
  currencyId: string;
  dateCreate?: string;
  beginDate?: string;
  closeDate?: string;
  sampleTransferStatus?: string;
  sampleTestingStatus: string[];
  sampleSentDate?: string;
  tvlDetails?: string;
  markVolume?: string;
  paymentStatus?: string;
  paymentStatusLabel?: string;
  paymentDate?: string;
  shipmentDate?: string;
  productType: string[];
  industry: string[];
  direction: string[];
  region?: string;
  activityLast?: string;
  activityNext?: string;
}

export type SampleStatusSource = "DEAL" | "COMPANY" | "NONE";

export interface CommercialCompany {
  id: string;
  title: string;
  responsibleId: string;
  responsibleName?: string;
  dateCreate?: string;
  industry?: string;
  direction: string[];
  region?: string;
  productType: string[];
  application?: string;
  sampleStatus: string;
  sampleStatusRaw?: string;
  sampleStatusSource: SampleStatusSource;
  sampleShipmentDate?: string;
  sampleAllDates: string[];
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
  primaryDealOpportunity?: number;
  primaryDealPaymentStatus?: string;
  primaryDealPaymentDate?: string;
  primaryDealActivityNext?: string;
  hasAttention: boolean;
  attentionReasons: string[];
}

export interface DatedKpi {
  id: string;
  label: string;
  currentValue: number;
  previousValue: number;
  delta: number;
  deltaPercent: number | null; // null if denominator is 0
  companyIds: string[];
  isCurrency?: boolean;
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
  daysWaiting: number;
  dealId?: string;
  dealTitle?: string;
  amount?: number;
  nextAction?: string;
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
  paymentAmount: number;
  bottlenecksCount: number;
  companyIds: string[];
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

export interface CommercialDataset {
  companies: CommercialCompany[];
  deals: CommercialDeal[];
  userNames: Record<string, string>;
  statusLabels: Record<string, Record<string, string>>;
}
