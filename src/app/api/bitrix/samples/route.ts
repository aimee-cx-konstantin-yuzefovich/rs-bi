// src/app/api/bitrix/samples/route.ts
// ─────────────────────────────────────────────────────────────────────
// POST /api/bitrix/samples — authoritative Samples v1 dataset.
//
// Contract:
// - requireAuth (WordPress SSO JWT), same as every Bitrix API route;
// - body ≤ 10KB, strictly validated: { responsibleId?, companyId? } only;
// - fixed server-side SELECT; no arbitrary fields/methods/entityTypeId
//   are accepted from the browser;
// - complete dataset via fail-closed pagination (see bitrix-fetch.ts);
// - responses never contain webhook URL or credential material.
// ─────────────────────────────────────────────────────────────────────

import { NextRequest, NextResponse } from "next/server";
import { requireAuth, isAuthError } from "@/lib/auth-guard";
import {
  fetchFieldLabelMaps,
  fetchSampleCompanies,
  fetchSampleDeals,
  makeLabelResolver,
} from "@/lib/samples/bitrix-fetch";
import { buildSampleSummaries } from "@/lib/samples/aggregate";
import { SAMPLE_DATA_ISSUE_LABELS } from "@/lib/samples/constants";
import type { SamplesResponseMeta } from "@/lib/samples/types";

export const dynamic = "force-dynamic";

const MAX_BODY_BYTES = 10_000;
const ID_PATTERN = /^[1-9]\d*$/;

export interface SamplesRequestBody {
  responsibleId?: string;
  companyId?: string;
}

function validateBody(body: unknown): SamplesRequestBody {
  if (body === undefined || body === null) return {};
  if (typeof body !== "object" || Array.isArray(body)) {
    throw new Error("Parameter 'body' must be an object");
  }
  const raw = body as Record<string, unknown>;
  const out: SamplesRequestBody = {};

  if (raw.responsibleId !== undefined && raw.responsibleId !== null) {
    if (typeof raw.responsibleId !== "string" || !ID_PATTERN.test(raw.responsibleId)) {
      throw new Error("Parameter 'responsibleId' must be a positive integer string");
    }
    out.responsibleId = raw.responsibleId;
  }
  if (raw.companyId !== undefined && raw.companyId !== null) {
    if (typeof raw.companyId !== "string" || !ID_PATTERN.test(raw.companyId)) {
      throw new Error("Parameter 'companyId' must be a positive integer string");
    }
    out.companyId = raw.companyId;
  }
  for (const key of Object.keys(raw)) {
    if (key !== "responsibleId" && key !== "companyId") {
      throw new Error(`Unknown parameter '${key}'`);
    }
  }
  return out;
}

export async function POST(request: NextRequest) {
  // ─── SECURITY: Require authentication ───
  const auth = await requireAuth();
  if (isAuthError(auth)) return auth;

  const respond = (payload: unknown, status = 200) =>
    NextResponse.json(payload, {
      status,
      headers: { "Cache-Control": "no-store" },
    });

  try {
    // Limit request body size to 10KB (DoS protection, mirrors deals route).
    const rawBody = await request.text();
    if (rawBody.length > MAX_BODY_BYTES) {
      return respond(
        { success: false, error: "Request body too large" },
        413
      );
    }

    let parsed: unknown = undefined;
    if (rawBody.trim() !== "") {
      try {
        parsed = JSON.parse(rawBody);
      } catch {
        return respond({ success: false, error: "Invalid JSON in request body" }, 400);
      }
    }

    let scope: SamplesRequestBody;
    try {
      scope = validateBody(parsed);
    } catch (error) {
      return respond(
        { success: false, error: error instanceof Error ? error.message : "Invalid request" },
        400
      );
    }

    // Metadata first: label resolution for enums/statuses.
    // Non-fatal: on failure the resolver passes raw values through.
    const { labels } = await fetchFieldLabelMaps();
    const labelResolver = makeLabelResolver(labels);

    const [companies, deals] = await Promise.all([
      fetchSampleCompanies(scope),
      fetchSampleDeals(scope),
    ]);

    const { summaries, orphanDeals } = buildSampleSummaries(companies, deals, {
      labelResolver,
    });

    const meta: SamplesResponseMeta = { statusLabels: labels };

    return respond({
      success: true,
      samples: summaries,
      total: summaries.length,
      orphanDealCount: orphanDeals.length,
      meta,
      issueLabels: SAMPLE_DATA_ISSUE_LABELS,
    });
  } catch (error) {
    console.error("[Samples API Error]", error);

    const message =
      error instanceof Error && error.message.includes("not configured")
        ? error.message
        : "Не удалось загрузить данные по образцам. Попробуйте ещё раз.";

    return respond({ success: false, error: message }, 502);
  }
}
