"use client";

// src/components/dashboard/company-preview.tsx
// ─────────────────────────────────────────────────────────────────────
// THE ONE canonical company drawer for the whole application.
//
// Any UI action whose semantic meaning is "open this company" renders THIS
// component (Companies browser, Deals table / Deal Preview, Samples /
// Sample Preview, Commercial Funnel drill-downs). Callers may only provide
// navigation/focus callbacks (onClose / onOpenDealPreview /
// onRestoreFocus) — never different field sets or business content:
// for the SAME company ID the sections, field order and business content
// are identical regardless of the entry point.
//
// Business fields come exclusively from buildCompanyPreviewModel (the
// strict approved Bitrix Company-card whitelist, consumed identically by
// the Company Excel export). ALL approved fields render, even when empty
// (truthful «—» placeholder) — no null-field dropping, no arbitrary
// UF_CRM_* iteration.
//
// Smart Process data path (exactly ONE authoritative load):
// POST /api/bitrix/samples { companyId } returns the canonical
// company-scoped SampleSummary which already embeds the physical Smart
// Process item views (SmartProcessItemViewLite), the active/terminal
// process counts and related deals. No second bulk Smart Process fetch is
// mounted here; the shared bulk cache remains for other consumers.
// ─────────────────────────────────────────────────────────────────────

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription, SheetFooter } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { AlertTriangle, Download, ExternalLink, Loader2, FlaskConical, ArrowRight, Link2 } from "lucide-react";
import { useDashboardStore } from "@/store/dashboard-store";
import {
  buildCompanyPreviewModel,
  partitionCompanyPreviewFields,
  buildCompanyLookupWarnings,
  EMPTY_FIELD_PLACEHOLDER,
  LOOKUP_LOADING_PLACEHOLDER,
  type CompanyPreviewMetadataState,
  type CompanyPreviewModel,
} from "@/lib/company-preview";
import { exportCompanyToExcel } from "@/lib/export-utils";
import { parseStrictNumber } from "@/lib/scalar-safety";
import { NORMALIZED_RESULT_LABELS } from "@/lib/samples/constants";
import type { SampleSummary, SmartProcessItemViewLite } from "@/lib/samples/types";
import { getDealStageDisplayLabel } from "@/lib/crm-constants";
import { SmartProcessItemCard } from "@/components/dashboard/samples/smart-process-item-card";
import {
  PreviewSectionHeading,
  PreviewFieldLabel,
  PreviewFieldValue,
  PREVIEW_EMPTY_VALUE,
} from "@/components/dashboard/preview-primitives";

function formatPreviewValue(val: unknown, isBoolean?: boolean): string {
  if (val === null || val === undefined || val === "") return EMPTY_FIELD_PLACEHOLDER;
  if (isBoolean) {
    if (val === true || String(val).toLowerCase() === "true" || val === "Y" || val === "1") return "Да";
    if (val === false || String(val).toLowerCase() === "false" || val === "N" || val === "0") return "Нет";
  } else {
    if (val === false || String(val).trim().toLowerCase() === "false" || String(val).trim().toLowerCase() === "null" || String(val).trim().toLowerCase() === "undefined") {
      return EMPTY_FIELD_PLACEHOLDER;
    }
  }
  if (val === true) return "Да";
  if (typeof val === "object") {
    if (Array.isArray(val)) return val.map((v) => formatPreviewValue(v, isBoolean)).join(", ");
    return JSON.stringify(val);
  }
  const str = String(val).trim();
  if (!str || str === "—" || str === "–" || str === "null" || str === "undefined") return EMPTY_FIELD_PLACEHOLDER;
  const upper = str.toUpperCase();
  if (upper === "TRUE") return "Да";
  if (upper === "UNKNOWN") return "Не классифицировано";
  if (upper === "WON" || upper.endsWith(":WON")) return "Успешные";
  if (upper === "LOSE" || upper === "LOST" || upper.endsWith(":LOSE") || upper.endsWith(":LOST")) return "Проиграны";
  return str;
}

/**
 * Every async slice below is EXPLICITLY scoped to its Company ID: a
 * snapshot is stamped with the `companyId` it belongs to and can never
 * render under a different `id`, even for one intermediate render when the
 * `id` prop changes while the drawer stays mounted.
 */
type PreviewState =
  | { status: "loading"; companyId: string }
  | { status: "error"; companyId: string; message: string; retry: boolean }
  | { status: "success"; companyId: string; company: Record<string, unknown>; bitrixUrl: string | null };

type DealsState =
  | { status: "loading"; companyId: string; deals: Array<Record<string, unknown>> } // deals: cached seed shown immediately
  | { status: "success"; companyId: string; deals: Array<Record<string, unknown>>; source: "server" | "cached" }
  | { status: "error"; companyId: string; message: string; deals: Array<Record<string, unknown>> }; // deals: cached rows kept

/**
 * Company-scoped canonical Samples/Smart Process load state.
 * Exactly ONE data path: POST /api/bitrix/samples { companyId }.
 *
 * Stale-refresh invariant: a failure after a prior successful load for the
 * SAME company preserves that snapshot as `refresh_failed` — through ANY
 * number of repeated failed retries. A second failure must never convert
 * `refresh_failed` into a hard `failed` state and discard previously valid
 * data. Snapshots are never carried across different companies.
 */
type SamplesState =
  | { status: "loading"; companyId: string }
  | { status: "failed"; companyId: string; error: string }
  | { status: "ready"; companyId: string; summary: SampleSummary | null }
  | { status: "refresh_failed"; companyId: string; summary: SampleSummary | null; error: string };

export interface CompanyPreviewProps {
  id: string;
  onClose: () => void;
  /** Focus restoration after close (caller-owned navigation concern). */
  onRestoreFocus?: () => void;
  /** Navigate to a related deal preview (caller-owned navigation concern). */
  onOpenDealPreview?: (dealId: string) => void;
}

