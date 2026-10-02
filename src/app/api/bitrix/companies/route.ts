import { NextRequest, NextResponse } from "next/server";
import { bitrixPost } from "@/lib/bitrix";
import { requireAuth, isAuthError } from "@/lib/auth-guard";

export const dynamic = "force-dynamic";

type CompanyRecord = Record<string, any>;

const BATCH_SIZE = 50;
const FALLBACK_GET_CONCURRENCY = 5;
// Bounded smaller-batch recovery for IDs missed by the primary batch list.
// Runs for ANY unresolved count (chunked sequentially) — a large unresolved
// set (e.g. 202 of 527) must never bypass recovery.
const RETRY_BATCH_SIZE = 15;
// Per-ID fallback cap: above this, per-ID gets are skipped entirely (IDs stay
// retryable) — never hundreds of crm.company.get calls.
const PER_ID_FALLBACK_LIMIT = 15;
const MAX_COMPANY_IDS = 500;
const MAX_SELECT_FIELDS = 100;

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
  const t0 = Date.now();
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
    const duration = Date.now() - t0;
    console.warn(`[Companies API] crm.company.get failed for ID=${id}`, {
      method: "crm.company.get",
      id,
      durationMs: duration,
      error: error instanceof Error ? error.message : String(error),
    });
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

    if (ids.length > MAX_COMPANY_IDS) {
      return NextResponse.json(
        {
          success: false,
          error: "Too many company IDs requested.",
        },
        { status: 400 }
      );
    }

    if (select.length > MAX_SELECT_FIELDS) {
      return NextResponse.json(
        {
          success: false,
          error: "Too many company fields requested.",
        },
        { status: 400 }
      );
    }

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

    // 1) Batch list lookup — ONE transport layer: bitrixPost owns bounded
    //    transient retries (429/503/timeout/network). This route performs
    //    data-level recovery only and never re-issues identical transport
    //    requests that the shared transport already retried.
    for (let i = 0; i < ids.length; i += BATCH_SIZE) {
      const batchIds = ids.slice(i, i + BATCH_SIZE);
      const batchIndex = Math.floor(i / BATCH_SIZE) + 1;
      let batchSucceeded = false;

      const attemptStartTime = Date.now();
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
            if (!rawId) continue;
            // Never accept IDs outside the requested set — Bitrix list may
            // drift; foreign records are logged and ignored.
            if (!ids.includes(rawId)) {
              console.warn(`[Companies API] Ignoring foreign company ID=${rawId} in batch ${batchIndex}`);
              continue;
            }
            const normalized = normalizeCompany(company, rawId);
            companiesMap[normalized.ID] = {
              ...companiesMap[normalized.ID],
              ...normalized,
            };
            resolvedIds.add(normalized.ID);
          }
        }
        batchSucceeded = true;
      } catch (error) {
        const duration = Date.now() - attemptStartTime;
        console.warn(`[Companies API] crm.company.list batch ${batchIndex}/${totalBatches} failed (transport retries exhausted by shared layer)`, {
          method: "crm.company.list",
          batchIndex,
          durationMs: duration,
          idCount: batchIds.length,
          retriesExhausted: true,
          error: error instanceof Error ? error.message : String(error),
        });
      }

      if (!batchSucceeded) {
        failedBatches++;
      }
    }

    // 2) Bounded smaller-batch recovery for unresolved IDs (before per-ID gets):
    //    first attempt on small "@ID" chunks often recovers IDs missed by the
    //    large primary batch list, with bounded request pressure. Runs for ANY
    //    unresolved count — the recovery is never disabled by bulk size.
    const unresolvedAfterBatches = () => ids.filter((id) => !resolvedIds.has(id));
    let unresolvedIds = unresolvedAfterBatches();
    const unresolvedAfterPrimary = unresolvedIds.length;

    if (unresolvedIds.length > 0) {
      for (let i = 0; i < unresolvedIds.length; i += RETRY_BATCH_SIZE) {
        const chunk = unresolvedIds.slice(i, i + RETRY_BATCH_SIZE);
        try {
          const data = await bitrixPost<{ result?: CompanyRecord[] }>(
            "crm.company.list",
            { FILTER: { "@ID": chunk }, SELECT: select }
          );
          if (Array.isArray(data.result)) {
            for (const company of data.result) {
              const rawId = String(company?.ID ?? "").trim();
              if (!rawId) continue;
              if (!ids.includes(rawId)) {
                console.warn(`[Companies API] Ignoring foreign company ID=${rawId} in recovery chunk`);
                continue;
              }
              companiesMap[rawId] = { ...companiesMap[rawId], ...normalizeCompany(company, rawId) };
              resolvedIds.add(rawId);
            }
          }
        } catch (error) {
          console.warn(`[Companies API] Recovery chunk failed (transport retries exhausted by shared layer)`, {
            idCount: chunk.length,
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }
      unresolvedIds = unresolvedAfterBatches();
    }

    // 3) Per-ID fallback only sparingly: capped, concurrency-conservative.
    //    Above the cap, unresolved IDs stay unresolved (retryable) instead of
    //    issuing hundreds of crm.company.get calls.
    if (unresolvedIds.length > 0 && unresolvedIds.length <= PER_ID_FALLBACK_LIMIT) {
      for (let i = 0; i < unresolvedIds.length; i += FALLBACK_GET_CONCURRENCY) {
        const chunk = unresolvedIds.slice(i, i + FALLBACK_GET_CONCURRENCY);

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
    } else if (unresolvedIds.length > PER_ID_FALLBACK_LIMIT) {
      console.warn(
        `[Companies API] Per-ID fallback skipped: ${unresolvedIds.length} unresolved IDs exceed cap ${PER_ID_FALLBACK_LIMIT} (IDs remain retryable)`
      );
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
    console.info(
      `[Companies API] Enrichment summary: requested=${ids.length} resolved=${fetchedCompanyIds.length} unresolved=${stillUnresolved.length} (after-primary=${unresolvedAfterPrimary}, recovery=${failedBatches === 0 && unresolvedAfterPrimary > 0 ? "ran" : failedBatches > 0 ? "partial" : "none"})`
    );

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
      warning: isPartial ? `Не удалось загрузить данные для ${stillUnresolved.length} из ${ids.length} компаний.` : undefined,
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