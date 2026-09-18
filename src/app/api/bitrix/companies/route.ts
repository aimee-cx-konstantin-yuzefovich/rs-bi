import { NextRequest, NextResponse } from "next/server";
import { bitrixPost } from "@/lib/bitrix";
import { requireAuth, isAuthError } from "@/lib/auth-guard";

export const dynamic = "force-dynamic";

type CompanyRecord = Record<string, any>;

const BATCH_SIZE = 50;
const FALLBACK_GET_CONCURRENCY = 5;
const MAX_FALLBACK_IDS = 15;

function normalizeIds(ids: unknown): string[] {
  if (!Array.isArray(ids)) return [];
  return [...new Set(
    ids
      .map((id) => String(id).trim())
      .filter((id) => /^\d+$/.test(id) && id !== "0")
  )];
}

function normalizeSelect(select: unknown): string[] {
  const safe: string[] = ["ID", "TITLE", "ASSIGNED_BY_ID"];

  if (!Array.isArray(select)) return safe;

  for (const item of select) {
    if (typeof item !== "string") continue;
    if (!/^[a-zA-Z0-9_]+$/.test(item)) continue;
    safe.push(item);
  }

  return [...new Set(safe)];
}

function normalizeCompany(company: CompanyRecord, fallbackId: string): CompanyRecord {
  const id = String(company?.ID ?? fallbackId);
  const title = String(company?.TITLE ?? "").trim();

  return {
    ...company,
    ID: id,
    TITLE: title,
  };
}

async function fetchCompanyById(id: string, select: string[]): Promise<CompanyRecord | null> {
  try {
    const data = await bitrixPost<{ result?: CompanyRecord | null } | CompanyRecord>(
      "crm.company.get",
      { ID: id, SELECT: select }
    );

    if (!data || typeof data !== "object") return null;
    const result = "result" in data ? (data as { result?: CompanyRecord | null }).result : data;
    if (!result || typeof result !== "object" || Array.isArray(result)) return null;

    return normalizeCompany(result, id);
  } catch (error) {
    console.error(`[Companies API] crm.company.get failed for ID=${id}:`, error);
    return null;
  }
}

export async function POST(request: NextRequest) {
  const authResult = await requireAuth();
  if (isAuthError(authResult)) return authResult;

  try {
    const body = await request.json().catch(() => ({}));
    const ids = normalizeIds(body?.ids);
    const select = normalizeSelect(body?.select);

    if (ids.length === 0) {
      return NextResponse.json({ success: true, companies: {} });
    }

    const companiesMap: Record<string, CompanyRecord> = {};
    const resolvedIds = new Set<string>();

    for (const id of ids) {
      companiesMap[id] = { ID: id, TITLE: "" };
    }

    let failedBatches = 0;
    const totalBatches = Math.ceil(ids.length / BATCH_SIZE);

    // 1) Batch list lookup
    for (let i = 0; i < ids.length; i += BATCH_SIZE) {
      const batchIds = ids.slice(i, i + BATCH_SIZE);

      try {
        const data = await bitrixPost<{ result?: CompanyRecord[] }>(
          "crm.company.list",
          {
            // The "@ID" operator is a Bitrix-specific filter operator that matches multiple values (equivalent to SQL IN (...))
            // Note: Bitrix limits @ID arrays to 50-100 items per call. We chunk at BATCH_SIZE (50) to stay within limits.
            FILTER: { "@ID": batchIds },
            SELECT: select,
          }
        );

        if (Array.isArray(data.result)) {
          for (const company of data.result) {
            const rawId = String(company?.ID ?? "").trim();
            if (rawId) {
              const normalized = normalizeCompany(company, rawId);
              companiesMap[normalized.ID] = {
                ...companiesMap[normalized.ID],
                ...normalized,
              };
              resolvedIds.add(normalized.ID);
            }
          }
        }
      } catch (error) {
        console.error(`[Companies API] Failed to fetch batch`, { batchIds, error });
        failedBatches++;
      }
    }

    // 2) Fallback per-ID get for unresolved IDs (absent from batch list, capped to prevent rate-limit flooding)
    const unresolvedIds = ids.filter((id) => !resolvedIds.has(id));
    const fallbackIds = unresolvedIds.slice(0, MAX_FALLBACK_IDS);

    for (let i = 0; i < fallbackIds.length; i += FALLBACK_GET_CONCURRENCY) {
      const chunk = fallbackIds.slice(i, i + FALLBACK_GET_CONCURRENCY);

      const results = await Promise.allSettled(
        chunk.map((id) => fetchCompanyById(id, select))
      );

      for (let j = 0; j < results.length; j++) {
        const id = chunk[j];
        const res = results[j];

        if (res.status === "fulfilled" && res.value) {
          companiesMap[id] = {
            ...companiesMap[id],
            ...res.value,
          };
          resolvedIds.add(id);
        }
      }
    }

    // 3) Final normalization: never return undefined TITLE; resolved companies with empty TITLE use standard fallback "Без названия"
    for (const id of ids) {
      companiesMap[id] = normalizeCompany(companiesMap[id] || {}, id);
      if (resolvedIds.has(id) && !companiesMap[id].TITLE) {
        companiesMap[id].TITLE = "Без названия";
      }
    }

    const stillUnresolved = ids.filter((id) => !resolvedIds.has(id));
    const fetchedCompanyIds = ids.filter((id) => resolvedIds.has(id));
    const isPartial = stillUnresolved.length > 0;
    const isTotalFailure = failedBatches > 0 && failedBatches === totalBatches && fetchedCompanyIds.length === 0;

    if (isTotalFailure) {
      return NextResponse.json(
        {
          success: false,
          partial: true,
          error: "Failed to fetch companies from CRM.",
          companies: {},
          fetchedCompanyIds: [],
          unresolvedCompanyIds: ids,
        },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      partial: isPartial,
      warning: isPartial ? `Не удалось загрузить данные для ${stillUnresolved.length} компаний.` : undefined,
      companies: companiesMap,
      fetchedCompanyIds,
      unresolvedCompanyIds: stillUnresolved,
    });
  } catch (error) {
    console.error("[Companies API Error]", error);

    const message =
      error instanceof Error && error.message.includes("not configured")
        ? error.message
        : "Failed to fetch companies.";

    return NextResponse.json(
      {
        success: false,
        partial: true,
        error: message,
        companies: {},
        fetchedCompanyIds: [],
        unresolvedCompanyIds: [],
      },
      { status: 500 }
    );
  }
}