export function CompanyPreview({
  id,
  onClose,
  onRestoreFocus,
  onOpenDealPreview,
}: CompanyPreviewProps) {
  const [state, setState] = useState<PreviewState>({ status: "loading", companyId: id });
  const [dealsState, setDealsState] = useState<DealsState>({ status: "loading", companyId: id, deals: [] });
  const [samplesState, setSamplesState] = useState<SamplesState>({ status: "loading", companyId: id });
  const [samplesAttempt, setSamplesAttempt] = useState(0);
  const [attempt, setAttempt] = useState(0);
  const [isExporting, setIsExporting] = useState(false);

  // Request-sequence guards: a monotonically increasing sequence per async
  // slice; responses belonging to an older company/render are ignored even
  // if their AbortController cleanup raced (belt-and-braces alongside the
  // abort + companyId stamping).
  const companySeq = useRef(0);
  const dealsSeq = useRef(0);
  const samplesSeq = useRef(0);

  // Auth principal: lookup bootstrap is one-shot per mounted drawer /
  // principal. A principal change re-arms exactly one automatic attempt for
  // the new principal; no timers, no automatic infinite retry.
  // Bootstrap is AUTH-GATED: nothing is attempted while the session is
  // loading or unauthenticated — only `status === "authenticated"` may
  // bootstrap (the `__anonymous__` key stays a last-resort fallback for an
  // authenticated session that exposes no identifier).
  const { data: session, status: sessionStatus } = useSession();
  const principalKey =
    sessionStatus === "authenticated"
      ? session?.user?.id ?? session?.user?.email ?? session?.user?.name ?? "__anonymous__"
      : null;

  const {
    userNames, fields, usersCoverage, fieldsCoverage, fieldsError, isDemoMode, allDeals, dealsCoverage,
    userNamesLoading, fieldsLoading,
    fetchFields, fetchUserNames,
  } = useDashboardStore() as {
    userNames: Record<string, string> | null;
    fields: Array<{ id: string; title?: string; type?: string; listValues?: Array<{ ID: string; VALUE: string }> }> | null;
    usersCoverage: import("@/lib/dataset-coverage").DatasetCoverage | null;
    fieldsCoverage: import("@/lib/dataset-coverage").DatasetCoverage | null;
    fieldsError: string | null;
    isDemoMode: boolean;
    allDeals: Array<Record<string, unknown>>;
    dealsCoverage: import("@/lib/dataset-coverage").DatasetCoverage | null;
    userNamesLoading: boolean;
    fieldsLoading: boolean;
    fetchFields: () => Promise<void>;
    fetchUserNames: () => Promise<void>;
  };

  // ─── Caller-independent lookup bootstrap — ONE-SHOT per principal (§2) ───
  // The canonical drawer must NOT depend on whether another page happened
  // to warm the shared lookups first. Opening a company from /samples, the
  // Commercial Funnel, or a cold store bootstraps the SAME canonical store
  // metadata paths (fetchFields / fetchUserNames) the main page uses — no
  // duplicate metadata parser, no DEMO fallback.
  //
  // Consume-first attempt contract (exactness invariants):
  // - missing fields → fetchFields() attempted ONCE per principal; missing
  //   users → fetchUserNames() attempted ONCE per principal;
  // - the attempt is marked CONSUMED (attemptedForPrincipal = principalKey)
  //   BEFORE the fetch is invoked — never cleared afterwards. A failed
  //   attempt therefore STOPS automatic retry: one user click can never
  //   produce two requests;
  // - an in-flight shared request encountered by the drawer COUNTS AS its
  //   bootstrap opportunity (consumed): when that shared request fails, no
  //   automatic second request may follow from this drawer;
  // - a valid shared lookup already present (e.g. warmed by the main page)
  //   means NO bootstrap at all — switching Company ID never re-bootstraps;
  // - DEMO dictionaries are never a warm production lookup: isDemoMode does
  //   not suppress the production fields bootstrap and never triggers a
  //   user-directory fetch (the store returns demo persons in demo mode);
  //   production bootstrap follows the demo→production transition;
  // - AUTH GATE: no attempt at all while the session is loading or
  //   unauthenticated (principalKey is null);
  // - principal change → fresh one-shot attempt for the new principal.
  const fieldsBootstrapAttemptedRef = useRef<string | null>(null);
  const usersBootstrapAttemptedRef = useRef<string | null>(null);

  useEffect(() => {
    // Auth gate: never bootstrap while loading/unauthenticated.
    if (!principalKey) return;
    // Already attempted for this principal → never automatically again.
    if (fieldsBootstrapAttemptedRef.current === principalKey) return;
    // Valid shared production lookup already present → nothing to bootstrap.
    // (DEMO_FIELDS never count: demo mode proceeds to the real fetch below.)
    if (!isDemoMode && fields && fields.length > 0) {
      fieldsBootstrapAttemptedRef.current = principalKey;
      return;
    }
    // In-flight shared request → it IS this drawer's bootstrap opportunity.
    // Consume the attempt: when that request fails, no automatic second
    // request may follow from here.
    if (fieldsLoading) {
      fieldsBootstrapAttemptedRef.current = principalKey;
      return;
    }
    fieldsBootstrapAttemptedRef.current = principalKey;
    void fetchFields();
  }, [principalKey, isDemoMode, fields, fieldsLoading, fetchFields]);

  useEffect(() => {
    // Auth gate: never bootstrap while loading/unauthenticated.
    if (!principalKey) return;
    // Demo mode: NEVER call fetchUserNames — the store intentionally returns
    // demo responsible persons in demo mode. Wait for the production
    // transition (fetchFields/fetchDeals clears demo provenance); the
    // attempt stays unconsumed, so production bootstrap fires once after it.
    if (isDemoMode) return;
    // Already attempted for this principal → never automatically again.
    if (usersBootstrapAttemptedRef.current === principalKey) return;
    // Valid shared production directory already present → nothing to bootstrap.
    if (userNames && Object.keys(userNames).length > 0) {
      usersBootstrapAttemptedRef.current = principalKey;
      return;
    }
    // In-flight shared request → it IS this drawer's bootstrap opportunity
    // (consumed; its failure cannot trigger an automatic second request).
    if (userNamesLoading) {
      usersBootstrapAttemptedRef.current = principalKey;
      return;
    }
    usersBootstrapAttemptedRef.current = principalKey;
    void fetchUserNames();
  }, [principalKey, isDemoMode, userNames, userNamesLoading, fetchUserNames]);

  // Explicit user retry: mark the new attempt CONSUMED FIRST (never null),
  // then invoke the fetch. ONE click = EXACTLY ONE real request; a failed
  // retry must not trigger an automatic third request (the consumed mark
  // stops the bootstrap effect). Repeated clicks each intentionally create
  // one request. An already-running shared lookup is not stacked.
  const retryFieldsLookup = () => {
    if (!principalKey || fieldsLoading) return;
    fieldsBootstrapAttemptedRef.current = principalKey;
    void fetchFields();
  };
  const retryUsersLookup = () => {
    if (!principalKey || userNamesLoading) return;
    usersBootstrapAttemptedRef.current = principalKey;
    void fetchUserNames();
  };

  // ─── INDEPENDENT lookup source states (never collapsed) ───
  // Field dictionaries and the user directory are separate provenance
  // sources. NO combined `fieldsUsable || usersUsable` rule exists: field
  // success can never mark the user directory ready, and user success can
  // never mark field metadata ready. Derivation is driven by real store
  // provenance (coverage / error / demo-mode), never by array length alone.
  const fieldMetadataState: CompanyPreviewMetadataState = useMemo(() => {
    if (fieldsLoading) return "loading";
    // DEMO dictionaries are never authoritative metadata for a real Bitrix
    // Company card — demo provenance is a truthful failure, not ready.
    if (isDemoMode) return "failed";
    if (fieldsError) return "failed";
    const hasFields = Array.isArray(fields) && fields.length > 0;
    if (!hasFields) return "failed";
    if (fieldsCoverage?.status === "COMPLETE") return "ready";
    if (
      fieldsCoverage?.status === "PARTIAL" ||
      fieldsCoverage?.status === "CAPPED"
    ) {
      return "partial";
    }
    // Fields present without trustworthy provenance (e.g. restored from
    // localStorage): usable labels may resolve, but completeness is
    // unverifiable → disclosed as partial, never silently ready.
    return "partial";
  }, [fields, fieldsLoading, fieldsError, fieldsCoverage, isDemoMode]);

  const userDirectoryState: CompanyPreviewMetadataState = useMemo(() => {
    if (userNamesLoading) return "loading";
    // Demo user names are not a production directory.
    if (isDemoMode) return "failed";
    const hasUsers = Boolean(userNames && Object.keys(userNames).length > 0);
    if (!hasUsers) return "failed";
    if (usersCoverage?.status === "COMPLETE") return "ready";
    if (
      usersCoverage?.status === "PARTIAL" ||
      usersCoverage?.status === "CAPPED"
    ) {
      return "partial";
    }
    // Names present without coverage provenance: resolvable names may
    // display, but directory completeness is unverifiable → partial.
    return "partial";
  }, [userNames, userNamesLoading, usersCoverage, isDemoMode]);

  /** Cache-first related deals (complete-store coverage only). */
  const seedDealsFromCache = useMemo(() => {
    return () => {
      if (dealsCoverage?.status !== "COMPLETE") return [];
      if (!allDeals || allDeals.length === 0) return [];
      const idNum = Number(id);
      if (!Number.isSafeInteger(idNum) || idNum <= 0) return [];
      const seen = new Set<string>();
      const cached: Array<Record<string, unknown>> = [];
      for (const deal of allDeals) {
        const companyId = String(deal.COMPANY_ID ?? "").trim();
        if (companyId !== id) continue;
        const dealId = String(deal.ID ?? deal.id ?? "").trim();
        if (!dealId || seen.has(dealId)) continue;
        seen.add(dealId);
        cached.push(deal);
      }
      return cached;
    };
  }, [dealsCoverage, allDeals, id]);

  // ONE canonical current-card model (buildCompanyPreviewModel) drives the
  // card. Selected table columns and callers can never influence contents.
  // Sections come from the ONE canonical partition helper (the same one the
  // Company Excel export uses) — no hard-coded UF tokens here. The model is
  // built ONLY from the snapshot whose companyId matches the current id:
  // Company A's data can never render under Company B.
  const scopedCompany =
    state.status === "success" && state.companyId === id ? state.company : null;

  const resolvedModel: CompanyPreviewModel | null = useMemo(
    () =>
      scopedCompany
        ? buildCompanyPreviewModel(scopedCompany, {
            // DEMO field dictionaries are never authoritative metadata for a
            // real Bitrix Company card: in demo mode no dictionary is handed
            // to the model, so a real card can never resolve enum/status
            // values against DEMO labels and present them as authoritative
            // (the failed state is disclosed; unclassified label applies).
            fields: (isDemoMode ? [] : fields ?? []) as any,
            userNames: userNames ?? {},
            usersCoverage,
            // ONLY the field-metadata state controls enum/status resolution;
            // the user directory is independent (coverage-aware responsible
            // resolution inside the model).
            metadataState: fieldMetadataState,
          })
        : null,
    [scopedCompany, fields, userNames, usersCoverage, fieldMetadataState, isDemoMode]
  );

  const { business: businessFields, marker: markerField, system: systemFields } = useMemo(
    () =>
      resolvedModel
        ? partitionCompanyPreviewFields(resolvedModel)
        : { business: [], marker: null, system: [] },
    [resolvedModel]
  );

  const stageField = fields?.find((f) => f.id === "STAGE_ID");
  const resolveStage = (rawStage: unknown): string | null => {
    if (rawStage === undefined || rawStage === null || rawStage === "") return null;
    const str = String(rawStage);
    return stageField?.listValues?.find((lv) => lv.ID === str)?.VALUE || getDealStageDisplayLabel(str);
  };

  /** Readable deal title map for Smart Process cycle rows (client-resolved; no extra fetch). */
  const dealTitleById = useMemo(() => {
    const map = new Map<string, string>();
    if (Array.isArray(allDeals)) {
      for (const d of allDeals as Array<Record<string, unknown>>) {
        const dealId = String(d.ID ?? d.id ?? "").trim();
        const title = String(d.TITLE ?? "").trim();
        if (dealId && title) map.set(dealId, title);
      }
    }
    const sameCompanySamples =
      (samplesState.status === "ready" || samplesState.status === "refresh_failed") &&
      samplesState.companyId === id;
    if (sameCompanySamples) {
      const summary = samplesState.summary;
      if (summary && Array.isArray(summary.relatedDeals)) {
        for (const rd of summary.relatedDeals) {
          if (rd.title && rd.title !== "Без названия" && !map.has(rd.id)) map.set(rd.id, rd.title);
        }
      }
    }
    return map;
  }, [allDeals, samplesState, id]);

  // Scope-aware slices: SP cycles and the exportable summary exist ONLY for
  // the snapshot whose companyId matches the current id.
  const sameCompanySamples =
    (samplesState.status === "ready" || samplesState.status === "refresh_failed") &&
    samplesState.companyId === id;

  const spItems: SmartProcessItemViewLite[] = sameCompanySamples
    ? samplesState.summary?.smartProcessItems ?? []
    : [];

  const handleExport = async () => {
    if (state.status !== "success" || state.companyId !== id || !resolvedModel) return;
    // Full report requires company card + related deals + Samples/SP data to
    // have succeeded — a loading/error state must never silently map to an
    // empty-but-complete-looking report (data-trust invariant B). Every
    // snapshot must belong to the CURRENT company: no cross-company data
    // can ever enter the workbook.
    if (dealsState.status !== "success" || dealsState.companyId !== id) return;
    if (!sameCompanySamples) return;
    // Required lookups still loading → no export (loading placeholders are
    // never serialized as final business data).
    if (lookupLoading) return;
    try {
      setIsExporting(true);
      const company = state.company;
      const companyTitle = String(company.TITLE || "").trim() || "Без названия";
      // UI and Excel consume the SAME resolved model (one source of truth).
      const model = resolvedModel;
      const companyFields = model.fields.map((f) => ({ id: f.id, label: f.label, value: f.value, type: f.type }));
      const deals = dealsState.deals.map((d) => {
        const rawOpp = d.OPPORTUNITY ?? d.opportunity;
        // Canonical strict parsing: "12abc"/"0x10" never become numbers.
        const opp = parseStrictNumber(rawOpp);
        const rawCurrency = d.CURRENCY_ID ?? d.currencyId;
        const currency =
          rawCurrency !== null &&
          rawCurrency !== undefined &&
          String(rawCurrency).trim() !== ""
            ? String(rawCurrency).trim()
            : undefined;
        return {
          id: String(d.ID || d.id || ""),
          title: String(d.TITLE || d.title || "").trim() || "Без названия",
          stage: resolveStage(d.STAGE_ID ?? d.stageId),
          opportunity: opp !== undefined ? opp : null,
          currency,
        };
      });

      const summary = sameCompanySamples ? samplesState.summary : null;

      await exportCompanyToExcel({
        companyTitle,
        companyId: id,
        companyFields,
        deals,
        // The full model rides along so the Excel builder renders the exact
        // same resolved fields (dates/comments/markers) as the UI.
        companyModel: model,
        testingMarkerField: markerField
          ? { label: markerField.label, value: markerField.value, rawValue: markerField.rawValue }
          : null,
        smartProcess: {
          activeCount: summary
            ? (summary.smartProcessItems ?? []).filter((v) => v.isActive).length
            : 0,
          completedCount: summary
            ? (summary.smartProcessItems ?? []).filter((v) => v.isTerminal).length
            : 0,
          items: summary?.smartProcessItems ?? [],
          stale: samplesState.status === "refresh_failed" && samplesState.companyId === id,
        },
        dealTitleById,
        userNames: userNames ?? {},
        usersCoverage,
        // Same resolved lookup state the UI discloses: partial/failed field
        // or user lookups stamp a visible data-quality disclosure into the
        // workbook near the report header (UI/Excel agreement invariant).
        lookupWarnings,
      });
    } catch (err) {
      console.error("Failed to export company to Excel", err);
    } finally {
      setIsExporting(false);
    }
  };

  useEffect(() => {
    const controller = new AbortController();
    const seq = ++companySeq.current;
    setState({ status: "loading", companyId: id });
    // Cache-first: re-seed from the store so cached deals render during load.
    setDealsState({ status: "loading", companyId: id, deals: seedDealsFromCache() });

    async function load() {
      try {
        const response = await fetch(`/api/bitrix/companies/${encodeURIComponent(id)}`, {
          signal: controller.signal, cache: "no-store",
        });
        if (controller.signal.aborted || seq !== companySeq.current) return;
        if (!response.ok) {
          setState({ companyId: id, status: "error", retry: ![401, 403, 404].includes(response.status),
            message: response.status === 404 ? "Компания не найдена" : response.status === 403
              ? "Нет доступа к компании" : response.status === 401 ? "Требуется авторизация"
                : "Не удалось загрузить компанию. Попробуйте ещё раз." });
          return;
        }
        const data = await response.json();
        if (!data.success || !data.company || String(data.company.ID) !== id) throw new Error("Invalid preview");
        if (!controller.signal.aborted && seq === companySeq.current) {
          setState({ status: "success", companyId: id, company: data.company, bitrixUrl: data.bitrixUrl });
        }
      } catch {
        if (!controller.signal.aborted && seq === companySeq.current) {
          setState({ companyId: id, status: "error", retry: true,
            message: "Не удалось загрузить компанию. Попробуйте ещё раз." });
        }
      }
    }

    async function loadDeals() {
      const cachedSeed = seedDealsFromCache();
      const dealSeq = ++dealsSeq.current;
      try {
        const response = await fetch(`/api/bitrix/companies/${encodeURIComponent(id)}/deals`, {
          signal: controller.signal,
          cache: "no-store",
        });
        if (controller.signal.aborted || dealSeq !== dealsSeq.current) return;
        if (!response.ok) {
          const errData = await response.json().catch(() => null);
          const message =
            errData?.error ||
            (response.status === 404
              ? "Компания не найдена"
              : response.status === 403
              ? "Нет доступа к сделкам компании"
              : "Связанные сделки временно недоступны.");
          if (cachedSeed.length > 0) {
            // Refresh failure: keep trustworthy cached rows, non-blocking stale warning.
            setDealsState({ companyId: id, status: "success", deals: cachedSeed, source: "cached" });
          } else {
            setDealsState({ companyId: id, status: "error", message, deals: [] });
          }
          return;
        }
        const data = await response.json();
        if (!data.success || !Array.isArray(data.deals)) {
          throw new Error("Invalid deals response");
        }

        const seen = new Set<string>();
        const deduped: Array<Record<string, unknown>> = [];
        for (const deal of data.deals) {
          const dealId = String(deal.ID || deal.id || "").trim();
          if (dealId && !seen.has(dealId)) {
            seen.add(dealId);
            deduped.push(deal);
          }
        }

        if (!controller.signal.aborted && dealSeq === dealsSeq.current) {
          // Refresh success: replace cached rows with refreshed (deduplicated) data.
          setDealsState({ companyId: id, status: "success", deals: deduped, source: "server" });
        }
      } catch {
        if (!controller.signal.aborted && dealSeq === dealsSeq.current) {
          if (cachedSeed.length > 0) {
            setDealsState({ companyId: id, status: "success", deals: cachedSeed, source: "cached" });
          } else {
            setDealsState({ companyId: id, status: "error", message: "Связанные сделки временно недоступны.", deals: [] });
          }
        }
      }
    }

    void load();
    void loadDeals();
    return () => controller.abort();
  }, [id, attempt]);

  // ONE company-scoped Samples/Smart Process data path for the drawer.
  // - ID change A → B resets the slice immediately: A's summary can never
  //   render under B (the prior-state check below is company-scoped).
  // - Retry bump performs a real request; failure after a prior success FOR
  //   THE SAME company preserves that snapshot as `refresh_failed` — through
  //   ANY number of repeated failed retries (a second failure must never
  //   convert to a hard `failed` state and discard previously valid data).
  // - Request-sequence + companyId guards: a late A response can never
  //   overwrite a B state.
  useEffect(() => {
    const controller = new AbortController();
    const seq = ++samplesSeq.current;
    setSamplesState((prev) =>
      prev.companyId === id && (prev.status === "ready" || prev.status === "refresh_failed")
        ? // Same company, prior snapshot exists: keep it visible (stale-aware)
          // while this refresh is in flight.
          prev
        : { status: "loading", companyId: id }
    );

    (async () => {
      try {
        const res = await fetch("/api/bitrix/samples", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ companyId: id }),
          signal: controller.signal,
          cache: "no-store",
        });
        if (controller.signal.aborted || seq !== samplesSeq.current) return;
        if (!res.ok) {
          const payload = await res.json().catch(() => null);
          const message =
            payload?.error ||
            (res.status === 401 ? "Требуется авторизация" : "Процессы тестирования временно недоступны.");
          setSamplesState((prev) =>
            prev.companyId === id && (prev.status === "ready" || prev.status === "refresh_failed")
              ? { status: "refresh_failed", companyId: id, summary: prev.summary, error: message }
              : { status: "failed", companyId: id, error: message }
          );
          return;
        }
        const data = await res.json();
        if (controller.signal.aborted || seq !== samplesSeq.current) return;
        if (!data.success || !Array.isArray(data.samples)) {
          throw new Error("invalid samples response");
        }
        const first = data.samples[0] ?? null;
        const summary: SampleSummary | null =
          first && String(first.companyId) === id ? first : null;
        setSamplesState({ status: "ready", companyId: id, summary });
      } catch (err) {
        if (controller.signal.aborted || seq !== samplesSeq.current) return;
        const message = err instanceof Error && err.message.includes("not configured")
          ? err.message
          : "Процессы тестирования временно недоступны.";
        setSamplesState((prev) =>
          prev.companyId === id && (prev.status === "ready" || prev.status === "refresh_failed")
            ? { status: "refresh_failed", companyId: id, summary: prev.summary, error: message }
            : { status: "failed", companyId: id, error: message }
        );
      }
    })();

    return () => controller.abort();
  }, [id, samplesAttempt]);

  const samplesRetry = () => setSamplesAttempt((n) => n + 1);

  // Excel truthfulness: while REQUIRED lookup bootstrap is still loading the
  // export is unavailable — an interim LOOKUP_LOADING_PLACEHOLDER must never
  // be serialized into a final workbook. Once loading finishes, partial/
  // failed lookups keep the export available but carry the same incompleteness
  // disclosure the UI shows (UI warnings and Excel disclosures agree 100%).
  const lookupLoading =
    fieldMetadataState === "loading" || userDirectoryState === "loading";
  // Plain derivation from the two independent source states (shared contract
  // with the Excel export) — memoization adds nothing over string identity.
  const lookupWarnings = buildCompanyLookupWarnings(fieldMetadataState, userDirectoryState);

  const exportBlockedReason =
    lookupLoading
      ? "Экспорт недоступен: справочники полей/сотрудников ещё загружаются"
      : dealsState.status !== "success" || dealsState.companyId !== id
      ? "Полный отчёт недоступен: связанные сделки ещё загружаются или не удалось загрузить"
      : !sameCompanySamples
      ? "Полный отчёт недоступен: данные тестирования образцов ещё загружаются или не удалось загрузить"
      : undefined;

  return (
    <Sheet open onOpenChange={(open) => { if (!open) onClose(); }}>
      <SheetContent
        side="right"
        className="w-full sm:max-w-2xl flex flex-col p-0 gap-0"
        onCloseAutoFocus={(event) => { if (onRestoreFocus) { event.preventDefault(); onRestoreFocus(); } }}
      >
        {/* Sticky header (scope-guarded title) */}
        <SheetHeader className="shrink-0 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/75 px-4 sm:px-6 py-4 pr-12">
          <SheetTitle className="break-words text-base leading-snug">
            {state.status === "success" && state.companyId === id
              ? String(state.company.TITLE || "").trim() || "Без названия"
              : "Компания"}
          </SheetTitle>
          <SheetDescription>Просмотр компании · ID {id}</SheetDescription>
        </SheetHeader>

        {/* Scrollable content between sticky header and footer */}
        <div className="min-h-0 flex-1 overflow-y-auto px-4 sm:px-6 py-4" aria-live="polite" aria-busy={state.status === "loading" || state.companyId !== id}>
          {state.status === "loading" && <div role="status" className="space-y-3">
            <span className="sr-only">Загрузка компании</span>
            <Skeleton className="h-5 w-3/4" /><Skeleton className="h-20 w-full" />
          </div>}
          {state.status === "error" && <div role="alert" className="space-y-3 text-sm">
            <p>{state.message}</p>
            {state.retry && <Button variant="outline" onClick={() => setAttempt((n) => n + 1)}>Повторить</Button>}
          </div>}
          {state.status === "success" && state.companyId === id && resolvedModel && (
            <div className="space-y-7 pb-6">
              {/* Independent lookup-source disclosures: truthful provisioning
                  state of EACH shared canonical directory. While a source is
                  loading, its enum/status cells show the interim placeholder
                  (never a premature final «Не классифицировано», never raw
                  IDs). An ultimate failure/partial state of a source is
                  disclosed — labels are never fabricated, DEMO metadata is
                  never substituted, and one source's success never hides the
                  other's incompleteness. Explicit retry re-arms ONE real
                  request per source. */}
              {(fieldMetadataState !== "ready" || userDirectoryState !== "ready") && (
                <div className="space-y-1.5" data-metadata-disclosures>
                  {fieldMetadataState !== "ready" && (
                    <div
                      role="note"
                      data-metadata-source="fields"
                      data-metadata-state={fieldMetadataState}
                      className={
                        fieldMetadataState === "loading"
                          ? "flex items-center gap-2 rounded-md border bg-muted/40 px-2 py-1.5 text-[11px] text-muted-foreground"
                          : "flex items-center gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 px-2 py-1.5 text-[11px] text-amber-700 dark:text-amber-400"
                      }
                    >
                      {fieldMetadataState === "loading" ? (
                        <Loader2 className="h-3 w-3 shrink-0 animate-spin" />
                      ) : (
                        <AlertTriangle className="h-3 w-3 shrink-0" />
                      )}
                      <span className="break-words" data-metadata-disclosure>
                        {fieldMetadataState === "loading"
                          ? "Справочник полей загружается…"
                          : "Справочник полей загружен не полностью / недоступен — часть значений может отображаться как «Не классифицировано»."}
                      </span>
                      {fieldMetadataState !== "loading" && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="ml-auto h-6 shrink-0 px-2 text-[11px]"
                          onClick={retryFieldsLookup}
                          data-metadata-retry="fields"
                        >
                          Повторить
                        </Button>
                      )}
                    </div>
                  )}
                  {userDirectoryState !== "ready" && (
                    <div
                      role="note"
                      data-metadata-source="users"
                      data-metadata-state={userDirectoryState}
                      className={
                        userDirectoryState === "loading"
                          ? "flex items-center gap-2 rounded-md border bg-muted/40 px-2 py-1.5 text-[11px] text-muted-foreground"
                          : "flex items-center gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 px-2 py-1.5 text-[11px] text-amber-700 dark:text-amber-400"
                      }
                    >
                      {userDirectoryState === "loading" ? (
                        <Loader2 className="h-3 w-3 shrink-0 animate-spin" />
                      ) : (
                        <AlertTriangle className="h-3 w-3 shrink-0" />
                      )}
                      <span className="break-words" data-metadata-disclosure>
                        {userDirectoryState === "loading"
                          ? "Справочник сотрудников загружается…"
                          : "Справочник сотрудников загружен не полностью / недоступен — часть ответственных может быть не определена."}
                      </span>
                      {userDirectoryState !== "loading" && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="ml-auto h-6 shrink-0 px-2 text-[11px]"
                          onClick={retryUsersLookup}
                          data-metadata-retry="users"
                        >
                          Повторить
                        </Button>
                      )}
                    </div>
                  )}
                </div>
              )}
              {/* SECTION 1: ИНФОРМАЦИЯ О КОМПАНИИ */}
              <section aria-label="Информация о компании">
                <SectionHeading title="Информация о компании" />
                <dl className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3.5 text-sm">
                  {businessFields.map((field) => {
                    const isLong = LONG_FIELD_IDS.has(field.id);
                    const empty = field.value === EMPTY_FIELD_PLACEHOLDER;
                    return (
                      <div key={field.id} className={isLong ? "sm:col-span-2" : undefined} data-company-field={field.id}>
                        <PreviewFieldLabel>{field.label}</PreviewFieldLabel>
                        <dd className="mt-0.5">
                          <PreviewFieldValue isEmpty={empty} preserveWhitespace={isLong}>
                            {empty ? PREVIEW_EMPTY_VALUE : <FieldValue field={field} />}
                          </PreviewFieldValue>
                        </dd>
                      </div>
                    );
                  })}
                </dl>
              </section>

              {/* SECTION 2: ИНФОРМАЦИЯ ОБ ОБРАЗЦАХ (Bitrix marker field only) */}
              <section aria-label="Информация об образцах" data-marker-section>
                <SectionHeading title="Информация об образцах" />
                {markerField ? (
                  <dl className="mt-3 text-sm" data-marker-field>
                    <div>
                      <PreviewFieldLabel>{markerField.label}</PreviewFieldLabel>
                      <dd className="mt-0.5">
                        <PreviewFieldValue isEmpty={markerField.value === EMPTY_FIELD_PLACEHOLDER}>
                          {markerField.value === EMPTY_FIELD_PLACEHOLDER
                            ? PREVIEW_EMPTY_VALUE
                            : formatPreviewValue(markerField.value, markerField.type === "boolean" || markerField.type === "char")}
                        </PreviewFieldValue>
                      </dd>
                    </div>
                  </dl>
                ) : (
                  <p className="mt-2 text-xs text-muted-foreground">Поле недоступно.</p>
                )}
              </section>

              {/* SECTION 3: ТЕСТИРОВАНИЕ ОБРАЗЦОВ (canonical SP analytics) */}
              <CompanyTestingSection
                companyId={id}
                samplesState={samplesState}
                spItems={spItems}
                dealTitleById={dealTitleById}
                onOpenDealPreview={onOpenDealPreview}
                onRetry={samplesRetry}
              />

              {/* SECTION 4: СВЯЗАННЫЕ СДЕЛКИ (scope-guarded: only the current
                  company's snapshot renders, in any state) */}
              <section aria-label="Связанные сделки" data-deals-section>
                <SectionHeading title={`Связанные сделки${dealsState.status === "success" && dealsState.companyId === id ? ` (${dealsState.deals.length})` : ""}`} />
                <div className="mt-3">
                  {dealsState.status === "loading" && dealsState.companyId === id && dealsState.deals.length === 0 && (
                    <div role="status" className="space-y-2">
                      <span className="sr-only">Загрузка связанных сделок</span>
                      <Skeleton className="h-9 w-full" />
                      <Skeleton className="h-9 w-full" />
                    </div>
                  )}

                  {/* Cache-first: trustworthy cached deals render while refresh is in flight. */}
                  {dealsState.status === "loading" && dealsState.companyId === id && dealsState.deals.length > 0 && (
                    <DealRows
                      deals={dealsState.deals}
                      resolveStage={resolveStage}
                      dealBitrixUrlBase={state.companyId === id ? state.bitrixUrl : null}
                      onOpenDealPreview={onOpenDealPreview}
                    />
                  )}

                  {dealsState.status === "error" && dealsState.companyId === id && (
                    <div role="alert" className="space-y-2 text-xs">
                      <p className="text-destructive">{dealsState.message}</p>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => setAttempt((n) => n + 1)}
                        className="h-7 text-xs"
                      >
                        Повторить
                      </Button>
                    </div>
                  )}

                  {dealsState.status === "success" && dealsState.companyId === id && (
                    dealsState.deals.length === 0 ? (
                      <p className="text-xs text-muted-foreground">Нет связанных сделок</p>
                    ) : (
                      <DealRows
                        deals={dealsState.deals}
                        resolveStage={resolveStage}
                        dealBitrixUrlBase={state.companyId === id ? state.bitrixUrl : null}
                        onOpenDealPreview={onOpenDealPreview}
                      />
                    )
                  )}
                </div>
              </section>

              {/* SECTION 5: СИСТЕМНАЯ ИНФОРМАЦИЯ */}
              <section aria-label="Системная информация" data-system-section>
                <SectionHeading title="Системная информация" />
                <dl className="mt-3 text-sm">
                  {systemFields.map((field) => (
                    <div key={field.id} data-system-field={field.id}>
                      <PreviewFieldLabel>{field.label}</PreviewFieldLabel>
                      <dd className="mt-0.5">
                        <PreviewFieldValue isEmpty={field.value === EMPTY_FIELD_PLACEHOLDER}>
                          {field.value === EMPTY_FIELD_PLACEHOLDER ? PREVIEW_EMPTY_VALUE : field.value}
                        </PreviewFieldValue>
                      </dd>
                    </div>
                  ))}
                </dl>
              </section>
            </div>
          )}
        </div>

        {/* Sticky footer */}
        <SheetFooter className="shrink-0 border-t bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/75 px-4 sm:px-6 py-3 flex-row flex-wrap items-center gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={handleExport}
            disabled={
              state.status !== "success" ||
              state.companyId !== id ||
              !resolvedModel ||
              lookupLoading ||
              dealsState.status !== "success" ||
              dealsState.companyId !== id ||
              !sameCompanySamples ||
              isExporting
            }
            title={exportBlockedReason}
            className="border-brand-blue text-brand-blue hover:bg-brand-blue-light/50 hover:text-brand-blue dark:border-blue-400 dark:text-blue-400 dark:hover:bg-blue-950/40 gap-1.5 w-full sm:w-auto"
          >
            {isExporting ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Download className="h-4 w-4" />
            )}
            {isExporting ? "Экспорт…" : "Экспорт отчёта"}
          </Button>

          {state.status === "success" && state.companyId === id && state.bitrixUrl ? (
            <Button asChild className="w-full sm:w-auto">
              <a href={state.bitrixUrl} target="_blank" rel="noopener noreferrer">
                Открыть карточку в Bitrix24
              </a>
            </Button>
          ) : (
            <Button disabled className="w-full sm:w-auto">
              Открыть карточку в Bitrix24
            </Button>
          )}

          {state.status === "success" && state.companyId === id && !state.bitrixUrl && (
            <p className="text-xs text-muted-foreground w-full">
              Ссылка на портал Bitrix24 не настроена.
            </p>
          )}
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}

