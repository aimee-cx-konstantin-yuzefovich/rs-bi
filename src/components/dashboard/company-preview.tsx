"use client";

import { useEffect, useState } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription, SheetFooter } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Download, ExternalLink, Loader2 } from "lucide-react";
import { useDashboardStore } from "@/store/dashboard-store";
import { defaultCompanyFields, defaultSampleFields } from "@/lib/company-preview";
import { exportCompanyToExcel } from "@/lib/export-utils";

type PreviewState =
  | { status: "loading" }
  | { status: "error"; message: string; retry: boolean }
  | { status: "success"; company: Record<string, unknown>; bitrixUrl: string | null };

export interface CompanyPreviewProps {
  id: string;
  onClose: () => void;
  onRestoreFocus?: () => void;
  fieldsFor?: (company: Record<string, unknown>) => Array<{ id: string; label: string; value: string }>;
  sampleFieldsFor?: (company: Record<string, unknown>) => Array<{ id: string; label: string; value: string }>;
  onOpenDealPreview?: (dealId: string) => void;
  onExport?: (options: {
    companyTitle: string;
    companyId: string;
    companyFields: Array<{ id?: string; label: string; value: string }>;
    sampleFields: Array<{ id?: string; label: string; value: string }>;
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
  fieldsFor,
  sampleFieldsFor,
  onOpenDealPreview,
  onExport,
}: CompanyPreviewProps) {
  const [state, setState] = useState<PreviewState>({ status: "loading" });
  const [dealsState, setDealsState] = useState<
    | { status: "loading" }
    | { status: "success"; deals: Array<Record<string, unknown>> }
    | { status: "error"; message: string }
  >({ status: "loading" });
  const [attempt, setAttempt] = useState(0);
  const [isExporting, setIsExporting] = useState(false);

  const { userNames, fields } = useDashboardStore();

  const activeFieldsFor = fieldsFor || ((c: Record<string, unknown>) => defaultCompanyFields(c, userNames || {}));
  const activeSampleFieldsFor = sampleFieldsFor || ((c: Record<string, unknown>) => defaultSampleFields(c, fields || []));

  const stageField = fields?.find((f) => f.id === "STAGE_ID");
  const resolveStage = (rawStage: unknown): string | null => {
    if (rawStage === undefined || rawStage === null || rawStage === "") return null;
    const str = String(rawStage);
    return stageField?.listValues?.find((lv) => lv.ID === str)?.VALUE || str;
  };

  const handleExport = async () => {
    if (state.status !== "success") return;
    try {
      setIsExporting(true);
      const company = state.company;
      const companyTitle = String(company.TITLE || "").trim() || "Без названия";
      const companyFields = activeFieldsFor(company);
      const sampleFields = activeSampleFieldsFor(company);
      const deals =
        dealsState.status === "success"
          ? dealsState.deals.map((d) => {
              const rawOpp = d.OPPORTUNITY ?? d.opportunity;
              const opp =
                rawOpp !== null && rawOpp !== undefined && rawOpp !== ""
                  ? Number(rawOpp)
                  : null;
              return {
                id: String(d.ID || d.id || ""),
                title: String(d.TITLE || d.title || "").trim() || "Без названия",
                stage: resolveStage(d.STAGE_ID ?? d.stageId),
                opportunity: opp !== null && !isNaN(opp) ? opp : null,
                currency: String(d.CURRENCY_ID || d.currencyId || "RUB"),
              };
            })
          : [];

      const exportOptions = {
        companyTitle,
        companyId: id,
        companyFields,
        sampleFields,
        deals,
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
    setDealsState({ status: "loading" });

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
              : "Не удалось загрузить связанные сделки");
          setDealsState({ status: "error", message });
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
          setDealsState({ status: "success", deals: deduped });
        }
      } catch {
        if (!controller.signal.aborted) {
          setDealsState({ status: "error", message: "Не удалось загрузить связанные сделки" });
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
                {activeFieldsFor(state.company).map((field) => (
                  <div key={field.id}>
                    <dt className="text-xs text-muted-foreground">{field.label}</dt>
                    <dd className="mt-1 whitespace-pre-wrap break-words">{field.value}</dd>
                  </div>
                ))}
              </dl>

              {/* Образцы */}
              <div className="border-t pt-4">
                <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">
                  Образцы
                </h4>
                <dl className="space-y-4 text-sm">
                  {activeSampleFieldsFor(state.company).map((field) => (
                    <div key={field.id}>
                      <dt className="text-xs text-muted-foreground">{field.label}</dt>
                      <dd className="mt-1 whitespace-pre-wrap break-words">{field.value || "—"}</dd>
                    </div>
                  ))}
                </dl>
              </div>

              {/* Related Deals (Связанные сделки) */}
              <div className="border-t pt-4">
                <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">
                  Связанные сделки {dealsState.status === "success" ? `(${dealsState.deals.length})` : ""}
                </h4>

                {dealsState.status === "loading" && (
                  <div role="status" className="space-y-2">
                    <span className="sr-only">Загрузка связанных сделок</span>
                    <Skeleton className="h-9 w-full" />
                    <Skeleton className="h-9 w-full" />
                  </div>
                )}

                {dealsState.status === "error" && (
                  <p role="alert" className="text-xs text-destructive">
                    {dealsState.message}
                  </p>
                )}

                {dealsState.status === "success" && (
                  dealsState.deals.length === 0 ? (
                    <p className="text-xs text-muted-foreground">Нет связанных сделок</p>
                  ) : (
                    <div className="space-y-2">
                      {dealsState.deals.map((deal) => {
                        const dealId = String(deal.ID || deal.id);
                        const dealTitle = String(deal.TITLE || deal.title || "").trim() || "Без названия";
                        const stage = resolveStage(deal.STAGE_ID ?? deal.stageId);
                        const rawOpp = deal.OPPORTUNITY ?? deal.opportunity;
                        const opportunity =
                          rawOpp !== null && rawOpp !== undefined && rawOpp !== ""
                            ? Number(rawOpp)
                            : null;
                        const currency = String(deal.CURRENCY_ID || deal.currencyId || "RUB");
                        const dealBitrixUrl =
                          typeof deal.bitrixUrl === "string"
                            ? deal.bitrixUrl
                            : state.bitrixUrl
                            ? state.bitrixUrl.replace(
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
                              {opportunity !== null && !isNaN(opportunity) && (
                                <span className="font-mono tabular-nums text-muted-foreground whitespace-nowrap">
                                  {opportunity.toLocaleString("ru-RU", {
                                    minimumFractionDigits: 0,
                                    maximumFractionDigits: 2,
                                  })}{" "}
                                  {currency}
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
                  )
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
            disabled={state.status !== "success" || isExporting}
            className="border-brand-blue text-brand-blue hover:bg-brand-blue-light/50 hover:text-brand-blue dark:border-blue-400 dark:text-blue-400 dark:hover:bg-blue-950/40 gap-1.5 w-full sm:w-auto"
          >
            {isExporting ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Download className="h-4 w-4" />
            )}
            {isExporting ? "Экспорт…" : "Экспорт"}
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

