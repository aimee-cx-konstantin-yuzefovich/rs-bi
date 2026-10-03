// src/app/api/bitrix/smart-process-items/route.ts
// ─────────────────────────────────────────────────────────────────────
// POST /api/bitrix/smart-process-items
//
// ONE bulk read seam exposing the canonical Smart Process 1032 item views
// (projected from the existing adapted evidence) to the UI: Deals table
// virtual columns, Deal Preview, Company Preview.
//
// Invariants:
// - auth required (WordPress SSO principal);
// - read-only Bitrix access (the service performs only list/fields/status reads);
// - strict body contract: {} or { companyId: "<positive integer string>" } only;
//   unknown keys and invalid companyId values are HTTP 400 BEFORE any Bitrix
//   work — an invalid scope never degrades into an unscoped/full load;
// - fail-closed contract gate (unverified SP contract never reaches transport);
// - initial failure is explicit (502) — never an empty-dataset masquerade;
// - a successful empty dataset is a truthful empty result (items: []);
// - no-store caching (client session cache owns snapshot semantics);
// - oversized body guard (10KB → 413).
// ─────────────────────────────────────────────────────────────────────

import { NextResponse } from "next/server";
import { requireAuth, isAuthError } from "@/lib/auth-guard";
import { loadSmartProcessItemViews } from "@/lib/samples/smart-process-service";
import { SMART_PROCESS_HAS_DISCOVERED_CONTRACT } from "@/lib/crm-constants";

export const dynamic = "force-dynamic";

const MAX_BODY_BYTES = 10 * 1024;

/** Positive integer string (no leading zeros, no zero, no negatives/decimals). */
const ID_PATTERN = /^[1-9]\d*$/;

/**
 * Strict body contract (mirrors /api/bitrix/samples validation philosophy):
 *   {}  → full population scope
 *   { "companyId": "<positive integer string>" } → single-company scope
 * Anything else is an explicit HTTP 400 BEFORE any Bitrix work: an invalid
 * scope must NEVER degrade into an unscoped/full population query.
 */
function validateBody(body: unknown): { companyId?: string } {
  if (body === undefined || body === null) return {};
  if (typeof body !== "object" || Array.isArray(body)) {
    throw new Error("Parameter 'body' must be an object");
  }
  const raw = body as Record<string, unknown>;
  const out: { companyId?: string } = {};

  if (Object.prototype.hasOwnProperty.call(raw, "companyId") && raw.companyId !== undefined) {
    if (typeof raw.companyId !== "string" || !ID_PATTERN.test(raw.companyId)) {
      throw new Error("Parameter 'companyId' must be a positive integer string");
    }
    out.companyId = raw.companyId;
  }
  for (const key of Object.keys(raw)) {
    if (key !== "companyId") {
      throw new Error(`Unknown parameter '${key}'`);
    }
  }
  return out;
}

export async function POST(request: Request) {
  // ─── SECURITY: Require authentication ───
  const auth = await requireAuth();
  if (isAuthError(auth)) return auth;

  const respond = (payload: unknown, status = 200) =>
    NextResponse.json(payload, {
      status,
      headers: { "Cache-Control": "no-store" },
    });

  // Strictly validated optional body; validation errors return BEFORE any
  // Smart Process load (no unscoped fallback for invalid scopes).
  let payload: { companyId?: string } = {};
  try {
    const raw = await request.text();
    if (raw.length > MAX_BODY_BYTES) {
      return respond({ success: false, error: "Request body too large" }, 413);
    }
    if (raw.trim() !== "") {
      const parsed: unknown = JSON.parse(raw);
      try {
        payload = validateBody(parsed);
      } catch (error) {
        return respond(
          { success: false, error: error instanceof Error ? error.message : "Invalid request" },
          400
        );
      }
    }
  } catch {
    return respond({ success: false, error: "Invalid request body" }, 400);
  }

  // Fail-closed gate: Smart Process is authoritative; an unverified contract
  // must never silently produce legacy-only views.
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

  try {
    const load = await loadSmartProcessItemViews(
      payload.companyId ? { companyId: payload.companyId } : {}
    );
    return respond({
      success: true,
      items: load.views,
      // Serialized index shapes: Maps → plain records keyed by id.
      byDealId: Object.fromEntries(
        [...load.indexes.byDealId.entries()].map(([k, v]) => [k, v])
      ),
      byCompanyId: Object.fromEntries(
        [...load.indexes.byCompanyId.entries()].map(([k, v]) => [k, v])
      ),
      stageDirectoryAvailable: load.stageDirectoryAvailable,
      total: load.views.length,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[Smart Process Items API Error]", message);

    const userMessage =
      error instanceof Error && error.message.includes("not configured")
        ? error.message
        : "Не удалось загрузить процессы тестирования. Попробуйте ещё раз.";

    return respond({ success: false, error: userMessage }, 502);
  }
}
