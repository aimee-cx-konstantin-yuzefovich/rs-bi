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

const COMMERCIAL_COMPANY_SELECT = [
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

const COMMERCIAL_DEAL_SELECT = [
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

async function fetchUserDirectory(): Promise<Record<string, string>> {
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

    // Fetch metadata, directories, companies, deals, and Smart Process
    // items in parallel — independent until normalization/aggregation.
    const [
      { labels },
      userNames,
      rawCompanies,
      rawDeals,
      smartProcessItems,
    ] = await Promise.all([
      fetchFieldLabelMaps(),
      fetchUserDirectory(),
      fetchAllPages("crm.company.list", { SELECT: COMMERCIAL_COMPANY_SELECT, ORDER: { ID: "ASC" } }, "ID"),
      fetchAllPages("crm.deal.list", { SELECT: COMMERCIAL_DEAL_SELECT, ORDER: { ID: "ASC" } }, "ID"),
      fetchSmartProcessSampleItems(),
    ]);

    // Extract deal IDs and fetch activities via shared authoritative pipeline
    const dealIds = rawDeals
      .map((d) => String(d.ID || d.id || "").trim())
      .filter((id) => /^\d+$/.test(id));

    const activitiesResult = await fetchDealsActivities(dealIds);

    // Pure server-side normalization with authoritative activities
    const deals = normalizeDeals(rawDeals, {
      userNames,
      statusLabels: labels,
      activities: activitiesResult.byDealId,
    });
    const normalizedCompanies = normalizeCompanies(rawCompanies, deals, {
      userNames,
      statusLabels: labels,
    });

    // ONE canonical sample domain (the same engine as /api/bitrix/samples):
    // Companies + Deals + Smart Process → per-company canonical state.
    const sampleDomain = buildCanonicalSampleDomain(
      rawCompanies,
      rawDeals,
      smartProcessItems,
      { labelResolver: (fieldId, raw) => labels[fieldId]?.[raw] ?? raw }
    );

    // Project canonical sample facts onto CommercialCompany.
    const companies = applyCanonicalSampleDomain(normalizedCompanies, sampleDomain, {
      userNames,
      statusLabels: labels,
    });

    return respond({
      success: true,
      isDemoMode: false,
      partial: activitiesResult.partial,
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
    console.error("[Commercial Funnel API Error]", error);

    const message =
      error instanceof Error && error.message.includes("not configured")
        ? error.message
        : "Не удалось загрузить данные коммерческой воронки. Попробуйте ещё раз.";

    return respond({ success: false, error: message }, 502);
  }
}
