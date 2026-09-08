import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

// Process liveness only: orchestration must not depend on SSO, SQLite or CRM.
export async function GET() {
  return NextResponse.json({ status: "ok" }, {
    headers: { "Cache-Control": "no-store" },
  });
}
