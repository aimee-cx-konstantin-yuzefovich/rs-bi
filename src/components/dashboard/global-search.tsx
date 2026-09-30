"use client";

import { useRef, useState, useCallback, useEffect } from "react";
import { useDashboardStore } from "@/store/dashboard-store";
import { Search, X } from "lucide-react";
import { useQueryState } from "nuqs";
import { searchParams } from "@/lib/search-params";

export function GlobalSearch() {
  const { setSearchQuery } = useDashboardStore();
  const [searchQueryUrl, setSearchQueryUrl] = useQueryState("q", searchParams.q);
  const [localQuery, setLocalQuery] = useState(searchQueryUrl || "");
  const inputRef = useRef<HTMLInputElement>(null);
  const [mobileExpanded, setMobileExpanded] = useState(false);

  // Debounce search
  useEffect(() => {
    const timer = setTimeout(() => {
      setSearchQueryUrl(localQuery || null);
      setSearchQuery(localQuery);
    }, 300);
    return () => clearTimeout(timer);
  }, [localQuery, setSearchQueryUrl, setSearchQuery]);

  const handleClear = useCallback(() => {
    setLocalQuery("");
    inputRef.current?.focus();
  }, []);

  // Search input component (shared between desktop and mobile)
  const searchInput = (
    <div className="relative flex items-center w-full">
      <Search className="absolute left-2.5 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
      <input
        ref={inputRef}
        type="text"
        value={localQuery}
        onChange={(e) => setLocalQuery(e.target.value)}
        placeholder="Поиск по всем полям..."
        className="h-8 w-full rounded-md bg-background border border-input text-foreground placeholder:text-muted-foreground text-xs pl-8 pr-7 outline-none focus-visible:border-ring focus-visible:ring-1 focus-visible:ring-ring transition-all"
        onBlur={() => {
          if (localQuery === "" && window.innerWidth < 768) {
            setMobileExpanded(false);
          }
        }}
      />
      {localQuery && (
        <button
          onClick={handleClear}
          className="absolute right-2 flex items-center justify-center h-4 w-4 rounded-sm text-muted-foreground hover:text-foreground hover:bg-muted transition-colors cursor-pointer"
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
          className="sm:hidden flex items-center justify-center h-8 w-8 rounded-md border border-input bg-background text-muted-foreground hover:text-foreground hover:bg-muted transition-colors cursor-pointer"
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