/** Long fields occupy the full available row (canonical whitelist IDs). */
const LONG_FIELD_IDS = new Set<string>([
  "ADDRESS",
  "UF_CRM_1782742600447", // Документы контрагента (file)
  "UF_CRM_691EB8983DE7D", // Карточка компании (file)
  "UF_CRM_1753080295792", // Комментарий по используемым продуктам
  "COMMENTS",
  "UF_CRM_1782743261289", // Фактические цены
]);

/** Section heading: shared preview design system (one H2 treatment). */
function SectionHeading({ title }: { title: string }) {
  return (
    <PreviewSectionHeading className="border-b pb-1.5">
      {title}
    </PreviewSectionHeading>
  );
}

/**
 * Field value rendering: safe clickable links for website/phone/email,
 * plain text otherwise. Link construction is conservative — an unsafe or
 * unparseable value stays plain text (never executes user data as a URL).
 */
function FieldValue({ field }: { field: { id: string; value: string; type?: string } }) {
  const value = field.value;

  if (field.id === "WEB") {
    const href = safeHttpUrl(value);
    return href ? (
      <a href={href} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline break-all inline-flex items-center gap-1">
        <Link2 className="h-3 w-3 shrink-0" />
        {value}
      </a>
    ) : (
      <span className="break-all">{value}</span>
    );
  }

  if (field.id === "PHONE") {
    const tel = value.replace(/[^\d+]/g, "");
    return tel ? (
      <a href={`tel:${tel}`} className="text-primary hover:underline">{value}</a>
    ) : (
      <span>{value}</span>
    );
  }

  if (field.id === "EMAIL") {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value) ? (
      <a href={`mailto:${value}`} className="text-primary hover:underline break-all">{value}</a>
    ) : (
      <span className="break-all">{value}</span>
    );
  }

  return <span className="whitespace-pre-wrap break-words">{value}</span>;
}

