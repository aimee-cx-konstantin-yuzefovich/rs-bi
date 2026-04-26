"use client";

import { useEffect, useState, useRef } from "react";
import { useDashboardStore } from "@/store/dashboard-store";
import { BarChart3 } from "lucide-react";

const TERMINAL_LINES = [
  "> RusSilica BI Terminal v2.0",
  "> Инициализация модулей...",
  "> Загрузка конфигурации CRM...",
  "> Подключение к Bitrix24...",
  "> Синхронизация данных...",
  "> Загрузка полей сделки...",
  "> Построение индексов...",
  "> Готово к работе ✓",
];

const LINE_DELAY_MS = 100;
const FADE_OUT_DELAY_MS = 400;

export function LoadingScreen() {
  const { appLoaded, setAppLoaded, dealsLoading, fieldsLoading } = useDashboardStore();
  const [visibleLines, setVisibleLines] = useState(0);
  const [fadingOut, setFadingOut] = useState(false);
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
        scheduleTimer(showNext, LINE_DELAY_MS);
      } else {
        // All lines shown — wait for data to finish loading before fading out.
        // Previously this was a fixed 400ms delay, but if data was still loading,
        // the user would see a "loaded" page with skeleton rows.
        const waitForData = () => {
          if (cancelledRef.current) return;
          // Only fade out when both fields and deals have finished loading
          if (!fieldsLoading && !dealsLoading) {
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
    // (prevents getting stuck forever if API hangs)
    scheduleTimer(() => {
      if (!cancelledRef.current && !appLoaded) {
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
  }, [appLoaded, setAppLoaded, dealsLoading, fieldsLoading]);

  if (appLoaded) return null;

  return (
    <div
      className={`fixed inset-0 z-[100] flex items-center justify-center header-gradient transition-opacity duration-500 ${
        fadingOut ? "opacity-0" : "opacity-100"
      }`}
    >
      <div className="w-full max-w-md mx-4 rounded-lg border border-white/10 bg-[#0A0F1A]/90 shadow-2xl backdrop-blur-sm overflow-hidden">
        {/* Terminal title bar */}
        <div className="flex items-center gap-2 px-4 py-2.5 border-b border-white/10 bg-white/[0.03]">
          <BarChart3 className="h-3.5 w-3.5 text-white/60" />
          <span className="text-[11px] font-medium text-white/50 tracking-wide">
            RusSilica
          </span>
          <div className="ml-auto flex items-center gap-1.5">
            <div className="h-2 w-2 rounded-full bg-white/10" />
            <div className="h-2 w-2 rounded-full bg-white/10" />
            <div className="h-2 w-2 rounded-full bg-white/10" />
          </div>
        </div>

        {/* Terminal body */}
        <div className="px-5 py-4 font-mono text-[13px] leading-7 min-h-[240px]">
          {TERMINAL_LINES.slice(0, visibleLines).map((line, i) => {
            const isSuccess = line.includes("✓");
            const isVersion = i === 0;
            return (
              <div
                key={i}
                className="animate-terminal-line"
                style={{
                  animationDelay: `${i * 30}ms`,
                }}
              >
                <span
                  className={
                    isSuccess
                      ? "text-emerald-400"
                      : isVersion
                      ? "text-white/90 font-semibold"
                      : "text-white/60"
                  }
                >
                  {line}
                </span>
                {i === visibleLines - 1 && !fadingOut && (
                  <span className="inline-block w-[7px] h-[14px] bg-white/70 ml-0.5 align-middle animate-blink-cursor" />
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
