// src/app/api/bitrix/diagnostics/smart-process/route.ts
// ─────────────────────────────────────────────────────────────────────
// GET /api/bitrix/diagnostics/smart-process
//
// ONE narrow, fixed, READ-ONLY diagnostic routine exposing why Smart
// Process 1032 fails in the real deployed runtime:
//   Probe 1  crm.item.fields   — entity metadata access
//   Probe 2  crm.item.list     — minimal read (select: ["id"])
//   Probe 3  crm.item.list     — EXACT production SMART_PROCESS_ITEM_SELECT
//   Probe 4  crm.item.list     — second page / cursor (only when reported)
//
// Invariants:
// - admin-only (requireAdmin — strongest existing server auth guard);
// - read-only Bitrix methods only (crm.item.fields / crm.item.list);
// - no request parameters are read — a fixed routine, NOT a Bitrix proxy;
// - no-store; deterministic; sequential; safe to call in production;
// - responses carry ONLY probe statuses/totals/booleans and safe failure
//   metadata ({ method, httpStatus?, bitrixCode? }) — never item payloads,
//   IDs, titles, field values, error_description, URLs, or credentials;
// - HTTP 200 whenever the routine executes (individual probe failures are
//   reported inside the matrix); endpoint-level 4xx/5xx only for auth
//   failure or unexpected internal failure before probes can be reported.
// ─────────────────────────────────────────────────────────────────────

import { NextResponse } from "next/server";
import { requireAdmin, isAuthError } from "@/lib/auth-guard";
import { runSmartProcessDiagnostics } from "@/lib/bitrix-diagnostics";

export const dynamic = "force-dynamic";

export async function GET() {
  // ─── SECURITY: Admin-only internal diagnostics ───
  const auth = await requireAdmin();
  if (isAuthError(auth)) return auth;

  const respond = (payload: unknown, status = 200) =>
    NextResponse.json(payload, {
      status,
      headers: { "Cache-Control": "no-store" },
    });

  try {
    const report = await runSmartProcessDiagnostics();
    return respond(report);
  } catch (error) {
    // Unexpected failure BEFORE probes can be reported (e.g. contract-gate
    // misconfiguration). No Bitrix payload details are exposed — only the
    // neutral incomplete diagnosis. Errors are logged server-side only.
    console.error("[Smart Process Diagnostics Error]", error);
    return respond(
      {
        success: false,
        diagnosis: "DIAGNOSTIC_INCOMPLETE",
      },
      500
    );
  }
}
