"use client";

import { useEffect, useState } from "react";
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
import { Building2, ExternalLink } from "lucide-react";
import { useDashboardStore } from "@/store/dashboard-store";

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

  const { userNames, fields, activitiesData } = useDashboardStore();

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

  const dealTitle =
    state.status === "success"
      ? String(state.deal.TITLE || "").trim() || "Без названия"
      : "Сделка";

  const renderFieldValue = (val: unknown): string => {
    if (val === null || val === undefined || val === "") return "—";
    if (typeof val === "object") {
      if (Array.isArray(val)) return val.join(", ");
      return JSON.stringify(val);
    }
    return String(val);
  };

  const formatDate = (isoStr: unknown): string => {
    if (!isoStr || typeof isoStr !== "string") return "";
    const d = new Date(isoStr);
    if (isNaN(d.getTime())) return String(isoStr);
    return d.toLocaleDateString("ru-RU", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
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

          {state.status === "success" && (
            <dl className="space-y-4 pb-6 text-sm divide-y divide-border/60">
              {/* Main Attributes */}
              <div className="pt-2 space-y-3">
                {/* Stage */}
                {state.deal.STAGE_ID ? (
                  <div>
                    <dt className="text-xs text-muted-foreground">Стадия</dt>
                    <dd className="mt-1">
                      <Badge variant="outline" className="text-xs font-normal">
                        {String(state.deal.STAGE_ID)}
                      </Badge>
                    </dd>
                  </div>
                ) : null}

                {/* Amount / Currency */}
                {state.deal.OPPORTUNITY !== undefined &&
                state.deal.OPPORTUNITY !== null &&
                state.deal.OPPORTUNITY !== "" ? (
                  <div>
                    <dt className="text-xs text-muted-foreground">Сумма</dt>
                    <dd className="mt-1 font-mono text-sm font-semibold tabular-nums">
                      {Number(state.deal.OPPORTUNITY).toLocaleString("ru-RU", {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2,
                      })}{" "}
                      <span className="text-muted-foreground text-xs font-normal">
                        {String(state.deal.CURRENCY_ID || "RUB")}
                      </span>
                    </dd>
                  </div>
                ) : null}

                {/* Responsible */}
                <div>
                  <dt className="text-xs text-muted-foreground">Ответственный</dt>
                  <dd className="mt-1 font-medium">
                    {state.deal.ASSIGNED_BY_ID
                      ? userNames[String(state.deal.ASSIGNED_BY_ID)] || "Неизвестный сотрудник"
                      : "—"}
                  </dd>
                </div>

                {/* Company Link / Invariant */}
                <div>
                  <dt className="text-xs text-muted-foreground">Компания</dt>
                  <dd className="mt-1">
                    {state.deal.COMPANY_ID ? (
                      <div className="flex flex-col gap-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          {onOpenCompanyPreview ? (
                            <button
                              type="button"
                              data-company-link={state.deal.COMPANY_ID}
                              onClick={() =>
                                onOpenCompanyPreview(String(state.deal.COMPANY_ID))
                              }
                              className="font-medium text-primary hover:underline flex items-center gap-1.5 text-left"
                            >
                              <Building2 className="h-3.5 w-3.5 shrink-0" />
                              <span className="break-words">
                                {String(state.deal.COMPANY_TITLE || "Без названия")}
                              </span>
                            </button>
                          ) : (
                            <span className="font-medium flex items-center gap-1.5">
                              <Building2 className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                              <span className="break-words">
                                {String(state.deal.COMPANY_TITLE || "Без названия")}
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
                      </div>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </dd>
                </div>
              </div>

              {/* Dates */}
              <div className="pt-3 space-y-2">
                {state.deal.DATE_CREATE ? (
                  <div>
                    <dt className="text-xs text-muted-foreground">Дата создания</dt>
                    <dd className="mt-0.5 text-xs tabular-nums text-muted-foreground">
                      {formatDate(state.deal.DATE_CREATE)}
                    </dd>
                  </div>
                ) : null}
                {state.deal.DATE_MODIFY ? (
                  <div>
                    <dt className="text-xs text-muted-foreground">Дата изменения</dt>
                    <dd className="mt-0.5 text-xs tabular-nums text-muted-foreground">
                      {formatDate(state.deal.DATE_MODIFY)}
                    </dd>
                  </div>
                ) : null}
                {state.deal.BEGINDATE ? (
                  <div>
                    <dt className="text-xs text-muted-foreground">Дата начала</dt>
                    <dd className="mt-0.5 text-xs tabular-nums text-muted-foreground">
                      {formatDate(state.deal.BEGINDATE)}
                    </dd>
                  </div>
                ) : null}
                {state.deal.CLOSEDATE ? (
                  <div>
                    <dt className="text-xs text-muted-foreground">Дата завершения</dt>
                    <dd className="mt-0.5 text-xs tabular-nums text-muted-foreground">
                      {formatDate(state.deal.CLOSEDATE)}
                    </dd>
                  </div>
                ) : null}
              </div>

              {/* Activities if available */}
              {activitiesData[id] && (
                <div className="pt-3 space-y-2">
                  {activitiesData[id].last && (
                    <div>
                      <dt className="text-xs text-muted-foreground">Последняя активность</dt>
                      <dd className="mt-0.5 text-xs">
                        {activitiesData[id].last.SUBJECT}
                      </dd>
                    </div>
                  )}
                  {activitiesData[id].next && (
                    <div>
                      <dt className="text-xs text-muted-foreground">Следующая активность</dt>
                      <dd className="mt-0.5 text-xs">
                        {activitiesData[id].next.SUBJECT}
                      </dd>
                    </div>
                  )}
                </div>
              )}

              {/* Custom UF Fields */}
              {(() => {
                const ufEntries = Object.entries(state.deal).filter(
                  ([k, v]) => k.startsWith("UF_CRM_") && v !== null && v !== "" && v !== undefined
                );
                if (ufEntries.length === 0) return null;
                const fieldMap = new Map(fields.map((f) => [f.id, f]));
                return (
                  <div className="pt-3 space-y-3">
                    <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                      Дополнительные поля
                    </h4>
                    {ufEntries.map(([ufKey, ufVal]) => {
                      const fieldMeta = fieldMap.get(ufKey);
                      const label = fieldMeta?.title || ufKey;
                      return (
                        <div key={ufKey}>
                          <dt className="text-xs text-muted-foreground">{label}</dt>
                          <dd className="mt-1 whitespace-pre-wrap break-words text-xs">
                            {renderFieldValue(ufVal)}
                          </dd>
                        </div>
                      );
                    })}
                  </div>
                );
              })()}

              {/* Comments */}
              {state.deal.COMMENTS ? (
                <div className="pt-3">
                  <dt className="text-xs text-muted-foreground">Комментарий</dt>
                  <dd className="mt-1 whitespace-pre-wrap break-words text-xs text-muted-foreground">
                    {String(state.deal.COMMENTS)}
                  </dd>
                </div>
              ) : null}
            </dl>
          )}
        </div>

        <SheetFooter className="border-t pt-3">
          {state.status === "success" && state.bitrixUrl ? (
            <Button asChild className="w-full sm:w-auto">
              <a href={state.bitrixUrl} target="_blank" rel="noopener noreferrer">
                Открыть сделку в Bitrix24
              </a>
            </Button>
          ) : (
            <Button disabled className="w-full sm:w-auto">
              Открыть сделку в Bitrix24
            </Button>
          )}
          {state.status === "success" && !state.bitrixUrl && (
            <p className="text-xs text-muted-foreground">
              Ссылка на портал Bitrix24 не настроена.
            </p>
          )}
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
