// src/app/api/bitrix/commercial-funnel/route.ts
// ─────────────────────────────────────────────────────────────────────
// POST /api/bitrix/commercial-funnel
// Authoritative Commercial Funnel dataset route.
// Handles WordPress SSO auth, SSRF-safe queries, complete fail-closed
// pagination, and graceful demo mode fallback when Bitrix is unconfigured.
// ─────────────────────────────────────────────────────────────────────

import { NextResponse } from "next/server";
import { requireAuth, isAuthError } from "@/lib/auth-guard";
import { bitrixPost } from "@/lib/bitrix";
import {
  fetchAllPages,
  fetchFieldLabelMaps,
  fetchSmartProcessSampleItems,
  makeLabelResolver,
} from "@/lib/samples/bitrix-fetch";
import { buildCanonicalSampleDomain } from "@/lib/samples/aggregate";
import { fetchDealsActivities } from "@/lib/bitrix-activities";
import {
  applyCanonicalSampleDomain,
  normalizeCompanies,
  normalizeDeals,
} from "@/lib/commercial-funnel/normalize";
import { generateDemoCommercialDataset } from "@/lib/commercial-funnel/demo-data";
import {
  COMPANY_APPLICATION_FIELD_ID,
  COMPANY_APPLICATION_OLD_FIELD_ID,
  COMPANY_DIRECTION_FIELD_ID,
  COMPANY_INDUSTRY_CURRENT_FIELD_ID,
  COMPANY_DIRECTION_CURRENT_FIELD_ID,
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
  DEAL_SAMPLE_TRANSFER_FIELD_ID,
  DEAL_SAMPLE_TVL_DETAILS_FIELD_ID,
  DEAL_SHIPMENT_DATE_FIELD_ID,
  DEAL_TESTING_MARKER_CURRENT_FIELD_ID,
  PAYMENT_STATUS_FIELD_ID,
  SMART_PROCESS_HAS_DISCOVERED_CONTRACT,
} from "@/lib/crm-constants";

export const dynamic = "force-dynamic";

// Exported (keyword only, zero logic change) so the Samples pipeline
// diagnostic (PROBE J — Commercial Funnel INPUT contract) imports the
// EXACT production selects instead of retyping them.
export const COMMERCIAL_COMPANY_SELECT = [
  "ID",
  "TITLE",
  "ASSIGNED_BY_ID",
  "DATE_CREATE",
  "INDUSTRY",
  COMPANY_INDUSTRY_CURRENT_FIELD_ID,
  COMPANY_DIRECTION_CURRENT_FIELD_ID,
  COMPANY_REGION_FIELD_ID,
  COMPANY_SAMPLES_FIELD_ID,
  COMPANY_SAMPLES_DATE_MULTI_FIELD_ID,
  COMPANY_SAMPLES_DATE_SINGLE_FIELD_ID,
  COMPANY_SAMPLES_GRADE_GEL_FIELD_ID,
  COMPANY_SAMPLES_GRADE_SOL_FIELD_ID,
  COMPANY_SAMPLES_QTY_GEL_FIELD_ID,
  COMPANY_SAMPLES_QTY_SOL_FIELD_ID,
  COMPANY_TEST_RESULT_FIELD_ID,
  COMPANY_PRODUCT_TYPE_FIELD_ID,
  COMPANY_APPLICATION_FIELD_ID,
  COMPANY_DIRECTION_FIELD_ID,
];

export const COMMERCIAL_DEAL_SELECT = [
  "ID",
  "TITLE",
  "COMPANY_ID",
  "ASSIGNED_BY_ID",
  "STAGE_ID",
  "CATEGORY_ID",
  "OPPORTUNITY",
  "CURRENCY_ID",
  "DATE_CREATE",
  "BEGINDATE",
  "CLOSEDATE",
  DEAL_SAMPLE_TRANSFER_FIELD_ID,
  DEAL_SAMPLE_TESTING_FIELD_ID,
  DEAL_TESTING_MARKER_CURRENT_FIELD_ID,
  DEAL_SAMPLE_SENT_DATE_FIELD_ID,
  DEAL_SAMPLE_TVL_DETAILS_FIELD_ID,
  DEAL_SAMPLE_MARK_VOLUME_FIELD_ID,
  PAYMENT_STATUS_FIELD_ID,
  DEAL_PAYMENT_DATE_FIELD_ID, // Дата оплаты
  DEAL_SHIPMENT_DATE_FIELD_ID, // Дата отгрузки
  DEAL_PRODUCT_TYPE_FIELD_ID, // Продукт
  DEAL_INDUSTRY_FIELD_ID, // Отрасль
  DEAL_DIRECTION_FIELD_ID,
  DEAL_REGION_FIELD_ID, // Регион
];

