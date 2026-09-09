import { NextRequest, NextResponse } from "next/server";
import { requireAuth, isAuthError } from "@/lib/auth-guard";
import { bitrixPost, BitrixItemError } from "@/lib/bitrix";
import { BITRIX_PORTAL_URL } from "@/lib/config.server";
import { isCompanyId, normalizeCompanyPreview } from "@/lib/company-preview";

export const dynamic = "force-dynamic";

function companyUrl(id: string): string | null {
  if (!isCompanyId(id)) return null;
  try {
    const portal = new URL(BITRIX_PORTAL_URL);
    if (portal.protocol !== "https:" || portal.username || portal.password ||
        portal.search || portal.hash || portal.pathname !== "/" ||
        portal.hostname === "your-portal.bitrix24.ru") return null;
    return new URL(`/crm/company/details/${id}/`, portal.origin).href;
  } catch {
    return null;
  }
}

export async function GET(_request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const auth = await requireAuth();
  if (isAuthError(auth)) return auth;
  const respond = (body: unknown, status = 200) => NextResponse.json(body, {
    status, headers: { "Cache-Control": "no-store" },
  });
  const { id } = await context.params;
  if (!isCompanyId(id)) return respond({ success: false, error: "Некорректный ID компании" }, 400);
  try {
    const data = await bitrixPost<{ result?: { item?: Record<string, unknown> | null } }>(
      "crm.item.get", { entityTypeId: 4, id: Number(id), useOriginalUfNames: "Y" }
    );
    const item = data.result?.item;
    if (item === null) return respond({ success: false, error: "Компания не найдена" }, 404);
    if (!item || Array.isArray(item) || String(item.id) !== id) throw new Error("Invalid company response");
    return respond({ success: true, company: normalizeCompanyPreview(item), bitrixUrl: companyUrl(id) });
  } catch (error) {
    const status = error instanceof BitrixItemError
      ? error.code === "NOT_FOUND" ? 404 : 403 : 502;
    const message = status === 404 ? "Компания не найдена" : status === 403
      ? "Нет доступа к компании" : "Не удалось загрузить компанию. Попробуйте ещё раз.";
    return respond({ success: false, error: message }, status);
  }
}
