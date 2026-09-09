"use client";

import { useEffect, useState } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription, SheetFooter } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ExternalLink } from "lucide-react";
import { useDashboardStore } from "@/store/dashboard-store";
import { defaultCompanyFields } from "@/lib/company-preview";

type PreviewState =
  | { status: "loading" }
  | { status: "error"; message: string; retry: boolean }
  | { status: "success"; company: Record<string, unknown>; bitrixUrl: string | null };

export interface CompanyPreviewProps {
  id: string;
  onClose: () => void;
  onRestoreFocus?: () => void;
  fieldsFor?: (company: Record<string, unknown>) => Array<{ id: string; label: string; value: string }>;
  onOpenDealPreview?: (dealId: string) => void;
}

export function CompanyPreview({
  id,
  onClose,
  onRestoreFocus,
  fieldsFor,
  onOpenDealPreview,
}: CompanyPreviewProps) {
  const [state, setState] = useState<PreviewState>({ status: "loading" });
  const [attempt, setAttempt] = useState(0);

  const { allDeals, userNames } = useDashboardStore();
  const relatedDeals = (allDeals || []).filter((d) => String(d.COMPANY_ID || "") === String(id));

  const activeFieldsFor = fieldsFor || ((c: Record<string, unknown>) => defaultCompanyFields(c, userNames || {}));

  useEffect(() => {
    const controller = new AbortController();
    setState({ status: "loading" });
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
    void load();
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

              {/* Related Deals (Связанные сделки) */}
              <div className="border-t pt-4">
                <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">
                  Связанные сделки ({relatedDeals.length})
                </h4>
                {relatedDeals.length === 0 ? (
                  <p className="text-xs text-muted-foreground">Нет связанных сделок</p>
                ) : (
                  <div className="space-y-2">
                    {relatedDeals.map((deal) => {
                      const dealId = String(deal.ID || deal.id);
                      const dealTitle = String(deal.TITLE || "").trim() || "Без названия";
                      const stage = deal.STAGE_ID ? String(deal.STAGE_ID) : null;
                      const opportunity = deal.OPPORTUNITY ? Number(deal.OPPORTUNITY) : null;
                      const currency = String(deal.CURRENCY_ID || "RUB");
                      const dealBitrixUrl = state.bitrixUrl
                        ? state.bitrixUrl.replace(/\/crm\/company\/details\/\d+\/?/, `/crm/deal/details/${dealId}/`)
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
                )}
              </div>
            </div>
          )}
        </div>
        <SheetFooter>
          {state.status === "success" && state.bitrixUrl ? (
            <Button asChild><a href={state.bitrixUrl} target="_blank" rel="noopener noreferrer">Открыть карточку в Bitrix24</a></Button>
          ) : <Button disabled>Открыть карточку в Bitrix24</Button>}
          {state.status === "success" && !state.bitrixUrl && <p className="text-xs text-muted-foreground">
            Ссылка на портал Bitrix24 не настроена.
          </p>}
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}

