"use client";

import { useEffect, useState } from "react";
import { Check, CircleAlert, Minus } from "lucide-react";
import { useDashboardStore } from "@/store/dashboard-store";
import type { StartupState } from "@/lib/dashboard-startup";

export const STARTUP_LABELS = [
  "Проверка подключения к Bitrix24",
  "Загрузка настроек CRM",
  "Синхронизация данных сделок",
  "Загрузка справочников и компаний",
  "Построение индексов и интерфейса",
] as const;

function formatTimestamp(date: Date) {
  const hh = String(date.getHours()).padStart(2, "0");
  const mm = String(date.getMinutes()).padStart(2, "0");
  const ss = String(date.getSeconds()).padStart(2, "0");
  const ms = String(date.getMilliseconds()).padStart(3, "0");
  return `[${hh}:${mm}:${ss}.${ms}]`;
}

export function LoadingScreen({ startup }: { startup: StartupState }) {
  const appLoaded = useDashboardStore(state => state.appLoaded);
  const setAppLoaded = useDashboardStore(state => state.setAppLoaded);
  const [timedOut, setTimedOut] = useState(false);
  const [dismounted, setDismounted] = useState(false);
  const [stepTimestamps, setStepTimestamps] = useState<Record<number, string>>({});
  const closing = startup.finished || timedOut;
  const success = startup.finished && !startup.steps.includes("error") && !timedOut;

  useEffect(() => {
    setStepTimestamps(prev => {
      let updated = false;
      const next = { ...prev };
      startup.steps.forEach((status, idx) => {
        if ((status === "running" || status === "complete" || status === "error") && !next[idx]) {
          next[idx] = formatTimestamp(new Date());
          updated = true;
        }
      });
      return updated ? next : prev;
    });
  }, [startup.steps]);

  useEffect(() => {
    if (appLoaded) return;
    const timer = setTimeout(() => setTimedOut(true), 10_000);
    return () => clearTimeout(timer);
  }, [appLoaded]);

  useEffect(() => {
    if (dismounted || !closing) return;
    const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
    if (motion.matches) {
      setAppLoaded(true);
      setDismounted(true);
      return;
    }
    const readyTimer = setTimeout(() => setAppLoaded(true), 200);
    const unmountTimer = setTimeout(() => setDismounted(true), 500);
    const onChange = () => {
      if (motion.matches) {
        setAppLoaded(true);
        setDismounted(true);
      }
    };
    motion.addEventListener?.("change", onChange);
    return () => {
      clearTimeout(readyTimer);
      clearTimeout(unmountTimer);
      motion.removeEventListener?.("change", onChange);
    };
  }, [closing, dismounted, setAppLoaded]);

  if (dismounted || (appLoaded && !closing)) return null;
  const currentIndex = startup.steps.indexOf("running");
  const message = success ? "Рабочее пространство готово" : closing ? "Открываем рабочее пространство" : "Подготавливаем рабочее пространство";
  return (
    <div data-testid="startup-overlay" className={`fixed inset-0 z-[100] overflow-y-auto bg-[#0B1120] px-5 py-8 text-[#F8FAFC] transition-opacity duration-200 motion-reduce:transition-none ${closing ? "opacity-0 pointer-events-none" : "opacity-100"}`}>
      <section aria-label="Загрузка терминала" className="mx-auto flex min-h-full max-w-[560px] items-center">
        <div className="w-full rounded-none border border-[#334155] bg-[#111827] p-6 shadow-2xl sm:p-8">
          <p className="text-3xl font-bold tracking-tight text-[#93C5FD]">RusSilica</p>
          <p className="mt-2 text-sm text-[#CBD5E1]">Корпоративный BI Terminal</p>
          <div role="status" aria-live="polite" aria-atomic="true" className="mt-8">
            <h1 className="text-xl font-semibold leading-snug text-[#F8FAFC]">{message}</h1>
            <span className="sr-only">{!closing && currentIndex >= 0 ? (STARTUP_LABELS[currentIndex] || `Этап ${currentIndex + 1}`) : ""}</span>
          </div>
          <ol className="mt-6 space-y-4 font-mono text-sm leading-6">
            {startup.steps.map((status, index) => {
              const label = STARTUP_LABELS[index] || `Этап ${index + 1}`;
              const isRunning = status === "running";
              const isComplete = status === "complete";
              const isLast = index === startup.steps.length - 1;
              const showCursor = isRunning || (success && isLast);
              const timestamp = stepTimestamps[index] || (status !== "waiting" ? formatTimestamp(new Date()) : "[--:--:--.---]");

              return (
                <li key={label} aria-current={isRunning ? "step" : undefined} className={`flex items-start gap-2.5 sm:gap-3 ${isRunning ? "text-[#FBBF24]" : "text-[#CBD5E1]"}`}>
                  <span className="shrink-0 select-none text-xs sm:text-sm text-slate-500 font-mono">
                    {timestamp}
                  </span>
                  <span aria-hidden="true" className="flex h-6 w-4 shrink-0 items-center justify-center">
                    {isComplete ? (
                      <Check className="size-4 text-[#93C5FD]" />
                    ) : status === "error" ? (
                      <CircleAlert className="size-4 text-rose-300" />
                    ) : isRunning ? (
                      <span className="size-2 rounded-full bg-[#FBBF24] animate-pulse" />
                    ) : (
                      <Minus className="size-4 text-slate-400" />
                    )}
                  </span>
                  <span className="flex-1">
                    {label}
                    {showCursor && (
                      <span
                        data-testid="blinking-cursor"
                        aria-hidden="true"
                        className="inline-block w-[7px] h-[14px] bg-[#FBBF24] ml-1.5 align-middle animate-blink-cursor"
                      />
                    )}
                    <span className="sr-only">
                      : {isComplete ? "завершено" : status === "error" ? "ошибка" : isRunning ? "выполняется" : "ожидание"}
                    </span>
                  </span>
                </li>
              );
            })}
          </ol>
          {startup.demo && <p className="mt-5 text-sm text-[#CBD5E1]">Демонстрационный режим</p>}
          <div aria-hidden="true" className="mt-7 h-1 overflow-hidden rounded-none bg-[#334155]">
            <div className={`h-full w-1/3 rounded-none bg-[#93C5FD] ${closing ? "" : "animate-startup-progress"}`} />
          </div>
        </div>
      </section>
    </div>
  );
}
