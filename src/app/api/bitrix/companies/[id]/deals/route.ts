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
    const seenStarts = new Set<number>([0]);
    const rawItems: Array<Record<string, unknown>> = [];

    while (true) {
      const data = await bitrixPost<{
        result?: { items?: Array<Record<string, unknown>> } | Array<Record<string, unknown>>;
        total?: number;
        next?: unknown;
      }>("crm.item.list", {
        entityTypeId: 2,
        filter: { companyId: Number(id) },
        select: ["id", "title", "stageId", "opportunity", "currencyId", "companyId"],
        useOriginalUfNames: "Y",
        start,
      });

      // A malformed result envelope (null / object without items) means the
      // Bitrix response was corrupted. Treat it as a transport-level failure —
      // NEVER as an authoritative "zero deals" answer.
      const hasValidEnvelope =
        Array.isArray(data.result) ||
        (data.result !== null && typeof data.result === "object" && Array.isArray(data.result.items));

      if (!hasValidEnvelope) {
        throw new Error("Invalid crm.item.list result envelope from Bitrix");
      }

      const pageItems = Array.isArray(data.result)
        ? data.result
        : Array.isArray(data.result?.items)
        ? data.result.items
        : [];

      rawItems.push(...pageItems);

      // Bitrix omits `next` when there are no more pages.
      if (data.next === undefined || data.next === null) {
        break;
      }

      const nextRaw = data.next;
      const nextNum = Number(nextRaw);

      const isValidNext =
        typeof nextRaw !== "boolean" &&
        typeof nextRaw !== "object" &&
        Number.isFinite(nextNum) &&
        Number.isInteger(nextNum) &&
        nextNum >= 0 &&
        nextNum > start &&
        !seenStarts.has(nextNum);

      if (!isValidNext) {
        throw new Error("Invalid pagination next token from Bitrix");
      }

      seenStarts.add(nextNum);
      start = nextNum;
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
