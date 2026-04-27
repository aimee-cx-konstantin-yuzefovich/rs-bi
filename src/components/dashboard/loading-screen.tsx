"use client";

import { useEffect, useState, useRef } from "react";
import { useDashboardStore } from "@/store/dashboard-store";

const TERMINAL_LINES = [
  "RusSilica BI Terminal v2.0",
  "Инициализация модулей...",
  "Загрузка конфигурации CRM...",
  "Подключение к Bitrix24...",
  "Синхронизация данных...",
  "Загрузка полей сделки...",
  "Построение индексов...",
  "Готово к работе ✓",
];

const LINE_DELAY_MS = 120; // 8 lines * 120ms ≈ 1 second
const FADE_OUT_DELAY_MS = 400;

function getTimestamp() {
  const now = new Date();
  const hh = String(now.getHours()).padStart(2, "0");
  const mm = String(now.getMinutes()).padStart(2, "0");
  const ss = String(now.getSeconds()).padStart(2, "0");
  const ms = String(now.getMilliseconds()).padStart(3, "0");
  return `[${hh}:${mm}:${ss}.${ms}]`;
}

export function LoadingScreen() {
  const { appLoaded, setAppLoaded } = useDashboardStore();
  const [visibleLines, setVisibleLines] = useState(0);
  const [fadingOut, setFadingOut] = useState(false);
  const [timestamps, setTimestamps] = useState<string[]>([]);
  const cancelledRef = useRef(false);

  useEffect(() => {
    if (appLoaded) return;

    cancelledRef.current = false;
    const timers: ReturnType<typeof setTimeout>[] = [];

    const scheduleTimer = (fn: () => void, ms: number) => {
      const id = setTimeout(() => {
        if (!cancelledRef.current) fn();
      }, ms);
      timers.push(id);
      return id;
    };

    let lineIndex = 0;
    const showNext = () => {
      lineIndex++;
      if (lineIndex <= TERMINAL_LINES.length) {
        setVisibleLines(lineIndex);
        setTimestamps((prev) => {
          const newTimestamps = [...prev];
          newTimestamps[lineIndex - 1] = getTimestamp();
          return newTimestamps;
        });
        scheduleTimer(showNext, LINE_DELAY_MS);
      } else {
        // All lines shown — wait for data to finish loading before fading out.
        const waitForData = () => {
          if (cancelledRef.current) return;
          
          // Get latest state directly from the store to avoid useEffect re-runs
          const state = useDashboardStore.getState();
          
          if (!state.fieldsLoading && !state.dealsLoading) {
            setFadingOut(true);
            scheduleTimer(() => {
              setAppLoaded(true);
            }, 500);
          } else {
            // Data still loading — check again in 200ms
            scheduleTimer(waitForData, 200);
          }
        };
        scheduleTimer(waitForData, FADE_OUT_DELAY_MS);
      }
    };

    scheduleTimer(showNext, 150);

    // Safety timeout: force load after 10s even if data hasn't arrived
    scheduleTimer(() => {
      if (!cancelledRef.current && !useDashboardStore.getState().appLoaded) {
        setFadingOut(true);
        scheduleTimer(() => {
          setAppLoaded(true);
        }, 500);
      }
    }, 10_000);

    return () => {
      cancelledRef.current = true;
      timers.forEach((id) => clearTimeout(id));
    };
  }, [appLoaded, setAppLoaded]); // Removed dealsLoading and fieldsLoading to prevent restart

  if (appLoaded) return null;

  return (
    <div
      className={`fixed inset-0 z-[100] flex items-center justify-center bg-black transition-opacity duration-500 ${
        fadingOut ? "opacity-0" : "opacity-100"
      }`}
    >
      <div className="w-full max-w-2xl mx-4 bg-black border border-amber-500/30 p-6 shadow-[0_0_30px_rgba(245,158,11,0.1)]">
        {/* Terminal body */}
        <div className="font-mono text-[14px] leading-relaxed min-h-[280px]">
          {TERMINAL_LINES.slice(0, visibleLines).map((line, i) => {
            const isSuccess = line.includes("✓");
            const isVersion = i === 0;
            const timestamp = timestamps[i] || getTimestamp();
            
            return (
              <div key={i} className="flex gap-3">
                <span className="text-slate-500 shrink-0 select-none">
                  {timestamp}
                </span>
                <span
                  className={
                    isSuccess
                      ? "text-emerald-500 font-bold"
                      : isVersion
                      ? "text-amber-500 font-bold uppercase tracking-wider"
                      : "text-amber-500/80"
                  }
                >
                  {line}
                </span>
                {i === visibleLines - 1 && !fadingOut && (
                  <span className="inline-block w-[8px] h-[16px] bg-amber-500 ml-1 align-middle animate-blink-cursor" />
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