// Exported (keyword only, zero logic change) for the Samples pipeline
// diagnostic PROBE J — same user directory as production.
export async function fetchUserDirectory(): Promise<Record<string, string>> {
  const users: Record<string, string> = {};
  try {
    const data = await bitrixPost<{
      result?: Array<{ ID: string; NAME?: string; LAST_NAME?: string }>;
    }>("user.get", { sort: "ID", order: "ASC" });
    if (Array.isArray(data.result)) {
      for (const u of data.result) {
        if (!u.ID) continue;
        const nameParts = [u.LAST_NAME, u.NAME].filter(Boolean);
        users[String(u.ID)] = nameParts.join(" ") || `ID ${u.ID}`;
      }
    }
  } catch {
    // Non-fatal fallback
  }
  return users;
}

export async function POST() {
  // ─── SECURITY: Require authentication ───
  const auth = await requireAuth();
  if (isAuthError(auth)) return auth;

  const respond = (payload: unknown, status = 200) =>
    NextResponse.json(payload, {
      status,
      headers: { "Cache-Control": "no-store" },
    });

  // If Bitrix webhook is unconfigured, return demo dataset immediately
  if (!process.env.BITRIX_WEBHOOK_URL) {
    const demo = generateDemoCommercialDataset();
    return respond({
      success: true,
      isDemoMode: true,
      companies: demo.companies,
      deals: demo.deals,
      userNames: demo.userNames,
      statusLabels: demo.statusLabels,
    });
  }

  const routeStart = Date.now();
  try {
    // Fail-closed gate: Smart Process is authoritative for current sample
    // cycles. An unverified contract must never silently produce
    // legacy-only analytics.
    if (!SMART_PROCESS_HAS_DISCOVERED_CONTRACT) {
      return respond(
        {
          success: false,
          error:
            "Smart Process contract not verified — run scripts/discover-smart-process-contract.mjs",
        },
        502
      );
    }

    // Start deals fetch immediately, and as soon as rawDeals resolves,
    // start fetchDealsActivities without waiting for companies, SP, or metadata.
    const dealsAndActivitiesPromise = (async () => {
      const tDeals0 = Date.now();
      const rawDeals = await fetchAllPages(
        "crm.deal.list",
        { SELECT: COMMERCIAL_DEAL_SELECT, ORDER: { ID: "ASC" } },
        "ID"
      );
      const dealsDuration = Date.now() - tDeals0;

      const tActivities0 = Date.now();
      const dealIds = rawDeals
        .map((d) => String(d.ID || d.id || "").trim())
        .filter((id) => /^\d+$/.test(id));
      const activitiesResult = await fetchDealsActivities(dealIds);
      const activitiesDuration = Date.now() - tActivities0;

      return { rawDeals, dealsDuration, activitiesResult, activitiesDuration };
    })();

    const companiesPromise = (async () => {
      const t0 = Date.now();
      const res = await fetchAllPages(
        "crm.company.list",
        { SELECT: COMMERCIAL_COMPANY_SELECT, ORDER: { ID: "ASC" } },
        "ID"
      );
      return { rawCompanies: res, duration: Date.now() - t0 };
    })();

    const smartProcessPromise = (async () => {
      const t0 = Date.now();
      const res = await fetchSmartProcessSampleItems();
      return { smartProcessItems: res, duration: Date.now() - t0 };
    })();

    const metadataPromise = (async () => {
      const t0 = Date.now();
      const res = await fetchFieldLabelMaps();
      return { fieldLabelMaps: res, duration: Date.now() - t0 };
    })();

    const usersPromise = (async () => {
      const t0 = Date.now();
      const res = await fetchUserDirectory();
      return { userNames: res, duration: Date.now() - t0 };
    })();

    // Await all independent fetches and the parallelized deal activities
    const [
      { rawDeals, dealsDuration, activitiesResult, activitiesDuration },
      { rawCompanies, duration: companiesDuration },
      { smartProcessItems, duration: smartProcessDuration },
      { fieldLabelMaps, duration: metadataDuration },
      { userNames, duration: usersDuration },
    ] = await Promise.all([
      dealsAndActivitiesPromise,
      companiesPromise,
      smartProcessPromise,
      metadataPromise,
      usersPromise,
    ]);

    const labels = fieldLabelMaps.labels;

    // Pure server-side normalization with authoritative activities
    const tNorm0 = Date.now();
    const deals = normalizeDeals(rawDeals, {
      userNames,
      statusLabels: labels,
      activities: activitiesResult.byDealId,
    });
    const normalizedCompanies = normalizeCompanies(rawCompanies, deals, {
      userNames,
      statusLabels: labels,
    });
    const normalizationDuration = Date.now() - tNorm0;

    // ONE canonical sample domain (the same engine as /api/bitrix/samples):
    // Companies + Deals + Smart Process → per-company canonical state.
    // The SAME safe label resolver as Samples: unknown dictionary-backed
    // enum IDs fail closed to «Не классифицировано» — raw IDs never leak
    // into segments/analytics (`labels[fieldId]?.[raw] ?? raw` is forbidden).
    const tSample0 = Date.now();
    const sampleDomain = buildCanonicalSampleDomain(
      rawCompanies,
      rawDeals,
      smartProcessItems,
      { labelResolver: makeLabelResolver(labels) }
    );
    const sampleAggregationDuration = Date.now() - tSample0;

    // Project canonical sample facts onto CommercialCompany.
    const tPrep0 = Date.now();
    const companies = applyCanonicalSampleDomain(normalizedCompanies, sampleDomain, {
      userNames,
      statusLabels: labels,
    });
    const responsePrepDuration = Date.now() - tPrep0;
    const totalDuration = Date.now() - routeStart;

    if (process.env.NODE_ENV !== "production") {
      console.log(
        `[Commercial Funnel Timings] Total: ${totalDuration}ms | ` +
        `Deals: ${dealsDuration}ms | Activities: ${activitiesDuration}ms | ` +
        `Companies: ${companiesDuration}ms | SP: ${smartProcessDuration}ms | ` +
        `Metadata: ${metadataDuration}ms | Users: ${usersDuration}ms | ` +
        `Norm: ${normalizationDuration}ms | SampleAgg: ${sampleAggregationDuration}ms | Prep: ${responsePrepDuration}ms`
      );
    }

    return respond({
      success: true,
      isDemoMode: false,
      partial: activitiesResult.partial || Boolean(fieldLabelMaps.partial),
      metadataPartial: Boolean(fieldLabelMaps.partial),
      activityPartial: activitiesResult.partial,
      activityWarning: activitiesResult.warning,
      failedActivityDealIds: activitiesResult.failedDealIds,
      incompleteActivityDealIds: activitiesResult.incompleteDealIds,
      companies,
      deals,
      userNames,
      statusLabels: labels,
      totalCompanies: companies.length,
      totalDeals: deals.length,
      smartProcess: { qualityCounts: sampleDomain.qualityCounts },
    });
  } catch (error) {
    const duration = Date.now() - routeStart;
    const errorMessage = error instanceof Error ? error.message : String(error);
    const errorCode =
      errorMessage.includes("timeout") || errorMessage.includes("AbortError")
        ? "BITRIX_TIMEOUT"
        : errorMessage.includes("Inconsistent total") || errorMessage.includes("count mismatch")
        ? "BITRIX_PAGINATION_UNSTABLE"
        : "BITRIX_FETCH_FAILED";

    console.error("[Commercial Funnel API Error]", {
      errorCode,
      durationMs: duration,
      error: errorMessage,
    });

    const message =
      error instanceof Error && error.message.includes("not configured")
        ? error.message
        : "Не удалось загрузить данные коммерческой воронки. Попробуйте ещё раз.";

    return respond({ success: false, error: message, code: errorCode }, 502);
  }
}
