"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetFooter,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Building2, Download, ExternalLink, FlaskConical, Loader2 } from "lucide-react";
import { useDashboardStore } from "@/store/dashboard-store";
import { buildDealPreviewModel, buildDealActivitiesModel } from "@/lib/deal-preview";
import { exportDealToExcel } from "@/lib/export-utils";
import { useSmartProcessData } from "@/components/dashboard/samples/use-smart-process-data";
import { SmartProcessItemCard } from "@/components/dashboard/samples/smart-process-item-card";
import { PreviewSectionHeading } from "@/components/dashboard/preview-primitives";
import {
  DEAL_SAMPLE_SENT_DATE_FIELD_ID,
  DEAL_SAMPLE_TRANSFER_FIELD_ID,
} from "@/lib/crm-constants";

type PreviewState =
  | { status: "loading" }
  | { status: "error"; message: string; retry: boolean }
  | {
      status: "success";
      deal: Record<string, unknown>;
      bitrixUrl: string | null;
      companyBitrixUrl: string | null;
    };

export interface DealPreviewProps {
  id: string;
  onClose: () => void;
  onRestoreFocus?: () => void;
  onOpenCompanyPreview?: (companyId: string) => void;
}

export function DealPreview({
  id,
  onClose,
  onRestoreFocus,
  onOpenCompanyPreview,
}: DealPreviewProps) {
  const [state, setState] = useState<PreviewState>({ status: "loading" });
  const [attempt, setAttempt] = useState(0);
  const [isExporting, setIsExporting] = useState(false);

  const { userNames, fields, activitiesData, usersCoverage, dealTypeRegistry, fetchDealActivities } = useDashboardStore();
  useEffect(() => {
    const controller = new AbortController();
    setState({ status: "loading" });

    async function load() {
      try {
        const response = await fetch(`/api/bitrix/deals/${encodeURIComponent(id)}`, {
          signal: controller.signal,
          cache: "no-store",
        });

        if (controller.signal.aborted) return;

        if (!response.ok) {
          setState({
            status: "error",
            retry: ![401, 403, 404].includes(response.status),
            message:
              response.status === 404
                ? "Сделка не найдена"
                : response.status === 403
                ? "Нет доступа к сделке"
                : response.status === 401
                ? "Требуется авторизация"
                : "Не удалось загрузить сделку. Попробуйте ещё раз.",
          });
          return;
        }

        const data = await response.json();
        if (!data.success || !data.deal || String(data.deal.ID) !== id) {
          throw new Error("Invalid preview");
        }

        if (!controller.signal.aborted) {
          setState({
            status: "success",
            deal: data.deal,
            bitrixUrl: data.bitrixUrl,
            companyBitrixUrl: data.companyBitrixUrl,
          });
        }
      } catch {
        if (!controller.signal.aborted) {
          setState({
            status: "error",
            retry: true,
            message: "Не удалось загрузить сделку. Попробуйте ещё раз.",
          });
        }
      }
    }

    void load();
    return () => controller.abort();
  }, [id, attempt]);

  const model =
    state.status === "success"
      ? buildDealPreviewModel(state.deal, {
          fields,
          dealTypeRegistry,
          userNames: userNames || {},
          usersCoverage,
          activity: activitiesData[id]?.last,
          lastTouchTimestamp: null,
          bitrixUrl: state.bitrixUrl,
          companyBitrixUrl: state.companyBitrixUrl,
        })
      : null;

  // ── Data-aware Samples navigation (WP6) ──
  // VISIBLE ACTION = REAL DESTINATION EXISTS. The «Образцы компании» link
  // renders ONLY when canonical Samples data provably exists for the
  // deal's company — from the already-loaded shared Smart Process session
  // cache (exact deal/company attribution) or the deal's OWN real legacy
  // sample evidence (sent date / transfer status). The marker-only testing
  // field (see crm-constants) never qualifies. No per-render/per-click
  // Bitrix calls, no N+1: everything reads in-memory canonical state.
  // While existence is unknown (SP cache still loading AND no deal-level
  // evidence) no clickable link is exposed.
  const sp = useSmartProcessData();
  const dealRaw: Record<string, unknown> | null =
    state.status === "success" ? state.deal : null;
  const hasDealLegacySampleEvidence = (() => {
    if (!dealRaw) return false;
    const rawSent = dealRaw[DEAL_SAMPLE_SENT_DATE_FIELD_ID];
    const sentDates = Array.isArray(rawSent) ? rawSent : [rawSent];
    const hasSentDate = sentDates.some(
      (v) => v !== null && v !== undefined && String(v).trim() !== ""
    );
    if (hasSentDate) return true;
    const rawTransfer = dealRaw[DEAL_SAMPLE_TRANSFER_FIELD_ID];
    const transferValues = Array.isArray(rawTransfer) ? rawTransfer : [rawTransfer];
    return transferValues.some(
      (v) => v !== null && v !== undefined && String(v).trim() !== ""
    );
  })();

  const canOpenCompanySamples = (() => {
    if (!model?.companyId) return false;
    // Canonical Smart Process evidence: exact linkedDealId or company relation.
    const spForDeal = sp.byDealId[String(id)] ?? [];
    const spForCompany = sp.byCompanyId[model.companyId] ?? [];
    if (spForDeal.length > 0 || spForCompany.length > 0) return true;
    // Legacy evidence from the deal itself.
    if (hasDealLegacySampleEvidence) return true;
    // Existence still unknown → no link yet (never a dead link).
    return false;
  })();

  // Scoped lazy activities fetch: DealPreview is the SINGLE owner of the
  // fetch lifecycle — when the drawer opens (or an explicit retry is
  // requested) it fetches just this deal, independent of selected columns.
  // The section renders state and invokes retry callbacks only.
  const [activitiesRetrySeq, setActivitiesRetrySeq] = useState(0);
  useEffect(() => {
    if (state.status !== "success" || !fetchDealActivities) return;
    void fetchDealActivities(id, activitiesRetrySeq > 0 ? { force: true } : undefined);
  }, [state.status, id, activitiesRetrySeq, fetchDealActivities]);

  const dealTitle = model ? model.dealTitle : "Сделка";

  const handleExport = async () => {
    if (state.status !== "success" || !model) return;
    try {
      setIsExporting(true);
      await exportDealToExcel({
        deal: state.deal,
        fields,
        userNames: userNames || {},
        usersCoverage,
        activity: activitiesData[id]?.last,
        dealModel: model,
        dealActivities: activitiesData[id]?.all,
      });
    } catch (err) {
      console.error("Failed to export deal to Excel", err);
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <Sheet open onOpenChange={(open) => { if (!open) onClose(); }}>
      <SheetContent
        side="right"
        className="w-full sm:max-w-lg flex flex-col"
        onCloseAutoFocus={(event) => {
          if (onRestoreFocus) {
            event.preventDefault();
            onRestoreFocus();
          }
        }}
      >
        <SheetHeader>
          <SheetTitle className="pr-6 break-words text-base leading-snug">
            {dealTitle}
          </SheetTitle>
          <SheetDescription>Просмотр сделки · ID {id}</SheetDescription>
        </SheetHeader>

        <div
          className="min-h-0 flex-1 overflow-y-auto px-4"
          aria-live="polite"
          aria-busy={state.status === "loading"}
        >
          {state.status === "loading" && (
            <div role="status" className="space-y-4 pt-2">
              <span className="sr-only">Загрузка сделки</span>
              <Skeleton className="h-5 w-3/4" />
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-24 w-full" />
              <Skeleton className="h-20 w-full" />
            </div>
          )}

          {state.status === "error" && (
            <div role="alert" className="space-y-3 pt-4 text-sm">
              <p className="text-destructive">{state.message}</p>
              {state.retry && (
                <Button variant="outline" onClick={() => setAttempt((n) => n + 1)}>
                  Повторить
                </Button>
              )}
            </div>
          )}

          {state.status === "success" && model && (
            <dl className="space-y-4 pb-6 text-sm divide-y divide-border/60">
              {/* MAIN Attributes (1 to 4) */}
              <div className="pt-2 space-y-3">
                {/* 1. Стадия */}
                <div>
                  <dt className="text-xs text-muted-foreground">Стадия</dt>
                  <dd className="mt-1">
                    <Badge variant="outline" className="text-xs font-normal">
                      {model.mainFields[0].value}
                    </Badge>
                  </dd>
                </div>

                {/* 2. Сумма */}
                <div>
                  <dt className="text-xs text-muted-foreground">Сумма</dt>
                  <dd className="mt-1 font-mono text-sm font-semibold tabular-nums">
                    {model.mainFields[1].formattedAmount !== undefined && model.mainFields[1].formattedAmount !== "–" ? (
                      <>
                        {model.mainFields[1].formattedAmount}{" "}
                        <span className="text-muted-foreground text-xs font-normal">
                          {model.mainFields[1].currencyLabel}
                        </span>
                      </>
                    ) : (
                      model.mainFields[1].value
                    )}
                  </dd>
                </div>

                {/* 3. Ответственный */}
                <div>
                  <dt className="text-xs text-muted-foreground">Ответственный</dt>
                  <dd className="mt-1 font-medium">
                    {model.mainFields[2].value}
                  </dd>
                </div>

                {/* 4. Компания */}
                <div>
                  <dt className="text-xs text-muted-foreground">Компания</dt>
                  <dd className="mt-1">
                    {model.companyId ? (
                      <div className="flex flex-col gap-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          {onOpenCompanyPreview ? (
                            <button
                              type="button"
                              data-company-link={model.companyId}
                              onClick={() => onOpenCompanyPreview(model.companyId)}
                              className="font-medium text-primary hover:underline flex items-center gap-1.5 text-left"
                            >
                              <Building2 className="h-3.5 w-3.5 shrink-0" />
                              <span className="break-words">
                                {model.companyTitle}
                              </span>
                            </button>
                          ) : (
                            <span className="font-medium flex items-center gap-1.5">
                              <Building2 className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                              <span className="break-words">
                                {model.companyTitle}
                              </span>
                            </span>
                          )}
                        </div>
                        {state.companyBitrixUrl && (
                          <a
                            href={state.companyBitrixUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-xs text-muted-foreground hover:underline inline-flex items-center gap-1"
                          >
                            Открыть компанию в Bitrix24
                            <ExternalLink className="h-3 w-3" />
                          </a>
                        )}
                        {canOpenCompanySamples && (
                          <Link
                            href={`/samples?company=${encodeURIComponent(model.companyId)}`}
                            className="text-xs text-primary hover:underline inline-flex items-center gap-1"
                            data-samples-link
                          >
                            <FlaskConical className="h-3 w-3" />
                            Образцы компании в разделе «Образцы»
                          </Link>
                        )}
                      </div>
                    ) : (
                      <span className="text-muted-foreground">–</span>
                    )}
                  </dd>
                </div>
              </div>

              {/* TIMELINE Attributes */}
              <div className="pt-3 space-y-2">
                {model.timelineFields.map((field) => (
                  <div key={field.id}>
                    <dt className="text-xs text-muted-foreground">{field.label}</dt>
                    <dd className="mt-0.5 text-xs tabular-nums text-muted-foreground">
                      {field.value}
                    </dd>
                  </div>
                ))}
              </div>

              {/* ACTIVITY Attribute (7) — omitted entirely when no meaningful
                  SUBJECT exists; never duplicates the last-touch date. */}
              {model.activityField && (
                <div className="pt-3 space-y-2">
                  <div>
                    <dt className="text-xs text-muted-foreground">Последняя активность</dt>
                    <dd className="mt-0.5 text-xs">
                      {model.activityField.value}
                    </dd>
                  </div>
                </div>
              )}

              {/* Дела и активности */}
              <DealActivitiesSection dealId={id} onRetry={() => setActivitiesRetrySeq((n) => n + 1)} />

              {/* Тестирование образцов — canonical Smart Process items with
                  exact linkedDealId === currentDealId */}
              <DealSmartProcessSection dealId={id} onOpenCompanyPreview={onOpenCompanyPreview} />

              {/* CURRENT DEAL CARD FIELDS (8 to 16) */}
              <div className="pt-3 space-y-3">
                {model.cardFields.map((field) => (
                  <div key={field.id}>
                    <dt className="text-xs text-muted-foreground">{field.label}</dt>
                    <dd className="mt-1 whitespace-pre-wrap break-words text-xs">
                      {field.value}
                    </dd>
                  </div>
                ))}
              </div>
            </dl>
          )}
        </div>

        <SheetFooter className="border-t pt-3 flex flex-col sm:flex-row gap-2">
          <Button
            variant="outline"
            onClick={handleExport}
            disabled={isExporting || state.status !== "success"}
            className="w-full sm:w-auto"
          >
            {isExporting ? (
              <Loader2 className="h-4 w-4 animate-spin mr-2" />
            ) : (
              <Download className="h-4 w-4 mr-2" />
            )}
            Экспорт
          </Button>

          {state.status === "success" && state.bitrixUrl ? (
            <Button asChild className="w-full sm:w-auto">
              <a href={state.bitrixUrl} target="_blank" rel="noopener noreferrer">
                Открыть сделку в Bitrix24
                <ExternalLink className="h-3 w-3 ml-1.5" />
              </a>
            </Button>
          ) : (
            <Button disabled className="w-full sm:w-auto">
              Открыть сделку в Bitrix24
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

type ActivityEntry = {
  ID?: string;
  SUBJECT?: string | null;
  COMPLETED?: string | null;
  DEADLINE?: string | null;
  CREATED?: string | null;
  DESCRIPTION?: string | null;
  TYPE_ID?: string | number | null;
  PROVIDER_ID?: string | null;
  RESPONSIBLE_ID?: string | number | null;
};

/**
 * «Дела и активности» section inside Deal Preview.
 * Presentational only: DealPreview owns the scoped fetch lifecycle; this
 * section renders state from the explicit per-deal request state and invokes
 * the retry callback. Distinguishes truthful states:
 * - loaded with items → ordered list (planned first by nearest deadline, then completed newest first);
 * - no activities → «Активностей нет» (a successful empty result is truthful);
 * - temporarily unavailable → retryable message;
 * - failed refresh with preserved valid data → previous rows stay rendered
 *   under a compact non-blocking stale-data warning («Показаны ранее
 *   загруженные данные. Обновление не удалось.» + «Повторить») so cached
 *   data is never mistaken for freshly refreshed current data.
 * Raw TYPE_ID / PROVIDER_ID tokens never render; unknown types → «Дело».
 */
function DealActivitiesSection({ dealId, onRetry }: { dealId: string; onRetry: () => void }) {
  const { activitiesData, activitiesRequestState, activitiesDataLoading, usersCoverage, userNames } =
    useDashboardStore();
  const requestState = activitiesRequestState?.[dealId] ?? "idle";
  const entry: { all?: ActivityEntry[] } | undefined = activitiesData?.[dealId];

  // Loading: scoped request in flight (or not yet started, and no cached data).
  if (requestState === "loading" || (requestState === "idle" && (activitiesDataLoading || !entry))) {
    return (
      <div className="pt-3 space-y-2 border-t border-border/60" data-activities-section>
        <PreviewSectionHeading>
          Дела и активности
        </PreviewSectionHeading>
        <div role="status" className="space-y-2">
          <span className="sr-only">Загрузка дел и активностей</span>
          <Skeleton className="h-6 w-full" />
          <Skeleton className="h-6 w-3/4" />
        </div>
      </div>
    );
  }

  // Error: scoped fetch for this deal failed. Previous valid data stays
  // rendered when present; otherwise the truthful unavailable state.
  if (requestState === "error" && !entry) {
    return (
      <div className="pt-3 space-y-2 border-t border-border/60" data-activities-section>
        <PreviewSectionHeading>
          Дела и активности
        </PreviewSectionHeading>
        <div role="alert" className="space-y-2 text-xs">
          <p className="text-muted-foreground">Дела и активности временно недоступны.</p>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-7 text-xs"
            onClick={onRetry}
            data-activities-retry
          >
            Повторить
          </Button>
        </div>
      </div>
    );
  }

  // No entry of any kind without an error → keep the unavailable disclosure
  // (fail-closed: absence of a marked-successful response is never "empty").
  if (!entry) {
    return (
      <div className="pt-3 space-y-2 border-t border-border/60" data-activities-section>
        <PreviewSectionHeading>
          Дела и активности
        </PreviewSectionHeading>
        <div role="alert" className="space-y-2 text-xs">
          <p className="text-muted-foreground">Дела и активности временно недоступны.</p>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-7 text-xs"
            onClick={onRetry}
            data-activities-retry
          >
            Повторить
          </Button>
        </div>
      </div>
    );
  }

  const items = buildDealActivitiesModel((entry?.all ?? []) as ActivityEntry[], {
    userNames: userNames || {},
    usersCoverage,
  });

  const staleRefresh = requestState === "error";

  if (items.length === 0) {
    return (
      <div className="pt-3 space-y-2 border-t border-border/60" data-activities-section>
        <PreviewSectionHeading>
          Дела и активности
        </PreviewSectionHeading>
        {staleRefresh && (
          <div
            role="note"
            data-activities-stale-warning
            className="flex items-center gap-2 flex-wrap rounded-md border border-destructive/40 bg-destructive/10 px-2 py-1.5 text-xs text-destructive"
          >
            <span className="break-words">
              Показаны ранее загруженные данные. Обновление не удалось.
            </span>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-7 text-xs"
              onClick={onRetry}
              data-activities-retry
            >
              Повторить
            </Button>
          </div>
        )}
        <p className="text-xs text-muted-foreground" data-activities-empty>
          Активностей нет
        </p>
      </div>
    );
  }

  return (
    <div className="pt-3 space-y-2 border-t border-border/60" data-activities-section>
      <PreviewSectionHeading>
        Дела и активности
      </PreviewSectionHeading>
      {staleRefresh && (
        <div
          role="note"
          data-activities-stale-warning
          className="flex items-center gap-2 flex-wrap rounded-md border border-destructive/40 bg-destructive/10 px-2 py-1.5 text-xs text-destructive"
        >
          <span className="break-words">
            Показаны ранее загруженные данные. Обновление не удалось.
          </span>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-7 text-xs"
            onClick={onRetry}
            data-activities-retry
          >
            Повторить
          </Button>
        </div>
      )}
      <ul className="space-y-2" data-activities-list>
        {items.map((item, idx) => (
          <li
            key={item.id || `activity-${idx}`}
            className="rounded-md border bg-muted/20 p-2 text-xs space-y-1"
            data-activity-item
          >
            <div className="flex items-center gap-1.5 flex-wrap">
              <Badge variant="outline" className="text-[10px] font-normal">
                {item.status}
              </Badge>
              <Badge variant="secondary" className="text-[10px] font-normal">
                {item.type}
              </Badge>
              {item.date && (
                <span className="ml-auto tabular-nums text-muted-foreground text-[11px]">
                  {item.date}
                </span>
              )}
            </div>
            {item.subject && <div className="font-medium break-words">{item.subject}</div>}
            {item.description && (
              <div className="text-muted-foreground break-words">{item.description}</div>
            )}
            {item.responsible && (
              <div className="text-muted-foreground text-[11px]">
                Ответственный: {item.responsible}
              </div>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * «Тестирование образцов» section inside Deal Preview.
 * Renders ALL canonical Smart Process item views with exact
 * `linkedDealId === currentDealId` — active first, terminal later (the
 * canonical ordering). The fetch owner is the shared session cache hook
 * (`useSmartProcessData`): concurrent consumers coalesce into ONE bulk
 * request; retry performs a real request; no duplicate request effects.
 *
 * Truthful states:
 * - successful empty → «Процессы тестирования не найдены»;
 * - initial failure → explicit unavailable + retry;
 * - failed refresh with a preserved snapshot → previous rows stay rendered
 *   under a compact stale-data disclosure with retry (mirrors activities).
 */
function DealSmartProcessSection({
  dealId,
  onOpenCompanyPreview,
}: {
  dealId: string;
  onOpenCompanyPreview?: (companyId: string) => void;
}) {
  const sp = useSmartProcessData();
  const allDeals = useDashboardStore((s) => s.allDeals);

  // Exact attribution only: parentId2 === dealId (index from the canonical view).
  const items = sp.byDealId[String(dealId)] ?? [];
  const hasLoadedData = sp.dataState === "ready" || sp.dataState === "refresh_failed";

  const dealTitleById = new Map(
    Array.isArray(allDeals)
      ? allDeals.map((d: Record<string, unknown>) => [
          String(d.ID ?? d.id ?? ""),
          String(d.TITLE ?? "").trim(),
        ])
      : []
  );

  if (sp.dataState === "failed" && !hasLoadedData) {
    return (
      <div className="pt-3 space-y-2 border-t border-border/60" data-sp-section>
        <PreviewSectionHeading>
          Тестирование образцов
        </PreviewSectionHeading>
        <div role="alert" className="space-y-2 text-xs">
          <p className="text-muted-foreground">
            Процессы тестирования временно недоступны.
          </p>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-7 text-xs"
            onClick={sp.reload}
            data-sp-retry
          >
            Повторить
          </Button>
        </div>
      </div>
    );
  }

  if (sp.dataState === "loading" && !hasLoadedData) {
    return (
      <div className="pt-3 space-y-2 border-t border-border/60" data-sp-section>
        <PreviewSectionHeading>
          Тестирование образцов
        </PreviewSectionHeading>
        <div role="status" className="space-y-2">
          <span className="sr-only">Загрузка процессов тестирования</span>
          <Skeleton className="h-6 w-full" />
          <Skeleton className="h-6 w-3/4" />
        </div>
      </div>
    );
  }

  const staleRefresh = sp.dataState === "refresh_failed";

  return (
    <div className="pt-3 space-y-2 border-t border-border/60" data-sp-section>
      <PreviewSectionHeading>
        Тестирование образцов
      </PreviewSectionHeading>
      {staleRefresh && (
        <div
          role="note"
          data-sp-stale-warning
          className="flex items-center gap-2 flex-wrap rounded-md border border-destructive/40 bg-destructive/10 px-2 py-1.5 text-xs text-destructive"
        >
          <span className="break-words">
            Показаны ранее загруженные данные. Обновление не удалось.
          </span>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-7 text-xs"
            onClick={sp.reload}
            data-sp-retry
          >
            Повторить
          </Button>
        </div>
      )}
      {items.length === 0 ? (
        <p className="text-xs text-muted-foreground" data-sp-empty>
          Процессы тестирования не найдены
        </p>
      ) : (
        <ul className="space-y-2" data-sp-list>
          {items.map((view) => (
            <SmartProcessItemCard
              key={view.processItemId}
              view={view}
              dealTitle={dealTitleById.get(view.linkedDealId ?? "")}
              dataTestId="sp-item-card"
            />
          ))}
        </ul>
      )}
      {sp.refreshing && !staleRefresh && (
        <div className="text-[10px] text-muted-foreground" role="status">
          Обновление данных…
        </div>
      )}
    </div>
  );
}
