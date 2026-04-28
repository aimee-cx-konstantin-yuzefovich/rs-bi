import { NextRequest, NextResponse } from "next/server";
import { bitrixPost } from "@/lib/bitrix";
import { requireAuth, isAuthError } from "@/lib/auth-guard";

export const dynamic = "force-dynamic";

/**
 * POST /api/bitrix/companies
 * Fetches company data from Bitrix24.
 * Accepts { ids: string[], select: string[] } in the body.
 *
 * SECURITY: Requires authentication. Does NOT expose the webhook URL.
 */
export async function POST(request: NextRequest) {
  // ─── SECURITY: Require authentication ───
  const authResult = await requireAuth();
  if (isAuthError(authResult)) return authResult;

  try {
    const body = await request.json();
    const { ids, select } = body;

    const ALLOWED_FIELDS = [
      "ID",
      "TITLE",
      "ASSIGNED_BY_ID",
      "COMPANY_TYPE",
      "INDUSTRY",
      "REVENUE",
      "CURRENCY_ID",
      "EMPLOYEES",
      "COMMENTS",
      "DATE_CREATE",
      "DATE_MODIFY",
      "IS_MY_COMPANY"
    ];

    const safeSelect = (select || []).filter((field: string) =>
      ALLOWED_FIELDS.includes(field) || field.startsWith("UF_CRM_")
    );

    if (safeSelect.length === 0) {
      return NextResponse.json({ error: "Invalid fields" }, { status: 400 });
    }

    if (!Array.isArray(ids) || ids.length === 0) {
      return NextResponse.json({ success: true, companies: {} });
    }

    // Validate ids
    const validIds = ids.filter((id) => /^\d+$/.test(String(id).trim()));
    if (validIds.length === 0) {
      return NextResponse.json({ success: true, companies: {} });
    }

    // Fetch companies in batches of 50 (Bitrix24 limit for list methods)
    const companiesMap: Record<string, any> = {};
    
    // Initialize all requested IDs with empty objects to prevent re-fetching missing companies
    for (const id of validIds) {
      companiesMap[id] = {};
    }

    const batchSize = 50;

    for (let i = 0; i < validIds.length; i += batchSize) {
      const batchIds = validIds.slice(i, i + batchSize);
      
      try {
        const data = await bitrixPost<{ result: Array<any> }>(
          "crm.company.list",
          {
            FILTER: { "@ID": batchIds },
            SELECT: safeSelect,
          }
        );

        if (Array.isArray(data.result)) {
          for (const company of data.result) {
            companiesMap[company.ID] = company;
          }
        }
      } catch (error) {
        console.error(`[Companies API] Failed to fetch companies batch:`, error);
      }
    }

    return NextResponse.json({ success: true, companies: companiesMap });
  } catch (error) {
    console.error("[Companies API Error]", error);

    const message =
      error instanceof Error && error.message.includes("not configured")
        ? error.message
        : "Failed to fetch companies.";

    return NextResponse.json(
      { success: false, error: message, companies: {} },
      { status: 500 }
    );
  }
}
