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
// - fail-closed contract gate (unverified SP contract never reaches transport);
// - initial failure is explicit (502) — never an empty-dataset masquerade;
// - a successful empty dataset is a truthful empty result (items: []);
// - no-store caching (client session cache owns snapshot semantics);
// - request body not required; if present it is size-guarded.
// ─────────────────────────────────────────────────────────────────────

import { NextResponse } from "next/server";
import { requireAuth, isAuthError } from "@/lib/auth-guard";
import { loadSmartProcessItemViews } from "@/lib/samples/smart-process-service";
import { SMART_PROCESS_HAS_DISCOVERED_CONTRACT } from "@/lib/crm-constants";

export const dynamic = "force-dynamic";

const MAX_BODY_BYTES = 10 * 1024;

interface SmartProcessItemsPayload {
  companyId?: string;
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

  // Optional body: { companyId?: string } for single-company scope.
  let payload: SmartProcessItemsPayload = {};
  try {
    const raw = await request.text();
    if (raw.length > MAX_BODY_BYTES) {
      return respond({ success: false, error: "Request body too large" }, 413);
    }
    if (raw.trim()) {
      const parsed: unknown = JSON.parse(raw);
      if (parsed && typeof parsed === "object") {
        const companyId = (parsed as { companyId?: unknown }).companyId;
        if (typeof companyId === "string" && /^\d+$/.test(companyId.trim())) {
          payload = { companyId: companyId.trim() };
        }
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
