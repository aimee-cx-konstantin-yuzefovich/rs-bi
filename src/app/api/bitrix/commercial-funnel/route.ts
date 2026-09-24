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
import { fetchAllPages, fetchFieldLabelMaps } from "@/lib/samples/bitrix-fetch";
import { normalizeCompanies, normalizeDeals } from "@/lib/commercial-funnel/normalize";
import { generateDemoCommercialDataset } from "@/lib/commercial-funnel/demo-data";
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

export const dynamic = "force-dynamic";

const COMMERCIAL_COMPANY_SELECT = [
  "ID",
  "TITLE",
  "ASSIGNED_BY_ID",
  "DATE_CREATE",
  "INDUSTRY",
  COMPANY_SAMPLES_FIELD_ID,
  COMPANY_SAMPLES_DATE_MULTI_FIELD_ID,
  COMPANY_SAMPLES_DATE_SINGLE_FIELD_ID,
  COMPANY_SAMPLES_GRADE_GEL_FIELD_ID,
  COMPANY_SAMPLES_GRADE_SOL_FIELD_ID,
  COMPANY_SAMPLES_QTY_GEL_FIELD_ID,
  COMPANY_SAMPLES_QTY_SOL_FIELD_ID,
  COMPANY_TEST_RESULT_FIELD_ID,
  COMPANY_PRODUCT_TYPE_FIELD_ID,
  COMPANY_APPLICATION_NEW_FIELD_ID,
  COMPANY_APPLICATION_OLD_FIELD_ID,
  COMPANY_DIRECTION_FIELD_ID,
  "UF_CRM_69259C45EC14B", // Регион
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
  DEAL_SAMPLE_SENT_DATE_FIELD_ID,
  DEAL_SAMPLE_TVL_DETAILS_FIELD_ID,
  DEAL_SAMPLE_MARK_VOLUME_FIELD_ID,
  PAYMENT_STATUS_FIELD_ID,
  "UF_CRM_1584460062014", // Дата оплаты
  "UF_CRM_1584459666824", // Дата отгрузки
  "UF_CRM_69257BBACD471", // Продукт
  "UF_CRM_6915D8C2C31D0", // Отрасль
  DEAL_DIRECTION_FIELD_ID,
  "UF_CRM_69259C45EC14B", // Регион
  "ACTIVITY_LAST",
  "ACTIVITY_NEXT",
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
    // Fetch metadata and directories in parallel
    const [{ labels }, userNames] = await Promise.all([
      fetchFieldLabelMaps(),
      fetchUserDirectory(),
    ]);

    // Fetch companies and deals with complete fail-closed pagination
    const [rawCompanies, rawDeals] = await Promise.all([
      fetchAllPages("crm.company.list", { SELECT: COMMERCIAL_COMPANY_SELECT, ORDER: { ID: "ASC" } }, "ID"),
      fetchAllPages("crm.deal.list", { SELECT: COMMERCIAL_DEAL_SELECT, ORDER: { ID: "ASC" } }, "ID"),
    ]);

    // Pure server-side normalization
    const deals = normalizeDeals(rawDeals, { userNames, statusLabels: labels });
    const companies = normalizeCompanies(rawCompanies, deals, { userNames, statusLabels: labels });

    return respond({
      success: true,
      isDemoMode: false,
      companies,
      deals,
      userNames,
      statusLabels: labels,
      totalCompanies: companies.length,
      totalDeals: deals.length,
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
