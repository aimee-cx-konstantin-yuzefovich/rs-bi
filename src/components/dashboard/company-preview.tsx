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
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription, SheetFooter } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Download, ExternalLink, Loader2, FlaskConical, ArrowRight, Link2 } from "lucide-react";
import { useDashboardStore } from "@/store/dashboard-store";
import {
  buildCompanyPreviewModel,
  partitionCompanyPreviewFields,
  EMPTY_FIELD_PLACEHOLDER,
  type CompanyPreviewModel,
} from "@/lib/company-preview";
import { exportCompanyToExcel } from "@/lib/export-utils";
import { parseStrictNumber } from "@/lib/scalar-safety";
import { NORMALIZED_RESULT_LABELS } from "@/lib/samples/constants";
import type { SampleSummary, SmartProcessItemViewLite } from "@/lib/samples/types";
import { getDealStageDisplayLabel } from "@/lib/crm-constants";
import { SmartProcessItemCard } from "@/components/dashboard/samples/smart-process-item-card";

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

type PreviewState =
  | { status: "loading" }
  | { status: "error"; message: string; retry: boolean }
  | { status: "success"; company: Record<string, unknown>; bitrixUrl: string | null };

/**
 * Company-scoped canonical Samples/Smart Process load state.
 * Exactly ONE data path: POST /api/bitrix/samples { companyId }.
 */
