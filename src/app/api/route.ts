import { NextResponse } from "next/server";

/**
 * Root API route — returns minimal health status.
 * SECURITY: Does NOT expose any internal configuration, URLs, or version info.
 */
export async function GET() {
  return NextResponse.json({ status: "ok" });
}
