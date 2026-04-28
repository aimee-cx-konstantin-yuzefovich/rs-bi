import { NextRequest, NextResponse } from "next/server";
import { bitrixPost, type BitrixDealsResponse } from "@/lib/bitrix";
import { requireAuth, isAuthError } from "@/lib/auth-guard";

export const dynamic = "force-dynamic";

export interface DealsRequestBody {
  select?: string[];
  filter?: Record<string, string | string[]>;
  order?: Record<string, string>;
  start?: number;
}

// ─── Input Validation Constants ───
const MAX_SELECT_FIELDS = 200;
const MAX_FILTER_KEYS = 50;
const MAX_START_VALUE = 100000;
const MAX_ORDER_KEYS = 10;
const MAX_FILTER_VALUE_LENGTH = 1000; // Prevent oversized filter values
const ALLOWED_ORDER_DIRECTIONS = new Set(["ASC", "DESC"]);
const SAFE_FIELD_NAME_PATTERN = /^[a-zA-Z0-9_]+(\.[a-zA-Z0-9_]+)?$/;

/**
 * Validate and sanitize the request body for deals endpoint.
 * Returns sanitized body or throws error with safe message.
 */
function validateDealsRequest(body: unknown): DealsRequestBody {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw new Error("Invalid request format");
  }

  const raw = body as Record<string, unknown>;

  // Validate `select`
  let select: string[] = ["*", "UF_*"];
  if (raw.select !== undefined) {
    if (!Array.isArray(raw.select)) {
      throw new Error("Parameter 'select' must be an array");
    }
    if (raw.select.length > MAX_SELECT_FIELDS) {
      throw new Error(`Parameter 'select' exceeds maximum of ${MAX_SELECT_FIELDS} fields`);
    }
    // Validate each field name
    select = raw.select.map((s: unknown) => {
      if (typeof s !== "string") {
        throw new Error("Each 'select' item must be a string");
      }
      if (!SAFE_FIELD_NAME_PATTERN.test(s) && s !== "*" && s !== "UF_*") {
        throw new Error("Invalid field name in 'select' parameter");
      }
      return s;
    });
  }

  // Validate `filter`
  let filter: Record<string, string | string[]> = {};
  if (raw.filter !== undefined) {
    if (typeof raw.filter !== "object" || Array.isArray(raw.filter)) {
      throw new Error("Parameter 'filter' must be an object");
    }
    const filterKeys = Object.keys(raw.filter as Record<string, unknown>);
    if (filterKeys.length > MAX_FILTER_KEYS) {
      throw new Error(`Parameter 'filter' exceeds maximum of ${MAX_FILTER_KEYS} keys`);
    }
    for (const key of filterKeys) {
      // Validate filter key format (allow >=, <=, etc. prefixes)
      if (!/^[><=!]*[a-zA-Z0-9_]+$/.test(key)) {
        throw new Error("Invalid key in 'filter' parameter");
      }
      const value = (raw.filter as Record<string, unknown>)[key];
      if (typeof value === "string") {
        if (value.length > MAX_FILTER_VALUE_LENGTH) {
          throw new Error(`Filter value for key '${key}' exceeds maximum length of ${MAX_FILTER_VALUE_LENGTH}`);
        }
        filter[key] = value;
      } else if (Array.isArray(value) && value.every((v) => typeof v === "string")) {
        if (value.some((v) => v.length > MAX_FILTER_VALUE_LENGTH)) {
          throw new Error(`Filter value exceeds maximum length of ${MAX_FILTER_VALUE_LENGTH}`);
        }
        filter[key] = value as string[];
      } else {
        throw new Error("Invalid value in 'filter' parameter");
      }
    }
  }

  // Validate `order`
  let order: Record<string, string> = { DATE_CREATE: "DESC" };
  if (raw.order !== undefined) {
    if (typeof raw.order !== "object" || Array.isArray(raw.order)) {
      throw new Error("Parameter 'order' must be an object");
    }
    const orderKeys = Object.keys(raw.order as Record<string, unknown>);
    if (orderKeys.length > MAX_ORDER_KEYS) {
      throw new Error(`Parameter 'order' exceeds maximum of ${MAX_ORDER_KEYS} keys`);
    }
    for (const key of orderKeys) {
      if (!SAFE_FIELD_NAME_PATTERN.test(key)) {
        throw new Error("Invalid key in 'order' parameter");
      }
      const dir = (raw.order as Record<string, unknown>)[key];
      if (typeof dir !== "string" || !ALLOWED_ORDER_DIRECTIONS.has(dir.toUpperCase())) {
        throw new Error(`Invalid order direction for key '${key}': must be ASC or DESC`);
      }
      order[key] = dir.toUpperCase();
    }
  }

  // Validate `start`
  let start = 0;
  if (raw.start !== undefined) {
    if (typeof raw.start !== "number" || !Number.isInteger(raw.start) || raw.start < 0) {
      throw new Error("Parameter 'start' must be a non-negative integer");
    }
    if (raw.start > MAX_START_VALUE) {
      throw new Error(`Parameter 'start' exceeds maximum value of ${MAX_START_VALUE}`);
    }
    start = raw.start;
  }

  return { select, filter, order, start };
}

