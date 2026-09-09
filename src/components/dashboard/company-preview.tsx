"use client";

import { useEffect, useState } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription, SheetFooter } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

type PreviewState =
  | { status: "loading" }
  | { status: "error"; message: string; retry: boolean }
  | { status: "success"; company: Record<string, unknown>; bitrixUrl: string | null };

export function CompanyPreview({ id, onClose, onRestoreFocus, fieldsFor }: {
  id: string;
  onClose: () => void;
  onRestoreFocus?: () => void;
  fieldsFor: (company: Record<string, unknown>) => Array<{ id: string; label: string; value: string }>;
}) {
  const [state, setState] = useState<PreviewState>({ status: "loading" });
  const [attempt, setAttempt] = useState(0);
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
      <SheetContent side="right" className="w-full sm:max-w-lg"
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
          {state.status === "success" && <dl className="space-y-4 pb-4 text-sm">
            {fieldsFor(state.company).map((field) => <div key={field.id}>
              <dt className="text-xs text-muted-foreground">{field.label}</dt>
              <dd className="mt-1 whitespace-pre-wrap break-words">{field.value}</dd>
            </div>)}
          </dl>}
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
