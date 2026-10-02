"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription, SheetFooter } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Download, ExternalLink, Loader2, FlaskConical, ArrowRight } from "lucide-react";
import { useDashboardStore } from "@/store/dashboard-store";
import { buildCompanyPreviewModel, defaultSampleFields, type PreviewField } from "@/lib/company-preview";
import { exportCompanyToExcel } from "@/lib/export-utils";
import { parseStrictNumber } from "@/lib/scalar-safety";
import { NORMALIZED_RESULT_LABELS } from "@/lib/samples/constants";
import type { SampleSummary } from "@/lib/samples/types";
import { getDealStageDisplayLabel } from "@/lib/crm-constants";

function formatPreviewValue(val: unknown, isBoolean?: boolean): string {
  if (val === null || val === undefined || val === "") return "–";
  if (isBoolean) {
    if (val === true || String(val).toLowerCase() === "true" || val === "Y" || val === "1") return "Да";
    if (val === false || String(val).toLowerCase() === "false" || val === "N" || val === "0") return "Нет";
  } else {
    if (val === false || String(val).trim().toLowerCase() === "false" || String(val).trim().toLowerCase() === "null" || String(val).trim().toLowerCase() === "undefined") {
      return "–";
    }
  }
  if (val === true) return "Да";
  if (typeof val === "object") {
    if (Array.isArray(val)) return val.map((v) => formatPreviewValue(v, isBoolean)).join(", ");
    return JSON.stringify(val);
  }
  const str = String(val).trim();
  if (!str || str === "—" || str === "–" || str === "null" || str === "undefined") return "–";
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

export interface CompanyPreviewProps {
  id: string;
  onClose: () => void;
  onRestoreFocus?: () => void;
  sampleFieldsFor?: (company: Record<string, unknown>) => PreviewField[];
  onOpenDealPreview?: (dealId: string) => void;
  onExport?: (options: {
    companyTitle: string;
    companyId: string;
    companyFields: Array<{ id?: string; label: string; value: string; type?: string }>;
    sampleFields: Array<{ id?: string; label: string; value: string; type?: string }>;
    deals: Array<{
      id: string;
      title: string;
      stage?: string | null;
      opportunity?: number | null;
      currency?: string;
    }>;
  }) => void;
}

export function CompanyPreview({
  id,
  onClose,
  onRestoreFocus,
  sampleFieldsFor,
  onOpenDealPreview,
  onExport,
}: CompanyPreviewProps) {
  const [state, setState] = useState<PreviewState>({ status: "loading" });
  const [dealsState, setDealsState] = useState<
    | { status: "loading"; deals: Array<Record<string, unknown>> } // deals: cached seed shown immediately
    | { status: "success"; deals: Array<Record<string, unknown>>; source: "server" | "cached" }
    | { status: "error"; message: string; deals: Array<Record<string, unknown>> } // deals: cached rows kept
  >({ status: "loading", deals: [] });
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
  // card. Selected table columns can never influence Preview contents.
  const resolvedModel =
    state.status === "success"
      ? buildCompanyPreviewModel(state.company, {
          fields: (fields ?? []) as any,
          userNames: userNames ?? {},
          usersCoverage,
        })
      : null;

  const cardFields: PreviewField[] = (resolvedModel?.fields ?? []).map((f) => ({
    id: f.id,
    label: f.label,
    value: f.value,
    type: f.type,
  }));
  const activeSampleFieldsFor = sampleFieldsFor || ((c: Record<string, unknown>) => defaultSampleFields(c, (fields ?? []) as any));

  const stageField = fields?.find((f) => f.id === "STAGE_ID");
  const resolveStage = (rawStage: unknown): string | null => {
    if (rawStage === undefined || rawStage === null || rawStage === "") return null;
    const str = String(rawStage);
    return stageField?.listValues?.find((lv) => lv.ID === str)?.VALUE || getDealStageDisplayLabel(str);
  };

  const handleExport = async () => {
    if (state.status !== "success") return;
    // Full report requires BOTH the company card and the related deals to have
    // succeeded — a deals loading/error state must never silently map to
    // "deals = []" and produce a full-looking report.
    if (dealsState.status !== "success") return;
    try {
      setIsExporting(true);
      const company = state.company;
      const companyTitle = String(company.TITLE || "").trim() || "Без названия";
      // Phase D: UI and Excel consume the SAME resolved model.
      const model = resolvedModel!;
      const companyFields = model.fields.map((f) => ({ id: f.id, label: f.label, value: f.value, type: f.type }));
      const sampleFields = activeSampleFieldsFor(company);
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

      const exportOptions = {
        companyTitle,
        companyId: id,
        companyFields,
        sampleFields,
        deals,
        // The full model rides along so the Excel builder renders
        // the exact same resolved fields (dates/comments) as the UI.
        companyModel: model,
      };

      if (onExport) {
        onExport(exportOptions);
      }
      await exportCompanyToExcel(exportOptions);
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

  return (
    <Sheet open onOpenChange={(open) => { if (!open) onClose(); }}>
      <SheetContent side="right" className="w-full sm:max-w-lg flex flex-col"
        onCloseAutoFocus={(event) => { if (onRestoreFocus) { event.preventDefault(); onRestoreFocus(); } }}>
        <SheetHeader>
          <SheetTitle className="pr-6 break-words">
            {state.status === "success" ? String(state.company.TITLE || "").trim() || "Без названия" : "Компания"}
          </SheetTitle>
          <SheetDescription>Просмотр компании · ID {id}</SheetDescription>
        </SheetHeader>
        <div className="min-h-0 flex-1 overflow-y-auto px-4" aria-live="polite" aria-busy={state.status === "loading"}>
          {state.status === "loading" && <div role="status" className="space-y-3">
            <span className="sr-only">Загрузка компании</span>
            <Skeleton className="h-5 w-3/4" /><Skeleton className="h-20 w-full" />
          </div>}
          {state.status === "error" && <div role="alert" className="space-y-3 text-sm">
            <p>{state.message}</p>
            {state.retry && <Button variant="outline" onClick={() => setAttempt((n) => n + 1)}>Повторить</Button>}
          </div>}
          {state.status === "success" && (
            <div className="space-y-6 pb-6">
              <dl className="space-y-4 text-sm">
                {cardFields.map((field) => (
                  <div key={field.id}>
                    <dt className="text-xs text-muted-foreground">{field.label}</dt>
                    <dd className="mt-1 whitespace-pre-wrap break-words">{formatPreviewValue(field.value, field.type === "boolean" || field.type === "char")}</dd>
                  </div>
                ))}
                {/* Date Created / Date Modified — retained per current-card
                    contract; rendered from the resolved model only when the
                    model does not already include the row. */}
                {resolvedModel?.createdAt && !cardFields.some((f) => f.id === "DATE_CREATE") && (
                  <div>
                    <dt className="text-xs text-muted-foreground">Дата создания</dt>
                    <dd className="mt-1 whitespace-pre-wrap break-words">{resolvedModel.createdAt}</dd>
                  </div>
                )}
                {resolvedModel?.modifiedAt && !cardFields.some((f) => f.id === "DATE_MODIFY") && (
                  <div>
                    <dt className="text-xs text-muted-foreground">Дата изменения</dt>
                    <dd className="mt-1 whitespace-pre-wrap break-words">{resolvedModel.modifiedAt}</dd>
                  </div>
                )}
                {/* General Company comments — retained per current-card contract */}
                {resolvedModel?.comments && !cardFields.some((f) => f.id === "COMMENTS") && (
                  <div>
                    <dt className="text-xs text-muted-foreground">Комментарий</dt>
                    <dd className="mt-1 whitespace-pre-wrap break-words">{resolvedModel.comments}</dd>
                  </div>
                )}
              </dl>

              {/* Образцы */}
              <div className="border-t pt-4">
                <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">
                  Образцы
                </h4>
                {sampleFieldsFor && (
                  <dl className="space-y-4 text-sm mb-4">
                    {activeSampleFieldsFor(state.company).map((field) => (
                      <div key={field.id}>
                        <dt className="text-xs text-muted-foreground">{field.label}</dt>
                        <dd className="mt-1 whitespace-pre-wrap break-words">{formatPreviewValue(field.value, field.type === "boolean" || field.type === "char")}</dd>
                      </div>
                    ))}
                  </dl>
                )}

                {/* Compact «Образцы» analytics block (Samples v1 cross-nav).
                    Lazy-fetched summary from the authoritative Samples API. */}
                <CompanySamplesSummary companyId={id} />
              </div>

              {/* Related Deals (Связанные сделки) */}
              <div className="border-t pt-4">
                <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">
                  Связанные сделки {dealsState.status === "success" ? `(${dealsState.deals.length})` : ""}
                </h4>

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
            </div>
          )}
        </div>
        <SheetFooter className="flex flex-col sm:flex-row gap-2 border-t pt-3">
          <Button
            type="button"
            variant="outline"
            onClick={handleExport}
            disabled={state.status !== "success" || dealsState.status !== "success" || isExporting}
            title={
              dealsState.status !== "success"
                ? "Полный отчёт недоступен: связанные сделки ещё загружаются или не удалось загрузить"
                : undefined
            }
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

/**
 * Compact «Образцы» analytics block inside Company Preview.
 * Fetches the single-company SampleSummary from the authoritative Samples
 * API (same aggregate as /samples) and links to /samples?company=<id>.
 * Lazy + non-fatal: failures collapse silently (fields above still show).
 */
function CompanySamplesSummary({ companyId }: { companyId: string }) {
  const [summary, setSummary] = useState<SampleSummary | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/bitrix/samples", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ companyId }),
          cache: "no-store",
        });
        if (cancelled) return;
        if (!res.ok) {
          setFailed(true);
          return;
        }
        const data = await res.json();
        if (cancelled) return;
        const first = Array.isArray(data.samples) ? data.samples[0] : null;
        setSummary(first && first.companyId === companyId ? first : null);
      } catch {
        if (!cancelled) setFailed(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [companyId]);

  if (failed) return null;

  return (
    <div className="mt-3 rounded-md border bg-muted/30 p-2.5 text-xs space-y-1.5">
      <div className="flex items-center gap-1.5 font-medium text-foreground/80">
        <FlaskConical className="h-3 w-3" />
        Сводка по образцам (аналитика)
      </div>
      {summary === null ? (
        <p className="text-muted-foreground">
          Структурированная активность по образцам в Bitrix24 не найдена
        </p>
      ) : (
        <>
          <div className="text-muted-foreground">
            Результат:{" "}
            <span className="text-foreground font-medium">
              {NORMALIZED_RESULT_LABELS[summary.normalizedResult] ?? summary.normalizedResult}
            </span>
            {summary.rawTestResult && (
              <span className="ml-1">· «{summary.rawTestResult}»</span>
            )}
          </div>
          {summary.sentDates.length > 0 && (
            <div className="text-muted-foreground">
              Даты передачи:{" "}
              <span className="text-foreground">{summary.sentDates.join(", ")}</span>
            </div>
          )}
          {summary.dataIssues.length > 0 && (
            <div className="text-amber-700 dark:text-amber-400">
              ⚠ {summary.dataIssues.length} замеч. по качеству данных
            </div>
          )}
        </>
      )}
      <Link
        href={`/samples?company=${encodeURIComponent(companyId)}`}
        className="inline-flex items-center gap-1 text-primary hover:underline"
      >
        Открыть в разделе «Образцы»
        <ArrowRight className="h-3 w-3" />
      </Link>
    </div>
  );
}

