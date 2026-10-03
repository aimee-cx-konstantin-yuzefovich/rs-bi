// src/app/api/bitrix/diagnostics/samples-pipeline/route.ts
// ─────────────────────────────────────────────────────────────────────
// GET /api/bitrix/diagnostics/samples-pipeline
//
// ONE narrow, fixed, READ-ONLY diagnostic routine exposing the FIRST
// authoritative failing layer of the real Samples pipeline (below the
// already-proven Smart Process transport layer):
//   Probe A  field metadata (fetchFieldLabelMaps — Samples path)
//   Probe B  full-scope sample Companies loader
//   Probe C  full-scope sample Deal loader
//   Probe D  SP helper exactly as Samples consumes it
//   Probe E  live stage directory (non-fatal)
//   Probe F  canonical bounded-bulk Deal → Company relation map
//   Probe G  canonical aggregation (buildSampleSummaries)
//   Probe H  shared client response contract validator
//   Probe J  Commercial Funnel INPUT path (exact production selects)
//
// Invariants:
// - admin-only (requireAdmin — strongest existing server auth guard);
// - no request parameters are read — a fixed routine, NOT a Bitrix proxy;
// - no-store; sequential; safe to call in production; zero mutations;
// - responses carry ONLY statuses/counts/booleans/sanitized quality
//   counters and safe failure metadata ({ method, httpStatus?,
//   bitrixCode? }) — never company IDs/titles, Deal IDs, SP item IDs,
//   grades, quantities, comments, prices, SampleSummary objects,
//   labels, error_description, URLs, or credentials;
// - HTTP 200 whenever the routine executes (individual probe failures
//   are reported inside the matrix); endpoint-level 4xx/5xx only for
//   auth failure or unexpected internal failure before probes can be
//   reported.
// ─────────────────────────────────────────────────────────────────────

import { NextResponse } from "next/server";
import { requireAdmin, isAuthError } from "@/lib/auth-guard";
import { runSamplesPipelineDiagnostics } from "@/lib/samples-pipeline-diagnostics";

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
    const report = await runSamplesPipelineDiagnostics();
    return respond(report);
  } catch (error) {
    // Unexpected failure BEFORE probes can be reported. No Bitrix
    // payload details are exposed — only the neutral incomplete
    // diagnosis. Errors are logged server-side only.
    console.error("[Samples Pipeline Diagnostics Error]", error);
    return respond(
      {
        success: false,
        diagnosis: "DIAGNOSTIC_INCOMPLETE",
      },
      500
    );
  }
}