export async function POST(request: NextRequest) {
  // ─── SECURITY: Require authentication ───
  const authResult = await requireAuth();
  if (isAuthError(authResult)) return authResult;

  try {
    // Limit request body size to 10KB to prevent DoS via oversized payloads
    const rawBody = await request.text();
    if (rawBody.length > 10_000) {
      return NextResponse.json(
        { success: false, error: "Request body too large", deals: [], total: 0 },
        { status: 413 }
      );
    }

    // Parse and validate request body
    let body: unknown;
    try {
      body = JSON.parse(rawBody);
    } catch {
      return NextResponse.json(
        { success: false, error: "Invalid JSON in request body", deals: [], total: 0 },
        { status: 400 }
      );
    }

    const validated = validateDealsRequest(body);

    // Build Bitrix24 API request with validated parameters
    const apiBody: Record<string, unknown> = {
      select: validated.select,
      filter: validated.filter,
      order: validated.order,
      start: validated.start,
    };

    const data = await bitrixPost<BitrixDealsResponse>(
      "crm.deal.list",
      apiBody
    );

    // Fetch all pages if there are more results
    let allDeals = data.result || [];
    let nextStart = data.next;
    // Preserve the ACTUAL total from Bitrix24 (not just fetched count)
    // This is critical for the UI to show "X из Y" correctly when there are
    // more deals than our pagination limit can fetch
    const bitrixTotal = data.total ?? allDeals.length;

    // Paginate to get all deals (limit to max 1000 to prevent overload)
    let pageCount = 0;
    const MAX_PAGES = 20; // 20 pages * 50 per page = 1000 deals max per request

    while (nextStart && pageCount < MAX_PAGES) {
      const pageData = await bitrixPost<BitrixDealsResponse>(
        "crm.deal.list",
        {
          ...apiBody,
          start: nextStart,
        }
      );

      allDeals = [...allDeals, ...(pageData.result || [])];
      nextStart = pageData.next;
      pageCount++;
    }

    const truncated = bitrixTotal > allDeals.length;

    return NextResponse.json({
      success: true,
      deals: allDeals,
      total: bitrixTotal,
      truncated,
      fetched: allDeals.length,
    });
  } catch (error) {
    console.error("[Deals API Error] Full error details:", error);

    // Return sanitized error message to client
    const message = error instanceof Error ? error.message : "Failed to fetch deals";

    // Don't expose internal error details
    const safeMessage = message.includes("not configured")
      ? message
      : message.includes("Invalid")
      ? message
      : message.includes("exceeds maximum")
      ? message
      : message.includes("must be")
      ? message
      : "Failed to fetch deals. Please try again later.";

    return NextResponse.json(
      {
        success: false,
        error: safeMessage,
        deals: [],
        total: 0,
      },
      { status: message.includes("Invalid") || message.includes("must be") || message.includes("exceeds") ? 400 : 500 }
    );
  }
}
