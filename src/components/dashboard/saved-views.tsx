"use client";

import { useState, useRef, useEffect } from "react";
import { Bookmark, Trash2, Save, Check } from "lucide-react";
import { useDashboardStore } from "@/store/dashboard-store";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { pluralRu } from "@/lib/i18n";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

function formatRelativeDate(timestamp: number): string {
  const now = Date.now();
  const diffMs = now - timestamp;
  const diffMinutes = Math.floor(diffMs / (1000 * 60));
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffMinutes < 1) return "только что";
  if (diffMinutes < 60) return `${diffMinutes} мин. назад`;
  if (diffHours < 24) {
    return `${diffHours} ${pluralRu(diffHours, ["час", "часа", "часов"])} назад`;
  }
  return `${diffDays} ${pluralRu(diffDays, ["день", "дня", "дней"])} назад`;
}

export function SavedViews() {
  const savedViews = useDashboardStore((s) => s.savedViews || []);
  const saveView = useDashboardStore((s) => s.saveView);
  const loadSavedView = useDashboardStore((s) => s.loadSavedView);
  const deleteSavedView = useDashboardStore((s) => s.deleteSavedView);

  const [open, setOpen] = useState(false);
  const [viewName, setViewName] = useState("");
  const [feedbackMessage, setFeedbackMessage] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const feedbackTimerRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    return () => {
      if (feedbackTimerRef.current) clearTimeout(feedbackTimerRef.current);
    };
  }, []);

  const handleSaveSubmit = () => {
    let name = viewName.trim();
    if (!name) {
      const now = new Date();
      const timeStr = now.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });
      name = `Вид #${savedViews.length + 1} (${timeStr})`;
    }
    saveView(name);
    setViewName("");
    setFeedbackMessage(`Вид «${name}» сохранён!`);
    if (feedbackTimerRef.current) clearTimeout(feedbackTimerRef.current);
    feedbackTimerRef.current = setTimeout(() => {
      setFeedbackMessage(null);
    }, 3500);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      handleSaveSubmit();
    }
  };

  const handleLoad = (id: string, name: string) => {
    loadSavedView(id);
    setFeedbackMessage(`Применён: «${name}»`);
    setTimeout(() => {
      setOpen(false);
      setFeedbackMessage(null);
    }, 500);
  };

  const handleDelete = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    deleteSavedView(id);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="h-7 gap-1.5 rounded text-xs text-white/70 hover:text-white hover:bg-white/10"
          title="Сохранённые виды таблицы"
        >
          <Bookmark className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">Виды</span>
          {savedViews.length > 0 && (
            <span className="ml-0.5 rounded-full bg-white/25 px-1.5 py-0.2 text-[10px] font-semibold leading-none text-white">
              {savedViews.length}
            </span>
          )}
        </Button>
      </PopoverTrigger>

      <PopoverContent align="end" className="w-80 p-0 shadow-lg border bg-popover text-popover-foreground">
        {/* Форма сохранения текущего вида */}
        <div className="p-3 border-b bg-muted/30">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-semibold flex items-center gap-1.5 text-foreground">
              <Bookmark className="h-3.5 w-3.5 text-brand-blue" />
              Сохранить текущий вид
            </span>
          </div>
          <div className="flex items-center gap-1.5">
            <Input
              ref={inputRef}
              value={viewName}
              onChange={(e) => setViewName(e.target.value)}
              onKeyDown={handleKeyDown}
              maxLength={60}
              placeholder="Название вида..."
              className="h-8 text-xs bg-background"
            />
            <Button
              size="sm"
              onClick={handleSaveSubmit}
              className="h-8 px-3 text-xs bg-brand-blue hover:bg-brand-blue-hover text-white shrink-0 gap-1 cursor-pointer"
            >
              <Save className="h-3.5 w-3.5" />
              Сохранить
            </Button>
          </div>
          {feedbackMessage ? (
            <div className="text-[11px] font-medium text-emerald-600 dark:text-emerald-400 mt-1.5 flex items-center gap-1">
              <Check className="h-3 w-3 shrink-0" />
              <span className="truncate">{feedbackMessage}</span>
            </div>
          ) : (
            <p className="text-[11px] text-muted-foreground mt-1.5">
              Сохраняет выбранные колонки, фильтры и сортировку.
            </p>
          )}
        </div>

        {/* Список сохранённых видов */}
        <div className="px-3 pt-2.5 pb-1 text-[11px] font-medium text-muted-foreground uppercase tracking-wider flex items-center justify-between">
          <span>Сохранённые виды</span>
          <span className="tabular-nums">{savedViews.length}</span>
        </div>

        <div className="max-h-60 overflow-y-auto p-1 divide-y divide-border/40">
          {savedViews.length > 0 ? (
            savedViews.map((view) => (
              <div
                key={view.id}
                role="button"
                tabIndex={0}
                onClick={() => handleLoad(view.id, view.name)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    handleLoad(view.id, view.name);
                  }
                }}
                className="flex items-center justify-between p-2 rounded hover:bg-muted/70 transition-colors group cursor-pointer text-left"
              >
                <div className="flex flex-col min-w-0 flex-1 pr-2">
                  <span className="text-xs font-medium text-foreground truncate group-hover:text-brand-blue">
                    {view.name}
                  </span>
                  <span className="text-[10px] text-muted-foreground">
                    {formatRelativeDate(view.createdAt)}
                    {view.selectedColumns?.length ? ` · ${view.selectedColumns.length} кол.` : ""}
                  </span>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-6 px-2 text-[11px] text-brand-blue hover:text-brand-blue-hover hover:bg-brand-blue-light/50"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleLoad(view.id, view.name);
                    }}
                  >
                    Применить
                  </Button>
                  <button
                    type="button"
                    onClick={(e) => handleDelete(e, view.id)}
                    className="p-1 rounded text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                    title="Удалить вид"
                    aria-label={`Удалить вид ${view.name}`}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            ))
          ) : (
            <div className="py-6 text-center text-xs text-muted-foreground px-4">
              <Bookmark className="h-6 w-6 mx-auto mb-1.5 opacity-30" />
              <p className="font-medium">Нет сохранённых видов</p>
              <p className="text-[11px] mt-0.5 text-muted-foreground/80">
                Введите название и нажмите «Сохранить», чтобы зафиксировать текущий вид.
              </p>
            </div>
          )}
        </div>

        {/* Информационный футер о месте хранения */}
        <div className="p-2 bg-muted/20 border-t text-[10px] text-muted-foreground text-center">
          Сохраняется локально в браузере (localStorage)
        </div>
      </PopoverContent>
    </Popover>
  );
}
