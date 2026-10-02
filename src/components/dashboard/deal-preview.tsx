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
import { buildDealPreviewModel } from "@/lib/deal-preview";
import { exportDealToExcel } from "@/lib/export-utils";

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

  const { userNames, fields, activitiesData, usersCoverage, dealTypeRegistry } = useDashboardStore();

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
          <SheetTitle className="pr-6 break-words text-lg">
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
                        <Link
                          href={`/samples?company=${encodeURIComponent(model.companyId)}`}
                          className="text-xs text-primary hover:underline inline-flex items-center gap-1"
                          data-samples-link
                        >
                          <FlaskConical className="h-3 w-3" />
                          Образцы компании в разделе «Образцы»
                        </Link>
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

              {/* ACTIVITY Attribute (7) */}
              <div className="pt-3 space-y-2">
                <div>
                  <dt className="text-xs text-muted-foreground">Последняя активность</dt>
                  <dd className="mt-0.5 text-xs">
                    {model.activityField.value}
                  </dd>
                </div>
              </div>

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
