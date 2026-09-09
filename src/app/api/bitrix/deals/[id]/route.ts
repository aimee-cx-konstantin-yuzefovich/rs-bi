import { NextRequest, NextResponse } from "next/server";
import { requireAuth, isAuthError } from "@/lib/auth-guard";
import { bitrixPost, BitrixItemError } from "@/lib/bitrix";
import { BITRIX_PORTAL_URL } from "@/lib/config.server";
import { isDealId, normalizeDealPreview, getBitrixEntityUrl } from "@/lib/deal-preview";

export const dynamic = "force-dynamic";

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const auth = await requireAuth();
  if (isAuthError(auth)) return auth;

  const respond = (body: unknown, status = 200) =>
    NextResponse.json(body, {
      status,
      headers: { "Cache-Control": "no-store" },
    });

  const { id } = await context.params;
  if (!isDealId(id)) {
    return respond({ success: false, error: "Некорректный ID сделки" }, 400);
  }

  try {
    const data = await bitrixPost<{
      result?: { item?: Record<string, unknown> | null };
    }>("crm.item.get", {
      entityTypeId: 2,
      id: Number(id),
      useOriginalUfNames: "Y",
    });

    const item = data.result?.item;
    if (item === null) {
      return respond({ success: false, error: "Сделка не найдена" }, 404);
    }
    if (!item || Array.isArray(item) || String(item.id) !== id) {
      throw new Error("Invalid deal response");
    }

    // If deal has an associated company, fetch its real TITLE using crm.item.get entityTypeId 4
    let companyTitle: string | null = null;
    let companyLookupFailed = false;
    const companyId = item.companyId;
    if (
      companyId !== undefined &&
      companyId !== null &&
      String(companyId) !== "0" &&
      /^[1-9]\d*$/.test(String(companyId))
    ) {
      try {
        const companyData = await bitrixPost<{
          result?: { item?: Record<string, unknown> | null };
        }>("crm.item.get", {
          entityTypeId: 4,
          id: Number(companyId),
          useOriginalUfNames: "Y",
        });
        const cItem = companyData.result?.item;
        if (cItem && typeof cItem === "object" && !Array.isArray(cItem)) {
          companyTitle = typeof cItem.title === "string" ? cItem.title : "";
        } else {
          companyTitle = "";
        }
      } catch (companyErr) {
        console.warn(`[Bitrix24 Deal API] Failed to fetch company ${companyId}:`, companyErr);
        companyLookupFailed = true;
      }
    }

    const deal = normalizeDealPreview(item, companyTitle, { companyLookupFailed });
    const bitrixUrl = getBitrixEntityUrl("deal", id, BITRIX_PORTAL_URL);
    const companyBitrixUrl = deal.COMPANY_ID
      ? getBitrixEntityUrl("company", String(deal.COMPANY_ID), BITRIX_PORTAL_URL)
      : null;

    return respond({
      success: true,
      deal,
      bitrixUrl,
      companyBitrixUrl,
    });
  } catch (error) {
    const status =
      error instanceof BitrixItemError
        ? error.code === "NOT_FOUND"
          ? 404
          : 403
        : 502;
    const message =
      status === 404
        ? "Сделка не найдена"
        : status === 403
        ? "Нет доступа к сделке"
        : "Не удалось загрузить сделку. Попробуйте ещё раз.";
    return respond({ success: false, error: message }, status);
  }
}
