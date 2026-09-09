import { NextRequest, NextResponse } from "next/server";
import { bitrixPost } from "@/lib/bitrix";
import { requireAuth, isAuthError } from "@/lib/auth-guard";
import pLimit from "p-limit";

export const dynamic = "force-dynamic";

export interface CompanyListRequestBody {
  responsibleId?: string;
  select?: string[];
}

type CompanyRecord = Record<string, any>;

// ─── Input Validation Constants ───
const MAX_SELECT_FIELDS = 100;
// Matches the deals route's pattern (allows one dot for sub-field notation)
// so a well-formed Bitrix field name is never rejected here but accepted there.
const SAFE_FIELD_NAME_PATTERN = /^[a-zA-Z0-9_]+(\.[a-zA-Z0-9_]+)?$/;
// Real total (from Bitrix) is always reported accurately; this only caps how
// many rows we actually pull into the browser in one go.
const MAX_COMPANIES_TO_FETCH = 5000;

function validateCompanyListRequest(body: unknown): CompanyListRequestBody {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw new Error("Invalid request format");
  }
  const raw = body as Record<string, unknown>;

  let responsibleId: string | undefined;
  if (raw.responsibleId !== undefined && raw.responsibleId !== null && raw.responsibleId !== "all") {
    if (typeof raw.responsibleId !== "string" || !/^\d+$/.test(raw.responsibleId) || raw.responsibleId === "0") {
      throw new Error("Parameter 'responsibleId' must be a numeric string or 'all'");
    }
    responsibleId = raw.responsibleId;
  }

  let select: string[] = [];
  if (raw.select !== undefined) {
    if (!Array.isArray(raw.select)) {
      throw new Error("Parameter 'select' must be an array");
    }
    if (raw.select.length > MAX_SELECT_FIELDS) {
      throw new Error(`Parameter 'select' exceeds maximum of ${MAX_SELECT_FIELDS} fields`);
    }
    select = raw.select.map((s: unknown) => {
      if (typeof s !== "string" || !SAFE_FIELD_NAME_PATTERN.test(s)) {
        throw new Error("Invalid field name in 'select' parameter");
      }
      return s;
    });
  }

  return { responsibleId, select };
}

/**
 * POST /api/bitrix/companies/list
 * Direct company query, independent of the deals dataset.
 */
export async function POST(request: NextRequest) {
  const authResult = await requireAuth();
  if (isAuthError(authResult)) return authResult;

  try {
    const rawBody = await request.text();
    if (rawBody.length > 10_000) {
      return NextResponse.json(
        { success: false, error: "Request body too large", companies: [], total: 0 },
        { status: 413 }
      );
    }

    let body: unknown;
    try {
      body = rawBody ? JSON.parse(rawBody) : {};
    } catch {
      return NextResponse.json(
        { success: false, error: "Invalid JSON in request body", companies: [], total: 0 },
        { status: 400 }
      );
    }

    const { responsibleId, select } = validateCompanyListRequest(body);

    // TITLE is mandatory for the Companies UI: company names must come from
    // Bitrix TITLE and must never be replaced by the internal company ID.
    const SELECT = [...new Set(["ID", "TITLE", "ASSIGNED_BY_ID", ...(select || [])])];
    if (SELECT.length > MAX_SELECT_FIELDS) {
      throw new Error(`Parameter 'select' exceeds maximum of ${MAX_SELECT_FIELDS} fields`);
    }
    const FILTER: Record<string, string> = responsibleId ? { ASSIGNED_BY_ID: responsibleId } : {};

    const firstPage = await bitrixPost<{ result?: CompanyRecord[]; total?: number; next?: number }>(
      "crm.company.list",
      { FILTER, SELECT, ORDER: { TITLE: "ASC" }, start: 0 }
    );

    let companies = firstPage.result || [];
    const bitrixTotal = firstPage.total ?? companies.length;
    let failedPages = 0;

    if (firstPage.next && bitrixTotal > 50) {
      const limit = pLimit(5);
      const targetTotal = Math.min(bitrixTotal, MAX_COMPANIES_TO_FETCH);
      const promises = [];

      for (let offset = 50; offset < targetTotal; offset += 50) {
        promises.push(
          limit(() =>
            bitrixPost<{ result?: CompanyRecord[] }>("crm.company.list", {
              FILTER,
              SELECT,
              ORDER: { TITLE: "ASC" },
              start: offset,
            })
          )
        );
      }

      const results = await Promise.allSettled(promises);
      for (const res of results) {
        if (res.status === "fulfilled" && res.value.result) {
          companies = [...companies, ...res.value.result];
        } else if (res.status === "rejected") {
          failedPages++;
          console.error("[Companies List API] Page fetch failed:", res.reason);
        }
      }
    }

    companies = companies.map((company) => {
      const title = typeof company.TITLE === "string" ? company.TITLE.trim() : "";
      return { ...company, TITLE: title || "Без названия" };
    });

    const cappedByLimit = bitrixTotal > MAX_COMPANIES_TO_FETCH;
    const truncated = bitrixTotal > companies.length;
    const warning = failedPages > 0
      ? `Не удалось загрузить часть данных (${failedPages} запрос(ов) не выполнено). Показано ${companies.length} из ${bitrixTotal} компаний — повторите синхронизацию.`
      : truncated
        ? `Показаны первые ${companies.length} из ${bitrixTotal} компаний.`
        : undefined;

    return NextResponse.json({
      success: true,
      companies,
      total: bitrixTotal,
      fetched: companies.length,
      truncated,
      partial: failedPages > 0,
      cappedByLimit,
      warning,
    });
  } catch (error) {
    console.error("[Companies List API Error]", error);

    const message = error instanceof Error ? error.message : "Failed to fetch companies";
    const isClientError =
      message.includes("Invalid") || message.includes("must be") || message.includes("exceeds");
    const safeMessage = isClientError || message.includes("not configured")
      ? message
      : "Failed to fetch companies. Please try again later.";

    return NextResponse.json(
      { success: false, error: safeMessage, companies: [], total: 0 },
      { status: isClientError ? 400 : 500 }
    );
  }
}