/** Conservative http(s) URL builder; anything else stays plain text. */
function safeHttpUrl(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed || /\s/.test(trimmed)) return null;
  const candidate = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  try {
    const url = new URL(candidate);
    return url.protocol === "http:" || url.protocol === "https:" ? url.toString() : null;
  } catch {
    return null;
  }
}

/**
 * SECTION 3 «Тестирование образцов»: canonical Smart Process analytics from
 * the ONE company-scoped Samples response — analytical summary, active/
 * terminal counts, then EVERY physical cycle (multiple active cycles all
 * render, never collapsed; conflict/orphan items never leak into company
 * attribution). Trustworthy states: loading / truthful empty / explicit
 * failure + retry / stale-preserved disclosure.
 */
function CompanyTestingSection({
  companyId,
  samplesState,
  spItems,
  dealTitleById,
  onOpenDealPreview,
  onRetry,
}: {
  companyId: string;
  samplesState: SamplesState;
  spItems: SmartProcessItemViewLite[];
  dealTitleById: Map<string, string>;
  onOpenDealPreview?: (dealId: string) => void;
  onRetry: () => void;
}) {
  // Cross-company isolation: a snapshot from another company (late response,
  // stale prior data) must never render here — treat it as loading.
  const scoped =
    (samplesState.status === "ready" ||
      samplesState.status === "refresh_failed" ||
      samplesState.status === "failed") &&
    samplesState.companyId === companyId;
  const effectiveStatus: SamplesState["status"] = scoped ? samplesState.status : "loading";
  const summary =
    scoped && (samplesState.status === "ready" || samplesState.status === "refresh_failed")
      ? samplesState.summary
      : null;

  return (
    <section aria-label="Тестирование образцов" data-sp-company-section>
      <SectionHeading title="Тестирование образцов" />
      <div className="mt-3 text-xs space-y-3">
        {effectiveStatus === "loading" && (
          <div role="status" className="space-y-2">
            <span className="sr-only">Загрузка процессов тестирования</span>
            <Skeleton className="h-6 w-2/3" />
            <Skeleton className="h-12 w-full" />
          </div>
        )}

        {effectiveStatus === "failed" && (
          <div role="alert" className="space-y-2" data-sp-company-failed>
            <p className="text-muted-foreground">{samplesState.status === "failed" ? samplesState.error : null}</p>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-7 text-xs"
              onClick={onRetry}
              data-sp-retry
            >
              Повторить
            </Button>
          </div>
        )}

        {(effectiveStatus === "ready" || effectiveStatus === "refresh_failed") && (
          <>
            {effectiveStatus === "refresh_failed" && (
              <div
                role="note"
                data-sp-stale-warning
                className="flex items-center gap-2 flex-wrap rounded-md border border-destructive/40 bg-destructive/10 px-2 py-1.5 text-[11px] text-destructive"
              >
                <span className="break-words">Обновление не удалось — показаны ранее загруженные данные.</span>
                <Button type="button" variant="outline" size="sm" className="h-7 text-[11px]" onClick={onRetry} data-sp-retry>
                  Повторить
                </Button>
              </div>
            )}

            {/* Analytical summary (same response, same canonical engine) */}
            {summary && (
              <div className="rounded-md bg-muted/30 p-2.5 space-y-1.5" data-samples-summary>
                <div className="flex items-center gap-1.5 font-medium text-foreground/80">
                  <FlaskConical className="h-3 w-3" />
                  Сводка по образцам (аналитика)
                </div>
                <div className="text-muted-foreground">
                  Результат:{" "}
                  <span className="text-foreground font-medium">
                    {NORMALIZED_RESULT_LABELS[summary.normalizedResult] ?? summary.normalizedResult}
                  </span>
                  {summary.rawTestResult && (
                    <span className="ml-1">· «{summary.rawTestResult}»</span>
                  )}
                </div>
                {(summary.sentDates ?? []).length > 0 && (
                  <div className="text-muted-foreground">
                    Даты передачи:{" "}
                    <span className="text-foreground">{summary.sentDates.join(", ")}</span>
                  </div>
                )}
                {(summary.dataIssues ?? []).length > 0 && (
                  <div className="text-amber-700 dark:text-amber-400">
                    ⚠ {summary.dataIssues.length} замеч. по качеству данных
                  </div>
                )}
                <Link
                  href={`/samples?company=${encodeURIComponent(companyId)}`}
                  className="inline-flex items-center gap-1 text-primary hover:underline"
                >
                  Открыть в разделе «Образцы»
                  <ArrowRight className="h-3 w-3" />
                </Link>
              </div>
            )}

            {/* Physical cycle counts + every cycle */}
            <div data-sp-company-summary-block>
              {spItems.length === 0 ? (
                <p className="text-muted-foreground" data-sp-company-empty>
                  Циклы тестирования не найдены
                </p>
              ) : (
                <>
                  <div className="text-muted-foreground flex items-center gap-2" data-sp-company-summary>
                    <span>
                      Активных: {spItems.filter((c) => c.isActive).length} · Завершённых:{" "}
                      {spItems.filter((c) => c.isTerminal).length}
                    </span>
                    {/* Explicit manual refresh in the loaded state: always a
                        real request; a failed refresh preserves the prior
                        snapshot with a stale disclosure. */}
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-6 px-2 text-[11px] text-muted-foreground"
                      onClick={onRetry}
                      data-sp-retry
                    >
                      Обновить
                    </Button>
                  </div>
                  <ul className="mt-2 space-y-2" data-sp-company-list>
                    {spItems.map((view) => (
                      <SmartProcessItemCard
                        key={view.processItemId}
                        view={view}
                        dealTitle={
                          view.linkedDealId
                            ? dealTitleById.get(view.linkedDealId) || `Сделка ID ${view.linkedDealId}`
                            : "Без связанной сделки"
                        }
                        onOpenDealPreview={onOpenDealPreview}
                        dataTestId="sp-company-cycle"
                      />
                    ))}
                  </ul>
                </>
              )}
            </div>
          </>
        )}
      </div>
    </section>
  );
}

