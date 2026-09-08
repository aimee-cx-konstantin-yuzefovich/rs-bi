"use client";

import { type DateFilter, type DateFilterPreset } from "@/store/dashboard-store";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { Calendar, ChevronDown } from "lucide-react";
import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

const PRESETS: { value: DateFilterPreset; label: string; shortcut?: string }[] = [
  { value: "all", label: "За всё время", shortcut: "∞" },
  { value: "7days", label: "7 дней" },
  { value: "14days", label: "14 дней" },
  { value: "30days", label: "30 дней" },
  { value: "90days", label: "90 дней" },
];

/**
 * Same UX as the deals table's DateFilter, but fully controlled — filters
 * the Companies browser's own (client-side) dataset by "Дата создания"
 * instead of the shared store's `dateFilter` (which drives the deals table
 * and would otherwise cross-affect it).
 */
export function CompanyDateFilter({
  value,
  onChange,
}: {
  value: DateFilter;
  onChange: (filter: DateFilter) => void;
}) {
  const [customFrom, setCustomFrom] = useState(value.customFrom || "");
  const [customTo, setCustomTo] = useState(value.customTo || "");
  const [customOpen, setCustomOpen] = useState(false);

  const currentLabel =
    value.preset === "custom"
      ? "Указать вручную"
      : PRESETS.find((p) => p.value === value.preset)?.label || "За всё время";

  const handlePresetSelect = (preset: DateFilterPreset) => {
    if (preset === "custom") {
      setCustomOpen(true);
      return;
    }
    onChange({ preset });
  };

  const handleCustomApply = () => {
    onChange({
      preset: "custom",
      customFrom: customFrom || undefined,
      customTo: customTo || undefined,
    });
    setCustomOpen(false);
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" className="h-8 gap-1.5 text-xs">
          <Calendar className="h-3.5 w-3.5" />
          <span>{currentLabel}</span>
          <ChevronDown className="h-3 w-3 opacity-50" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-52 rounded-md">
        <DropdownMenuLabel className="text-[10px] text-muted-foreground uppercase tracking-wider">
          Период (дата создания)
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {PRESETS.map((preset) => (
          <DropdownMenuItem
            key={preset.value}
            onClick={() => handlePresetSelect(preset.value)}
            className={`cursor-pointer rounded-sm text-xs ${
              value.preset === preset.value ? "bg-brand-blue/10 text-brand-blue font-medium" : ""
            }`}
          >
            <span className="flex-1">{preset.label}</span>
            {preset.shortcut && (
              <span className="text-[10px] text-muted-foreground ml-2">{preset.shortcut}</span>
            )}
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        <Popover open={customOpen} onOpenChange={setCustomOpen}>
          <PopoverTrigger asChild>
            <DropdownMenuItem
              onSelect={(e) => e.preventDefault()}
              className={`cursor-pointer rounded-sm text-xs ${
                value.preset === "custom" ? "bg-brand-blue/10 text-brand-blue font-medium" : ""
              }`}
              onClick={() => setCustomOpen(true)}
            >
              Указать вручную
            </DropdownMenuItem>
          </PopoverTrigger>
          <PopoverContent className="w-64 rounded-md p-4" align="start">
            <div className="space-y-3">
              <div className="text-xs font-semibold">Указать период</div>
              <div className="space-y-2">
                <div>
                  <Label htmlFor="company-date-from" className="text-[10px] text-muted-foreground uppercase tracking-wider">
                    От
                  </Label>
                  <Input
                    id="company-date-from"
                    type="date"
                    value={customFrom}
                    onChange={(e) => setCustomFrom(e.target.value)}
                    className="h-7 text-xs rounded-md"
                  />
                </div>
                <div>
                  <Label htmlFor="company-date-to" className="text-[10px] text-muted-foreground uppercase tracking-wider">
                    До
                  </Label>
                  <Input
                    id="company-date-to"
                    type="date"
                    value={customTo}
                    onChange={(e) => setCustomTo(e.target.value)}
                    className="h-7 text-xs rounded-md"
                  />
                </div>
              </div>
              <Button
                size="sm"
                onClick={handleCustomApply}
                className="w-full h-7 rounded-md bg-brand-blue hover:bg-brand-blue-hover text-white text-xs"
              >
                Применить
              </Button>
            </div>
          </PopoverContent>
        </Popover>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
