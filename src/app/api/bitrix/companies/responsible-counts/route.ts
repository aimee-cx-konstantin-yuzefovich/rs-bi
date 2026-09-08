import { NextResponse } from "next/server";
import { bitrixPost } from "@/lib/bitrix";
import { requireAuth, isAuthError } from "@/lib/auth-guard";
import pLimit from "p-limit";

export const dynamic = "force-dynamic";

type CompanyRow = { ASSIGNED_BY_ID?: string };

// Generous cap — this only scans 2 lightweight fields per company, so it's
// far cheaper per-row than the full companies/list endpoint.
const MAX_COMPANIES_TO_SCAN = 20_000;

/**
 * GET /api/bitrix/companies/responsible-counts
 *
 * True source of truth for "who is a company's responsible person" — scans
 * crm.company.list directly (ID + ASSIGNED_BY_ID only) and tallies how many
 * companies each person owns. Unlike deriving this from allDeals (deal
 * ownership) or from the full Bitrix user list (every account, including
 * ones that own zero companies), this reflects real company assignments only.
 */
export async function GET() {
  const authResult = await requireAuth();
  if (isAuthError(authResult)) return authResult;

  try {
    const firstPage = await bitrixPost<{ result?: CompanyRow[]; total?: number; next?: number }>(
      "crm.company.list",
      { SELECT: ["ID", "ASSIGNED_BY_ID"], ORDER: { ID: "ASC" }, start: 0 }
    );

    const counts: Record<string, number> = {};
    const tally = (rows: CompanyRow[]) => {
      for (const row of rows) {
        const id = String(row.ASSIGNED_BY_ID || "");
        if (!id) continue;
        counts[id] = (counts[id] || 0) + 1;
      }
    };

    tally(firstPage.result || []);
    const bitrixTotal = firstPage.total ?? (firstPage.result || []).length;

    if (firstPage.next && bitrixTotal > 50) {
      const limit = pLimit(5);
      const targetTotal = Math.min(bitrixTotal, MAX_COMPANIES_TO_SCAN);
      const promises = [];

      for (let offset = 50; offset < targetTotal; offset += 50) {
        promises.push(
          limit(() =>
            bitrixPost<{ result?: CompanyRow[] }>("crm.company.list", {
              SELECT: ["ID", "ASSIGNED_BY_ID"],
              ORDER: { ID: "ASC" },
              start: offset,
            })
          )
        );
      }

      const results = await Promise.allSettled(promises);
      for (const res of results) {
        if (res.status === "fulfilled" && res.value.result) {
          tally(res.value.result);
        }
      }
    }

    return NextResponse.json({ success: true, counts, total: bitrixTotal });
  } catch (error) {
    console.error("[Companies Responsible-Counts API Error]", error);

    const message =
      error instanceof Error && error.message.includes("not configured")
        ? error.message
        : "Failed to fetch company responsible counts.";

    return NextResponse.json({ success: false, error: message, counts: {}, total: 0 }, { status: 500 });
  }
}