type SamplesState =
  | { status: "loading" }
  | { status: "failed"; error: string }
  | { status: "ready"; summary: SampleSummary | null }
  | { status: "refresh_failed"; summary: SampleSummary | null; error: string };

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
  const [state, setState] = useState<PreviewState>({ status: "loading" });
  const [dealsState, setDealsState] = useState<
    | { status: "loading"; deals: Array<Record<string, unknown>> } // deals: cached seed shown immediately
    | { status: "success"; deals: Array<Record<string, unknown>>; source: "server" | "cached" }
    | { status: "error"; message: string; deals: Array<Record<string, unknown>> } // deals: cached rows kept
  >({ status: "loading", deals: [] });
  const [samplesState, setSamplesState] = useState<SamplesState>({ status: "loading" });
  const [samplesAttempt, setSamplesAttempt] = useState(0);
  const [attempt, setAttempt] = useState(0);
  const [isExporting, setIsExporting] = useState(false);

  const { userNames, fields, usersCoverage, allDeals, dealsCoverage } = useDashboardStore() as {
    userNames: Record<string, string> | null;
    fields: Array<{ id: string; title?: string; type?: string; listValues?: Array<{ ID: string; VALUE: string }> }> | null;
    usersCoverage: import("@/lib/dataset-coverage").DatasetCoverage | null;
    allDeals: Array<Record<string, unknown>>;
    dealsCoverage: import("@/lib/dataset-coverage").DatasetCoverage | null;
  };

  /**
   * Cache-first related deals: trustworthy deal rows already present in the
   * client store are shown immediately (drawer does not wait for the server).
   * Cached scope is trustworthy ONLY when the store deals dataset is
   * verifiably COMPLETE: PARTIAL (partial failures) and CAPPED (truncated by
   * loading limit) are both incomplete — and unknown coverage (null) is
   * likewise never presented as a complete related-deal set. The server
   * refresh still runs regardless.
   */
  function seedDealsFromCache(): Array<Record<string, unknown>> {
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
  }

  // ONE canonical current-card model (buildCompanyPreviewModel) drives the
  // card. Selected table columns and callers can never influence contents.
  // Sections come from the ONE canonical partition helper (the same one the
  // Company Excel export uses) — no hard-coded UF tokens here.
  const resolvedModel: CompanyPreviewModel | null =
    state.status === "success"
      ? buildCompanyPreviewModel(state.company, {
          fields: (fields ?? []) as any,
          userNames: userNames ?? {},
          usersCoverage,
        })
      : null;

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
    if (samplesState.status === "ready" || samplesState.status === "refresh_failed") {
      const summary = samplesState.summary;
      if (summary && Array.isArray(summary.relatedDeals)) {
        for (const rd of summary.relatedDeals) {
          if (rd.title && rd.title !== "Без названия" && !map.has(rd.id)) map.set(rd.id, rd.title);
        }
      }
    }
    return map;
  }, [allDeals, samplesState]);

  const spItems: SmartProcessItemViewLite[] =
    samplesState.status === "ready" || samplesState.status === "refresh_failed"
      ? samplesState.summary?.smartProcessItems ?? []
      : [];

  const handleExport = async () => {
    if (state.status !== "success" || !resolvedModel) return;
    // Full report requires company card + related deals + Samples/SP data to
    // have succeeded — a loading/error state must never silently map to an
    // empty-but-complete-looking report (data-trust invariant B).
    if (dealsState.status !== "success") return;
    if (samplesState.status !== "ready" && samplesState.status !== "refresh_failed") return;
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

      const summary =
        samplesState.status === "ready" || samplesState.status === "refresh_failed"
          ? samplesState.summary
          : null;

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
          stale: samplesState.status === "refresh_failed",
        },
        dealTitleById,
        userNames: userNames ?? {},
        usersCoverage,
      });
    } catch (err) {
      console.error("Failed to export company to Excel", err);
    } finally {
      setIsExporting(false);
    }
  };

  useEffect(() => {
    const controller = new AbortController();
    setState({ status: "loading" });
    // Cache-first: re-seed from the store so cached deals render during load.
    setDealsState({ status: "loading", deals: seedDealsFromCache() });

    async function load() {
      try {
        const response = await fetch(`/api/bitrix/companies/${encodeURIComponent(id)}`, {
          signal: controller.signal, cache: "no-store",
        });
        if (controller.signal.aborted) return;
        if (!response.ok) {
          setState({ status: "error", retry: ![401, 403, 404].includes(response.status),
            message: response.status === 404 ? "Компания не найдена" : response.status === 403
              ? "Нет доступа к компании" : response.status === 401 ? "Требуется авторизация"
                : "Не удалось загрузить компанию. Попробуйте ещё раз." });
          return;
        }
        const data = await response.json();
        if (!data.success || !data.company || String(data.company.ID) !== id) throw new Error("Invalid preview");
        if (!controller.signal.aborted) setState({ status: "success", company: data.company, bitrixUrl: data.bitrixUrl });
      } catch {
        if (!controller.signal.aborted) setState({ status: "error", retry: true,
          message: "Не удалось загрузить компанию. Попробуйте ещё раз." });
      }
    }

    async function loadDeals() {
      const cachedSeed = seedDealsFromCache();
      try {
        const response = await fetch(`/api/bitrix/companies/${encodeURIComponent(id)}/deals`, {
          signal: controller.signal,
          cache: "no-store",
        });
        if (controller.signal.aborted) return;
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
            setDealsState({ status: "success", deals: cachedSeed, source: "cached" });
          } else {
            setDealsState({ status: "error", message, deals: [] });
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

        if (!controller.signal.aborted) {
          // Refresh success: replace cached rows with refreshed (deduplicated) data.
          setDealsState({ status: "success", deals: deduped, source: "server" });
        }
      } catch {
        if (!controller.signal.aborted) {
          if (cachedSeed.length > 0) {
            setDealsState({ status: "success", deals: cachedSeed, source: "cached" });
          } else {
            setDealsState({ status: "error", message: "Связанные сделки временно недоступны.", deals: [] });
          }
        }
      }
    }

    void load();
    void loadDeals();
    return () => controller.abort();
  }, [id, attempt]);

  // ONE company-scoped Samples/Smart Process data path for the drawer.
  // retry bump performs a real request; failure after a prior success
  // preserves the previous snapshot with a stale disclosure.
  useEffect(() => {
    const controller = new AbortController();
    const hasPrior =
      samplesState.status === "ready" ||
      samplesState.status === "refresh_failed";
    if (!hasPrior) setSamplesState({ status: "loading" });

    (async () => {
      try {
        const res = await fetch("/api/bitrix/samples", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ companyId: id }),
          signal: controller.signal,
          cache: "no-store",
        });
        if (controller.signal.aborted) return;
        if (!res.ok) {
          const payload = await res.json().catch(() => null);
          const message =
            payload?.error ||
            (res.status === 401 ? "Требуется авторизация" : "Процессы тестирования временно недоступны.");
          setSamplesState((prev) =>
            prev.status === "ready" && samplesAttempt > 0
              ? { status: "refresh_failed", summary: prev.summary, error: message }
              : { status: "failed", error: message }
          );
          return;
        }
        const data = await res.json();
        if (controller.signal.aborted) return;
        if (!data.success || !Array.isArray(data.samples)) {
          throw new Error("invalid samples response");
        }
        const first = data.samples[0] ?? null;
        const summary: SampleSummary | null =
          first && String(first.companyId) === id ? first : null;
        setSamplesState({ status: "ready", summary });
      } catch (err) {
        if (controller.signal.aborted) return;
        const message = err instanceof Error && err.message.includes("not configured")
          ? err.message
          : "Процессы тестирования временно недоступны.";
        setSamplesState((prev) =>
          prev.status === "ready" && samplesAttempt > 0
            ? { status: "refresh_failed", summary: prev.summary, error: message }
            : { status: "failed", error: message }
        );
      }
    })();

    return () => controller.abort();
  }, [id, samplesAttempt]);

  const samplesRetry = () => setSamplesAttempt((n) => n + 1);

  const exportBlockedReason =
    dealsState.status !== "success"
      ? "Полный отчёт недоступен: связанные сделки ещё загружаются или не удалось загрузить"
      : samplesState.status === "loading" || samplesState.status === "failed"
      ? "Полный отчёт недоступен: данные тестирования образцов ещё загружаются или не удалось загрузить"
      : undefined;

  return (
    <Sheet open onOpenChange={(open) => { if (!open) onClose(); }}>
      <SheetContent
        side="right"
        className="w-full sm:max-w-2xl flex flex-col p-0 gap-0"
        onCloseAutoFocus={(event) => { if (onRestoreFocus) { event.preventDefault(); onRestoreFocus(); } }}
      >
        {/* Sticky header */}
        <SheetHeader className="shrink-0 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/75 px-4 sm:px-6 py-4 pr-12">
          <SheetTitle className="break-words text-base leading-snug">
            {state.status === "success" ? String(state.company.TITLE || "").trim() || "Без названия" : "Компания"}
          </SheetTitle>
          <SheetDescription>Просмотр компании · ID {id}</SheetDescription>
        </SheetHeader>

        {/* Scrollable content between sticky header and footer */}
        <div className="min-h-0 flex-1 overflow-y-auto px-4 sm:px-6 py-4" aria-live="polite" aria-busy={state.status === "loading"}>
          {state.status === "loading" && <div role="status" className="space-y-3">
            <span className="sr-only">Загрузка компании</span>
            <Skeleton className="h-5 w-3/4" /><Skeleton className="h-20 w-full" />
          </div>}
          {state.status === "error" && <div role="alert" className="space-y-3 text-sm">
            <p>{state.message}</p>
            {state.retry && <Button variant="outline" onClick={() => setAttempt((n) => n + 1)}>Повторить</Button>}
          </div>}
          {state.status === "success" && resolvedModel && (
            <div className="space-y-7 pb-6">
              {/* SECTION 1: ИНФОРМАЦИЯ О КОМПАНИИ */}
              <section aria-label="Информация о компании">
                <SectionHeading title="Информация о компании" />
                <dl className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3.5 text-sm">
                  {businessFields.map((field) => {
                    const isLong = LONG_FIELD_IDS.has(field.id);
                    const empty = field.value === EMPTY_FIELD_PLACEHOLDER;
                    return (
                      <div key={field.id} className={isLong ? "sm:col-span-2" : undefined} data-company-field={field.id}>
                        <dt className="text-xs text-muted-foreground">{field.label}</dt>
                        <dd className="mt-0.5 whitespace-pre-wrap break-words font-medium">
                          {empty ? (
                            <span className="text-muted-foreground/70 font-normal">{EMPTY_FIELD_PLACEHOLDER}</span>
                          ) : (
                            <FieldValue field={field} />
                          )}
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
                      <dt className="text-xs text-muted-foreground">{markerField.label}</dt>
                      <dd className="mt-0.5 font-medium">
                        {markerField.value === EMPTY_FIELD_PLACEHOLDER ? (
                          <span className="text-muted-foreground/70 font-normal">{EMPTY_FIELD_PLACEHOLDER}</span>
                        ) : (
                          formatPreviewValue(markerField.value, markerField.type === "boolean" || markerField.type === "char")
                        )}
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

              {/* SECTION 4: СВЯЗАННЫЕ СДЕЛКИ */}
              <section aria-label="Связанные сделки" data-deals-section>
                <SectionHeading title={`Связанные сделки${dealsState.status === "success" ? ` (${dealsState.deals.length})` : ""}`} />
                <div className="mt-3">
                  {dealsState.status === "loading" && dealsState.deals.length === 0 && (
                    <div role="status" className="space-y-2">
                      <span className="sr-only">Загрузка связанных сделок</span>
                      <Skeleton className="h-9 w-full" />
                      <Skeleton className="h-9 w-full" />
                    </div>
                  )}

                  {/* Cache-first: trustworthy cached deals render while refresh is in flight. */}
                  {dealsState.status === "loading" && dealsState.deals.length > 0 && (
                    <DealRows
                      deals={dealsState.deals}
                      resolveStage={resolveStage}
                      dealBitrixUrlBase={state.bitrixUrl}
                      onOpenDealPreview={onOpenDealPreview}
                    />
                  )}

                  {dealsState.status === "error" && (
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

                  {dealsState.status === "success" && (
                    <>
                      {dealsState.deals.length === 0 ? (
                        <p className="text-xs text-muted-foreground">Нет связанных сделок</p>
                      ) : (
                        <DealRows
                          deals={dealsState.deals}
                          resolveStage={resolveStage}
                          dealBitrixUrlBase={state.bitrixUrl}
                          onOpenDealPreview={onOpenDealPreview}
                        />
                      )}
                      {dealsState.source === "cached" && (
                        <p className="mt-2 text-[11px] text-amber-700 dark:text-amber-400" data-stale-warning>
                          Показаны кэшированные сделки; обновление с сервера не удалось.
                        </p>
                      )}
                    </>
                  )}
                </div>
              </section>

              {/* SECTION 5: СИСТЕМНАЯ ИНФОРМАЦИЯ */}
              <section aria-label="Системная информация" data-system-section>
                <SectionHeading title="Системная информация" />
                <dl className="mt-3 text-sm">
                  {systemFields.map((field) => (
                    <div key={field.id} data-system-field={field.id}>
                      <dt className="text-xs text-muted-foreground">{field.label}</dt>
                      <dd className="mt-0.5 font-medium">
                        {field.value === EMPTY_FIELD_PLACEHOLDER ? (
                          <span className="text-muted-foreground/70 font-normal">{EMPTY_FIELD_PLACEHOLDER}</span>
                        ) : (
                          field.value
                        )}
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
              !resolvedModel ||
              dealsState.status !== "success" ||
              (samplesState.status !== "ready" && samplesState.status !== "refresh_failed") ||
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

          {state.status === "success" && state.bitrixUrl ? (
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

          {state.status === "success" && !state.bitrixUrl && (
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

/** Section heading: calm uppercase muted hierarchy, no heavy borders. */
function SectionHeading({ title }: { title: string }) {
  return (
    <h3 className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider border-b pb-1.5">
      {title}
    </h3>
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
      <a href={`tel:${tel}`} className="hover:underline">{value}</a>
    ) : (
      <span>{value}</span>
    );
  }

  if (field.id === "EMAIL") {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value) ? (
      <a href={`mailto:${value}`} className="hover:underline break-all">{value}</a>
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
  const summary =
    samplesState.status === "ready" || samplesState.status === "refresh_failed"
      ? samplesState.summary
      : null;

  return (
    <section aria-label="Тестирование образцов" data-sp-company-section>
      <SectionHeading title="Тестирование образцов" />
      <div className="mt-3 text-xs space-y-3">
        {samplesState.status === "loading" && (
          <div role="status" className="space-y-2">
            <span className="sr-only">Загрузка процессов тестирования</span>
            <Skeleton className="h-6 w-2/3" />
            <Skeleton className="h-12 w-full" />
          </div>
        )}

        {samplesState.status === "failed" && (
          <div role="alert" className="space-y-2" data-sp-company-failed>
            <p className="text-muted-foreground">{samplesState.error}</p>
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

        {(samplesState.status === "ready" || samplesState.status === "refresh_failed") && (
          <>
            {samplesState.status === "refresh_failed" && (
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
                <span className="font-mono tabular-nums text-muted-foreground whitespace-nowrap">
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
