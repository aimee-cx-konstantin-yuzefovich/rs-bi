"use client";

import { useState, useRef, useEffect } from "react";
import { Bookmark, Trash2, Save } from "lucide-react";
import { useDashboardStore } from "@/store/dashboard-store";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";

function formatRelativeDate(timestamp: number): string {
  const now = Date.now();
  const diffMs = now - timestamp;
  const diffMinutes = Math.floor(diffMs / (1000 * 60));
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffMinutes < 1) return "только что";
  if (diffMinutes < 60) return `${diffMinutes} мин. назад`;
  if (diffHours < 24) {
    const remaining = diffHours % 10;
    const tens = diffHours % 100;
    if (tens >= 11 && tens <= 14) return `${diffHours} часов назад`;
    if (remaining === 1) return `${diffHours} час назад`;
    if (remaining >= 2 && remaining <= 4) return `${diffHours} часа назад`;
    return `${diffHours} часов назад`;
  }
  const remaining = diffDays % 10;
  const tens = diffDays % 100;
  if (tens >= 11 && tens <= 14) return `${diffDays} дней назад`;
  if (remaining === 1) return `${diffDays} день назад`;
  if (remaining >= 2 && remaining <= 4) return `${diffDays} дня назад`;
  return `${diffDays} дней назад`;
}

export function SavedViews() {
  const savedViews = useDashboardStore((s) => s.savedViews);
  const saveView = useDashboardStore((s) => s.saveView);
  const loadSavedView = useDashboardStore((s) => s.loadSavedView);
  const deleteSavedView = useDashboardStore((s) => s.deleteSavedView);

  const [open, setOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [viewName, setViewName] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isSaving && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isSaving]);

  const handleStartSave = () => {
    setIsSaving(true);
    setViewName("");
  };

  const handleSaveSubmit = () => {
    const trimmed = viewName.trim();
    if (!trimmed) {
      setIsSaving(false);
      setViewName("");
      return;
    }
    saveView(trimmed);
    setIsSaving(false);
    setViewName("");
    setOpen(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      handleSaveSubmit();
    } else if (e.key === "Escape") {
      setIsSaving(false);
      setViewName("");
    }
  };

  const handleLoad = (id: string) => {
    loadSavedView(id);
    setOpen(false);
  };

  const handleDelete = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    deleteSavedView(id);
  };

  return (
    <DropdownMenu open={open} onOpenChange={(v) => {
      setOpen(v);
      if (!v) {
        setIsSaving(false);
        setViewName("");
      }
    }}>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="h-7 gap-1.5 rounded text-xs text-white/70 hover:text-white hover:bg-white/10"
        >
          <Bookmark className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">Виды</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        {isSaving ? (
          <div className="flex items-center gap-2 px-2 py-1.5">
            <Input
              ref={inputRef}
              value={viewName}
              onChange={(e) => setViewName(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Название вида..."
              className="h-7 text-xs"
            />
            <Button
              size="sm"
              variant="ghost"
              onClick={handleSaveSubmit}
              className="h-7 shrink-0 px-2 text-xs"
            >
              <Save className="h-3.5 w-3.5" />
            </Button>
          </div>
        ) : (
          <DropdownMenuItem onClick={handleStartSave}>
            <Bookmark className="h-4 w-4" />
            Сохранить текущий вид
          </DropdownMenuItem>
        )}

        {savedViews.length > 0 && <DropdownMenuSeparator />}

        {savedViews.length > 0 ? (
          savedViews.map((view) => (
            <DropdownMenuItem
              key={view.id}
              onClick={() => handleLoad(view.id)}
              className="flex items-center justify-between gap-2"
            >
              <div className="flex flex-col min-w-0 flex-1">
                <span className="text-sm truncate">{view.name}</span>
                <span className="text-[11px] text-muted-foreground">
                  {formatRelativeDate(view.createdAt)}
                </span>
              </div>
              <button
                onClick={(e) => handleDelete(e, view.id)}
                className="shrink-0 p-1 rounded hover:bg-destructive/10 hover:text-destructive transition-colors"
                aria-label="Удалить вид"
              >
                <Trash2 className="h-3 w-3" />
              </button>
            </DropdownMenuItem>
          ))
        ) : (
          savedViews.length === 0 && !isSaving && (
            <div className="px-2 py-3 text-center text-xs text-muted-foreground">
              Нет сохранённых видов
            </div>
          )
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
