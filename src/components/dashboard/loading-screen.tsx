"use client";

import { useEffect, useState } from "react";
import { Check, CircleAlert, Minus } from "lucide-react";
import { useDashboardStore } from "@/store/dashboard-store";
import type { StartupState } from "@/lib/dashboard-startup";

const LABELS = ["Проверка подключения", "Загрузка настроек CRM", "Загрузка данных"];

export function LoadingScreen({ startup }: { startup: StartupState }) {
  const appLoaded = useDashboardStore(state => state.appLoaded);
  const setAppLoaded = useDashboardStore(state => state.setAppLoaded);
  const [timedOut, setTimedOut] = useState(false);
  const [dismounted, setDismounted] = useState(false);
  const closing = startup.finished || timedOut;
  const success = startup.finished && !startup.steps.includes("error") && !timedOut;

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
      <section aria-label="Загрузка терминала" className="mx-auto flex min-h-full max-w-[520px] items-center">
        <div className="w-full rounded-2xl border border-[#334155] bg-[#111827] p-6 shadow-xl sm:p-8">
          <p className="text-3xl font-bold tracking-tight text-[#93C5FD]">RusSilica</p>
          <p className="mt-2 text-sm text-[#CBD5E1]">Корпоративный BI Terminal</p>
          <div role="status" aria-live="polite" aria-atomic="true" className="mt-8">
            <h1 className="text-xl font-semibold leading-snug text-[#F8FAFC]">{message}</h1>
            <span className="sr-only">{!closing && currentIndex >= 0 ? LABELS[currentIndex] : ""}</span>
          </div>
          <ol className="mt-6 space-y-4 font-mono text-sm leading-6">
            {startup.steps.map((status, index) => (
              <li key={LABELS[index]} aria-current={status === "running" ? "step" : undefined} className={`flex items-start gap-3 ${status === "running" ? "text-[#FBBF24]" : "text-[#CBD5E1]"}`}>
                <span aria-hidden="true" className="flex h-6 w-4 shrink-0 items-center justify-center">
                  {status === "complete" ? <Check className="size-4 text-[#93C5FD]" /> : status === "error" ? <CircleAlert className="size-4 text-rose-300" /> : status === "running" ? <span className="size-2 rounded-full bg-[#FBBF24]" /> : <Minus className="size-4 text-slate-400" />}
                </span>
                <span>{LABELS[index]}<span className="sr-only">: {status === "complete" ? "завершено" : status === "error" ? "ошибка" : status === "running" ? "выполняется" : "ожидание"}</span></span>
              </li>
            ))}
          </ol>
          {startup.demo && <p className="mt-5 text-sm text-[#CBD5E1]">Демонстрационный режим</p>}
          <div aria-hidden="true" className="mt-7 h-1 overflow-hidden rounded-full bg-[#334155]">
            <div className={`h-full w-1/3 rounded-full bg-[#93C5FD] ${closing ? "" : "animate-startup-progress"}`} />
          </div>
        </div>
      </section>
    </div>
  );
}
