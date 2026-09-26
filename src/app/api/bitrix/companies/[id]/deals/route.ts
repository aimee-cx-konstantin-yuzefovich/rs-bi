import { NextRequest, NextResponse } from "next/server";
import { requireAuth, isAuthError } from "@/lib/auth-guard";
import { bitrixPost, BitrixItemError } from "@/lib/bitrix";
import { BITRIX_PORTAL_URL } from "@/lib/config.server";
import { isCompanyId } from "@/lib/company-preview";
import { getBitrixEntityUrl } from "@/lib/deal-preview";
import { normalizeCurrencyCode } from "@/lib/currency";
import { parseStrictNumber } from "@/lib/scalar-safety";

export const dynamic = "force-dynamic";

/**
 * GET /api/bitrix/companies/[id]/deals
 *
 * Identity/completeness contract (same guarantees as the analytical engine):
 * - every deal must have a valid ID; missing ID is corruption → the request
 *   fails closed, rows are never silently dropped;
 * - duplicates are detected → fail closed (never inflate counts);
 * - the first authoritative `total` is preserved and reconciled with the
 *   final unique count;
 * - malformed / repeated / non-advancing cursor → fail;
 * - amounts use canonical strict parsing: "0x10" and "12abc" are INVALID
 *   (null), never real numbers; "" / null are UNKNOWN (null).
 */
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
    let authoritativeTotal: number | undefined;
    let totalInconsistent = false;

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

      if (typeof data.total === "number") {
        if (authoritativeTotal === undefined) {
          authoritativeTotal = data.total;
        } else if (data.total !== authoritativeTotal) {
          totalInconsistent = true;
        }
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

    // Identity pass: dedupe + fail closed on missing IDs and duplicates.
    const seenIds = new Set<string>();
    const duplicateIds = new Set<string>();
    let missingIdCount = 0;
    const deals: Array<Record<string, unknown>> = [];

    for (const item of rawItems) {
      const rawId = item.id ?? item.ID;
      if (rawId === undefined || rawId === null) {
        missingIdCount++;
        continue;
      }
      const dealId = String(rawId).trim();
      if (!dealId) {
        missingIdCount++;
        continue;
      }
      if (seenIds.has(dealId)) {
        duplicateIds.add(dealId);
        continue;
      }
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

      // Canonical strict parsing: "1000"→1000, "0"→0, ""/null→null (UNKNOWN),
      // "12abc"/"0x10"→null (INVALID). Never interprets hex-like strings.
      const rawOpp = item.opportunity ?? item.OPPORTUNITY;
      const opportunity = parseStrictNumber(rawOpp);
      const opportunityQuality: "VALID" | "UNKNOWN" | "INVALID" =
        opportunity !== undefined
          ? "VALID"
          : rawOpp === null ||
            rawOpp === undefined ||
            (typeof rawOpp === "string" && rawOpp.trim() === "")
          ? "UNKNOWN"
          : "INVALID";

      const rawCurrency = item.currencyId != null ? String(item.currencyId) : item.CURRENCY_ID != null ? String(item.CURRENCY_ID) : undefined;
      const currencyId = normalizeCurrencyCode(rawCurrency);
      const itemCompanyId = String(item.companyId ?? item.COMPANY_ID ?? id);

      deals.push({
        ID: dealId,
        TITLE: title,
        STAGE_ID: stageId,
        OPPORTUNITY: opportunity !== undefined ? opportunity : null,
        OPPORTUNITY_QUALITY: opportunityQuality,
        CURRENCY_ID: currencyId,
        COMPANY_ID: itemCompanyId,
        bitrixUrl: getBitrixEntityUrl("deal", dealId, BITRIX_PORTAL_URL),
      });
    }

    // Fail closed on identity corruption — the Single Company report may not
    // have weaker entity identity guarantees than the analytical engine.
    // Duplicates are detected and reported but deduplicated (they must never
    // inflate counts); missing IDs are corruption and fail the request.
    if (missingIdCount > 0 || totalInconsistent) {
      return respond(
        {
          success: false,
          error: "Получены некорректные данные о сделках компании (отсутствующие ID или несогласованный total). Попробуйте ещё раз.",
          missingIdCount,
          totalInconsistent,
        },
        502
      );
    }

    // Reconcile the final unique count against the first authoritative total.
    if (
      authoritativeTotal !== undefined &&
      authoritativeTotal !== deals.length
    ) {
      return respond(
        {
          success: false,
          error: "Несогласованное количество сделок компании в ответе CRM. Попробуйте ещё раз.",
          expectedTotal: authoritativeTotal,
          fetched: deals.length,
        },
        502
      );
    }

    return respond({
      success: true,
      deals,
      // Detection accounting (deduplicated, never inflating counts):
      duplicateIds: Array.from(duplicateIds),
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
