"use client";

import { useRef, useState, useCallback } from "react";
import { useDashboardStore } from "@/store/dashboard-store";
import { Search, X } from "lucide-react";

export function GlobalSearch() {
  const { searchQuery, setSearchQuery } = useDashboardStore();
  const inputRef = useRef<HTMLInputElement>(null);
  const [mobileExpanded, setMobileExpanded] = useState(false);

  const handleClear = useCallback(() => {
    setSearchQuery("");
    inputRef.current?.focus();
  }, [setSearchQuery]);

  // Search input component (shared between desktop and mobile)
  const searchInput = (
    <div className="relative flex items-center">
      <Search className="absolute left-2 h-3.5 w-3.5 text-white/30 pointer-events-none" />
      <input
        ref={inputRef}
        type="text"
        value={searchQuery}
        onChange={(e) => setSearchQuery(e.target.value)}
        placeholder="Поиск по всем полям..."
        className="h-7 w-full sm:w-56 lg:w-64 rounded-md bg-white/[0.07] border border-white/10 text-white/80 placeholder:text-white/30 text-xs pl-7 pr-6 outline-none focus-visible:border-white/25 focus-visible:ring-1 focus-visible:ring-white/20 transition-all"
        onBlur={() => {
          if (searchQuery === "" && window.innerWidth < 640) {
            setMobileExpanded(false);
          }
        }}
      />
      {searchQuery && (
        <button
          onClick={handleClear}
          className="absolute right-1.5 flex items-center justify-center h-4 w-4 rounded-sm text-white/40 hover:text-white/80 hover:bg-white/10 transition-colors"
          aria-label="Очистить поиск"
        >
          <X className="h-3 w-3" />
        </button>
      )}
    </div>
  );

  // Mobile: icon-only that expands
  if (!mobileExpanded) {
    return (
      <>
        {/* Mobile icon button */}
        <button
          onClick={() => {
            setMobileExpanded(true);
            setTimeout(() => inputRef.current?.focus(), 50);
          }}
          className="sm:hidden flex items-center justify-center h-7 w-7 rounded-md text-white/60 hover:text-white hover:bg-white/10 transition-colors"
          aria-label="Поиск"
        >
          <Search className="h-3.5 w-3.5" />
        </button>
        {/* Desktop: always-visible input */}
        <div className="hidden sm:block w-40 sm:w-56 lg:w-64">
          {searchInput}
        </div>
      </>
    );
  }

  // Mobile expanded state
  return (
    <div className="w-full sm:w-56 lg:w-64">
      {searchInput}
    </div>
  );
}
