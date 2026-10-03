// src/lib/bitrix-diagnostics.ts
// ─────────────────────────────────────────────────────────────────────
// Smart Process 1032 runtime transport diagnostics (READ-ONLY).
//
// ONE fixed, sequential probe routine that isolates the first failing
// transport layer for the Smart Process integration in the REAL deployed
// runtime, using the SAME production credentials/configuration:
//
//   Probe 1  crm.item.fields   — entity metadata access
//   Probe 2  crm.item.list     — minimal read (select: ["id"])
//   Probe 3  crm.item.list     — the EXACT production SMART_PROCESS_ITEM_SELECT
//   Probe 4  crm.item.list     — second page via the real pagination cursor
//
// Hard rules:
// - read-only methods only (crm.item.fields / crm.item.list);
// - the production select is IMPORTED (SMART_PROCESS_ITEM_SELECT), never
//   retyped or duplicated here;
// - entityTypeId/categoryId come from canonical contract constants;
// - responses contain ONLY probe statuses, totals, booleans, and safe
//   failure metadata ({ method, httpStatus?, bitrixCode? }) — never item
//   payloads, IDs, titles, field values, error_description, URLs, or any
//   credential material;
// - a failing probe short-circuits dependent later probes with explicit
//   SKIPPED reasons; the first failing layer stays obvious;
// - retry semantics are the production ones (shared bounded strategy in
//   bitrixPost) — the diagnostic measures the real runtime behavior;
// - this is a fixed diagnostic routine, NOT a generic Bitrix proxy: no
//   caller-supplied methods or parameters exist.
// ─────────────────────────────────────────────────────────────────────

import { bitrixPost, readBitrixFailureMeta, type BitrixSafeErrorMeta } from "@/lib/bitrix";
import {
  SMART_PROCESS_ENTITY_TYPE_ID,
  SMART_PROCESS_CATEGORY_ID,
  assertSmartProcessContractReady,
} from "@/lib/samples/smart-process-contract";
import { SMART_PROCESS_ITEM_SELECT } from "@/lib/samples/bitrix-fetch";

/** Status of one probe (safe output contract — nothing else is exposed). */
export type DiagnosticProbe =
  | { status: "PASS"; total?: number | null; hasNext?: boolean }
  | ({ status: "FAIL" } & BitrixSafeErrorMeta)
  | { status: "SKIPPED"; reason: string };

export type SmartProcessDiagnosis =
  | "SMART_PROCESS_METADATA_ACCESS_FAILED"
  | "SMART_PROCESS_READ_ACCESS_FAILED"
  | "PRODUCTION_SELECT_FAILED"
  | "PAGINATION_FAILED"
  | "SMART_PROCESS_TRANSPORT_OK"
  | "DIAGNOSTIC_INCOMPLETE";

export interface SmartProcessDiagnosticsReport {
  success: boolean;
  entityTypeId: number;
  categoryId: number;
  probes: {
    fields: DiagnosticProbe;
    minimalList: DiagnosticProbe;
    productionSelect: DiagnosticProbe;
    secondPage: DiagnosticProbe;
  };
  diagnosis: SmartProcessDiagnosis;
}

/** Minimal Bitrix list page shape used by the probes (no item content read). */
interface BitrixListPage {
  result?: unknown;
  total?: unknown;
  next?: unknown;
}

/** Safe failure envelope from any transport error (credential-free). */
function failProbe(method: string, error: unknown): { status: "FAIL" } & BitrixSafeErrorMeta {
  const meta = readBitrixFailureMeta(error);
  return {
    status: "FAIL",
    method: meta?.method ?? method,
    ...(meta?.httpStatus !== undefined ? { httpStatus: meta.httpStatus } : {}),
    ...(meta?.bitrixCode !== undefined ? { bitrixCode: meta.bitrixCode } : {}),
  };
}

