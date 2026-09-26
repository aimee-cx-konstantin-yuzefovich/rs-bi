import { NextRequest, NextResponse } from "next/server";
import { bitrixPost } from "@/lib/bitrix";
import { requireAuth, isAuthError } from "@/lib/auth-guard";
import { fetchCappedPages } from "@/lib/bitrix-pagination";
import { resolveDatasetCoverage } from "@/lib/dataset-coverage";

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
 * Uses the shared cap-aware pagination primitive: IDs validated, duplicates
 * never inflate counts, failed pages → PARTIAL, total consistency checked.
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

    // First-page failure fails closed (500) — never a fake "zero companies".
    let pages;
    try {
      pages = await fetchCappedPages<CompanyRecord>({
        method: "crm.company.list",
        baseParams: { FILTER, SELECT, ORDER: { TITLE: "ASC" } },
        idOf: (row) => {
          const rawId = row.ID ?? row.id;
          if (rawId === undefined || rawId === null) return null;
          const s = String(rawId).trim();
          return s === "" ? null : s;
        },
        cap: MAX_COMPANIES_TO_FETCH,
        pageSize: 50,
        concurrency: 5,
        start: 0,
        fetchPage: (params) =>
          bitrixPost<{ result?: CompanyRecord[]; total?: number; next?: unknown }>(
            "crm.company.list",
            params
          ),
        logPrefix: "[Companies List API]",
      });
    } catch (pageError) {
      throw pageError instanceof Error ? pageError : new Error("Failed to fetch companies");
    }
    if (pages.rows.length === 0 && pages.failedPages > 0) {
      throw new Error("Failed to fetch companies");
    }

    const companies = pages.rows.map((company) => {
      const title = typeof company.TITLE === "string" ? company.TITLE.trim() : "";
      return { ...company, TITLE: title || "Без названия" };
    });

    const bitrixTotal = pages.total ?? companies.length;
    const fetched = companies.length;
    const cappedByLimit = bitrixTotal > MAX_COMPANIES_TO_FETCH;
    const truncated = bitrixTotal > fetched;
    const partial = pages.partial;

    const warning = pages.missingIdCount > 0 || pages.totalInconsistent
      ? `Обнаружены некорректные данные в ответе CRM. Загружено ${fetched} из ${bitrixTotal} компаний.`
      : partial
      ? `Не удалось загрузить часть данных (${pages.failedPages} запрос(ов) не выполнено). Показано ${fetched} из ${bitrixTotal} компаний — повторите синхронизацию.`
      : truncated
      ? `Показаны первые ${fetched} из ${bitrixTotal} компаний.`
      : undefined;

    const coverage = resolveDatasetCoverage(
      {
        fetched,
        total: bitrixTotal,
        partial,
        failedPages: pages.failedPages,
        failedOffsets: pages.failedOffsets,
        cappedByLimit,
        truncated,
        warning,
      },
      MAX_COMPANIES_TO_FETCH
    );

    return NextResponse.json({
      success: true,
      companies,
      total: bitrixTotal,
      fetched,
      truncated,
      partial,
      cappedByLimit,
      warning,
      coverage,
      duplicateCount: pages.duplicateCount,
      missingIdCount: pages.missingIdCount,
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
