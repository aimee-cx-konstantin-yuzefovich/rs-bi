// src/app/api/bitrix/samples/route.ts
// ─────────────────────────────────────────────────────────────────────
// POST /api/bitrix/samples — authoritative Samples dataset (Phase C).
//
// Contract:
// - requireAuth (WordPress SSO JWT), same as every Bitrix API route;
// - body ≤ 10KB, strictly validated: { responsibleId?, companyId? } only;
// - fixed server-side SELECT; no arbitrary fields/methods/entityTypeId
//   are accepted from the browser;
// - complete dataset via fail-closed pagination (see bitrix-fetch.ts);
// - Smart Process 1032 items fetched as the authoritative current-cycle
//   source; SP fetch failure or unverified contract FAILS CLOSED (502) —
//   a legacy-only dataset is never returned as if complete;
// - responses never contain webhook URL or credential material.
// ─────────────────────────────────────────────────────────────────────

import { NextRequest, NextResponse } from "next/server";
import { requireAuth, isAuthError } from "@/lib/auth-guard";
import {
  fetchFieldLabelMaps,
  fetchSampleCompanies,
  fetchSampleDeals,
  fetchSmartProcessSampleItems,
  fetchSmartProcessStageDirectory,
  makeLabelResolver,
} from "@/lib/samples/bitrix-fetch";
import { buildSampleSummaries } from "@/lib/samples/aggregate";
import { collectCompanyScopedSmartProcessCandidates } from "@/lib/samples/smart-process-service";
import { SAMPLE_DATA_ISSUE_LABELS } from "@/lib/samples/constants";
import { SMART_PROCESS_HAS_DISCOVERED_CONTRACT } from "@/lib/samples/smart-process-contract";
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

  const routeStart = Date.now();
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

    // Fetch metadata, companies, Smart Process candidates, and the live
    // stage directory concurrently: independent until aggregation.
    // Metadata/stage-directory failure remains non-fatal; Company/Deal/SP
    // fetch is fail-closed.
    //
    // Company scope goes through the ONE shared trustworthy company-scope
    // mechanism (candidates = direct company ∪ exact parentId2 → Deal of X;
    // complete Deal→Company map incl. foreign-linked deals) so fallback-by-
    // Deal items are never lost and relation conflicts are detected from a
    // complete map — identical attribution semantics to
    // /api/bitrix/smart-process-items { companyId }. The mechanism's Deal
    // rows double as the aggregate's Deal input: exactly one scoped
    // crm.deal.list read per request (no duplicate scope reads, no N+1).
    const scopedPromise = scope.companyId
      ? collectCompanyScopedSmartProcessCandidates(scope.companyId)
      : null;

    const [fieldMetadata, companies, scoped, smartProcessItems, stageDirectory, fullScopeDeals] =
      await Promise.all([
        fetchFieldLabelMaps(),
        fetchSampleCompanies(scope),
        scopedPromise ?? Promise.resolve(null),
        scopedPromise
          ? scopedPromise.then((s) => s.rows)
          : fetchSmartProcessSampleItems(scope),
        fetchSmartProcessStageDirectory(),
        // Full scope only (company scope reuses the candidate mechanism's
        // own scoped Deal rows — exactly one scoped deal read per request).
        scopedPromise ? Promise.resolve([]) : fetchSampleDeals(scope),
      ]);
    const labelResolver = makeLabelResolver(fieldMetadata.labels);

    const { summaries, orphanDeals, qualityCounts } = buildSampleSummaries(
      companies,
      scoped ? scoped.companyDealRows : fullScopeDeals,
      smartProcessItems,
      {
        labelResolver,
        liveStageLabels: stageDirectory.available ? stageDirectory.labels : undefined,
        // Scoped loads supply the complete authoritative Deal→Company map so
        // conflict detection never runs on the scoped deal subset. Full
        // scope omits it → global semantics unchanged.
        authoritativeDealCompanyById: scoped?.dealCompanyById,
      }
    );

    const meta: SamplesResponseMeta = { statusLabels: fieldMetadata.labels };

    return respond({
      success: true,
      samples: summaries,
      total: summaries.length,
      orphanDealCount: orphanDeals.length,
      metadataPartial: Boolean(fieldMetadata.partial),
      smartProcess: { qualityCounts },
      meta,
      issueLabels: SAMPLE_DATA_ISSUE_LABELS,
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

    console.error("[Samples API Error]", {
      errorCode,
      durationMs: duration,
      error: errorMessage,
    });

    const message =
      error instanceof Error && error.message.includes("not configured")
        ? error.message
        : "Не удалось загрузить данные по образцам. Попробуйте ещё раз.";

    return respond({ success: false, error: message, code: errorCode }, 502);
  }
}
