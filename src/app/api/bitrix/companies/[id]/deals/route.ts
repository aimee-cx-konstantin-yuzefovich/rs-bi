import { NextRequest, NextResponse } from "next/server";
import { requireAuth, isAuthError } from "@/lib/auth-guard";
import { bitrixPost, BitrixItemError } from "@/lib/bitrix";
import { BITRIX_PORTAL_URL } from "@/lib/config.server";
import { isCompanyId } from "@/lib/company-preview";
import { getBitrixEntityUrl } from "@/lib/deal-preview";

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
  if (!isCompanyId(id)) {
    return respond({ success: false, error: "Некорректный ID компании" }, 400);
  }

  try {
    let start = 0;
    let hasMore = true;
    const rawItems: Array<Record<string, unknown>> = [];
    const MAX_PAGES = 100;
    let pageCount = 0;

    while (hasMore && pageCount < MAX_PAGES) {
      pageCount++;
      const data = await bitrixPost<{
        result?: { items?: Array<Record<string, unknown>> } | Array<Record<string, unknown>>;
        total?: number;
        next?: number;
      }>("crm.item.list", {
        entityTypeId: 2,
        filter: { companyId: Number(id) },
        select: ["id", "title", "stageId", "opportunity", "currencyId", "companyId"],
        useOriginalUfNames: "Y",
        start,
      });

      const pageItems = Array.isArray(data.result)
        ? data.result
        : Array.isArray(data.result?.items)
        ? data.result.items
        : [];

      rawItems.push(...pageItems);

      if (
        data.next !== undefined &&
        data.next !== null &&
        Number(data.next) > start &&
        pageItems.length > 0
      ) {
        start = Number(data.next);
      } else if (
        pageItems.length === 50 &&
        (data.total === undefined || rawItems.length < data.total)
      ) {
        start += 50;
      } else {
        hasMore = false;
      }
    }

    // Deduplicate by Deal ID
    const seenIds = new Set<string>();
    const deals: Array<Record<string, unknown>> = [];

    for (const item of rawItems) {
      const rawId = item.id ?? item.ID;
      if (rawId === undefined || rawId === null) continue;
      const dealId = String(rawId).trim();
      if (!dealId || seenIds.has(dealId)) continue;
      seenIds.add(dealId);

      const rawTitle = typeof item.title === "string"
        ? item.title.trim()
        : typeof item.TITLE === "string"
        ? item.TITLE.trim()
        : "";
      const title = rawTitle || "Без названия";

      const stageId = item.stageId !== undefined && item.stageId !== null
        ? String(item.stageId)
        : item.STAGE_ID !== undefined && item.STAGE_ID !== null
        ? String(item.STAGE_ID)
        : null;

      const rawOpp = item.opportunity ?? item.OPPORTUNITY;
      const opportunity = rawOpp !== undefined && rawOpp !== null && rawOpp !== ""
        ? Number(rawOpp)
        : null;

      const currencyId = String(item.currencyId ?? item.CURRENCY_ID ?? "RUB");
      const itemCompanyId = String(item.companyId ?? item.COMPANY_ID ?? id);

      deals.push({
        ID: dealId,
        TITLE: title,
        STAGE_ID: stageId,
        OPPORTUNITY: opportunity !== null && !isNaN(opportunity) ? opportunity : null,
        CURRENCY_ID: currencyId,
        COMPANY_ID: itemCompanyId,
        bitrixUrl: getBitrixEntityUrl("deal", dealId, BITRIX_PORTAL_URL),
      });
    }

    return respond({
      success: true,
      deals,
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
        ? "Компания не найдена"
        : status === 403
        ? "Нет доступа к сделкам компании"
        : "Не удалось загрузить сделки компании. Попробуйте ещё раз.";
    return respond({ success: false, error: message }, status);
  }
}
