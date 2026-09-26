import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/**
 * Process liveness + non-secret build provenance.
 * Orchestration must not depend on SSO, SQLite or CRM.
 *
 * BUILD_SHA is injected by the build/deployment environment (CI sets it to
 * github.sha; build-deploy.sh sets it to the checked-out HEAD). It is NEVER
 * hard-coded in source and never derived from a possibly-stale file. When the
 * variable is absent (e.g. local dev), we truthfully report "unknown" — a
 * fabricated commit SHA would defeat exact-SHA release verification.
 */
export async function GET() {
  const buildSha = process.env.BUILD_SHA?.trim() || "unknown";
  const buildTime = process.env.BUILD_TIME?.trim() || undefined;

  return NextResponse.json(
    buildTime ? { status: "ok", buildSha, buildTime } : { status: "ok", buildSha },
    {
      headers: { "Cache-Control": "no-store" },
    }
  );
}