/**
 * Related-deal rows shared by refresh-in-flight (cached seed) and success
 * states — identical rendering guaranteed for both paths.
 */
function DealRows({
  deals,
  resolveStage,
  dealBitrixUrlBase,
  onOpenDealPreview,
}: {
  deals: Array<Record<string, unknown>>;
  resolveStage: (rawStage: unknown) => string | null;
  dealBitrixUrlBase: string | null;
  onOpenDealPreview?: (dealId: string) => void;
}) {
  return (
    <div className="space-y-2">
      {deals.map((deal) => {
        const dealId = String(deal.ID || deal.id);
        const dealTitle = String(deal.TITLE || deal.title || "").trim() || "Без названия";
        const stage = resolveStage(deal.STAGE_ID ?? deal.stageId);
        const rawOpp = deal.OPPORTUNITY ?? deal.opportunity;
        // Strict parsing: malformed amounts never display as numbers.
        const opportunity = parseStrictNumber(rawOpp);
        const rawCurrency = deal.CURRENCY_ID ?? deal.currencyId;
        const currency =
          rawCurrency !== null &&
          rawCurrency !== undefined &&
          String(rawCurrency).trim() !== ""
            ? String(rawCurrency).trim()
            : undefined;
        const dealBitrixUrl =
          typeof deal.bitrixUrl === "string"
            ? deal.bitrixUrl
            : dealBitrixUrlBase
            ? dealBitrixUrlBase.replace(
                /\/crm\/company\/details\/\d+\/?/,
                `/crm/deal/details/${dealId}/`
              )
            : null;

        return (
          <div
            key={dealId}
            className="flex items-center justify-between p-2.5 rounded-md border bg-card/60 hover:bg-muted/40 transition-colors text-xs gap-3"
          >
            <div className="min-w-0 flex-1">
              {onOpenDealPreview ? (
                <button
                  type="button"
                  data-related-deal={dealId}
                  onClick={() => onOpenDealPreview(dealId)}
                  className="font-medium hover:underline text-left truncate block w-full text-foreground"
                >
                  {dealTitle}
                </button>
              ) : dealBitrixUrl ? (
                <a
                  href={dealBitrixUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-medium hover:underline text-left truncate block w-full text-foreground"
                >
                  {dealTitle}
                </a>
              ) : (
                <span className="font-medium truncate block w-full text-foreground">
                  {dealTitle}
                </span>
              )}
              {stage && (
                <div className="text-muted-foreground mt-0.5 truncate text-[11px]">
                  {stage}
                </div>
              )}
            </div>

            <div className="flex items-center gap-2 shrink-0">
              {(opportunity !== undefined && !isNaN(opportunity)) && (
                <span className="tabular-nums text-muted-foreground whitespace-nowrap">
                  {opportunity.toLocaleString("ru-RU", {
                    minimumFractionDigits: 0,
                    maximumFractionDigits: 2,
                  })}
                  {currency && currency.toUpperCase() !== "UNKNOWN"
                    ? ` ${currency}`
                    : " – валюта не указана"}
                </span>
              )}
              {dealBitrixUrl && (
                <a
                  href={dealBitrixUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  title="Открыть сделку в Bitrix24"
                  className="text-muted-foreground hover:text-foreground"
                >
                  <ExternalLink className="h-3.5 w-3.5" />
                </a>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