/** Truthful total only when Bitrix reported a finite non-negative number. */
function safeTotal(page: BitrixListPage): number | null {
  if (page.total === undefined || page.total === null) return null;
  const parsed = Number(page.total);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

/** Bitrix omits `next` when no further page exists. */
function hasNextPage(page: BitrixListPage): boolean {
  return page.next !== undefined && page.next !== null;
}

/**
 * Runs the four sequential probes. Exported for focused testing; the route
 * handler stays thin. Throws only on unexpected internal setup failure
 * (before the probe matrix can be reported) — Bitrix probe failures are
 * reported inside the matrix, never thrown.
 */
export async function runSmartProcessDiagnostics(): Promise<SmartProcessDiagnosticsReport> {
  const probes: SmartProcessDiagnosticsReport["probes"] = {
    fields: { status: "SKIPPED", reason: "NOT_RUN" },
    minimalList: { status: "SKIPPED", reason: "NOT_RUN" },
    productionSelect: { status: "SKIPPED", reason: "NOT_RUN" },
    secondPage: { status: "SKIPPED", reason: "NOT_RUN" },
  };

  // Production fail-closed contract gate: the exact gate every production
  // consumer passes before reaching the transport.
  assertSmartProcessContractReady();

  // ─── Probe 1: Universal CRM entity metadata ───
  try {
    await bitrixPost("crm.item.fields", {
      entityTypeId: SMART_PROCESS_ENTITY_TYPE_ID,
      useOriginalUfNames: "Y",
    });
    probes.fields = { status: "PASS" };
  } catch (error) {
    probes.fields = failProbe("crm.item.fields", error);
  }

  // ─── Probe 2: minimal item read (category 15) ───
  if (probes.fields.status === "PASS") {
    try {
      const page = await bitrixPost<BitrixListPage>("crm.item.list", {
        entityTypeId: SMART_PROCESS_ENTITY_TYPE_ID,
        useOriginalUfNames: "Y",
        select: ["id"],
        filter: { categoryId: SMART_PROCESS_CATEGORY_ID },
        order: { id: "ASC" },
        start: 0,
      });
      probes.minimalList = {
        status: "PASS",
        total: safeTotal(page),
        hasNext: hasNextPage(page),
      };
    } catch (error) {
      probes.minimalList = failProbe("crm.item.list", error);
    }
  } else {
    probes.minimalList = { status: "SKIPPED", reason: "FIELDS_PROBE_FAILED" };
  }

  // ─── Probe 3: EXACT production select (imported, never retyped) ───
  if (probes.minimalList.status === "PASS") {
    try {
      const page = await bitrixPost<BitrixListPage>("crm.item.list", {
        entityTypeId: SMART_PROCESS_ENTITY_TYPE_ID,
        useOriginalUfNames: "Y",
        select: SMART_PROCESS_ITEM_SELECT,
        filter: { categoryId: SMART_PROCESS_CATEGORY_ID },
        order: { id: "ASC" },
        start: 0,
      });
      probes.productionSelect = {
        status: "PASS",
        total: safeTotal(page),
        hasNext: hasNextPage(page),
      };

      // ─── Probe 4: second page via the real cursor (only when reported) ───
      if (probes.productionSelect.status === "PASS") {
        if (!probes.productionSelect.hasNext) {
          probes.secondPage = { status: "SKIPPED", reason: "NO_NEXT_PAGE" };
        } else {
          const nextRaw = (page as BitrixListPage).next;
          const next = Number(nextRaw);
          try {
            await bitrixPost<BitrixListPage>("crm.item.list", {
              entityTypeId: SMART_PROCESS_ENTITY_TYPE_ID,
              useOriginalUfNames: "Y",
              select: SMART_PROCESS_ITEM_SELECT,
              filter: { categoryId: SMART_PROCESS_CATEGORY_ID },
              order: { id: "ASC" },
              start: next,
            });
            probes.secondPage = { status: "PASS" };
          } catch (error) {
            probes.secondPage = failProbe("crm.item.list", error);
          }
        }
      }
    } catch (error) {
      probes.productionSelect = failProbe("crm.item.list", error);
      probes.secondPage = { status: "SKIPPED", reason: "PRODUCTION_SELECT_FAILED" };
    }
  } else {
    probes.productionSelect = { status: "SKIPPED", reason: "MINIMAL_LIST_FAILED" };
    probes.secondPage = { status: "SKIPPED", reason: "MINIMAL_LIST_FAILED" };
  }

  return {
    success: true,
    entityTypeId: SMART_PROCESS_ENTITY_TYPE_ID,
    categoryId: SMART_PROCESS_CATEGORY_ID,
    probes,
    diagnosis: diagnose(probes),
  };
}

/**
 ONE small server-side interpretation derived ONLY from probe states —
 measured facts, never speculative prose.
 */
export function diagnose(
  probes: SmartProcessDiagnosticsReport["probes"]
): SmartProcessDiagnosis {
  const { fields, minimalList, productionSelect, secondPage } = probes;

  if (fields.status === "FAIL") return "SMART_PROCESS_METADATA_ACCESS_FAILED";
  if (fields.status !== "PASS") return "DIAGNOSTIC_INCOMPLETE";

  if (minimalList.status === "FAIL") return "SMART_PROCESS_READ_ACCESS_FAILED";
  if (minimalList.status !== "PASS") return "DIAGNOSTIC_INCOMPLETE";

  if (productionSelect.status === "FAIL") return "PRODUCTION_SELECT_FAILED";
  if (productionSelect.status !== "PASS") return "DIAGNOSTIC_INCOMPLETE";

  if (secondPage.status === "FAIL") return "PAGINATION_FAILED";
  // PASS or SKIPPED (NO_NEXT_PAGE) → transport fully verified for the
  // applicable layers. Any other secondPage state is a routine defect.
  if (secondPage.status === "PASS") return "SMART_PROCESS_TRANSPORT_OK";
  if (
    secondPage.status === "SKIPPED" &&
    secondPage.reason === "NO_NEXT_PAGE"
  ) {
    return "SMART_PROCESS_TRANSPORT_OK";
  }
  return "DIAGNOSTIC_INCOMPLETE";
}
