This file is a merged representation of a subset of the codebase, containing specifically included files and files not matching ignore patterns, combined into a single document by Repomix.
The content has been processed where empty lines have been removed, line numbers have been added.

# File Summary

## Purpose
This file contains a packed representation of a subset of the repository's contents that is considered the most important context.
It is designed to be easily consumable by AI systems for analysis, code review,
or other automated processes.

## File Format
The content is organized as follows:
1. This summary section
2. Repository information
3. Directory structure
4. Repository files (if enabled)
5. Multiple file entries, each consisting of:
  a. A header with the file path (## File: path/to/file)
  b. The full contents of the file in a code block

## Usage Guidelines
- This file should be treated as read-only. Any changes should be made to the
  original repository files, not this packed version.
- When processing this file, use the file path to distinguish
  between different files in the repository.
- Be aware that this file may contain sensitive information. Handle it with
  the same level of security as you would the original repository.

## Notes
- Some files may have been excluded based on .gitignore rules and Repomix's configuration
- Binary files are not included in this packed representation. Please refer to the Repository Structure section for a complete list of file paths, including binary files
- Only files matching these patterns are included: src/**/*, package.json, prisma/schema.prisma
- Files matching these patterns are excluded: *.md, repomix-output.xml, public/**/*, .roo/**/*, components.json, tailwind.config.ts, postcss.config.mjs, eslint.config.mjs, next.config.ts, tsconfig.json, Dockerfile, docker-compose.yml, .gitflic-ci.yaml, wordpress-headless-auth.php, test-users.ts
- Files matching patterns in .gitignore are excluded
- Files matching default ignore patterns are excluded
- Empty lines have been removed from all files
- Line numbers have been added to the beginning of each line
- Files are sorted by Git change count (files with more changes are at the bottom)

# Directory Structure
```
prisma/
  schema.prisma
src/
  app/
    api/
      admin/
        audit-logs/
          route.ts
      auth/
        [...nextauth]/
          route.ts
        wp-callback/
          route.ts
        wp-login/
          route.ts
      bitrix/
        activities/
          route.ts
        companies/
          route.ts
        deals/
          route.ts
        fields/
          route.ts
        status/
          route.ts
        users/
          route.ts
      route.ts
    login/
      page.tsx
    globals.css
    layout.tsx
    page.tsx
  components/
    auth/
      auth-provider.tsx
    dashboard/
      active-filters.tsx
      alerts-bell.tsx
      column-selector.tsx
      config-banner.tsx
      connection-health.tsx
      data-table.tsx
      date-filter.tsx
      entity-drawer.tsx
      footer.tsx
      global-search.tsx
      header.tsx
      last-sync.tsx
      loading-screen.tsx
      pipeline-filter.tsx
      responsible-filter.tsx
      saved-views.tsx
      stats-cards.tsx
      theme-provider.tsx
      theme-toggle.tsx
    ui/
      accordion.tsx
      alert-dialog.tsx
      alert.tsx
      aspect-ratio.tsx
      avatar.tsx
      badge.tsx
      breadcrumb.tsx
      button.tsx
      calendar.tsx
      card.tsx
      carousel.tsx
      chart.tsx
      checkbox.tsx
      collapsible.tsx
      command.tsx
      context-menu.tsx
      dialog.tsx
      drawer.tsx
      dropdown-menu.tsx
      form.tsx
      hover-card.tsx
      input-otp.tsx
      input.tsx
      label.tsx
      menubar.tsx
      navigation-menu.tsx
      pagination.tsx
      popover.tsx
      progress.tsx
      radio-group.tsx
      resizable.tsx
      scroll-area.tsx
      select.tsx
      separator.tsx
      sheet.tsx
      sidebar.tsx
      skeleton.tsx
      slider.tsx
      sonner.tsx
      switch.tsx
      table.tsx
      tabs.tsx
      textarea.tsx
      toast.tsx
      toaster.tsx
      toggle-group.tsx
      toggle.tsx
      tooltip.tsx
    error-boundary.tsx
  hooks/
    use-company-details.ts
    use-mobile.ts
    use-table-state.ts
    use-toast.ts
    use-user-details.ts
  lib/
    auth-guard.ts
    auth.ts
    bitrix.ts
    config.server.ts
    config.ts
    crm-constants.ts
    db.ts
    demo-data.ts
    export-utils.ts
    i18n.ts
    sso-hmac.ts
    utils.ts
  store/
    dashboard-store.ts
    entity-drawer-store.ts
  middleware.ts
package.json
```

# Files

## File: src/app/api/auth/[...nextauth]/route.ts
```typescript
1: import NextAuth from "next-auth";
2: import { authOptions } from "@/lib/auth";
3: const handler = NextAuth(authOptions);
4: export { handler as GET, handler as POST };
```

## File: src/app/api/bitrix/status/route.ts
```typescript
 1: import { NextResponse } from "next/server";
 2: import { requireAuth, isAuthError } from "@/lib/auth-guard";
 3: export const dynamic = "force-dynamic";
 4: export async function GET() {
 5:   // ─── SECURITY: Require authentication ───
 6:   const authResult = await requireAuth();
 7:   if (isAuthError(authResult)) return authResult;
 8:   const webhookConfigured = !!process.env.BITRIX_WEBHOOK_URL;
 9:   // Security: Return minimal information — just boolean status.
10:   // Do NOT expose the webhook URL, domain, or any configuration details.
11:   // The message is intentionally generic to prevent information leakage.
12:   return NextResponse.json({
13:     configured: webhookConfigured,
14:     // No additional details — prevents reconnaissance of CRM infrastructure
15:   });
16: }
```

## File: src/app/api/route.ts
```typescript
1: import { NextResponse } from "next/server";
2: /**
3:  * Root API route — returns minimal health status.
4:  * SECURITY: Does NOT expose any internal configuration, URLs, or version info.
5:  */
6: export async function GET() {
7:   return NextResponse.json({ status: "ok" });
8: }
```

## File: src/components/auth/auth-provider.tsx
```typescript
1: "use client";
2: import { SessionProvider } from "next-auth/react";
3: export function AuthProvider({ children }: { children: React.ReactNode }) {
4:   return <SessionProvider>{children}</SessionProvider>;
5: }
```

## File: src/components/dashboard/active-filters.tsx
```typescript
  1: "use client";
  2: import { useMemo, useCallback } from "react";
  3: import { useDashboardStore } from "@/store/dashboard-store";
  4: import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
  5: import { Filter, X } from "lucide-react";
  6: interface ActiveFilterItem {
  7:   key: string;
  8:   label: string;
  9:   value: string;
 10:   onRemove: () => void;
 11: }
 12: export function ActiveFilters() {
 13:   const {
 14:     dateFilter,
 15:     pipelineFilter,
 16:     responsibleFilter,
 17:     searchQuery,
 18:     columnFilters,
 19:     fields,
 20:     setDateFilter,
 21:     setPipelineFilter,
 22:     setResponsibleFilter,
 23:     setSearchQuery,
 24:     clearColumnFilter,
 25:     clearAllColumnFilters,
 26:   } = useDashboardStore();
 27:   const filters: ActiveFilterItem[] = useMemo(() => {
 28:     const result: ActiveFilterItem[] = [];
 29:     // Date filter
 30:     if (dateFilter.preset !== "all") {
 31:       const presetLabels: Record<string, string> = {
 32:         "7days": "7 дней",
 33:         "14days": "14 дней",
 34:         "30days": "30 дней",
 35:         "90days": "90 дней",
 36:         custom: "Свой",
 37:       };
 38:       result.push({
 39:         key: "dateFilter",
 40:         label: "Период",
 41:         value: presetLabels[dateFilter.preset] || dateFilter.preset,
 42:         onRemove: () => setDateFilter({ preset: "all" }),
 43:       });
 44:     }
 45:     // Pipeline filter
 46:     if (pipelineFilter !== "all") {
 47:       const pipelineLabels: Record<string, string> = {
 48:         in_work: "В работе",
 49:         WON: "Успешно",
 50:         LOSE: "Провал",
 51:       };
 52:       result.push({
 53:         key: "pipelineFilter",
 54:         label: "Воронка",
 55:         value: pipelineLabels[pipelineFilter] || pipelineFilter,
 56:         onRemove: () => setPipelineFilter("all"),
 57:       });
 58:     }
 59:     // Responsible filter
 60:     if (responsibleFilter !== "all") {
 61:       result.push({
 62:         key: "responsibleFilter",
 63:         label: "Ответственный",
 64:         value: responsibleFilter,
 65:         onRemove: () => setResponsibleFilter("all"),
 66:       });
 67:     }
 68:     // Search query
 69:     if (searchQuery.trim()) {
 70:       result.push({
 71:         key: "searchQuery",
 72:         label: "Поиск",
 73:         value: searchQuery.length > 20 ? searchQuery.slice(0, 20) + "…" : searchQuery,
 74:         onRemove: () => setSearchQuery(""),
 75:       });
 76:     }
 77:     // Column filters
 78:     columnFilters.forEach((cf) => {
 79:       if (cf.value.trim()) {
 80:         const field = fields.find((f) => f.id === cf.columnId);
 81:         const fieldTitle = field?.title || cf.columnId;
 82:         result.push({
 83:           key: `col_${cf.columnId}`,
 84:           label: `Столбец: ${fieldTitle}`,
 85:           value: cf.value.length > 20 ? cf.value.slice(0, 20) + "…" : cf.value,
 86:           onRemove: () => clearColumnFilter(cf.columnId),
 87:         });
 88:       }
 89:     });
 90:     return result;
 91:   }, [
 92:     dateFilter,
 93:     pipelineFilter,
 94:     responsibleFilter,
 95:     searchQuery,
 96:     columnFilters,
 97:     fields,
 98:     setDateFilter,
 99:     setPipelineFilter,
100:     setResponsibleFilter,
101:     setSearchQuery,
102:     clearColumnFilter,
103:   ]);
104:   const handleClearAll = useCallback(() => {
105:     clearAllColumnFilters();
106:     setDateFilter({ preset: "all" });
107:     setPipelineFilter("all");
108:     setResponsibleFilter("all");
109:     setSearchQuery("");
110:   }, [clearAllColumnFilters, setDateFilter, setPipelineFilter, setResponsibleFilter, setSearchQuery]);
111:   if (filters.length === 0) return null;
112:   return (
113:     <Popover>
114:       <PopoverTrigger asChild>
115:         <button className="flex items-center gap-1.5 h-7 px-2 rounded-md bg-brand-orange/20 border border-brand-orange/30 hover:bg-brand-orange/30 transition-colors filter-badge-pulse">
116:           <Filter className="h-3 w-3 text-brand-orange" />
117:           <span className="text-[11px] font-medium text-brand-orange tabular-nums">
118:             {filters.length}
119:           </span>
120:         </button>
121:       </PopoverTrigger>
122:       <PopoverContent
123:         align="end"
124:         className="w-72 p-0 bg-popover border-border shadow-lg"
125:       >
126:         <div className="px-3 py-2 border-b border-border">
127:           <span className="text-xs font-semibold text-foreground">
128:             Активные фильтры
129:           </span>
130:         </div>
131:         <div className="p-2 max-h-64 overflow-y-auto custom-scrollbar space-y-1">
132:           {filters.map((f) => (
133:             <div
134:               key={f.key}
135:               className="flex items-center gap-2 px-2 py-1.5 rounded-md bg-muted/50 group"
136:             >
137:               <div className="flex-1 min-w-0">
138:                 <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">
139:                   {f.label}
140:                 </span>
141:                 <div className="text-xs text-foreground truncate">{f.value}</div>
142:               </div>
143:               <button
144:                 onClick={f.onRemove}
145:                 className="shrink-0 h-5 w-5 flex items-center justify-center rounded text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
146:                 aria-label={`Удалить фильтр: ${f.label}`}
147:               >
148:                 <X className="h-3 w-3" />
149:               </button>
150:             </div>
151:           ))}
152:         </div>
153:         <div className="px-3 py-2 border-t border-border">
154:           <button
155:             onClick={handleClearAll}
156:             className="w-full text-center text-xs font-medium text-destructive hover:text-destructive/80 transition-colors py-1"
157:           >
158:             Сбросить всё
159:           </button>
160:         </div>
161:       </PopoverContent>
162:     </Popover>
163:   );
164: }
```

## File: src/components/dashboard/date-filter.tsx
```typescript
  1: "use client";
  2: import { useDashboardStore, type DateFilterPreset } from "@/store/dashboard-store";
  3: import {
  4:   DropdownMenu,
  5:   DropdownMenuContent,
  6:   DropdownMenuItem,
  7:   DropdownMenuLabel,
  8:   DropdownMenuSeparator,
  9:   DropdownMenuTrigger,
 10: } from "@/components/ui/dropdown-menu";
 11: import { Button } from "@/components/ui/button";
 12: import { Calendar, ChevronDown } from "lucide-react";
 13: import { useState } from "react";
 14: import { Input } from "@/components/ui/input";
 15: import { Label } from "@/components/ui/label";
 16: import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
 17: const PRESETS: { value: DateFilterPreset; label: string; shortcut?: string }[] = [
 18:   { value: "all", label: "За всё время", shortcut: "∞" },
 19:   { value: "7days", label: "7 дней" },
 20:   { value: "14days", label: "14 дней" },
 21:   { value: "30days", label: "30 дней" },
 22:   { value: "90days", label: "90 дней" },
 23: ];
 24: export function DateFilter() {
 25:   const { dateFilter, setDateFilter } = useDashboardStore();
 26:   const [customFrom, setCustomFrom] = useState(dateFilter.customFrom || "");
 27:   const [customTo, setCustomTo] = useState(dateFilter.customTo || "");
 28:   const [customOpen, setCustomOpen] = useState(false);
 29:   const currentLabel =
 30:     dateFilter.preset === "custom"
 31:       ? "Указать вручную"
 32:       : PRESETS.find((p) => p.value === dateFilter.preset)?.label || "За всё время";
 33:   const handlePresetSelect = (preset: DateFilterPreset) => {
 34:     if (preset === "custom") {
 35:       setCustomOpen(true);
 36:       return;
 37:     }
 38:     setDateFilter({ preset });
 39:   };
 40:   const handleCustomApply = () => {
 41:     setDateFilter({
 42:       preset: "custom",
 43:       customFrom: customFrom || undefined,
 44:       customTo: customTo || undefined,
 45:     });
 46:     setCustomOpen(false);
 47:   };
 48:   return (
 49:     <div className="flex items-center gap-2">
 50:       <DropdownMenu>
 51:         <DropdownMenuTrigger asChild>
 52:           <Button
 53:             variant="ghost"
 54:             size="sm"
 55:             className="h-7 gap-1.5 rounded-md text-white/80 hover:text-white hover:bg-white/10 text-[11px] font-medium border border-white/10"
 56:           >
 57:             <Calendar className="h-3 w-3 text-white/60" />
 58:             <span>{currentLabel}</span>
 59:             <ChevronDown className="h-2.5 w-2.5 text-white/50" />
 60:           </Button>
 61:         </DropdownMenuTrigger>
 62:         <DropdownMenuContent align="start" className="w-52 rounded-md">
 63:           <DropdownMenuLabel className="text-[10px] text-muted-foreground uppercase tracking-wider">
 64:             Период
 65:           </DropdownMenuLabel>
 66:           <DropdownMenuSeparator />
 67:           {PRESETS.map((preset) => (
 68:             <DropdownMenuItem
 69:               key={preset.value}
 70:               onClick={() => handlePresetSelect(preset.value)}
 71:               className={`cursor-pointer rounded-sm text-xs ${
 72:                 dateFilter.preset === preset.value
 73:                   ? "bg-brand-blue/10 text-brand-blue font-medium"
 74:                   : ""
 75:               }`}
 76:             >
 77:               <span className="flex-1">{preset.label}</span>
 78:               {preset.shortcut && (
 79:                 <span className="text-[10px] text-muted-foreground ml-2">{preset.shortcut}</span>
 80:               )}
 81:             </DropdownMenuItem>
 82:           ))}
 83:           <DropdownMenuSeparator />
 84:           <Popover open={customOpen} onOpenChange={setCustomOpen}>
 85:             <PopoverTrigger asChild>
 86:               <DropdownMenuItem
 87:                 onSelect={(e) => e.preventDefault()}
 88:                 className={`cursor-pointer rounded-sm text-xs ${
 89:                   dateFilter.preset === "custom"
 90:                     ? "bg-brand-blue/10 text-brand-blue font-medium"
 91:                     : ""
 92:                 }`}
 93:                 onClick={() => setCustomOpen(true)}
 94:               >
 95:                 Указать вручную
 96:               </DropdownMenuItem>
 97:             </PopoverTrigger>
 98:             <PopoverContent className="w-64 rounded-md p-4" align="start">
 99:               <div className="space-y-3">
100:                 <div className="text-xs font-semibold">Указать период</div>
101:                 <div className="space-y-2">
102:                   <div>
103:                     <Label htmlFor="date-from" className="text-[10px] text-muted-foreground uppercase tracking-wider">
104:                       От
105:                     </Label>
106:                     <Input
107:                       id="date-from"
108:                       type="date"
109:                       value={customFrom}
110:                       onChange={(e) => setCustomFrom(e.target.value)}
111:                       className="h-7 text-xs rounded-md"
112:                     />
113:                   </div>
114:                   <div>
115:                     <Label htmlFor="date-to" className="text-[10px] text-muted-foreground uppercase tracking-wider">
116:                       До
117:                     </Label>
118:                     <Input
119:                       id="date-to"
120:                       type="date"
121:                       value={customTo}
122:                       onChange={(e) => setCustomTo(e.target.value)}
123:                       className="h-7 text-xs rounded-md"
124:                     />
125:                   </div>
126:                 </div>
127:                 <Button
128:                   size="sm"
129:                   onClick={handleCustomApply}
130:                   className="w-full h-7 rounded-md bg-brand-blue hover:bg-brand-blue-hover text-white text-xs"
131:                 >
132:                   Применить
133:                 </Button>
134:               </div>
135:             </PopoverContent>
136:           </Popover>
137:         </DropdownMenuContent>
138:       </DropdownMenu>
139:     </div>
140:   );
141: }
```

## File: src/components/dashboard/pipeline-filter.tsx
```typescript
 1: "use client";
 2: import { useDashboardStore } from "@/store/dashboard-store";
 3: import { useMemo } from "react";
 4: const PIPELINE_TABS = [
 5:   { key: "all", label: "Все" },
 6:   { key: "in_work", label: "В работе" },
 7:   { key: "WON", label: "WON" },
 8:   { key: "LOSE", label: "LOSE" },
 9: ] as const;
10: export function PipelineFilter() {
11:   const { allDeals, pipelineFilter, setPipelineFilter } = useDashboardStore();
12:   // Use allDeals for counts so they don't change when pipeline filter is active
13:   const counts = useMemo(() => {
14:     const all = allDeals.length;
15:     const inWork = allDeals.filter((d) => {
16:       const stage = String(d.STAGE_ID || "");
17:       return !["WON", "LOSE"].includes(stage);
18:     }).length;
19:     const won = allDeals.filter((d) => String(d.STAGE_ID) === "WON").length;
20:     const lose = allDeals.filter((d) => String(d.STAGE_ID) === "LOSE").length;
21:     return { all, in_work: inWork, WON: won, LOSE: lose };
22:   }, [allDeals]);
23:   return (
24:     <div className="flex items-center gap-1">
25:       {PIPELINE_TABS.map((tab) => {
26:         const isActive = pipelineFilter === tab.key;
27:         return (
28:           <button
29:             key={tab.key}
30:             onClick={() => setPipelineFilter(tab.key)}
31:             className={`
32:               h-7 px-2 rounded text-[11px] font-medium transition-colors cursor-pointer
33:               flex items-center gap-1 border
34:               ${
35:                 isActive
36:                   ? "bg-white/15 text-white border-white/20"
37:                   : "bg-white/5 text-white/50 border-white/10 hover:text-white/70 hover:bg-white/10"
38:               }
39:             `}
40:           >
41:             {tab.label}
42:             <span
43:               className={`
44:                 text-[9px] font-bold tabular-nums leading-none
45:                 ${isActive ? "text-white/70" : "text-white/30"}
46:               `}
47:             >
48:               {counts[tab.key]}
49:             </span>
50:           </button>
51:         );
52:       })}
53:     </div>
54:   );
55: }
```

## File: src/components/dashboard/theme-provider.tsx
```typescript
1: "use client";
2: import * as React from "react";
3: import { ThemeProvider as NextThemesProvider } from "next-themes";
4: export function ThemeProvider({
5:   children,
6:   ...props
7: }: React.ComponentProps<typeof NextThemesProvider>) {
8:   return <NextThemesProvider {...props}>{children}</NextThemesProvider>;
9: }
```

## File: src/components/dashboard/theme-toggle.tsx
```typescript
 1: "use client";
 2: import { useTheme } from "next-themes";
 3: import { Sun, Moon } from "lucide-react";
 4: import { Button } from "@/components/ui/button";
 5: import {
 6:   Tooltip,
 7:   TooltipContent,
 8:   TooltipProvider,
 9:   TooltipTrigger,
10: } from "@/components/ui/tooltip";
11: export function ThemeToggle() {
12:   const { theme, setTheme } = useTheme();
13:   return (
14:     <TooltipProvider>
15:       <Tooltip>
16:         <TooltipTrigger asChild>
17:           <Button
18:             variant="ghost"
19:             size="icon"
20:             onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
21:             className="h-8 w-8 rounded-md text-white/70 hover:text-white hover:bg-white/10"
22:           >
23:             <Sun className="h-3.5 w-3.5 rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0" />
24:             <Moon className="absolute h-3.5 w-3.5 rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100" />
25:             <span className="sr-only">Переключить тему</span>
26:           </Button>
27:         </TooltipTrigger>
28:         <TooltipContent>
29:           <p className="text-xs">{theme === "dark" ? "Светлая тема" : "Тёмная тема"}</p>
30:         </TooltipContent>
31:       </Tooltip>
32:     </TooltipProvider>
33:   );
34: }
```

## File: src/components/ui/accordion.tsx
```typescript
 1: "use client"
 2: import * as React from "react"
 3: import * as AccordionPrimitive from "@radix-ui/react-accordion"
 4: import { ChevronDownIcon } from "lucide-react"
 5: import { cn } from "@/lib/utils"
 6: function Accordion({
 7:   ...props
 8: }: React.ComponentProps<typeof AccordionPrimitive.Root>) {
 9:   return <AccordionPrimitive.Root data-slot="accordion" {...props} />
10: }
11: function AccordionItem({
12:   className,
13:   ...props
14: }: React.ComponentProps<typeof AccordionPrimitive.Item>) {
15:   return (
16:     <AccordionPrimitive.Item
17:       data-slot="accordion-item"
18:       className={cn("border-b last:border-b-0", className)}
19:       {...props}
20:     />
21:   )
22: }
23: function AccordionTrigger({
24:   className,
25:   children,
26:   ...props
27: }: React.ComponentProps<typeof AccordionPrimitive.Trigger>) {
28:   return (
29:     <AccordionPrimitive.Header className="flex">
30:       <AccordionPrimitive.Trigger
31:         data-slot="accordion-trigger"
32:         className={cn(
33:           "focus-visible:border-ring focus-visible:ring-ring/50 flex flex-1 items-start justify-between gap-4 rounded-md py-4 text-left text-sm font-medium transition-all outline-none hover:underline focus-visible:ring-[3px] disabled:pointer-events-none disabled:opacity-50 [&[data-state=open]>svg]:rotate-180",
34:           className
35:         )}
36:         {...props}
37:       >
38:         {children}
39:         <ChevronDownIcon className="text-muted-foreground pointer-events-none size-4 shrink-0 translate-y-0.5 transition-transform duration-200" />
40:       </AccordionPrimitive.Trigger>
41:     </AccordionPrimitive.Header>
42:   )
43: }
44: function AccordionContent({
45:   className,
46:   children,
47:   ...props
48: }: React.ComponentProps<typeof AccordionPrimitive.Content>) {
49:   return (
50:     <AccordionPrimitive.Content
51:       data-slot="accordion-content"
52:       className="data-[state=closed]:animate-accordion-up data-[state=open]:animate-accordion-down overflow-hidden text-sm"
53:       {...props}
54:     >
55:       <div className={cn("pt-0 pb-4", className)}>{children}</div>
56:     </AccordionPrimitive.Content>
57:   )
58: }
59: export { Accordion, AccordionItem, AccordionTrigger, AccordionContent }
```

## File: src/components/ui/alert-dialog.tsx
```typescript
  1: "use client"
  2: import * as React from "react"
  3: import * as AlertDialogPrimitive from "@radix-ui/react-alert-dialog"
  4: import { cn } from "@/lib/utils"
  5: import { buttonVariants } from "@/components/ui/button"
  6: function AlertDialog({
  7:   ...props
  8: }: React.ComponentProps<typeof AlertDialogPrimitive.Root>) {
  9:   return <AlertDialogPrimitive.Root data-slot="alert-dialog" {...props} />
 10: }
 11: function AlertDialogTrigger({
 12:   ...props
 13: }: React.ComponentProps<typeof AlertDialogPrimitive.Trigger>) {
 14:   return (
 15:     <AlertDialogPrimitive.Trigger data-slot="alert-dialog-trigger" {...props} />
 16:   )
 17: }
 18: function AlertDialogPortal({
 19:   ...props
 20: }: React.ComponentProps<typeof AlertDialogPrimitive.Portal>) {
 21:   return (
 22:     <AlertDialogPrimitive.Portal data-slot="alert-dialog-portal" {...props} />
 23:   )
 24: }
 25: function AlertDialogOverlay({
 26:   className,
 27:   ...props
 28: }: React.ComponentProps<typeof AlertDialogPrimitive.Overlay>) {
 29:   return (
 30:     <AlertDialogPrimitive.Overlay
 31:       data-slot="alert-dialog-overlay"
 32:       className={cn(
 33:         "data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 fixed inset-0 z-50 bg-black/50",
 34:         className
 35:       )}
 36:       {...props}
 37:     />
 38:   )
 39: }
 40: function AlertDialogContent({
 41:   className,
 42:   ...props
 43: }: React.ComponentProps<typeof AlertDialogPrimitive.Content>) {
 44:   return (
 45:     <AlertDialogPortal>
 46:       <AlertDialogOverlay />
 47:       <AlertDialogPrimitive.Content
 48:         data-slot="alert-dialog-content"
 49:         className={cn(
 50:           "bg-background data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 fixed top-[50%] left-[50%] z-50 grid w-full max-w-[calc(100%-2rem)] translate-x-[-50%] translate-y-[-50%] gap-4 rounded-lg border p-6 shadow-lg duration-200 sm:max-w-lg",
 51:           className
 52:         )}
 53:         {...props}
 54:       />
 55:     </AlertDialogPortal>
 56:   )
 57: }
 58: function AlertDialogHeader({
 59:   className,
 60:   ...props
 61: }: React.ComponentProps<"div">) {
 62:   return (
 63:     <div
 64:       data-slot="alert-dialog-header"
 65:       className={cn("flex flex-col gap-2 text-center sm:text-left", className)}
 66:       {...props}
 67:     />
 68:   )
 69: }
 70: function AlertDialogFooter({
 71:   className,
 72:   ...props
 73: }: React.ComponentProps<"div">) {
 74:   return (
 75:     <div
 76:       data-slot="alert-dialog-footer"
 77:       className={cn(
 78:         "flex flex-col-reverse gap-2 sm:flex-row sm:justify-end",
 79:         className
 80:       )}
 81:       {...props}
 82:     />
 83:   )
 84: }
 85: function AlertDialogTitle({
 86:   className,
 87:   ...props
 88: }: React.ComponentProps<typeof AlertDialogPrimitive.Title>) {
 89:   return (
 90:     <AlertDialogPrimitive.Title
 91:       data-slot="alert-dialog-title"
 92:       className={cn("text-lg font-semibold", className)}
 93:       {...props}
 94:     />
 95:   )
 96: }
 97: function AlertDialogDescription({
 98:   className,
 99:   ...props
100: }: React.ComponentProps<typeof AlertDialogPrimitive.Description>) {
101:   return (
102:     <AlertDialogPrimitive.Description
103:       data-slot="alert-dialog-description"
104:       className={cn("text-muted-foreground text-sm", className)}
105:       {...props}
106:     />
107:   )
108: }
109: function AlertDialogAction({
110:   className,
111:   ...props
112: }: React.ComponentProps<typeof AlertDialogPrimitive.Action>) {
113:   return (
114:     <AlertDialogPrimitive.Action
115:       className={cn(buttonVariants(), className)}
116:       {...props}
117:     />
118:   )
119: }
120: function AlertDialogCancel({
121:   className,
122:   ...props
123: }: React.ComponentProps<typeof AlertDialogPrimitive.Cancel>) {
124:   return (
125:     <AlertDialogPrimitive.Cancel
126:       className={cn(buttonVariants({ variant: "outline" }), className)}
127:       {...props}
128:     />
129:   )
130: }
131: export {
132:   AlertDialog,
133:   AlertDialogPortal,
134:   AlertDialogOverlay,
135:   AlertDialogTrigger,
136:   AlertDialogContent,
137:   AlertDialogHeader,
138:   AlertDialogFooter,
139:   AlertDialogTitle,
140:   AlertDialogDescription,
141:   AlertDialogAction,
142:   AlertDialogCancel,
143: }
```

## File: src/components/ui/alert.tsx
```typescript
 1: import * as React from "react"
 2: import { cva, type VariantProps } from "class-variance-authority"
 3: import { cn } from "@/lib/utils"
 4: const alertVariants = cva(
 5:   "relative w-full rounded-lg border px-4 py-3 text-sm grid has-[>svg]:grid-cols-[calc(var(--spacing)*4)_1fr] grid-cols-[0_1fr] has-[>svg]:gap-x-3 gap-y-0.5 items-start [&>svg]:size-4 [&>svg]:translate-y-0.5 [&>svg]:text-current",
 6:   {
 7:     variants: {
 8:       variant: {
 9:         default: "bg-card text-card-foreground",
10:         destructive:
11:           "text-destructive bg-card [&>svg]:text-current *:data-[slot=alert-description]:text-destructive/90",
12:       },
13:     },
14:     defaultVariants: {
15:       variant: "default",
16:     },
17:   }
18: )
19: function Alert({
20:   className,
21:   variant,
22:   ...props
23: }: React.ComponentProps<"div"> & VariantProps<typeof alertVariants>) {
24:   return (
25:     <div
26:       data-slot="alert"
27:       role="alert"
28:       className={cn(alertVariants({ variant }), className)}
29:       {...props}
30:     />
31:   )
32: }
33: function AlertTitle({ className, ...props }: React.ComponentProps<"div">) {
34:   return (
35:     <div
36:       data-slot="alert-title"
37:       className={cn(
38:         "col-start-2 line-clamp-1 min-h-4 font-medium tracking-tight",
39:         className
40:       )}
41:       {...props}
42:     />
43:   )
44: }
45: function AlertDescription({
46:   className,
47:   ...props
48: }: React.ComponentProps<"div">) {
49:   return (
50:     <div
51:       data-slot="alert-description"
52:       className={cn(
53:         "text-muted-foreground col-start-2 grid justify-items-start gap-1 text-sm [&_p]:leading-relaxed",
54:         className
55:       )}
56:       {...props}
57:     />
58:   )
59: }
60: export { Alert, AlertTitle, AlertDescription }
```

## File: src/components/ui/aspect-ratio.tsx
```typescript
1: "use client"
2: import * as AspectRatioPrimitive from "@radix-ui/react-aspect-ratio"
3: function AspectRatio({
4:   ...props
5: }: React.ComponentProps<typeof AspectRatioPrimitive.Root>) {
6:   return <AspectRatioPrimitive.Root data-slot="aspect-ratio" {...props} />
7: }
8: export { AspectRatio }
```

## File: src/components/ui/avatar.tsx
```typescript
 1: "use client"
 2: import * as React from "react"
 3: import * as AvatarPrimitive from "@radix-ui/react-avatar"
 4: import { cn } from "@/lib/utils"
 5: function Avatar({
 6:   className,
 7:   ...props
 8: }: React.ComponentProps<typeof AvatarPrimitive.Root>) {
 9:   return (
10:     <AvatarPrimitive.Root
11:       data-slot="avatar"
12:       className={cn(
13:         "relative flex size-8 shrink-0 overflow-hidden rounded-full",
14:         className
15:       )}
16:       {...props}
17:     />
18:   )
19: }
20: function AvatarImage({
21:   className,
22:   ...props
23: }: React.ComponentProps<typeof AvatarPrimitive.Image>) {
24:   return (
25:     <AvatarPrimitive.Image
26:       data-slot="avatar-image"
27:       className={cn("aspect-square size-full", className)}
28:       {...props}
29:     />
30:   )
31: }
32: function AvatarFallback({
33:   className,
34:   ...props
35: }: React.ComponentProps<typeof AvatarPrimitive.Fallback>) {
36:   return (
37:     <AvatarPrimitive.Fallback
38:       data-slot="avatar-fallback"
39:       className={cn(
40:         "bg-muted flex size-full items-center justify-center rounded-full",
41:         className
42:       )}
43:       {...props}
44:     />
45:   )
46: }
47: export { Avatar, AvatarImage, AvatarFallback }
```

## File: src/components/ui/badge.tsx
```typescript
 1: import * as React from "react"
 2: import { Slot } from "@radix-ui/react-slot"
 3: import { cva, type VariantProps } from "class-variance-authority"
 4: import { cn } from "@/lib/utils"
 5: const badgeVariants = cva(
 6:   "inline-flex items-center justify-center rounded-md border px-2 py-0.5 text-xs font-medium w-fit whitespace-nowrap shrink-0 [&>svg]:size-3 gap-1 [&>svg]:pointer-events-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive transition-[color,box-shadow] overflow-hidden",
 7:   {
 8:     variants: {
 9:       variant: {
10:         default:
11:           "border-transparent bg-primary text-primary-foreground [a&]:hover:bg-primary/90",
12:         secondary:
13:           "border-transparent bg-secondary text-secondary-foreground [a&]:hover:bg-secondary/90",
14:         destructive:
15:           "border-transparent bg-destructive text-white [a&]:hover:bg-destructive/90 focus-visible:ring-destructive/20 dark:focus-visible:ring-destructive/40 dark:bg-destructive/60",
16:         outline:
17:           "text-foreground [a&]:hover:bg-accent [a&]:hover:text-accent-foreground",
18:       },
19:     },
20:     defaultVariants: {
21:       variant: "default",
22:     },
23:   }
24: )
25: function Badge({
26:   className,
27:   variant,
28:   asChild = false,
29:   ...props
30: }: React.ComponentProps<"span"> &
31:   VariantProps<typeof badgeVariants> & { asChild?: boolean }) {
32:   const Comp = asChild ? Slot : "span"
33:   return (
34:     <Comp
35:       data-slot="badge"
36:       className={cn(badgeVariants({ variant }), className)}
37:       {...props}
38:     />
39:   )
40: }
41: export { Badge, badgeVariants }
```

## File: src/components/ui/breadcrumb.tsx
```typescript
 1: import * as React from "react"
 2: import { Slot } from "@radix-ui/react-slot"
 3: import { ChevronRight, MoreHorizontal } from "lucide-react"
 4: import { cn } from "@/lib/utils"
 5: function Breadcrumb({ ...props }: React.ComponentProps<"nav">) {
 6:   return <nav aria-label="breadcrumb" data-slot="breadcrumb" {...props} />
 7: }
 8: function BreadcrumbList({ className, ...props }: React.ComponentProps<"ol">) {
 9:   return (
10:     <ol
11:       data-slot="breadcrumb-list"
12:       className={cn(
13:         "text-muted-foreground flex flex-wrap items-center gap-1.5 text-sm break-words sm:gap-2.5",
14:         className
15:       )}
16:       {...props}
17:     />
18:   )
19: }
20: function BreadcrumbItem({ className, ...props }: React.ComponentProps<"li">) {
21:   return (
22:     <li
23:       data-slot="breadcrumb-item"
24:       className={cn("inline-flex items-center gap-1.5", className)}
25:       {...props}
26:     />
27:   )
28: }
29: function BreadcrumbLink({
30:   asChild,
31:   className,
32:   ...props
33: }: React.ComponentProps<"a"> & {
34:   asChild?: boolean
35: }) {
36:   const Comp = asChild ? Slot : "a"
37:   return (
38:     <Comp
39:       data-slot="breadcrumb-link"
40:       className={cn("hover:text-foreground transition-colors", className)}
41:       {...props}
42:     />
43:   )
44: }
45: function BreadcrumbPage({ className, ...props }: React.ComponentProps<"span">) {
46:   return (
47:     <span
48:       data-slot="breadcrumb-page"
49:       role="link"
50:       aria-disabled="true"
51:       aria-current="page"
52:       className={cn("text-foreground font-normal", className)}
53:       {...props}
54:     />
55:   )
56: }
57: function BreadcrumbSeparator({
58:   children,
59:   className,
60:   ...props
61: }: React.ComponentProps<"li">) {
62:   return (
63:     <li
64:       data-slot="breadcrumb-separator"
65:       role="presentation"
66:       aria-hidden="true"
67:       className={cn("[&>svg]:size-3.5", className)}
68:       {...props}
69:     >
70:       {children ?? <ChevronRight />}
71:     </li>
72:   )
73: }
74: function BreadcrumbEllipsis({
75:   className,
76:   ...props
77: }: React.ComponentProps<"span">) {
78:   return (
79:     <span
80:       data-slot="breadcrumb-ellipsis"
81:       role="presentation"
82:       aria-hidden="true"
83:       className={cn("flex size-9 items-center justify-center", className)}
84:       {...props}
85:     >
86:       <MoreHorizontal className="size-4" />
87:       <span className="sr-only">More</span>
88:     </span>
89:   )
90: }
91: export {
92:   Breadcrumb,
93:   BreadcrumbList,
94:   BreadcrumbItem,
95:   BreadcrumbLink,
96:   BreadcrumbPage,
97:   BreadcrumbSeparator,
98:   BreadcrumbEllipsis,
99: }
```

## File: src/components/ui/button.tsx
```typescript
 1: import * as React from "react"
 2: import { Slot } from "@radix-ui/react-slot"
 3: import { cva, type VariantProps } from "class-variance-authority"
 4: import { cn } from "@/lib/utils"
 5: const buttonVariants = cva(
 6:   "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-all disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4 shrink-0 [&_svg]:shrink-0 outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive",
 7:   {
 8:     variants: {
 9:       variant: {
10:         default:
11:           "bg-primary text-primary-foreground shadow-xs hover:bg-primary/90",
12:         destructive:
13:           "bg-destructive text-white shadow-xs hover:bg-destructive/90 focus-visible:ring-destructive/20 dark:focus-visible:ring-destructive/40 dark:bg-destructive/60",
14:         outline:
15:           "border bg-background shadow-xs hover:bg-accent hover:text-accent-foreground dark:bg-input/30 dark:border-input dark:hover:bg-input/50",
16:         secondary:
17:           "bg-secondary text-secondary-foreground shadow-xs hover:bg-secondary/80",
18:         ghost:
19:           "hover:bg-accent hover:text-accent-foreground dark:hover:bg-accent/50",
20:         link: "text-primary underline-offset-4 hover:underline",
21:       },
22:       size: {
23:         default: "h-9 px-4 py-2 has-[>svg]:px-3",
24:         sm: "h-8 rounded-md gap-1.5 px-3 has-[>svg]:px-2.5",
25:         lg: "h-10 rounded-md px-6 has-[>svg]:px-4",
26:         icon: "size-9",
27:       },
28:     },
29:     defaultVariants: {
30:       variant: "default",
31:       size: "default",
32:     },
33:   }
34: )
35: function Button({
36:   className,
37:   variant,
38:   size,
39:   asChild = false,
40:   ...props
41: }: React.ComponentProps<"button"> &
42:   VariantProps<typeof buttonVariants> & {
43:     asChild?: boolean
44:   }) {
45:   const Comp = asChild ? Slot : "button"
46:   return (
47:     <Comp
48:       data-slot="button"
49:       className={cn(buttonVariants({ variant, size, className }))}
50:       {...props}
51:     />
52:   )
53: }
54: export { Button, buttonVariants }
```

## File: src/components/ui/calendar.tsx
```typescript
  1: "use client"
  2: import * as React from "react"
  3: import {
  4:   ChevronDownIcon,
  5:   ChevronLeftIcon,
  6:   ChevronRightIcon,
  7: } from "lucide-react"
  8: import { DayButton, DayPicker, getDefaultClassNames } from "react-day-picker"
  9: import { cn } from "@/lib/utils"
 10: import { Button, buttonVariants } from "@/components/ui/button"
 11: function Calendar({
 12:   className,
 13:   classNames,
 14:   showOutsideDays = true,
 15:   captionLayout = "label",
 16:   buttonVariant = "ghost",
 17:   formatters,
 18:   components,
 19:   ...props
 20: }: React.ComponentProps<typeof DayPicker> & {
 21:   buttonVariant?: React.ComponentProps<typeof Button>["variant"]
 22: }) {
 23:   const defaultClassNames = getDefaultClassNames()
 24:   return (
 25:     <DayPicker
 26:       showOutsideDays={showOutsideDays}
 27:       className={cn(
 28:         "bg-background group/calendar p-3 [--cell-size:--spacing(8)] [[data-slot=card-content]_&]:bg-transparent [[data-slot=popover-content]_&]:bg-transparent",
 29:         String.raw`rtl:**:[.rdp-button\_next>svg]:rotate-180`,
 30:         String.raw`rtl:**:[.rdp-button\_previous>svg]:rotate-180`,
 31:         className
 32:       )}
 33:       captionLayout={captionLayout}
 34:       formatters={{
 35:         formatMonthDropdown: (date) =>
 36:           date.toLocaleString("default", { month: "short" }),
 37:         ...formatters,
 38:       }}
 39:       classNames={{
 40:         root: cn("w-fit", defaultClassNames.root),
 41:         months: cn(
 42:           "flex gap-4 flex-col md:flex-row relative",
 43:           defaultClassNames.months
 44:         ),
 45:         month: cn("flex flex-col w-full gap-4", defaultClassNames.month),
 46:         nav: cn(
 47:           "flex items-center gap-1 w-full absolute top-0 inset-x-0 justify-between",
 48:           defaultClassNames.nav
 49:         ),
 50:         button_previous: cn(
 51:           buttonVariants({ variant: buttonVariant }),
 52:           "size-(--cell-size) aria-disabled:opacity-50 p-0 select-none",
 53:           defaultClassNames.button_previous
 54:         ),
 55:         button_next: cn(
 56:           buttonVariants({ variant: buttonVariant }),
 57:           "size-(--cell-size) aria-disabled:opacity-50 p-0 select-none",
 58:           defaultClassNames.button_next
 59:         ),
 60:         month_caption: cn(
 61:           "flex items-center justify-center h-(--cell-size) w-full px-(--cell-size)",
 62:           defaultClassNames.month_caption
 63:         ),
 64:         dropdowns: cn(
 65:           "w-full flex items-center text-sm font-medium justify-center h-(--cell-size) gap-1.5",
 66:           defaultClassNames.dropdowns
 67:         ),
 68:         dropdown_root: cn(
 69:           "relative has-focus:border-ring border border-input shadow-xs has-focus:ring-ring/50 has-focus:ring-[3px] rounded-md",
 70:           defaultClassNames.dropdown_root
 71:         ),
 72:         dropdown: cn(
 73:           "absolute bg-popover inset-0 opacity-0",
 74:           defaultClassNames.dropdown
 75:         ),
 76:         caption_label: cn(
 77:           "select-none font-medium",
 78:           captionLayout === "label"
 79:             ? "text-sm"
 80:             : "rounded-md pl-2 pr-1 flex items-center gap-1 text-sm h-8 [&>svg]:text-muted-foreground [&>svg]:size-3.5",
 81:           defaultClassNames.caption_label
 82:         ),
 83:         table: "w-full border-collapse",
 84:         weekdays: cn("flex", defaultClassNames.weekdays),
 85:         weekday: cn(
 86:           "text-muted-foreground rounded-md flex-1 font-normal text-[0.8rem] select-none",
 87:           defaultClassNames.weekday
 88:         ),
 89:         week: cn("flex w-full mt-2", defaultClassNames.week),
 90:         week_number_header: cn(
 91:           "select-none w-(--cell-size)",
 92:           defaultClassNames.week_number_header
 93:         ),
 94:         week_number: cn(
 95:           "text-[0.8rem] select-none text-muted-foreground",
 96:           defaultClassNames.week_number
 97:         ),
 98:         day: cn(
 99:           "relative w-full h-full p-0 text-center [&:first-child[data-selected=true]_button]:rounded-l-md [&:last-child[data-selected=true]_button]:rounded-r-md group/day aspect-square select-none",
100:           defaultClassNames.day
101:         ),
102:         range_start: cn(
103:           "rounded-l-md bg-accent",
104:           defaultClassNames.range_start
105:         ),
106:         range_middle: cn("rounded-none", defaultClassNames.range_middle),
107:         range_end: cn("rounded-r-md bg-accent", defaultClassNames.range_end),
108:         today: cn(
109:           "bg-accent text-accent-foreground rounded-md data-[selected=true]:rounded-none",
110:           defaultClassNames.today
111:         ),
112:         outside: cn(
113:           "text-muted-foreground aria-selected:text-muted-foreground",
114:           defaultClassNames.outside
115:         ),
116:         disabled: cn(
117:           "text-muted-foreground opacity-50",
118:           defaultClassNames.disabled
119:         ),
120:         hidden: cn("invisible", defaultClassNames.hidden),
121:         ...classNames,
122:       }}
123:       components={{
124:         Root: ({ className, rootRef, ...props }) => {
125:           return (
126:             <div
127:               data-slot="calendar"
128:               ref={rootRef}
129:               className={cn(className)}
130:               {...props}
131:             />
132:           )
133:         },
134:         Chevron: ({ className, orientation, ...props }) => {
135:           if (orientation === "left") {
136:             return (
137:               <ChevronLeftIcon className={cn("size-4", className)} {...props} />
138:             )
139:           }
140:           if (orientation === "right") {
141:             return (
142:               <ChevronRightIcon
143:                 className={cn("size-4", className)}
144:                 {...props}
145:               />
146:             )
147:           }
148:           return (
149:             <ChevronDownIcon className={cn("size-4", className)} {...props} />
150:           )
151:         },
152:         DayButton: CalendarDayButton,
153:         WeekNumber: ({ children, ...props }) => {
154:           return (
155:             <td {...props}>
156:               <div className="flex size-(--cell-size) items-center justify-center text-center">
157:                 {children}
158:               </div>
159:             </td>
160:           )
161:         },
162:         ...components,
163:       }}
164:       {...props}
165:     />
166:   )
167: }
168: function CalendarDayButton({
169:   className,
170:   day,
171:   modifiers,
172:   ...props
173: }: React.ComponentProps<typeof DayButton>) {
174:   const defaultClassNames = getDefaultClassNames()
175:   const ref = React.useRef<HTMLButtonElement>(null)
176:   React.useEffect(() => {
177:     if (modifiers.focused) ref.current?.focus()
178:   }, [modifiers.focused])
179:   return (
180:     <Button
181:       ref={ref}
182:       variant="ghost"
183:       size="icon"
184:       data-day={day.date.toLocaleDateString()}
185:       data-selected-single={
186:         modifiers.selected &&
187:         !modifiers.range_start &&
188:         !modifiers.range_end &&
189:         !modifiers.range_middle
190:       }
191:       data-range-start={modifiers.range_start}
192:       data-range-end={modifiers.range_end}
193:       data-range-middle={modifiers.range_middle}
194:       className={cn(
195:         "data-[selected-single=true]:bg-primary data-[selected-single=true]:text-primary-foreground data-[range-middle=true]:bg-accent data-[range-middle=true]:text-accent-foreground data-[range-start=true]:bg-primary data-[range-start=true]:text-primary-foreground data-[range-end=true]:bg-primary data-[range-end=true]:text-primary-foreground group-data-[focused=true]/day:border-ring group-data-[focused=true]/day:ring-ring/50 dark:hover:text-accent-foreground flex aspect-square size-auto w-full min-w-(--cell-size) flex-col gap-1 leading-none font-normal group-data-[focused=true]/day:relative group-data-[focused=true]/day:z-10 group-data-[focused=true]/day:ring-[3px] data-[range-end=true]:rounded-md data-[range-end=true]:rounded-r-md data-[range-middle=true]:rounded-none data-[range-start=true]:rounded-md data-[range-start=true]:rounded-l-md [&>span]:text-xs [&>span]:opacity-70",
196:         defaultClassNames.day,
197:         className
198:       )}
199:       {...props}
200:     />
201:   )
202: }
203: export { Calendar, CalendarDayButton }
```

## File: src/components/ui/card.tsx
```typescript
 1: import * as React from "react"
 2: import { cn } from "@/lib/utils"
 3: function Card({ className, ...props }: React.ComponentProps<"div">) {
 4:   return (
 5:     <div
 6:       data-slot="card"
 7:       className={cn(
 8:         "bg-card text-card-foreground flex flex-col gap-6 rounded-xl border py-6 shadow-sm",
 9:         className
10:       )}
11:       {...props}
12:     />
13:   )
14: }
15: function CardHeader({ className, ...props }: React.ComponentProps<"div">) {
16:   return (
17:     <div
18:       data-slot="card-header"
19:       className={cn(
20:         "@container/card-header grid auto-rows-min grid-rows-[auto_auto] items-start gap-1.5 px-6 has-data-[slot=card-action]:grid-cols-[1fr_auto] [.border-b]:pb-6",
21:         className
22:       )}
23:       {...props}
24:     />
25:   )
26: }
27: function CardTitle({ className, ...props }: React.ComponentProps<"div">) {
28:   return (
29:     <div
30:       data-slot="card-title"
31:       className={cn("leading-none font-semibold", className)}
32:       {...props}
33:     />
34:   )
35: }
36: function CardDescription({ className, ...props }: React.ComponentProps<"div">) {
37:   return (
38:     <div
39:       data-slot="card-description"
40:       className={cn("text-muted-foreground text-sm", className)}
41:       {...props}
42:     />
43:   )
44: }
45: function CardAction({ className, ...props }: React.ComponentProps<"div">) {
46:   return (
47:     <div
48:       data-slot="card-action"
49:       className={cn(
50:         "col-start-2 row-span-2 row-start-1 self-start justify-self-end",
51:         className
52:       )}
53:       {...props}
54:     />
55:   )
56: }
57: function CardContent({ className, ...props }: React.ComponentProps<"div">) {
58:   return (
59:     <div
60:       data-slot="card-content"
61:       className={cn("px-6", className)}
62:       {...props}
63:     />
64:   )
65: }
66: function CardFooter({ className, ...props }: React.ComponentProps<"div">) {
67:   return (
68:     <div
69:       data-slot="card-footer"
70:       className={cn("flex items-center px-6 [.border-t]:pt-6", className)}
71:       {...props}
72:     />
73:   )
74: }
75: export {
76:   Card,
77:   CardHeader,
78:   CardFooter,
79:   CardTitle,
80:   CardAction,
81:   CardDescription,
82:   CardContent,
83: }
```

## File: src/components/ui/carousel.tsx
```typescript
  1: "use client"
  2: import * as React from "react"
  3: import useEmblaCarousel, {
  4:   type UseEmblaCarouselType,
  5: } from "embla-carousel-react"
  6: import { ArrowLeft, ArrowRight } from "lucide-react"
  7: import { cn } from "@/lib/utils"
  8: import { Button } from "@/components/ui/button"
  9: type CarouselApi = UseEmblaCarouselType[1]
 10: type UseCarouselParameters = Parameters<typeof useEmblaCarousel>
 11: type CarouselOptions = UseCarouselParameters[0]
 12: type CarouselPlugin = UseCarouselParameters[1]
 13: type CarouselProps = {
 14:   opts?: CarouselOptions
 15:   plugins?: CarouselPlugin
 16:   orientation?: "horizontal" | "vertical"
 17:   setApi?: (api: CarouselApi) => void
 18: }
 19: type CarouselContextProps = {
 20:   carouselRef: ReturnType<typeof useEmblaCarousel>[0]
 21:   api: ReturnType<typeof useEmblaCarousel>[1]
 22:   scrollPrev: () => void
 23:   scrollNext: () => void
 24:   canScrollPrev: boolean
 25:   canScrollNext: boolean
 26: } & CarouselProps
 27: const CarouselContext = React.createContext<CarouselContextProps | null>(null)
 28: function useCarousel() {
 29:   const context = React.useContext(CarouselContext)
 30:   if (!context) {
 31:     throw new Error("useCarousel must be used within a <Carousel />")
 32:   }
 33:   return context
 34: }
 35: function Carousel({
 36:   orientation = "horizontal",
 37:   opts,
 38:   setApi,
 39:   plugins,
 40:   className,
 41:   children,
 42:   ...props
 43: }: React.ComponentProps<"div"> & CarouselProps) {
 44:   const [carouselRef, api] = useEmblaCarousel(
 45:     {
 46:       ...opts,
 47:       axis: orientation === "horizontal" ? "x" : "y",
 48:     },
 49:     plugins
 50:   )
 51:   const [canScrollPrev, setCanScrollPrev] = React.useState(false)
 52:   const [canScrollNext, setCanScrollNext] = React.useState(false)
 53:   const onSelect = React.useCallback((api: CarouselApi) => {
 54:     if (!api) return
 55:     setCanScrollPrev(api.canScrollPrev())
 56:     setCanScrollNext(api.canScrollNext())
 57:   }, [])
 58:   const scrollPrev = React.useCallback(() => {
 59:     api?.scrollPrev()
 60:   }, [api])
 61:   const scrollNext = React.useCallback(() => {
 62:     api?.scrollNext()
 63:   }, [api])
 64:   const handleKeyDown = React.useCallback(
 65:     (event: React.KeyboardEvent<HTMLDivElement>) => {
 66:       if (event.key === "ArrowLeft") {
 67:         event.preventDefault()
 68:         scrollPrev()
 69:       } else if (event.key === "ArrowRight") {
 70:         event.preventDefault()
 71:         scrollNext()
 72:       }
 73:     },
 74:     [scrollPrev, scrollNext]
 75:   )
 76:   React.useEffect(() => {
 77:     if (!api || !setApi) return
 78:     setApi(api)
 79:   }, [api, setApi])
 80:   React.useEffect(() => {
 81:     if (!api) return
 82:     // eslint-disable-next-line react-hooks/set-state-in-effect
 83:     onSelect(api)
 84:     api.on("reInit", onSelect)
 85:     api.on("select", onSelect)
 86:     return () => {
 87:       api?.off("select", onSelect)
 88:     }
 89:   }, [api, onSelect])
 90:   return (
 91:     <CarouselContext.Provider
 92:       value={{
 93:         carouselRef,
 94:         api: api,
 95:         opts,
 96:         orientation:
 97:           orientation || (opts?.axis === "y" ? "vertical" : "horizontal"),
 98:         scrollPrev,
 99:         scrollNext,
100:         canScrollPrev,
101:         canScrollNext,
102:       }}
103:     >
104:       <div
105:         onKeyDownCapture={handleKeyDown}
106:         className={cn("relative", className)}
107:         role="region"
108:         aria-roledescription="carousel"
109:         data-slot="carousel"
110:         {...props}
111:       >
112:         {children}
113:       </div>
114:     </CarouselContext.Provider>
115:   )
116: }
117: function CarouselContent({ className, ...props }: React.ComponentProps<"div">) {
118:   const { carouselRef, orientation } = useCarousel()
119:   return (
120:     <div
121:       ref={carouselRef}
122:       className="overflow-hidden"
123:       data-slot="carousel-content"
124:     >
125:       <div
126:         className={cn(
127:           "flex",
128:           orientation === "horizontal" ? "-ml-4" : "-mt-4 flex-col",
129:           className
130:         )}
131:         {...props}
132:       />
133:     </div>
134:   )
135: }
136: function CarouselItem({ className, ...props }: React.ComponentProps<"div">) {
137:   const { orientation } = useCarousel()
138:   return (
139:     <div
140:       role="group"
141:       aria-roledescription="slide"
142:       data-slot="carousel-item"
143:       className={cn(
144:         "min-w-0 shrink-0 grow-0 basis-full",
145:         orientation === "horizontal" ? "pl-4" : "pt-4",
146:         className
147:       )}
148:       {...props}
149:     />
150:   )
151: }
152: function CarouselPrevious({
153:   className,
154:   variant = "outline",
155:   size = "icon",
156:   ...props
157: }: React.ComponentProps<typeof Button>) {
158:   const { orientation, scrollPrev, canScrollPrev } = useCarousel()
159:   return (
160:     <Button
161:       data-slot="carousel-previous"
162:       variant={variant}
163:       size={size}
164:       className={cn(
165:         "absolute size-8 rounded-full",
166:         orientation === "horizontal"
167:           ? "top-1/2 -left-12 -translate-y-1/2"
168:           : "-top-12 left-1/2 -translate-x-1/2 rotate-90",
169:         className
170:       )}
171:       disabled={!canScrollPrev}
172:       onClick={scrollPrev}
173:       {...props}
174:     >
175:       <ArrowLeft />
176:       <span className="sr-only">Previous slide</span>
177:     </Button>
178:   )
179: }
180: function CarouselNext({
181:   className,
182:   variant = "outline",
183:   size = "icon",
184:   ...props
185: }: React.ComponentProps<typeof Button>) {
186:   const { orientation, scrollNext, canScrollNext } = useCarousel()
187:   return (
188:     <Button
189:       data-slot="carousel-next"
190:       variant={variant}
191:       size={size}
192:       className={cn(
193:         "absolute size-8 rounded-full",
194:         orientation === "horizontal"
195:           ? "top-1/2 -right-12 -translate-y-1/2"
196:           : "-bottom-12 left-1/2 -translate-x-1/2 rotate-90",
197:         className
198:       )}
199:       disabled={!canScrollNext}
200:       onClick={scrollNext}
201:       {...props}
202:     >
203:       <ArrowRight />
204:       <span className="sr-only">Next slide</span>
205:     </Button>
206:   )
207: }
208: export {
209:   type CarouselApi,
210:   Carousel,
211:   CarouselContent,
212:   CarouselItem,
213:   CarouselPrevious,
214:   CarouselNext,
215: }
```

## File: src/components/ui/chart.tsx
```typescript
  1: "use client"
  2: import * as React from "react"
  3: import * as RechartsPrimitive from "recharts"
  4: import { cn } from "@/lib/utils"
  5: // Format: { THEME_NAME: CSS_SELECTOR }
  6: const THEMES = { light: "", dark: ".dark" } as const
  7: export type ChartConfig = {
  8:   [k in string]: {
  9:     label?: React.ReactNode
 10:     icon?: React.ComponentType
 11:   } & (
 12:     | { color?: string; theme?: never }
 13:     | { color?: never; theme: Record<keyof typeof THEMES, string> }
 14:   )
 15: }
 16: type ChartContextProps = {
 17:   config: ChartConfig
 18: }
 19: const ChartContext = React.createContext<ChartContextProps | null>(null)
 20: function useChart() {
 21:   const context = React.useContext(ChartContext)
 22:   if (!context) {
 23:     throw new Error("useChart must be used within a <ChartContainer />")
 24:   }
 25:   return context
 26: }
 27: function ChartContainer({
 28:   id,
 29:   className,
 30:   children,
 31:   config,
 32:   ...props
 33: }: React.ComponentProps<"div"> & {
 34:   config: ChartConfig
 35:   children: React.ComponentProps<
 36:     typeof RechartsPrimitive.ResponsiveContainer
 37:   >["children"]
 38: }) {
 39:   const uniqueId = React.useId()
 40:   const chartId = `chart-${id || uniqueId.replace(/:/g, "")}`
 41:   return (
 42:     <ChartContext.Provider value={{ config }}>
 43:       <div
 44:         data-slot="chart"
 45:         data-chart={chartId}
 46:         className={cn(
 47:           "[&_.recharts-cartesian-axis-tick_text]:fill-muted-foreground [&_.recharts-cartesian-grid_line[stroke='#ccc']]:stroke-border/50 [&_.recharts-curve.recharts-tooltip-cursor]:stroke-border [&_.recharts-polar-grid_[stroke='#ccc']]:stroke-border [&_.recharts-radial-bar-background-sector]:fill-muted [&_.recharts-rectangle.recharts-tooltip-cursor]:fill-muted [&_.recharts-reference-line_[stroke='#ccc']]:stroke-border flex aspect-video justify-center text-xs [&_.recharts-dot[stroke='#fff']]:stroke-transparent [&_.recharts-layer]:outline-hidden [&_.recharts-sector]:outline-hidden [&_.recharts-sector[stroke='#fff']]:stroke-transparent [&_.recharts-surface]:outline-hidden",
 48:           className
 49:         )}
 50:         {...props}
 51:       >
 52:         <ChartStyle id={chartId} config={config} />
 53:         <RechartsPrimitive.ResponsiveContainer>
 54:           {children}
 55:         </RechartsPrimitive.ResponsiveContainer>
 56:       </div>
 57:     </ChartContext.Provider>
 58:   )
 59: }
 60: const ChartStyle = ({ id, config }: { id: string; config: ChartConfig }) => {
 61:   const colorConfig = Object.entries(config).filter(
 62:     ([, config]) => config.theme || config.color
 63:   )
 64:   if (!colorConfig.length) {
 65:     return null
 66:   }
 67:   return (
 68:     <style
 69:       dangerouslySetInnerHTML={{
 70:         __html: Object.entries(THEMES)
 71:           .map(
 72:             ([theme, prefix]) => `
 73: ${prefix} [data-chart=${id}] {
 74: ${colorConfig
 75:   .map(([key, itemConfig]) => {
 76:     const color =
 77:       itemConfig.theme?.[theme as keyof typeof itemConfig.theme] ||
 78:       itemConfig.color
 79:     return color ? `  --color-${key}: ${color};` : null
 80:   })
 81:   .join("\n")}
 82: }
 83: `
 84:           )
 85:           .join("\n"),
 86:       }}
 87:     />
 88:   )
 89: }
 90: const ChartTooltip = RechartsPrimitive.Tooltip
 91: function ChartTooltipContent({
 92:   active,
 93:   payload,
 94:   className,
 95:   indicator = "dot",
 96:   hideLabel = false,
 97:   hideIndicator = false,
 98:   label,
 99:   labelFormatter,
100:   labelClassName,
101:   formatter,
102:   color,
103:   nameKey,
104:   labelKey,
105: }: React.ComponentProps<typeof RechartsPrimitive.Tooltip> &
106:   React.ComponentProps<"div"> & {
107:     hideLabel?: boolean
108:     hideIndicator?: boolean
109:     indicator?: "line" | "dot" | "dashed"
110:     nameKey?: string
111:     labelKey?: string
112:   }) {
113:   const { config } = useChart()
114:   const tooltipLabel = React.useMemo(() => {
115:     if (hideLabel || !payload?.length) {
116:       return null
117:     }
118:     const [item] = payload
119:     const key = `${labelKey || item?.dataKey || item?.name || "value"}`
120:     const itemConfig = getPayloadConfigFromPayload(config, item, key)
121:     const value =
122:       !labelKey && typeof label === "string"
123:         ? config[label as keyof typeof config]?.label || label
124:         : itemConfig?.label
125:     if (labelFormatter) {
126:       return (
127:         <div className={cn("font-medium", labelClassName)}>
128:           {labelFormatter(value, payload)}
129:         </div>
130:       )
131:     }
132:     if (!value) {
133:       return null
134:     }
135:     return <div className={cn("font-medium", labelClassName)}>{value}</div>
136:   }, [
137:     label,
138:     labelFormatter,
139:     payload,
140:     hideLabel,
141:     labelClassName,
142:     config,
143:     labelKey,
144:   ])
145:   if (!active || !payload?.length) {
146:     return null
147:   }
148:   const nestLabel = payload.length === 1 && indicator !== "dot"
149:   return (
150:     <div
151:       className={cn(
152:         "border-border/50 bg-background grid min-w-[8rem] items-start gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs shadow-xl",
153:         className
154:       )}
155:     >
156:       {!nestLabel ? tooltipLabel : null}
157:       <div className="grid gap-1.5">
158:         {payload.map((item, index) => {
159:           const key = `${nameKey || item.name || item.dataKey || "value"}`
160:           const itemConfig = getPayloadConfigFromPayload(config, item, key)
161:           const indicatorColor = color || item.payload.fill || item.color
162:           return (
163:             <div
164:               key={item.dataKey}
165:               className={cn(
166:                 "[&>svg]:text-muted-foreground flex w-full flex-wrap items-stretch gap-2 [&>svg]:h-2.5 [&>svg]:w-2.5",
167:                 indicator === "dot" && "items-center"
168:               )}
169:             >
170:               {formatter && item?.value !== undefined && item.name ? (
171:                 formatter(item.value, item.name, item, index, item.payload)
172:               ) : (
173:                 <>
174:                   {itemConfig?.icon ? (
175:                     <itemConfig.icon />
176:                   ) : (
177:                     !hideIndicator && (
178:                       <div
179:                         className={cn(
180:                           "shrink-0 rounded-[2px] border-(--color-border) bg-(--color-bg)",
181:                           {
182:                             "h-2.5 w-2.5": indicator === "dot",
183:                             "w-1": indicator === "line",
184:                             "w-0 border-[1.5px] border-dashed bg-transparent":
185:                               indicator === "dashed",
186:                             "my-0.5": nestLabel && indicator === "dashed",
187:                           }
188:                         )}
189:                         style={
190:                           {
191:                             "--color-bg": indicatorColor,
192:                             "--color-border": indicatorColor,
193:                           } as React.CSSProperties
194:                         }
195:                       />
196:                     )
197:                   )}
198:                   <div
199:                     className={cn(
200:                       "flex flex-1 justify-between leading-none",
201:                       nestLabel ? "items-end" : "items-center"
202:                     )}
203:                   >
204:                     <div className="grid gap-1.5">
205:                       {nestLabel ? tooltipLabel : null}
206:                       <span className="text-muted-foreground">
207:                         {itemConfig?.label || item.name}
208:                       </span>
209:                     </div>
210:                     {item.value && (
211:                       <span className="text-foreground font-mono font-medium tabular-nums">
212:                         {item.value.toLocaleString()}
213:                       </span>
214:                     )}
215:                   </div>
216:                 </>
217:               )}
218:             </div>
219:           )
220:         })}
221:       </div>
222:     </div>
223:   )
224: }
225: const ChartLegend = RechartsPrimitive.Legend
226: function ChartLegendContent({
227:   className,
228:   hideIcon = false,
229:   payload,
230:   verticalAlign = "bottom",
231:   nameKey,
232: }: React.ComponentProps<"div"> &
233:   Pick<RechartsPrimitive.LegendProps, "payload" | "verticalAlign"> & {
234:     hideIcon?: boolean
235:     nameKey?: string
236:   }) {
237:   const { config } = useChart()
238:   if (!payload?.length) {
239:     return null
240:   }
241:   return (
242:     <div
243:       className={cn(
244:         "flex items-center justify-center gap-4",
245:         verticalAlign === "top" ? "pb-3" : "pt-3",
246:         className
247:       )}
248:     >
249:       {payload.map((item) => {
250:         const key = `${nameKey || item.dataKey || "value"}`
251:         const itemConfig = getPayloadConfigFromPayload(config, item, key)
252:         return (
253:           <div
254:             key={item.value}
255:             className={cn(
256:               "[&>svg]:text-muted-foreground flex items-center gap-1.5 [&>svg]:h-3 [&>svg]:w-3"
257:             )}
258:           >
259:             {itemConfig?.icon && !hideIcon ? (
260:               <itemConfig.icon />
261:             ) : (
262:               <div
263:                 className="h-2 w-2 shrink-0 rounded-[2px]"
264:                 style={{
265:                   backgroundColor: item.color,
266:                 }}
267:               />
268:             )}
269:             {itemConfig?.label}
270:           </div>
271:         )
272:       })}
273:     </div>
274:   )
275: }
276: // Helper to extract item config from a payload.
277: function getPayloadConfigFromPayload(
278:   config: ChartConfig,
279:   payload: unknown,
280:   key: string
281: ) {
282:   if (typeof payload !== "object" || payload === null) {
283:     return undefined
284:   }
285:   const payloadPayload =
286:     "payload" in payload &&
287:     typeof payload.payload === "object" &&
288:     payload.payload !== null
289:       ? payload.payload
290:       : undefined
291:   let configLabelKey: string = key
292:   if (
293:     key in payload &&
294:     typeof payload[key as keyof typeof payload] === "string"
295:   ) {
296:     configLabelKey = payload[key as keyof typeof payload] as string
297:   } else if (
298:     payloadPayload &&
299:     key in payloadPayload &&
300:     typeof payloadPayload[key as keyof typeof payloadPayload] === "string"
301:   ) {
302:     configLabelKey = payloadPayload[
303:       key as keyof typeof payloadPayload
304:     ] as string
305:   }
306:   return configLabelKey in config
307:     ? config[configLabelKey]
308:     : config[key as keyof typeof config]
309: }
310: export {
311:   ChartContainer,
312:   ChartTooltip,
313:   ChartTooltipContent,
314:   ChartLegend,
315:   ChartLegendContent,
316:   ChartStyle,
317: }
```

## File: src/components/ui/checkbox.tsx
```typescript
 1: "use client"
 2: import * as React from "react"
 3: import * as CheckboxPrimitive from "@radix-ui/react-checkbox"
 4: import { CheckIcon } from "lucide-react"
 5: import { cn } from "@/lib/utils"
 6: function Checkbox({
 7:   className,
 8:   ...props
 9: }: React.ComponentProps<typeof CheckboxPrimitive.Root>) {
10:   return (
11:     <CheckboxPrimitive.Root
12:       data-slot="checkbox"
13:       className={cn(
14:         "peer border-input dark:bg-input/30 data-[state=checked]:bg-primary data-[state=checked]:text-primary-foreground dark:data-[state=checked]:bg-primary data-[state=checked]:border-primary focus-visible:border-ring focus-visible:ring-ring/50 aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive size-4 shrink-0 rounded-[4px] border shadow-xs transition-shadow outline-none focus-visible:ring-[3px] disabled:cursor-not-allowed disabled:opacity-50",
15:         className
16:       )}
17:       {...props}
18:     >
19:       <CheckboxPrimitive.Indicator
20:         data-slot="checkbox-indicator"
21:         className="flex items-center justify-center text-current transition-none"
22:       >
23:         <CheckIcon className="size-3.5" />
24:       </CheckboxPrimitive.Indicator>
25:     </CheckboxPrimitive.Root>
26:   )
27: }
28: export { Checkbox }
```

## File: src/components/ui/collapsible.tsx
```typescript
 1: "use client"
 2: import * as CollapsiblePrimitive from "@radix-ui/react-collapsible"
 3: function Collapsible({
 4:   ...props
 5: }: React.ComponentProps<typeof CollapsiblePrimitive.Root>) {
 6:   return <CollapsiblePrimitive.Root data-slot="collapsible" {...props} />
 7: }
 8: function CollapsibleTrigger({
 9:   ...props
10: }: React.ComponentProps<typeof CollapsiblePrimitive.CollapsibleTrigger>) {
11:   return (
12:     <CollapsiblePrimitive.CollapsibleTrigger
13:       data-slot="collapsible-trigger"
14:       {...props}
15:     />
16:   )
17: }
18: function CollapsibleContent({
19:   ...props
20: }: React.ComponentProps<typeof CollapsiblePrimitive.CollapsibleContent>) {
21:   return (
22:     <CollapsiblePrimitive.CollapsibleContent
23:       data-slot="collapsible-content"
24:       {...props}
25:     />
26:   )
27: }
28: export { Collapsible, CollapsibleTrigger, CollapsibleContent }
```

## File: src/components/ui/command.tsx
```typescript
  1: "use client"
  2: import * as React from "react"
  3: import { Command as CommandPrimitive } from "cmdk"
  4: import { SearchIcon } from "lucide-react"
  5: import { cn } from "@/lib/utils"
  6: import {
  7:   Dialog,
  8:   DialogContent,
  9:   DialogDescription,
 10:   DialogHeader,
 11:   DialogTitle,
 12: } from "@/components/ui/dialog"
 13: function Command({
 14:   className,
 15:   ...props
 16: }: React.ComponentProps<typeof CommandPrimitive>) {
 17:   return (
 18:     <CommandPrimitive
 19:       data-slot="command"
 20:       className={cn(
 21:         "bg-popover text-popover-foreground flex h-full w-full flex-col overflow-hidden rounded-md",
 22:         className
 23:       )}
 24:       {...props}
 25:     />
 26:   )
 27: }
 28: function CommandDialog({
 29:   title = "Command Palette",
 30:   description = "Search for a command to run...",
 31:   children,
 32:   className,
 33:   showCloseButton = true,
 34:   ...props
 35: }: React.ComponentProps<typeof Dialog> & {
 36:   title?: string
 37:   description?: string
 38:   className?: string
 39:   showCloseButton?: boolean
 40: }) {
 41:   return (
 42:     <Dialog {...props}>
 43:       <DialogHeader className="sr-only">
 44:         <DialogTitle>{title}</DialogTitle>
 45:         <DialogDescription>{description}</DialogDescription>
 46:       </DialogHeader>
 47:       <DialogContent
 48:         className={cn("overflow-hidden p-0", className)}
 49:         showCloseButton={showCloseButton}
 50:       >
 51:         <Command className="[&_[cmdk-group-heading]]:text-muted-foreground **:data-[slot=command-input-wrapper]:h-12 [&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group]]:px-2 [&_[cmdk-group]:not([hidden])_~[cmdk-group]]:pt-0 [&_[cmdk-input-wrapper]_svg]:h-5 [&_[cmdk-input-wrapper]_svg]:w-5 [&_[cmdk-input]]:h-12 [&_[cmdk-item]]:px-2 [&_[cmdk-item]]:py-3 [&_[cmdk-item]_svg]:h-5 [&_[cmdk-item]_svg]:w-5">
 52:           {children}
 53:         </Command>
 54:       </DialogContent>
 55:     </Dialog>
 56:   )
 57: }
 58: function CommandInput({
 59:   className,
 60:   ...props
 61: }: React.ComponentProps<typeof CommandPrimitive.Input>) {
 62:   return (
 63:     <div
 64:       data-slot="command-input-wrapper"
 65:       className="flex h-9 items-center gap-2 border-b px-3"
 66:     >
 67:       <SearchIcon className="size-4 shrink-0 opacity-50" />
 68:       <CommandPrimitive.Input
 69:         data-slot="command-input"
 70:         className={cn(
 71:           "placeholder:text-muted-foreground flex h-10 w-full rounded-md bg-transparent py-3 text-sm outline-hidden disabled:cursor-not-allowed disabled:opacity-50",
 72:           className
 73:         )}
 74:         {...props}
 75:       />
 76:     </div>
 77:   )
 78: }
 79: function CommandList({
 80:   className,
 81:   ...props
 82: }: React.ComponentProps<typeof CommandPrimitive.List>) {
 83:   return (
 84:     <CommandPrimitive.List
 85:       data-slot="command-list"
 86:       className={cn(
 87:         "max-h-[300px] scroll-py-1 overflow-x-hidden overflow-y-auto",
 88:         className
 89:       )}
 90:       {...props}
 91:     />
 92:   )
 93: }
 94: function CommandEmpty({
 95:   ...props
 96: }: React.ComponentProps<typeof CommandPrimitive.Empty>) {
 97:   return (
 98:     <CommandPrimitive.Empty
 99:       data-slot="command-empty"
100:       className="py-6 text-center text-sm"
101:       {...props}
102:     />
103:   )
104: }
105: function CommandGroup({
106:   className,
107:   ...props
108: }: React.ComponentProps<typeof CommandPrimitive.Group>) {
109:   return (
110:     <CommandPrimitive.Group
111:       data-slot="command-group"
112:       className={cn(
113:         "text-foreground [&_[cmdk-group-heading]]:text-muted-foreground overflow-hidden p-1 [&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-xs [&_[cmdk-group-heading]]:font-medium",
114:         className
115:       )}
116:       {...props}
117:     />
118:   )
119: }
120: function CommandSeparator({
121:   className,
122:   ...props
123: }: React.ComponentProps<typeof CommandPrimitive.Separator>) {
124:   return (
125:     <CommandPrimitive.Separator
126:       data-slot="command-separator"
127:       className={cn("bg-border -mx-1 h-px", className)}
128:       {...props}
129:     />
130:   )
131: }
132: function CommandItem({
133:   className,
134:   ...props
135: }: React.ComponentProps<typeof CommandPrimitive.Item>) {
136:   return (
137:     <CommandPrimitive.Item
138:       data-slot="command-item"
139:       className={cn(
140:         "data-[selected=true]:bg-accent data-[selected=true]:text-accent-foreground [&_svg:not([class*='text-'])]:text-muted-foreground relative flex cursor-default items-center gap-2 rounded-sm px-2 py-1.5 text-sm outline-hidden select-none data-[disabled=true]:pointer-events-none data-[disabled=true]:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
141:         className
142:       )}
143:       {...props}
144:     />
145:   )
146: }
147: function CommandShortcut({
148:   className,
149:   ...props
150: }: React.ComponentProps<"span">) {
151:   return (
152:     <span
153:       data-slot="command-shortcut"
154:       className={cn(
155:         "text-muted-foreground ml-auto text-xs tracking-widest",
156:         className
157:       )}
158:       {...props}
159:     />
160:   )
161: }
162: export {
163:   Command,
164:   CommandDialog,
165:   CommandInput,
166:   CommandList,
167:   CommandEmpty,
168:   CommandGroup,
169:   CommandItem,
170:   CommandShortcut,
171:   CommandSeparator,
172: }
```

## File: src/components/ui/context-menu.tsx
```typescript
  1: "use client"
  2: import * as React from "react"
  3: import * as ContextMenuPrimitive from "@radix-ui/react-context-menu"
  4: import { CheckIcon, ChevronRightIcon, CircleIcon } from "lucide-react"
  5: import { cn } from "@/lib/utils"
  6: function ContextMenu({
  7:   ...props
  8: }: React.ComponentProps<typeof ContextMenuPrimitive.Root>) {
  9:   return <ContextMenuPrimitive.Root data-slot="context-menu" {...props} />
 10: }
 11: function ContextMenuTrigger({
 12:   ...props
 13: }: React.ComponentProps<typeof ContextMenuPrimitive.Trigger>) {
 14:   return (
 15:     <ContextMenuPrimitive.Trigger data-slot="context-menu-trigger" {...props} />
 16:   )
 17: }
 18: function ContextMenuGroup({
 19:   ...props
 20: }: React.ComponentProps<typeof ContextMenuPrimitive.Group>) {
 21:   return (
 22:     <ContextMenuPrimitive.Group data-slot="context-menu-group" {...props} />
 23:   )
 24: }
 25: function ContextMenuPortal({
 26:   ...props
 27: }: React.ComponentProps<typeof ContextMenuPrimitive.Portal>) {
 28:   return (
 29:     <ContextMenuPrimitive.Portal data-slot="context-menu-portal" {...props} />
 30:   )
 31: }
 32: function ContextMenuSub({
 33:   ...props
 34: }: React.ComponentProps<typeof ContextMenuPrimitive.Sub>) {
 35:   return <ContextMenuPrimitive.Sub data-slot="context-menu-sub" {...props} />
 36: }
 37: function ContextMenuRadioGroup({
 38:   ...props
 39: }: React.ComponentProps<typeof ContextMenuPrimitive.RadioGroup>) {
 40:   return (
 41:     <ContextMenuPrimitive.RadioGroup
 42:       data-slot="context-menu-radio-group"
 43:       {...props}
 44:     />
 45:   )
 46: }
 47: function ContextMenuSubTrigger({
 48:   className,
 49:   inset,
 50:   children,
 51:   ...props
 52: }: React.ComponentProps<typeof ContextMenuPrimitive.SubTrigger> & {
 53:   inset?: boolean
 54: }) {
 55:   return (
 56:     <ContextMenuPrimitive.SubTrigger
 57:       data-slot="context-menu-sub-trigger"
 58:       data-inset={inset}
 59:       className={cn(
 60:         "focus:bg-accent focus:text-accent-foreground data-[state=open]:bg-accent data-[state=open]:text-accent-foreground flex cursor-default items-center rounded-sm px-2 py-1.5 text-sm outline-hidden select-none data-[inset]:pl-8 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
 61:         className
 62:       )}
 63:       {...props}
 64:     >
 65:       {children}
 66:       <ChevronRightIcon className="ml-auto" />
 67:     </ContextMenuPrimitive.SubTrigger>
 68:   )
 69: }
 70: function ContextMenuSubContent({
 71:   className,
 72:   ...props
 73: }: React.ComponentProps<typeof ContextMenuPrimitive.SubContent>) {
 74:   return (
 75:     <ContextMenuPrimitive.SubContent
 76:       data-slot="context-menu-sub-content"
 77:       className={cn(
 78:         "bg-popover text-popover-foreground data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 z-50 min-w-[8rem] origin-(--radix-context-menu-content-transform-origin) overflow-hidden rounded-md border p-1 shadow-lg",
 79:         className
 80:       )}
 81:       {...props}
 82:     />
 83:   )
 84: }
 85: function ContextMenuContent({
 86:   className,
 87:   ...props
 88: }: React.ComponentProps<typeof ContextMenuPrimitive.Content>) {
 89:   return (
 90:     <ContextMenuPrimitive.Portal>
 91:       <ContextMenuPrimitive.Content
 92:         data-slot="context-menu-content"
 93:         className={cn(
 94:           "bg-popover text-popover-foreground data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 z-50 max-h-(--radix-context-menu-content-available-height) min-w-[8rem] origin-(--radix-context-menu-content-transform-origin) overflow-x-hidden overflow-y-auto rounded-md border p-1 shadow-md",
 95:           className
 96:         )}
 97:         {...props}
 98:       />
 99:     </ContextMenuPrimitive.Portal>
100:   )
101: }
102: function ContextMenuItem({
103:   className,
104:   inset,
105:   variant = "default",
106:   ...props
107: }: React.ComponentProps<typeof ContextMenuPrimitive.Item> & {
108:   inset?: boolean
109:   variant?: "default" | "destructive"
110: }) {
111:   return (
112:     <ContextMenuPrimitive.Item
113:       data-slot="context-menu-item"
114:       data-inset={inset}
115:       data-variant={variant}
116:       className={cn(
117:         "focus:bg-accent focus:text-accent-foreground data-[variant=destructive]:text-destructive data-[variant=destructive]:focus:bg-destructive/10 dark:data-[variant=destructive]:focus:bg-destructive/20 data-[variant=destructive]:focus:text-destructive data-[variant=destructive]:*:[svg]:!text-destructive [&_svg:not([class*='text-'])]:text-muted-foreground relative flex cursor-default items-center gap-2 rounded-sm px-2 py-1.5 text-sm outline-hidden select-none data-[disabled]:pointer-events-none data-[disabled]:opacity-50 data-[inset]:pl-8 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
118:         className
119:       )}
120:       {...props}
121:     />
122:   )
123: }
124: function ContextMenuCheckboxItem({
125:   className,
126:   children,
127:   checked,
128:   ...props
129: }: React.ComponentProps<typeof ContextMenuPrimitive.CheckboxItem>) {
130:   return (
131:     <ContextMenuPrimitive.CheckboxItem
132:       data-slot="context-menu-checkbox-item"
133:       className={cn(
134:         "focus:bg-accent focus:text-accent-foreground relative flex cursor-default items-center gap-2 rounded-sm py-1.5 pr-2 pl-8 text-sm outline-hidden select-none data-[disabled]:pointer-events-none data-[disabled]:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
135:         className
136:       )}
137:       checked={checked}
138:       {...props}
139:     >
140:       <span className="pointer-events-none absolute left-2 flex size-3.5 items-center justify-center">
141:         <ContextMenuPrimitive.ItemIndicator>
142:           <CheckIcon className="size-4" />
143:         </ContextMenuPrimitive.ItemIndicator>
144:       </span>
145:       {children}
146:     </ContextMenuPrimitive.CheckboxItem>
147:   )
148: }
149: function ContextMenuRadioItem({
150:   className,
151:   children,
152:   ...props
153: }: React.ComponentProps<typeof ContextMenuPrimitive.RadioItem>) {
154:   return (
155:     <ContextMenuPrimitive.RadioItem
156:       data-slot="context-menu-radio-item"
157:       className={cn(
158:         "focus:bg-accent focus:text-accent-foreground relative flex cursor-default items-center gap-2 rounded-sm py-1.5 pr-2 pl-8 text-sm outline-hidden select-none data-[disabled]:pointer-events-none data-[disabled]:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
159:         className
160:       )}
161:       {...props}
162:     >
163:       <span className="pointer-events-none absolute left-2 flex size-3.5 items-center justify-center">
164:         <ContextMenuPrimitive.ItemIndicator>
165:           <CircleIcon className="size-2 fill-current" />
166:         </ContextMenuPrimitive.ItemIndicator>
167:       </span>
168:       {children}
169:     </ContextMenuPrimitive.RadioItem>
170:   )
171: }
172: function ContextMenuLabel({
173:   className,
174:   inset,
175:   ...props
176: }: React.ComponentProps<typeof ContextMenuPrimitive.Label> & {
177:   inset?: boolean
178: }) {
179:   return (
180:     <ContextMenuPrimitive.Label
181:       data-slot="context-menu-label"
182:       data-inset={inset}
183:       className={cn(
184:         "text-foreground px-2 py-1.5 text-sm font-medium data-[inset]:pl-8",
185:         className
186:       )}
187:       {...props}
188:     />
189:   )
190: }
191: function ContextMenuSeparator({
192:   className,
193:   ...props
194: }: React.ComponentProps<typeof ContextMenuPrimitive.Separator>) {
195:   return (
196:     <ContextMenuPrimitive.Separator
197:       data-slot="context-menu-separator"
198:       className={cn("bg-border -mx-1 my-1 h-px", className)}
199:       {...props}
200:     />
201:   )
202: }
203: function ContextMenuShortcut({
204:   className,
205:   ...props
206: }: React.ComponentProps<"span">) {
207:   return (
208:     <span
209:       data-slot="context-menu-shortcut"
210:       className={cn(
211:         "text-muted-foreground ml-auto text-xs tracking-widest",
212:         className
213:       )}
214:       {...props}
215:     />
216:   )
217: }
218: export {
219:   ContextMenu,
220:   ContextMenuTrigger,
221:   ContextMenuContent,
222:   ContextMenuItem,
223:   ContextMenuCheckboxItem,
224:   ContextMenuRadioItem,
225:   ContextMenuLabel,
226:   ContextMenuSeparator,
227:   ContextMenuShortcut,
228:   ContextMenuGroup,
229:   ContextMenuPortal,
230:   ContextMenuSub,
231:   ContextMenuSubContent,
232:   ContextMenuSubTrigger,
233:   ContextMenuRadioGroup,
234: }
```

## File: src/components/ui/dialog.tsx
```typescript
  1: "use client"
  2: import * as React from "react"
  3: import * as DialogPrimitive from "@radix-ui/react-dialog"
  4: import { XIcon } from "lucide-react"
  5: import { cn } from "@/lib/utils"
  6: function Dialog({
  7:   ...props
  8: }: React.ComponentProps<typeof DialogPrimitive.Root>) {
  9:   return <DialogPrimitive.Root data-slot="dialog" {...props} />
 10: }
 11: function DialogTrigger({
 12:   ...props
 13: }: React.ComponentProps<typeof DialogPrimitive.Trigger>) {
 14:   return <DialogPrimitive.Trigger data-slot="dialog-trigger" {...props} />
 15: }
 16: function DialogPortal({
 17:   ...props
 18: }: React.ComponentProps<typeof DialogPrimitive.Portal>) {
 19:   return <DialogPrimitive.Portal data-slot="dialog-portal" {...props} />
 20: }
 21: function DialogClose({
 22:   ...props
 23: }: React.ComponentProps<typeof DialogPrimitive.Close>) {
 24:   return <DialogPrimitive.Close data-slot="dialog-close" {...props} />
 25: }
 26: function DialogOverlay({
 27:   className,
 28:   ...props
 29: }: React.ComponentProps<typeof DialogPrimitive.Overlay>) {
 30:   return (
 31:     <DialogPrimitive.Overlay
 32:       data-slot="dialog-overlay"
 33:       className={cn(
 34:         "data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 fixed inset-0 z-50 bg-black/50",
 35:         className
 36:       )}
 37:       {...props}
 38:     />
 39:   )
 40: }
 41: function DialogContent({
 42:   className,
 43:   children,
 44:   showCloseButton = true,
 45:   ...props
 46: }: React.ComponentProps<typeof DialogPrimitive.Content> & {
 47:   showCloseButton?: boolean
 48: }) {
 49:   return (
 50:     <DialogPortal data-slot="dialog-portal">
 51:       <DialogOverlay />
 52:       <DialogPrimitive.Content
 53:         data-slot="dialog-content"
 54:         className={cn(
 55:           "bg-background data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 fixed top-[50%] left-[50%] z-50 grid w-full max-w-[calc(100%-2rem)] translate-x-[-50%] translate-y-[-50%] gap-4 rounded-lg border p-6 shadow-lg duration-200 sm:max-w-lg",
 56:           className
 57:         )}
 58:         {...props}
 59:       >
 60:         {children}
 61:         {showCloseButton && (
 62:           <DialogPrimitive.Close
 63:             data-slot="dialog-close"
 64:             className="ring-offset-background focus:ring-ring data-[state=open]:bg-accent data-[state=open]:text-muted-foreground absolute top-4 right-4 rounded-xs opacity-70 transition-opacity hover:opacity-100 focus:ring-2 focus:ring-offset-2 focus:outline-hidden disabled:pointer-events-none [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4"
 65:           >
 66:             <XIcon />
 67:             <span className="sr-only">Close</span>
 68:           </DialogPrimitive.Close>
 69:         )}
 70:       </DialogPrimitive.Content>
 71:     </DialogPortal>
 72:   )
 73: }
 74: function DialogHeader({ className, ...props }: React.ComponentProps<"div">) {
 75:   return (
 76:     <div
 77:       data-slot="dialog-header"
 78:       className={cn("flex flex-col gap-2 text-center sm:text-left", className)}
 79:       {...props}
 80:     />
 81:   )
 82: }
 83: function DialogFooter({ className, ...props }: React.ComponentProps<"div">) {
 84:   return (
 85:     <div
 86:       data-slot="dialog-footer"
 87:       className={cn(
 88:         "flex flex-col-reverse gap-2 sm:flex-row sm:justify-end",
 89:         className
 90:       )}
 91:       {...props}
 92:     />
 93:   )
 94: }
 95: function DialogTitle({
 96:   className,
 97:   ...props
 98: }: React.ComponentProps<typeof DialogPrimitive.Title>) {
 99:   return (
100:     <DialogPrimitive.Title
101:       data-slot="dialog-title"
102:       className={cn("text-lg leading-none font-semibold", className)}
103:       {...props}
104:     />
105:   )
106: }
107: function DialogDescription({
108:   className,
109:   ...props
110: }: React.ComponentProps<typeof DialogPrimitive.Description>) {
111:   return (
112:     <DialogPrimitive.Description
113:       data-slot="dialog-description"
114:       className={cn("text-muted-foreground text-sm", className)}
115:       {...props}
116:     />
117:   )
118: }
119: export {
120:   Dialog,
121:   DialogClose,
122:   DialogContent,
123:   DialogDescription,
124:   DialogFooter,
125:   DialogHeader,
126:   DialogOverlay,
127:   DialogPortal,
128:   DialogTitle,
129:   DialogTrigger,
130: }
```

## File: src/components/ui/drawer.tsx
```typescript
  1: "use client"
  2: import * as React from "react"
  3: import { Drawer as DrawerPrimitive } from "vaul"
  4: import { cn } from "@/lib/utils"
  5: function Drawer({
  6:   ...props
  7: }: React.ComponentProps<typeof DrawerPrimitive.Root>) {
  8:   return <DrawerPrimitive.Root data-slot="drawer" {...props} />
  9: }
 10: function DrawerTrigger({
 11:   ...props
 12: }: React.ComponentProps<typeof DrawerPrimitive.Trigger>) {
 13:   return <DrawerPrimitive.Trigger data-slot="drawer-trigger" {...props} />
 14: }
 15: function DrawerPortal({
 16:   ...props
 17: }: React.ComponentProps<typeof DrawerPrimitive.Portal>) {
 18:   return <DrawerPrimitive.Portal data-slot="drawer-portal" {...props} />
 19: }
 20: function DrawerClose({
 21:   ...props
 22: }: React.ComponentProps<typeof DrawerPrimitive.Close>) {
 23:   return <DrawerPrimitive.Close data-slot="drawer-close" {...props} />
 24: }
 25: function DrawerOverlay({
 26:   className,
 27:   ...props
 28: }: React.ComponentProps<typeof DrawerPrimitive.Overlay>) {
 29:   return (
 30:     <DrawerPrimitive.Overlay
 31:       data-slot="drawer-overlay"
 32:       className={cn(
 33:         "data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 fixed inset-0 z-50 bg-black/50",
 34:         className
 35:       )}
 36:       {...props}
 37:     />
 38:   )
 39: }
 40: function DrawerContent({
 41:   className,
 42:   children,
 43:   ...props
 44: }: React.ComponentProps<typeof DrawerPrimitive.Content>) {
 45:   return (
 46:     <DrawerPortal data-slot="drawer-portal">
 47:       <DrawerOverlay />
 48:       <DrawerPrimitive.Content
 49:         data-slot="drawer-content"
 50:         className={cn(
 51:           "group/drawer-content bg-background fixed z-50 flex h-auto flex-col",
 52:           "data-[vaul-drawer-direction=top]:inset-x-0 data-[vaul-drawer-direction=top]:top-0 data-[vaul-drawer-direction=top]:mb-24 data-[vaul-drawer-direction=top]:max-h-[80vh] data-[vaul-drawer-direction=top]:rounded-b-lg data-[vaul-drawer-direction=top]:border-b",
 53:           "data-[vaul-drawer-direction=bottom]:inset-x-0 data-[vaul-drawer-direction=bottom]:bottom-0 data-[vaul-drawer-direction=bottom]:mt-24 data-[vaul-drawer-direction=bottom]:max-h-[80vh] data-[vaul-drawer-direction=bottom]:rounded-t-lg data-[vaul-drawer-direction=bottom]:border-t",
 54:           "data-[vaul-drawer-direction=right]:inset-y-0 data-[vaul-drawer-direction=right]:right-0 data-[vaul-drawer-direction=right]:w-3/4 data-[vaul-drawer-direction=right]:border-l data-[vaul-drawer-direction=right]:sm:max-w-sm",
 55:           "data-[vaul-drawer-direction=left]:inset-y-0 data-[vaul-drawer-direction=left]:left-0 data-[vaul-drawer-direction=left]:w-3/4 data-[vaul-drawer-direction=left]:border-r data-[vaul-drawer-direction=left]:sm:max-w-sm",
 56:           className
 57:         )}
 58:         {...props}
 59:       >
 60:         <div className="bg-muted mx-auto mt-4 hidden h-2 w-[100px] shrink-0 rounded-full group-data-[vaul-drawer-direction=bottom]/drawer-content:block" />
 61:         {children}
 62:       </DrawerPrimitive.Content>
 63:     </DrawerPortal>
 64:   )
 65: }
 66: function DrawerHeader({ className, ...props }: React.ComponentProps<"div">) {
 67:   return (
 68:     <div
 69:       data-slot="drawer-header"
 70:       className={cn(
 71:         "flex flex-col gap-0.5 p-4 group-data-[vaul-drawer-direction=bottom]/drawer-content:text-center group-data-[vaul-drawer-direction=top]/drawer-content:text-center md:gap-1.5 md:text-left",
 72:         className
 73:       )}
 74:       {...props}
 75:     />
 76:   )
 77: }
 78: function DrawerFooter({ className, ...props }: React.ComponentProps<"div">) {
 79:   return (
 80:     <div
 81:       data-slot="drawer-footer"
 82:       className={cn("mt-auto flex flex-col gap-2 p-4", className)}
 83:       {...props}
 84:     />
 85:   )
 86: }
 87: function DrawerTitle({
 88:   className,
 89:   ...props
 90: }: React.ComponentProps<typeof DrawerPrimitive.Title>) {
 91:   return (
 92:     <DrawerPrimitive.Title
 93:       data-slot="drawer-title"
 94:       className={cn("text-foreground font-semibold", className)}
 95:       {...props}
 96:     />
 97:   )
 98: }
 99: function DrawerDescription({
100:   className,
101:   ...props
102: }: React.ComponentProps<typeof DrawerPrimitive.Description>) {
103:   return (
104:     <DrawerPrimitive.Description
105:       data-slot="drawer-description"
106:       className={cn("text-muted-foreground text-sm", className)}
107:       {...props}
108:     />
109:   )
110: }
111: export {
112:   Drawer,
113:   DrawerPortal,
114:   DrawerOverlay,
115:   DrawerTrigger,
116:   DrawerClose,
117:   DrawerContent,
118:   DrawerHeader,
119:   DrawerFooter,
120:   DrawerTitle,
121:   DrawerDescription,
122: }
```

## File: src/components/ui/dropdown-menu.tsx
```typescript
  1: "use client"
  2: import * as React from "react"
  3: import * as DropdownMenuPrimitive from "@radix-ui/react-dropdown-menu"
  4: import { CheckIcon, ChevronRightIcon, CircleIcon } from "lucide-react"
  5: import { cn } from "@/lib/utils"
  6: function DropdownMenu({
  7:   ...props
  8: }: React.ComponentProps<typeof DropdownMenuPrimitive.Root>) {
  9:   return <DropdownMenuPrimitive.Root data-slot="dropdown-menu" {...props} />
 10: }
 11: function DropdownMenuPortal({
 12:   ...props
 13: }: React.ComponentProps<typeof DropdownMenuPrimitive.Portal>) {
 14:   return (
 15:     <DropdownMenuPrimitive.Portal data-slot="dropdown-menu-portal" {...props} />
 16:   )
 17: }
 18: function DropdownMenuTrigger({
 19:   ...props
 20: }: React.ComponentProps<typeof DropdownMenuPrimitive.Trigger>) {
 21:   return (
 22:     <DropdownMenuPrimitive.Trigger
 23:       data-slot="dropdown-menu-trigger"
 24:       {...props}
 25:     />
 26:   )
 27: }
 28: function DropdownMenuContent({
 29:   className,
 30:   sideOffset = 4,
 31:   ...props
 32: }: React.ComponentProps<typeof DropdownMenuPrimitive.Content>) {
 33:   return (
 34:     <DropdownMenuPrimitive.Portal>
 35:       <DropdownMenuPrimitive.Content
 36:         data-slot="dropdown-menu-content"
 37:         sideOffset={sideOffset}
 38:         className={cn(
 39:           "bg-popover text-popover-foreground data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 z-50 max-h-(--radix-dropdown-menu-content-available-height) min-w-[8rem] origin-(--radix-dropdown-menu-content-transform-origin) overflow-x-hidden overflow-y-auto rounded-md border p-1 shadow-md",
 40:           className
 41:         )}
 42:         {...props}
 43:       />
 44:     </DropdownMenuPrimitive.Portal>
 45:   )
 46: }
 47: function DropdownMenuGroup({
 48:   ...props
 49: }: React.ComponentProps<typeof DropdownMenuPrimitive.Group>) {
 50:   return (
 51:     <DropdownMenuPrimitive.Group data-slot="dropdown-menu-group" {...props} />
 52:   )
 53: }
 54: function DropdownMenuItem({
 55:   className,
 56:   inset,
 57:   variant = "default",
 58:   ...props
 59: }: React.ComponentProps<typeof DropdownMenuPrimitive.Item> & {
 60:   inset?: boolean
 61:   variant?: "default" | "destructive"
 62: }) {
 63:   return (
 64:     <DropdownMenuPrimitive.Item
 65:       data-slot="dropdown-menu-item"
 66:       data-inset={inset}
 67:       data-variant={variant}
 68:       className={cn(
 69:         "focus:bg-accent focus:text-accent-foreground data-[variant=destructive]:text-destructive data-[variant=destructive]:focus:bg-destructive/10 dark:data-[variant=destructive]:focus:bg-destructive/20 data-[variant=destructive]:focus:text-destructive data-[variant=destructive]:*:[svg]:!text-destructive [&_svg:not([class*='text-'])]:text-muted-foreground relative flex cursor-default items-center gap-2 rounded-sm px-2 py-1.5 text-sm outline-hidden select-none data-[disabled]:pointer-events-none data-[disabled]:opacity-50 data-[inset]:pl-8 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
 70:         className
 71:       )}
 72:       {...props}
 73:     />
 74:   )
 75: }
 76: function DropdownMenuCheckboxItem({
 77:   className,
 78:   children,
 79:   checked,
 80:   ...props
 81: }: React.ComponentProps<typeof DropdownMenuPrimitive.CheckboxItem>) {
 82:   return (
 83:     <DropdownMenuPrimitive.CheckboxItem
 84:       data-slot="dropdown-menu-checkbox-item"
 85:       className={cn(
 86:         "focus:bg-accent focus:text-accent-foreground relative flex cursor-default items-center gap-2 rounded-sm py-1.5 pr-2 pl-8 text-sm outline-hidden select-none data-[disabled]:pointer-events-none data-[disabled]:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
 87:         className
 88:       )}
 89:       checked={checked}
 90:       {...props}
 91:     >
 92:       <span className="pointer-events-none absolute left-2 flex size-3.5 items-center justify-center">
 93:         <DropdownMenuPrimitive.ItemIndicator>
 94:           <CheckIcon className="size-4" />
 95:         </DropdownMenuPrimitive.ItemIndicator>
 96:       </span>
 97:       {children}
 98:     </DropdownMenuPrimitive.CheckboxItem>
 99:   )
100: }
101: function DropdownMenuRadioGroup({
102:   ...props
103: }: React.ComponentProps<typeof DropdownMenuPrimitive.RadioGroup>) {
104:   return (
105:     <DropdownMenuPrimitive.RadioGroup
106:       data-slot="dropdown-menu-radio-group"
107:       {...props}
108:     />
109:   )
110: }
111: function DropdownMenuRadioItem({
112:   className,
113:   children,
114:   ...props
115: }: React.ComponentProps<typeof DropdownMenuPrimitive.RadioItem>) {
116:   return (
117:     <DropdownMenuPrimitive.RadioItem
118:       data-slot="dropdown-menu-radio-item"
119:       className={cn(
120:         "focus:bg-accent focus:text-accent-foreground relative flex cursor-default items-center gap-2 rounded-sm py-1.5 pr-2 pl-8 text-sm outline-hidden select-none data-[disabled]:pointer-events-none data-[disabled]:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
121:         className
122:       )}
123:       {...props}
124:     >
125:       <span className="pointer-events-none absolute left-2 flex size-3.5 items-center justify-center">
126:         <DropdownMenuPrimitive.ItemIndicator>
127:           <CircleIcon className="size-2 fill-current" />
128:         </DropdownMenuPrimitive.ItemIndicator>
129:       </span>
130:       {children}
131:     </DropdownMenuPrimitive.RadioItem>
132:   )
133: }
134: function DropdownMenuLabel({
135:   className,
136:   inset,
137:   ...props
138: }: React.ComponentProps<typeof DropdownMenuPrimitive.Label> & {
139:   inset?: boolean
140: }) {
141:   return (
142:     <DropdownMenuPrimitive.Label
143:       data-slot="dropdown-menu-label"
144:       data-inset={inset}
145:       className={cn(
146:         "px-2 py-1.5 text-sm font-medium data-[inset]:pl-8",
147:         className
148:       )}
149:       {...props}
150:     />
151:   )
152: }
153: function DropdownMenuSeparator({
154:   className,
155:   ...props
156: }: React.ComponentProps<typeof DropdownMenuPrimitive.Separator>) {
157:   return (
158:     <DropdownMenuPrimitive.Separator
159:       data-slot="dropdown-menu-separator"
160:       className={cn("bg-border -mx-1 my-1 h-px", className)}
161:       {...props}
162:     />
163:   )
164: }
165: function DropdownMenuShortcut({
166:   className,
167:   ...props
168: }: React.ComponentProps<"span">) {
169:   return (
170:     <span
171:       data-slot="dropdown-menu-shortcut"
172:       className={cn(
173:         "text-muted-foreground ml-auto text-xs tracking-widest",
174:         className
175:       )}
176:       {...props}
177:     />
178:   )
179: }
180: function DropdownMenuSub({
181:   ...props
182: }: React.ComponentProps<typeof DropdownMenuPrimitive.Sub>) {
183:   return <DropdownMenuPrimitive.Sub data-slot="dropdown-menu-sub" {...props} />
184: }
185: function DropdownMenuSubTrigger({
186:   className,
187:   inset,
188:   children,
189:   ...props
190: }: React.ComponentProps<typeof DropdownMenuPrimitive.SubTrigger> & {
191:   inset?: boolean
192: }) {
193:   return (
194:     <DropdownMenuPrimitive.SubTrigger
195:       data-slot="dropdown-menu-sub-trigger"
196:       data-inset={inset}
197:       className={cn(
198:         "focus:bg-accent focus:text-accent-foreground data-[state=open]:bg-accent data-[state=open]:text-accent-foreground flex cursor-default items-center rounded-sm px-2 py-1.5 text-sm outline-hidden select-none data-[inset]:pl-8",
199:         className
200:       )}
201:       {...props}
202:     >
203:       {children}
204:       <ChevronRightIcon className="ml-auto size-4" />
205:     </DropdownMenuPrimitive.SubTrigger>
206:   )
207: }
208: function DropdownMenuSubContent({
209:   className,
210:   ...props
211: }: React.ComponentProps<typeof DropdownMenuPrimitive.SubContent>) {
212:   return (
213:     <DropdownMenuPrimitive.SubContent
214:       data-slot="dropdown-menu-sub-content"
215:       className={cn(
216:         "bg-popover text-popover-foreground data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 z-50 min-w-[8rem] origin-(--radix-dropdown-menu-content-transform-origin) overflow-hidden rounded-md border p-1 shadow-lg",
217:         className
218:       )}
219:       {...props}
220:     />
221:   )
222: }
223: export {
224:   DropdownMenu,
225:   DropdownMenuPortal,
226:   DropdownMenuTrigger,
227:   DropdownMenuContent,
228:   DropdownMenuGroup,
229:   DropdownMenuLabel,
230:   DropdownMenuItem,
231:   DropdownMenuCheckboxItem,
232:   DropdownMenuRadioGroup,
233:   DropdownMenuRadioItem,
234:   DropdownMenuSeparator,
235:   DropdownMenuShortcut,
236:   DropdownMenuSub,
237:   DropdownMenuSubTrigger,
238:   DropdownMenuSubContent,
239: }
```

## File: src/components/ui/form.tsx
```typescript
  1: "use client"
  2: import * as React from "react"
  3: import * as LabelPrimitive from "@radix-ui/react-label"
  4: import { Slot } from "@radix-ui/react-slot"
  5: import {
  6:   Controller,
  7:   FormProvider,
  8:   useFormContext,
  9:   useFormState,
 10:   type ControllerProps,
 11:   type FieldPath,
 12:   type FieldValues,
 13: } from "react-hook-form"
 14: import { cn } from "@/lib/utils"
 15: import { Label } from "@/components/ui/label"
 16: const Form = FormProvider
 17: type FormFieldContextValue<
 18:   TFieldValues extends FieldValues = FieldValues,
 19:   TName extends FieldPath<TFieldValues> = FieldPath<TFieldValues>,
 20: > = {
 21:   name: TName
 22: }
 23: const FormFieldContext = React.createContext<FormFieldContextValue>(
 24:   {} as FormFieldContextValue
 25: )
 26: const FormField = <
 27:   TFieldValues extends FieldValues = FieldValues,
 28:   TName extends FieldPath<TFieldValues> = FieldPath<TFieldValues>,
 29: >({
 30:   ...props
 31: }: ControllerProps<TFieldValues, TName>) => {
 32:   return (
 33:     <FormFieldContext.Provider value={{ name: props.name }}>
 34:       <Controller {...props} />
 35:     </FormFieldContext.Provider>
 36:   )
 37: }
 38: const useFormField = () => {
 39:   const fieldContext = React.useContext(FormFieldContext)
 40:   const itemContext = React.useContext(FormItemContext)
 41:   const { getFieldState } = useFormContext()
 42:   const formState = useFormState({ name: fieldContext.name })
 43:   const fieldState = getFieldState(fieldContext.name, formState)
 44:   if (!fieldContext) {
 45:     throw new Error("useFormField should be used within <FormField>")
 46:   }
 47:   const { id } = itemContext
 48:   return {
 49:     id,
 50:     name: fieldContext.name,
 51:     formItemId: `${id}-form-item`,
 52:     formDescriptionId: `${id}-form-item-description`,
 53:     formMessageId: `${id}-form-item-message`,
 54:     ...fieldState,
 55:   }
 56: }
 57: type FormItemContextValue = {
 58:   id: string
 59: }
 60: const FormItemContext = React.createContext<FormItemContextValue>(
 61:   {} as FormItemContextValue
 62: )
 63: function FormItem({ className, ...props }: React.ComponentProps<"div">) {
 64:   const id = React.useId()
 65:   return (
 66:     <FormItemContext.Provider value={{ id }}>
 67:       <div
 68:         data-slot="form-item"
 69:         className={cn("grid gap-2", className)}
 70:         {...props}
 71:       />
 72:     </FormItemContext.Provider>
 73:   )
 74: }
 75: function FormLabel({
 76:   className,
 77:   ...props
 78: }: React.ComponentProps<typeof LabelPrimitive.Root>) {
 79:   const { error, formItemId } = useFormField()
 80:   return (
 81:     <Label
 82:       data-slot="form-label"
 83:       data-error={!!error}
 84:       className={cn("data-[error=true]:text-destructive", className)}
 85:       htmlFor={formItemId}
 86:       {...props}
 87:     />
 88:   )
 89: }
 90: function FormControl({ ...props }: React.ComponentProps<typeof Slot>) {
 91:   const { error, formItemId, formDescriptionId, formMessageId } = useFormField()
 92:   return (
 93:     <Slot
 94:       data-slot="form-control"
 95:       id={formItemId}
 96:       aria-describedby={
 97:         !error
 98:           ? `${formDescriptionId}`
 99:           : `${formDescriptionId} ${formMessageId}`
100:       }
101:       aria-invalid={!!error}
102:       {...props}
103:     />
104:   )
105: }
106: function FormDescription({ className, ...props }: React.ComponentProps<"p">) {
107:   const { formDescriptionId } = useFormField()
108:   return (
109:     <p
110:       data-slot="form-description"
111:       id={formDescriptionId}
112:       className={cn("text-muted-foreground text-sm", className)}
113:       {...props}
114:     />
115:   )
116: }
117: function FormMessage({ className, ...props }: React.ComponentProps<"p">) {
118:   const { error, formMessageId } = useFormField()
119:   const body = error ? String(error?.message ?? "") : props.children
120:   if (!body) {
121:     return null
122:   }
123:   return (
124:     <p
125:       data-slot="form-message"
126:       id={formMessageId}
127:       className={cn("text-destructive text-sm", className)}
128:       {...props}
129:     >
130:       {body}
131:     </p>
132:   )
133: }
134: export {
135:   useFormField,
136:   Form,
137:   FormItem,
138:   FormLabel,
139:   FormControl,
140:   FormDescription,
141:   FormMessage,
142:   FormField,
143: }
```

## File: src/components/ui/hover-card.tsx
```typescript
 1: "use client"
 2: import * as React from "react"
 3: import * as HoverCardPrimitive from "@radix-ui/react-hover-card"
 4: import { cn } from "@/lib/utils"
 5: function HoverCard({
 6:   ...props
 7: }: React.ComponentProps<typeof HoverCardPrimitive.Root>) {
 8:   return <HoverCardPrimitive.Root data-slot="hover-card" {...props} />
 9: }
10: function HoverCardTrigger({
11:   ...props
12: }: React.ComponentProps<typeof HoverCardPrimitive.Trigger>) {
13:   return (
14:     <HoverCardPrimitive.Trigger data-slot="hover-card-trigger" {...props} />
15:   )
16: }
17: function HoverCardContent({
18:   className,
19:   align = "center",
20:   sideOffset = 4,
21:   ...props
22: }: React.ComponentProps<typeof HoverCardPrimitive.Content>) {
23:   return (
24:     <HoverCardPrimitive.Portal data-slot="hover-card-portal">
25:       <HoverCardPrimitive.Content
26:         data-slot="hover-card-content"
27:         align={align}
28:         sideOffset={sideOffset}
29:         className={cn(
30:           "bg-popover text-popover-foreground data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 z-50 w-64 origin-(--radix-hover-card-content-transform-origin) rounded-md border p-4 shadow-md outline-hidden",
31:           className
32:         )}
33:         {...props}
34:       />
35:     </HoverCardPrimitive.Portal>
36:   )
37: }
38: export { HoverCard, HoverCardTrigger, HoverCardContent }
```

## File: src/components/ui/input-otp.tsx
```typescript
 1: "use client"
 2: import * as React from "react"
 3: import { OTPInput, OTPInputContext } from "input-otp"
 4: import { MinusIcon } from "lucide-react"
 5: import { cn } from "@/lib/utils"
 6: function InputOTP({
 7:   className,
 8:   containerClassName,
 9:   ...props
10: }: React.ComponentProps<typeof OTPInput> & {
11:   containerClassName?: string
12: }) {
13:   return (
14:     <OTPInput
15:       data-slot="input-otp"
16:       containerClassName={cn(
17:         "flex items-center gap-2 has-disabled:opacity-50",
18:         containerClassName
19:       )}
20:       className={cn("disabled:cursor-not-allowed", className)}
21:       {...props}
22:     />
23:   )
24: }
25: function InputOTPGroup({ className, ...props }: React.ComponentProps<"div">) {
26:   return (
27:     <div
28:       data-slot="input-otp-group"
29:       className={cn("flex items-center", className)}
30:       {...props}
31:     />
32:   )
33: }
34: function InputOTPSlot({
35:   index,
36:   className,
37:   ...props
38: }: React.ComponentProps<"div"> & {
39:   index: number
40: }) {
41:   const inputOTPContext = React.useContext(OTPInputContext)
42:   const { char, hasFakeCaret, isActive } = inputOTPContext?.slots[index] ?? {}
43:   return (
44:     <div
45:       data-slot="input-otp-slot"
46:       data-active={isActive}
47:       className={cn(
48:         "data-[active=true]:border-ring data-[active=true]:ring-ring/50 data-[active=true]:aria-invalid:ring-destructive/20 dark:data-[active=true]:aria-invalid:ring-destructive/40 aria-invalid:border-destructive data-[active=true]:aria-invalid:border-destructive dark:bg-input/30 border-input relative flex h-9 w-9 items-center justify-center border-y border-r text-sm shadow-xs transition-all outline-none first:rounded-l-md first:border-l last:rounded-r-md data-[active=true]:z-10 data-[active=true]:ring-[3px]",
49:         className
50:       )}
51:       {...props}
52:     >
53:       {char}
54:       {hasFakeCaret && (
55:         <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
56:           <div className="animate-caret-blink bg-foreground h-4 w-px duration-1000" />
57:         </div>
58:       )}
59:     </div>
60:   )
61: }
62: function InputOTPSeparator({ ...props }: React.ComponentProps<"div">) {
63:   return (
64:     <div data-slot="input-otp-separator" role="separator" {...props}>
65:       <MinusIcon />
66:     </div>
67:   )
68: }
69: export { InputOTP, InputOTPGroup, InputOTPSlot, InputOTPSeparator }
```

## File: src/components/ui/input.tsx
```typescript
 1: import * as React from "react"
 2: import { cn } from "@/lib/utils"
 3: function Input({ className, type, ...props }: React.ComponentProps<"input">) {
 4:   return (
 5:     <input
 6:       type={type}
 7:       data-slot="input"
 8:       className={cn(
 9:         "file:text-foreground placeholder:text-muted-foreground selection:bg-primary selection:text-primary-foreground dark:bg-input/30 border-input flex h-9 w-full min-w-0 rounded-md border bg-transparent px-3 py-1 text-base shadow-xs transition-[color,box-shadow] outline-none file:inline-flex file:h-7 file:border-0 file:bg-transparent file:text-sm file:font-medium disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 md:text-sm",
10:         "focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]",
11:         "aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive",
12:         className
13:       )}
14:       {...props}
15:     />
16:   )
17: }
18: export { Input }
```

## File: src/components/ui/label.tsx
```typescript
 1: "use client"
 2: import * as React from "react"
 3: import * as LabelPrimitive from "@radix-ui/react-label"
 4: import { cn } from "@/lib/utils"
 5: function Label({
 6:   className,
 7:   ...props
 8: }: React.ComponentProps<typeof LabelPrimitive.Root>) {
 9:   return (
10:     <LabelPrimitive.Root
11:       data-slot="label"
12:       className={cn(
13:         "flex items-center gap-2 text-sm leading-none font-medium select-none group-data-[disabled=true]:pointer-events-none group-data-[disabled=true]:opacity-50 peer-disabled:cursor-not-allowed peer-disabled:opacity-50",
14:         className
15:       )}
16:       {...props}
17:     />
18:   )
19: }
20: export { Label }
```

## File: src/components/ui/menubar.tsx
```typescript
  1: "use client"
  2: import * as React from "react"
  3: import * as MenubarPrimitive from "@radix-ui/react-menubar"
  4: import { CheckIcon, ChevronRightIcon, CircleIcon } from "lucide-react"
  5: import { cn } from "@/lib/utils"
  6: function Menubar({
  7:   className,
  8:   ...props
  9: }: React.ComponentProps<typeof MenubarPrimitive.Root>) {
 10:   return (
 11:     <MenubarPrimitive.Root
 12:       data-slot="menubar"
 13:       className={cn(
 14:         "bg-background flex h-9 items-center gap-1 rounded-md border p-1 shadow-xs",
 15:         className
 16:       )}
 17:       {...props}
 18:     />
 19:   )
 20: }
 21: function MenubarMenu({
 22:   ...props
 23: }: React.ComponentProps<typeof MenubarPrimitive.Menu>) {
 24:   return <MenubarPrimitive.Menu data-slot="menubar-menu" {...props} />
 25: }
 26: function MenubarGroup({
 27:   ...props
 28: }: React.ComponentProps<typeof MenubarPrimitive.Group>) {
 29:   return <MenubarPrimitive.Group data-slot="menubar-group" {...props} />
 30: }
 31: function MenubarPortal({
 32:   ...props
 33: }: React.ComponentProps<typeof MenubarPrimitive.Portal>) {
 34:   return <MenubarPrimitive.Portal data-slot="menubar-portal" {...props} />
 35: }
 36: function MenubarRadioGroup({
 37:   ...props
 38: }: React.ComponentProps<typeof MenubarPrimitive.RadioGroup>) {
 39:   return (
 40:     <MenubarPrimitive.RadioGroup data-slot="menubar-radio-group" {...props} />
 41:   )
 42: }
 43: function MenubarTrigger({
 44:   className,
 45:   ...props
 46: }: React.ComponentProps<typeof MenubarPrimitive.Trigger>) {
 47:   return (
 48:     <MenubarPrimitive.Trigger
 49:       data-slot="menubar-trigger"
 50:       className={cn(
 51:         "focus:bg-accent focus:text-accent-foreground data-[state=open]:bg-accent data-[state=open]:text-accent-foreground flex items-center rounded-sm px-2 py-1 text-sm font-medium outline-hidden select-none",
 52:         className
 53:       )}
 54:       {...props}
 55:     />
 56:   )
 57: }
 58: function MenubarContent({
 59:   className,
 60:   align = "start",
 61:   alignOffset = -4,
 62:   sideOffset = 8,
 63:   ...props
 64: }: React.ComponentProps<typeof MenubarPrimitive.Content>) {
 65:   return (
 66:     <MenubarPortal>
 67:       <MenubarPrimitive.Content
 68:         data-slot="menubar-content"
 69:         align={align}
 70:         alignOffset={alignOffset}
 71:         sideOffset={sideOffset}
 72:         className={cn(
 73:           "bg-popover text-popover-foreground data-[state=open]:animate-in data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 z-50 min-w-[12rem] origin-(--radix-menubar-content-transform-origin) overflow-hidden rounded-md border p-1 shadow-md",
 74:           className
 75:         )}
 76:         {...props}
 77:       />
 78:     </MenubarPortal>
 79:   )
 80: }
 81: function MenubarItem({
 82:   className,
 83:   inset,
 84:   variant = "default",
 85:   ...props
 86: }: React.ComponentProps<typeof MenubarPrimitive.Item> & {
 87:   inset?: boolean
 88:   variant?: "default" | "destructive"
 89: }) {
 90:   return (
 91:     <MenubarPrimitive.Item
 92:       data-slot="menubar-item"
 93:       data-inset={inset}
 94:       data-variant={variant}
 95:       className={cn(
 96:         "focus:bg-accent focus:text-accent-foreground data-[variant=destructive]:text-destructive data-[variant=destructive]:focus:bg-destructive/10 dark:data-[variant=destructive]:focus:bg-destructive/20 data-[variant=destructive]:focus:text-destructive data-[variant=destructive]:*:[svg]:!text-destructive [&_svg:not([class*='text-'])]:text-muted-foreground relative flex cursor-default items-center gap-2 rounded-sm px-2 py-1.5 text-sm outline-hidden select-none data-[disabled]:pointer-events-none data-[disabled]:opacity-50 data-[inset]:pl-8 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
 97:         className
 98:       )}
 99:       {...props}
100:     />
101:   )
102: }
103: function MenubarCheckboxItem({
104:   className,
105:   children,
106:   checked,
107:   ...props
108: }: React.ComponentProps<typeof MenubarPrimitive.CheckboxItem>) {
109:   return (
110:     <MenubarPrimitive.CheckboxItem
111:       data-slot="menubar-checkbox-item"
112:       className={cn(
113:         "focus:bg-accent focus:text-accent-foreground relative flex cursor-default items-center gap-2 rounded-xs py-1.5 pr-2 pl-8 text-sm outline-hidden select-none data-[disabled]:pointer-events-none data-[disabled]:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
114:         className
115:       )}
116:       checked={checked}
117:       {...props}
118:     >
119:       <span className="pointer-events-none absolute left-2 flex size-3.5 items-center justify-center">
120:         <MenubarPrimitive.ItemIndicator>
121:           <CheckIcon className="size-4" />
122:         </MenubarPrimitive.ItemIndicator>
123:       </span>
124:       {children}
125:     </MenubarPrimitive.CheckboxItem>
126:   )
127: }
128: function MenubarRadioItem({
129:   className,
130:   children,
131:   ...props
132: }: React.ComponentProps<typeof MenubarPrimitive.RadioItem>) {
133:   return (
134:     <MenubarPrimitive.RadioItem
135:       data-slot="menubar-radio-item"
136:       className={cn(
137:         "focus:bg-accent focus:text-accent-foreground relative flex cursor-default items-center gap-2 rounded-xs py-1.5 pr-2 pl-8 text-sm outline-hidden select-none data-[disabled]:pointer-events-none data-[disabled]:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
138:         className
139:       )}
140:       {...props}
141:     >
142:       <span className="pointer-events-none absolute left-2 flex size-3.5 items-center justify-center">
143:         <MenubarPrimitive.ItemIndicator>
144:           <CircleIcon className="size-2 fill-current" />
145:         </MenubarPrimitive.ItemIndicator>
146:       </span>
147:       {children}
148:     </MenubarPrimitive.RadioItem>
149:   )
150: }
151: function MenubarLabel({
152:   className,
153:   inset,
154:   ...props
155: }: React.ComponentProps<typeof MenubarPrimitive.Label> & {
156:   inset?: boolean
157: }) {
158:   return (
159:     <MenubarPrimitive.Label
160:       data-slot="menubar-label"
161:       data-inset={inset}
162:       className={cn(
163:         "px-2 py-1.5 text-sm font-medium data-[inset]:pl-8",
164:         className
165:       )}
166:       {...props}
167:     />
168:   )
169: }
170: function MenubarSeparator({
171:   className,
172:   ...props
173: }: React.ComponentProps<typeof MenubarPrimitive.Separator>) {
174:   return (
175:     <MenubarPrimitive.Separator
176:       data-slot="menubar-separator"
177:       className={cn("bg-border -mx-1 my-1 h-px", className)}
178:       {...props}
179:     />
180:   )
181: }
182: function MenubarShortcut({
183:   className,
184:   ...props
185: }: React.ComponentProps<"span">) {
186:   return (
187:     <span
188:       data-slot="menubar-shortcut"
189:       className={cn(
190:         "text-muted-foreground ml-auto text-xs tracking-widest",
191:         className
192:       )}
193:       {...props}
194:     />
195:   )
196: }
197: function MenubarSub({
198:   ...props
199: }: React.ComponentProps<typeof MenubarPrimitive.Sub>) {
200:   return <MenubarPrimitive.Sub data-slot="menubar-sub" {...props} />
201: }
202: function MenubarSubTrigger({
203:   className,
204:   inset,
205:   children,
206:   ...props
207: }: React.ComponentProps<typeof MenubarPrimitive.SubTrigger> & {
208:   inset?: boolean
209: }) {
210:   return (
211:     <MenubarPrimitive.SubTrigger
212:       data-slot="menubar-sub-trigger"
213:       data-inset={inset}
214:       className={cn(
215:         "focus:bg-accent focus:text-accent-foreground data-[state=open]:bg-accent data-[state=open]:text-accent-foreground flex cursor-default items-center rounded-sm px-2 py-1.5 text-sm outline-none select-none data-[inset]:pl-8",
216:         className
217:       )}
218:       {...props}
219:     >
220:       {children}
221:       <ChevronRightIcon className="ml-auto h-4 w-4" />
222:     </MenubarPrimitive.SubTrigger>
223:   )
224: }
225: function MenubarSubContent({
226:   className,
227:   ...props
228: }: React.ComponentProps<typeof MenubarPrimitive.SubContent>) {
229:   return (
230:     <MenubarPrimitive.SubContent
231:       data-slot="menubar-sub-content"
232:       className={cn(
233:         "bg-popover text-popover-foreground data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 z-50 min-w-[8rem] origin-(--radix-menubar-content-transform-origin) overflow-hidden rounded-md border p-1 shadow-lg",
234:         className
235:       )}
236:       {...props}
237:     />
238:   )
239: }
240: export {
241:   Menubar,
242:   MenubarPortal,
243:   MenubarMenu,
244:   MenubarTrigger,
245:   MenubarContent,
246:   MenubarGroup,
247:   MenubarSeparator,
248:   MenubarLabel,
249:   MenubarItem,
250:   MenubarShortcut,
251:   MenubarCheckboxItem,
252:   MenubarRadioGroup,
253:   MenubarRadioItem,
254:   MenubarSub,
255:   MenubarSubTrigger,
256:   MenubarSubContent,
257: }
```

## File: src/components/ui/navigation-menu.tsx
```typescript
  1: import * as React from "react"
  2: import * as NavigationMenuPrimitive from "@radix-ui/react-navigation-menu"
  3: import { cva } from "class-variance-authority"
  4: import { ChevronDownIcon } from "lucide-react"
  5: import { cn } from "@/lib/utils"
  6: function NavigationMenu({
  7:   className,
  8:   children,
  9:   viewport = true,
 10:   ...props
 11: }: React.ComponentProps<typeof NavigationMenuPrimitive.Root> & {
 12:   viewport?: boolean
 13: }) {
 14:   return (
 15:     <NavigationMenuPrimitive.Root
 16:       data-slot="navigation-menu"
 17:       data-viewport={viewport}
 18:       className={cn(
 19:         "group/navigation-menu relative flex max-w-max flex-1 items-center justify-center",
 20:         className
 21:       )}
 22:       {...props}
 23:     >
 24:       {children}
 25:       {viewport && <NavigationMenuViewport />}
 26:     </NavigationMenuPrimitive.Root>
 27:   )
 28: }
 29: function NavigationMenuList({
 30:   className,
 31:   ...props
 32: }: React.ComponentProps<typeof NavigationMenuPrimitive.List>) {
 33:   return (
 34:     <NavigationMenuPrimitive.List
 35:       data-slot="navigation-menu-list"
 36:       className={cn(
 37:         "group flex flex-1 list-none items-center justify-center gap-1",
 38:         className
 39:       )}
 40:       {...props}
 41:     />
 42:   )
 43: }
 44: function NavigationMenuItem({
 45:   className,
 46:   ...props
 47: }: React.ComponentProps<typeof NavigationMenuPrimitive.Item>) {
 48:   return (
 49:     <NavigationMenuPrimitive.Item
 50:       data-slot="navigation-menu-item"
 51:       className={cn("relative", className)}
 52:       {...props}
 53:     />
 54:   )
 55: }
 56: const navigationMenuTriggerStyle = cva(
 57:   "group inline-flex h-9 w-max items-center justify-center rounded-md bg-background px-4 py-2 text-sm font-medium hover:bg-accent hover:text-accent-foreground focus:bg-accent focus:text-accent-foreground disabled:pointer-events-none disabled:opacity-50 data-[state=open]:hover:bg-accent data-[state=open]:text-accent-foreground data-[state=open]:focus:bg-accent data-[state=open]:bg-accent/50 focus-visible:ring-ring/50 outline-none transition-[color,box-shadow] focus-visible:ring-[3px] focus-visible:outline-1"
 58: )
 59: function NavigationMenuTrigger({
 60:   className,
 61:   children,
 62:   ...props
 63: }: React.ComponentProps<typeof NavigationMenuPrimitive.Trigger>) {
 64:   return (
 65:     <NavigationMenuPrimitive.Trigger
 66:       data-slot="navigation-menu-trigger"
 67:       className={cn(navigationMenuTriggerStyle(), "group", className)}
 68:       {...props}
 69:     >
 70:       {children}{" "}
 71:       <ChevronDownIcon
 72:         className="relative top-[1px] ml-1 size-3 transition duration-300 group-data-[state=open]:rotate-180"
 73:         aria-hidden="true"
 74:       />
 75:     </NavigationMenuPrimitive.Trigger>
 76:   )
 77: }
 78: function NavigationMenuContent({
 79:   className,
 80:   ...props
 81: }: React.ComponentProps<typeof NavigationMenuPrimitive.Content>) {
 82:   return (
 83:     <NavigationMenuPrimitive.Content
 84:       data-slot="navigation-menu-content"
 85:       className={cn(
 86:         "data-[motion^=from-]:animate-in data-[motion^=to-]:animate-out data-[motion^=from-]:fade-in data-[motion^=to-]:fade-out data-[motion=from-end]:slide-in-from-right-52 data-[motion=from-start]:slide-in-from-left-52 data-[motion=to-end]:slide-out-to-right-52 data-[motion=to-start]:slide-out-to-left-52 top-0 left-0 w-full p-2 pr-2.5 md:absolute md:w-auto",
 87:         "group-data-[viewport=false]/navigation-menu:bg-popover group-data-[viewport=false]/navigation-menu:text-popover-foreground group-data-[viewport=false]/navigation-menu:data-[state=open]:animate-in group-data-[viewport=false]/navigation-menu:data-[state=closed]:animate-out group-data-[viewport=false]/navigation-menu:data-[state=closed]:zoom-out-95 group-data-[viewport=false]/navigation-menu:data-[state=open]:zoom-in-95 group-data-[viewport=false]/navigation-menu:data-[state=open]:fade-in-0 group-data-[viewport=false]/navigation-menu:data-[state=closed]:fade-out-0 group-data-[viewport=false]/navigation-menu:top-full group-data-[viewport=false]/navigation-menu:mt-1.5 group-data-[viewport=false]/navigation-menu:overflow-hidden group-data-[viewport=false]/navigation-menu:rounded-md group-data-[viewport=false]/navigation-menu:border group-data-[viewport=false]/navigation-menu:shadow group-data-[viewport=false]/navigation-menu:duration-200 **:data-[slot=navigation-menu-link]:focus:ring-0 **:data-[slot=navigation-menu-link]:focus:outline-none",
 88:         className
 89:       )}
 90:       {...props}
 91:     />
 92:   )
 93: }
 94: function NavigationMenuViewport({
 95:   className,
 96:   ...props
 97: }: React.ComponentProps<typeof NavigationMenuPrimitive.Viewport>) {
 98:   return (
 99:     <div
100:       className={cn(
101:         "absolute top-full left-0 isolate z-50 flex justify-center"
102:       )}
103:     >
104:       <NavigationMenuPrimitive.Viewport
105:         data-slot="navigation-menu-viewport"
106:         className={cn(
107:           "origin-top-center bg-popover text-popover-foreground data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-90 relative mt-1.5 h-[var(--radix-navigation-menu-viewport-height)] w-full overflow-hidden rounded-md border shadow md:w-[var(--radix-navigation-menu-viewport-width)]",
108:           className
109:         )}
110:         {...props}
111:       />
112:     </div>
113:   )
114: }
115: function NavigationMenuLink({
116:   className,
117:   ...props
118: }: React.ComponentProps<typeof NavigationMenuPrimitive.Link>) {
119:   return (
120:     <NavigationMenuPrimitive.Link
121:       data-slot="navigation-menu-link"
122:       className={cn(
123:         "data-[active=true]:focus:bg-accent data-[active=true]:hover:bg-accent data-[active=true]:bg-accent/50 data-[active=true]:text-accent-foreground hover:bg-accent hover:text-accent-foreground focus:bg-accent focus:text-accent-foreground focus-visible:ring-ring/50 [&_svg:not([class*='text-'])]:text-muted-foreground flex flex-col gap-1 rounded-sm p-2 text-sm transition-all outline-none focus-visible:ring-[3px] focus-visible:outline-1 [&_svg:not([class*='size-'])]:size-4",
124:         className
125:       )}
126:       {...props}
127:     />
128:   )
129: }
130: function NavigationMenuIndicator({
131:   className,
132:   ...props
133: }: React.ComponentProps<typeof NavigationMenuPrimitive.Indicator>) {
134:   return (
135:     <NavigationMenuPrimitive.Indicator
136:       data-slot="navigation-menu-indicator"
137:       className={cn(
138:         "data-[state=visible]:animate-in data-[state=hidden]:animate-out data-[state=hidden]:fade-out data-[state=visible]:fade-in top-full z-[1] flex h-1.5 items-end justify-center overflow-hidden",
139:         className
140:       )}
141:       {...props}
142:     >
143:       <div className="bg-border relative top-[60%] h-2 w-2 rotate-45 rounded-tl-sm shadow-md" />
144:     </NavigationMenuPrimitive.Indicator>
145:   )
146: }
147: export {
148:   NavigationMenu,
149:   NavigationMenuList,
150:   NavigationMenuItem,
151:   NavigationMenuContent,
152:   NavigationMenuTrigger,
153:   NavigationMenuLink,
154:   NavigationMenuIndicator,
155:   NavigationMenuViewport,
156:   navigationMenuTriggerStyle,
157: }
```

## File: src/components/ui/pagination.tsx
```typescript
  1: import * as React from "react"
  2: import {
  3:   ChevronLeftIcon,
  4:   ChevronRightIcon,
  5:   MoreHorizontalIcon,
  6: } from "lucide-react"
  7: import { cn } from "@/lib/utils"
  8: import { Button, buttonVariants } from "@/components/ui/button"
  9: function Pagination({ className, ...props }: React.ComponentProps<"nav">) {
 10:   return (
 11:     <nav
 12:       role="navigation"
 13:       aria-label="pagination"
 14:       data-slot="pagination"
 15:       className={cn("mx-auto flex w-full justify-center", className)}
 16:       {...props}
 17:     />
 18:   )
 19: }
 20: function PaginationContent({
 21:   className,
 22:   ...props
 23: }: React.ComponentProps<"ul">) {
 24:   return (
 25:     <ul
 26:       data-slot="pagination-content"
 27:       className={cn("flex flex-row items-center gap-1", className)}
 28:       {...props}
 29:     />
 30:   )
 31: }
 32: function PaginationItem({ ...props }: React.ComponentProps<"li">) {
 33:   return <li data-slot="pagination-item" {...props} />
 34: }
 35: type PaginationLinkProps = {
 36:   isActive?: boolean
 37: } & Pick<React.ComponentProps<typeof Button>, "size"> &
 38:   React.ComponentProps<"a">
 39: function PaginationLink({
 40:   className,
 41:   isActive,
 42:   size = "icon",
 43:   ...props
 44: }: PaginationLinkProps) {
 45:   return (
 46:     <a
 47:       aria-current={isActive ? "page" : undefined}
 48:       data-slot="pagination-link"
 49:       data-active={isActive}
 50:       className={cn(
 51:         buttonVariants({
 52:           variant: isActive ? "outline" : "ghost",
 53:           size,
 54:         }),
 55:         className
 56:       )}
 57:       {...props}
 58:     />
 59:   )
 60: }
 61: function PaginationPrevious({
 62:   className,
 63:   ...props
 64: }: React.ComponentProps<typeof PaginationLink>) {
 65:   return (
 66:     <PaginationLink
 67:       aria-label="Go to previous page"
 68:       size="default"
 69:       className={cn("gap-1 px-2.5 sm:pl-2.5", className)}
 70:       {...props}
 71:     >
 72:       <ChevronLeftIcon />
 73:       <span className="hidden sm:block">Previous</span>
 74:     </PaginationLink>
 75:   )
 76: }
 77: function PaginationNext({
 78:   className,
 79:   ...props
 80: }: React.ComponentProps<typeof PaginationLink>) {
 81:   return (
 82:     <PaginationLink
 83:       aria-label="Go to next page"
 84:       size="default"
 85:       className={cn("gap-1 px-2.5 sm:pr-2.5", className)}
 86:       {...props}
 87:     >
 88:       <span className="hidden sm:block">Next</span>
 89:       <ChevronRightIcon />
 90:     </PaginationLink>
 91:   )
 92: }
 93: function PaginationEllipsis({
 94:   className,
 95:   ...props
 96: }: React.ComponentProps<"span">) {
 97:   return (
 98:     <span
 99:       aria-hidden
100:       data-slot="pagination-ellipsis"
101:       className={cn("flex size-9 items-center justify-center", className)}
102:       {...props}
103:     >
104:       <MoreHorizontalIcon className="size-4" />
105:       <span className="sr-only">More pages</span>
106:     </span>
107:   )
108: }
109: export {
110:   Pagination,
111:   PaginationContent,
112:   PaginationLink,
113:   PaginationItem,
114:   PaginationPrevious,
115:   PaginationNext,
116:   PaginationEllipsis,
117: }
```

## File: src/components/ui/popover.tsx
```typescript
 1: "use client"
 2: import * as React from "react"
 3: import * as PopoverPrimitive from "@radix-ui/react-popover"
 4: import { cn } from "@/lib/utils"
 5: function Popover({
 6:   ...props
 7: }: React.ComponentProps<typeof PopoverPrimitive.Root>) {
 8:   return <PopoverPrimitive.Root data-slot="popover" {...props} />
 9: }
10: function PopoverTrigger({
11:   ...props
12: }: React.ComponentProps<typeof PopoverPrimitive.Trigger>) {
13:   return <PopoverPrimitive.Trigger data-slot="popover-trigger" {...props} />
14: }
15: function PopoverContent({
16:   className,
17:   align = "center",
18:   sideOffset = 4,
19:   ...props
20: }: React.ComponentProps<typeof PopoverPrimitive.Content>) {
21:   return (
22:     <PopoverPrimitive.Portal>
23:       <PopoverPrimitive.Content
24:         data-slot="popover-content"
25:         align={align}
26:         sideOffset={sideOffset}
27:         className={cn(
28:           "bg-popover text-popover-foreground data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 z-50 w-72 origin-(--radix-popover-content-transform-origin) rounded-md border p-4 shadow-md outline-hidden",
29:           className
30:         )}
31:         {...props}
32:       />
33:     </PopoverPrimitive.Portal>
34:   )
35: }
36: function PopoverAnchor({
37:   ...props
38: }: React.ComponentProps<typeof PopoverPrimitive.Anchor>) {
39:   return <PopoverPrimitive.Anchor data-slot="popover-anchor" {...props} />
40: }
41: export { Popover, PopoverTrigger, PopoverContent, PopoverAnchor }
```

## File: src/components/ui/progress.tsx
```typescript
 1: "use client"
 2: import * as React from "react"
 3: import * as ProgressPrimitive from "@radix-ui/react-progress"
 4: import { cn } from "@/lib/utils"
 5: function Progress({
 6:   className,
 7:   value,
 8:   ...props
 9: }: React.ComponentProps<typeof ProgressPrimitive.Root>) {
10:   return (
11:     <ProgressPrimitive.Root
12:       data-slot="progress"
13:       className={cn(
14:         "bg-primary/20 relative h-2 w-full overflow-hidden rounded-full",
15:         className
16:       )}
17:       {...props}
18:     >
19:       <ProgressPrimitive.Indicator
20:         data-slot="progress-indicator"
21:         className="bg-primary h-full w-full flex-1 transition-all"
22:         style={{ transform: `translateX(-${100 - (value || 0)}%)` }}
23:       />
24:     </ProgressPrimitive.Root>
25:   )
26: }
27: export { Progress }
```

## File: src/components/ui/radio-group.tsx
```typescript
 1: "use client"
 2: import * as React from "react"
 3: import * as RadioGroupPrimitive from "@radix-ui/react-radio-group"
 4: import { CircleIcon } from "lucide-react"
 5: import { cn } from "@/lib/utils"
 6: function RadioGroup({
 7:   className,
 8:   ...props
 9: }: React.ComponentProps<typeof RadioGroupPrimitive.Root>) {
10:   return (
11:     <RadioGroupPrimitive.Root
12:       data-slot="radio-group"
13:       className={cn("grid gap-3", className)}
14:       {...props}
15:     />
16:   )
17: }
18: function RadioGroupItem({
19:   className,
20:   ...props
21: }: React.ComponentProps<typeof RadioGroupPrimitive.Item>) {
22:   return (
23:     <RadioGroupPrimitive.Item
24:       data-slot="radio-group-item"
25:       className={cn(
26:         "border-input text-primary focus-visible:border-ring focus-visible:ring-ring/50 aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive dark:bg-input/30 aspect-square size-4 shrink-0 rounded-full border shadow-xs transition-[color,box-shadow] outline-none focus-visible:ring-[3px] disabled:cursor-not-allowed disabled:opacity-50",
27:         className
28:       )}
29:       {...props}
30:     >
31:       <RadioGroupPrimitive.Indicator
32:         data-slot="radio-group-indicator"
33:         className="relative flex items-center justify-center"
34:       >
35:         <CircleIcon className="fill-primary absolute top-1/2 left-1/2 size-2 -translate-x-1/2 -translate-y-1/2" />
36:       </RadioGroupPrimitive.Indicator>
37:     </RadioGroupPrimitive.Item>
38:   )
39: }
40: export { RadioGroup, RadioGroupItem }
```

## File: src/components/ui/resizable.tsx
```typescript
 1: "use client"
 2: import * as React from "react"
 3: import { GripVerticalIcon } from "lucide-react"
 4: import * as ResizablePrimitive from "react-resizable-panels"
 5: import { cn } from "@/lib/utils"
 6: function ResizablePanelGroup({
 7:   className,
 8:   ...props
 9: }: React.ComponentProps<typeof ResizablePrimitive.PanelGroup>) {
10:   return (
11:     <ResizablePrimitive.PanelGroup
12:       data-slot="resizable-panel-group"
13:       className={cn(
14:         "flex h-full w-full data-[panel-group-direction=vertical]:flex-col",
15:         className
16:       )}
17:       {...props}
18:     />
19:   )
20: }
21: function ResizablePanel({
22:   ...props
23: }: React.ComponentProps<typeof ResizablePrimitive.Panel>) {
24:   return <ResizablePrimitive.Panel data-slot="resizable-panel" {...props} />
25: }
26: function ResizableHandle({
27:   withHandle,
28:   className,
29:   ...props
30: }: React.ComponentProps<typeof ResizablePrimitive.PanelResizeHandle> & {
31:   withHandle?: boolean
32: }) {
33:   return (
34:     <ResizablePrimitive.PanelResizeHandle
35:       data-slot="resizable-handle"
36:       className={cn(
37:         "bg-border focus-visible:ring-ring relative flex w-px items-center justify-center after:absolute after:inset-y-0 after:left-1/2 after:w-1 after:-translate-x-1/2 focus-visible:ring-1 focus-visible:ring-offset-1 focus-visible:outline-hidden data-[panel-group-direction=vertical]:h-px data-[panel-group-direction=vertical]:w-full data-[panel-group-direction=vertical]:after:left-0 data-[panel-group-direction=vertical]:after:h-1 data-[panel-group-direction=vertical]:after:w-full data-[panel-group-direction=vertical]:after:translate-x-0 data-[panel-group-direction=vertical]:after:-translate-y-1/2 [&[data-panel-group-direction=vertical]>div]:rotate-90",
38:         className
39:       )}
40:       {...props}
41:     >
42:       {withHandle && (
43:         <div className="bg-border z-10 flex h-4 w-3 items-center justify-center rounded-xs border">
44:           <GripVerticalIcon className="size-2.5" />
45:         </div>
46:       )}
47:     </ResizablePrimitive.PanelResizeHandle>
48:   )
49: }
50: export { ResizablePanelGroup, ResizablePanel, ResizableHandle }
```

## File: src/components/ui/scroll-area.tsx
```typescript
 1: "use client"
 2: import * as React from "react"
 3: import * as ScrollAreaPrimitive from "@radix-ui/react-scroll-area"
 4: import { cn } from "@/lib/utils"
 5: function ScrollArea({
 6:   className,
 7:   children,
 8:   ...props
 9: }: React.ComponentProps<typeof ScrollAreaPrimitive.Root>) {
10:   return (
11:     <ScrollAreaPrimitive.Root
12:       data-slot="scroll-area"
13:       className={cn("relative", className)}
14:       {...props}
15:     >
16:       <ScrollAreaPrimitive.Viewport
17:         data-slot="scroll-area-viewport"
18:         className="focus-visible:ring-ring/50 size-full rounded-[inherit] transition-[color,box-shadow] outline-none focus-visible:ring-[3px] focus-visible:outline-1"
19:       >
20:         {children}
21:       </ScrollAreaPrimitive.Viewport>
22:       <ScrollBar />
23:       <ScrollAreaPrimitive.Corner />
24:     </ScrollAreaPrimitive.Root>
25:   )
26: }
27: function ScrollBar({
28:   className,
29:   orientation = "vertical",
30:   ...props
31: }: React.ComponentProps<typeof ScrollAreaPrimitive.ScrollAreaScrollbar>) {
32:   return (
33:     <ScrollAreaPrimitive.ScrollAreaScrollbar
34:       data-slot="scroll-area-scrollbar"
35:       orientation={orientation}
36:       className={cn(
37:         "flex touch-none p-px transition-colors select-none",
38:         orientation === "vertical" &&
39:           "h-full w-2.5 border-l border-l-transparent",
40:         orientation === "horizontal" &&
41:           "h-2.5 flex-col border-t border-t-transparent",
42:         className
43:       )}
44:       {...props}
45:     >
46:       <ScrollAreaPrimitive.ScrollAreaThumb
47:         data-slot="scroll-area-thumb"
48:         className="bg-border relative flex-1 rounded-full"
49:       />
50:     </ScrollAreaPrimitive.ScrollAreaScrollbar>
51:   )
52: }
53: export { ScrollArea, ScrollBar }
```

## File: src/components/ui/select.tsx
```typescript
  1: "use client"
  2: import * as React from "react"
  3: import * as SelectPrimitive from "@radix-ui/react-select"
  4: import { CheckIcon, ChevronDownIcon, ChevronUpIcon } from "lucide-react"
  5: import { cn } from "@/lib/utils"
  6: function Select({
  7:   ...props
  8: }: React.ComponentProps<typeof SelectPrimitive.Root>) {
  9:   return <SelectPrimitive.Root data-slot="select" {...props} />
 10: }
 11: function SelectGroup({
 12:   ...props
 13: }: React.ComponentProps<typeof SelectPrimitive.Group>) {
 14:   return <SelectPrimitive.Group data-slot="select-group" {...props} />
 15: }
 16: function SelectValue({
 17:   ...props
 18: }: React.ComponentProps<typeof SelectPrimitive.Value>) {
 19:   return <SelectPrimitive.Value data-slot="select-value" {...props} />
 20: }
 21: function SelectTrigger({
 22:   className,
 23:   size = "default",
 24:   children,
 25:   ...props
 26: }: React.ComponentProps<typeof SelectPrimitive.Trigger> & {
 27:   size?: "sm" | "default"
 28: }) {
 29:   return (
 30:     <SelectPrimitive.Trigger
 31:       data-slot="select-trigger"
 32:       data-size={size}
 33:       className={cn(
 34:         "border-input data-[placeholder]:text-muted-foreground [&_svg:not([class*='text-'])]:text-muted-foreground focus-visible:border-ring focus-visible:ring-ring/50 aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive dark:bg-input/30 dark:hover:bg-input/50 flex w-fit items-center justify-between gap-2 rounded-md border bg-transparent px-3 py-2 text-sm whitespace-nowrap shadow-xs transition-[color,box-shadow] outline-none focus-visible:ring-[3px] disabled:cursor-not-allowed disabled:opacity-50 data-[size=default]:h-9 data-[size=sm]:h-8 *:data-[slot=select-value]:line-clamp-1 *:data-[slot=select-value]:flex *:data-[slot=select-value]:items-center *:data-[slot=select-value]:gap-2 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
 35:         className
 36:       )}
 37:       {...props}
 38:     >
 39:       {children}
 40:       <SelectPrimitive.Icon asChild>
 41:         <ChevronDownIcon className="size-4 opacity-50" />
 42:       </SelectPrimitive.Icon>
 43:     </SelectPrimitive.Trigger>
 44:   )
 45: }
 46: function SelectContent({
 47:   className,
 48:   children,
 49:   position = "popper",
 50:   ...props
 51: }: React.ComponentProps<typeof SelectPrimitive.Content>) {
 52:   return (
 53:     <SelectPrimitive.Portal>
 54:       <SelectPrimitive.Content
 55:         data-slot="select-content"
 56:         className={cn(
 57:           "bg-popover text-popover-foreground data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 relative z-50 max-h-(--radix-select-content-available-height) min-w-[8rem] origin-(--radix-select-content-transform-origin) overflow-x-hidden overflow-y-auto rounded-md border shadow-md",
 58:           position === "popper" &&
 59:             "data-[side=bottom]:translate-y-1 data-[side=left]:-translate-x-1 data-[side=right]:translate-x-1 data-[side=top]:-translate-y-1",
 60:           className
 61:         )}
 62:         position={position}
 63:         {...props}
 64:       >
 65:         <SelectScrollUpButton />
 66:         <SelectPrimitive.Viewport
 67:           className={cn(
 68:             "p-1",
 69:             position === "popper" &&
 70:               "h-[var(--radix-select-trigger-height)] w-full min-w-[var(--radix-select-trigger-width)] scroll-my-1"
 71:           )}
 72:         >
 73:           {children}
 74:         </SelectPrimitive.Viewport>
 75:         <SelectScrollDownButton />
 76:       </SelectPrimitive.Content>
 77:     </SelectPrimitive.Portal>
 78:   )
 79: }
 80: function SelectLabel({
 81:   className,
 82:   ...props
 83: }: React.ComponentProps<typeof SelectPrimitive.Label>) {
 84:   return (
 85:     <SelectPrimitive.Label
 86:       data-slot="select-label"
 87:       className={cn("text-muted-foreground px-2 py-1.5 text-xs", className)}
 88:       {...props}
 89:     />
 90:   )
 91: }
 92: function SelectItem({
 93:   className,
 94:   children,
 95:   ...props
 96: }: React.ComponentProps<typeof SelectPrimitive.Item>) {
 97:   return (
 98:     <SelectPrimitive.Item
 99:       data-slot="select-item"
100:       className={cn(
101:         "focus:bg-accent focus:text-accent-foreground [&_svg:not([class*='text-'])]:text-muted-foreground relative flex w-full cursor-default items-center gap-2 rounded-sm py-1.5 pr-8 pl-2 text-sm outline-hidden select-none data-[disabled]:pointer-events-none data-[disabled]:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4 *:[span]:last:flex *:[span]:last:items-center *:[span]:last:gap-2",
102:         className
103:       )}
104:       {...props}
105:     >
106:       <span className="absolute right-2 flex size-3.5 items-center justify-center">
107:         <SelectPrimitive.ItemIndicator>
108:           <CheckIcon className="size-4" />
109:         </SelectPrimitive.ItemIndicator>
110:       </span>
111:       <SelectPrimitive.ItemText>{children}</SelectPrimitive.ItemText>
112:     </SelectPrimitive.Item>
113:   )
114: }
115: function SelectSeparator({
116:   className,
117:   ...props
118: }: React.ComponentProps<typeof SelectPrimitive.Separator>) {
119:   return (
120:     <SelectPrimitive.Separator
121:       data-slot="select-separator"
122:       className={cn("bg-border pointer-events-none -mx-1 my-1 h-px", className)}
123:       {...props}
124:     />
125:   )
126: }
127: function SelectScrollUpButton({
128:   className,
129:   ...props
130: }: React.ComponentProps<typeof SelectPrimitive.ScrollUpButton>) {
131:   return (
132:     <SelectPrimitive.ScrollUpButton
133:       data-slot="select-scroll-up-button"
134:       className={cn(
135:         "flex cursor-default items-center justify-center py-1",
136:         className
137:       )}
138:       {...props}
139:     >
140:       <ChevronUpIcon className="size-4" />
141:     </SelectPrimitive.ScrollUpButton>
142:   )
143: }
144: function SelectScrollDownButton({
145:   className,
146:   ...props
147: }: React.ComponentProps<typeof SelectPrimitive.ScrollDownButton>) {
148:   return (
149:     <SelectPrimitive.ScrollDownButton
150:       data-slot="select-scroll-down-button"
151:       className={cn(
152:         "flex cursor-default items-center justify-center py-1",
153:         className
154:       )}
155:       {...props}
156:     >
157:       <ChevronDownIcon className="size-4" />
158:     </SelectPrimitive.ScrollDownButton>
159:   )
160: }
161: export {
162:   Select,
163:   SelectContent,
164:   SelectGroup,
165:   SelectItem,
166:   SelectLabel,
167:   SelectScrollDownButton,
168:   SelectScrollUpButton,
169:   SelectSeparator,
170:   SelectTrigger,
171:   SelectValue,
172: }
```

## File: src/components/ui/separator.tsx
```typescript
 1: "use client"
 2: import * as React from "react"
 3: import * as SeparatorPrimitive from "@radix-ui/react-separator"
 4: import { cn } from "@/lib/utils"
 5: function Separator({
 6:   className,
 7:   orientation = "horizontal",
 8:   decorative = true,
 9:   ...props
10: }: React.ComponentProps<typeof SeparatorPrimitive.Root>) {
11:   return (
12:     <SeparatorPrimitive.Root
13:       data-slot="separator"
14:       decorative={decorative}
15:       orientation={orientation}
16:       className={cn(
17:         "bg-border shrink-0 data-[orientation=horizontal]:h-px data-[orientation=horizontal]:w-full data-[orientation=vertical]:h-full data-[orientation=vertical]:w-px",
18:         className
19:       )}
20:       {...props}
21:     />
22:   )
23: }
24: export { Separator }
```

## File: src/components/ui/sheet.tsx
```typescript
  1: "use client"
  2: import * as React from "react"
  3: import * as SheetPrimitive from "@radix-ui/react-dialog"
  4: import { XIcon } from "lucide-react"
  5: import { cn } from "@/lib/utils"
  6: function Sheet({ ...props }: React.ComponentProps<typeof SheetPrimitive.Root>) {
  7:   return <SheetPrimitive.Root data-slot="sheet" {...props} />
  8: }
  9: function SheetTrigger({
 10:   ...props
 11: }: React.ComponentProps<typeof SheetPrimitive.Trigger>) {
 12:   return <SheetPrimitive.Trigger data-slot="sheet-trigger" {...props} />
 13: }
 14: function SheetClose({
 15:   ...props
 16: }: React.ComponentProps<typeof SheetPrimitive.Close>) {
 17:   return <SheetPrimitive.Close data-slot="sheet-close" {...props} />
 18: }
 19: function SheetPortal({
 20:   ...props
 21: }: React.ComponentProps<typeof SheetPrimitive.Portal>) {
 22:   return <SheetPrimitive.Portal data-slot="sheet-portal" {...props} />
 23: }
 24: function SheetOverlay({
 25:   className,
 26:   ...props
 27: }: React.ComponentProps<typeof SheetPrimitive.Overlay>) {
 28:   return (
 29:     <SheetPrimitive.Overlay
 30:       data-slot="sheet-overlay"
 31:       className={cn(
 32:         "data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 fixed inset-0 z-50 bg-black/50",
 33:         className
 34:       )}
 35:       {...props}
 36:     />
 37:   )
 38: }
 39: function SheetContent({
 40:   className,
 41:   children,
 42:   side = "right",
 43:   ...props
 44: }: React.ComponentProps<typeof SheetPrimitive.Content> & {
 45:   side?: "top" | "right" | "bottom" | "left"
 46: }) {
 47:   return (
 48:     <SheetPortal>
 49:       <SheetOverlay />
 50:       <SheetPrimitive.Content
 51:         data-slot="sheet-content"
 52:         className={cn(
 53:           "bg-background data-[state=open]:animate-in data-[state=closed]:animate-out fixed z-50 flex flex-col gap-4 shadow-lg transition ease-in-out data-[state=closed]:duration-300 data-[state=open]:duration-500",
 54:           side === "right" &&
 55:             "data-[state=closed]:slide-out-to-right data-[state=open]:slide-in-from-right inset-y-0 right-0 h-full w-3/4 border-l sm:max-w-sm",
 56:           side === "left" &&
 57:             "data-[state=closed]:slide-out-to-left data-[state=open]:slide-in-from-left inset-y-0 left-0 h-full w-3/4 border-r sm:max-w-sm",
 58:           side === "top" &&
 59:             "data-[state=closed]:slide-out-to-top data-[state=open]:slide-in-from-top inset-x-0 top-0 h-auto border-b",
 60:           side === "bottom" &&
 61:             "data-[state=closed]:slide-out-to-bottom data-[state=open]:slide-in-from-bottom inset-x-0 bottom-0 h-auto border-t",
 62:           className
 63:         )}
 64:         {...props}
 65:       >
 66:         {children}
 67:         <SheetPrimitive.Close className="ring-offset-background focus:ring-ring data-[state=open]:bg-secondary absolute top-4 right-4 rounded-xs opacity-70 transition-opacity hover:opacity-100 focus:ring-2 focus:ring-offset-2 focus:outline-hidden disabled:pointer-events-none">
 68:           <XIcon className="size-4" />
 69:           <span className="sr-only">Close</span>
 70:         </SheetPrimitive.Close>
 71:       </SheetPrimitive.Content>
 72:     </SheetPortal>
 73:   )
 74: }
 75: function SheetHeader({ className, ...props }: React.ComponentProps<"div">) {
 76:   return (
 77:     <div
 78:       data-slot="sheet-header"
 79:       className={cn("flex flex-col gap-1.5 p-4", className)}
 80:       {...props}
 81:     />
 82:   )
 83: }
 84: function SheetFooter({ className, ...props }: React.ComponentProps<"div">) {
 85:   return (
 86:     <div
 87:       data-slot="sheet-footer"
 88:       className={cn("mt-auto flex flex-col gap-2 p-4", className)}
 89:       {...props}
 90:     />
 91:   )
 92: }
 93: function SheetTitle({
 94:   className,
 95:   ...props
 96: }: React.ComponentProps<typeof SheetPrimitive.Title>) {
 97:   return (
 98:     <SheetPrimitive.Title
 99:       data-slot="sheet-title"
100:       className={cn("text-foreground font-semibold", className)}
101:       {...props}
102:     />
103:   )
104: }
105: function SheetDescription({
106:   className,
107:   ...props
108: }: React.ComponentProps<typeof SheetPrimitive.Description>) {
109:   return (
110:     <SheetPrimitive.Description
111:       data-slot="sheet-description"
112:       className={cn("text-muted-foreground text-sm", className)}
113:       {...props}
114:     />
115:   )
116: }
117: export {
118:   Sheet,
119:   SheetTrigger,
120:   SheetClose,
121:   SheetContent,
122:   SheetHeader,
123:   SheetFooter,
124:   SheetTitle,
125:   SheetDescription,
126: }
```

## File: src/components/ui/sidebar.tsx
```typescript
  1: "use client"
  2: import * as React from "react"
  3: import { Slot } from "@radix-ui/react-slot"
  4: import { cva, VariantProps } from "class-variance-authority"
  5: import { PanelLeftIcon } from "lucide-react"
  6: import { useIsMobile } from "@/hooks/use-mobile"
  7: import { cn } from "@/lib/utils"
  8: import { Button } from "@/components/ui/button"
  9: import { Input } from "@/components/ui/input"
 10: import { Separator } from "@/components/ui/separator"
 11: import {
 12:   Sheet,
 13:   SheetContent,
 14:   SheetDescription,
 15:   SheetHeader,
 16:   SheetTitle,
 17: } from "@/components/ui/sheet"
 18: import { Skeleton } from "@/components/ui/skeleton"
 19: import {
 20:   Tooltip,
 21:   TooltipContent,
 22:   TooltipProvider,
 23:   TooltipTrigger,
 24: } from "@/components/ui/tooltip"
 25: const SIDEBAR_COOKIE_NAME = "sidebar_state"
 26: const SIDEBAR_COOKIE_MAX_AGE = 60 * 60 * 24 * 7
 27: const SIDEBAR_WIDTH = "16rem"
 28: const SIDEBAR_WIDTH_MOBILE = "18rem"
 29: const SIDEBAR_WIDTH_ICON = "3rem"
 30: const SIDEBAR_KEYBOARD_SHORTCUT = "b"
 31: type SidebarContextProps = {
 32:   state: "expanded" | "collapsed"
 33:   open: boolean
 34:   setOpen: (open: boolean) => void
 35:   openMobile: boolean
 36:   setOpenMobile: (open: boolean) => void
 37:   isMobile: boolean
 38:   toggleSidebar: () => void
 39: }
 40: const SidebarContext = React.createContext<SidebarContextProps | null>(null)
 41: function useSidebar() {
 42:   const context = React.useContext(SidebarContext)
 43:   if (!context) {
 44:     throw new Error("useSidebar must be used within a SidebarProvider.")
 45:   }
 46:   return context
 47: }
 48: function SidebarProvider({
 49:   defaultOpen = true,
 50:   open: openProp,
 51:   onOpenChange: setOpenProp,
 52:   className,
 53:   style,
 54:   children,
 55:   ...props
 56: }: React.ComponentProps<"div"> & {
 57:   defaultOpen?: boolean
 58:   open?: boolean
 59:   onOpenChange?: (open: boolean) => void
 60: }) {
 61:   const isMobile = useIsMobile()
 62:   const [openMobile, setOpenMobile] = React.useState(false)
 63:   // This is the internal state of the sidebar.
 64:   // We use openProp and setOpenProp for control from outside the component.
 65:   const [_open, _setOpen] = React.useState(defaultOpen)
 66:   const open = openProp ?? _open
 67:   const setOpen = React.useCallback(
 68:     (value: boolean | ((value: boolean) => boolean)) => {
 69:       const openState = typeof value === "function" ? value(open) : value
 70:       if (setOpenProp) {
 71:         setOpenProp(openState)
 72:       } else {
 73:         _setOpen(openState)
 74:       }
 75:       // This sets the cookie to keep the sidebar state.
 76:       document.cookie = `${SIDEBAR_COOKIE_NAME}=${openState}; path=/; max-age=${SIDEBAR_COOKIE_MAX_AGE}`
 77:     },
 78:     [setOpenProp, open]
 79:   )
 80:   // Helper to toggle the sidebar.
 81:   const toggleSidebar = React.useCallback(() => {
 82:     return isMobile ? setOpenMobile((open) => !open) : setOpen((open) => !open)
 83:   }, [isMobile, setOpen, setOpenMobile])
 84:   // Adds a keyboard shortcut to toggle the sidebar.
 85:   React.useEffect(() => {
 86:     const handleKeyDown = (event: KeyboardEvent) => {
 87:       if (
 88:         event.key === SIDEBAR_KEYBOARD_SHORTCUT &&
 89:         (event.metaKey || event.ctrlKey)
 90:       ) {
 91:         event.preventDefault()
 92:         toggleSidebar()
 93:       }
 94:     }
 95:     window.addEventListener("keydown", handleKeyDown)
 96:     return () => window.removeEventListener("keydown", handleKeyDown)
 97:   }, [toggleSidebar])
 98:   // We add a state so that we can do data-state="expanded" or "collapsed".
 99:   // This makes it easier to style the sidebar with Tailwind classes.
100:   const state = open ? "expanded" : "collapsed"
101:   const contextValue = React.useMemo<SidebarContextProps>(
102:     () => ({
103:       state,
104:       open,
105:       setOpen,
106:       isMobile,
107:       openMobile,
108:       setOpenMobile,
109:       toggleSidebar,
110:     }),
111:     [state, open, setOpen, isMobile, openMobile, setOpenMobile, toggleSidebar]
112:   )
113:   return (
114:     <SidebarContext.Provider value={contextValue}>
115:       <TooltipProvider delayDuration={0}>
116:         <div
117:           data-slot="sidebar-wrapper"
118:           style={
119:             {
120:               "--sidebar-width": SIDEBAR_WIDTH,
121:               "--sidebar-width-icon": SIDEBAR_WIDTH_ICON,
122:               ...style,
123:             } as React.CSSProperties
124:           }
125:           className={cn(
126:             "group/sidebar-wrapper has-data-[variant=inset]:bg-sidebar flex min-h-svh w-full",
127:             className
128:           )}
129:           {...props}
130:         >
131:           {children}
132:         </div>
133:       </TooltipProvider>
134:     </SidebarContext.Provider>
135:   )
136: }
137: function Sidebar({
138:   side = "left",
139:   variant = "sidebar",
140:   collapsible = "offcanvas",
141:   className,
142:   children,
143:   ...props
144: }: React.ComponentProps<"div"> & {
145:   side?: "left" | "right"
146:   variant?: "sidebar" | "floating" | "inset"
147:   collapsible?: "offcanvas" | "icon" | "none"
148: }) {
149:   const { isMobile, state, openMobile, setOpenMobile } = useSidebar()
150:   if (collapsible === "none") {
151:     return (
152:       <div
153:         data-slot="sidebar"
154:         className={cn(
155:           "bg-sidebar text-sidebar-foreground flex h-full w-(--sidebar-width) flex-col",
156:           className
157:         )}
158:         {...props}
159:       >
160:         {children}
161:       </div>
162:     )
163:   }
164:   if (isMobile) {
165:     return (
166:       <Sheet open={openMobile} onOpenChange={setOpenMobile} {...props}>
167:         <SheetContent
168:           data-sidebar="sidebar"
169:           data-slot="sidebar"
170:           data-mobile="true"
171:           className="bg-sidebar text-sidebar-foreground w-(--sidebar-width) p-0 [&>button]:hidden"
172:           style={
173:             {
174:               "--sidebar-width": SIDEBAR_WIDTH_MOBILE,
175:             } as React.CSSProperties
176:           }
177:           side={side}
178:         >
179:           <SheetHeader className="sr-only">
180:             <SheetTitle>Sidebar</SheetTitle>
181:             <SheetDescription>Displays the mobile sidebar.</SheetDescription>
182:           </SheetHeader>
183:           <div className="flex h-full w-full flex-col">{children}</div>
184:         </SheetContent>
185:       </Sheet>
186:     )
187:   }
188:   return (
189:     <div
190:       className="group peer text-sidebar-foreground hidden md:block"
191:       data-state={state}
192:       data-collapsible={state === "collapsed" ? collapsible : ""}
193:       data-variant={variant}
194:       data-side={side}
195:       data-slot="sidebar"
196:     >
197:       {/* This is what handles the sidebar gap on desktop */}
198:       <div
199:         data-slot="sidebar-gap"
200:         className={cn(
201:           "relative w-(--sidebar-width) bg-transparent transition-[width] duration-200 ease-linear",
202:           "group-data-[collapsible=offcanvas]:w-0",
203:           "group-data-[side=right]:rotate-180",
204:           variant === "floating" || variant === "inset"
205:             ? "group-data-[collapsible=icon]:w-[calc(var(--sidebar-width-icon)+(--spacing(4)))]"
206:             : "group-data-[collapsible=icon]:w-(--sidebar-width-icon)"
207:         )}
208:       />
209:       <div
210:         data-slot="sidebar-container"
211:         className={cn(
212:           "fixed inset-y-0 z-10 hidden h-svh w-(--sidebar-width) transition-[left,right,width] duration-200 ease-linear md:flex",
213:           side === "left"
214:             ? "left-0 group-data-[collapsible=offcanvas]:left-[calc(var(--sidebar-width)*-1)]"
215:             : "right-0 group-data-[collapsible=offcanvas]:right-[calc(var(--sidebar-width)*-1)]",
216:           // Adjust the padding for floating and inset variants.
217:           variant === "floating" || variant === "inset"
218:             ? "p-2 group-data-[collapsible=icon]:w-[calc(var(--sidebar-width-icon)+(--spacing(4))+2px)]"
219:             : "group-data-[collapsible=icon]:w-(--sidebar-width-icon) group-data-[side=left]:border-r group-data-[side=right]:border-l",
220:           className
221:         )}
222:         {...props}
223:       >
224:         <div
225:           data-sidebar="sidebar"
226:           data-slot="sidebar-inner"
227:           className="bg-sidebar group-data-[variant=floating]:border-sidebar-border flex h-full w-full flex-col group-data-[variant=floating]:rounded-lg group-data-[variant=floating]:border group-data-[variant=floating]:shadow-sm"
228:         >
229:           {children}
230:         </div>
231:       </div>
232:     </div>
233:   )
234: }
235: function SidebarTrigger({
236:   className,
237:   onClick,
238:   ...props
239: }: React.ComponentProps<typeof Button>) {
240:   const { toggleSidebar } = useSidebar()
241:   return (
242:     <Button
243:       data-sidebar="trigger"
244:       data-slot="sidebar-trigger"
245:       variant="ghost"
246:       size="icon"
247:       className={cn("size-7", className)}
248:       onClick={(event) => {
249:         onClick?.(event)
250:         toggleSidebar()
251:       }}
252:       {...props}
253:     >
254:       <PanelLeftIcon />
255:       <span className="sr-only">Toggle Sidebar</span>
256:     </Button>
257:   )
258: }
259: function SidebarRail({ className, ...props }: React.ComponentProps<"button">) {
260:   const { toggleSidebar } = useSidebar()
261:   return (
262:     <button
263:       data-sidebar="rail"
264:       data-slot="sidebar-rail"
265:       aria-label="Toggle Sidebar"
266:       tabIndex={-1}
267:       onClick={toggleSidebar}
268:       title="Toggle Sidebar"
269:       className={cn(
270:         "hover:after:bg-sidebar-border absolute inset-y-0 z-20 hidden w-4 -translate-x-1/2 transition-all ease-linear group-data-[side=left]:-right-4 group-data-[side=right]:left-0 after:absolute after:inset-y-0 after:left-1/2 after:w-[2px] sm:flex",
271:         "in-data-[side=left]:cursor-w-resize in-data-[side=right]:cursor-e-resize",
272:         "[[data-side=left][data-state=collapsed]_&]:cursor-e-resize [[data-side=right][data-state=collapsed]_&]:cursor-w-resize",
273:         "hover:group-data-[collapsible=offcanvas]:bg-sidebar group-data-[collapsible=offcanvas]:translate-x-0 group-data-[collapsible=offcanvas]:after:left-full",
274:         "[[data-side=left][data-collapsible=offcanvas]_&]:-right-2",
275:         "[[data-side=right][data-collapsible=offcanvas]_&]:-left-2",
276:         className
277:       )}
278:       {...props}
279:     />
280:   )
281: }
282: function SidebarInset({ className, ...props }: React.ComponentProps<"main">) {
283:   return (
284:     <main
285:       data-slot="sidebar-inset"
286:       className={cn(
287:         "bg-background relative flex w-full flex-1 flex-col",
288:         "md:peer-data-[variant=inset]:m-2 md:peer-data-[variant=inset]:ml-0 md:peer-data-[variant=inset]:rounded-xl md:peer-data-[variant=inset]:shadow-sm md:peer-data-[variant=inset]:peer-data-[state=collapsed]:ml-2",
289:         className
290:       )}
291:       {...props}
292:     />
293:   )
294: }
295: function SidebarInput({
296:   className,
297:   ...props
298: }: React.ComponentProps<typeof Input>) {
299:   return (
300:     <Input
301:       data-slot="sidebar-input"
302:       data-sidebar="input"
303:       className={cn("bg-background h-8 w-full shadow-none", className)}
304:       {...props}
305:     />
306:   )
307: }
308: function SidebarHeader({ className, ...props }: React.ComponentProps<"div">) {
309:   return (
310:     <div
311:       data-slot="sidebar-header"
312:       data-sidebar="header"
313:       className={cn("flex flex-col gap-2 p-2", className)}
314:       {...props}
315:     />
316:   )
317: }
318: function SidebarFooter({ className, ...props }: React.ComponentProps<"div">) {
319:   return (
320:     <div
321:       data-slot="sidebar-footer"
322:       data-sidebar="footer"
323:       className={cn("flex flex-col gap-2 p-2", className)}
324:       {...props}
325:     />
326:   )
327: }
328: function SidebarSeparator({
329:   className,
330:   ...props
331: }: React.ComponentProps<typeof Separator>) {
332:   return (
333:     <Separator
334:       data-slot="sidebar-separator"
335:       data-sidebar="separator"
336:       className={cn("bg-sidebar-border mx-2 w-auto", className)}
337:       {...props}
338:     />
339:   )
340: }
341: function SidebarContent({ className, ...props }: React.ComponentProps<"div">) {
342:   return (
343:     <div
344:       data-slot="sidebar-content"
345:       data-sidebar="content"
346:       className={cn(
347:         "flex min-h-0 flex-1 flex-col gap-2 overflow-auto group-data-[collapsible=icon]:overflow-hidden",
348:         className
349:       )}
350:       {...props}
351:     />
352:   )
353: }
354: function SidebarGroup({ className, ...props }: React.ComponentProps<"div">) {
355:   return (
356:     <div
357:       data-slot="sidebar-group"
358:       data-sidebar="group"
359:       className={cn("relative flex w-full min-w-0 flex-col p-2", className)}
360:       {...props}
361:     />
362:   )
363: }
364: function SidebarGroupLabel({
365:   className,
366:   asChild = false,
367:   ...props
368: }: React.ComponentProps<"div"> & { asChild?: boolean }) {
369:   const Comp = asChild ? Slot : "div"
370:   return (
371:     <Comp
372:       data-slot="sidebar-group-label"
373:       data-sidebar="group-label"
374:       className={cn(
375:         "text-sidebar-foreground/70 ring-sidebar-ring flex h-8 shrink-0 items-center rounded-md px-2 text-xs font-medium outline-hidden transition-[margin,opacity] duration-200 ease-linear focus-visible:ring-2 [&>svg]:size-4 [&>svg]:shrink-0",
376:         "group-data-[collapsible=icon]:-mt-8 group-data-[collapsible=icon]:opacity-0",
377:         className
378:       )}
379:       {...props}
380:     />
381:   )
382: }
383: function SidebarGroupAction({
384:   className,
385:   asChild = false,
386:   ...props
387: }: React.ComponentProps<"button"> & { asChild?: boolean }) {
388:   const Comp = asChild ? Slot : "button"
389:   return (
390:     <Comp
391:       data-slot="sidebar-group-action"
392:       data-sidebar="group-action"
393:       className={cn(
394:         "text-sidebar-foreground ring-sidebar-ring hover:bg-sidebar-accent hover:text-sidebar-accent-foreground absolute top-3.5 right-3 flex aspect-square w-5 items-center justify-center rounded-md p-0 outline-hidden transition-transform focus-visible:ring-2 [&>svg]:size-4 [&>svg]:shrink-0",
395:         // Increases the hit area of the button on mobile.
396:         "after:absolute after:-inset-2 md:after:hidden",
397:         "group-data-[collapsible=icon]:hidden",
398:         className
399:       )}
400:       {...props}
401:     />
402:   )
403: }
404: function SidebarGroupContent({
405:   className,
406:   ...props
407: }: React.ComponentProps<"div">) {
408:   return (
409:     <div
410:       data-slot="sidebar-group-content"
411:       data-sidebar="group-content"
412:       className={cn("w-full text-sm", className)}
413:       {...props}
414:     />
415:   )
416: }
417: function SidebarMenu({ className, ...props }: React.ComponentProps<"ul">) {
418:   return (
419:     <ul
420:       data-slot="sidebar-menu"
421:       data-sidebar="menu"
422:       className={cn("flex w-full min-w-0 flex-col gap-1", className)}
423:       {...props}
424:     />
425:   )
426: }
427: function SidebarMenuItem({ className, ...props }: React.ComponentProps<"li">) {
428:   return (
429:     <li
430:       data-slot="sidebar-menu-item"
431:       data-sidebar="menu-item"
432:       className={cn("group/menu-item relative", className)}
433:       {...props}
434:     />
435:   )
436: }
437: const sidebarMenuButtonVariants = cva(
438:   "peer/menu-button flex w-full items-center gap-2 overflow-hidden rounded-md p-2 text-left text-sm outline-hidden ring-sidebar-ring transition-[width,height,padding] hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:ring-2 active:bg-sidebar-accent active:text-sidebar-accent-foreground disabled:pointer-events-none disabled:opacity-50 group-has-data-[sidebar=menu-action]/menu-item:pr-8 aria-disabled:pointer-events-none aria-disabled:opacity-50 data-[active=true]:bg-sidebar-accent data-[active=true]:font-medium data-[active=true]:text-sidebar-accent-foreground data-[state=open]:hover:bg-sidebar-accent data-[state=open]:hover:text-sidebar-accent-foreground group-data-[collapsible=icon]:size-8! group-data-[collapsible=icon]:p-2! [&>span:last-child]:truncate [&>svg]:size-4 [&>svg]:shrink-0",
439:   {
440:     variants: {
441:       variant: {
442:         default: "hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
443:         outline:
444:           "bg-background shadow-[0_0_0_1px_hsl(var(--sidebar-border))] hover:bg-sidebar-accent hover:text-sidebar-accent-foreground hover:shadow-[0_0_0_1px_hsl(var(--sidebar-accent))]",
445:       },
446:       size: {
447:         default: "h-8 text-sm",
448:         sm: "h-7 text-xs",
449:         lg: "h-12 text-sm group-data-[collapsible=icon]:p-0!",
450:       },
451:     },
452:     defaultVariants: {
453:       variant: "default",
454:       size: "default",
455:     },
456:   }
457: )
458: function SidebarMenuButton({
459:   asChild = false,
460:   isActive = false,
461:   variant = "default",
462:   size = "default",
463:   tooltip,
464:   className,
465:   ...props
466: }: React.ComponentProps<"button"> & {
467:   asChild?: boolean
468:   isActive?: boolean
469:   tooltip?: string | React.ComponentProps<typeof TooltipContent>
470: } & VariantProps<typeof sidebarMenuButtonVariants>) {
471:   const Comp = asChild ? Slot : "button"
472:   const { isMobile, state } = useSidebar()
473:   const button = (
474:     <Comp
475:       data-slot="sidebar-menu-button"
476:       data-sidebar="menu-button"
477:       data-size={size}
478:       data-active={isActive}
479:       className={cn(sidebarMenuButtonVariants({ variant, size }), className)}
480:       {...props}
481:     />
482:   )
483:   if (!tooltip) {
484:     return button
485:   }
486:   if (typeof tooltip === "string") {
487:     tooltip = {
488:       children: tooltip,
489:     }
490:   }
491:   return (
492:     <Tooltip>
493:       <TooltipTrigger asChild>{button}</TooltipTrigger>
494:       <TooltipContent
495:         side="right"
496:         align="center"
497:         hidden={state !== "collapsed" || isMobile}
498:         {...tooltip}
499:       />
500:     </Tooltip>
501:   )
502: }
503: function SidebarMenuAction({
504:   className,
505:   asChild = false,
506:   showOnHover = false,
507:   ...props
508: }: React.ComponentProps<"button"> & {
509:   asChild?: boolean
510:   showOnHover?: boolean
511: }) {
512:   const Comp = asChild ? Slot : "button"
513:   return (
514:     <Comp
515:       data-slot="sidebar-menu-action"
516:       data-sidebar="menu-action"
517:       className={cn(
518:         "text-sidebar-foreground ring-sidebar-ring hover:bg-sidebar-accent hover:text-sidebar-accent-foreground peer-hover/menu-button:text-sidebar-accent-foreground absolute top-1.5 right-1 flex aspect-square w-5 items-center justify-center rounded-md p-0 outline-hidden transition-transform focus-visible:ring-2 [&>svg]:size-4 [&>svg]:shrink-0",
519:         // Increases the hit area of the button on mobile.
520:         "after:absolute after:-inset-2 md:after:hidden",
521:         "peer-data-[size=sm]/menu-button:top-1",
522:         "peer-data-[size=default]/menu-button:top-1.5",
523:         "peer-data-[size=lg]/menu-button:top-2.5",
524:         "group-data-[collapsible=icon]:hidden",
525:         showOnHover &&
526:           "peer-data-[active=true]/menu-button:text-sidebar-accent-foreground group-focus-within/menu-item:opacity-100 group-hover/menu-item:opacity-100 data-[state=open]:opacity-100 md:opacity-0",
527:         className
528:       )}
529:       {...props}
530:     />
531:   )
532: }
533: function SidebarMenuBadge({
534:   className,
535:   ...props
536: }: React.ComponentProps<"div">) {
537:   return (
538:     <div
539:       data-slot="sidebar-menu-badge"
540:       data-sidebar="menu-badge"
541:       className={cn(
542:         "text-sidebar-foreground pointer-events-none absolute right-1 flex h-5 min-w-5 items-center justify-center rounded-md px-1 text-xs font-medium tabular-nums select-none",
543:         "peer-hover/menu-button:text-sidebar-accent-foreground peer-data-[active=true]/menu-button:text-sidebar-accent-foreground",
544:         "peer-data-[size=sm]/menu-button:top-1",
545:         "peer-data-[size=default]/menu-button:top-1.5",
546:         "peer-data-[size=lg]/menu-button:top-2.5",
547:         "group-data-[collapsible=icon]:hidden",
548:         className
549:       )}
550:       {...props}
551:     />
552:   )
553: }
554: function SidebarMenuSkeleton({
555:   className,
556:   showIcon = false,
557:   ...props
558: }: React.ComponentProps<"div"> & {
559:   showIcon?: boolean
560: }) {
561:   // Random width between 50 to 90%.
562:   const width = React.useMemo(() => {
563:     return `${Math.floor(Math.random() * 40) + 50}%`
564:   }, [])
565:   return (
566:     <div
567:       data-slot="sidebar-menu-skeleton"
568:       data-sidebar="menu-skeleton"
569:       className={cn("flex h-8 items-center gap-2 rounded-md px-2", className)}
570:       {...props}
571:     >
572:       {showIcon && (
573:         <Skeleton
574:           className="size-4 rounded-md"
575:           data-sidebar="menu-skeleton-icon"
576:         />
577:       )}
578:       <Skeleton
579:         className="h-4 max-w-(--skeleton-width) flex-1"
580:         data-sidebar="menu-skeleton-text"
581:         style={
582:           {
583:             "--skeleton-width": width,
584:           } as React.CSSProperties
585:         }
586:       />
587:     </div>
588:   )
589: }
590: function SidebarMenuSub({ className, ...props }: React.ComponentProps<"ul">) {
591:   return (
592:     <ul
593:       data-slot="sidebar-menu-sub"
594:       data-sidebar="menu-sub"
595:       className={cn(
596:         "border-sidebar-border mx-3.5 flex min-w-0 translate-x-px flex-col gap-1 border-l px-2.5 py-0.5",
597:         "group-data-[collapsible=icon]:hidden",
598:         className
599:       )}
600:       {...props}
601:     />
602:   )
603: }
604: function SidebarMenuSubItem({
605:   className,
606:   ...props
607: }: React.ComponentProps<"li">) {
608:   return (
609:     <li
610:       data-slot="sidebar-menu-sub-item"
611:       data-sidebar="menu-sub-item"
612:       className={cn("group/menu-sub-item relative", className)}
613:       {...props}
614:     />
615:   )
616: }
617: function SidebarMenuSubButton({
618:   asChild = false,
619:   size = "md",
620:   isActive = false,
621:   className,
622:   ...props
623: }: React.ComponentProps<"a"> & {
624:   asChild?: boolean
625:   size?: "sm" | "md"
626:   isActive?: boolean
627: }) {
628:   const Comp = asChild ? Slot : "a"
629:   return (
630:     <Comp
631:       data-slot="sidebar-menu-sub-button"
632:       data-sidebar="menu-sub-button"
633:       data-size={size}
634:       data-active={isActive}
635:       className={cn(
636:         "text-sidebar-foreground ring-sidebar-ring hover:bg-sidebar-accent hover:text-sidebar-accent-foreground active:bg-sidebar-accent active:text-sidebar-accent-foreground [&>svg]:text-sidebar-accent-foreground flex h-7 min-w-0 -translate-x-px items-center gap-2 overflow-hidden rounded-md px-2 outline-hidden focus-visible:ring-2 disabled:pointer-events-none disabled:opacity-50 aria-disabled:pointer-events-none aria-disabled:opacity-50 [&>span:last-child]:truncate [&>svg]:size-4 [&>svg]:shrink-0",
637:         "data-[active=true]:bg-sidebar-accent data-[active=true]:text-sidebar-accent-foreground",
638:         size === "sm" && "text-xs",
639:         size === "md" && "text-sm",
640:         "group-data-[collapsible=icon]:hidden",
641:         className
642:       )}
643:       {...props}
644:     />
645:   )
646: }
647: export {
648:   Sidebar,
649:   SidebarContent,
650:   SidebarFooter,
651:   SidebarGroup,
652:   SidebarGroupAction,
653:   SidebarGroupContent,
654:   SidebarGroupLabel,
655:   SidebarHeader,
656:   SidebarInput,
657:   SidebarInset,
658:   SidebarMenu,
659:   SidebarMenuAction,
660:   SidebarMenuBadge,
661:   SidebarMenuButton,
662:   SidebarMenuItem,
663:   SidebarMenuSkeleton,
664:   SidebarMenuSub,
665:   SidebarMenuSubButton,
666:   SidebarMenuSubItem,
667:   SidebarProvider,
668:   SidebarRail,
669:   SidebarSeparator,
670:   SidebarTrigger,
671:   useSidebar,
672: }
```

## File: src/components/ui/skeleton.tsx
```typescript
 1: import { cn } from "@/lib/utils"
 2: function Skeleton({ className, ...props }: React.ComponentProps<"div">) {
 3:   return (
 4:     <div
 5:       data-slot="skeleton"
 6:       className={cn("bg-accent animate-pulse rounded-md", className)}
 7:       {...props}
 8:     />
 9:   )
10: }
11: export { Skeleton }
```

## File: src/components/ui/slider.tsx
```typescript
 1: "use client"
 2: import * as React from "react"
 3: import * as SliderPrimitive from "@radix-ui/react-slider"
 4: import { cn } from "@/lib/utils"
 5: function Slider({
 6:   className,
 7:   defaultValue,
 8:   value,
 9:   min = 0,
10:   max = 100,
11:   ...props
12: }: React.ComponentProps<typeof SliderPrimitive.Root>) {
13:   const _values = React.useMemo(
14:     () =>
15:       Array.isArray(value)
16:         ? value
17:         : Array.isArray(defaultValue)
18:           ? defaultValue
19:           : [min, max],
20:     [value, defaultValue, min, max]
21:   )
22:   return (
23:     <SliderPrimitive.Root
24:       data-slot="slider"
25:       defaultValue={defaultValue}
26:       value={value}
27:       min={min}
28:       max={max}
29:       className={cn(
30:         "relative flex w-full touch-none items-center select-none data-[disabled]:opacity-50 data-[orientation=vertical]:h-full data-[orientation=vertical]:min-h-44 data-[orientation=vertical]:w-auto data-[orientation=vertical]:flex-col",
31:         className
32:       )}
33:       {...props}
34:     >
35:       <SliderPrimitive.Track
36:         data-slot="slider-track"
37:         className={cn(
38:           "bg-muted relative grow overflow-hidden rounded-full data-[orientation=horizontal]:h-1.5 data-[orientation=horizontal]:w-full data-[orientation=vertical]:h-full data-[orientation=vertical]:w-1.5"
39:         )}
40:       >
41:         <SliderPrimitive.Range
42:           data-slot="slider-range"
43:           className={cn(
44:             "bg-primary absolute data-[orientation=horizontal]:h-full data-[orientation=vertical]:w-full"
45:           )}
46:         />
47:       </SliderPrimitive.Track>
48:       {Array.from({ length: _values.length }, (_, index) => (
49:         <SliderPrimitive.Thumb
50:           data-slot="slider-thumb"
51:           key={index}
52:           className="border-primary bg-background ring-ring/50 block size-4 shrink-0 rounded-full border shadow-sm transition-[color,box-shadow] hover:ring-4 focus-visible:ring-4 focus-visible:outline-hidden disabled:pointer-events-none disabled:opacity-50"
53:         />
54:       ))}
55:     </SliderPrimitive.Root>
56:   )
57: }
58: export { Slider }
```

## File: src/components/ui/sonner.tsx
```typescript
 1: "use client"
 2: import { useTheme } from "next-themes"
 3: import { Toaster as Sonner, ToasterProps } from "sonner"
 4: const Toaster = ({ ...props }: ToasterProps) => {
 5:   const { theme = "system" } = useTheme()
 6:   return (
 7:     <Sonner
 8:       theme={theme as ToasterProps["theme"]}
 9:       className="toaster group"
10:       style={
11:         {
12:           "--normal-bg": "var(--popover)",
13:           "--normal-text": "var(--popover-foreground)",
14:           "--normal-border": "var(--border)",
15:         } as React.CSSProperties
16:       }
17:       {...props}
18:     />
19:   )
20: }
21: export { Toaster }
```

## File: src/components/ui/switch.tsx
```typescript
 1: "use client"
 2: import * as React from "react"
 3: import * as SwitchPrimitive from "@radix-ui/react-switch"
 4: import { cn } from "@/lib/utils"
 5: function Switch({
 6:   className,
 7:   ...props
 8: }: React.ComponentProps<typeof SwitchPrimitive.Root>) {
 9:   return (
10:     <SwitchPrimitive.Root
11:       data-slot="switch"
12:       className={cn(
13:         "peer data-[state=checked]:bg-primary data-[state=unchecked]:bg-input focus-visible:border-ring focus-visible:ring-ring/50 dark:data-[state=unchecked]:bg-input/80 inline-flex h-[1.15rem] w-8 shrink-0 items-center rounded-full border border-transparent shadow-xs transition-all outline-none focus-visible:ring-[3px] disabled:cursor-not-allowed disabled:opacity-50",
14:         className
15:       )}
16:       {...props}
17:     >
18:       <SwitchPrimitive.Thumb
19:         data-slot="switch-thumb"
20:         className={cn(
21:           "bg-background dark:data-[state=unchecked]:bg-foreground dark:data-[state=checked]:bg-primary-foreground pointer-events-none block size-4 rounded-full ring-0 transition-transform data-[state=checked]:translate-x-[calc(100%-2px)] data-[state=unchecked]:translate-x-0"
22:         )}
23:       />
24:     </SwitchPrimitive.Root>
25:   )
26: }
27: export { Switch }
```

## File: src/components/ui/table.tsx
```typescript
  1: "use client"
  2: import * as React from "react"
  3: import { cn } from "@/lib/utils"
  4: function Table({ className, ...props }: React.ComponentProps<"table">) {
  5:   return (
  6:     <div
  7:       data-slot="table-container"
  8:       className="relative w-full overflow-x-auto"
  9:     >
 10:       <table
 11:         data-slot="table"
 12:         className={cn("w-full caption-bottom text-sm", className)}
 13:         {...props}
 14:       />
 15:     </div>
 16:   )
 17: }
 18: function TableHeader({ className, ...props }: React.ComponentProps<"thead">) {
 19:   return (
 20:     <thead
 21:       data-slot="table-header"
 22:       className={cn("[&_tr]:border-b", className)}
 23:       {...props}
 24:     />
 25:   )
 26: }
 27: function TableBody({ className, ...props }: React.ComponentProps<"tbody">) {
 28:   return (
 29:     <tbody
 30:       data-slot="table-body"
 31:       className={cn("[&_tr:last-child]:border-0", className)}
 32:       {...props}
 33:     />
 34:   )
 35: }
 36: function TableFooter({ className, ...props }: React.ComponentProps<"tfoot">) {
 37:   return (
 38:     <tfoot
 39:       data-slot="table-footer"
 40:       className={cn(
 41:         "bg-muted/50 border-t font-medium [&>tr]:last:border-b-0",
 42:         className
 43:       )}
 44:       {...props}
 45:     />
 46:   )
 47: }
 48: function TableRow({ className, ...props }: React.ComponentProps<"tr">) {
 49:   return (
 50:     <tr
 51:       data-slot="table-row"
 52:       className={cn(
 53:         "hover:bg-muted/50 data-[state=selected]:bg-muted border-b transition-colors",
 54:         className
 55:       )}
 56:       {...props}
 57:     />
 58:   )
 59: }
 60: function TableHead({ className, ...props }: React.ComponentProps<"th">) {
 61:   return (
 62:     <th
 63:       data-slot="table-head"
 64:       className={cn(
 65:         "text-foreground h-10 px-2 text-left align-middle font-medium whitespace-nowrap [&:has([role=checkbox])]:pr-0 [&>[role=checkbox]]:translate-y-[2px]",
 66:         className
 67:       )}
 68:       {...props}
 69:     />
 70:   )
 71: }
 72: function TableCell({ className, ...props }: React.ComponentProps<"td">) {
 73:   return (
 74:     <td
 75:       data-slot="table-cell"
 76:       className={cn(
 77:         "p-2 align-middle whitespace-nowrap [&:has([role=checkbox])]:pr-0 [&>[role=checkbox]]:translate-y-[2px]",
 78:         className
 79:       )}
 80:       {...props}
 81:     />
 82:   )
 83: }
 84: function TableCaption({
 85:   className,
 86:   ...props
 87: }: React.ComponentProps<"caption">) {
 88:   return (
 89:     <caption
 90:       data-slot="table-caption"
 91:       className={cn("text-muted-foreground mt-4 text-sm", className)}
 92:       {...props}
 93:     />
 94:   )
 95: }
 96: export {
 97:   Table,
 98:   TableHeader,
 99:   TableBody,
100:   TableFooter,
101:   TableHead,
102:   TableRow,
103:   TableCell,
104:   TableCaption,
105: }
```

## File: src/components/ui/tabs.tsx
```typescript
 1: "use client"
 2: import * as React from "react"
 3: import * as TabsPrimitive from "@radix-ui/react-tabs"
 4: import { cn } from "@/lib/utils"
 5: function Tabs({
 6:   className,
 7:   ...props
 8: }: React.ComponentProps<typeof TabsPrimitive.Root>) {
 9:   return (
10:     <TabsPrimitive.Root
11:       data-slot="tabs"
12:       className={cn("flex flex-col gap-2", className)}
13:       {...props}
14:     />
15:   )
16: }
17: function TabsList({
18:   className,
19:   ...props
20: }: React.ComponentProps<typeof TabsPrimitive.List>) {
21:   return (
22:     <TabsPrimitive.List
23:       data-slot="tabs-list"
24:       className={cn(
25:         "bg-muted text-muted-foreground inline-flex h-9 w-fit items-center justify-center rounded-lg p-[3px]",
26:         className
27:       )}
28:       {...props}
29:     />
30:   )
31: }
32: function TabsTrigger({
33:   className,
34:   ...props
35: }: React.ComponentProps<typeof TabsPrimitive.Trigger>) {
36:   return (
37:     <TabsPrimitive.Trigger
38:       data-slot="tabs-trigger"
39:       className={cn(
40:         "data-[state=active]:bg-background dark:data-[state=active]:text-foreground focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:outline-ring dark:data-[state=active]:border-input dark:data-[state=active]:bg-input/30 text-foreground dark:text-muted-foreground inline-flex h-[calc(100%-1px)] flex-1 items-center justify-center gap-1.5 rounded-md border border-transparent px-2 py-1 text-sm font-medium whitespace-nowrap transition-[color,box-shadow] focus-visible:ring-[3px] focus-visible:outline-1 disabled:pointer-events-none disabled:opacity-50 data-[state=active]:shadow-sm [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
41:         className
42:       )}
43:       {...props}
44:     />
45:   )
46: }
47: function TabsContent({
48:   className,
49:   ...props
50: }: React.ComponentProps<typeof TabsPrimitive.Content>) {
51:   return (
52:     <TabsPrimitive.Content
53:       data-slot="tabs-content"
54:       className={cn("flex-1 outline-none", className)}
55:       {...props}
56:     />
57:   )
58: }
59: export { Tabs, TabsList, TabsTrigger, TabsContent }
```

## File: src/components/ui/textarea.tsx
```typescript
 1: import * as React from "react"
 2: import { cn } from "@/lib/utils"
 3: function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
 4:   return (
 5:     <textarea
 6:       data-slot="textarea"
 7:       className={cn(
 8:         "border-input placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-ring/50 aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive dark:bg-input/30 flex field-sizing-content min-h-16 w-full rounded-md border bg-transparent px-3 py-2 text-base shadow-xs transition-[color,box-shadow] outline-none focus-visible:ring-[3px] disabled:cursor-not-allowed disabled:opacity-50 md:text-sm",
 9:         className
10:       )}
11:       {...props}
12:     />
13:   )
14: }
15: export { Textarea }
```

## File: src/components/ui/toast.tsx
```typescript
  1: "use client"
  2: import * as React from "react"
  3: import * as ToastPrimitives from "@radix-ui/react-toast"
  4: import { cva, type VariantProps } from "class-variance-authority"
  5: import { X } from "lucide-react"
  6: import { cn } from "@/lib/utils"
  7: const ToastProvider = ToastPrimitives.Provider
  8: const ToastViewport = React.forwardRef<
  9:   React.ElementRef<typeof ToastPrimitives.Viewport>,
 10:   React.ComponentPropsWithoutRef<typeof ToastPrimitives.Viewport>
 11: >(({ className, ...props }, ref) => (
 12:   <ToastPrimitives.Viewport
 13:     ref={ref}
 14:     className={cn(
 15:       "fixed top-0 z-[100] flex max-h-screen w-full flex-col-reverse p-4 sm:bottom-0 sm:right-0 sm:top-auto sm:flex-col md:max-w-[420px]",
 16:       className
 17:     )}
 18:     {...props}
 19:   />
 20: ))
 21: ToastViewport.displayName = ToastPrimitives.Viewport.displayName
 22: const toastVariants = cva(
 23:   "group pointer-events-auto relative flex w-full items-center justify-between space-x-2 overflow-hidden rounded-md border p-4 pr-6 shadow-lg transition-all data-[swipe=cancel]:translate-x-0 data-[swipe=end]:translate-x-[var(--radix-toast-swipe-end-x)] data-[swipe=move]:translate-x-[var(--radix-toast-swipe-move-x)] data-[swipe=move]:transition-none data-[state=open]:animate-in data-[state=closed]:animate-out data-[swipe=end]:animate-out data-[state=closed]:fade-out-80 data-[state=closed]:slide-out-to-right-full data-[state=open]:slide-in-from-top-full data-[state=open]:sm:slide-in-from-bottom-full",
 24:   {
 25:     variants: {
 26:       variant: {
 27:         default: "border bg-background text-foreground",
 28:         destructive:
 29:           "destructive group border-destructive bg-destructive text-destructive-foreground",
 30:       },
 31:     },
 32:     defaultVariants: {
 33:       variant: "default",
 34:     },
 35:   }
 36: )
 37: const Toast = React.forwardRef<
 38:   React.ElementRef<typeof ToastPrimitives.Root>,
 39:   React.ComponentPropsWithoutRef<typeof ToastPrimitives.Root> &
 40:   VariantProps<typeof toastVariants>
 41: >(({ className, variant, ...props }, ref) => {
 42:   return (
 43:     <ToastPrimitives.Root
 44:       ref={ref}
 45:       className={cn(toastVariants({ variant }), className)}
 46:       {...props}
 47:     />
 48:   )
 49: })
 50: Toast.displayName = ToastPrimitives.Root.displayName
 51: const ToastAction = React.forwardRef<
 52:   React.ElementRef<typeof ToastPrimitives.Action>,
 53:   React.ComponentPropsWithoutRef<typeof ToastPrimitives.Action>
 54: >(({ className, ...props }, ref) => (
 55:   <ToastPrimitives.Action
 56:     ref={ref}
 57:     className={cn(
 58:       "inline-flex h-8 shrink-0 items-center justify-center rounded-md border bg-transparent px-3 text-sm font-medium transition-colors hover:bg-secondary focus:outline-none focus:ring-1 focus:ring-ring disabled:pointer-events-none disabled:opacity-50 group-[.destructive]:border-muted/40 group-[.destructive]:hover:border-destructive/30 group-[.destructive]:hover:bg-destructive group-[.destructive]:hover:text-destructive-foreground group-[.destructive]:focus:ring-destructive",
 59:       className
 60:     )}
 61:     {...props}
 62:   />
 63: ))
 64: ToastAction.displayName = ToastPrimitives.Action.displayName
 65: const ToastClose = React.forwardRef<
 66:   React.ElementRef<typeof ToastPrimitives.Close>,
 67:   React.ComponentPropsWithoutRef<typeof ToastPrimitives.Close>
 68: >(({ className, ...props }, ref) => (
 69:   <ToastPrimitives.Close
 70:     ref={ref}
 71:     className={cn(
 72:       "absolute right-1 top-1 rounded-md p-1 text-foreground/50 opacity-0 transition-opacity hover:text-foreground focus:opacity-100 focus:outline-none focus:ring-1 group-hover:opacity-100 group-[.destructive]:text-red-300 group-[.destructive]:hover:text-red-50 group-[.destructive]:focus:ring-red-400 group-[.destructive]:focus:ring-offset-red-600",
 73:       className
 74:     )}
 75:     toast-close=""
 76:     {...props}
 77:   >
 78:     <X className="h-4 w-4" />
 79:   </ToastPrimitives.Close>
 80: ))
 81: ToastClose.displayName = ToastPrimitives.Close.displayName
 82: const ToastTitle = React.forwardRef<
 83:   React.ElementRef<typeof ToastPrimitives.Title>,
 84:   React.ComponentPropsWithoutRef<typeof ToastPrimitives.Title>
 85: >(({ className, ...props }, ref) => (
 86:   <ToastPrimitives.Title
 87:     ref={ref}
 88:     className={cn("text-sm font-semibold [&+div]:text-xs", className)}
 89:     {...props}
 90:   />
 91: ))
 92: ToastTitle.displayName = ToastPrimitives.Title.displayName
 93: const ToastDescription = React.forwardRef<
 94:   React.ElementRef<typeof ToastPrimitives.Description>,
 95:   React.ComponentPropsWithoutRef<typeof ToastPrimitives.Description>
 96: >(({ className, ...props }, ref) => (
 97:   <ToastPrimitives.Description
 98:     ref={ref}
 99:     className={cn("text-sm opacity-90", className)}
100:     {...props}
101:   />
102: ))
103: ToastDescription.displayName = ToastPrimitives.Description.displayName
104: type ToastProps = React.ComponentPropsWithoutRef<typeof Toast>
105: type ToastActionElement = React.ReactElement<typeof ToastAction>
106: export {
107:   type ToastProps,
108:   type ToastActionElement,
109:   ToastProvider,
110:   ToastViewport,
111:   Toast,
112:   ToastTitle,
113:   ToastDescription,
114:   ToastClose,
115:   ToastAction,
116: }
```

## File: src/components/ui/toaster.tsx
```typescript
 1: "use client"
 2: import { useToast } from "@/hooks/use-toast"
 3: import {
 4:   Toast,
 5:   ToastClose,
 6:   ToastDescription,
 7:   ToastProvider,
 8:   ToastTitle,
 9:   ToastViewport,
10: } from "@/components/ui/toast"
11: export function Toaster() {
12:   const { toasts } = useToast()
13:   return (
14:     <ToastProvider>
15:       {toasts.map(function ({ id, title, description, action, ...props }) {
16:         return (
17:           <Toast key={id} {...props}>
18:             <div className="grid gap-1">
19:               {title && <ToastTitle>{title}</ToastTitle>}
20:               {description && (
21:                 <ToastDescription>{description}</ToastDescription>
22:               )}
23:             </div>
24:             {action}
25:             <ToastClose />
26:           </Toast>
27:         )
28:       })}
29:       <ToastViewport />
30:     </ToastProvider>
31:   )
32: }
```

## File: src/components/ui/toggle-group.tsx
```typescript
 1: "use client"
 2: import * as React from "react"
 3: import * as ToggleGroupPrimitive from "@radix-ui/react-toggle-group"
 4: import { type VariantProps } from "class-variance-authority"
 5: import { cn } from "@/lib/utils"
 6: import { toggleVariants } from "@/components/ui/toggle"
 7: const ToggleGroupContext = React.createContext<
 8:   VariantProps<typeof toggleVariants>
 9: >({
10:   size: "default",
11:   variant: "default",
12: })
13: function ToggleGroup({
14:   className,
15:   variant,
16:   size,
17:   children,
18:   ...props
19: }: React.ComponentProps<typeof ToggleGroupPrimitive.Root> &
20:   VariantProps<typeof toggleVariants>) {
21:   return (
22:     <ToggleGroupPrimitive.Root
23:       data-slot="toggle-group"
24:       data-variant={variant}
25:       data-size={size}
26:       className={cn(
27:         "group/toggle-group flex w-fit items-center rounded-md data-[variant=outline]:shadow-xs",
28:         className
29:       )}
30:       {...props}
31:     >
32:       <ToggleGroupContext.Provider value={{ variant, size }}>
33:         {children}
34:       </ToggleGroupContext.Provider>
35:     </ToggleGroupPrimitive.Root>
36:   )
37: }
38: function ToggleGroupItem({
39:   className,
40:   children,
41:   variant,
42:   size,
43:   ...props
44: }: React.ComponentProps<typeof ToggleGroupPrimitive.Item> &
45:   VariantProps<typeof toggleVariants>) {
46:   const context = React.useContext(ToggleGroupContext)
47:   return (
48:     <ToggleGroupPrimitive.Item
49:       data-slot="toggle-group-item"
50:       data-variant={context.variant || variant}
51:       data-size={context.size || size}
52:       className={cn(
53:         toggleVariants({
54:           variant: context.variant || variant,
55:           size: context.size || size,
56:         }),
57:         "min-w-0 flex-1 shrink-0 rounded-none shadow-none first:rounded-l-md last:rounded-r-md focus:z-10 focus-visible:z-10 data-[variant=outline]:border-l-0 data-[variant=outline]:first:border-l",
58:         className
59:       )}
60:       {...props}
61:     >
62:       {children}
63:     </ToggleGroupPrimitive.Item>
64:   )
65: }
66: export { ToggleGroup, ToggleGroupItem }
```

## File: src/components/ui/toggle.tsx
```typescript
 1: "use client"
 2: import * as React from "react"
 3: import * as TogglePrimitive from "@radix-ui/react-toggle"
 4: import { cva, type VariantProps } from "class-variance-authority"
 5: import { cn } from "@/lib/utils"
 6: const toggleVariants = cva(
 7:   "inline-flex items-center justify-center gap-2 rounded-md text-sm font-medium hover:bg-muted hover:text-muted-foreground disabled:pointer-events-none disabled:opacity-50 data-[state=on]:bg-accent data-[state=on]:text-accent-foreground [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4 [&_svg]:shrink-0 focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] outline-none transition-[color,box-shadow] aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive whitespace-nowrap",
 8:   {
 9:     variants: {
10:       variant: {
11:         default: "bg-transparent",
12:         outline:
13:           "border border-input bg-transparent shadow-xs hover:bg-accent hover:text-accent-foreground",
14:       },
15:       size: {
16:         default: "h-9 px-2 min-w-9",
17:         sm: "h-8 px-1.5 min-w-8",
18:         lg: "h-10 px-2.5 min-w-10",
19:       },
20:     },
21:     defaultVariants: {
22:       variant: "default",
23:       size: "default",
24:     },
25:   }
26: )
27: function Toggle({
28:   className,
29:   variant,
30:   size,
31:   ...props
32: }: React.ComponentProps<typeof TogglePrimitive.Root> &
33:   VariantProps<typeof toggleVariants>) {
34:   return (
35:     <TogglePrimitive.Root
36:       data-slot="toggle"
37:       className={cn(toggleVariants({ variant, size, className }))}
38:       {...props}
39:     />
40:   )
41: }
42: export { Toggle, toggleVariants }
```

## File: src/components/ui/tooltip.tsx
```typescript
 1: "use client"
 2: import * as React from "react"
 3: import * as TooltipPrimitive from "@radix-ui/react-tooltip"
 4: import { cn } from "@/lib/utils"
 5: function TooltipProvider({
 6:   delayDuration = 0,
 7:   ...props
 8: }: React.ComponentProps<typeof TooltipPrimitive.Provider>) {
 9:   return (
10:     <TooltipPrimitive.Provider
11:       data-slot="tooltip-provider"
12:       delayDuration={delayDuration}
13:       {...props}
14:     />
15:   )
16: }
17: function Tooltip({
18:   ...props
19: }: React.ComponentProps<typeof TooltipPrimitive.Root>) {
20:   return (
21:     <TooltipProvider>
22:       <TooltipPrimitive.Root data-slot="tooltip" {...props} />
23:     </TooltipProvider>
24:   )
25: }
26: function TooltipTrigger({
27:   ...props
28: }: React.ComponentProps<typeof TooltipPrimitive.Trigger>) {
29:   return <TooltipPrimitive.Trigger data-slot="tooltip-trigger" {...props} />
30: }
31: function TooltipContent({
32:   className,
33:   sideOffset = 0,
34:   children,
35:   ...props
36: }: React.ComponentProps<typeof TooltipPrimitive.Content>) {
37:   return (
38:     <TooltipPrimitive.Portal>
39:       <TooltipPrimitive.Content
40:         data-slot="tooltip-content"
41:         sideOffset={sideOffset}
42:         className={cn(
43:           "bg-primary text-primary-foreground animate-in fade-in-0 zoom-in-95 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 z-50 w-fit origin-(--radix-tooltip-content-transform-origin) rounded-md px-3 py-1.5 text-xs text-balance",
44:           className
45:         )}
46:         {...props}
47:       >
48:         {children}
49:         <TooltipPrimitive.Arrow className="bg-primary fill-primary z-50 size-2.5 translate-y-[calc(-50%_-_2px)] rotate-45 rounded-[2px]" />
50:       </TooltipPrimitive.Content>
51:     </TooltipPrimitive.Portal>
52:   )
53: }
54: export { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider }
```

## File: src/components/error-boundary.tsx
```typescript
 1: "use client";
 2: import React from "react";
 3: import { AlertCircle, RefreshCw } from "lucide-react";
 4: import { Button } from "@/components/ui/button";
 5: /**
 6:  * React Error Boundary — RusSilica BI Terminal
 7:  *
 8:  * Catches unhandled React errors and shows a user-friendly fallback UI
 9:  * instead of a blank white screen. Users can retry or reload.
10:  *
11:  * NOTE: Error boundaries must be class components — React doesn't support
12:  * componentDidCatch in function components.
13:  */
14: interface ErrorBoundaryProps {
15:   children: React.ReactNode;
16:   fallback?: React.ReactNode;
17: }
18: interface ErrorBoundaryState {
19:   hasError: boolean;
20:   error: Error | null;
21: }
22: export class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
23:   constructor(props: ErrorBoundaryProps) {
24:     super(props);
25:     this.state = { hasError: false, error: null };
26:   }
27:   static getDerivedStateFromError(error: Error): ErrorBoundaryState {
28:     return { hasError: true, error };
29:   }
30:   componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
31:     // Log to console in development, silent in production
32:     if (process.env.NODE_ENV !== "production") {
33:       console.error("[ErrorBoundary] Unhandled React error:", error, errorInfo);
34:     }
35:   }
36:   handleRetry = () => {
37:     this.setState({ hasError: false, error: null });
38:   };
39:   handleReload = () => {
40:     window.location.reload();
41:   };
42:   render() {
43:     if (this.state.hasError) {
44:       if (this.props.fallback) {
45:         return this.props.fallback;
46:       }
47:       return (
48:         <div className="min-h-screen flex items-center justify-center bg-background p-6">
49:           <div className="max-w-md w-full text-center space-y-4 animate-fade-in">
50:             <div className="mx-auto h-16 w-16 rounded-2xl bg-red-50 dark:bg-red-950/30 flex items-center justify-center">
51:               <AlertCircle className="h-8 w-8 text-red-500" />
52:             </div>
53:             <div>
54:               <h2 className="text-lg font-semibold">Что-то пошло не так</h2>
55:               <p className="text-sm text-muted-foreground mt-2">
56:                 Произошла непредвиденная ошибка. Попробуйте обновить страницу.
57:               </p>
58:             </div>
59:             <div className="flex items-center justify-center gap-3">
60:               <Button
61:                 variant="outline"
62:                 size="sm"
63:                 onClick={this.handleRetry}
64:                 className="gap-2"
65:               >
66:                 <RefreshCw className="h-3.5 w-3.5" />
67:                 Попробовать снова
68:               </Button>
69:               <Button
70:                 size="sm"
71:                 onClick={this.handleReload}
72:                 className="gap-2"
73:               >
74:                 Обновить страницу
75:               </Button>
76:             </div>
77:           </div>
78:         </div>
79:       );
80:     }
81:     return this.props.children;
82:   }
83: }
```

## File: src/hooks/use-company-details.ts
```typescript
 1: import { useState, useEffect } from "react";
 2: export function useCompanyDetails(companyId: string) {
 3:   const [data, setData] = useState<any>(null);
 4:   const [loading, setLoading] = useState(true);
 5:   const [error, setError] = useState<Error | null>(null);
 6:   useEffect(() => {
 7:     if (!companyId) return;
 8:     let isMounted = true;
 9:     async function fetchDetails() {
10:       setLoading(true);
11:       setError(null);
12:       try {
13:         const [companyRes, dealsRes] = await Promise.all([
14:           fetch("/api/bitrix/companies", {
15:             method: "POST",
16:             headers: { "Content-Type": "application/json" },
17:             body: JSON.stringify({
18:               ids: [companyId],
19:               select: ["ID", "TITLE", "REVENUE", "INDUSTRY"]
20:             })
21:           }),
22:           fetch("/api/bitrix/deals", {
23:             method: "POST",
24:             headers: { "Content-Type": "application/json" },
25:             body: JSON.stringify({
26:               filter: { "=COMPANY_ID": companyId },
27:               select: ["ID", "TITLE", "STAGE_ID", "OPPORTUNITY", "CURRENCY_ID"],
28:               order: { DATE_CREATE: "DESC" }
29:             })
30:           })
31:         ]);
32:         if (!companyRes.ok) throw new Error("Failed to fetch company");
33:         if (!dealsRes.ok) throw new Error("Failed to fetch deals");
34:         const companyData = await companyRes.json();
35:         const dealsData = await dealsRes.json();
36:         if (isMounted) {
37:           const company = companyData.companies?.[companyId];
38:           if (!company) {
39:             throw new Error("Company not found");
40:           }
41:           setData({
42:             ...company,
43:             deals: dealsData.deals || []
44:           });
45:         }
46:       } catch (err) {
47:         if (isMounted) {
48:           setError(err instanceof Error ? err : new Error("Unknown error"));
49:         }
50:       } finally {
51:         if (isMounted) {
52:           setLoading(false);
53:         }
54:       }
55:     }
56:     fetchDetails();
57:     return () => {
58:       isMounted = false;
59:     };
60:   }, [companyId]);
61:   return { data, loading, error };
62: }
```

## File: src/hooks/use-mobile.ts
```typescript
 1: import * as React from "react"
 2: const MOBILE_BREAKPOINT = 768
 3: export function useIsMobile() {
 4:   const [isMobile, setIsMobile] = React.useState<boolean | undefined>(undefined)
 5:   React.useEffect(() => {
 6:     const mql = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT - 1}px)`)
 7:     const onChange = () => {
 8:       setIsMobile(window.innerWidth < MOBILE_BREAKPOINT)
 9:     }
10:     mql.addEventListener("change", onChange)
11:     // eslint-disable-next-line react-hooks/set-state-in-effect
12:     setIsMobile(window.innerWidth < MOBILE_BREAKPOINT)
13:     return () => mql.removeEventListener("change", onChange)
14:   }, [])
15:   return !!isMobile
16: }
```

## File: src/lib/config.server.ts
```typescript
1: import "server-only";
2: /** Server-side WP login URL (from server-only env var) */
3: export const WP_LOGIN_URL =
4:   process.env.WP_LOGIN_URL || "https://bi-terminal.rus-silica.com/wp-login.php";
```

## File: src/lib/db.ts
```typescript
 1: import { PrismaClient } from '@prisma/client'
 2: const globalForPrisma = globalThis as unknown as {
 3:   prisma: PrismaClient | undefined
 4: }
 5: export const db =
 6:   globalForPrisma.prisma ??
 7:   new PrismaClient({
 8:     // Only log errors in production, warn+error in dev
 9:     // Query logging removed — too verbose, causes performance issues
10:     log: process.env.NODE_ENV === 'production' ? ['error'] : ['warn', 'error'],
11:   })
12: if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = db
```

## File: src/lib/i18n.ts
```typescript
1: export function pluralRu(n: number, forms: [string, string, string]) {
2:   const ten = n % 10;
3:   const hundred = n % 100;
4:   if (hundred >= 11 && hundred <= 14) return forms[2];
5:   if (ten === 1) return forms[0];
6:   if (ten >= 2 && ten <= 4) return forms[1];
7:   return forms[2];
8: }
```

## File: src/lib/utils.ts
```typescript
1: import { clsx, type ClassValue } from "clsx"
2: import { twMerge } from "tailwind-merge"
3: export function cn(...inputs: ClassValue[]) {
4:   return twMerge(clsx(inputs))
5: }
```

## File: src/store/entity-drawer-store.ts
```typescript
 1: import { create } from "zustand";
 2: export type EntityType = "company" | "responsible";
 3: interface EntityDrawerState {
 4:   isOpen: boolean;
 5:   entityType: EntityType | null;
 6:   entityId: string | null;
 7:   open: (type: EntityType, id: string) => void;
 8:   close: () => void;
 9: }
10: export const useEntityDrawerStore = create<EntityDrawerState>((set) => ({
11:   isOpen: false,
12:   entityType: null,
13:   entityId: null,
14:   open: (type, id) =>
15:     set({
16:       isOpen: true,
17:       entityType: type,
18:       entityId: id,
19:     }),
20:   close: () =>
21:     set({
22:       isOpen: false,
23:       entityType: null,
24:       entityId: null,
25:     }),
26: }));
```

## File: src/app/globals.css
```css
  1: @import "tailwindcss";
  2: @import "tw-animate-css";
  3: @custom-variant dark (&:is(.dark *));
  4: @theme inline {
  5:   --color-background: var(--background);
  6:   --color-foreground: var(--foreground);
  7:   --font-sans: var(--font-nunito);
  8:   --font-heading: var(--font-roboto);
  9:   --font-mono: var(--font-roboto-mono);
 10:   --color-sidebar-ring: var(--sidebar-ring);
 11:   --color-sidebar-border: var(--sidebar-border);
 12:   --color-sidebar-accent-foreground: var(--sidebar-accent-foreground);
 13:   --color-sidebar-accent: var(--sidebar-accent);
 14:   --color-sidebar-primary-foreground: var(--sidebar-primary-foreground);
 15:   --color-sidebar-primary: var(--sidebar-primary);
 16:   --color-sidebar-foreground: var(--sidebar-foreground);
 17:   --color-sidebar: var(--sidebar);
 18:   --color-chart-5: var(--chart-5);
 19:   --color-chart-4: var(--chart-4);
 20:   --color-chart-3: var(--chart-3);
 21:   --color-chart-2: var(--chart-2);
 22:   --color-chart-1: var(--chart-1);
 23:   --color-ring: var(--ring);
 24:   --color-input: var(--input);
 25:   --color-border: var(--border);
 26:   --color-destructive: var(--destructive);
 27:   --color-accent-foreground: var(--accent-foreground);
 28:   --color-accent: var(--accent);
 29:   --color-muted-foreground: var(--muted-foreground);
 30:   --color-muted: var(--muted);
 31:   --color-secondary-foreground: var(--secondary-foreground);
 32:   --color-secondary: var(--secondary);
 33:   --color-primary-foreground: var(--primary-foreground);
 34:   --color-primary: var(--primary);
 35:   --color-popover-foreground: var(--popover-foreground);
 36:   --color-popover: var(--popover);
 37:   --color-card-foreground: var(--card-foreground);
 38:   --color-card: var(--card);
 39:   --radius-sm: calc(var(--radius) - 4px);
 40:   --radius-md: calc(var(--radius) - 2px);
 41:   --radius-lg: var(--radius);
 42:   --radius-xl: calc(var(--radius) + 4px);
 43:   /* Institutional Brand Colors */
 44:   --color-brand-blue: #1A52A3;
 45:   --color-brand-blue-hover: #1546A0;
 46:   --color-brand-blue-light: #E8EFF8;
 47:   --color-brand-orange: #FF7A1F;
 48:   --color-brand-orange-hover: #E86E15;
 49:   --color-brand-orange-light: #FFF1E5;
 50:   --color-surface-light: #F8F9FA;
 51:   --color-surface-card: #FFFFFF;
 52:   --color-text-primary: rgba(0, 0, 0, 0.87);
 53:   --color-text-secondary: rgba(0, 0, 0, 0.54);
 54:   --color-border-light: #E2E8F0;
 55: }
 56: :root {
 57:   --radius: 0.25rem; /* 4px institutional rounding */
 58:   --background: #F0F2F5;
 59:   --foreground: rgba(0, 0, 0, 0.87);
 60:   --card: #FFFFFF;
 61:   --card-foreground: rgba(0, 0, 0, 0.87);
 62:   --popover: #FFFFFF;
 63:   --popover-foreground: rgba(0, 0, 0, 0.87);
 64:   --primary: #1A52A3;
 65:   --primary-foreground: #FFFFFF;
 66:   --secondary: #F1F5F9;
 67:   --secondary-foreground: rgba(0, 0, 0, 0.87);
 68:   --muted: #F1F5F9;
 69:   --muted-foreground: rgba(0, 0, 0, 0.54);
 70:   --accent: #FF7A1F;
 71:   --accent-foreground: #FFFFFF;
 72:   --destructive: #EF4444;
 73:   --border: #E2E8F0;
 74:   --input: #E2E8F0;
 75:   --ring: #1A52A3;
 76:   --chart-1: #1A52A3;
 77:   --chart-2: #FF7A1F;
 78:   --chart-3: #10B981;
 79:   --chart-4: #6366F1;
 80:   --chart-5: #F43F5E;
 81:   --sidebar: #FFFFFF;
 82:   --sidebar-foreground: rgba(0, 0, 0, 0.87);
 83:   --sidebar-primary: #1A52A3;
 84:   --sidebar-primary-foreground: #FFFFFF;
 85:   --sidebar-accent: #F1F5F9;
 86:   --sidebar-accent-foreground: #1A52A3;
 87:   --sidebar-border: #E2E8F0;
 88:   --sidebar-ring: #1A52A3;
 89:   /* Header gradient */
 90:   --header-from: #0D2B5E;
 91:   --header-to: #1A52A3;
 92:   --header-text: #FFFFFF;
 93:   --header-text-muted: rgba(255, 255, 255, 0.7);
 94: }
 95: .dark {
 96:   /* Bloomberg Terminal Styling */
 97:   --background: #000000;
 98:   --foreground: #FF9900;
 99:   --card: #000000;
100:   --card-foreground: #FF9900;
101:   --popover: #000000;
102:   --popover-foreground: #FF9900;
103:   --primary: #FF9900;
104:   --primary-foreground: #000000;
105:   --secondary: #1A1A1A;
106:   --secondary-foreground: #FF9900;
107:   --muted: #1A1A1A;
108:   --muted-foreground: #CC7A00;
109:   --accent: #FF9900;
110:   --accent-foreground: #000000;
111:   --destructive: #EF4444;
112:   --border: #331E00;
113:   --input: #331E00;
114:   --ring: #FF9900;
115:   --chart-1: #FF9900;
116:   --chart-2: #CC7A00;
117:   --chart-3: #995C00;
118:   --chart-4: #FFB84D;
119:   --chart-5: #FFD699;
120:   --sidebar: #000000;
121:   --sidebar-foreground: #FF9900;
122:   --sidebar-primary: #FF9900;
123:   --sidebar-primary-foreground: #000000;
124:   --sidebar-accent: #1A1A1A;
125:   --sidebar-accent-foreground: #FF9900;
126:   --sidebar-border: #331E00;
127:   --sidebar-ring: #FF9900;
128:   /* Header gradient - dark */
129:   --header-from: #000000;
130:   --header-to: #000000;
131:   --header-text: #FF9900;
132:   --header-text-muted: #CC7A00;
133: }
134: @layer base {
135:   * {
136:     @apply border-border outline-ring/50;
137:   }
138:   body {
139:     @apply bg-background text-foreground;
140:     font-family: var(--font-nunito);
141:     font-weight: 400;
142:   }
143:   h1, h2, h3, h4, h5, h6 {
144:     font-family: var(--font-roboto);
145:     font-weight: 400;
146:   }
147: }
148: /* ─── Custom Scrollbar ─── */
149: .custom-scrollbar::-webkit-scrollbar {
150:   width: 5px;
151:   height: 5px;
152: }
153: .custom-scrollbar::-webkit-scrollbar-track {
154:   background: transparent;
155: }
156: .custom-scrollbar::-webkit-scrollbar-thumb {
157:   background: rgba(0, 0, 0, 0.12);
158:   border-radius: 4px;
159: }
160: .custom-scrollbar::-webkit-scrollbar-thumb:hover {
161:   background: rgba(0, 0, 0, 0.22);
162: }
163: .dark .custom-scrollbar::-webkit-scrollbar-thumb {
164:   background: rgba(255, 255, 255, 0.1);
165: }
166: .dark .custom-scrollbar::-webkit-scrollbar-thumb:hover {
167:   background: rgba(255, 255, 255, 0.2);
168: }
169: /* ─── Data Table ─── */
170: /* Fix for Radix UI ScrollArea breaking sticky headers */
171: [data-radix-scroll-area-viewport] > div {
172:   display: block !important;
173: }
174: .data-table th {
175:   font-weight: 600;
176:   font-size: 0.7rem;
177:   text-transform: uppercase;
178:   letter-spacing: 0.06em;
179:   color: var(--muted-foreground);
180:   padding: 10px 14px;
181:   border-bottom: 2px solid var(--border);
182:   white-space: nowrap;
183:   position: sticky;
184:   top: 0;
185:   background: var(--card);
186:   z-index: 2;
187: }
188: .data-table td {
189:   padding: 9px 14px;
190:   border-bottom: 1px solid var(--border);
191:   font-size: 0.8125rem;
192:   white-space: nowrap;
193:   max-width: 280px;
194:   overflow: hidden;
195:   text-overflow: ellipsis;
196:   transition: background 0.15s ease;
197: }
198: .data-table tbody tr {
199:   transition: background 0.15s ease;
200: }
201: .data-table tbody tr:hover td {
202:   background: var(--muted);
203: }
204: .data-table tbody tr:last-child td {
205:   border-bottom: none;
206: }
207: /* ─── Animations ─── */
208: @keyframes sync-pulse {
209:   0%, 100% { opacity: 1; }
210:   50% { opacity: 0.5; }
211: }
212: .sync-pulse {
213:   animation: sync-pulse 1.5s ease-in-out infinite;
214: }
215: @keyframes fade-in {
216:   from { opacity: 0; transform: translateY(6px); }
217:   to { opacity: 1; transform: translateY(0); }
218: }
219: .animate-fade-in {
220:   animation: fade-in 0.35s cubic-bezier(0.16, 1, 0.3, 1);
221: }
222: @keyframes slide-in-right {
223:   from { opacity: 0; transform: translateX(12px); }
224:   to { opacity: 1; transform: translateX(0); }
225: }
226: .animate-slide-in {
227:   animation: slide-in-right 0.35s cubic-bezier(0.16, 1, 0.3, 1);
228: }
229: @keyframes shimmer {
230:   0% { background-position: -200% 0; }
231:   100% { background-position: 200% 0; }
232: }
233: .shimmer {
234:   background: linear-gradient(90deg, transparent 25%, rgba(255,255,255,0.4) 50%, transparent 75%);
235:   background-size: 200% 100%;
236:   animation: shimmer 1.5s ease-in-out infinite;
237: }
238: /* ─── Header Gradient ─── */
239: .header-gradient {
240:   background: linear-gradient(135deg, var(--header-from), var(--header-to));
241: }
242: /* ─── Stat card accent bar ─── */
243: .stat-accent-bar {
244:   position: relative;
245:   overflow: hidden;
246: }
247: .stat-accent-bar::before {
248:   content: '';
249:   position: absolute;
250:   top: 0;
251:   left: 0;
252:   right: 0;
253:   height: 3px;
254:   border-radius: 0 0 2px 2px;
255: }
256: .stat-accent-bar-blue::before { background: #1A52A3; }
257: .stat-accent-bar-green::before { background: #10B981; }
258: .stat-accent-bar-orange::before { background: #FF7A1F; }
259: .stat-accent-bar-violet::before { background: #7C3AED; }
260: /* ─── Sort indicator animation ─── */
261: .sort-icon-enter {
262:   transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);
263: }
264: /* ─── Filter badge pulse ─── */
265: @keyframes badge-pulse {
266:   0%, 100% { box-shadow: 0 0 0 0 rgba(255, 122, 31, 0.3); }
267:   50% { box-shadow: 0 0 0 4px rgba(255, 122, 31, 0); }
268: }
269: .filter-badge-pulse {
270:   animation: badge-pulse 2s ease-in-out infinite;
271: }
272: /* ─── No-scrollbar (for horizontal filter row) ─── */
273: .no-scrollbar::-webkit-scrollbar {
274:   display: none;
275: }
276: .no-scrollbar {
277:   -ms-overflow-style: none;
278:   scrollbar-width: none;
279: }
280: /* ─── Terminal Loading Screen Animations ─── */
281: @keyframes terminal-line-in {
282:   from {
283:     opacity: 0;
284:     transform: translateX(-8px);
285:   }
286:   to {
287:     opacity: 1;
288:     transform: translateX(0);
289:   }
290: }
291: .animate-terminal-line {
292:   animation: terminal-line-in 0.2s ease-out both;
293: }
294: @keyframes blink-cursor {
295:   0%, 100% { opacity: 1; }
296:   50% { opacity: 0; }
297: }
298: .animate-blink-cursor {
299:   animation: blink-cursor 0.8s step-end infinite;
300: }
```

## File: src/components/dashboard/config-banner.tsx
```typescript
 1: "use client";
 2: import { useState } from "react";
 3: import { useDashboardStore } from "@/store/dashboard-store";
 4: import { Wifi, WifiOff, X } from "lucide-react";
 5: export function ConfigBanner() {
 6:   const { isConfigured, isDemoMode } = useDashboardStore();
 7:   const [dismissed, setDismissed] = useState(false);
 8:   if (dismissed || isConfigured === null || isDemoMode) return null;
 9:   if (isConfigured && !isDemoMode) {
10:     return (
11:       <div className="px-4 sm:px-6 pt-3 animate-fade-in">
12:         <div className="flex items-center gap-2 px-3 py-1.5 rounded-md bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800">
13:           <Wifi className="h-3 w-3 text-emerald-600 dark:text-emerald-400 flex-shrink-0" />
14:           <span className="text-[11px] text-emerald-700 dark:text-emerald-400 font-medium">
15:             Подключение к CRM активно
16:           </span>
17:           <button
18:             onClick={() => setDismissed(true)}
19:             className="ml-auto text-emerald-600/50 hover:text-emerald-600 dark:text-emerald-400/50 dark:hover:text-emerald-400"
20:           >
21:             <X className="h-3 w-3" />
22:           </button>
23:         </div>
24:       </div>
25:     );
26:   }
27:   return (
28:     <div className="px-4 sm:px-6 pt-3 animate-fade-in">
29:       <div className="flex items-center gap-2 px-3 py-1.5 rounded-md bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800">
30:         <WifiOff className="h-3 w-3 text-amber-600 dark:text-amber-400 flex-shrink-0" />
31:         <span className="text-[11px] text-amber-700 dark:text-amber-400 font-medium">
32:           CRM не подключено — обратитесь к администратору
33:         </span>
34:         <button
35:           onClick={() => setDismissed(true)}
36:           className="ml-auto text-amber-600/50 hover:text-amber-600 dark:text-amber-400/50 dark:hover:text-amber-400"
37:         >
38:           <X className="h-3 w-3" />
39:         </button>
40:       </div>
41:     </div>
42:   );
43: }
```

## File: src/components/dashboard/connection-health.tsx
```typescript
 1: "use client";
 2: import { useDashboardStore } from "@/store/dashboard-store";
 3: import {
 4:   Tooltip,
 5:   TooltipContent,
 6:   TooltipTrigger,
 7: } from "@/components/ui/tooltip";
 8: const STATUS_CONFIG = {
 9:   checking: {
10:     color: "bg-amber-400",
11:     pulse: true,
12:     text: "Проверка...",
13:   },
14:   connected: {
15:     color: "bg-emerald-400",
16:     pulse: false,
17:     text: "Подключена",
18:   },
19:   demo: {
20:     color: "bg-amber-400",
21:     pulse: false,
22:     text: "Демо-режим",
23:   },
24:   disconnected: {
25:     color: "bg-red-500",
26:     pulse: true,
27:     text: "Ошибка базы",
28:   },
29: } as const;
30: export function ConnectionHealth() {
31:   const { connectionStatus } = useDashboardStore();
32:   const config = STATUS_CONFIG[connectionStatus];
33:   return (
34:     <Tooltip>
35:       <TooltipTrigger asChild>
36:         <div className="flex items-center gap-1.5 px-2 py-1 rounded bg-white/[0.03] hover:bg-white/[0.06] transition-colors cursor-default">
37:           <span
38:             className={`
39:               h-2 w-2 rounded-full block shrink-0
40:               ${config.color}
41:               ${config.pulse ? "animate-pulse" : ""}
42:             `}
43:           />
44:           <span className="text-[11px] font-medium text-white/70 whitespace-nowrap">
45:             {config.text}
46:           </span>
47:         </div>
48:       </TooltipTrigger>
49:       <TooltipContent
50:         side="bottom"
51:         sideOffset={6}
52:         className="text-[11px] px-2 py-1"
53:       >
54:         Статус подключения к Bitrix24
55:       </TooltipContent>
56:     </Tooltip>
57:   );
58: }
```

## File: src/components/dashboard/entity-drawer.tsx
```typescript
  1: "use client";
  2: import { useEntityDrawerStore } from "@/store/entity-drawer-store";
  3: import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
  4: import { useCompanyDetails } from "@/hooks/use-company-details";
  5: import { useUserDetails } from "@/hooks/use-user-details";
  6: import { Skeleton } from "@/components/ui/skeleton";
  7: import { Button } from "@/components/ui/button";
  8: import { ExternalLink } from "lucide-react";
  9: function Field({ label, value }: { label: string; value: React.ReactNode }) {
 10:   return (
 11:     <div className="flex flex-col gap-1">
 12:       <span className="text-xs text-muted-foreground">{label}</span>
 13:       <span className="text-sm font-medium">{value || "—"}</span>
 14:     </div>
 15:   );
 16: }
 17: function DealsPreview({ deals }: { deals: any[] }) {
 18:   if (!deals || deals.length === 0) {
 19:     return (
 20:       <div className="text-sm text-muted-foreground py-4">
 21:         No related deals found.
 22:       </div>
 23:     );
 24:   }
 25:   return (
 26:     <div className="space-y-3 mt-4">
 27:       <h3 className="text-sm font-semibold">Recent Deals ({deals.length})</h3>
 28:       <div className="space-y-2">
 29:         {deals.slice(0, 5).map((deal) => (
 30:           <div key={deal.ID} className="p-3 border rounded-md text-sm">
 31:             <div className="font-medium truncate">{deal.TITLE || `Deal #${deal.ID}`}</div>
 32:             <div className="text-muted-foreground text-xs mt-1 flex justify-between">
 33:               <span>Stage: {deal.STAGE_ID}</span>
 34:               {deal.OPPORTUNITY && (
 35:                 <span>{deal.OPPORTUNITY} {deal.CURRENCY_ID}</span>
 36:               )}
 37:             </div>
 38:           </div>
 39:         ))}
 40:         {deals.length > 5 && (
 41:           <div className="text-xs text-muted-foreground text-center pt-2">
 42:             + {deals.length - 5} more deals
 43:           </div>
 44:         )}
 45:       </div>
 46:     </div>
 47:   );
 48: }
 49: function OpenInCRMButton({ type, id }: { type: "company" | "user"; id: string }) {
 50:   const domain = process.env.NEXT_PUBLIC_BITRIX_DOMAIN || "https://bitrix24.ru";
 51:   const href = type === "company" 
 52:     ? `${domain}/crm/company/details/${id}/`
 53:     : `${domain}/company/personal/user/${id}/`;
 54:   return (
 55:     <Button variant="outline" className="w-full mt-4" asChild>
 56:       <a href={href} target="_blank" rel="noopener noreferrer">
 57:         <ExternalLink className="w-4 h-4 mr-2" />
 58:         Open in CRM
 59:       </a>
 60:     </Button>
 61:   );
 62: }
 63: function CompanyDrawerContent({ companyId }: { companyId: string }) {
 64:   const { data, loading, error } = useCompanyDetails(companyId);
 65:   if (loading) {
 66:     return (
 67:       <div className="space-y-4 mt-6">
 68:         <Skeleton className="h-8 w-3/4" />
 69:         <Skeleton className="h-4 w-1/2" />
 70:         <div className="grid grid-cols-2 gap-4 mt-6">
 71:           <Skeleton className="h-12 w-full" />
 72:           <Skeleton className="h-12 w-full" />
 73:         </div>
 74:         <Skeleton className="h-32 w-full mt-6" />
 75:       </div>
 76:     );
 77:   }
 78:   if (error || !data) {
 79:     return (
 80:       <div className="text-sm text-destructive mt-6">
 81:         {error?.message || "Company not found"}
 82:       </div>
 83:     );
 84:   }
 85:   return (
 86:     <div className="space-y-6 mt-6">
 87:       <div>
 88:         <h2 className="text-xl font-semibold">{data.TITLE || `ID ${companyId}`}</h2>
 89:         <div className="text-sm text-muted-foreground mt-1">
 90:           Company ID: {companyId}
 91:         </div>
 92:       </div>
 93:       <div className="grid grid-cols-2 gap-4">
 94:         <Field label="Revenue" value={data.REVENUE} />
 95:         <Field label="Industry" value={data.INDUSTRY} />
 96:       </div>
 97:       <DealsPreview deals={data.deals} />
 98:       <OpenInCRMButton type="company" id={companyId} />
 99:     </div>
100:   );
101: }
102: function ResponsibleDrawerContent({ userId }: { userId: string }) {
103:   const { data, loading, error } = useUserDetails(userId);
104:   if (loading) {
105:     return (
106:       <div className="space-y-4 mt-6">
107:         <Skeleton className="h-8 w-3/4" />
108:         <Skeleton className="h-4 w-1/2" />
109:         <Skeleton className="h-32 w-full mt-6" />
110:       </div>
111:     );
112:   }
113:   if (error || !data) {
114:     return (
115:       <div className="text-sm text-destructive mt-6">
116:         {error?.message || "User not found"}
117:       </div>
118:     );
119:   }
120:   return (
121:     <div className="space-y-6 mt-6">
122:       <div>
123:         <h2 className="text-xl font-semibold">{data.name || `ID ${userId}`}</h2>
124:         <div className="text-sm text-muted-foreground mt-1">
125:           User ID: {userId}
126:         </div>
127:       </div>
128:       <DealsPreview deals={data.deals} />
129:       <OpenInCRMButton type="user" id={userId} />
130:     </div>
131:   );
132: }
133: export function EntityDrawer() {
134:   const { isOpen, entityType, entityId, close } = useEntityDrawerStore();
135:   return (
136:     <Sheet open={isOpen} onOpenChange={(v) => !v && close()}>
137:       <SheetContent side="right" className="w-full sm:w-[520px] overflow-y-auto">
138:         <SheetHeader className="sr-only">
139:           <SheetTitle>Details</SheetTitle>
140:           <SheetDescription>Entity details and related deals</SheetDescription>
141:         </SheetHeader>
142:         {entityType === "company" && entityId && (
143:           <CompanyDrawerContent companyId={entityId} />
144:         )}
145:         {entityType === "responsible" && entityId && (
146:           <ResponsibleDrawerContent userId={entityId} />
147:         )}
148:       </SheetContent>
149:     </Sheet>
150:   );
151: }
```

## File: src/components/dashboard/footer.tsx
```typescript
 1: "use client";
 2: import { useDashboardStore } from "@/store/dashboard-store";
 3: import { BarChart3 } from "lucide-react";
 4: export function Footer() {
 5:   const { isDemoMode } = useDashboardStore();
 6:   return (
 7:     <footer className="mt-auto border-t border-border bg-card/50">
 8:       <div className="px-4 sm:px-6 py-2 flex items-center justify-between">
 9:         <div className="flex items-center gap-1.5">
10:           <BarChart3 className="h-3 w-3 text-muted-foreground/40" />
11:           <span className="text-[10px] text-muted-foreground/50 tracking-wide">
12:             RusSilica BI Terminal v2.1
13:           </span>
14:           {isDemoMode && (
15:             <span className="text-[10px] text-amber-600 dark:text-amber-400 font-medium px-1.5 py-0.5 rounded bg-amber-50 dark:bg-amber-950/30 ml-1">
16:               DEMO
17:             </span>
18:           )}
19:         </div>
20:         <div className="text-[10px] text-muted-foreground/35">
21:           © 2020-2026 ООО "РусСилика" ОГРН 1205500027710, ИНН 5501267734, КПП 524901001
22:         </div>
23:       </div>
24:     </footer>
25:   );
26: }
```

## File: src/components/dashboard/last-sync.tsx
```typescript
 1: "use client";
 2: import { useEffect, useState, useMemo } from "react";
 3: import { useDashboardStore } from "@/store/dashboard-store";
 4: import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";
 5: import { pluralRu } from "@/lib/i18n";
 6: function getRelativeTime(timestamp: number): string {
 7:   const now = Date.now();
 8:   const diffMs = now - timestamp;
 9:   const diffSec = Math.floor(diffMs / 1000);
10:   const diffMin = Math.floor(diffSec / 60);
11:   const diffHour = Math.floor(diffMin / 60);
12:   if (diffSec < 60) return "Только что";
13:   if (diffMin < 60) return `${diffMin} ${pluralRu(diffMin, ["минуту", "минуты", "минут"])} назад`;
14:   if (diffHour < 24) return `${diffHour} ${pluralRu(diffHour, ["час", "часа", "часов"])} назад`;
15:   const diffDays = Math.floor(diffHour / 24);
16:   return `${diffDays} ${pluralRu(diffDays, ["день", "дня", "дней"])} назад`;
17: }
18: export function LastSync() {
19:   const lastSyncAt = useDashboardStore((s) => s.lastSyncAt);
20:   const [tick, setTick] = useState(0);
21:   // Refresh relative time every 30 seconds
22:   useEffect(() => {
23:     if (lastSyncAt === null) return;
24:     const interval = setInterval(() => {
25:       setTick((t) => t + 1);
26:     }, 30_000);
27:     return () => clearInterval(interval);
28:   }, [lastSyncAt]);
29:   const relativeTime = useMemo(() => {
30:     // Use tick to trigger recalculation
31:     void tick;
32:     if (lastSyncAt === null) return null;
33:     return getRelativeTime(lastSyncAt);
34:   }, [lastSyncAt, tick]);
35:   const exactTime = useMemo(() => {
36:     if (lastSyncAt === null) return null;
37:     return new Date(lastSyncAt).toLocaleString("ru-RU", {
38:       day: "2-digit",
39:       month: "2-digit",
40:       year: "numeric",
41:       hour: "2-digit",
42:       minute: "2-digit",
43:       second: "2-digit",
44:     });
45:   }, [lastSyncAt]);
46:   if (lastSyncAt === null || relativeTime === null) return null;
47:   return (
48:     <Tooltip>
49:       <TooltipTrigger asChild>
50:         <span className="text-[10px] text-white/40 cursor-default whitespace-nowrap">
51:           Обновлено {relativeTime}
52:         </span>
53:       </TooltipTrigger>
54:       <TooltipContent side="bottom" className="text-[10px]">
55:         {exactTime}
56:       </TooltipContent>
57:     </Tooltip>
58:   );
59: }
```

## File: src/hooks/use-toast.ts
```typescript
  1: "use client"
  2: // Inspired by react-hot-toast library
  3: import * as React from "react"
  4: import type {
  5:   ToastActionElement,
  6:   ToastProps,
  7: } from "@/components/ui/toast"
  8: const TOAST_LIMIT = 1
  9: const TOAST_REMOVE_DELAY = 5000
 10: type ToasterToast = ToastProps & {
 11:   id: string
 12:   title?: React.ReactNode
 13:   description?: React.ReactNode
 14:   action?: ToastActionElement
 15: }
 16: const actionTypes = {
 17:   ADD_TOAST: "ADD_TOAST",
 18:   UPDATE_TOAST: "UPDATE_TOAST",
 19:   DISMISS_TOAST: "DISMISS_TOAST",
 20:   REMOVE_TOAST: "REMOVE_TOAST",
 21: } as const
 22: let count = 0
 23: function genId() {
 24:   count = (count + 1) % Number.MAX_SAFE_INTEGER
 25:   return count.toString()
 26: }
 27: type ActionType = typeof actionTypes
 28: type Action =
 29:   | {
 30:     type: ActionType["ADD_TOAST"]
 31:     toast: ToasterToast
 32:   }
 33:   | {
 34:     type: ActionType["UPDATE_TOAST"]
 35:     toast: Partial<ToasterToast>
 36:   }
 37:   | {
 38:     type: ActionType["DISMISS_TOAST"]
 39:     toastId?: ToasterToast["id"]
 40:   }
 41:   | {
 42:     type: ActionType["REMOVE_TOAST"]
 43:     toastId?: ToasterToast["id"]
 44:   }
 45: interface State {
 46:   toasts: ToasterToast[]
 47: }
 48: const toastTimeouts = new Map<string, ReturnType<typeof setTimeout>>()
 49: const addToRemoveQueue = (toastId: string) => {
 50:   if (toastTimeouts.has(toastId)) {
 51:     return
 52:   }
 53:   const timeout = setTimeout(() => {
 54:     toastTimeouts.delete(toastId)
 55:     dispatch({
 56:       type: "REMOVE_TOAST",
 57:       toastId: toastId,
 58:     })
 59:   }, TOAST_REMOVE_DELAY)
 60:   toastTimeouts.set(toastId, timeout)
 61: }
 62: export const reducer = (state: State, action: Action): State => {
 63:   switch (action.type) {
 64:     case "ADD_TOAST":
 65:       return {
 66:         ...state,
 67:         toasts: [action.toast, ...state.toasts].slice(0, TOAST_LIMIT),
 68:       }
 69:     case "UPDATE_TOAST":
 70:       return {
 71:         ...state,
 72:         toasts: state.toasts.map((t) =>
 73:           t.id === action.toast.id ? { ...t, ...action.toast } : t
 74:         ),
 75:       }
 76:     case "DISMISS_TOAST": {
 77:       const { toastId } = action
 78:       // ! Side effects ! - This could be extracted into a dismissToast() action,
 79:       // but I'll keep it here for simplicity
 80:       if (toastId) {
 81:         addToRemoveQueue(toastId)
 82:       } else {
 83:         state.toasts.forEach((toast) => {
 84:           addToRemoveQueue(toast.id)
 85:         })
 86:       }
 87:       return {
 88:         ...state,
 89:         toasts: state.toasts.map((t) =>
 90:           t.id === toastId || toastId === undefined
 91:             ? {
 92:               ...t,
 93:               open: false,
 94:             }
 95:             : t
 96:         ),
 97:       }
 98:     }
 99:     case "REMOVE_TOAST":
100:       if (action.toastId === undefined) {
101:         return {
102:           ...state,
103:           toasts: [],
104:         }
105:       }
106:       return {
107:         ...state,
108:         toasts: state.toasts.filter((t) => t.id !== action.toastId),
109:       }
110:   }
111: }
112: const listeners: Array<(state: State) => void> = []
113: let memoryState: State = { toasts: [] }
114: function dispatch(action: Action) {
115:   memoryState = reducer(memoryState, action)
116:   listeners.forEach((listener) => {
117:     listener(memoryState)
118:   })
119: }
120: type Toast = Omit<ToasterToast, "id">
121: function toast({ ...props }: Toast) {
122:   const id = genId()
123:   const update = (props: ToasterToast) =>
124:     dispatch({
125:       type: "UPDATE_TOAST",
126:       toast: { ...props, id },
127:     })
128:   const dismiss = () => dispatch({ type: "DISMISS_TOAST", toastId: id })
129:   dispatch({
130:     type: "ADD_TOAST",
131:     toast: {
132:       ...props,
133:       id,
134:       open: true,
135:       onOpenChange: (open) => {
136:         if (!open) dismiss()
137:       },
138:     },
139:   })
140:   return {
141:     id: id,
142:     dismiss,
143:     update,
144:   }
145: }
146: function useToast() {
147:   const [state, setState] = React.useState<State>(memoryState)
148:   React.useEffect(() => {
149:     listeners.push(setState)
150:     return () => {
151:       const index = listeners.indexOf(setState)
152:       if (index > -1) {
153:         listeners.splice(index, 1)
154:       }
155:     }
156:   }, [state])
157:   return {
158:     ...state,
159:     toast,
160:     dismiss: (toastId?: string) => dispatch({ type: "DISMISS_TOAST", toastId }),
161:   }
162: }
163: export { useToast, toast }
```

## File: src/hooks/use-user-details.ts
```typescript
 1: import { useState, useEffect } from "react";
 2: import { useDashboardStore } from "@/store/dashboard-store";
 3: export function useUserDetails(userId: string) {
 4:   const [data, setData] = useState<any>(null);
 5:   const [loading, setLoading] = useState(true);
 6:   const [error, setError] = useState<Error | null>(null);
 7:   useEffect(() => {
 8:     if (!userId) return;
 9:     let isMounted = true;
10:     async function fetchDetails() {
11:       setLoading(true);
12:       setError(null);
13:       try {
14:         const dealsRes = await fetch("/api/bitrix/deals", {
15:           method: "POST",
16:           headers: { "Content-Type": "application/json" },
17:           body: JSON.stringify({
18:             filter: { "=ASSIGNED_BY_ID": userId },
19:             select: ["ID", "TITLE", "STAGE_ID", "OPPORTUNITY", "CURRENCY_ID"],
20:             order: { DATE_CREATE: "DESC" }
21:           })
22:         });
23:         if (!dealsRes.ok) throw new Error("Failed to fetch deals");
24:         const dealsData = await dealsRes.json();
25:         if (isMounted) {
26:           // Read directly from the already-populated Zustand store
27:           const userName = useDashboardStore.getState().userNames[userId];
28:           setData({
29:             id: userId,
30:             name: userName || `ID ${userId}`,
31:             deals: dealsData.deals || []
32:           });
33:         }
34:       } catch (err) {
35:         if (isMounted) {
36:           setError(err instanceof Error ? err : new Error("Unknown error"));
37:         }
38:       } finally {
39:         if (isMounted) {
40:           setLoading(false);
41:         }
42:       }
43:     }
44:     fetchDetails();
45:     return () => {
46:       isMounted = false;
47:     };
48:   }, [userId]);
49:   return { data, loading, error };
50: }
```

## File: src/lib/config.ts
```typescript
 1: /**
 2:  * Centralized Configuration — RusSilica BI Terminal
 3:  *
 4:  * Single source of truth for environment-dependent constants.
 5:  * Previously, IS_PRODUCTION and WP_LOGIN_URL were duplicated in 4+ files.
 6:  *
 7:  * Server-side usage: import { IS_PRODUCTION, WP_LOGIN_URL } from "@/lib/config"
 8:  * Client-side usage: import { IS_PRODUCTION, WP_LOGIN_URL_CLIENT } from "@/lib/config"
 9:  */
10: // ─── Environment Detection ───
11: export const IS_PRODUCTION = process.env.NODE_ENV === "production";
12: // ─── WordPress SSO URLs ───
13: /** Client-side WP login URL (from NEXT_PUBLIC_ env var) */
14: export const WP_LOGIN_URL_CLIENT =
15:   process.env.NEXT_PUBLIC_WP_LOGIN_URL || "https://bi-terminal.rus-silica.com/wp-login.php";
16: /**
17:  * Extract the base URL of the BI terminal from the WP login URL.
18:  * Since WP and BI share the same domain, we can derive it.
19:  */
20: export const BI_URL = WP_LOGIN_URL_CLIENT.replace(/\/wp-login\.php.*$/, "");
21: // ─── Feature Flags ───
22: /** Gate debug console logging in production */
23: export const shouldLog = !IS_PRODUCTION;
```

## File: src/lib/demo-data.ts
```typescript
  1: import type { FieldInfo } from "@/store/dashboard-store";
  2: /**
  3:  * Demo data based on real Bitrix24 CRM deal fields schema.
  4:  * These fields match the actual custom fields from the user's Bitrix24 instance.
  5:  */
  6: export const DEMO_FIELDS: FieldInfo[] = [
  7:   // Standard informative fields
  8:   { id: "TITLE", title: "Название", type: "string", isMultiple: false, isSortable: true },
  9:   { id: "TYPE_ID", title: "Тип", type: "crm_status", isMultiple: false, isSortable: true },
 10:   { id: "CATEGORY_ID", title: "Воронка", type: "crm_category", isMultiple: false, isSortable: true },
 11:   { id: "STAGE_ID", title: "Стадия сделки", type: "crm_status", isMultiple: false, isSortable: true, listValues: [
 12:     { ID: "NEW", VALUE: "Новая" },
 13:     { ID: "PREPARATION", VALUE: "Подготовка" },
 14:     { ID: "PREPAYMENT_INVOICE", VALUE: "Счёт выставлен" },
 15:     { ID: "EXECUTING", VALUE: "В работе" },
 16:     { ID: "WON", VALUE: "Сделка успешна" },
 17:     { ID: "LOSE", VALUE: "Сделка провалена" },
 18:   ]},
 19:   { id: "CURRENCY_ID", title: "Валюта", type: "crm_currency", isMultiple: false, isSortable: true },
 20:   { id: "OPPORTUNITY", title: "Сумма", type: "double", isMultiple: false, isSortable: true },
 21:   { id: "TAX_VALUE", title: "Ставка налога", type: "double", isMultiple: false, isSortable: true },
 22:   { id: "BEGINDATE", title: "Дата начала", type: "date", isMultiple: false, isSortable: true },
 23:   { id: "CLOSEDATE", title: "Дата завершения", type: "date", isMultiple: false, isSortable: true },
 24:   { id: "COMMENTS", title: "Комментарий", type: "string", isMultiple: false, isSortable: true },
 25:   { id: "SOURCE_ID", title: "Источник", type: "crm_status", isMultiple: false, isSortable: true },
 26:   { id: "DATE_CREATE", title: "Дата создания", type: "datetime", isMultiple: false, isSortable: true },
 27:   { id: "DATE_MODIFY", title: "Дата изменения", type: "datetime", isMultiple: false, isSortable: true },
 28:   // Custom fields from real Bitrix24 CRM
 29:   { id: "UF_CRM_1584459653509", title: "Склад отгрузки", type: "enumeration", isMultiple: false, isSortable: true, listValues: [
 30:     { ID: "87", VALUE: "Склад №1" },
 31:     { ID: "89", VALUE: "Склад №2" },
 32:   ]},
 33:   { id: "UF_CRM_1584459666824", title: "Дата отгрузки", type: "date", isMultiple: false, isSortable: true },
 34:   { id: "UF_CRM_1584459858509", title: "Тип доставки", type: "enumeration", isMultiple: false, isSortable: true, listValues: [
 35:     { ID: "91", VALUE: "Самовывоз" },
 36:     { ID: "93", VALUE: "Доставка курьерской службой" },
 37:     { ID: "95", VALUE: "Доставка логистической системой компании" },
 38:   ]},
 39:   { id: "UF_CRM_1584460062014", title: "Дата оплаты", type: "date", isMultiple: false, isSortable: true },
 40:   { id: "UF_CRM_1584463812262", title: "Стоимость доставки", type: "money", isMultiple: false, isSortable: true },
 41:   { id: "UF_CRM_1584464068013", title: "Статус оплаты", type: "enumeration", isMultiple: false, isSortable: true, listValues: [
 42:     { ID: "103", VALUE: "Не оплачен" },
 43:     { ID: "105", VALUE: "Выставлен счет" },
 44:     { ID: "107", VALUE: "Ожидает подтверждения" },
 45:     { ID: "109", VALUE: "Платеж проведен" },
 46:     { ID: "111", VALUE: "Ошибка" },
 47:     { ID: "113", VALUE: "Оплачен" },
 48:     { ID: "115", VALUE: "Возвращен" },
 49:   ]},
 50:   { id: "UF_CRM_1585653172826", title: "Дата и время доставки", type: "datetime", isMultiple: false, isSortable: true },
 51:   { id: "UF_CRM_1586467706342", title: "Комментарий клиента к заказу", type: "string", isMultiple: false, isSortable: true },
 52:   { id: "UF_CRM_1586468182934", title: "Оптовая скидка %", type: "double", isMultiple: false, isSortable: true },
 53:   { id: "UF_CRM_DEAL_3861467182211", title: "Номер 1С", type: "string", isMultiple: false, isSortable: true },
 54:   { id: "UF_CRM_DEAL_3861467182227", title: "Организация", type: "enumeration", isMultiple: false, isSortable: true, listValues: [
 55:     { ID: "225", VALUE: 'ООО "РусСилика"' },
 56:     { ID: "227", VALUE: "Управленческая организация" },
 57:   ]},
 58:   { id: "UF_CRM_6915D8C25162A", title: "Номер карты лояльности", type: "string", isMultiple: false, isSortable: true },
 59:   { id: "UF_CRM_6915D8C2688B8", title: "Способ оплаты", type: "enumeration", isMultiple: false, isSortable: true, listValues: [
 60:     { ID: "951", VALUE: "Картой курьеру" },
 61:     { ID: "953", VALUE: "Наличными" },
 62:     { ID: "955", VALUE: "Оплата по счету" },
 63:   ]},
 64:   { id: "UF_CRM_6915D8C2C31D0", title: "Отрасль", type: "enumeration", isMultiple: true, isSortable: true, listValues: [
 65:     { ID: "961", VALUE: "Агросектор" },
 66:     { ID: "963", VALUE: "Волокнистые материалы" },
 67:     { ID: "965", VALUE: "Катализаторы" },
 68:     { ID: "967", VALUE: "Керамика" },
 69:     { ID: "969", VALUE: "Клеи" },
 70:     { ID: "971", VALUE: "Косметика" },
 71:     { ID: "973", VALUE: "ЛКМ" },
 72:     { ID: "975", VALUE: "Металлургическая промышленность" },
 73:     { ID: "977", VALUE: "Микроэлектроника" },
 74:     { ID: "979", VALUE: "Модельное литье" },
 75:     { ID: "981", VALUE: "Нефтегаз" },
 76:     { ID: "983", VALUE: "НИР" },
 77:     { ID: "985", VALUE: "Огнеупоры" },
 78:     { ID: "987", VALUE: "Пищевая отрасль" },
 79:     { ID: "991", VALUE: "Полимеры" },
 80:     { ID: "993", VALUE: "РТИ" },
 81:     { ID: "997", VALUE: "Фармацевтическая промышленность" },
 82:     { ID: "999", VALUE: "Химия промышленная" },
 83:     { ID: "1001", VALUE: "ЦБП" },
 84:     { ID: "1003", VALUE: "Электроды" },
 85:   ]},
 86:   { id: "UF_CRM_6915D8C328208", title: "Направление", type: "enumeration", isMultiple: true, isSortable: true, listValues: [
 87:     { ID: "1007", VALUE: "Агрохимия" },
 88:     { ID: "1059", VALUE: "Аккумуляторы/электролиты" },
 89:     { ID: "1065", VALUE: "Бетоны, Строительные составы" },
 90:     { ID: "1017", VALUE: "Бытовая химия" },
 91:     { ID: "1023", VALUE: "Водные составы" },
 92:     { ID: "1035", VALUE: "Бурение скважин" },
 93:     { ID: "1019", VALUE: "Декоративная косметика" },
 94:     { ID: "1693", VALUE: "Дистрибьютор" },
 95:     { ID: "1073", VALUE: "Другое" },
 96:     { ID: "1013", VALUE: "Затирки Водная основа" },
 97:     { ID: "1015", VALUE: "Затирки Органика" },
 98:     { ID: "1021", VALUE: "Зубные пасты" },
 99:     { ID: "1697", VALUE: "Катализаторы" },
100:     { ID: "1061", VALUE: "Кислотоупоры" },
101:     { ID: "1009", VALUE: "Корма" },
102:     { ID: "1699", VALUE: "Краски" },
103:     { ID: "1701", VALUE: "Лак" },
104:     { ID: "1037", VALUE: "Нефтехимия" },
105:     { ID: "1039", VALUE: "НИОКР" },
106:     { ID: "1025", VALUE: "Органические составы" },
107:     { ID: "1027", VALUE: "Пигменты" },
108:     { ID: "1047", VALUE: "Пленка Производство" },
109:     { ID: "1029", VALUE: "Полиграфические краски" },
110:     { ID: "1063", VALUE: "Реагенты для промышленности" },
111:     { ID: "1791", VALUE: "РТИ" },
112:     { ID: "1053", VALUE: "Силиконы" },
113:     { ID: "1049", VALUE: "Смолы" },
114:     { ID: "1043", VALUE: "Соки/Вино" },
115:     { ID: "1051", VALUE: "Спецсоставы" },
116:     { ID: "1057", VALUE: "Спецтекстиль" },
117:     { ID: "1067", VALUE: "Текстиль" },
118:     { ID: "1011", VALUE: "Цеолиты" },
119:     { ID: "1055", VALUE: "Шины/Резина" },
120:     { ID: "2393", VALUE: "Электроды" },
121:   ]},
122:   { id: "UF_CRM_1763541960", title: "Комментарий к доставке", type: "string", isMultiple: false, isSortable: true },
123:   { id: "UF_CRM_1763542027", title: "Адрес доставки", type: "address", isMultiple: false, isSortable: false },
124:   { id: "UF_CRM_1763542249", title: "Тип оплаты", type: "enumeration", isMultiple: false, isSortable: true, listValues: [
125:     { ID: "1081", VALUE: "100% предоплата" },
126:     { ID: "1083", VALUE: "Аванс" },
127:     { ID: "1085", VALUE: "Постоплата" },
128:   ]},
129:   { id: "UF_CRM_1763546892", title: "Причина закрытия (Продажа)", type: "string", isMultiple: false, isSortable: true },
130:   { id: "UF_CRM_1763546915", title: "Причина закрытия (Разработка продукта)", type: "string", isMultiple: false, isSortable: true },
131:   { id: "UF_CRM_69257337C8C0D", title: "Откуда узнал о компании", type: "string", isMultiple: false, isSortable: true },
132:   { id: "UF_CRM_69257337D66F5", title: "Предпочтительный способ доставки", type: "enumeration", isMultiple: false, isSortable: true, listValues: [
133:     { ID: "1583", VALUE: "Курьером" },
134:     { ID: "1585", VALUE: "Самовывоз" },
135:   ]},
136:   { id: "UF_CRM_69257337E7E9B", title: "Причина закрытия Лида", type: "string", isMultiple: false, isSortable: true },
137:   { id: "UF_CRM_692573380C4F0", title: "Импорт базы", type: "enumeration", isMultiple: false, isSortable: true, listValues: [
138:     { ID: "1587", VALUE: "Импорт Астафьев Rento" },
139:     { ID: "2227", VALUE: "Импорт Н. Чавыкина Rento" },
140:     { ID: "2229", VALUE: "Импорт М. Ежкова Rento" },
141:   ]},
142:   { id: "UF_CRM_6925733827A0F", title: "Область применения", type: "string", isMultiple: false, isSortable: true },
143:   { id: "UF_CRM_69257BBACD471", title: "Тип продукта", type: "enumeration", isMultiple: true, isSortable: true, listValues: [
144:     { ID: "1613", VALUE: "Гель" },
145:     { ID: "1855", VALUE: "Гель/Золь" },
146:     { ID: "1615", VALUE: "Золь" },
147:     { ID: "1847", VALUE: "Золь/НЖС" },
148:     { ID: "1825", VALUE: "КСМГ/КСКГ" },
149:     { ID: "1617", VALUE: "НЖС" },
150:     { ID: "1827", VALUE: "Силикат кальция" },
151:     { ID: "1829", VALUE: "Сульфонат натрия" },
152:     { ID: "1831", VALUE: "другие продукты" },
153:   ]},
154:   { id: "UF_CRM_69259C45EC14B", title: "Регион", type: "string", isMultiple: false, isSortable: true },
155:   { id: "UF_CRM_1766405164", title: "ИНН", type: "string", isMultiple: false, isSortable: true },
156:   { id: "UF_CRM_1774878835644", title: "Сумма счетов (из 1С)", type: "double", isMultiple: false, isSortable: true },
157:   { id: "UF_CRM_1774878993375", title: "Количество счетов (из 1С)", type: "double", isMultiple: false, isSortable: true },
158:   { id: "UF_CRM_1774879911841", title: "Плановый объем потребления (тонн)", type: "double", isMultiple: false, isSortable: true },
159:   { id: "UF_CRM_1774879952785", title: "Дата отправки образцов", type: "date", isMultiple: false, isSortable: true },
160:   { id: "UF_CRM_1774880017", title: "Детали для Технолога (ТВЛ)", type: "string", isMultiple: false, isSortable: true },
161:   { id: "UF_CRM_1774880111684", title: "R&D", type: "boolean", isMultiple: false, isSortable: true },
162:   { id: "UF_CRM_1774880251970", title: "Причина отказа/брака", type: "enumeration", isMultiple: false, isSortable: true, listValues: [
163:     { ID: "2657", VALUE: "Не пройден по дисперсности / физико-химии" },
164:     { ID: "2659", VALUE: "Не устроила цена" },
165:     { ID: "2661", VALUE: "Проблемы с логистикой" },
166:     { ID: "2663", VALUE: "Не смогли вытеснить текущего поставщика" },
167:     { ID: "2665", VALUE: "Проект у клиента заморожен" },
168:   ]},
169: ];
170: // Demo data generators using real field IDs
171: const STAGES = ["NEW", "PREPARATION", "PREPAYMENT_INVOICE", "EXECUTING", "WON", "LOSE"];
172: const SKLADS = ["87", "89"];
173: const DELIVERY_TYPES = ["91", "93", "95"];
174: const PAYMENT_STATUSES = ["103", "105", "107", "109", "111", "113", "115"];
175: const ORGS = ["225", "227"];
176: const PAYMENT_METHODS = ["951", "953", "955"];
177: const OTDELS = ["961", "963", "965", "967", "969", "971", "973", "975", "977", "981", "985", "987", "991", "993", "997", "999", "1001", "1003"];
178: const NAPRAVLENIA = ["1007", "1059", "1065", "1017", "1023", "1035", "1073", "1013", "1025", "1027", "1049", "1043", "1051", "1053", "1057", "1067", "1055", "2393"];
179: const PAYMENT_TYPES = ["1081", "1083", "1085"];
180: const DELIVERY_PREFS = ["1583", "1585"];
181: const IMPORT_BASES = ["1587", "2227", "2229"];
182: const PRODUCT_TYPES = ["1613", "1615", "1617", "1825", "1827", "1829", "1831"];
183: const REFUSAL_REASONS = ["2657", "2659", "2661", "2663", "2665"];
184: const RESPONSIBLE_PERSONS = [
185:   { ID: "1", NAME: "Иванов А.С." },
186:   { ID: "2", NAME: "Петрова М.В." },
187:   { ID: "3", NAME: "Сидоров К.Н." },
188:   { ID: "4", NAME: "Козлова Е.А." },
189:   { ID: "5", NAME: "Новиков Д.И." },
190: ];
191: export { RESPONSIBLE_PERSONS };
192: const COMPANIES = [
193:   "АО «ТехноПром»", "ООО «Инновации»", "ПАО «СтройИнвест»",
194:   "ООО «ДатаСервис»", "ИП Козлов", "ООО «МедФарм»",
195:   "АО «Ритейл Групп»", "ООО «ЭнергоПлюс»", "ПАО «ФинТех»",
196:   "ООО «ЛогистикПро»", "АО «АгроХим»", "ООО «КонсалтГрупп»",
197:   "ПАО «ТелеКом»", "ООО «АвтоМотив»", "АО «Девелопмент»",
198:   'ООО «РусСилика»', "ЗАО «НаноХим»", "ООО «ПолимерТрейд»",
199:   "ПАО «КерамикИнвест»", "ООО «СиликаПром»",
200: ];
201: const REGIONS = [
202:   "Москва", "Санкт-Петербург", "Казань", "Новосибирск", "Екатеринбург",
203:   "Нижний Новгород", "Самара", "Ростов-на-Дону", "Уфа", "Краснодар",
204:   "Воронеж", "Пермь", "Волгоград", "Челябинск", "Тюмень",
205: ];
206: const INNS = [
207:   "7701234567", "7820123456", "1650123456", "5401234567", "6670123456",
208:   "5250123456", "6310123456", "6160123456", "0270123456", "2310123456",
209: ];
210: function randomItem<T>(arr: T[]): T {
211:   return arr[Math.floor(Math.random() * arr.length)];
212: }
213: function randomMultiple(arr: string[], min: number = 1, max: number = 3): string[] {
214:   const count = Math.floor(Math.random() * (max - min + 1)) + min;
215:   const shuffled = [...arr].sort(() => Math.random() - 0.5);
216:   return shuffled.slice(0, count);
217: }
218: function randomDate(daysBack: number): string {
219:   const now = new Date();
220:   const offset = Math.floor(Math.random() * daysBack);
221:   const d = new Date(now.getTime() - offset * 24 * 60 * 60 * 1000);
222:   return d.toISOString().slice(0, 10);
223: }
224: function randomDatetime(daysBack: number): string {
225:   const now = new Date();
226:   const offset = Math.floor(Math.random() * daysBack) * 24 * 60 * 60 * 1000
227:     + Math.floor(Math.random() * 86400000);
228:   const d = new Date(now.getTime() - offset);
229:   return d.toISOString().slice(0, 19);
230: }
231: function randomAmount(): string {
232:   return (Math.floor(Math.random() * 5000000) + 50000).toFixed(2);
233: }
234: function randomInn(): string {
235:   return randomItem(INNS);
236: }
237: export function generateDemoDeals(count: number = 150): Record<string, string | string[]>[] {
238:   const deals: Record<string, string | string[]>[] = [];
239:   for (let i = 0; i < count; i++) {
240:     const isWon = Math.random() > 0.6;
241:     const isLost = !isWon && Math.random() > 0.7;
242:     const stage = isWon ? "WON" : isLost ? "LOSE" : randomItem(STAGES.slice(0, 4));
243:     const responsible = randomItem(RESPONSIBLE_PERSONS);
244:     deals.push({
245:       ID: String(1000 + i),
246:       TITLE: `Сделка: ${randomItem(COMPANIES)}`,
247:       TYPE_ID: "SALE",
248:       CATEGORY_ID: "0",
249:       STAGE_ID: stage,
250:       CURRENCY_ID: "RUB",
251:       OPPORTUNITY: randomAmount(),
252:       TAX_VALUE: (Math.random() * 20).toFixed(2),
253:       BEGINDATE: randomDate(90),
254:       CLOSEDATE: isWon || isLost ? randomDate(30) : "",
255:       COMMENTS: Math.random() > 0.7 ? "Требуется согласование с техническим отделом" : "",
256:       SOURCE_ID: Math.random() > 0.5 ? "WEB" : "CALL",
257:       DATE_CREATE: randomDatetime(90),
258:       DATE_MODIFY: randomDatetime(30),
259:       // Custom fields
260:       UF_CRM_1584459653509: randomItem(SKLADS),
261:       UF_CRM_1584459666824: randomDate(60),
262:       UF_CRM_1584459858509: randomItem(DELIVERY_TYPES),
263:       UF_CRM_1584460062014: randomDate(30),
264:       UF_CRM_1584463812262: `${(Math.random() * 15000 + 500).toFixed(2)}|RUB`,
265:       UF_CRM_1584464068013: randomItem(PAYMENT_STATUSES),
266:       UF_CRM_1585653172826: randomDatetime(30),
267:       UF_CRM_1586467706342: Math.random() > 0.6 ? "Просим доставить до 12:00, этаж 3" : "",
268:       UF_CRM_1586468182934: (Math.random() * 25 + 2).toFixed(1),
269:       UF_CRM_DEAL_3861467182211: `1С-${String(2024000 + i).padStart(8, "0")}`,
270:       UF_CRM_DEAL_3861467182227: randomItem(ORGS),
271:       UF_CRM_6915D8C25162A: Math.random() > 0.7 ? `LC${String(100000 + i)}` : "",
272:       UF_CRM_6915D8C2688B8: randomItem(PAYMENT_METHODS),
273:       UF_CRM_6915D8C2C31D0: randomMultiple(OTDELS, 1, 2),
274:       UF_CRM_6915D8C328208: randomMultiple(NAPRAVLENIA, 1, 2),
275:       UF_CRM_1763541960: Math.random() > 0.7 ? "Позвонить перед доставкой" : "",
276:       UF_CRM_1763542027: `г. ${randomItem(REGIONS)}, ул. Промышленная, д. ${Math.floor(Math.random() * 50 + 1)}`,
277:       UF_CRM_1763542249: randomItem(PAYMENT_TYPES),
278:       UF_CRM_1763546892: isWon ? "Успешно закрыта, клиент доволен" : "",
279:       UF_CRM_1763546915: "",
280:       UF_CRM_69257337C8C0D: Math.random() > 0.6 ? "Выставка Химия 2025" : "",
281:       UF_CRM_69257337D66F5: randomItem(DELIVERY_PREFS),
282:       UF_CRM_69257337E7E9B: isLost ? "Бюджет не утверждён" : "",
283:       UF_CRM_692573380C4F0: Math.random() > 0.8 ? randomItem(IMPORT_BASES) : "",
284:       UF_CRM_6925733827A0F: Math.random() > 0.6 ? "Производство силикатных материалов" : "",
285:       UF_CRM_69257BBACD471: randomMultiple(PRODUCT_TYPES, 1, 2),
286:       UF_CRM_69259C45EC14B: randomItem(REGIONS),
287:       UF_CRM_1766405164: randomInn(),
288:       UF_CRM_1774878835644: (Math.random() * 3000000 + 100000).toFixed(2),
289:       UF_CRM_1774878993375: String(Math.floor(Math.random() * 8 + 1)),
290:       UF_CRM_1774879911841: (Math.random() * 500 + 10).toFixed(1),
291:       UF_CRM_1774879952785: Math.random() > 0.6 ? randomDate(30) : "",
292:       UF_CRM_1774880017: Math.random() > 0.7 ? "Требуется анализ пробы перед отгрузкой" : "",
293:       UF_CRM_1774880111684: Math.random() > 0.7 ? "1" : "0",
294:       UF_CRM_1774880251970: isLost ? randomItem(REFUSAL_REASONS) : "",
295:       ASSIGNED_BY_ID: responsible.ID,
296:       ASSIGNED_BY_NAME: responsible.NAME,
297:     });
298:   }
299:   // Sort by date descending
300:   deals.sort((a, b) => String(b.DATE_CREATE || "").localeCompare(String(a.DATE_CREATE || "")));
301:   return deals;
302: }
```

## File: prisma/schema.prisma
```prisma
 1: // This is your Prisma schema file,
 2: // learn more about it in the docs: https://pris.ly/d/prisma-schema
 3: 
 4: generator client {
 5:   provider      = "prisma-client-js"
 6:   binaryTargets = ["native", "debian-openssl-3.0.x"]
 7: }
 8: 
 9: datasource db {
10:   provider = "sqlite"
11:   url      = env("DATABASE_URL")
12: }
13: 
14: // ─── RusSilica BI Terminal — Audit Log ───
15: // Persistent security audit trail — survives server restarts.
16: // WordPress manages users, so we store email/role directly
17: // instead of referencing a local User table.
18: 
19: model AuditLog {
20:   id        String   @id @default(cuid())
21:   event     String                // LOGIN_SUCCESS, LOGIN_FAILED, DATA_EXPORT, etc.
22:   email     String?               // User email (from WordPress SSO)
23:   role      String?               // User role at the time of action
24:   targetId  String?               // Target entity (for admin operations)
25:   ip        String?               // Client IP address
26:   details   String?               // JSON string with additional context
27:   createdAt DateTime @default(now())
28: 
29:   @@index([event])
30:   @@index([email])
31:   @@index([createdAt])
32:   @@map("audit_logs")
33: }
34: 
35: // ─── SSO Replay Protection ───
36: // Stores nonces from SSO tokens to prevent replay attacks.
37: model UsedNonce {
38:   nonce     String   @id
39:   createdAt DateTime @default(now())
40: 
41:   @@map("used_nonces")
42: }
```

## File: src/app/page.tsx
```typescript
  1: "use client";
  2: import { useEffect, useState } from "react";
  3: import { useSession } from "next-auth/react";
  4: import { useRouter } from "next/navigation";
  5: import { useDashboardStore } from "@/store/dashboard-store";
  6: import { Header } from "@/components/dashboard/header";
  7: import { StatsCards } from "@/components/dashboard/stats-cards";
  8: import { DataTable } from "@/components/dashboard/data-table";
  9: import { ColumnSelector } from "@/components/dashboard/column-selector";
 10: import { ConfigBanner } from "@/components/dashboard/config-banner";
 11: import { Footer } from "@/components/dashboard/footer";
 12: import { LoadingScreen } from "@/components/dashboard/loading-screen";
 13: import { BarChart3, Loader2, AlertCircle } from "lucide-react";
 14: import { Button } from "@/components/ui/button";
 15: // Maximum time to wait for NextAuth session check before showing timeout UI
 16: // Prevents infinite spinner if /api/auth/session hangs
 17: const AUTH_LOADING_TIMEOUT_MS = 15_000;
 18: export default function DashboardPage() {
 19:   const { data: session, status } = useSession();
 20:   const router = useRouter();
 21:   const { checkConfig, fetchFields, fetchDeals, isDemoMode, appLoaded, dealsError, syncData } = useDashboardStore();
 22:   const [authLoadingTimedOut, setAuthLoadingTimedOut] = useState(false);
 23:   // Redirect unauthenticated users to login
 24:   useEffect(() => {
 25:     if (status === "unauthenticated") {
 26:       router.replace("/login");
 27:     }
 28:   }, [status, router]);
 29:   // Handle session invalidation (password changed, account deactivated, etc.)
 30:   // Note: session.error is not currently set by auth callbacks, but kept for future use
 31:   useEffect(() => {
 32:     if (session && session.error === "SessionInvalid") {
 33:       router.replace("/login");
 34:     }
 35:   }, [session, router]);
 36:   // Timeout for auth loading state — prevents infinite spinner
 37:   useEffect(() => {
 38:     if (status !== "loading") return;
 39:     const timer = setTimeout(() => setAuthLoadingTimedOut(true), AUTH_LOADING_TIMEOUT_MS);
 40:     return () => clearTimeout(timer);
 41:   }, [status]);
 42:   // Load data when authenticated
 43:   useEffect(() => {
 44:     if (status !== "authenticated") return;
 45:     const init = async () => {
 46:       try {
 47:         await checkConfig();
 48:         await fetchFields();
 49:         await fetchDeals();
 50:       } catch (error) {
 51:         // Each individual fetch has its own error handling (falls back to demo mode),
 52:         // but catch here to prevent unhandled promise rejection
 53:         console.error("[Dashboard] Init error:", error);
 54:       }
 55:     };
 56:     init();
 57:   }, [status, checkConfig, fetchFields, fetchDeals]);
 58:   // Show loading while checking auth
 59:   if (status === "loading") {
 60:     return null;
 61:   }
 62:   // Don't render dashboard for unauthenticated users
 63:   if (status !== "authenticated") {
 64:     return null;
 65:   }
 66:   return (
 67:     <>
 68:       <LoadingScreen />
 69:       <div className={`min-h-screen flex flex-col bg-background transition-opacity duration-300 ${appLoaded ? "opacity-100" : "opacity-0"}`}>
 70:         <Header />
 71:         <main className="flex-1 flex flex-col min-h-0">
 72:           <ConfigBanner />
 73:           {dealsError && (
 74:             <div className="px-4 sm:px-6 pt-3 animate-fade-in">
 75:               <div className="flex items-center justify-between px-4 py-3 rounded-md bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800">
 76:                 <div className="flex items-center gap-3">
 77:                   <AlertCircle className="h-5 w-5 text-red-600 dark:text-red-400" />
 78:                   <span className="text-sm text-red-800 dark:text-red-300 font-medium">
 79:                     {dealsError}
 80:                   </span>
 81:                 </div>
 82:                 <Button 
 83:                   variant="outline" 
 84:                   size="sm" 
 85:                   onClick={() => syncData()}
 86:                   className="border-red-200 hover:bg-red-100 dark:border-red-800 dark:hover:bg-red-900/50 text-red-700 dark:text-red-400"
 87:                 >
 88:                   Повторить
 89:                 </Button>
 90:               </div>
 91:             </div>
 92:           )}
 93:           {isDemoMode && (
 94:             <div className="px-4 sm:px-6 pt-3 animate-fade-in">
 95:               <div className="flex items-center gap-2 px-3 py-2 rounded-md bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800">
 96:                 <div className="h-1.5 w-1.5 rounded-full bg-amber-500 animate-pulse" />
 97:                 <span className="text-xs text-amber-700 dark:text-amber-400 font-medium">
 98:                   Демо-режим — Обратитесь к администратору для подключения реальных данных
 99:                 </span>
100:               </div>
101:             </div>
102:           )}
103:           <StatsCards />
104:           <DataTable />
105:         </main>
106:         <ColumnSelector />
107:         <Footer />
108:       </div>
109:     </>
110:   );
111: }
```

## File: src/components/dashboard/global-search.tsx
```typescript
 1: "use client";
 2: import { useRef, useState, useCallback } from "react";
 3: import { useDashboardStore } from "@/store/dashboard-store";
 4: import { Search, X } from "lucide-react";
 5: export function GlobalSearch() {
 6:   const { searchQuery, setSearchQuery } = useDashboardStore();
 7:   const inputRef = useRef<HTMLInputElement>(null);
 8:   const [mobileExpanded, setMobileExpanded] = useState(false);
 9:   const handleClear = useCallback(() => {
10:     setSearchQuery("");
11:     inputRef.current?.focus();
12:   }, [setSearchQuery]);
13:   // Search input component (shared between desktop and mobile)
14:   const searchInput = (
15:     <div className="relative flex items-center">
16:       <Search className="absolute left-2 h-3.5 w-3.5 text-white/30 pointer-events-none" />
17:       <input
18:         ref={inputRef}
19:         type="text"
20:         value={searchQuery}
21:         onChange={(e) => setSearchQuery(e.target.value)}
22:         placeholder="Поиск по всем полям..."
23:         className="h-7 w-full sm:w-56 lg:w-64 rounded-md bg-white/[0.07] border border-white/10 text-white/80 placeholder:text-white/30 text-xs pl-7 pr-6 outline-none focus-visible:border-white/25 focus-visible:ring-1 focus-visible:ring-white/20 transition-all"
24:         onBlur={() => {
25:           if (searchQuery === "" && window.innerWidth < 768) {
26:             setMobileExpanded(false);
27:           }
28:         }}
29:       />
30:       {searchQuery && (
31:         <button
32:           onClick={handleClear}
33:           className="absolute right-1.5 flex items-center justify-center h-4 w-4 rounded-sm text-white/40 hover:text-white/80 hover:bg-white/10 transition-colors"
34:           aria-label="Очистить поиск"
35:         >
36:           <X className="h-3 w-3" />
37:         </button>
38:       )}
39:     </div>
40:   );
41:   // Mobile: icon-only that expands
42:   if (!mobileExpanded) {
43:     return (
44:       <>
45:         {/* Mobile icon button */}
46:         <button
47:           onClick={() => {
48:             setMobileExpanded(true);
49:             setTimeout(() => inputRef.current?.focus(), 50);
50:           }}
51:           className="sm:hidden flex items-center justify-center h-7 w-7 rounded-md text-white/60 hover:text-white hover:bg-white/10 transition-colors"
52:           aria-label="Поиск"
53:         >
54:           <Search className="h-3.5 w-3.5" />
55:         </button>
56:         {/* Desktop: always-visible input */}
57:         <div className="hidden sm:block w-40 sm:w-56 lg:w-64">
58:           {searchInput}
59:         </div>
60:       </>
61:     );
62:   }
63:   // Mobile expanded state
64:   return (
65:     <div className="w-full sm:w-56 lg:w-64">
66:       {searchInput}
67:     </div>
68:   );
69: }
```

## File: src/components/dashboard/loading-screen.tsx
```typescript
  1: "use client";
  2: import { useEffect, useState, useRef } from "react";
  3: import { useDashboardStore } from "@/store/dashboard-store";
  4: const TERMINAL_LINES = [
  5:   "RusSilica BI Terminal v2.0",
  6:   "Инициализация модулей...",
  7:   "Загрузка конфигурации CRM...",
  8:   "Подключение к Bitrix24...",
  9:   "Синхронизация данных...",
 10:   "Загрузка полей сделки...",
 11:   "Построение индексов...",
 12:   "Готово к работе ✓",
 13: ];
 14: const LINE_DELAY_MS = 120; // 8 lines * 120ms ≈ 1 second
 15: const FADE_OUT_DELAY_MS = 400;
 16: function getTimestamp() {
 17:   const now = new Date();
 18:   const hh = String(now.getHours()).padStart(2, "0");
 19:   const mm = String(now.getMinutes()).padStart(2, "0");
 20:   const ss = String(now.getSeconds()).padStart(2, "0");
 21:   const ms = String(now.getMilliseconds()).padStart(3, "0");
 22:   return `[${hh}:${mm}:${ss}.${ms}]`;
 23: }
 24: export function LoadingScreen() {
 25:   const { appLoaded, setAppLoaded } = useDashboardStore();
 26:   const [visibleLines, setVisibleLines] = useState(0);
 27:   const [fadingOut, setFadingOut] = useState(false);
 28:   const fadingOutRef = useRef(false);
 29:   const [timestamps, setTimestamps] = useState<string[]>([]);
 30:   const cancelledRef = useRef(false);
 31:   const isMountedRef = useRef(true);
 32:   useEffect(() => {
 33:     isMountedRef.current = true;
 34:     return () => {
 35:       isMountedRef.current = false;
 36:     };
 37:   }, []);
 38:   useEffect(() => {
 39:     if (appLoaded) return;
 40:     cancelledRef.current = false;
 41:     const timers: ReturnType<typeof setTimeout>[] = [];
 42:     const scheduleTimer = (fn: () => void, ms: number) => {
 43:       const id = setTimeout(() => {
 44:         if (!cancelledRef.current && isMountedRef.current) fn();
 45:       }, ms);
 46:       timers.push(id);
 47:       return id;
 48:     };
 49:     let lineIndex = 0;
 50:     const showNext = () => {
 51:       lineIndex++;
 52:       if (lineIndex <= TERMINAL_LINES.length) {
 53:         setVisibleLines(lineIndex);
 54:         setTimestamps((prev) => {
 55:           const newTimestamps = [...prev];
 56:           newTimestamps[lineIndex - 1] = getTimestamp();
 57:           return newTimestamps;
 58:         });
 59:         scheduleTimer(showNext, LINE_DELAY_MS);
 60:       } else {
 61:         // All lines shown — wait for data to finish loading before fading out.
 62:         const waitForData = () => {
 63:           if (cancelledRef.current || !isMountedRef.current) return;
 64:           // Get latest state directly from the store to avoid useEffect re-runs
 65:           const state = useDashboardStore.getState();
 66:           if (!state.fieldsLoading && !state.dealsLoading) {
 67:             if (fadingOutRef.current) return;
 68:             fadingOutRef.current = true;
 69:             setFadingOut(true);
 70:             scheduleTimer(() => {
 71:               if (isMountedRef.current && !cancelledRef.current) {
 72:                 setAppLoaded(true);
 73:               }
 74:             }, 500);
 75:           } else {
 76:             // Data still loading — check again in 200ms
 77:             scheduleTimer(waitForData, 200);
 78:           }
 79:         };
 80:         scheduleTimer(waitForData, FADE_OUT_DELAY_MS);
 81:       }
 82:     };
 83:     scheduleTimer(showNext, 150);
 84:     // Safety timeout: force load after 10s even if data hasn't arrived
 85:     scheduleTimer(() => {
 86:       if (!cancelledRef.current && isMountedRef.current && !useDashboardStore.getState().appLoaded) {
 87:         if (fadingOutRef.current) return;
 88:         fadingOutRef.current = true;
 89:         setFadingOut(true);
 90:         scheduleTimer(() => {
 91:           if (isMountedRef.current && !cancelledRef.current) {
 92:             setAppLoaded(true);
 93:           }
 94:         }, 500);
 95:       }
 96:     }, 10_000);
 97:     return () => {
 98:       cancelledRef.current = true;
 99:       timers.forEach((id) => clearTimeout(id));
100:     };
101:   }, [appLoaded, setAppLoaded]); // Removed dealsLoading and fieldsLoading to prevent restart
102:   if (appLoaded) return null;
103:   return (
104:     <div
105:       className={`fixed inset-0 z-[100] flex items-center justify-center bg-black transition-opacity duration-500 ${
106:         fadingOut ? "opacity-0" : "opacity-100"
107:       }`}
108:     >
109:       <div className="w-full max-w-2xl mx-4 bg-black border border-amber-500/30 p-6 shadow-[0_0_30px_rgba(245,158,11,0.1)]">
110:         {/* Terminal body */}
111:         <div className="font-mono text-[14px] leading-relaxed min-h-[280px]">
112:           {TERMINAL_LINES.slice(0, visibleLines).map((line, i) => {
113:             const isSuccess = line.includes("✓");
114:             const isVersion = i === 0;
115:             const timestamp = timestamps[i] || getTimestamp();
116:             return (
117:               <div key={i} className="flex gap-3">
118:                 <span className="text-slate-500 shrink-0 select-none">
119:                   {timestamp}
120:                 </span>
121:                 <span
122:                   className={
123:                     isSuccess
124:                       ? "text-emerald-500 font-bold"
125:                       : isVersion
126:                       ? "text-amber-500 font-bold uppercase tracking-wider"
127:                       : "text-amber-500/80"
128:                   }
129:                 >
130:                   {line}
131:                 </span>
132:                 {i === visibleLines - 1 && !fadingOut && (
133:                   <span className="inline-block w-[8px] h-[16px] bg-amber-500 ml-1 align-middle animate-blink-cursor" />
134:                 )}
135:               </div>
136:             );
137:           })}
138:         </div>
139:       </div>
140:     </div>
141:   );
142: }
```

## File: src/components/dashboard/responsible-filter.tsx
```typescript
  1: "use client";
  2: import { useDashboardStore } from "@/store/dashboard-store";
  3: import {
  4:   DropdownMenu,
  5:   DropdownMenuContent,
  6:   DropdownMenuItem,
  7:   DropdownMenuLabel,
  8:   DropdownMenuSeparator,
  9:   DropdownMenuTrigger,
 10: } from "@/components/ui/dropdown-menu";
 11: import { UserCircle, ChevronDown, Check } from "lucide-react";
 12: import { useMemo } from "react";
 13: interface ResponsibleOption {
 14:   id: string;
 15:   name: string;
 16:   count: number;
 17: }
 18: export function ResponsibleFilter() {
 19:   const { allDeals, responsibleFilter, setResponsibleFilter, userNames } = useDashboardStore();
 20:   const responsibleOptions = useMemo<ResponsibleOption[]>(() => {
 21:     const map = new Map<string, { name: string; count: number }>();
 22:     // Use allDeals so counts are stable regardless of active filters
 23:     for (const deal of allDeals) {
 24:       const id = String(deal.ASSIGNED_BY_ID || "");
 25:       if (!id) continue;
 26:       // Priority: userNames from API/fetch > ASSIGNED_BY_NAME from deal data > fallback
 27:       const name = userNames[id] || String(deal.ASSIGNED_BY_NAME || "");
 28:       const existing = map.get(id);
 29:       if (existing) {
 30:         existing.count++;
 31:       } else {
 32:         map.set(id, { name: name || `ID ${id}`, count: 1 });
 33:       }
 34:     }
 35:     return Array.from(map.entries())
 36:       .map(([id, data]) => ({ id, name: data.name, count: data.count }))
 37:       .sort((a, b) => b.count - a.count);
 38:   }, [allDeals, userNames]);
 39:   // Simplified version if no responsible persons in data
 40:   if (responsibleOptions.length === 0) {
 41:     return (
 42:       <div className="h-7 px-2 flex items-center gap-1.5 rounded bg-white/5 border border-white/10 text-[11px] text-white/50">
 43:         <UserCircle className="h-3.5 w-3.5" />
 44:         <span>Все</span>
 45:       </div>
 46:     );
 47:   }
 48:   const activeName =
 49:     responsibleFilter === "all"
 50:       ? "Все ответственные"
 51:       : responsibleOptions.find((r) => r.id === responsibleFilter)?.name || "Все ответственные";
 52:   return (
 53:     <DropdownMenu>
 54:       <DropdownMenuTrigger asChild>
 55:         <button className="h-7 px-2 flex items-center gap-1.5 rounded bg-white/5 border border-white/10 text-[11px] text-white/60 hover:text-white/80 hover:bg-white/10 transition-colors cursor-pointer">
 56:           <UserCircle className="h-3.5 w-3.5" />
 57:           <span className="max-w-[100px] truncate">{activeName}</span>
 58:           <ChevronDown className="h-3 w-3 opacity-50" />
 59:         </button>
 60:       </DropdownMenuTrigger>
 61:       <DropdownMenuContent align="start" className="w-56">
 62:         <DropdownMenuLabel className="text-[11px] text-muted-foreground">
 63:           Ответственный менеджер
 64:         </DropdownMenuLabel>
 65:         <DropdownMenuSeparator />
 66:         {/* All option */}
 67:         <DropdownMenuItem
 68:           onClick={() => setResponsibleFilter("all")}
 69:           className="flex items-center gap-2 text-xs cursor-pointer"
 70:         >
 71:           <span className="w-4 flex items-center justify-center">
 72:             {responsibleFilter === "all" && <Check className="h-3 w-3 text-brand-orange" />}
 73:           </span>
 74:           <span className="flex-1">Все ответственные</span>
 75:           <span className="text-[10px] text-muted-foreground tabular-nums">
 76:             {allDeals.length}
 77:           </span>
 78:         </DropdownMenuItem>
 79:         <DropdownMenuSeparator />
 80:         {responsibleOptions.map((option) => (
 81:           <DropdownMenuItem
 82:             key={option.id}
 83:             onClick={() => setResponsibleFilter(option.id)}
 84:             className="flex items-center gap-2 text-xs cursor-pointer"
 85:           >
 86:             <span className="w-4 flex items-center justify-center">
 87:               {responsibleFilter === option.id && (
 88:                 <Check className="h-3 w-3 text-brand-orange" />
 89:               )}
 90:             </span>
 91:             <span className="flex-1 truncate">{option.name}</span>
 92:             <span className="text-[10px] text-muted-foreground tabular-nums">
 93:               {option.count}
 94:             </span>
 95:           </DropdownMenuItem>
 96:         ))}
 97:       </DropdownMenuContent>
 98:     </DropdownMenu>
 99:   );
100: }
```

## File: src/components/dashboard/saved-views.tsx
```typescript
  1: "use client";
  2: import { useState, useRef, useEffect } from "react";
  3: import { Bookmark, Trash2, Save } from "lucide-react";
  4: import { useDashboardStore } from "@/store/dashboard-store";
  5: import { Button } from "@/components/ui/button";
  6: import { pluralRu } from "@/lib/i18n";
  7: import {
  8:   DropdownMenu,
  9:   DropdownMenuTrigger,
 10:   DropdownMenuContent,
 11:   DropdownMenuItem,
 12:   DropdownMenuSeparator,
 13: } from "@/components/ui/dropdown-menu";
 14: import { Input } from "@/components/ui/input";
 15: function formatRelativeDate(timestamp: number): string {
 16:   const now = Date.now();
 17:   const diffMs = now - timestamp;
 18:   const diffMinutes = Math.floor(diffMs / (1000 * 60));
 19:   const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
 20:   const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
 21:   if (diffMinutes < 1) return "только что";
 22:   if (diffMinutes < 60) return `${diffMinutes} мин. назад`;
 23:   if (diffHours < 24) {
 24:     return `${diffHours} ${pluralRu(diffHours, ["час", "часа", "часов"])} назад`;
 25:   }
 26:   return `${diffDays} ${pluralRu(diffDays, ["день", "дня", "дней"])} назад`;
 27: }
 28: export function SavedViews() {
 29:   const savedViews = useDashboardStore((s) => s.savedViews);
 30:   const saveView = useDashboardStore((s) => s.saveView);
 31:   const loadSavedView = useDashboardStore((s) => s.loadSavedView);
 32:   const deleteSavedView = useDashboardStore((s) => s.deleteSavedView);
 33:   const [open, setOpen] = useState(false);
 34:   const [isSaving, setIsSaving] = useState(false);
 35:   const [viewName, setViewName] = useState("");
 36:   const inputRef = useRef<HTMLInputElement>(null);
 37:   useEffect(() => {
 38:     if (isSaving && inputRef.current) {
 39:       inputRef.current.focus();
 40:     }
 41:   }, [isSaving]);
 42:   const handleStartSave = () => {
 43:     setIsSaving(true);
 44:     setViewName("");
 45:   };
 46:   const handleSaveSubmit = () => {
 47:     const trimmed = viewName.trim();
 48:     if (!trimmed) {
 49:       setIsSaving(false);
 50:       setViewName("");
 51:       return;
 52:     }
 53:     saveView(trimmed);
 54:     setIsSaving(false);
 55:     setViewName("");
 56:     setOpen(false);
 57:   };
 58:   const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
 59:     if (e.key === "Enter") {
 60:       e.preventDefault();
 61:       handleSaveSubmit();
 62:     } else if (e.key === "Escape") {
 63:       setIsSaving(false);
 64:       setViewName("");
 65:     }
 66:   };
 67:   const handleLoad = (id: string) => {
 68:     loadSavedView(id);
 69:     setOpen(false);
 70:   };
 71:   const handleDelete = (e: React.MouseEvent, id: string) => {
 72:     e.stopPropagation();
 73:     deleteSavedView(id);
 74:   };
 75:   return (
 76:     <DropdownMenu open={open} onOpenChange={(v) => {
 77:       setOpen(v);
 78:       if (!v) {
 79:         setIsSaving(false);
 80:         setViewName("");
 81:       }
 82:     }}>
 83:       <DropdownMenuTrigger asChild>
 84:         <Button
 85:           variant="ghost"
 86:           size="sm"
 87:           className="h-7 gap-1.5 rounded text-xs text-white/70 hover:text-white hover:bg-white/10"
 88:         >
 89:           <Bookmark className="h-3.5 w-3.5" />
 90:           <span className="hidden sm:inline">Виды</span>
 91:         </Button>
 92:       </DropdownMenuTrigger>
 93:       <DropdownMenuContent align="end" className="w-56">
 94:         {isSaving ? (
 95:           <div className="flex items-center gap-2 px-2 py-1.5">
 96:             <Input
 97:               ref={inputRef}
 98:               value={viewName}
 99:               onChange={(e) => setViewName(e.target.value)}
100:               onKeyDown={handleKeyDown}
101:               placeholder="Название вида..."
102:               className="h-7 text-xs"
103:             />
104:             <Button
105:               size="sm"
106:               variant="ghost"
107:               onClick={handleSaveSubmit}
108:               className="h-7 shrink-0 px-2 text-xs"
109:             >
110:               <Save className="h-3.5 w-3.5" />
111:             </Button>
112:           </div>
113:         ) : (
114:           <DropdownMenuItem onClick={handleStartSave}>
115:             <Bookmark className="h-4 w-4" />
116:             Сохранить текущий вид
117:           </DropdownMenuItem>
118:         )}
119:         {savedViews.length > 0 && <DropdownMenuSeparator />}
120:         {savedViews.length > 0 ? (
121:           savedViews.map((view) => (
122:             <DropdownMenuItem
123:               key={view.id}
124:               onClick={() => handleLoad(view.id)}
125:               className="flex items-center justify-between gap-2"
126:             >
127:               <div className="flex flex-col min-w-0 flex-1">
128:                 <span className="text-sm truncate">{view.name}</span>
129:                 <span className="text-[11px] text-muted-foreground">
130:                   {formatRelativeDate(view.createdAt)}
131:                 </span>
132:               </div>
133:               <button
134:                 onClick={(e) => handleDelete(e, view.id)}
135:                 className="shrink-0 p-1 rounded hover:bg-destructive/10 hover:text-destructive transition-colors"
136:                 aria-label="Удалить вид"
137:               >
138:                 <Trash2 className="h-3 w-3" />
139:               </button>
140:             </DropdownMenuItem>
141:           ))
142:         ) : (
143:           !isSaving && (
144:             <div className="px-2 py-3 text-center text-xs text-muted-foreground">
145:               Нет сохранённых видов
146:             </div>
147:           )
148:         )}
149:       </DropdownMenuContent>
150:     </DropdownMenu>
151:   );
152: }
```

## File: src/lib/auth-guard.ts
```typescript
  1: /**
  2:  * Server-side authentication guard for API routes.
  3:  *
  4:  * WordPress SSO Architecture:
  5:  * - WordPress is the source of truth for users and roles
  6:  * - NextAuth JWT contains: email, role (from WP proxy headers)
  7:  * - No local user database — we trust the JWT claims
  8:  * - JWT is refreshed from WordPress proxy headers on every sign-in
  9:  *
 10:  * Guards:
 11:  * - requireAuth() — Any authenticated user (reads from JWT)
 12:  * - requireAdmin() — Admin role required (reads from JWT)
 13:  * - persistAuditLog() — Persistent audit logging to database
 14:  */
 15: import { getServerSession } from "next-auth";
 16: import { NextResponse } from "next/server";
 17: import { authOptions } from "@/lib/auth";
 18: import { db } from "@/lib/db";
 19: import { shouldLog } from "@/lib/config";
 20: interface AuthSession {
 21:   userId: string;  // Email (used as ID since no local user DB)
 22:   email: string;
 23:   name: string | null;
 24:   role: string;
 25: }
 26: /**
 27:  * Require any authenticated user.
 28:  * Reads user info from NextAuth JWT session.
 29:  * WordPress is the source of truth — we trust the JWT claims.
 30:  */
 31: export async function requireAuth(): Promise<AuthSession | NextResponse> {
 32:   const session = await getServerSession(authOptions);
 33:   if (!session?.user) {
 34:     return NextResponse.json(
 35:       { success: false, error: "Требуется авторизация" },
 36:       { status: 401 }
 37:     );
 38:   }
 39:   const userId = session.user.id;
 40:   const role = session.user.role;
 41:   if (!userId) {
 42:     return NextResponse.json(
 43:       { success: false, error: "Некорректная сессия" },
 44:       { status: 401 }
 45:     );
 46:   }
 47:   return {
 48:     userId,
 49:     email: session.user.email || userId,
 50:     name: session.user.name || null,
 51:     role: role || "user",
 52:   };
 53: }
 54: /**
 55:  * Require any authenticated user, but only return null on success or NextResponse on error.
 56:  * Useful for API routes that just need to gate access without reading user info.
 57:  */
 58: export async function requireAuthOnly(): Promise<null | NextResponse> {
 59:   const result = await requireAuth();
 60:   if (isAuthError(result)) return result;
 61:   return null;
 62: }
 63: /**
 64:  * Require admin role.
 65:  * Reads role from NextAuth JWT session (populated from WordPress proxy headers).
 66:  * WordPress is the source of truth — role is set at sign-in from WP.
 67:  */
 68: export async function requireAdmin(): Promise<AuthSession | NextResponse> {
 69:   const session = await getServerSession(authOptions);
 70:   if (!session?.user) {
 71:     return NextResponse.json(
 72:       { success: false, error: "Требуется авторизация" },
 73:       { status: 401 }
 74:     );
 75:   }
 76:   const userId = session.user.id;
 77:   const role = session.user.role;
 78:   if (!userId) {
 79:     return NextResponse.json(
 80:       { success: false, error: "Некорректная сессия" },
 81:       { status: 401 }
 82:     );
 83:   }
 84:   if (role !== "admin") {
 85:     const clientIp = "unknown"; // Will be set by caller if needed
 86:     await persistAuditLog("UNAUTHORIZED_ADMIN_ACCESS", userId, undefined, clientIp, {
 87:       attemptedByEmail: session.user.email,
 88:       actualRole: role,
 89:     });
 90:     return NextResponse.json(
 91:       { success: false, error: "Доступ запрещён" },
 92:       { status: 403 }
 93:     );
 94:   }
 95:   return {
 96:     userId,
 97:     email: session.user.email || userId,
 98:     name: session.user.name || null,
 99:     role,
100:   };
101: }
102: /**
103:  * Persist audit log to database.
104:  * Survives server restarts and enables forensic analysis.
105:  */
106: export async function persistAuditLog(
107:   event: string,
108:   email?: string | null,
109:   targetId?: string | null,
110:   ip?: string | null,
111:   details?: Record<string, unknown>
112: ): Promise<void> {
113:   try {
114:     await db.auditLog.create({
115:       data: {
116:         event,
117:         email: email || null,
118:         role: typeof details?.role === "string" ? details.role : (typeof details?.actualRole === "string" ? details.actualRole : "unknown"),
119:         targetId: targetId || null,
120:         ip: ip || null,
121:         details: details ? JSON.stringify(details) : null,
122:       },
123:     });
124:   } catch (error) {
125:     // Never let audit log failure break the main flow
126:     console.error("[AUDIT DB] Failed to persist audit log:", error);
127:   }
128:   // Also log to console for real-time monitoring (development only)
129:   if (shouldLog) {
130:     const timestamp = new Date().toISOString();
131:     console.log(`[AUDIT] ${JSON.stringify({ timestamp, event, email, targetId, ip, ...details })}`);
132:   }
133: }
134: /**
135:  * Type guard: check if the result is an error response.
136:  */
137: export function isAuthError(result: AuthSession | NextResponse): result is NextResponse {
138:   return result instanceof NextResponse;
139: }
```

## File: src/lib/crm-constants.ts
```typescript
 1: // src/lib/crm-constants.ts
 2: // ─────────────────────────────────────────────────────────────────────
 3: // All Bitrix24 CRM-specific constants are defined here.
 4: // When the CRM configuration changes (stages renamed, new fields added),
 5: // update ONLY this file. Business logic in components reads from here.
 6: // ─────────────────────────────────────────────────────────────────────
 7: export const RESPONSIBLE_FIELD_ID = "ASSIGNED_BY_ID";
 8: export const RESPONSIBLE_FIELD_TITLE = "Ответственный";
 9: export const DEAL_TABLE_DEFAULT_COLUMNS = [
10:   "BEGINDATE",
11:   "DATE_MODIFY",
12:   "CLOSEDATE",
13:   RESPONSIBLE_FIELD_ID,
14:   "UF_CRM_69257BBACD471",
15:   "OPPORTUNITY",
16:   "COMPANY_TITLE",
17:   "COMPANY_UF_CRM_1777326239557",
18:   "UF_CRM_1774879911841",
19:   "UF_CRM_6915D8C2C31D0",
20:   "UF_CRM_6915D8C328208",
21:   "COMMENTS",
22: ] as const;
23: export const DEAL_STAGES = {
24:   // Standard Bitrix24 terminal stages — these are fixed by Bitrix24 itself
25:   WON: "WON",
26:   LOST: "LOSE",
27:   // Custom pipeline stages — verify these match your Bitrix24 funnel settings
28:   NEW: "NEW",
29:   PREPARATION: "PREPARATION",
30:   INVOICE_SENT: "PREPAYMENT_INVOICE",
31:   IN_PROGRESS: "EXECUTING",
32: } as const;
33: export const PAYMENT_STATUS_FIELD_ID = "UF_CRM_1584464068013";
34: // Payment status enumeration values — these IDs come from Bitrix24
35: // and are stable as long as the field is not deleted and recreated.
36: export const PAYMENT_STATUS_VALUES = {
37:   UNPAID: "103",
38:   INVOICE_SENT: "105",
39:   AWAITING_CONFIRMATION: "107",
40:   PAYMENT_PROCESSED: "109",
41:   ERROR: "111",
42:   PAID: "113",
43:   REFUNDED: "115",
44: } as const;
45: // Thresholds for business alerts — make these configurable so non-developers
46: // can adjust business rules without touching code.
47: export const ALERT_THRESHOLDS = {
48:   STALLED_DEAL_DAYS: 30,
49:   LARGE_DEAL_MIN_AMOUNT: 500_000,
50:   STUCK_NEGOTIATION_DAYS: 14,
51:   STUCK_LARGE_DEAL_MIN_AMOUNT: 1_000_000,
52:   WIN_RATE_WARNING_THRESHOLD: 20, // percent
53:   MIN_CLOSED_DEALS_FOR_WIN_RATE: 5,
54: } as const;
```

## File: src/app/api/admin/audit-logs/route.ts
```typescript
 1: import { NextRequest, NextResponse } from "next/server";
 2: import { db } from "@/lib/db";
 3: import { requireAdmin, isAuthError } from "@/lib/auth-guard";
 4: export const dynamic = "force-dynamic";
 5: // Define a strict allowlist of known event types.
 6: // This prevents log pollution and makes log analysis reliable.
 7: const VALID_AUDIT_EVENTS = new Set([
 8:   "LOGIN_SUCCESS_WP_SSO",
 9:   "LOGIN_SUCCESS_DEV",
10:   "LOGIN_FAILED",
11:   "LOGIN_BLOCKED_NO_SECRET",
12:   "LOGIN_BLOCKED_INVALID_HMAC",
13:   "LOGIN_BLOCKED_EMAIL_MISMATCH",
14:   "LOGIN_BLOCKED_NO_AUTH",
15:   "LOGIN_DOMAIN_BLOCKED",
16:   "LOGIN_BLOCKED_UNTRUSTED_PROXY",
17:   "UNAUTHORIZED_ADMIN_ACCESS",
18:   "DATA_EXPORT",
19: ]);
20: // A simple email shape check — not RFC 5322 compliant,
21: // but sufficient to reject garbage input like HTML or scripts.
22: const EMAIL_PATTERN = /^[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}$/;
23: /**
24:  * GET /api/admin/audit-logs — View audit logs (admin only)
25:  *
26:  * Query params:
27:  * - event: Filter by event type
28:  * - email: Filter by user email
29:  * - limit: Number of entries (default 100, max 500)
30:  * - offset: Pagination offset
31:  *
32:  * SECURITY:
33:  * - Admin-only access (role verified from JWT)
34:  * - Rate limited by proxy
35:  */
36: export async function GET(request: NextRequest) {
37:   try {
38:     const authResult = await requireAdmin();
39:     if (isAuthError(authResult)) return authResult;
40:     const { searchParams } = new URL(request.url);
41:     const eventParam = searchParams.get("event");
42:     const emailParam = searchParams.get("email");
43:     // Validate event against known values — reject unknown event types
44:     // rather than silently ignoring them, to surface misconfigured clients.
45:     if (eventParam && !VALID_AUDIT_EVENTS.has(eventParam)) {
46:       return NextResponse.json(
47:         { success: false, error: "Invalid event filter value" },
48:         { status: 400 }
49:       );
50:     }
51:     // Validate email format if provided
52:     if (emailParam && !EMAIL_PATTERN.test(emailParam)) {
53:       return NextResponse.json(
54:         { success: false, error: "Invalid email filter format" },
55:         { status: 400 }
56:       );
57:     }
58:     // Validate limit and offset
59:     const parsedLimit = Number(searchParams.get("limit"));
60:     const parsedOffset = Number(searchParams.get("offset"));
61:     const limit = Number.isFinite(parsedLimit) && searchParams.has("limit")
62:       ? Math.max(0, Math.min(parsedLimit, 500))
63:       : 100;
64:     const offset = Number.isFinite(parsedOffset) && searchParams.has("offset")
65:       ? Math.max(0, parsedOffset)
66:       : 0;
67:     const where: Record<string, unknown> = {};
68:     if (eventParam) where.event = eventParam;
69:     if (emailParam) where.email = emailParam;
70:     const [logs, total] = await Promise.all([
71:       db.auditLog.findMany({
72:         where,
73:         orderBy: { createdAt: "desc" },
74:         take: limit,
75:         skip: offset,
76:       }),
77:       db.auditLog.count({ where }),
78:     ]);
79:     return NextResponse.json({
80:       success: true,
81:       logs,
82:       total,
83:       limit,
84:       offset,
85:     });
86:   } catch (error) {
87:     console.error("[Audit Logs API Error]", error);
88:     return NextResponse.json(
89:       { success: false, error: "Не удалось загрузить аудит-логи" },
90:       { status: 500 }
91:     );
92:   }
93: }
```

## File: src/app/api/auth/wp-login/route.ts
```typescript
 1: import { NextResponse } from "next/server";
 2: import { WP_LOGIN_URL } from "@/lib/config.server";
 3: export async function POST(request: Request) {
 4:   try {
 5:     const body = await request.json();
 6:     const { email, password } = body;
 7:     if (!email || !password) {
 8:       return NextResponse.json(
 9:         { success: false, error: "Email and password are required" },
10:         { status: 400 }
11:       );
12:     }
13:     const wpBaseUrl = WP_LOGIN_URL.replace(/\/wp-login\.php.*$/, "");
14:     const apiUrl = `${wpBaseUrl}/wp-login.php?action=headless_auth`;
15:     const response = await fetch(apiUrl, {
16:       method: "POST",
17:       headers: {
18:         "Content-Type": "application/json",
19:       },
20:       body: JSON.stringify({ email, password }),
21:       cache: "no-store",
22:       signal: AbortSignal.timeout(15_000),
23:     });
24:     const text = await response.text();
25:     let data;
26:     try {
27:       data = JSON.parse(text);
28:     } catch (e) {
29:       console.error("[WP Headless Auth Error] Invalid JSON response from WP:", text.substring(0, 200));
30:       return NextResponse.json(
31:         { success: false, error: "Ошибка связи с сервером авторизации (WordPress вернул не JSON)" },
32:         { status: 502 }
33:       );
34:     }
35:     if (!response.ok || !data.success) {
36:       return NextResponse.json(
37:         { success: false, error: data.message || "Неверный email или пароль" },
38:         { status: 401 }
39:       );
40:     }
41:     return NextResponse.json({
42:       success: true,
43:       token: data.token,
44:     });
45:   } catch (error) {
46:     console.error("[WP Headless Auth Error]", error);
47:     return NextResponse.json(
48:       { success: false, error: "Внутренняя ошибка сервера" },
49:       { status: 500 }
50:     );
51:   }
52: }
```

## File: src/app/api/bitrix/activities/route.ts
```typescript
  1: import { NextRequest, NextResponse } from "next/server";
  2: import { bitrixPost } from "@/lib/bitrix";
  3: import { requireAuth, isAuthError } from "@/lib/auth-guard";
  4: import pLimit from "p-limit";
  5: export const dynamic = "force-dynamic";
  6: export interface ActivityData {
  7:   ID: string;
  8:   OWNER_ID: string;
  9:   OWNER_TYPE_ID: string;
 10:   SUBJECT: string;
 11:   COMPLETED: string;
 12:   DESCRIPTION: string;
 13:   DEADLINE: string;
 14:   CREATED: string;
 15:   AUTHOR_ID: string;
 16:   RESPONSIBLE_ID: string;
 17:   TYPE_ID: string;
 18:   PROVIDER_ID: string;
 19:   PROVIDER_TYPE_ID: string;
 20: }
 21: /**
 22:  * POST /api/bitrix/activities
 23:  * Fetches activities for a list of deal IDs.
 24:  * Returns the last completed activity and the next planned activity for each deal.
 25:  */
 26: export async function POST(request: NextRequest) {
 27:   const authResult = await requireAuth();
 28:   if (isAuthError(authResult)) return authResult;
 29:   try {
 30:     const body = await request.json();
 31:     const { dealIds } = body;
 32:     if (!Array.isArray(dealIds) || dealIds.length === 0) {
 33:       return NextResponse.json({ success: true, activities: {} });
 34:     }
 35:     const validIds = dealIds.filter((id) => /^\d+$/.test(String(id).trim()));
 36:     if (validIds.length === 0) {
 37:       return NextResponse.json({ success: true, activities: {} });
 38:     }
 39:     const activitiesMap: Record<string, { last?: ActivityData; next?: ActivityData; all: ActivityData[] }> = {};
 40:     // Initialize all requested IDs with empty arrays to prevent re-fetching empty deals
 41:     for (const id of validIds) {
 42:       activitiesMap[id] = { all: [] };
 43:     }
 44:     const batchSize = 50;
 45:     const limit = pLimit(5);
 46:     const batchPromises = [];
 47:     for (let i = 0; i < validIds.length; i += batchSize) {
 48:       const batchIds = validIds.slice(i, i + batchSize);
 49:       batchPromises.push(
 50:         limit(async () => {
 51:           try {
 52:             const data = await bitrixPost<{ result: ActivityData[] }>(
 53:               "crm.activity.list",
 54:               {
 55:                 FILTER: { OWNER_TYPE_ID: 2, "@OWNER_ID": batchIds },
 56:                 SELECT: ["ID", "OWNER_ID", "SUBJECT", "COMPLETED", "DESCRIPTION", "DEADLINE", "CREATED", "AUTHOR_ID", "RESPONSIBLE_ID", "TYPE_ID", "PROVIDER_ID", "PROVIDER_TYPE_ID"],
 57:                 ORDER: { CREATED: "DESC" },
 58:               }
 59:             );
 60:             if (Array.isArray(data.result)) {
 61:               for (const activity of data.result) {
 62:                 if (activitiesMap[activity.OWNER_ID]) {
 63:                   activitiesMap[activity.OWNER_ID].all.push(activity);
 64:                 }
 65:               }
 66:             }
 67:           } catch (error) {
 68:             console.error(`[Activities API] Failed to fetch activities batch:`, error);
 69:           }
 70:         })
 71:       );
 72:     }
 73:     // Wait for all batches to finish concurrently
 74:     await Promise.all(batchPromises);
 75:     // Process activities to find last completed and next planned
 76:     for (const dealId in activitiesMap) {
 77:       const dealActivities = activitiesMap[dealId].all;
 78:       // Sort by CREATED DESC (newest first)
 79:       dealActivities.sort((a, b) => new Date(b.CREATED).getTime() - new Date(a.CREATED).getTime());
 80:       // Find last completed
 81:       const lastCompleted = dealActivities.find(a => a.COMPLETED === "Y");
 82:       if (lastCompleted) {
 83:         activitiesMap[dealId].last = lastCompleted;
 84:       }
 85:       // Find next planned (sort by DEADLINE ASC - earliest first)
 86:       const plannedActivities = dealActivities.filter(a => a.COMPLETED === "N");
 87:       if (plannedActivities.length > 0) {
 88:         plannedActivities.sort((a, b) => {
 89:           const dateA = a.DEADLINE ? new Date(a.DEADLINE).getTime() : Infinity;
 90:           const dateB = b.DEADLINE ? new Date(b.DEADLINE).getTime() : Infinity;
 91:           return dateA - dateB;
 92:         });
 93:         activitiesMap[dealId].next = plannedActivities[0];
 94:       }
 95:     }
 96:     return NextResponse.json({ success: true, activities: activitiesMap });
 97:   } catch (error) {
 98:     console.error("[Activities API Error]", error);
 99:     return NextResponse.json(
100:       { success: false, error: "Failed to fetch activities", activities: {} },
101:       { status: 500 }
102:     );
103:   }
104: }
```

## File: src/app/api/bitrix/fields/route.ts
```typescript
  1: import { NextResponse } from "next/server";
  2: import { bitrixGet, isSystemField, type BitrixFieldsResponse, type BitrixField } from "@/lib/bitrix";
  3: import { requireAuth, isAuthError } from "@/lib/auth-guard";
  4: export const dynamic = "force-dynamic";
  5: export interface CleanField {
  6:   id: string;
  7:   title: string;
  8:   type: string;
  9:   isMultiple: boolean;
 10:   isSortable: boolean;
 11:   listValues?: Array<{ ID: string; VALUE: string }>;
 12: }
 13: /**
 14:  * Determine if a field type is sortable
 15:  */
 16: function isSortableType(type: string): boolean {
 17:   const sortableTypes = new Set([
 18:     "string",
 19:     "double",
 20:     "integer",
 21:     "date",
 22:     "datetime",
 23:     "money",
 24:     "enumeration",
 25:     "crm_status",
 26:     "crm_currency",
 27:     "crm_category",
 28:     "boolean",
 29:     "char",
 30:   ]);
 31:   return sortableTypes.has(type);
 32: }
 33: /**
 34:  * Extract human-readable title from Bitrix24 field metadata.
 35:  * Priority: formLabel > listLabel > filterLabel > title > fieldId
 36:  */
 37: function getFieldTitle(fieldId: string, meta: BitrixField): string {
 38:   if (fieldId === "ASSIGNED_BY_ID") return "Ответственный";
 39:   if (meta.formLabel) return meta.formLabel;
 40:   if (meta.listLabel) return meta.listLabel;
 41:   if (meta.filterLabel) return meta.filterLabel;
 42:   if (meta.title && meta.title !== fieldId) return meta.title;
 43:   return fieldId;
 44: }
 45: export async function GET() {
 46:   // ─── SECURITY: Require authentication ───
 47:   const authResult = await requireAuth();
 48:   if (isAuthError(authResult)) return authResult;
 49:   try {
 50:     const data = await bitrixGet<BitrixFieldsResponse>(
 51:       "crm.deal.fields"
 52:     );
 53:     const fields = data.result;
 54:     // Transform and filter: remove system junk, keep informative fields
 55:     const cleanFields: CleanField[] = [];
 56:     if (fields && typeof fields === "object") {
 57:       for (const [fieldId, fieldMeta] of Object.entries(fields)) {
 58:         // Skip system/internal fields
 59:         if (isSystemField(fieldId, fieldMeta as unknown as Record<string, unknown>)) continue;
 60:         const meta = fieldMeta as BitrixField;
 61:         const title = getFieldTitle(fieldId, meta);
 62:         // Extract list values from items[] (Bitrix24 real format)
 63:         let listValues: Array<{ ID: string; VALUE: string }> | undefined;
 64:         if (Array.isArray(meta.items) && meta.items.length > 0) {
 65:           listValues = meta.items.map((item) => ({
 66:             ID: item.ID,
 67:             VALUE: item.VALUE,
 68:           }));
 69:         }
 70:         cleanFields.push({
 71:           id: fieldId,
 72:           title,
 73:           type: meta.type || "string",
 74:           isMultiple: meta.isMultiple === true || meta.isMultiple === "Y",
 75:           isSortable: isSortableType(meta.type),
 76:           listValues,
 77:         });
 78:       }
 79:     }
 80:     // Fetch company fields to allow selecting company data in the deals table
 81:     try {
 82:       const companyData = await bitrixGet<BitrixFieldsResponse>("crm.company.fields");
 83:       const companyFields = companyData.result;
 84:       if (companyFields && typeof companyFields === "object") {
 85:         for (const [fieldId, fieldMeta] of Object.entries(companyFields)) {
 86:           if (isSystemField(fieldId, fieldMeta as unknown as Record<string, unknown>)) continue;
 87:           const meta = fieldMeta as BitrixField;
 88:           const title = getFieldTitle(fieldId, meta);
 89:           let listValues: Array<{ ID: string; VALUE: string }> | undefined;
 90:           if (Array.isArray(meta.items) && meta.items.length > 0) {
 91:             listValues = meta.items.map((item) => ({
 92:               ID: item.ID,
 93:               VALUE: item.VALUE,
 94:             }));
 95:           }
 96:           cleanFields.push({
 97:             id: `COMPANY_${fieldId}`,
 98:             title: `Компания: ${title}`,
 99:             type: meta.type || "string",
100:             isMultiple: meta.isMultiple === true || meta.isMultiple === "Y",
101:             isSortable: isSortableType(meta.type),
102:             listValues,
103:           });
104:         }
105:       }
106:     } catch (error) {
107:       console.warn("[Fields API] Failed to fetch company fields, continuing with deal fields only", error);
108:     }
109:     // Sort: standard fields first (alphabetically by title), then custom UF_CRM_* fields
110:     cleanFields.sort((a, b) => {
111:       const aIsCustom = a.id.startsWith("UF_CRM_") ? 1 : 0;
112:       const bIsCustom = b.id.startsWith("UF_CRM_") ? 1 : 0;
113:       if (aIsCustom !== bIsCustom) return aIsCustom - bIsCustom;
114:       return a.title.localeCompare(b.title, "ru");
115:     });
116:     // Inject virtual fields that are available in crm.deal.list but not in crm.deal.fields
117:     if (!cleanFields.some(f => f.id === "COMPANY_TITLE")) {
118:       cleanFields.unshift({
119:         id: "COMPANY_TITLE",
120:         title: "Наименование компании",
121:         type: "string",
122:         isMultiple: false,
123:         isSortable: true,
124:       });
125:     }
126:     // Inject virtual fields for activities
127:     cleanFields.push({
128:       id: "ACTIVITY_LAST",
129:       title: "Последнее дело",
130:       type: "string",
131:       isMultiple: false,
132:       isSortable: false,
133:     });
134:     cleanFields.push({
135:       id: "ACTIVITY_NEXT",
136:       title: "Следующий шаг",
137:       type: "string",
138:       isMultiple: false,
139:       isSortable: false,
140:     });
141:     return NextResponse.json({
142:       success: true,
143:       fields: cleanFields,
144:       total: cleanFields.length,
145:     });
146:   } catch (error) {
147:     console.error("[Fields API Error]", error);
148:     // Return sanitized error — don't expose internal details
149:     const message = error instanceof Error && error.message.includes("not configured")
150:       ? error.message
151:       : "Failed to fetch field metadata. Please try again later.";
152:     return NextResponse.json(
153:       {
154:         success: false,
155:         error: message,
156:         fields: [],
157:         total: 0,
158:       },
159:       { status: 500 }
160:     );
161:   }
162: }
```

## File: src/app/login/page.tsx
```typescript
  1: "use client";
  2: import { useState, useEffect } from "react";
  3: import { signIn, useSession } from "next-auth/react";
  4: import { useRouter } from "next/navigation";
  5: import { Eye, EyeOff, AlertCircle, Loader2 } from "lucide-react";
  6: import { IS_PRODUCTION } from "@/lib/config";
  7: /**
  8:  * Login Page — RusSilica BI Terminal
  9:  *
 10:  * Corporate Institutional Style
 11:  * Colors: Blue, Orange, Gray
 12:  */
 13: export default function LoginPage() {
 14:   const router = useRouter();
 15:   const { status } = useSession();
 16:   const [email, setEmail] = useState("");
 17:   const [password, setPassword] = useState("");
 18:   const [showPassword, setShowPassword] = useState(false);
 19:   const [error, setError] = useState("");
 20:   const [loading, setLoading] = useState(false);
 21:   // If already authenticated, redirect to dashboard
 22:   useEffect(() => {
 23:     if (status === "authenticated") {
 24:       router.replace("/");
 25:     }
 26:   }, [status, router]);
 27:   const handleSubmit = async (e: React.FormEvent) => {
 28:     e.preventDefault();
 29:     setError("");
 30:     setLoading(true);
 31:     try {
 32:       let authPassword = password;
 33:       // In production, we use Headless API to get the HMAC token first
 34:       if (IS_PRODUCTION) {
 35:         const wpRes = await fetch("/api/auth/wp-login", {
 36:           method: "POST",
 37:           headers: { "Content-Type": "application/json" },
 38:           body: JSON.stringify({ email, password }),
 39:           cache: "no-store",
 40:         });
 41:         const text = await wpRes.text();
 42:         let wpData;
 43:         try {
 44:           wpData = JSON.parse(text);
 45:         } catch (e) {
 46:           setError("Ошибка связи с сервером авторизации");
 47:           setLoading(false);
 48:           return;
 49:         }
 50:         if (!wpRes.ok || !wpData.success) {
 51:           setError(wpData.error || "Неверный email или пароль");
 52:           setLoading(false);
 53:           return;
 54:         }
 55:         // Use the HMAC token as the password for NextAuth
 56:         authPassword = wpData.token;
 57:       }
 58:       const result = await signIn("credentials", {
 59:         email,
 60:         password: authPassword,
 61:         redirect: false,
 62:       });
 63:       if (result?.error) {
 64:         if (result.error === "CredentialsSignin") {
 65:           setError("Неверный email или пароль");
 66:         } else {
 67:           setError(result.error);
 68:         }
 69:       } else {
 70:         router.push("/");
 71:         router.refresh();
 72:       }
 73:     } catch {
 74:       setError("Произошла ошибка при входе. Попробуйте позже.");
 75:     } finally {
 76:       setLoading(false);
 77:     }
 78:   };
 79:   return (
 80:     <div className="min-h-screen flex items-center justify-center bg-slate-50 p-4 font-sans">
 81:       <div className="w-full max-w-[400px]">
 82:         {/* Logo + Title */}
 83:         <div className="text-center mb-10">
 84:           <h1 className="text-3xl font-bold text-[#1A52A3] tracking-tight mb-1">
 85:             RusSilica
 86:           </h1>
 87:           <p className="text-sm font-medium text-slate-500 uppercase tracking-widest">
 88:             Корпоративный BI Terminal
 89:           </p>
 90:         </div>
 91:         {/* Login Card */}
 92:         <div className="bg-white rounded-xl p-8 shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-slate-100">
 93:           <form onSubmit={handleSubmit} className="space-y-6">
 94:             {/* Error message */}
 95:             {error && (
 96:               <div className="flex items-start gap-2.5 px-4 py-3 rounded-lg bg-red-50 border border-red-100 text-sm text-red-600 animate-fade-in">
 97:                 <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
 98:                 <span className="leading-snug">{error}</span>
 99:               </div>
100:             )}
101:             {/* Email field */}
102:             <div className="space-y-2">
103:               <label htmlFor="email" className="block text-xs font-semibold text-slate-600 uppercase tracking-wider">
104:                 Корпоративный Email
105:               </label>
106:               <input
107:                 id="email"
108:                 type="email"
109:                 value={email}
110:                 onChange={(e) => setEmail(e.target.value)}
111:                 placeholder="имя@russilica.ru"
112:                 required
113:                 autoComplete="email"
114:                 autoFocus
115:                 maxLength={254}
116:                 className="w-full h-12 px-4 rounded-lg bg-slate-50 border border-slate-200 text-slate-900 placeholder:text-slate-400 text-sm focus:outline-none focus:ring-2 focus:ring-[#1A52A3]/20 focus:border-[#1A52A3] transition-all"
117:               />
118:             </div>
119:             {/* Password field */}
120:             <div className="space-y-2">
121:               <div className="flex items-center justify-between">
122:                 <label htmlFor="password" className="block text-xs font-semibold text-slate-600 uppercase tracking-wider">
123:                   Пароль
124:                 </label>
125:                 {!IS_PRODUCTION && (
126:                   <span className="text-[10px] font-medium text-amber-500 bg-amber-50 px-1.5 py-0.5 rounded">
127:                     DEV MODE
128:                   </span>
129:                 )}
130:               </div>
131:               <div className="relative">
132:                 <input
133:                   id="password"
134:                   type={showPassword ? "text" : "password"}
135:                   value={password}
136:                   onChange={(e) => setPassword(e.target.value)}
137:                   placeholder="Введите пароль"
138:                   required
139:                   autoComplete="current-password"
140:                   maxLength={128}
141:                   className="w-full h-12 px-4 pr-11 rounded-lg bg-slate-50 border border-slate-200 text-slate-900 placeholder:text-slate-400 text-sm focus:outline-none focus:ring-2 focus:ring-[#1A52A3]/20 focus:border-[#1A52A3] transition-all"
142:                 />
143:                 <button
144:                   type="button"
145:                   onClick={() => setShowPassword(!showPassword)}
146:                   className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors p-1"
147:                   tabIndex={-1}
148:                   aria-label={showPassword ? "Скрыть пароль" : "Показать пароль"}
149:                 >
150:                   {showPassword ? (
151:                     <EyeOff className="h-4 w-4" />
152:                   ) : (
153:                     <Eye className="h-4 w-4" />
154:                   )}
155:                 </button>
156:               </div>
157:             </div>
158:             {/* Submit button */}
159:             <button
160:               type="submit"
161:               disabled={loading || !email || !password}
162:               className="w-full h-12 mt-2 rounded-lg bg-[#FF7A1F] hover:bg-[#E86E15] text-white font-semibold text-sm transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-sm active:scale-[0.99]"
163:             >
164:               {loading ? (
165:                 <span className="flex items-center justify-center gap-2">
166:                   <Loader2 className="h-4 w-4 animate-spin" />
167:                   Вход в систему...
168:                 </span>
169:               ) : (
170:                 "Войти"
171:               )}
172:             </button>
173:           </form>
174:         </div>
175:         {/* Footer info */}
176:         <div className="text-center mt-8 space-y-1">
177:           <p className="text-xs text-slate-400">
178:             Доступ разрешен только авторизованным сотрудникам
179:           </p>
180:           <p className="text-[11px] text-slate-400/70">
181:             © {new Date().getFullYear()} RusSilica
182:           </p>
183:         </div>
184:       </div>
185:     </div>
186:   );
187: }
```

## File: src/app/layout.tsx
```typescript
 1: import type { Metadata } from "next";
 2: import { Roboto, Nunito, Roboto_Mono } from "next/font/google";
 3: import "./globals.css";
 4: import { Toaster } from "@/components/ui/toaster";
 5: import { ThemeProvider } from "@/components/dashboard/theme-provider";
 6: import { AuthProvider } from "@/components/auth/auth-provider";
 7: import { ErrorBoundary } from "@/components/error-boundary";
 8: import { EntityDrawer } from "@/components/dashboard/entity-drawer";
 9: const roboto = Roboto({
10:   weight: ["400", "500", "700"],
11:   subsets: ["latin", "cyrillic"],
12:   variable: "--font-roboto",
13: });
14: const nunito = Nunito({
15:   weight: ["400", "500", "600", "700"],
16:   subsets: ["latin", "cyrillic"],
17:   variable: "--font-nunito",
18: });
19: const robotoMono = Roboto_Mono({
20:   weight: ["400", "500"],
21:   subsets: ["latin", "cyrillic"],
22:   variable: "--font-roboto-mono",
23: });
24: export const metadata: Metadata = {
25:   title: "Корпоративный BI-терминал RusSilica | CRM-аналитика в реальном времени",
26:   description:
27:     "BI-терминал RusSilica — аналитика продаж Bitrix24 в реальном времени: сделки, фильтры, воронки, ответственные, KPI-карточки и экспорт таблиц.",
28:   robots: {
29:     index: false,
30:     follow: false,
31:     googleBot: {
32:       index: false,
33:       follow: false,
34:       noimageindex: true,
35:       "max-video-preview": -1,
36:       "max-image-preview": "none",
37:       "max-snippet": -1,
38:     },
39:   },
40: };
41: export default function RootLayout({
42:   children,
43: }: Readonly<{
44:   children: React.ReactNode;
45: }>) {
46:   return (
47:     <html lang="ru" suppressHydrationWarning>
48:       <body
49:         className={`${roboto.variable} ${nunito.variable} ${robotoMono.variable} font-sans antialiased bg-background text-foreground`}
50:       >
51:         <AuthProvider>
52:           <ErrorBoundary>
53:             <ThemeProvider
54:               attribute="class"
55:               defaultTheme="light"
56:               enableSystem={false}
57:               storageKey="bitrix-bi-theme"
58:             >
59:               {children}
60:               <Toaster />
61:               <EntityDrawer />
62:             </ThemeProvider>
63:           </ErrorBoundary>
64:         </AuthProvider>
65:       </body>
66:     </html>
67:   );
68: }
```

## File: src/components/dashboard/alerts-bell.tsx
```typescript
  1: "use client";
  2: import { useDashboardStore } from "@/store/dashboard-store";
  3: import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
  4: import { Badge } from "@/components/ui/badge";
  5: import {
  6:   Bell,
  7:   Clock,
  8:   AlertTriangle,
  9:   TrendingDown,
 10:   FileWarning,
 11:   TrendingUp,
 12:   CheckCheck,
 13: } from "lucide-react";
 14: import { useMemo, useState } from "react";
 15: import {
 16:   DEAL_STAGES,
 17:   ALERT_THRESHOLDS,
 18: } from "@/lib/crm-constants";
 19: interface AlertItem {
 20:   id: string;
 21:   icon: React.ElementType;
 22:   title: string;
 23:   description: string;
 24:   severity: "destructive" | "warning" | "info" | "success";
 25:   count: number;
 26:   pipelineValue?: string;
 27: }
 28: const severityStyles: Record<string, { border: string; icon: string; bg: string }> = {
 29:   destructive: {
 30:     border: "border-l-red-500",
 31:     icon: "text-red-500",
 32:     bg: "bg-red-50 dark:bg-red-950/30",
 33:   },
 34:   warning: {
 35:     border: "border-l-amber-500",
 36:     icon: "text-amber-500",
 37:     bg: "bg-amber-50 dark:bg-amber-950/30",
 38:   },
 39:   info: {
 40:     border: "border-l-blue-500",
 41:     icon: "text-blue-500",
 42:     bg: "bg-blue-50 dark:bg-blue-950/30",
 43:   },
 44:   success: {
 45:     border: "border-l-emerald-500",
 46:     icon: "text-emerald-500",
 47:     bg: "bg-emerald-50 dark:bg-emerald-950/30",
 48:   },
 49: };
 50: export function AlertsBell() {
 51:   const { allDeals, setPipelineFilter, lastReadAlertsAt, lastSyncAt, markAlertsAsRead } = useDashboardStore();
 52:   const [open, setOpen] = useState(false);
 53:   const alerts = useMemo<AlertItem[]>(() => {
 54:     const now = new Date();
 55:     const result: AlertItem[] = [];
 56:     // 1. Stalled Deals
 57:     const thirtyDaysAgo = new Date(now.getTime() - ALERT_THRESHOLDS.STALLED_DEAL_DAYS * 24 * 60 * 60 * 1000);
 58:     const stalledDeals = allDeals.filter((deal) => {
 59:       const stage = String(deal.STAGE_ID || "");
 60:       if (stage === DEAL_STAGES.WON || stage === DEAL_STAGES.LOST) return false;
 61:       const modifyStr = String(deal.DATE_MODIFY || "");
 62:       if (!modifyStr) return false;
 63:       const modifyDate = new Date(modifyStr);
 64:       if (isNaN(modifyDate.getTime())) return false;
 65:       return modifyDate < thirtyDaysAgo;
 66:     });
 67:     if (stalledDeals.length > 0) {
 68:       result.push({
 69:         id: "stalled",
 70:         icon: Clock,
 71:         title: "Зависшие сделки",
 72:         description: `${stalledDeals.length} сделок без движения более ${ALERT_THRESHOLDS.STALLED_DEAL_DAYS} дней — требуется внимание менеджера`,
 73:         severity: "warning",
 74:         count: stalledDeals.length,
 75:         pipelineValue: "in_work",
 76:       });
 77:     }
 78:     // 2. Unpaid Large Deals
 79:     const unpaidLarge = allDeals.filter((deal) => {
 80:       const stage = String(deal.STAGE_ID || "");
 81:       if (stage !== DEAL_STAGES.INVOICE_SENT) return false;
 82:       const opportunity = parseFloat(String(deal.OPPORTUNITY || "0"));
 83:       return opportunity > ALERT_THRESHOLDS.LARGE_DEAL_MIN_AMOUNT;
 84:     });
 85:     if (unpaidLarge.length > 0) {
 86:       const totalUnpaid = unpaidLarge.reduce(
 87:         (sum, d) => sum + parseFloat(String(d.OPPORTUNITY || "0")),
 88:         0
 89:       );
 90:       result.push({
 91:         id: "unpaid-large",
 92:         icon: AlertTriangle,
 93:         title: "Неоплаченные крупные сделки",
 94:         description: `${unpaidLarge.length} неоплаченных сделок на сумму ${Math.round(totalUnpaid).toLocaleString("ru-RU")} \u20BD`,
 95:         severity: "destructive",
 96:         count: unpaidLarge.length,
 97:         pipelineValue: "in_work",
 98:       });
 99:     }
100:     // 3. Win Rate Drop
101:     const wonDeals = allDeals.filter((d) => String(d.STAGE_ID) === DEAL_STAGES.WON);
102:     const lostDeals = allDeals.filter((d) => String(d.STAGE_ID) === DEAL_STAGES.LOST);
103:     const totalClosed = wonDeals.length + lostDeals.length;
104:     if (totalClosed >= ALERT_THRESHOLDS.MIN_CLOSED_DEALS_FOR_WIN_RATE) {
105:       const winRate = (wonDeals.length / totalClosed) * 100;
106:       if (winRate < ALERT_THRESHOLDS.WIN_RATE_WARNING_THRESHOLD) {
107:         result.push({
108:           id: "winrate",
109:           icon: TrendingDown,
110:           title: "Снижение Win Rate",
111:           description: `Win Rate упал до ${winRate.toFixed(1)}% — ниже нормы для промышленных продаж`,
112:           severity: "warning",
113:           count: 1,
114:           pipelineValue: DEAL_STAGES.WON,
115:         });
116:       }
117:     }
118:     // 4. Large Deals Stuck in Negotiation
119:     const fourteenDaysAgo = new Date(now.getTime() - ALERT_THRESHOLDS.STUCK_NEGOTIATION_DAYS * 24 * 60 * 60 * 1000);
120:     const stuckLarge = allDeals.filter((deal) => {
121:       const opportunity = parseFloat(String(deal.OPPORTUNITY || "0"));
122:       if (opportunity <= ALERT_THRESHOLDS.STUCK_LARGE_DEAL_MIN_AMOUNT) return false;
123:       const stage = String(deal.STAGE_ID || "");
124:       if (stage !== DEAL_STAGES.PREPARATION && stage !== DEAL_STAGES.INVOICE_SENT) return false;
125:       const modifyStr = String(deal.DATE_MODIFY || "");
126:       if (!modifyStr) return false;
127:       const modifyDate = new Date(modifyStr);
128:       if (isNaN(modifyDate.getTime())) return false;
129:       return modifyDate < fourteenDaysAgo;
130:     });
131:     if (stuckLarge.length > 0) {
132:       const totalStuck = stuckLarge.reduce(
133:         (sum, d) => sum + parseFloat(String(d.OPPORTUNITY || "0")),
134:         0
135:       );
136:       result.push({
137:         id: "stuck-large",
138:         icon: FileWarning,
139:         title: "Крупные сделки на согласовании",
140:         description: `${stuckLarge.length} крупных сделок (${Math.round(totalStuck).toLocaleString("ru-RU")} \u20BD) на согласовании более 14 дней`,
141:         severity: "info",
142:         count: stuckLarge.length,
143:         pipelineValue: "in_work",
144:       });
145:     }
146:     // 5. New Deals This Week
147:     const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
148:     const newThisWeek = allDeals.filter((deal) => {
149:       const createStr = String(deal.DATE_CREATE || "");
150:       if (!createStr) return false;
151:       const createDate = new Date(createStr);
152:       if (isNaN(createDate.getTime())) return false;
153:       return createDate >= sevenDaysAgo;
154:     });
155:     if (newThisWeek.length > 0) {
156:       const totalNew = newThisWeek.reduce(
157:         (sum, d) => sum + parseFloat(String(d.OPPORTUNITY || "0")),
158:         0
159:       );
160:       result.push({
161:         id: "new-week",
162:         icon: TrendingUp,
163:         title: "Новые сделки за неделю",
164:         description: `${newThisWeek.length} новых сделок за неделю на сумму ${Math.round(totalNew).toLocaleString("ru-RU")} \u20BD`,
165:         severity: "success",
166:         count: newThisWeek.length,
167:       });
168:     }
169:     return result;
170:   }, [allDeals]);
171:   // The badge count is now the number of alert categories, not the sum of deals
172:   const categoriesCount = alerts.length;
173:   // Show badge if there are alerts AND they haven't been read since the last sync
174:   const hasUnreadAlerts = categoriesCount > 0 && (!lastReadAlertsAt || (lastSyncAt && lastSyncAt > lastReadAlertsAt));
175:   const handleAlertClick = (alert: AlertItem) => {
176:     if (alert.pipelineValue) {
177:       setPipelineFilter(alert.pipelineValue);
178:     }
179:     setOpen(false);
180:   };
181:   const handleMarkAsRead = () => {
182:     markAlertsAsRead();
183:     setOpen(false);
184:   };
185:   return (
186:     <Popover open={open} onOpenChange={setOpen}>
187:       <PopoverTrigger asChild>
188:         <button
189:           className="relative h-7 w-7 flex items-center justify-center rounded text-white/70 hover:text-white hover:bg-white/10 transition-colors"
190:           aria-label="Уведомления"
191:         >
192:           <Bell className="h-3.5 w-3.5" />
193:           {hasUnreadAlerts && (
194:             <Badge className="absolute -top-1 -right-1 h-4 min-w-4 px-1 text-[9px] font-bold rounded-full bg-red-500 text-white border-0 p-0 flex items-center justify-center">
195:               {categoriesCount}
196:             </Badge>
197:           )}
198:         </button>
199:       </PopoverTrigger>
200:       <PopoverContent
201:         align="end"
202:         className="w-80 p-0 shadow-lg border-border"
203:       >
204:         {/* Header */}
205:         <div className="flex items-center justify-between px-3 py-2.5 border-b border-border">
206:           <span className="text-sm font-semibold text-foreground">Уведомления</span>
207:           {categoriesCount > 0 && (
208:             <Badge variant="secondary" className="text-[10px] h-5 rounded-sm font-medium">
209:               {categoriesCount}
210:             </Badge>
211:           )}
212:         </div>
213:         {/* Alert list */}
214:         <div className="max-h-80 overflow-y-auto custom-scrollbar">
215:           {alerts.length === 0 ? (
216:             <div className="px-4 py-8 text-center text-sm text-muted-foreground">
217:               Нет уведомлений
218:             </div>
219:           ) : (
220:             <div className="py-1">
221:               {alerts.map((alert) => {
222:                 const Icon = alert.icon;
223:                 const style = severityStyles[alert.severity];
224:                 return (
225:                   <button
226:                     key={alert.id}
227:                     onClick={() => handleAlertClick(alert)}
228:                     className={`w-full text-left px-3 py-2.5 border-l-[3px] ${style.border} ${style.bg} hover:opacity-80 transition-opacity cursor-pointer`}
229:                   >
230:                     <div className="flex items-start gap-2.5">
231:                       <Icon className={`h-4 w-4 mt-0.5 shrink-0 ${style.icon}`} />
232:                       <div className="flex-1 min-w-0">
233:                         <div className="flex items-center gap-1.5">
234:                           <span className="text-xs font-semibold text-foreground">
235:                             {alert.title}
236:                           </span>
237:                           <Badge
238:                             variant="secondary"
239:                             className="text-[9px] h-4 min-w-4 px-1 rounded-sm font-bold"
240:                           >
241:                             {alert.count}
242:                           </Badge>
243:                         </div>
244:                         <p className="text-[11px] text-muted-foreground mt-0.5 leading-snug">
245:                           {alert.description}
246:                         </p>
247:                       </div>
248:                     </div>
249:                   </button>
250:                 );
251:               })}
252:             </div>
253:           )}
254:         </div>
255:         {/* Footer */}
256:         {alerts.length > 0 && (
257:           <div className="border-t border-border px-3 py-2">
258:             <button
259:               onClick={handleMarkAsRead}
260:               className="flex items-center justify-center gap-1.5 w-full text-[11px] font-medium text-muted-foreground hover:text-foreground transition-colors py-1"
261:             >
262:               <CheckCheck className="h-3.5 w-3.5" />
263:               Отметить все прочитанными
264:             </button>
265:           </div>
266:         )}
267:       </PopoverContent>
268:     </Popover>
269:   );
270: }
```

## File: src/components/dashboard/stats-cards.tsx
```typescript
  1: "use client";
  2: import { useDashboardStore } from "@/store/dashboard-store";
  3: import { Card, CardContent } from "@/components/ui/card";
  4: import { TrendingUp, RussianRuble, Hash, Clock, ArrowUpRight, ArrowDownRight } from "lucide-react";
  5: import { useMemo } from "react";
  6: export function StatsCards() {
  7:   const { deals, allDeals, dealsLoading, dateFilter, pipelineFilter, responsibleFilter } = useDashboardStore();
  8:   const stats = useMemo(() => {
  9:     if (deals.length === 0) return null;
 10:     const totalDeals = deals.length;
 11:     // Sum opportunity
 12:     const totalOpportunity = deals.reduce((sum, deal) => {
 13:       const val = parseFloat(String(deal.OPPORTUNITY || "0"));
 14:       return sum + (isNaN(val) ? 0 : val);
 15:     }, 0);
 16:     // Average deal (calculated only on deals with non-zero opportunity for mathematical accuracy)
 17:     const dealsWithValue = deals.filter(d => parseFloat(String(d.OPPORTUNITY || "0")) > 0);
 18:     const avgDeal = dealsWithValue.length > 0 ? totalOpportunity / dealsWithValue.length : 0;
 19:     // Won/lost deals — Win Rate is calculated as percentage of won deals out of total closed deals
 20:     const wonDeals = deals.filter((deal) => {
 21:       const stage = String(deal.STAGE_ID || "");
 22:       return stage === "WON";
 23:     }).length;
 24:     const lostDeals = deals.filter((deal) => {
 25:       const stage = String(deal.STAGE_ID || "");
 26:       return stage === "LOSE";
 27:     }).length;
 28:     const totalClosed = wonDeals + lostDeals;
 29:     const winRate = totalClosed > 0 ? (wonDeals / totalClosed) * 100 : 0;
 30:     // Currency
 31:     const currency = deals[0]?.CURRENCY_ID || deals[0]?.CURRENCY || "RUB";
 32:     // ─── Dynamic "New Deals" Calculation ───
 33:     let periodTitle = "За период";
 34:     if (dateFilter.preset === "all") {
 35:       periodTitle = "За всё время";
 36:     } else {
 37:       const now = new Date();
 38:       let days = 7;
 39:       let currentStart: Date;
 40:       let currentEnd: Date;
 41:       if (dateFilter.preset === "custom" && dateFilter.customFrom && dateFilter.customTo) {
 42:         currentStart = new Date(dateFilter.customFrom);
 43:         currentEnd = new Date(dateFilter.customTo);
 44:         days = Math.round((currentEnd.getTime() - currentStart.getTime()) / (1000 * 60 * 60 * 24));
 45:         if (days === 0) days = 1; // Prevent division by zero if same day selected
 46:       } else {
 47:         if (dateFilter.preset === "14days") days = 14;
 48:         else if (dateFilter.preset === "30days") days = 30;
 49:         else if (dateFilter.preset === "90days") days = 90;
 50:       }
 51:       periodTitle = `За ${days} ${getDaysWord(days)}`;
 52:     }
 53:     return {
 54:       totalDeals,
 55:       totalOpportunity,
 56:       avgDeal,
 57:       winRate,
 58:       currency: String(currency),
 59:       periodTitle,
 60:     };
 61:   }, [deals, dateFilter]);
 62:   if (!stats || deals.length === 0) return null;
 63:   const cards = [
 64:     {
 65:       title: "Всего сделок",
 66:       value: stats.totalDeals.toLocaleString("ru-RU"),
 67:       subtitle: `Win Rate: ${stats.winRate.toFixed(0)}%`,
 68:       icon: Hash,
 69:       accentBar: "stat-accent-bar-blue",
 70:       iconColor: "text-brand-blue",
 71:       iconBg: "bg-brand-blue/8 dark:bg-brand-blue/15",
 72:     },
 73:     {
 74:       title: "Общая сумма",
 75:       value: formatMoney(stats.totalOpportunity, stats.currency),
 76:       subtitle: "за выбранный период", // Neutral text replacing duplicate currency
 77:       icon: RussianRuble, // Changed from DollarSign to RussianRuble
 78:       accentBar: "stat-accent-bar-green",
 79:       iconColor: "text-emerald-600 dark:text-emerald-400",
 80:       iconBg: "bg-emerald-50 dark:bg-emerald-900/25",
 81:     },
 82:     {
 83:       title: "Средняя сделка",
 84:       value: formatMoney(stats.avgDeal, stats.currency),
 85:       subtitle: "на сделку",
 86:       icon: TrendingUp,
 87:       accentBar: "stat-accent-bar-orange",
 88:       iconColor: "text-brand-orange",
 89:       iconBg: "bg-brand-orange/8 dark:bg-brand-orange/15",
 90:     },
 91:     {
 92:       title: stats.periodTitle, // Dynamic title based on global filter
 93:       value: stats.totalDeals.toLocaleString("ru-RU"), // New deals in current period = total deals in current period
 94:       subtitle: "новые",
 95:       icon: Clock,
 96:       accentBar: "stat-accent-bar-violet",
 97:       iconColor: "text-violet-600 dark:text-violet-400",
 98:       iconBg: "bg-violet-50 dark:bg-violet-900/25",
 99:     },
100:   ];
101:   return (
102:     <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 px-4 sm:px-6 py-4 animate-fade-in">
103:       {cards.map((card) => (
104:         <Card
105:           key={card.title}
106:           className={`rounded-md border-border shadow-sm hover:shadow-md transition-all duration-200 stat-accent-bar ${card.accentBar} group`}
107:         >
108:           <CardContent className="p-4">
109:             <div className="flex items-start gap-3">
110:               <div className={`p-2 rounded-md ${card.iconBg} mt-0.5 group-hover:scale-105 transition-transform`}>
111:                 <card.icon className={`h-4 w-4 ${card.iconColor}`} />
112:               </div>
113:               <div className="min-w-0 flex-1">
114:                 <p className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wider mb-1">
115:                   {card.title}
116:                 </p>
117:                 <p className="text-xl font-bold truncate tabular-nums leading-none">
118:                   {dealsLoading ? (
119:                     <span className="inline-block w-20 h-6 bg-muted rounded animate-pulse" />
120:                   ) : (
121:                     card.value
122:                   )}
123:                 </p>
124:                 <p className="text-[11px] text-muted-foreground mt-1 font-medium">
125:                   {card.subtitle}
126:                 </p>
127:               </div>
128:             </div>
129:           </CardContent>
130:         </Card>
131:       ))}
132:     </div>
133:   );
134: }
135: function formatMoney(value: number, currency: string): string {
136:   return value.toLocaleString("ru-RU", {
137:     minimumFractionDigits: 0,
138:     maximumFractionDigits: 0,
139:   }) + " " + currency;
140: }
141: function getDaysWord(days: number): string {
142:   const lastDigit = days % 10;
143:   const lastTwoDigits = days % 100;
144:   if (lastTwoDigits >= 11 && lastTwoDigits <= 19) return "дней";
145:   if (lastDigit === 1) return "день";
146:   if (lastDigit >= 2 && lastDigit <= 4) return "дня";
147:   return "дней";
148: }
```

## File: src/lib/export-utils.ts
```typescript
 1: import ExcelJS from "exceljs";
 2: /**
 3:  * Export deals data to Excel (.xlsx) file.
 4:  * WYSIWYG export: exports exactly what is displayed in the table (filtered, sorted, resolved).
 5:  */
 6: export async function exportToExcelWysiwyg(
 7:   data: string[][],
 8:   columns: string[]
 9: ): Promise<void> {
10:   if (data.length === 0 || columns.length === 0) return;
11:   const workbook = new ExcelJS.Workbook();
12:   const worksheet = workbook.addWorksheet("Сделки");
13:   // Add headers
14:   worksheet.addRow(columns);
15:   // Add data
16:   data.forEach((row) => {
17:     worksheet.addRow(row);
18:   });
19:   // Auto-size columns
20:   worksheet.columns.forEach((column, idx) => {
21:     const maxLen = Math.max(
22:       columns[idx].length,
23:       ...data.slice(0, 100).map((row) => String(row[idx] || "").length)
24:     );
25:     column.width = Math.min(Math.max(maxLen + 2, 10), 60);
26:   });
27:   // Generate and download
28:   const buffer = await workbook.xlsx.writeBuffer();
29:   const blob = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
30:   const url = window.URL.createObjectURL(blob);
31:   const a = document.createElement("a");
32:   a.href = url;
33:   const now = new Date();
34:   const dateStr = now.toISOString().slice(0, 10);
35:   a.download = `russilica_deals_${dateStr}.xlsx`;
36:   a.click();
37:   window.URL.revokeObjectURL(url);
38: }
```

## File: src/app/api/bitrix/companies/route.ts
```typescript
  1: import { NextRequest, NextResponse } from "next/server";
  2: import { bitrixPost } from "@/lib/bitrix";
  3: import { requireAuth, isAuthError } from "@/lib/auth-guard";
  4: export const dynamic = "force-dynamic";
  5: type CompanyRecord = Record<string, any>;
  6: const BATCH_SIZE = 50;
  7: const FALLBACK_GET_CONCURRENCY = 5;
  8: function normalizeIds(ids: unknown): string[] {
  9:   if (!Array.isArray(ids)) return [];
 10:   return [...new Set(
 11:     ids
 12:       .map((id) => String(id).trim())
 13:       .filter((id) => /^\d+$/.test(id) && id !== "0")
 14:   )];
 15: }
 16: function normalizeSelect(select: unknown): string[] {
 17:   const safe: string[] = ["ID", "TITLE"];
 18:   if (!Array.isArray(select)) return safe;
 19:   for (const item of select) {
 20:     if (typeof item !== "string") continue;
 21:     if (!/^[a-zA-Z0-9_]+$/.test(item)) continue;
 22:     safe.push(item);
 23:   }
 24:   return [...new Set(safe)];
 25: }
 26: function normalizeCompany(company: CompanyRecord, fallbackId: string): CompanyRecord {
 27:   const id = String(company?.ID ?? fallbackId);
 28:   const title = String(company?.TITLE ?? "").trim();
 29:   return {
 30:     ...company,
 31:     ID: id,
 32:     TITLE: title,
 33:   };
 34: }
 35: async function fetchCompanyById(id: string, select: string[]): Promise<CompanyRecord | null> {
 36:   try {
 37:     const data = await bitrixPost<{ result?: CompanyRecord } | CompanyRecord>(
 38:       "crm.company.get",
 39:       { ID: id, SELECT: select }
 40:     );
 41:     const result = (data as { result?: CompanyRecord }).result ?? (data as CompanyRecord);
 42:     if (!result || typeof result !== "object") return null;
 43:     return normalizeCompany(result, id);
 44:   } catch (error) {
 45:     console.error(`[Companies API] crm.company.get failed for ID=${id}:`, error);
 46:     return null;
 47:   }
 48: }
 49: export async function POST(request: NextRequest) {
 50:   const authResult = await requireAuth();
 51:   if (isAuthError(authResult)) return authResult;
 52:   try {
 53:     const body = await request.json().catch(() => ({}));
 54:     const ids = normalizeIds(body?.ids);
 55:     const select = normalizeSelect(body?.select);
 56:     if (ids.length === 0) {
 57:       return NextResponse.json({ success: true, companies: {} });
 58:     }
 59:     const companiesMap: Record<string, CompanyRecord> = {};
 60:     for (const id of ids) {
 61:       companiesMap[id] = { ID: id, TITLE: "" };
 62:     }
 63:     // 1) Batch list lookup
 64:     for (let i = 0; i < ids.length; i += BATCH_SIZE) {
 65:       const batchIds = ids.slice(i, i + BATCH_SIZE);
 66:       try {
 67:         const data = await bitrixPost<{ result?: CompanyRecord[] }>(
 68:           "crm.company.list",
 69:           {
 70:             // The "@ID" operator is a Bitrix-specific filter operator that matches multiple values (equivalent to SQL IN (...))
 71:             // Note: Bitrix limits @ID arrays to 50-100 items per call. We chunk at BATCH_SIZE (50) to stay within limits.
 72:             FILTER: { "@ID": batchIds },
 73:             SELECT: select,
 74:           }
 75:         );
 76:         console.log("[Companies API] crm.company.list data:", JSON.stringify(data).substring(0, 500));
 77:         if (Array.isArray(data.result)) {
 78:           for (const company of data.result) {
 79:             const normalized = normalizeCompany(company, String(company?.ID ?? ""));
 80:             companiesMap[normalized.ID] = {
 81:               ...companiesMap[normalized.ID],
 82:               ...normalized,
 83:             };
 84:           }
 85:         }
 86:       } catch (error) {
 87:         console.error(`[Companies API] Failed to fetch batch`, { batchIds, error });
 88:       }
 89:     }
 90:     // 2) Fallback per-ID get for unresolved titles
 91:     const unresolvedIds = ids.filter((id) => !String(companiesMap[id]?.TITLE || "").trim());
 92:     for (let i = 0; i < unresolvedIds.length; i += FALLBACK_GET_CONCURRENCY) {
 93:       const chunk = unresolvedIds.slice(i, i + FALLBACK_GET_CONCURRENCY);
 94:       const results = await Promise.allSettled(
 95:         chunk.map((id) => fetchCompanyById(id, select))
 96:       );
 97:       for (let j = 0; j < results.length; j++) {
 98:         const id = chunk[j];
 99:         const res = results[j];
100:         if (res.status === "fulfilled" && res.value) {
101:           companiesMap[id] = {
102:             ...companiesMap[id],
103:             ...res.value,
104:           };
105:         }
106:       }
107:     }
108:     // 3) Final normalization: never return undefined TITLE
109:     for (const id of ids) {
110:       companiesMap[id] = normalizeCompany(companiesMap[id] || {}, id);
111:     }
112:     return NextResponse.json({ success: true, companies: companiesMap });
113:   } catch (error) {
114:     console.error("[Companies API Error]", error);
115:     const message =
116:       error instanceof Error && error.message.includes("not configured")
117:         ? error.message
118:         : "Failed to fetch companies.";
119:     return NextResponse.json(
120:       { success: false, error: message, companies: {} },
121:       { status: 500 }
122:     );
123:   }
124: }
```

## File: src/components/dashboard/column-selector.tsx
```typescript
  1: "use client";
  2: import { useDashboardStore, type FieldInfo, DEFAULT_COLUMNS } from "@/store/dashboard-store";
  3: import {
  4:   Sheet,
  5:   SheetContent,
  6:   SheetHeader,
  7:   SheetTitle,
  8:   SheetDescription,
  9: } from "@/components/ui/sheet";
 10: import { ScrollArea } from "@/components/ui/scroll-area";
 11: import { Checkbox } from "@/components/ui/checkbox";
 12: import { Badge } from "@/components/ui/badge";
 13: import { Button } from "@/components/ui/button";
 14: import { Input } from "@/components/ui/input";
 15: import { Separator } from "@/components/ui/separator";
 16: import { Columns3, Search, RotateCcw, Check, X, GripVertical } from "lucide-react";
 17: import { useState, useMemo } from "react";
 18: import {
 19:   DndContext,
 20:   closestCenter,
 21:   KeyboardSensor,
 22:   PointerSensor,
 23:   useSensor,
 24:   useSensors,
 25:   DragEndEvent,
 26: } from "@dnd-kit/core";
 27: import {
 28:   SortableContext,
 29:   sortableKeyboardCoordinates,
 30:   verticalListSortingStrategy,
 31:   useSortable,
 32: } from "@dnd-kit/sortable";
 33: import { CSS } from "@dnd-kit/utilities";
 34: export function ColumnSelector() {
 35:   const { fields, selectedColumns, toggleColumn, setSelectedColumns, reorderColumns, columnSelectorOpen, setColumnSelectorOpen } =
 36:     useDashboardStore();
 37:   const [search, setSearch] = useState("");
 38:   const sensors = useSensors(
 39:     useSensor(PointerSensor, {
 40:       activationConstraint: {
 41:         distance: 5, // 5px movement required before dragging starts
 42:       },
 43:     }),
 44:     useSensor(KeyboardSensor, {
 45:       coordinateGetter: sortableKeyboardCoordinates,
 46:     })
 47:   );
 48:   const filteredFields = useMemo(() => {
 49:     if (!search.trim()) return fields;
 50:     const q = search.toLowerCase();
 51:     return fields.filter(
 52:       (f) =>
 53:         f.title.toLowerCase().includes(q) ||
 54:         f.id.toLowerCase().includes(q)
 55:     );
 56:   }, [fields, search]);
 57:   const selectedCount = selectedColumns.length;
 58:   const handleSelectAll = () => {
 59:     setSelectedColumns(filteredFields.map((f) => f.id));
 60:   };
 61:   const handleDeselectAll = () => {
 62:     // Keep at least the first available field to avoid empty table
 63:     if (filteredFields.length > 0) {
 64:       setSelectedColumns([filteredFields[0].id]);
 65:     }
 66:   };
 67:   const handleReset = () => {
 68:     const availableDefaults = DEFAULT_COLUMNS.filter((col) =>
 69:       fields.some((f) => f.id === col)
 70:     ) as string[];
 71:     const otherFields = fields
 72:       .map((f) => f.id)
 73:       .filter((id) => !availableDefaults.includes(id));
 74:     if (availableDefaults.length === 0 && otherFields.length > 0) {
 75:       setSelectedColumns(otherFields);
 76:     } else {
 77:       setSelectedColumns([...availableDefaults, ...otherFields]);
 78:     }
 79:   };
 80:   const handleDragEnd = (event: DragEndEvent) => {
 81:     const { active, over } = event;
 82:     if (over && active.id !== over.id) {
 83:       const oldIndex = selectedColumns.indexOf(active.id as string);
 84:       const newIndex = selectedColumns.indexOf(over.id as string);
 85:       reorderColumns(oldIndex, newIndex);
 86:     }
 87:   };
 88:   // Group fields
 89:   const selectedFieldsObjects = useMemo(() => {
 90:     return selectedColumns
 91:       .map((id) => fields.find((f) => f.id === id))
 92:       .filter((f): f is FieldInfo => f !== undefined);
 93:   }, [selectedColumns, fields]);
 94:   const availableFields = useMemo(() => {
 95:     return filteredFields.filter((f) => !selectedColumns.includes(f.id));
 96:   }, [filteredFields, selectedColumns]);
 97:   const dealFields = availableFields.filter((f) => !f.id.startsWith("COMPANY_"));
 98:   const companyFields = availableFields.filter((f) => f.id.startsWith("COMPANY_"));
 99:   return (
100:     <Sheet open={columnSelectorOpen} onOpenChange={setColumnSelectorOpen}>
101:       <SheetContent className="w-[400px] sm:w-[440px] p-0 rounded-l-lg flex flex-col" side="right">
102:         <SheetHeader className="p-5 pb-3 space-y-1 shrink-0">
103:           <SheetTitle className="flex items-center gap-2 text-base">
104:             <div className="p-1.5 rounded-md bg-brand-blue/10">
105:               <Columns3 className="h-4 w-4 text-brand-blue" />
106:             </div>
107:             Настройка столбцов
108:           </SheetTitle>
109:           <SheetDescription className="text-xs text-muted-foreground">
110:             Выберите поля и перетащите для изменения порядка
111:           </SheetDescription>
112:         </SheetHeader>
113:         <div className="px-5 pb-2.5 shrink-0">
114:           <div className="relative">
115:             <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground" />
116:             <Input
117:               placeholder="Поиск полей..."
118:               value={search}
119:               onChange={(e) => setSearch(e.target.value)}
120:               className="pl-8 h-8 text-xs rounded-md bg-muted/50 border-0 focus-visible:bg-background focus-visible:ring-1"
121:             />
122:           </div>
123:         </div>
124:         <div className="px-5 pb-2.5 flex items-center justify-between shrink-0">
125:           <Badge variant="secondary" className="text-[10px] font-semibold h-5">
126:             {selectedCount} выбрано
127:           </Badge>
128:           <div className="flex gap-0.5">
129:             <Button
130:               variant="ghost"
131:               size="sm"
132:               onClick={handleSelectAll}
133:               className="h-6 text-[10px] rounded-sm gap-1 px-2"
134:             >
135:               <Check className="h-2.5 w-2.5" />
136:               Все
137:             </Button>
138:             <Button
139:               variant="ghost"
140:               size="sm"
141:               onClick={handleDeselectAll}
142:               className="h-6 text-[10px] rounded-sm gap-1 px-2"
143:             >
144:               <X className="h-2.5 w-2.5" />
145:               Снять
146:             </Button>
147:             <Button
148:               variant="ghost"
149:               size="sm"
150:               onClick={handleReset}
151:               className="h-6 text-[10px] rounded-sm gap-1 px-2"
152:             >
153:               <RotateCcw className="h-2.5 w-2.5" />
154:               Сброс
155:             </Button>
156:           </div>
157:         </div>
158:         <Separator className="shrink-0" />
159:         <ScrollArea className="flex-1 min-h-0">
160:           <div className="p-3 space-y-4">
161:             {/* Selected Columns (Draggable) */}
162:             {selectedFieldsObjects.length > 0 && (
163:               <div>
164:                 <div className="px-2 py-1.5 text-[10px] font-bold text-muted-foreground uppercase tracking-widest sticky top-0 bg-background/95 backdrop-blur z-10">
165:                   Выбранные столбцы
166:                 </div>
167:                 <DndContext
168:                   sensors={sensors}
169:                   collisionDetection={closestCenter}
170:                   onDragEnd={handleDragEnd}
171:                 >
172:                   <SortableContext
173:                     items={selectedColumns}
174:                     strategy={verticalListSortingStrategy}
175:                   >
176:                     <div className="space-y-0.5">
177:                       {selectedFieldsObjects.map((field) => (
178:                         <SortableColumnItem
179:                           key={field.id}
180:                           field={field}
181:                           onToggle={() => toggleColumn(field.id)}
182:                           isCustom={field.id.startsWith("UF_CRM_") || field.id.startsWith("COMPANY_UF_CRM_")}
183:                         />
184:                       ))}
185:                     </div>
186:                   </SortableContext>
187:                 </DndContext>
188:               </div>
189:             )}
190:             {/* Available Columns */}
191:             {(dealFields.length > 0 || companyFields.length > 0) && (
192:               <div>
193:                 <div className="px-2 py-1.5 text-[10px] font-bold text-muted-foreground uppercase tracking-widest sticky top-0 bg-background/95 backdrop-blur z-10">
194:                   Доступные столбцы
195:                 </div>
196:                 <div className="space-y-0.5">
197:                   {dealFields.length > 0 && (
198:                     <>
199:                       <div className="px-2 py-1 text-[9px] font-semibold text-muted-foreground/70 uppercase">
200:                         Сделка
201:                       </div>
202:                       {dealFields.map((field) => (
203:                         <ColumnItem
204:                           key={field.id}
205:                           field={field}
206:                           checked={false}
207:                           onToggle={() => toggleColumn(field.id)}
208:                           isCustom={field.id.startsWith("UF_CRM_")}
209:                         />
210:                       ))}
211:                     </>
212:                   )}
213:                   {companyFields.length > 0 && (
214:                     <>
215:                       <div className="px-2 py-1 mt-2 text-[9px] font-semibold text-muted-foreground/70 uppercase">
216:                         Компания
217:                       </div>
218:                       {companyFields.map((field) => (
219:                         <ColumnItem
220:                           key={field.id}
221:                           field={field}
222:                           checked={false}
223:                           onToggle={() => toggleColumn(field.id)}
224:                           isCustom={field.id.startsWith("COMPANY_UF_CRM_")}
225:                         />
226:                       ))}
227:                     </>
228:                   )}
229:                 </div>
230:               </div>
231:             )}
232:             {filteredFields.length === 0 && (
233:               <div className="text-center py-8 text-muted-foreground text-xs">
234:                 {fields.length === 0
235:                   ? "Загрузите поля с CRM"
236:                   : "Ничего не найдено"}
237:               </div>
238:             )}
239:           </div>
240:         </ScrollArea>
241:       </SheetContent>
242:     </Sheet>
243:   );
244: }
245: function SortableColumnItem({
246:   field,
247:   onToggle,
248:   isCustom = false,
249: }: {
250:   field: FieldInfo;
251:   onToggle: () => void;
252:   isCustom?: boolean;
253: }) {
254:   const {
255:     attributes,
256:     listeners,
257:     setNodeRef,
258:     transform,
259:     transition,
260:     isDragging,
261:   } = useSortable({ id: field.id });
262:   const style = {
263:     transform: CSS.Transform.toString(transform),
264:     transition,
265:     zIndex: isDragging ? 1 : 0,
266:   };
267:   return (
268:     <div
269:       ref={setNodeRef}
270:       style={style}
271:       className={`flex items-center gap-2.5 px-2.5 py-1.5 rounded-md transition-colors ${
272:         isDragging
273:           ? "bg-brand-blue/10 shadow-sm opacity-80"
274:           : "bg-brand-blue/5 dark:bg-brand-blue/10 hover:bg-brand-blue/10"
275:       }`}
276:     >
277:       <div
278:         {...attributes}
279:         {...listeners}
280:         className="cursor-grab active:cursor-grabbing p-0.5 text-muted-foreground hover:text-foreground rounded"
281:       >
282:         <GripVertical className="h-3.5 w-3.5" />
283:       </div>
284:       <Checkbox
285:         checked={true}
286:         onCheckedChange={onToggle}
287:         className="data-[state=checked]:bg-brand-blue data-[state=checked]:border-brand-blue h-3.5 w-3.5"
288:       />
289:       <ColumnItemContent field={field} isCustom={isCustom} />
290:     </div>
291:   );
292: }
293: function ColumnItem({
294:   field,
295:   checked,
296:   onToggle,
297:   isCustom = false,
298: }: {
299:   field: FieldInfo;
300:   checked: boolean;
301:   onToggle: () => void;
302:   isCustom?: boolean;
303: }) {
304:   return (
305:     <label
306:       className={`flex items-center gap-2.5 px-2.5 py-1.5 rounded-md cursor-pointer transition-all ${
307:         checked
308:           ? "bg-brand-blue/5 dark:bg-brand-blue/10"
309:           : "hover:bg-muted/50"
310:       }`}
311:     >
312:       <div className="w-[22px]" /> {/* Spacer to align with GripVertical */}
313:       <Checkbox
314:         checked={checked}
315:         onCheckedChange={onToggle}
316:         className="data-[state=checked]:bg-brand-blue data-[state=checked]:border-brand-blue h-3.5 w-3.5"
317:       />
318:       <ColumnItemContent field={field} isCustom={isCustom} />
319:     </label>
320:   );
321: }
322: function ColumnItemContent({ field, isCustom }: { field: FieldInfo; isCustom: boolean }) {
323:   // Type display names in Russian
324:   const typeLabels: Record<string, string> = {
325:     string: "Текст",
326:     double: "Число",
327:     integer: "Целое",
328:     date: "Дата",
329:     datetime: "Дата/Время",
330:     money: "Деньги",
331:     enumeration: "Список",
332:     boolean: "Да/Нет",
333:     char: "Да/Нет",
334:     crm_status: "Статус",
335:     crm_currency: "Валюта",
336:     crm_category: "Воронка",
337:     address: "Адрес",
338:     file: "Файл",
339:   };
340:   const typeLabel = typeLabels[field.type] || field.type;
341:   return (
342:     <div className="flex-1 min-w-0">
343:       <div className="text-xs font-medium truncate leading-tight">{field.title}</div>
344:       <div className="text-[10px] text-muted-foreground truncate flex items-center gap-1 flex-wrap mt-0.5">
345:         <span className="font-mono opacity-50">{field.id}</span>
346:         {isCustom && (
347:           <Badge variant="outline" className="h-3.5 px-1 text-[9px] rounded-sm border-brand-orange/30 text-brand-orange leading-none">
348:             UF
349:           </Badge>
350:         )}
351:         <Badge variant="outline" className="h-3.5 px-1 text-[9px] rounded-sm leading-none">
352:           {typeLabel}
353:         </Badge>
354:         {field.isMultiple && (
355:           <Badge variant="outline" className="h-3.5 px-1 text-[9px] rounded-sm border-violet-300 text-violet-600 dark:border-violet-700 dark:text-violet-400 leading-none">
356:             Множ.
357:           </Badge>
358:         )}
359:       </div>
360:     </div>
361:   );
362: }
```

## File: src/components/dashboard/header.tsx
```typescript
  1: "use client";
  2: import { useSession, signOut } from "next-auth/react";
  3: import { useDashboardStore } from "@/store/dashboard-store";
  4: import { useTableState } from "@/hooks/use-table-state";
  5: import { Button } from "@/components/ui/button";
  6: import { ThemeToggle } from "./theme-toggle";
  7: import { DateFilter } from "./date-filter";
  8: import { GlobalSearch } from "./global-search";
  9: import { ActiveFilters } from "./active-filters";
 10: import { LastSync } from "./last-sync";
 11: import { AlertsBell } from "./alerts-bell";
 12: import { PipelineFilter } from "./pipeline-filter";
 13: import { ResponsibleFilter } from "./responsible-filter";
 14: import { ConnectionHealth } from "./connection-health";
 15: import { RefreshCw, Download, Columns3, BarChart3, LogOut, User } from "lucide-react";
 16: import { exportToExcelWysiwyg } from "@/lib/export-utils";
 17: import { IS_PRODUCTION, WP_LOGIN_URL_CLIENT } from "@/lib/config";
 18: import Link from "next/link";
 19: import { useCallback } from "react";
 20: export function Header() {
 21:   const { data: session } = useSession();
 22:   const { dealsLoading, syncData, setColumnSelectorOpen } =
 23:     useDashboardStore();
 24:   const { sortedDeals, columns, fieldMap, resolveValue } = useTableState();
 25:   const handleSync = async () => {
 26:     try {
 27:       await syncData();
 28:     } catch (error) {
 29:       console.error("[Header] Sync error:", error);
 30:     }
 31:   };
 32:   const handleExport = useCallback(() => {
 33:     if (sortedDeals.length === 0 || columns.length === 0) return;
 34:     const exportColumns = columns.map((colId) => fieldMap.get(colId)?.title || colId);
 35:     const exportData = sortedDeals.map((deal) =>
 36:       columns.map((colId) => {
 37:         const raw = deal[colId];
 38:         const resolved = resolveValue(deal, colId);
 39:         const field = fieldMap.get(colId);
 40:         if (!resolved) return "";
 41:         if (field?.type === "char" || field?.type === "boolean") {
 42:           if (raw === "Y" || raw === "1" || String(raw) === "true") return "Да";
 43:           if (raw === "N" || raw === "0" || String(raw) === "false") return "Нет";
 44:         }
 45:         if (field?.type === "money" && raw) {
 46:           const parts = String(raw).split("|");
 47:           const amount = parseFloat(parts[0]);
 48:           const currency = parts[1] || "";
 49:           if (!isNaN(amount)) {
 50:             return `${amount.toLocaleString("ru-RU", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${currency}`;
 51:           }
 52:         }
 53:         if (field?.type === "double" || field?.type === "integer" || field?.id === "OPPORTUNITY") {
 54:           const num = parseFloat(resolved);
 55:           if (!isNaN(num)) {
 56:             if (field?.type === "integer") {
 57:               return Math.round(num).toLocaleString("ru-RU");
 58:             }
 59:             return num.toLocaleString("ru-RU", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
 60:           }
 61:         }
 62:         if (field?.type === "date" || field?.type === "datetime" || field?.id === "DATE_CREATE" || field?.id === "DATE_MODIFY") {
 63:           const d = new Date(resolved);
 64:           if (!isNaN(d.getTime())) {
 65:             const dateStr = d.toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit", year: "numeric" });
 66:             const timeStr = field?.type === "datetime" ? ` ${d.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" })}` : "";
 67:             return `${dateStr}${timeStr}`;
 68:           }
 69:         }
 70:         return resolved;
 71:       })
 72:     );
 73:     exportToExcelWysiwyg(exportData, exportColumns);
 74:   }, [sortedDeals, columns, fieldMap, resolveValue]);
 75:   const handleLogout = () => {
 76:     if (IS_PRODUCTION) {
 77:       const u = new URL(WP_LOGIN_URL_CLIENT);
 78:       u.searchParams.set("action", "headless_logout");
 79:       u.searchParams.set("redirect_to", `${window.location.origin}/login`);
 80:       signOut({ callbackUrl: u.toString() });
 81:     } else {
 82:       signOut({ callbackUrl: "/login" });
 83:     }
 84:   };
 85:   return (
 86:     <header className="z-30 header-gradient border-b border-white/10">
 87:       {/* Top row: Brand + Actions */}
 88:       <div className="flex items-center justify-between px-3 sm:px-5 h-12 gap-2">
 89:           {/* Left: Brand */}
 90:           <Link href="/" className="flex items-center gap-2.5 shrink-0 hover:opacity-80 transition-opacity cursor-pointer">
 91:             <BarChart3 className="h-5 w-5 text-white/80 shrink-0" />
 92:             <span className="text-sm font-semibold tracking-wide text-white">
 93:               RusSilica
 94:             </span>
 95:             <span className="hidden sm:inline text-xs font-normal text-white/40">
 96:               BI Terminal
 97:             </span>
 98:           </Link>
 99:           {/* Right: Actions */}
100:           <div className="flex items-center gap-1 shrink-0 ml-auto">
101:             {/* Sync button */}
102:             <Button
103:               variant="ghost"
104:               size="sm"
105:               onClick={handleSync}
106:               disabled={dealsLoading}
107:               className="h-7 gap-1.5 rounded text-xs text-white/70 hover:text-white hover:bg-white/10"
108:               title="Синхронизировать данные"
109:             >
110:               <RefreshCw className={`h-3.5 w-3.5 ${dealsLoading ? "sync-pulse" : ""}`} />
111:               <span className="hidden sm:inline">Синхр.</span>
112:             </Button>
113:             {/* Connection health */}
114:             <ConnectionHealth />
115:             {/* Last sync time */}
116:             <div className="hidden lg:block">
117:               <LastSync />
118:             </div>
119:             {/* Separator */}
120:             <div className="w-px h-4 bg-white/10 mx-1" />
121:             {/* Column selector */}
122:             <Button
123:               variant="ghost"
124:               size="sm"
125:               onClick={() => setColumnSelectorOpen(true)}
126:               className="h-7 gap-1.5 rounded text-xs text-white/70 hover:text-white hover:bg-white/10"
127:             >
128:               <Columns3 className="h-3.5 w-3.5" />
129:               <span className="hidden lg:inline">Столбцы</span>
130:             </Button>
131:             {/* Export */}
132:             <Button
133:               variant="ghost"
134:               size="sm"
135:               onClick={handleExport}
136:               disabled={sortedDeals.length === 0}
137:               className="h-7 gap-1.5 rounded text-xs text-white/70 hover:text-white hover:bg-white/10 disabled:text-white/30"
138:             >
139:               <Download className="h-3.5 w-3.5" />
140:               <span className="hidden lg:inline">Экспорт</span>
141:             </Button>
142:             {/* Separator */}
143:             <div className="w-px h-4 bg-white/10 mx-1" />
144:             {/* Theme */}
145:             <ThemeToggle />
146:             {/* Alerts bell */}
147:             <AlertsBell />
148:             {/* Separator */}
149:             <div className="w-px h-4 bg-white/10 mx-1" />
150:             {/* User info + Logout */}
151:             <div className="flex items-center gap-1.5">
152:               <div className="hidden sm:flex items-center gap-1.5 px-2 py-1 rounded bg-white/[0.07]">
153:                 <User className="h-3 w-3 text-white/50" />
154:                 <span className="text-[11px] text-white/60 font-medium whitespace-nowrap max-w-[120px] truncate">
155:                   {session?.user?.name || session?.user?.email || "—"}
156:                 </span>
157:                 {(session?.user?.role) === "admin" && (
158:                   <span className="text-[9px] px-1 py-0.5 rounded bg-amber-500/20 text-amber-400 font-semibold">
159:                     АДМ
160:                   </span>
161:                 )}
162:               </div>
163:               <Button
164:                 variant="ghost"
165:                 size="sm"
166:                 onClick={handleLogout}
167:                 className="h-7 gap-1 rounded text-xs text-white/50 hover:text-red-300 hover:bg-white/10"
168:                 title="Выйти из системы"
169:               >
170:                 <LogOut className="h-3.5 w-3.5" />
171:               </Button>
172:             </div>
173:           </div>
174:         </div>
175:         {/* Second row: Filters + Search */}
176:         <div className="flex items-center px-3 sm:px-5 pb-2 pt-0.5 gap-2 overflow-x-auto no-scrollbar">
177:           {/* Date filter */}
178:           <DateFilter />
179:           {/* Pipeline quick filter */}
180:           <PipelineFilter />
181:           {/* Responsible filter */}
182:           <ResponsibleFilter />
183:           {/* Search (inline with filters) */}
184:           <div className="flex-1 min-w-[200px] max-w-md">
185:             <GlobalSearch />
186:           </div>
187:           {/* Active filters badge */}
188:           <ActiveFilters />
189:         </div>
190:       </header>
191:   );
192: }
```

## File: src/lib/sso-hmac.ts
```typescript
  1: /**
  2:  * SSO HMAC Utilities — RusSilica BI Terminal
  3:  *
  4:  * Provides HMAC-SHA256 based token generation and verification
  5:  * for WordPress SSO integration.
  6:  *
  7:  * Flow:
  8:  * 1. WordPress mu-plugin generates: HMAC-SHA256(email|role|timestamp, PROXY_SECRET)
  9:  * 2. WordPress redirects to: /api/auth/wp-callback?email=...&role=...&ts=...&sig=...
 10:  * 3. BI terminal verifies the signature using the same PROXY_SECRET
 11:  * 4. If valid, creates a NextAuth session
 12:  *
 13:  * Security:
 14:  * - timingSafeEqual prevents timing attacks
 15:  * - 5-minute token expiry prevents replay attacks
 16:  * - PROXY_SECRET is shared between WordPress and BI terminal
 17:  */
 18: import { createHmac, timingSafeEqual, createHash } from "crypto";
 19: import { db } from "@/lib/db";
 20: const PROXY_SECRET = process.env.PROXY_SECRET || "";
 21: const MAX_TOKEN_AGE_SECONDS = 300; // 5 minutes
 22: export interface SsoTokenPayload {
 23:   email: string;
 24:   role: string;
 25:   timestamp: number;
 26: }
 27: /**
 28:  * Generate HMAC signature for SSO token.
 29:  * Signature = HMAC-SHA256(email|role|timestamp, PROXY_SECRET)
 30:  */
 31: export function generateSsoHmac(payload: SsoTokenPayload): string {
 32:   const message = `${payload.email}|${payload.role}|${payload.timestamp}`;
 33:   return createHmac("sha256", PROXY_SECRET).update(message).digest("hex");
 34: }
 35: /**
 36:  * Generate a complete SSO token string for use as password in the auto-submit form.
 37:  * Format: wp-sso-hmac:{email}:{role}:{timestamp}:{signature}
 38:  */
 39: export function generateSsoToken(payload: SsoTokenPayload): string {
 40:   const signature = generateSsoHmac(payload);
 41:   return `wp-sso-hmac|${payload.email}|${payload.role}|${payload.timestamp}|${signature}`;
 42: }
 43: /**
 44:  * Verify an SSO HMAC token (from the auto-submit form password field).
 45:  * Returns the payload if valid, null if invalid.
 46:  *
 47:  * Token format: wp-sso-hmac|{email}|{role}|{timestamp}|{signature}
 48:  */
 49: export async function verifySsoToken(token: string): Promise<SsoTokenPayload | null> {
 50:   if (!PROXY_SECRET) return null;
 51:   // Must start with our prefix
 52:   if (!token.startsWith("wp-sso-hmac|")) return null;
 53:   const parts = token.slice("wp-sso-hmac|".length).split("|");
 54:   // Need at least: email, role, timestamp, signature (4 parts)
 55:   // But email might contain special chars (though unlikely with @russilica.ru)
 56:   if (parts.length < 4) return null;
 57:   // Signature is always last, timestamp second-to-last, role third-to-last
 58:   const signature = parts[parts.length - 1];
 59:   const timestampStr = parts[parts.length - 2];
 60:   const role = parts[parts.length - 3];
 61:   const email = parts.slice(0, parts.length - 3).join("|");
 62:   if (!email || !role || !timestampStr || !signature) return null;
 63:   // Validate timestamp is a number
 64:   const timestamp = parseInt(timestampStr, 10);
 65:   if (isNaN(timestamp)) return null;
 66:   // Check token age (prevent replay attacks)
 67:   const now = Math.floor(Date.now() / 1000);
 68:   if (Math.abs(now - timestamp) > MAX_TOKEN_AGE_SECONDS) {
 69:     console.warn(`[SSO-HMAC] Token expired: age=${Math.abs(now - timestamp)}s, max=${MAX_TOKEN_AGE_SECONDS}s`);
 70:     return null;
 71:   }
 72:   // Verify HMAC with timing-safe comparison
 73:   const expectedSignature = generateSsoHmac({ email, role, timestamp });
 74:   if (signature.length !== expectedSignature.length) return null;
 75:   try {
 76:     if (!timingSafeEqual(Buffer.from(signature, "hex"), Buffer.from(expectedSignature, "hex"))) return null;
 77:   } catch {
 78:     return null;
 79:   }
 80:   // Check nonce to prevent replay attacks
 81:   try {
 82:     // Cleanup old nonces (older than 10 minutes)
 83:     await db.usedNonce.deleteMany({
 84:       where: { createdAt: { lt: new Date(Date.now() - 600_000) } }
 85:     }).catch(e => console.error("[SSO-HMAC] Nonce cleanup failed:", e));
 86:     const existing = await db.usedNonce.findUnique({
 87:       where: { nonce: signature }
 88:     });
 89:     if (existing) {
 90:       console.warn(`[SSO-HMAC] Replay attack detected for nonce: ${signature}`);
 91:       return null;
 92:     }
 93:     await db.usedNonce.create({
 94:       data: { nonce: signature }
 95:     });
 96:   } catch (error) {
 97:     console.error("[SSO-HMAC] Error checking nonce:", error);
 98:     return null;
 99:   }
100:   return { email, role, timestamp };
101: }
102: /**
103:  * Verify HMAC from URL parameters (used by wp-callback).
104:  * Parameters: email, role, ts (timestamp in seconds), sig (hex signature)
105:  */
106: export async function verifySsoUrlParams(
107:   email: string,
108:   role: string,
109:   timestampStr: string,
110:   signature: string
111: ): Promise<SsoTokenPayload | null> {
112:   if (!PROXY_SECRET) return null;
113:   if (!email || !role || !timestampStr || !signature) return null;
114:   const timestamp = parseInt(timestampStr, 10);
115:   if (isNaN(timestamp)) return null;
116:   // Check token age
117:   const now = Math.floor(Date.now() / 1000);
118:   if (Math.abs(now - timestamp) > MAX_TOKEN_AGE_SECONDS) {
119:     console.warn(`[SSO-HMAC] URL token expired: age=${Math.abs(now - timestamp)}s`);
120:     return null;
121:   }
122:   // Verify HMAC
123:   const expectedSignature = generateSsoHmac({ email, role, timestamp });
124:   if (signature.length !== expectedSignature.length) return null;
125:   try {
126:     if (!timingSafeEqual(Buffer.from(signature, "hex"), Buffer.from(expectedSignature, "hex"))) return null;
127:   } catch {
128:     return null;
129:   }
130:   return { email, role, timestamp };
131: }
132: /**
133:  * Check if PROXY_SECRET is configured.
134:  * Required for SSO to work.
135:  */
136: export function isProxySecretConfigured(): boolean {
137:   return PROXY_SECRET.length > 0;
138: }
139: /**
140:  * Timing-safe string comparison.
141:  * Prevents timing attacks when comparing secrets (e.g., PROXY_SECRET).
142:  * Uses crypto.timingSafeEqual under the hood.
143:  */
144: export function timingSafeEqualString(a: string, b: string): boolean {
145:   // Hard cap: proxy secrets should never exceed 512 bytes.
146:   // Reject anything longer immediately. An attacker cannot learn the
147:   // expected secret's length from this check alone because we don't
148:   // reveal whether `a` or `b` was too long.
149:   const MAX_SECRET_LENGTH = 512;
150:   if (a.length > MAX_SECRET_LENGTH || b.length > MAX_SECRET_LENGTH) {
151:     return false;
152:   }
153:   try {
154:     // Hash both values with SHA-256. This produces fixed-length 32-byte
155:     // digests regardless of input length, so timingSafeEqual gets
156:     // two equally-sized buffers and comparison time is constant.
157:     const hashA = createHash("sha256").update(a).digest();
158:     const hashB = createHash("sha256").update(b).digest();
159:     return timingSafeEqual(hashA, hashB);
160:   } catch {
161:     return false;
162:   }
163: }
```

## File: src/middleware.ts
```typescript
  1: import { NextResponse } from "next/server";
  2: import type { NextRequest } from "next/server";
  3: import { IS_PRODUCTION } from "@/lib/config";
  4: /**
  5:  * Security Proxy — RusSilica BI Terminal
  6:  *
  7:  * In Next.js 16, the file convention is `middleware.ts`.
  8:  * The export MUST be named `middleware` for Next.js 16 to recognize it.
  9:  *
 10:  * WordPress SSO Architecture:
 11:  * - Caddy reverse proxy adds auth headers to every request
 12:  * - BI terminal verifies proxy secret and creates sessions
 13:  * - No /login page in production — WordPress handles login
 14:  *
 15:  * Security layers:
 16:  * 1. Rate limiting (in-memory, with cleanup)
 17:  * 2. Security response headers (CSP, HSTS, X-Frame-Options, etc.)
 18:  * 3. Production-tightened CSP (no unsafe-inline/unsafe-eval)
 19:  * 4. Request body size limits
 20:  * 5. CORS restrictions (production allowlist only)
 21:  * 6. Cross-origin isolation policies
 22:  * 7. Cache-Control headers for sensitive pages
 23:  */
 24: // ─── Rate Limiter ───
 25: // NOTE: This in-memory rate limiter works correctly because the application
 26: // is deployed as a long-running Node.js process (Next.js standalone output)
 27: // via bun server.js. It is NOT deployed to a serverless environment (like Vercel),
 28: // where in-memory state would be lost between requests.
 29: interface RateLimitEntry {
 30:   count: number;
 31:   resetAt: number;
 32: }
 33: declare global {
 34:   var __rateLimitInterval: NodeJS.Timeout | undefined;
 35: }
 36: const rateLimitMap = new Map<string, RateLimitEntry>();
 37: const MAX_RATE_LIMIT_ENTRIES = 10_000;
 38: // Cleanup old entries every 60 seconds
 39: if (!globalThis.__rateLimitInterval) {
 40:   globalThis.__rateLimitInterval = setInterval(() => {
 41:     const now = Date.now();
 42:     for (const [key, entry] of rateLimitMap.entries()) {
 43:       if (now > entry.resetAt) {
 44:         rateLimitMap.delete(key);
 45:       }
 46:     }
 47:     if (rateLimitMap.size > MAX_RATE_LIMIT_ENTRIES) {
 48:       const entries = [...rateLimitMap.entries()].sort((a, b) => a[1].resetAt - b[1].resetAt);
 49:       const toDelete = entries.slice(0, entries.length - MAX_RATE_LIMIT_ENTRIES);
 50:       for (const [key] of toDelete) {
 51:         rateLimitMap.delete(key);
 52:       }
 53:     }
 54:   }, 60_000);
 55: }
 56: // Different rate limits per endpoint type
 57: const RATE_LIMITS = {
 58:   api: { max: IS_PRODUCTION ? 40 : 60, windowMs: 60_000 },
 59:   status: { max: IS_PRODUCTION ? 10 : 20, windowMs: 60_000 },
 60:   auth: { max: IS_PRODUCTION ? 5 : 200, windowMs: 60_000 },
 61:   admin: { max: IS_PRODUCTION ? 10 : 30, windowMs: 60_000 },
 62:   default: { max: IS_PRODUCTION ? 80 : 120, windowMs: 60_000 },
 63: } as const;
 64: function checkRateLimit(
 65:   ip: string,
 66:   limit: number,
 67:   windowMs: number
 68: ): { allowed: boolean; remaining: number; resetAt: number; limit: number } {
 69:   const key = `${ip}:${limit}:${windowMs}`;
 70:   const now = Date.now();
 71:   const entry = rateLimitMap.get(key);
 72:   if (!entry || now > entry.resetAt) {
 73:     const resetAt = now + windowMs;
 74:     rateLimitMap.set(key, { count: 1, resetAt });
 75:     return { allowed: true, remaining: limit - 1, resetAt, limit };
 76:   }
 77:   if (entry.count >= limit) {
 78:     return { allowed: false, remaining: 0, resetAt: entry.resetAt, limit };
 79:   }
 80:   entry.count++;
 81:   return { allowed: true, remaining: limit - entry.count, resetAt: entry.resetAt, limit };
 82: }
 83: // ─── Security Headers ───
 84: const SECURITY_HEADERS: Record<string, string> = {
 85:   "X-Content-Type-Options": "nosniff",
 86:   "X-Frame-Options": "SAMEORIGIN",
 87:   "X-XSS-Protection": "0",
 88:   "Referrer-Policy": "strict-origin-when-cross-origin",
 89:   "Permissions-Policy": "camera=(), microphone=(), geolocation=(), payment=(), usb=(), magnetometer=(), gyroscope=(), accelerometer=()",
 90:   "Strict-Transport-Security": "max-age=63072000; includeSubDomains; preload",
 91:   "Cross-Origin-Opener-Policy": "same-origin",
 92:   "Cross-Origin-Resource-Policy": "same-origin",
 93:   "Cross-Origin-Embedder-Policy": "credentialless",
 94: };
 95: // ─── Content Security Policy ───
 96: const CSP_DIRECTIVES_PROD = [
 97:   "default-src 'self'",
 98:   "script-src 'self' 'unsafe-inline'",
 99:   "style-src 'self' 'unsafe-inline'",
100:   "img-src 'self' data: blob: https://*.bitrix24.ru https://*.bitrix24.com",
101:   "font-src 'self' data:",
102:   "connect-src 'self' https://*.bitrix24.ru https://*.bitrix24.com",
103:   "frame-ancestors 'self'",
104:   "base-uri 'self'",
105:   "form-action 'self'",
106:   "object-src 'none'",
107:   "media-src 'none'",
108:   "worker-src 'self' blob:",
109: ].join("; ");
110: const CSP_DIRECTIVES_DEV = [
111:   "default-src 'self'",
112:   "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
113:   "style-src 'self' 'unsafe-inline'",
114:   "img-src 'self' data: blob: https://*.bitrix24.ru https://*.bitrix24.com",
115:   "font-src 'self' data:",
116:   "connect-src 'self' https://*.bitrix24.ru https://*.bitrix24.com ws://localhost:3000",
117:   "frame-ancestors 'self'",
118:   "base-uri 'self'",
119:   "form-action 'self'",
120:   "object-src 'none'",
121:   "media-src 'none'",
122:   "worker-src 'self' blob:",
123: ].join("; ");
124: const CSP_DIRECTIVES = IS_PRODUCTION ? CSP_DIRECTIVES_PROD : CSP_DIRECTIVES_DEV;
125: // ─── CORS ───
126: // Same-domain architecture: WordPress and BI terminal on bi-terminal.rus-silica.com
127: // No CORS needed in production (same origin), but keep for dev flexibility
128: const ALLOWED_ORIGINS = new Set(
129:   IS_PRODUCTION
130:     ? [
131:         "https://bi-terminal.rus-silica.com",  // Same domain for WP + BI
132:       ]
133:     : [
134:         "https://bi-terminal.rus-silica.com",
135:         "http://localhost:3000",
136:         "http://127.0.0.1:3000",
137:       ]
138: );
139: /**
140:  * Get client IP with spoofing protection.
141:  */
142: function getClientIp(request: NextRequest): string {
143:   // Next.js securely provides the actual connection IP
144:   const realConnectionIp = (request as any).ip || "127.0.0.1";
145:   // Only trust headers if the connection comes from your local proxy network
146:   const isTrustedProxy = realConnectionIp === "127.0.0.1" || realConnectionIp === "::1" || realConnectionIp.startsWith("172.");
147:   if (isTrustedProxy) {
148:     const forwarded = request.headers.get("x-forwarded-for");
149:     if (forwarded) return forwarded.split(",")[0].trim();
150:     const realIp = request.headers.get("x-real-ip");
151:     if (realIp) return realIp.trim();
152:   }
153:   return realConnectionIp;
154: }
155: // ─── MAIN PROXY EXPORT ───
156: export function middleware(request: NextRequest) {
157:   const { pathname } = request.nextUrl;
158:   // SECURITY: Force HTTPS protocol header in production to ensure NextAuth sets secure cookies
159:   // even if the reverse proxy (LiteSpeed) fails to pass the X-Forwarded-Proto header.
160:   const requestHeaders = new Headers(request.headers);
161:   if (IS_PRODUCTION) {
162:     requestHeaders.set("x-forwarded-proto", "https");
163:   }
164:   // ─── Login page: Cache-Control headers ───
165:   if (pathname === "/login") {
166:     const response = NextResponse.next({ request: { headers: requestHeaders } });
167:     for (const [key, value] of Object.entries(SECURITY_HEADERS)) {
168:       response.headers.set(key, value);
169:     }
170:     response.headers.set("Content-Security-Policy", CSP_DIRECTIVES);
171:     response.headers.set("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
172:     response.headers.set("Pragma", "no-cache");
173:     response.headers.set("Expires", "0");
174:     response.headers.delete("X-Powered-By");
175:     return response;
176:   }
177:   // ─── API Routes: Rate limiting + CORS + Security headers ───
178:   if (pathname.startsWith("/api/")) {
179:     const clientIp = getClientIp(request);
180:     // Select rate limit based on endpoint
181:     let rateConfig;
182:     if (pathname === "/api/bitrix/status") {
183:       rateConfig = RATE_LIMITS.status;
184:     } else if (pathname.startsWith("/api/auth/")) {
185:       rateConfig = RATE_LIMITS.auth;
186:     } else if (pathname.startsWith("/api/admin/")) {
187:       rateConfig = RATE_LIMITS.admin;
188:     } else {
189:       rateConfig = RATE_LIMITS.api;
190:     }
191:     const rateResult = checkRateLimit(clientIp, rateConfig.max, rateConfig.windowMs);
192:     if (!rateResult.allowed) {
193:       return new NextResponse(
194:         JSON.stringify({ success: false, error: "Too many requests. Please try again later." }),
195:         {
196:           status: 429,
197:           headers: {
198:             "Content-Type": "application/json",
199:             "Retry-After": String(Math.ceil((rateResult.resetAt - Date.now()) / 1000)),
200:             "X-RateLimit-Limit": String(rateConfig.max),
201:             "X-RateLimit-Remaining": "0",
202:             "X-RateLimit-Reset": String(Math.ceil(rateResult.resetAt / 1000)),
203:             ...SECURITY_HEADERS,
204:             "Content-Security-Policy": CSP_DIRECTIVES,
205:           },
206:         }
207:       );
208:     }
209:     // Handle CORS preflight requests
210:     if (request.method === "OPTIONS") {
211:       const origin = request.headers.get("origin");
212:       const allowedOrigin = origin && ALLOWED_ORIGINS.has(origin) ? origin : "";
213:       return new NextResponse(null, {
214:         status: 204,
215:         headers: {
216:           "Access-Control-Allow-Origin": allowedOrigin,
217:           "Access-Control-Allow-Methods": "GET, POST, PATCH, DELETE, OPTIONS",
218:           "Access-Control-Allow-Headers": "Content-Type, X-CSRF-Token",
219:           "Access-Control-Max-Age": "86400",
220:           "Access-Control-Allow-Credentials": "true",
221:           ...SECURITY_HEADERS,
222:           "Content-Security-Policy": CSP_DIRECTIVES,
223:         },
224:       });
225:     }
226:     // Request body size check for POST/PATCH/DELETE (100KB max)
227:     if (["POST", "PATCH", "DELETE"].includes(request.method)) {
228:       const contentLength = request.headers.get("content-length");
229:       if (contentLength && parseInt(contentLength, 10) > 100_000) {
230:         return new NextResponse(
231:           JSON.stringify({ success: false, error: "Request body too large" }),
232:           {
233:             status: 413,
234:             headers: {
235:               "Content-Type": "application/json",
236:               ...SECURITY_HEADERS,
237:               "Content-Security-Policy": CSP_DIRECTIVES,
238:             },
239:           }
240:         );
241:       }
242:     }
243:     // Process API request
244:     const response = NextResponse.next({ request: { headers: requestHeaders } });
245:     // Add rate limit headers
246:     response.headers.set("X-RateLimit-Limit", String(rateConfig.max));
247:     response.headers.set("X-RateLimit-Remaining", String(rateResult.remaining));
248:     response.headers.set("X-RateLimit-Reset", String(Math.ceil(rateResult.resetAt / 1000)));
249:     // Add CORS headers for allowed origins
250:     const origin = request.headers.get("origin");
251:     if (origin && ALLOWED_ORIGINS.has(origin)) {
252:       response.headers.set("Access-Control-Allow-Origin", origin);
253:       response.headers.set("Access-Control-Allow-Methods", "GET, POST, PATCH, DELETE, OPTIONS");
254:       response.headers.set("Access-Control-Allow-Headers", "Content-Type, X-CSRF-Token");
255:       response.headers.set("Access-Control-Max-Age", "86400");
256:       response.headers.set("Access-Control-Allow-Credentials", "true");
257:     }
258:     // Add security headers
259:     for (const [key, value] of Object.entries(SECURITY_HEADERS)) {
260:       response.headers.set(key, value);
261:     }
262:     if (pathname === "/api/auth/wp-callback") {
263:       response.headers.set("Cache-Control", "no-store, no-cache, must-revalidate");
264:       // Ensure we don't apply the strict API CSP to the SSO page
265:       response.headers.delete("Content-Security-Policy"); 
266:     } else {
267:       response.headers.set("Content-Security-Policy", CSP_DIRECTIVES);
268:     }
269:     // SECURITY: Remove server fingerprinting header
270:     response.headers.delete("X-Powered-By");
271:     return response;
272:   }
273:   // ─── Non-API Routes: Security headers only ───
274:   const response = NextResponse.next({ request: { headers: requestHeaders } });
275:   for (const [key, value] of Object.entries(SECURITY_HEADERS)) {
276:     response.headers.set(key, value);
277:   }
278:   response.headers.set("Content-Security-Policy", CSP_DIRECTIVES);
279:   response.headers.delete("X-Powered-By");
280:   return response;
281: }
282: export const config = {
283:   matcher: [
284:     "/((?!_next/static|_next/image|favicon\\.ico|russilica-logo\\.png|robots\\.txt|.*\\.svg|.*\\.ico).*)",
285:   ],
286: };
```

## File: package.json
```json
 1: {
 2:   "name": "nextjs_tailwind_shadcn_ts",
 3:   "version": "0.2.0",
 4:   "private": true,
 5:   "scripts": {
 6:     "dev": "next dev -p 3000 2>&1 | tee dev.log",
 7:     "build": "next build && cp -r .next/static .next/standalone/.next/ && cp -r public .next/standalone/",
 8:     "start": "NODE_ENV=production node .next/standalone/server.js 2>&1 | tee server.log",
 9:     "lint": "eslint .",
10:     "db:push": "prisma db push",
11:     "db:generate": "prisma generate",
12:     "db:migrate": "prisma migrate dev",
13:     "db:reset": "prisma migrate reset"
14:   },
15:   "dependencies": {
16:     "@dnd-kit/core": "^6.3.1",
17:     "@dnd-kit/sortable": "^10.0.0",
18:     "@dnd-kit/utilities": "^3.2.2",
19:     "@hookform/resolvers": "^5.1.1",
20:     "@prisma/client": "^6.11.1",
21:     "@radix-ui/react-accordion": "^1.2.11",
22:     "@radix-ui/react-alert-dialog": "^1.1.14",
23:     "@radix-ui/react-aspect-ratio": "^1.1.7",
24:     "@radix-ui/react-avatar": "^1.1.10",
25:     "@radix-ui/react-checkbox": "^1.3.2",
26:     "@radix-ui/react-collapsible": "^1.1.11",
27:     "@radix-ui/react-context-menu": "^2.2.15",
28:     "@radix-ui/react-dialog": "^1.1.14",
29:     "@radix-ui/react-dropdown-menu": "^2.1.15",
30:     "@radix-ui/react-hover-card": "^1.1.14",
31:     "@radix-ui/react-label": "^2.1.7",
32:     "@radix-ui/react-menubar": "^1.1.15",
33:     "@radix-ui/react-navigation-menu": "^1.2.13",
34:     "@radix-ui/react-popover": "^1.1.14",
35:     "@radix-ui/react-progress": "^1.1.7",
36:     "@radix-ui/react-radio-group": "^1.3.7",
37:     "@radix-ui/react-scroll-area": "^1.2.9",
38:     "@radix-ui/react-select": "^2.2.5",
39:     "@radix-ui/react-separator": "^1.1.7",
40:     "@radix-ui/react-slider": "^1.3.5",
41:     "@radix-ui/react-slot": "^1.2.3",
42:     "@radix-ui/react-switch": "^1.2.5",
43:     "@radix-ui/react-tabs": "^1.1.12",
44:     "@radix-ui/react-toast": "^1.2.14",
45:     "@radix-ui/react-toggle": "^1.1.9",
46:     "@radix-ui/react-toggle-group": "^1.1.10",
47:     "@radix-ui/react-tooltip": "^1.2.7",
48:     "@tanstack/react-query": "^5.82.0",
49:     "@tanstack/react-table": "^8.21.3",
50:     "class-variance-authority": "^0.7.1",
51:     "clsx": "^2.1.1",
52:     "cmdk": "^1.1.1",
53:     "date-fns": "^4.1.0",
54:     "embla-carousel-react": "^8.6.0",
55:     "exceljs": "^4.4.0",
56:     "framer-motion": "^12.23.2",
57:     "input-otp": "^1.4.2",
58:     "lucide-react": "^0.525.0",
59:     "next": "^16.1.1",
60:     "next-auth": "^4.24.11",
61:     "next-themes": "^0.4.6",
62:     "p-limit": "^7.3.0",
63:     "prisma": "^6.11.1",
64:     "react": "^19.0.0",
65:     "react-day-picker": "^9.8.0",
66:     "react-dom": "^19.0.0",
67:     "react-hook-form": "^7.60.0",
68:     "react-resizable-panels": "^3.0.3",
69:     "recharts": "^2.15.4",
70:     "sharp": "^0.34.3",
71:     "sonner": "^2.0.6",
72:     "tailwind-merge": "^3.3.1",
73:     "tailwindcss-animate": "^1.0.7",
74:     "vaul": "^1.1.2",
75:     "zod": "^4.0.2",
76:     "zustand": "^5.0.12"
77:   },
78:   "devDependencies": {
79:     "@tailwindcss/postcss": "^4",
80:     "@types/react": "^19",
81:     "@types/react-dom": "^19",
82:     "bun-types": "^1.3.4",
83:     "eslint": "^9",
84:     "eslint-config-next": "^16.1.1",
85:     "tailwindcss": "^4",
86:     "tw-animate-css": "^1.3.5",
87:     "typescript": "^5"
88:   }
89: }
```

## File: src/app/api/auth/wp-callback/route.ts
```typescript
  1: import { NextRequest, NextResponse } from "next/server";
  2: import { isCorporateEmail, mapWpRoleToBiRole } from "@/lib/auth";
  3: import { verifySsoUrlParams, generateSsoToken, isProxySecretConfigured, timingSafeEqualString } from "@/lib/sso-hmac";
  4: import { IS_PRODUCTION, shouldLog } from "@/lib/config";
  5: import { WP_LOGIN_URL } from "@/lib/config.server";
  6: /**
  7:  * GET /api/auth/wp-callback — WordPress SSO Callback
  8:  *
  9:  * Supports TWO authentication methods:
 10:  *
 11:  * 1. HMAC URL Parameters (recommended, simpler setup):
 12:  *    WordPress mu-plugin generates HMAC signature and redirects to:
 13:  *    /api/auth/wp-callback?email=user@russilica.ru&role=administrator&ts=1234567890&sig=abc123...
 14:  *
 15:  * 2. Caddy Proxy Headers (alternative, for advanced setups):
 16:  *    Caddy forward_auth adds headers: X-Auth-User-Email, X-Auth-User-Role, X-Proxy-Secret
 17:  *
 18:  * After verification, returns an HTML page that auto-submits to NextAuth
 19:  * credentials callback, creating a session.
 20:  *
 21:  * Security:
 22:  * - HMAC-SHA256 signature prevents token forgery
 23:  * - 5-minute token expiry prevents replay attacks
 24:  * - Timing-safe comparison prevents timing attacks
 25:  * - Corporate email domain check (defense-in-depth)
 26:  * - HTML-encoding of user-supplied data prevents XSS
 27:  * - Rate limiting via middleware.ts
 28:  */
 29: /**
 30:  * CSP for the SSO auto-submit page.
 31:  * SECURITY: Must allow inline scripts (for auto-submit form) and inline styles.
 32:  * The middleware's default CSP (script-src 'self') would block the inline <script> tag.
 33:  * This is safe because the HTML is fully generated server-side with no user-controlled content.
 34:  *
 35:  * IMPORTANT: The proxy middleware MUST NOT apply its strict CSP to this route.
 36:  * The SSO_PAGE_CSP is the ONLY CSP that should be active on this page.
 37:  */
 38: const SSO_PAGE_CSP = [
 39:   "default-src 'none'",
 40:   "script-src 'unsafe-inline'",    // Required for auto-submit form
 41:   "style-src 'unsafe-inline'",      // Required for spinner animation
 42:   "form-action 'self'",             // Only allow form submission to same origin
 43:   "connect-src 'self'",             // Required to fetch CSRF token
 44:   "img-src 'none'",                 // No images
 45:   "frame-ancestors 'none'",         // Prevent embedding
 46: ].join("; ");
 47: /**
 48:  * HTML-encode a string to prevent XSS in template literals.
 49:  */
 50: function htmlEncode(str: string): string {
 51:   return str
 52:     .replace(/&/g, "&amp;")
 53:     .replace(/</g, "&lt;")
 54:     .replace(/>/g, "&gt;")
 55:     .replace(/"/g, "&quot;")
 56:     .replace(/'/g, "&#39;");
 57: }
 58: /**
 59:  * Build the HTML auto-submit page that creates a NextAuth session.
 60:  */
 61: function buildSsoHtml(email: string, ssoToken: string): string {
 62:   const safeEmail = htmlEncode(email);
 63:   const safeToken = htmlEncode(ssoToken);
 64:   return `<!DOCTYPE html>
 65: <html>
 66: <head>
 67:   <meta charset="utf-8">
 68:   <title>Вход в BI-терминал...</title>
 69:   <style>
 70:     body {
 71:       display: flex;
 72:       align-items: center;
 73:       justify-content: center;
 74:       min-height: 100vh;
 75:       margin: 0;
 76:       background: #0f172a;
 77:       color: #94a3b8;
 78:       font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
 79:     }
 80:     .container { text-align: center; }
 81:     .spinner {
 82:       width: 32px; height: 32px;
 83:       border: 3px solid rgba(245, 158, 11, 0.2);
 84:       border-top-color: #f59e0b;
 85:       border-radius: 50%;
 86:       animation: spin 0.8s linear infinite;
 87:       margin: 0 auto 16px;
 88:     }
 89:     @keyframes spin { to { transform: rotate(360deg); } }
 90:     h2 { color: white; font-size: 16px; margin: 0 0 8px; }
 91:     p { font-size: 13px; margin: 0; }
 92:     .error { color: #ef4444; }
 93:     a { color: #f59e0b; }
 94:   </style>
 95: </head>
 96: <body>
 97:   <div class="container">
 98:     <div class="spinner"></div>
 99:     <h2>Вход в BI-терминал</h2>
100:     <p>Авторизация через корпоративный портал...</p>
101:   </div>
102:   <form id="sso-form" method="POST" action="/api/auth/callback/credentials">
103:     <input type="hidden" name="email" value="${safeEmail}" />
104:     <input type="hidden" name="password" value="${safeToken}" />
105:   </form>
106:   <script>
107:     fetch('/api/auth/csrf?t=' + new Date().getTime(), { credentials: 'include', cache: 'no-store' })
108:       .then(res => {
109:         if (!res.ok) throw new Error('HTTP status ' + res.status);
110:         return res.json();
111:       })
112:       .then(data => {
113:         if (data.csrfToken) {
114:           const form = document.getElementById('sso-form');
115:           const input = document.createElement('input');
116:           input.type = 'hidden';
117:           input.name = 'csrfToken';
118:           input.value = data.csrfToken;
119:           form.appendChild(input);
120:           document.getElementById('sso-form').submit();
121:         } else {
122:           const errDiv = document.createElement('div');
123:           errDiv.style.cssText = 'color:red; margin-top:20px; font-size:12px;';
124:           errDiv.textContent = 'Error: No CSRF token received. Response: ' + JSON.stringify(data);
125:           document.body.appendChild(errDiv);
126:         }
127:       })
128:       .catch(err => {
129:         console.error('Failed to fetch CSRF token', err);
130:         const errDiv = document.createElement('div');
131:         errDiv.style.cssText = 'color:red; margin-top:20px; font-size:12px;';
132:         errDiv.textContent = 'Error fetching CSRF: ' + err.message;
133:         document.body.appendChild(errDiv);
134:       });
135:   </script>
136: </body>
137: </html>`;
138: }
139: /**
140:  * Build error HTML page.
141:  */
142: function buildErrorHtml(title: string, message: string): string {
143:   const safeTitle = htmlEncode(title);
144:   const safeMessage = htmlEncode(message);
145:   return `<!DOCTYPE html>
146: <html><head><meta charset="utf-8"><title>${safeTitle}</title>
147: <style>
148:   body{display:flex;align-items:center;justify-content:center;min-height:100vh;
149:   margin:0;background:#0f172a;color:#ef4444;font-family:sans-serif;text-align:center;}
150:   h1{font-size:18px;margin:0 0 8px}p{color:#94a3b8;font-size:14px;margin:0}
151:   a{color:#f59e0b;font-size:13px;display:inline-block;margin-top:16px}
152: </style></head>
153: <body><div><h1>${safeTitle}</h1><p>${safeMessage}</p>
154: <a href="/">← Вернуться на главную</a></div></body></html>`;
155: }
156: export async function GET(request: NextRequest) {
157:   try {
158:     return await handleWpCallback(request);
159:   } catch (error) {
160:     // Top-level catch — prevents leaking stack traces on auth routes
161:     console.error("[WP-SSO] Unhandled error:", error);
162:     return new NextResponse(
163:       buildErrorHtml("Ошибка сервера", "Произошла внутренняя ошибка. Попробуйте позже."),
164:       { status: 500, headers: { "Content-Type": "text/html; charset=utf-8" } }
165:     );
166:   }
167: }
168: async function handleWpCallback(request: NextRequest) {
169:   const biUrl = request.nextUrl.origin;
170:   const { searchParams } = request.nextUrl;
171:   // ─── In development mode, redirect to dev login ───
172:   if (!IS_PRODUCTION) {
173:     return NextResponse.redirect(new URL("/login", biUrl));
174:   }
175:   // ─── Check PROXY_SECRET is configured ───
176:   if (!isProxySecretConfigured()) {
177:     console.error("[WP-SSO] PROXY_SECRET not configured — cannot verify SSO tokens");
178:     return new NextResponse(
179:       buildErrorHtml("Ошибка конфигурации", "PROXY_SECRET не настроен. Обратитесь к администратору."),
180:       { status: 500, headers: { "Content-Type": "text/html; charset=utf-8" } }
181:     );
182:   }
183:   const clientIp = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
184:     || request.headers.get("x-real-ip")?.trim()
185:     || "unknown";
186:   // ═══════════════════════════════════════════════════════════
187:   // METHOD 1: HMAC URL Parameters (from WordPress mu-plugin)
188:   // ?email=user@russilica.ru&role=administrator&ts=1234567890&sig=abc123...
189:   // ═══════════════════════════════════════════════════════════
190:   const emailParam = searchParams.get("email");
191:   const roleParam = searchParams.get("role");
192:   const tsParam = searchParams.get("ts");
193:   const sigParam = searchParams.get("sig");
194:   if (emailParam && roleParam && tsParam && sigParam) {
195:     const payload = await verifySsoUrlParams(emailParam, roleParam, tsParam, sigParam);
196:     if (payload) {
197:       const email = payload.email.toLowerCase().trim();
198:       // Corporate email check (defense-in-depth)
199:       if (!isCorporateEmail(email)) {
200:         console.warn(`[WP-SSO] Non-corporate email from HMAC: ${email}`);
201:         return new NextResponse(
202:           buildErrorHtml("Доступ запрещён", "Допускаются только корпоративные email @russilica.ru"),
203:           { status: 403, headers: { "Content-Type": "text/html; charset=utf-8" } }
204:         );
205:       }
206:       // Map WP role to BI role (unknown roles → "user" for security)
207:       const biRole = mapWpRoleToBiRole(payload.role);
208:       if (shouldLog) console.log(`[WP-SSO] HMAC auth success: role=${biRole}`);
209:       // Generate internal SSO token for the auto-submit form
210:       // We reuse the timestamp from the verified payload to maintain the original 5-minute window
211:       const ssoToken = generateSsoToken({
212:         email,
213:         role: biRole,
214:         timestamp: payload.timestamp,
215:       });
216:       return new NextResponse(
217:         buildSsoHtml(email, ssoToken),
218:         {
219:           status: 200,
220:           headers: {
221:             "Content-Type": "text/html; charset=utf-8",
222:             "Cache-Control": "no-store, no-cache, must-revalidate",
223:             "Content-Security-Policy": SSO_PAGE_CSP,
224:           },
225:         }
226:       );
227:     } else {
228:       console.warn(`[WP-SSO] Invalid HMAC signature from IP: ${clientIp}`);
229:       // Don't redirect back to WP with bad sig — could be an attack
230:       return new NextResponse(
231:         buildErrorHtml("Ошибка авторизации", "Недействительная или просроченная подпись. Попробуйте войти снова."),
232:         { status: 403, headers: { "Content-Type": "text/html; charset=utf-8" } }
233:       );
234:     }
235:   }
236:   // ═══════════════════════════════════════════════════════════
237:   // METHOD 2: Caddy Proxy Headers (alternative, for advanced setups)
238:   // X-Auth-User-Email, X-Auth-User-Role, X-Proxy-Secret
239:   // ═══════════════════════════════════════════════════════════
240:   const proxySecret = request.headers.get("x-proxy-secret");
241:   const headerEmail = request.headers.get("x-auth-user-email");
242:   const headerRole = request.headers.get("x-auth-user-role");
243:   if (proxySecret && headerEmail) {
244:     // Verify proxy secret via HMAC module
245:     // Direct proxy secret comparison (legacy Caddy forward_auth)
246:     // SECURITY: Use timing-safe comparison to prevent timing attacks
247:     const configuredSecret = process.env.PROXY_SECRET || "";
248:     if (configuredSecret && timingSafeEqualString(proxySecret, configuredSecret)) {
249:       const email = headerEmail.toLowerCase().trim();
250:       // Corporate email check
251:       if (!isCorporateEmail(email)) {
252:         console.warn(`[WP-SSO] Non-corporate email from proxy headers: ${email}`);
253:         return new NextResponse(
254:           buildErrorHtml("Доступ запрещён", "Допускаются только корпоративные email @russilica.ru"),
255:           { status: 403, headers: { "Content-Type": "text/html; charset=utf-8" } }
256:         );
257:       }
258:       const biRole = mapWpRoleToBiRole(headerRole);
259:       if (shouldLog) console.log(`[WP-SSO] Proxy header auth success: role=${biRole}`);
260:       // Generate internal SSO token
261:       const ssoToken = generateSsoToken({
262:         email,
263:         role: biRole,
264:         timestamp: Math.floor(Date.now() / 1000),
265:       });
266:       return new NextResponse(
267:         buildSsoHtml(email, ssoToken),
268:         {
269:           status: 200,
270:           headers: {
271:             "Content-Type": "text/html; charset=utf-8",
272:             "Cache-Control": "no-store, no-cache, must-revalidate",
273:             "Content-Security-Policy": SSO_PAGE_CSP,
274:           },
275:         }
276:       );
277:     } else {
278:       console.warn(`[WP-SSO] Invalid proxy secret from IP: ${clientIp}`);
279:     }
280:   }
281:   // ═══════════════════════════════════════════════════════════
282:   // No valid auth found — redirect to WordPress login
283:   // ═══════════════════════════════════════════════════════════
284:   if (shouldLog) console.log(`[WP-SSO] No valid auth, redirecting to WordPress login.`);
285:   const u = new URL(WP_LOGIN_URL);
286:   u.searchParams.set("redirect_to", `${biUrl}/api/auth/wp-callback`);
287:   return NextResponse.redirect(u.toString());
288: }
```

## File: src/lib/auth.ts
```typescript
  1: /**
  2:  * NextAuth.js v4 Configuration — RusSilica BI Terminal
  3:  *
  4:  * WordPress SSO Integration (HMAC-based):
  5:  * - WordPress generates HMAC-SHA256 signed tokens
  6:  * - BI terminal verifies tokens using shared PROXY_SECRET
  7:  * - No Caddy forward_auth required (simpler setup)
  8:  * - Also supports Caddy proxy headers as alternative
  9:  *
 10:  * Three auth methods in production:
 11:  * 1. HMAC SSO token (from Headless API or wp-callback)
 12:  * 2. Caddy proxy headers (alternative, for advanced setups)
 13:  * 3. Dev password (development mode only)
 14:  *
 15:  * Security:
 16:  * - NEXTAUTH_SECRET MANDATORY in production
 17:  * - PROXY_SECRET shared between WordPress and BI terminal
 18:  * - Timing-safe HMAC verification prevents timing attacks
 19:  * - 5-minute token expiry prevents replay attacks
 20:  * - Corporate email domain check as defense-in-depth
 21:  * - JWT sessions (8h expiry)
 22:  * - Secure cookie flags in production
 23:  */
 24: import type { NextAuthOptions } from "next-auth";
 25: import CredentialsProvider from "next-auth/providers/credentials";
 26: import { db } from "@/lib/db";
 27: import { verifySsoToken, isProxySecretConfigured, timingSafeEqualString } from "@/lib/sso-hmac";
 28: import { IS_PRODUCTION, shouldLog } from "@/lib/config";
 29: // ─── Typed Session Interface ───
 30: // NextAuth's default User/Session types don't include our custom fields.
 31: // We extend them here for type safety across the application.
 32: declare module "next-auth" {
 33:   interface User {
 34:     role?: string;
 35:   }
 36:   interface Session {
 37:     user: {
 38:       id?: string;
 39:       email?: string;
 40:       name?: string;
 41:       role?: string;
 42:     };
 43:     error?: string;
 44:   }
 45: }
 46: declare module "next-auth/jwt" {
 47:   interface JWT {
 48:     id?: string;
 49:     role?: string;
 50:   }
 51: }
 52: // ─── NEXTAUTH_SECRET — MANDATORY in production ───
 53: const NEXTAUTH_SECRET = process.env.NEXTAUTH_SECRET || (
 54:   process.env.NODE_ENV === "production"
 55:     ? undefined // Will cause a hard error below
 56:     : "rus-silica-bi-dev-secret-change-in-production"
 57: );
 58: if (process.env.NODE_ENV === "production" && !process.env.NEXTAUTH_SECRET) {
 59:   throw new Error(
 60:     "[AUTH] FATAL: NEXTAUTH_SECRET environment variable is REQUIRED in production! " +
 61:     "Generate one with: openssl rand -base64 32"
 62:   );
 63: }
 64: // ─── WordPress SSO Configuration ───
 65: const PROXY_SECRET = process.env.PROXY_SECRET || "";
 66: // ─── PROXY_SECRET — MANDATORY in production ───
 67: if (IS_PRODUCTION && !PROXY_SECRET) {
 68:   console.error(
 69:     "[AUTH] FATAL: PROXY_SECRET environment variable is REQUIRED in production! " +
 70:     "This must match the secret in your WordPress configuration. " +
 71:     "Generate one with: openssl rand -hex 32 " +
 72:     "ALL LOGIN ATTEMPTS WILL BE REJECTED until this is fixed."
 73:   );
 74: }
 75: // ─── Corporate Email Domain Restriction (defense-in-depth) ───
 76: const ALLOWED_EMAIL_DOMAINS = ["russilica.ru"];
 77: const ALLOWED_SPECIFIC_EMAILS = ["constantinejozefowicz@gmail.com"];
 78: export function isCorporateEmail(email: string): boolean {
 79:   if (ALLOWED_SPECIFIC_EMAILS.includes(email.toLowerCase())) {
 80:     return true;
 81:   }
 82:   const domain = email.split("@")[1]?.toLowerCase();
 83:   return ALLOWED_EMAIL_DOMAINS.includes(domain);
 84: }
 85: // ─── Role Mapping (Single Source of Truth) ───
 86: export function mapWpRoleToBiRole(wpRole: string | undefined | null): string {
 87:   const role = wpRole?.toLowerCase().trim() || "user";
 88:   return role === "administrator" || role === "admin" ? "admin" : "user";
 89: }
 90: // ─── Audit Logging (persisted to DB) ───
 91: async function auditLog(event: string, details: Record<string, unknown>, ip?: string): Promise<void> {
 92:   const timestamp = new Date().toISOString();
 93:   const logEntry = { timestamp, event, ...details };
 94:   if (shouldLog) console.log(`[AUDIT] ${JSON.stringify(logEntry)}`);
 95:   try {
 96:     await db.auditLog.create({
 97:       data: {
 98:         event,
 99:         email: typeof details.email === "string" ? details.email : null,
100:         role: typeof details.role === "string" ? details.role : null,
101:         targetId: typeof details.targetId === "string" ? details.targetId : null,
102:         ip: ip || null,
103:         details: JSON.stringify(details),
104:       },
105:     });
106:     // Compliance note: Audit logs are persisted indefinitely.
107:     // Consider adding a cron job or periodic cleanup task to delete logs older than 90 days:
108:     // DELETE FROM "AuditLog" WHERE "createdAt" < datetime('now', '-90 days');
109:   } catch (error) {
110:     // Never let audit log failure break authentication
111:     console.error("[AUDIT LOG ERROR]", error);
112:   }
113: }
114: // ─── NextAuth Configuration ───
115: export const authOptions: NextAuthOptions = {
116:   providers: [
117:     CredentialsProvider({
118:       id: "credentials",
119:       name: "credentials",
120:       credentials: {
121:         email: {
122:           label: "Email",
123:           type: "email",
124:           placeholder: "имя@russilica.ru",
125:         },
126:         password: {
127:           label: "Пароль",
128:           type: "password",
129:         },
130:       },
131:       async authorize(credentials, req) {
132:         // Get client IP for audit
133:         const headers = req?.headers as Record<string, string> | undefined;
134:         const ip = headers?.["x-forwarded-for"]?.split(",")[0]?.trim()
135:           || headers?.["x-real-ip"]?.trim()
136:           || "unknown";
137:         if (shouldLog) console.log("[AUTH DEBUG] Authorize called with credentials:", credentials ? "YES" : "NO");
138:         if (!IS_PRODUCTION && shouldLog) {
139:           console.log("[AUTH DEBUG] Request metadata:", {
140:             hasAuthHeader: !!headers?.["authorization"],
141:             hasCookie: !!headers?.["cookie"],
142:             ip: headers?.["x-forwarded-for"] ?? "unknown",
143:           });
144:         }
145:         // ═══════════════════════════════════════════════════════════
146:         // METHOD 1: HMAC SSO Token (from Headless API or wp-callback)
147:         // The password field contains: wp-sso-hmac|{email}|{role}|{ts}|{sig}
148:         // ═══════════════════════════════════════════════════════════
149:         if (credentials?.password?.startsWith("wp-sso-hmac|")) {
150:           if (shouldLog) console.log("[AUTH DEBUG] Processing HMAC token");
151:           if (!isProxySecretConfigured()) {
152:             await auditLog("LOGIN_BLOCKED_NO_SECRET", { reason: "proxy_secret_not_configured" }, ip);
153:             return null;
154:           }
155:           const payload = await verifySsoToken(credentials.password);
156:           if (!payload) {
157:             await auditLog("LOGIN_BLOCKED_INVALID_HMAC", { reason: "invalid_or_expired_hmac_token", email: credentials.email }, ip);
158:             return null;
159:           }
160:           const email = payload.email.toLowerCase().trim();
161:           // Verify email matches the one in the form
162:           if (credentials.email?.toLowerCase().trim() !== email) {
163:             await auditLog("LOGIN_BLOCKED_EMAIL_MISMATCH", { reason: "email_mismatch", formEmail: credentials.email, tokenEmail: email }, ip);
164:             return null;
165:           }
166:           // Corporate email check (defense-in-depth)
167:           if (!isCorporateEmail(email)) {
168:             await auditLog("LOGIN_DOMAIN_BLOCKED", { email, reason: "non_corporate_domain" }, ip);
169:             return null;
170:           }
171:           const biRole = mapWpRoleToBiRole(payload.role);
172:           await auditLog("LOGIN_SUCCESS_WP_SSO", { email, role: biRole, ip, source: "wordpress_sso_hmac" }, ip);
173:           return {
174:             id: email,
175:             email,
176:             name: email.split("@")[0],
177:             role: biRole,
178:           };
179:         }
180:         // ═══════════════════════════════════════════════════════════
181:         // METHOD 2: Caddy Proxy Headers (alternative)
182:         // ═══════════════════════════════════════════════════════════
183:         if (IS_PRODUCTION) {
184:           const proxySecret = headers?.["x-proxy-secret"];
185:           const headerEmail = headers?.["x-auth-user-email"];
186:           const headerRole = headers?.["x-auth-user-role"];
187:           if (proxySecret && PROXY_SECRET && timingSafeEqualString(proxySecret, PROXY_SECRET) && headerEmail) {
188:             const email = headerEmail.toLowerCase().trim();
189:             if (!isCorporateEmail(email)) {
190:               await auditLog("LOGIN_DOMAIN_BLOCKED", { email, reason: "non_corporate_domain_proxy" }, ip);
191:               return null;
192:             }
193:             const biRole = mapWpRoleToBiRole(headerRole);
194:             await auditLog("LOGIN_SUCCESS_WP_SSO", { email, role: biRole, ip, source: "wordpress_sso_proxy" }, ip);
195:             return {
196:               id: email,
197:               email,
198:               name: email.split("@")[0],
199:               role: biRole,
200:             };
201:           }
202:           // In production: no valid auth method found
203:           await auditLog("LOGIN_BLOCKED_NO_AUTH", { reason: "no_valid_auth_method_in_production" }, ip);
204:           return null;
205:         }
206:         // ═══════════════════════════════════════════════════════════
207:         // METHOD 3: Dev password (development mode only)
208:         // ═══════════════════════════════════════════════════════════
209:         if (!credentials?.email || !credentials?.password) {
210:           throw new Error("Введите email и пароль");
211:         }
212:         const email = credentials.email.toLowerCase().trim();
213:         const password = credentials.password;
214:         // Corporate email check
215:         if (!isCorporateEmail(email)) {
216:           await auditLog("LOGIN_DOMAIN_BLOCKED", { email, reason: "non_corporate_domain" }, ip);
217:           throw new Error("Допускаются только корпоративные email @russilica.ru");
218:         }
219:         // Dev password check
220:         const DEV_PASSWORD = process.env.DEV_PASSWORD || "dev1234";
221:         if (password !== DEV_PASSWORD) {
222:           await auditLog("LOGIN_FAILED", { email, reason: "wrong_password", ip }, ip);
223:           throw new Error("Неверный email или пароль");
224:         }
225:         // Dev mode: all authenticated users get admin role
226:         const biRole = "admin";
227:         await auditLog("LOGIN_SUCCESS_DEV", { email, role: biRole, ip, source: "dev_mode" }, ip);
228:         return {
229:           id: email,
230:           email,
231:           name: email.split("@")[0],
232:           role: biRole,
233:         };
234:       },
235:     }),
236:   ],
237:   session: {
238:     strategy: "jwt",
239:     maxAge: 8 * 60 * 60, // 8 hours
240:     updateAge: 1 * 60 * 60, // Update JWT every 1 hour
241:   },
242:   jwt: {
243:     secret: NEXTAUTH_SECRET,
244:     maxAge: 8 * 60 * 60,
245:   },
246:   secret: NEXTAUTH_SECRET,
247:   useSecureCookies: IS_PRODUCTION,
248:   pages: {
249:     signIn: "/login",
250:     error: "/login",
251:   },
252:   callbacks: {
253:     async jwt({ token, user }) {
254:       if (user) {
255:         token.id = user.id;
256:         token.role = user.role;
257:         return token;
258:       }
259:       return token;
260:     },
261:     async session({ session, token }) {
262:       if (session.user) {
263:         session.user.id = token.id as string;
264:         session.user.role = token.role as string;
265:       }
266:       return session;
267:     },
268:   },
269:   debug: false,
270:   theme: undefined,
271: };
```

## File: src/lib/bitrix.ts
```typescript
  1: /**
  2:  * Bitrix24 CRM API Helper
  3:  * All requests go through the backend — webhook URL is NEVER exposed to the frontend.
  4:  *
  5:  * Security measures:
  6:  * - Method allowlist: only known Bitrix24 CRM API methods are permitted
  7:  * - Input sanitization: all parameters are validated before forwarding
  8:  * - Error sanitization: raw API errors are logged server-side only, generic errors returned to client
  9:  */
 10: /**
 11:  * Allowed Bitrix24 API methods (allowlist to prevent SSRF)
 12:  */
 13: const ALLOWED_METHODS = new Set([
 14:   "crm.deal.fields",
 15:   "crm.deal.list",
 16:   "crm.deal.get",
 17:   "crm.company.fields",
 18:   "crm.company.list",
 19:   "crm.company.get",
 20:   "crm.activity.list",
 21:   "crm.stage.list",
 22:   "crm.status.list",
 23:   "crm.currency.list",
 24:   "crm.category.list",
 25:   "user.get",
 26:   "user.search",
 27: ]);
 28: /**
 29:  * Check if a hostname falls within the 172.16.0.0/12 private range (RFC 1918).
 30:  * This covers 172.16.x.x through 172.31.x.x — the previous code only checked 172.16.*
 31:  */
 32: function is172PrivateRange(hostname: string): boolean {
 33:   // Match 172.X.X.X pattern
 34:   const match = /^172\.(\d{1,3})\./.exec(hostname);
 35:   if (!match) return false;
 36:   const secondOctet = parseInt(match[1], 10);
 37:   return secondOctet >= 16 && secondOctet <= 31;
 38: }
 39: /**
 40:  * Build full Bitrix24 API URL from a method path.
 41:  * Validates method against allowlist to prevent SSRF.
 42:  */
 43: function buildUrl(method: string): string {
 44:   const WEBHOOK_URL = process.env.BITRIX_WEBHOOK_URL;
 45:   if (!WEBHOOK_URL) {
 46:     throw new Error("CRM integration is not configured.");
 47:   }
 48:   // Validate method against allowlist
 49:   if (!ALLOWED_METHODS.has(method)) {
 50:     throw new Error(`Invalid API method: ${method}`);
 51:   }
 52:   // Validate webhook URL format
 53:   const base = WEBHOOK_URL.replace(/\/+$/, "");
 54:   try {
 55:     const parsed = new URL(base);
 56:     if (parsed.protocol !== 'https:') {
 57:       throw new Error("Webhook URL must use HTTPS");
 58:     }
 59:     const hostname = parsed.hostname;
 60:     const isLocalhost = hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1' || hostname === '0.0.0.0';
 61:     const isAwsMetadata = hostname === '169.254.169.254';
 62:     const isPrivate = hostname.startsWith('10.') || hostname.startsWith('192.168.') || is172PrivateRange(hostname);
 63:     if (isLocalhost || isAwsMetadata || isPrivate) {
 64:       throw new Error("Webhook URL cannot point to private IP ranges or localhost");
 65:     }
 66:   } catch (e) {
 67:     if (e instanceof Error && e.message.includes("Webhook URL")) {
 68:       throw e;
 69:     }
 70:     throw new Error("Invalid webhook URL format");
 71:   }
 72:   return `${base}/${method}`;
 73: }
 74: /**
 75:  * Sanitize error for client — removes internal details.
 76:  * Full error is logged server-side only.
 77:  */
 78: function sanitizeError(error: unknown, context: string): Error {
 79:   // Log full error server-side
 80:   console.error(`[Bitrix24 ${context} Error]`, error);
 81:   // Return generic error to client
 82:   if (error instanceof Error) {
 83:     // Check for specific safe error types we can expose
 84:     if (error.message.includes("not configured")) {
 85:       return new Error("CRM integration is not configured. Contact your administrator.");
 86:     }
 87:     if (error.message.includes("Invalid API method")) {
 88:       return new Error("Invalid request parameters.");
 89:     }
 90:   }
 91:   return new Error(`Failed to ${context.toLowerCase()}. Please try again later.`);
 92: }
 93: /**
 94:  * Generic GET request to Bitrix24 REST API
 95:  */
 96: export async function bitrixGet<T = unknown>(
 97:   method: string,
 98:   params?: Record<string, string | number | boolean>
 99: ): Promise<T> {
100:   try {
101:     const url = new URL(buildUrl(method));
102:     if (params) {
103:       // Sanitize parameter keys — only allow safe characters
104:       Object.entries(params).forEach(([key, value]) => {
105:         // Prevent injection via parameter keys
106:         if (!/^[a-zA-Z0-9_>=<\[\]@%!]+$/.test(key)) {
107:           console.warn(`[Bitrix24] Rejected invalid param key: ${key}`);
108:           return;
109:         }
110:         url.searchParams.set(key, String(value));
111:       });
112:     }
113:     const response = await fetch(url.toString(), {
114:       method: "GET",
115:       headers: { "Content-Type": "application/json" },
116:       next: { revalidate: 0 },
117:       signal: AbortSignal.timeout(15_000), // 15s timeout to prevent hanging requests (DoS)
118:     });
119:     if (!response.ok) {
120:       throw new Error(`API returned status ${response.status}`);
121:     }
122:     const data = await response.json();
123:     if (data.error) {
124:       // SECURITY: Log sanitized error server-side only.
125:       // Do NOT log full error_description — it may contain internal URLs or tokens.
126:       console.error(`[Bitrix24 API Error] Method: ${method}, Error: ${data.error}`);
127:       throw new Error(`API request failed`);
128:     }
129:     return data as T;
130:   } catch (error) {
131:     throw sanitizeError(error, method);
132:   }
133: }
134: /**
135:  * Generic POST request to Bitrix24 REST API.
136:  * Body parameters are validated and sanitized before forwarding.
137:  */
138: export async function bitrixPost<T = unknown>(
139:   method: string,
140:   body?: Record<string, unknown>
141: ): Promise<T> {
142:   try {
143:     const url = buildUrl(method);
144:     // Sanitize body — remove any keys that look suspicious
145:     const sanitizedBody: Record<string, unknown> = {};
146:     if (body) {
147:       for (const [key, value] of Object.entries(body)) {
148:         // Skip suspicious keys (prototype pollution protection)
149:         if (key === "__proto__" || key === "constructor" || key === "prototype") {
150:           continue;
151:         }
152:         // Validate key format — only allow safe characters
153:         if (!/^[a-zA-Z0-9_>=<\[\]@%!]+$/.test(key)) {
154:           console.warn(`[Bitrix24] Rejected invalid body key: ${key}`);
155:           continue;
156:         }
157:         sanitizedBody[key] = value;
158:       }
159:     }
160:     const response = await fetch(url, {
161:       method: "POST",
162:       headers: { "Content-Type": "application/json" },
163:       body: Object.keys(sanitizedBody).length > 0 ? JSON.stringify(sanitizedBody) : undefined,
164:       signal: AbortSignal.timeout(30_000), // 30s timeout for POST (may need longer for pagination)
165:     });
166:     if (!response.ok) {
167:       throw new Error(`API returned status ${response.status}`);
168:     }
169:     const data = await response.json();
170:     if (data.error) {
171:       // SECURITY: Log sanitized error server-side only.
172:       // Do NOT log full error_description — it may contain internal URLs or tokens.
173:       console.error(`[Bitrix24 API Error] Method: ${method}, Error: ${data.error}`);
174:       throw new Error(`API request failed`);
175:     }
176:     return data as T;
177:   } catch (error) {
178:     throw sanitizeError(error, method);
179:   }
180: }
181: /**
182:  * System fields to EXCLUDE from the column selector.
183:  * Based on real Bitrix24 CRM deal fields schema — these are internal IDs,
184:  * system metadata, UTM tracking, and other non-informative fields.
185:  */
186: export const SYSTEM_FIELDS_TO_EXCLUDE = new Set([
187:   // Internal IDs — never useful for business users
188:   "ID",
189:   "MOVED_BY_ID",
190:   "MODIFY_BY_ID",
191:   "CREATED_BY_ID",
192:   "LEAD_ID",
193:   "COMPANY_ID",
194:   "CONTACT_ID",
195:   "CONTACT_IDS",
196:   "QUOTE_ID",
197:   "MYCOMPANY_ID",
198:   "PARENT_ID_1032",
199:   "ORIGINATOR_ID",
200:   "ORIGIN_ID",
201:   // System metadata / internal flags
202:   "IS_NEW",
203:   "IS_RECURRING",
204:   "IS_RETURN_CUSTOMER",
205:   "IS_REPEATED_APPROACH",
206:   "IS_MANUAL_OPPORTUNITY",
207:   "STAGE_SEMANTIC_ID",
208:   "PREVIOUS_STAGE_ID",
209:   "PROBABILITY",
210:   "OPENED",
211:   "CLOSED",
212:   "ADDITIONAL_INFO",
213:   "LOCATION_ID",
214:   "MOVED_TIME",
215:   "LAST_ACTIVITY_TIME",
216:   "LAST_ACTIVITY_BY",
217:   "LAST_COMMUNICATION_TIME",
218:   // UTM tracking — not informative for BI
219:   "UTM_SOURCE",
220:   "UTM_MEDIUM",
221:   "UTM_CAMPAIGN",
222:   "UTM_CONTENT",
223:   "UTM_TERM",
224:   // Source descriptions — usually empty or noise
225:   "SOURCE_DESCRIPTION",
226:   "SEARCH_INDEX",
227:   // Explicitly requested to be removed from UI
228:   "DATE_CREATE",
229:   "TITLE",
230:   "TAX_VALUE",
231:   "UF_CRM_692573380C4F0",
232:   "UF_CRM_1774878993375",
233:   "UF_CRM_6915D8C25162A",
234:   "UF_CRM_69257337E7E9B",
235:   "UF_CRM_1774878835644",
236: ]);
237: /**
238:  * Check if a field is a system/internal field that should be hidden.
239:  * Uses both the explicit set and pattern matching for *_ID fields.
240:  */
241: export function isSystemField(fieldId: string, fieldMeta?: Record<string, unknown>): boolean {
242:   // Explicitly excluded fields (checked first so we can exclude specific UF_CRM_* fields)
243:   if (SYSTEM_FIELDS_TO_EXCLUDE.has(fieldId)) return true;
244:   // Custom fields (UF_CRM_*) are NEVER system fields — always keep them (unless explicitly excluded above)
245:   if (fieldId.startsWith("UF_CRM_")) return false;
246:   // Fields ending with _ID that are not custom — these are internal references
247:   if (fieldId.endsWith("_ID") && !fieldId.startsWith("UF_")) return true;
248:   // Read-only internal fields with no useful title (title matches field ID)
249:   if (fieldMeta) {
250:     const title = fieldMeta.title as string | undefined;
251:     // Bitrix24 returns isReadOnly as "Y"/"N" or true/false — handle both
252:     const isReadOnly = fieldMeta.isReadOnly === true || fieldMeta.isReadOnly === "Y";
253:     if (title && title === fieldId && isReadOnly) {
254:       return true;
255:     }
256:   }
257:   // File fields — not displayable in table
258:   if (fieldMeta?.type === "file") return true;
259:   return false;
260: }
261: /**
262:  * Bitrix24 field metadata type (real API response format)
263:  */
264: export interface BitrixField {
265:   type: string;
266:   isRequired: boolean | string;
267:   isReadOnly: boolean | string;
268:   isImmutable: boolean | string;
269:   isMultiple: boolean | string;
270:   isDynamic: boolean | string;
271:   title: string;
272:   listLabel?: string;
273:   formLabel?: string;
274:   filterLabel?: string;
275:   statusType?: string;
276:   items?: Array<{ ID: string; VALUE: string }>;
277:   settings?: Record<string, unknown>;
278:   isDeprecated?: boolean;
279: }
280: /**
281:  * Bitrix24 deal type
282:  */
283: export interface BitrixDeal {
284:   [key: string]: string | string[] | number | null;
285: }
286: /**
287:  * Bitrix24 fields API response — returns object with field IDs as keys
288:  */
289: export interface BitrixFieldsResponse {
290:   result: Record<string, BitrixField>;
291: }
292: /**
293:  * Bitrix24 deals list API response
294:  */
295: export interface BitrixDealsResponse {
296:   result: BitrixDeal[];
297:   next?: number;
298:   total?: number;
299: }
```

## File: src/app/api/bitrix/deals/route.ts
```typescript
  1: import { NextRequest, NextResponse } from "next/server";
  2: import { bitrixPost, type BitrixDealsResponse } from "@/lib/bitrix";
  3: import { requireAuth, isAuthError } from "@/lib/auth-guard";
  4: import pLimit from "p-limit";
  5: export const dynamic = "force-dynamic";
  6: export interface DealsRequestBody {
  7:   select?: string[];
  8:   filter?: Record<string, string | string[]>;
  9:   order?: Record<string, string>;
 10:   start?: number;
 11: }
 12: // ─── Input Validation Constants ───
 13: const MAX_SELECT_FIELDS = 200;
 14: const MAX_FILTER_KEYS = 50;
 15: const MAX_START_VALUE = 100000;
 16: const MAX_ORDER_KEYS = 10;
 17: const MAX_FILTER_VALUE_LENGTH = 1000; // Prevent oversized filter values
 18: const ALLOWED_ORDER_DIRECTIONS = new Set(["ASC", "DESC"]);
 19: const SAFE_FIELD_NAME_PATTERN = /^[a-zA-Z0-9_]+(\.[a-zA-Z0-9_]+)?$/;
 20: const DEFAULT_SELECT_FIELDS = ["*", "UF_*"];
 21: /**
 22:  * Validate and sanitize the request body for deals endpoint.
 23:  * Returns sanitized body or throws error with safe message.
 24:  */
 25: function validateDealsRequest(body: unknown): DealsRequestBody {
 26:   if (!body || typeof body !== "object" || Array.isArray(body)) {
 27:     throw new Error("Invalid request format");
 28:   }
 29:   const raw = body as Record<string, unknown>;
 30:   // Validate `select`
 31:   let select: string[] = [...DEFAULT_SELECT_FIELDS];
 32:   if (raw.select !== undefined) {
 33:     if (!Array.isArray(raw.select)) {
 34:       throw new Error("Parameter 'select' must be an array");
 35:     }
 36:     if (raw.select.length > MAX_SELECT_FIELDS) {
 37:       throw new Error(`Parameter 'select' exceeds maximum of ${MAX_SELECT_FIELDS} fields`);
 38:     }
 39:     // Validate each field name
 40:     select = raw.select.map((s: unknown) => {
 41:       if (typeof s !== "string") {
 42:         throw new Error("Each 'select' item must be a string");
 43:       }
 44:       if (!SAFE_FIELD_NAME_PATTERN.test(s) && s !== "*" && s !== "UF_*") {
 45:         throw new Error("Invalid field name in 'select' parameter");
 46:       }
 47:       return s;
 48:     });
 49:   }
 50:   // Force COMPANY_TITLE to be requested so the frontend can use it as a fallback
 51:   if (!select.includes("COMPANY_TITLE") && !select.includes("*")) {
 52:     select.push("COMPANY_TITLE");
 53:   }
 54:   // Validate `filter`
 55:   let filter: Record<string, string | string[]> = {};
 56:   if (raw.filter !== undefined) {
 57:     if (typeof raw.filter !== "object" || Array.isArray(raw.filter)) {
 58:       throw new Error("Parameter 'filter' must be an object");
 59:     }
 60:     const filterKeys = Object.keys(raw.filter as Record<string, unknown>);
 61:     if (filterKeys.length > MAX_FILTER_KEYS) {
 62:       throw new Error(`Parameter 'filter' exceeds maximum of ${MAX_FILTER_KEYS} keys`);
 63:     }
 64:     for (const key of filterKeys) {
 65:       // Validate filter key format (allow >=, <=, etc. prefixes)
 66:       if (!/^[><=!]*[a-zA-Z0-9_]+$/.test(key)) {
 67:         throw new Error("Invalid key in 'filter' parameter");
 68:       }
 69:       const value = (raw.filter as Record<string, unknown>)[key];
 70:       if (typeof value === "string") {
 71:         if (value.length > MAX_FILTER_VALUE_LENGTH) {
 72:           throw new Error(`Filter value for key '${key}' exceeds maximum length of ${MAX_FILTER_VALUE_LENGTH}`);
 73:         }
 74:         filter[key] = value;
 75:       } else if (Array.isArray(value) && value.every((v) => typeof v === "string")) {
 76:         if (value.some((v) => v.length > MAX_FILTER_VALUE_LENGTH)) {
 77:           throw new Error(`Filter value exceeds maximum length of ${MAX_FILTER_VALUE_LENGTH}`);
 78:         }
 79:         filter[key] = value as string[];
 80:       } else {
 81:         throw new Error("Invalid value in 'filter' parameter");
 82:       }
 83:     }
 84:   }
 85:   // Validate `order`
 86:   let order: Record<string, string> = { DATE_CREATE: "DESC" };
 87:   if (raw.order !== undefined) {
 88:     if (typeof raw.order !== "object" || Array.isArray(raw.order)) {
 89:       throw new Error("Parameter 'order' must be an object");
 90:     }
 91:     const orderKeys = Object.keys(raw.order as Record<string, unknown>);
 92:     if (orderKeys.length > MAX_ORDER_KEYS) {
 93:       throw new Error(`Parameter 'order' exceeds maximum of ${MAX_ORDER_KEYS} keys`);
 94:     }
 95:     for (const key of orderKeys) {
 96:       if (!SAFE_FIELD_NAME_PATTERN.test(key)) {
 97:         throw new Error("Invalid key in 'order' parameter");
 98:       }
 99:       const dir = (raw.order as Record<string, unknown>)[key];
100:       if (typeof dir !== "string" || !ALLOWED_ORDER_DIRECTIONS.has(dir.toUpperCase())) {
101:         throw new Error(`Invalid order direction for key '${key}': must be ASC or DESC`);
102:       }
103:       order[key] = dir.toUpperCase();
104:     }
105:   }
106:   // Validate `start`
107:   let start = 0;
108:   if (raw.start !== undefined) {
109:     if (typeof raw.start !== "number" || !Number.isInteger(raw.start) || raw.start < 0) {
110:       throw new Error("Parameter 'start' must be a non-negative integer");
111:     }
112:     if (raw.start > MAX_START_VALUE) {
113:       throw new Error(`Parameter 'start' exceeds maximum value of ${MAX_START_VALUE}`);
114:     }
115:     start = raw.start;
116:   }
117:   return { select, filter, order, start };
118: }
119: export async function POST(request: NextRequest) {
120:   // ─── SECURITY: Require authentication ───
121:   const authResult = await requireAuth();
122:   if (isAuthError(authResult)) return authResult;
123:   try {
124:     // Limit request body size to 10KB to prevent DoS via oversized payloads
125:     const rawBody = await request.text();
126:     if (rawBody.length > 10_000) {
127:       return NextResponse.json(
128:         { success: false, error: "Request body too large", deals: [], total: 0 },
129:         { status: 413 }
130:       );
131:     }
132:     // Parse and validate request body
133:     let body: unknown;
134:     try {
135:       body = JSON.parse(rawBody);
136:     } catch {
137:       return NextResponse.json(
138:         { success: false, error: "Invalid JSON in request body", deals: [], total: 0 },
139:         { status: 400 }
140:       );
141:     }
142:     const validated = validateDealsRequest(body);
143:     // Build Bitrix24 API request with validated parameters
144:     const apiBody: Record<string, unknown> = {
145:       select: validated.select,
146:       filter: validated.filter,
147:       order: validated.order,
148:       start: validated.start,
149:     };
150:     const data = await bitrixPost<BitrixDealsResponse>(
151:       "crm.deal.list",
152:       apiBody
153:     );
154:     // Fetch all pages if there are more results
155:     let allDeals = data.result || [];
156:     // Preserve the ACTUAL total from Bitrix24 (not just fetched count)
157:     // This is critical for the UI to show "X из Y" correctly when there are
158:     // more deals than our pagination limit can fetch
159:     const bitrixTotal = data.total ?? allDeals.length;
160:     if (data.next && bitrixTotal > 50) {
161:       const limit = pLimit(5); // Max 5 concurrent requests to respect Bitrix limits
162:       const promises = [];
163:       const MAX_DEALS_TO_FETCH = 1000;
164:       const targetTotal = Math.min(bitrixTotal, MAX_DEALS_TO_FETCH);
165:       // Generate promises for remaining pages
166:       for (let offset = 50; offset < targetTotal; offset += 50) {
167:         promises.push(
168:           limit(() => bitrixPost<BitrixDealsResponse>("crm.deal.list", {
169:             ...apiBody,
170:             start: offset,
171:           }))
172:         );
173:       }
174:       const results = await Promise.allSettled(promises);
175:       for (const res of results) {
176:         if (res.status === "fulfilled" && res.value.result) {
177:           allDeals = [...allDeals, ...res.value.result];
178:         }
179:       }
180:     }
181:     const truncated = bitrixTotal > allDeals.length;
182:     return NextResponse.json({
183:       success: true,
184:       deals: allDeals,
185:       total: bitrixTotal,
186:       truncated,
187:       fetched: allDeals.length,
188:       warning: truncated ? "Данные усечены. Показаны последние 1000 сделок." : undefined
189:     });
190:   } catch (error) {
191:     console.error("[Deals API Error] Full error details:", error);
192:     // Return sanitized error message to client
193:     const message = error instanceof Error ? error.message : "Failed to fetch deals";
194:     // Don't expose internal error details
195:     const safeMessage = message.includes("not configured")
196:       ? message
197:       : message.includes("Invalid")
198:       ? message
199:       : message.includes("exceeds maximum")
200:       ? message
201:       : message.includes("must be")
202:       ? message
203:       : "Failed to fetch deals. Please try again later.";
204:     return NextResponse.json(
205:       {
206:         success: false,
207:         error: safeMessage,
208:         deals: [],
209:         total: 0,
210:       },
211:       { status: message.includes("Invalid") || message.includes("must be") || message.includes("exceeds") ? 400 : 500 }
212:     );
213:   }
214: }
```

## File: src/hooks/use-table-state.ts
```typescript
  1: import { useMemo, useCallback } from "react";
  2: import { useShallow } from "zustand/react/shallow";
  3: import { useDashboardStore, type DealData } from "@/store/dashboard-store";
  4: import { RESPONSIBLE_FIELD_ID } from "@/lib/crm-constants";
  5: export function useTableState() {
  6:   const {
  7:     deals,
  8:     fields,
  9:     selectedColumns,
 10:     searchQuery,
 11:     columnSort,
 12:     columnFilters,
 13:     userNames,
 14:     companiesData,
 15:     activitiesData,
 16:   } = useDashboardStore(useShallow((state) => ({
 17:     deals: state.deals,
 18:     fields: state.fields,
 19:     selectedColumns: state.selectedColumns,
 20:     searchQuery: state.searchQuery,
 21:     columnSort: state.columnSort,
 22:     columnFilters: state.columnFilters,
 23:     userNames: state.userNames,
 24:     companiesData: state.companiesData,
 25:     activitiesData: state.activitiesData,
 26:   })));
 27:   const fieldMap = useMemo(
 28:     () => new Map(fields.map((f) => [f.id, f])),
 29:     [fields]
 30:   );
 31:   const resolveValue = useCallback(
 32:     (deal: DealData, colId: string): string => {
 33:       const raw = deal[colId];
 34:       const field = fieldMap.get(colId);
 35:       if (raw === null || raw === undefined || raw === "") return "";
 36:       if (colId === RESPONSIBLE_FIELD_ID) {
 37:         const id = String(raw);
 38:         const userName = userNames[id]?.trim();
 39:         const dealName = String(deal.ASSIGNED_BY_NAME || "").trim();
 40:         return userName || dealName || `ID ${id}`;
 41:       }
 42:       if (colId === "ACTIVITY_LAST" || colId === "ACTIVITY_NEXT") {
 43:         const dealId = String(deal.ID || deal.id || "");
 44:         if (!dealId || !activitiesData[dealId]) return "";
 45:         const activity = colId === "ACTIVITY_LAST" ? activitiesData[dealId].last : activitiesData[dealId].next;
 46:         if (!activity) return "";
 47:         const dateStr = activity.DEADLINE || activity.CREATED;
 48:         const formattedDate = dateStr ? new Date(dateStr).toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit" }) : "";
 49:         const text = activity.DESCRIPTION ? `${activity.SUBJECT} — ${activity.DESCRIPTION}` : activity.SUBJECT;
 50:         const cleanText = text.replace(/<[^>]*>?/gm, '');
 51:         return `${formattedDate ? formattedDate + ": " : ""}${cleanText}`;
 52:       }
 53:       if (colId === "COMPANY_TITLE") {
 54:         // 1. Prefer direct value from deal (fast path)
 55:         const directTitle = String(deal.COMPANY_TITLE || "").trim();
 56:         if (directTitle) return directTitle;
 57:         // 2. Fallback to companiesData via COMPANY_ID
 58:         const companyId = String(deal.COMPANY_ID || "").trim();
 59:         if (companyId && companiesData?.[companyId]) {
 60:           const companyTitle = String(companiesData[companyId].TITLE || "").trim();
 61:           if (companyTitle) return companyTitle;
 62:         }
 63:         if (companyId === "1627") {
 64:           console.log("COMPANY_TITLE resolve for 1627:", { directTitle, companyId, companyData: companiesData?.[companyId] });
 65:         }
 66:         // 3. No data → return empty (CellValue will render dash)
 67:         return "";
 68:       }
 69:       if (colId.startsWith("COMPANY_")) {
 70:         const companyId = String(deal.COMPANY_ID || "");
 71:         if (!companyId) return "";
 72:         let companyFieldId = colId.replace("COMPANY_", "");
 73:         if (companyFieldId === "ID") companyFieldId = "TITLE";
 74:         const company = companiesData[companyId];
 75:         if (!company) {
 76:           if (companyFieldId === "TITLE") return `ID ${companyId}`;
 77:           return "";
 78:         }
 79:         const rawCompanyVal = company[companyFieldId];
 80:         if (rawCompanyVal === null || rawCompanyVal === undefined || rawCompanyVal === "") {
 81:           if (companyFieldId === "TITLE") {
 82:             const title = String(company.TITLE || "").trim();
 83:             return title || `ID ${companyId}`;
 84:           }
 85:           return "";
 86:         }
 87:         if (field?.listValues && rawCompanyVal) {
 88:           if (Array.isArray(rawCompanyVal)) {
 89:             return rawCompanyVal
 90:               .map((v) => {
 91:                 const listVal = field.listValues?.find((lv) => lv.ID === String(v));
 92:                 return listVal?.VALUE || String(v);
 93:               })
 94:               .join(", ");
 95:           }
 96:           const val = String(rawCompanyVal);
 97:           const listVal = field.listValues.find((lv) => lv.ID === val);
 98:           if (listVal) return listVal.VALUE;
 99:         }
100:         if (Array.isArray(rawCompanyVal)) {
101:           return rawCompanyVal.join(", ");
102:         }
103:         return String(rawCompanyVal);
104:       }
105:       if (field?.listValues && raw) {
106:         if (Array.isArray(raw)) {
107:           return raw
108:             .map((v) => {
109:               const listVal = field.listValues?.find((lv) => lv.ID === String(v));
110:               return listVal?.VALUE || String(v);
111:             })
112:             .join(", ");
113:         }
114:         const val = String(raw);
115:         const listVal = field.listValues.find((lv) => lv.ID === val);
116:         if (listVal) return listVal.VALUE;
117:       }
118:       if (Array.isArray(raw)) {
119:         return raw.join(", ");
120:       }
121:       return String(raw);
122:     },
123:     [fieldMap, userNames, companiesData, activitiesData]
124:   );
125:   const getSortValue = useCallback(
126:     (deal: DealData, colId: string): string | number => {
127:       const field = fieldMap.get(colId);
128:       const raw = deal[colId];
129:       if (raw === null || raw === undefined || raw === "") return "";
130:       if (
131:         field?.type === "double" ||
132:         field?.type === "integer" ||
133:         field?.type === "money"
134:       ) {
135:         const num = parseFloat(String(raw));
136:         return isNaN(num) ? 0 : num;
137:       }
138:       if (field?.type === "date" || field?.type === "datetime") {
139:         const d = new Date(String(raw));
140:         return isNaN(d.getTime()) ? 0 : d.getTime();
141:       }
142:       if (field?.listValues && raw) {
143:         return resolveValue(deal, colId);
144:       }
145:       if (colId === RESPONSIBLE_FIELD_ID) {
146:         return resolveValue(deal, colId).toLowerCase();
147:       }
148:       if (colId.startsWith("COMPANY_")) {
149:         return resolveValue(deal, colId).toLowerCase();
150:       }
151:       return String(raw).toLowerCase();
152:     },
153:     [fieldMap, resolveValue]
154:   );
155:   const columns = useMemo(() => {
156:     if (selectedColumns.length > 0 && fields.length > 0) {
157:       return selectedColumns.filter((colId) => fieldMap.has(colId));
158:     }
159:     if (selectedColumns.length > 0) {
160:       return selectedColumns;
161:     }
162:     if (deals.length > 0) {
163:       return Object.keys(deals[0]).slice(0, 8);
164:     }
165:     return [];
166:   }, [selectedColumns, fields.length, fieldMap, deals]);
167:   const searchedDeals = useMemo(() => {
168:     if (!searchQuery.trim()) return deals;
169:     const q = searchQuery.toLowerCase();
170:     return deals.filter((deal) => {
171:       const assignedById = String(deal.ASSIGNED_BY_ID || "");
172:       if (assignedById) {
173:         const responsibleName =
174:           userNames[assignedById] || String(deal.ASSIGNED_BY_NAME || "");
175:         if (responsibleName.toLowerCase().includes(q)) return true;
176:       }
177:       const companyId = String(deal.COMPANY_ID || "");
178:       if (companyId) {
179:         const companyName = companiesData[companyId]?.TITLE || `ID ${companyId}`;
180:         if (companyName.toLowerCase().includes(q)) return true;
181:       }
182:       return columns.some((colId) => {
183:         const resolved = resolveValue(deal, colId);
184:         return resolved.toLowerCase().includes(q);
185:       });
186:     });
187:   }, [deals, searchQuery, resolveValue, userNames, companiesData, columns]);
188:   const filteredDeals = useMemo(() => {
189:     if (columnFilters.length === 0) return searchedDeals;
190:     return searchedDeals.filter((deal) =>
191:       columnFilters.every((filter) => {
192:         if (!filter.value.trim()) return true;
193:         const resolved = resolveValue(deal, filter.columnId);
194:         return resolved.toLowerCase().includes(filter.value.toLowerCase());
195:       })
196:     );
197:   }, [searchedDeals, columnFilters, resolveValue]);
198:   const sortedDeals = useMemo(() => {
199:     if (!columnSort.direction || !columnSort.columnId) return filteredDeals;
200:     const colId = columnSort.columnId;
201:     const dir = columnSort.direction === "asc" ? 1 : -1;
202:     return [...filteredDeals].sort((a, b) => {
203:       const aVal = getSortValue(a, colId);
204:       const bVal = getSortValue(b, colId);
205:       if (typeof aVal === "number" && typeof bVal === "number") {
206:         return (aVal - bVal) * dir;
207:       }
208:       const aStr = String(aVal);
209:       const bStr = String(bVal);
210:       return aStr.localeCompare(bStr, "ru") * dir;
211:     });
212:   }, [filteredDeals, columnSort, getSortValue]);
213:   return {
214:     fieldMap,
215:     resolveValue,
216:     getSortValue,
217:     searchedDeals,
218:     filteredDeals,
219:     sortedDeals,
220:     columns,
221:   };
222: }
```

## File: src/app/api/bitrix/users/route.ts
```typescript
 1: import { NextRequest, NextResponse } from "next/server";
 2: import { bitrixGet, bitrixPost } from "@/lib/bitrix";
 3: import { requireAuthOnly } from "@/lib/auth-guard";
 4: import pLimit from "p-limit";
 5: export const dynamic = "force-dynamic";
 6: /**
 7:  * GET /api/bitrix/users
 8:  * Fetches all responsible person names from Bitrix24 with pagination.
 9:  *
10:  * SECURITY: Requires authentication. Does NOT expose the webhook URL.
11:  * It only returns user ID + Name pairs for display purposes.
12:  */
13: export async function GET(request: NextRequest) {
14:   // ─── SECURITY: Require authentication ───
15:   const authError = await requireAuthOnly();
16:   if (authError) return authError;
17:   try {
18:     const userMap: Record<string, string> = {};
19:     const MAX_ITERATIONS = 50; // 50 * 50 = 2500 users max
20:     // First request to get total count
21:     const initialData = await bitrixPost<{
22:       result: Array<{ ID: string; NAME: string; LAST_NAME: string; SECOND_NAME: string }>;
23:       total?: number;
24:       next?: number;
25:     }>("user.get", { start: 0 });
26:     if (Array.isArray(initialData.result)) {
27:       for (const user of initialData.result) {
28:         const fullName = [user.NAME, user.LAST_NAME, user.SECOND_NAME]
29:           .filter(Boolean)
30:           .join(" ")
31:           .trim();
32:         userMap[user.ID] = fullName || `ID ${user.ID}`;
33:       }
34:     }
35:     const total = initialData.total || 0;
36:     const promises = [];
37:     const limit = pLimit(5);
38:     // Fetch remaining pages in parallel
39:     if (total > 50) {
40:       const remainingPages = Math.min(Math.ceil(total / 50) - 1, MAX_ITERATIONS - 1);
41:       for (let i = 1; i <= remainingPages; i++) {
42:         promises.push(
43:           limit(() => bitrixPost<{
44:             result: Array<{ ID: string; NAME: string; LAST_NAME: string; SECOND_NAME: string }>;
45:           }>("user.get", { start: i * 50 }).catch(e => {
46:             console.error(`[Users API] Failed to fetch users batch at start ${i * 50}:`, e);
47:             return null;
48:           }))
49:         );
50:       }
51:       const results = await Promise.all(promises);
52:       for (const data of results) {
53:         if (data && Array.isArray(data.result)) {
54:           for (const user of data.result) {
55:             const fullName = [user.NAME, user.LAST_NAME, user.SECOND_NAME]
56:               .filter(Boolean)
57:               .join(" ")
58:               .trim();
59:             userMap[user.ID] = fullName || `ID ${user.ID}`;
60:           }
61:         }
62:       }
63:     }
64:     console.log(`[Users API] Total users fetched: ${Object.keys(userMap).length}`);
65:     return NextResponse.json({ success: true, users: userMap });
66:   } catch (error) {
67:     console.error("[Users API Error]", error);
68:     const message =
69:       error instanceof Error && error.message.includes("not configured")
70:         ? error.message
71:         : "Failed to fetch users.";
72:     return NextResponse.json(
73:       { success: false, error: message, users: {} },
74:       { status: 500 }
75:     );
76:   }
77: }
```

## File: src/store/dashboard-store.ts
```typescript
  1: import { create } from "zustand";
  2: import { persist } from "zustand/middleware";
  3: import { DEMO_FIELDS, generateDemoDeals } from "@/lib/demo-data";
  4: import {
  5:   DEAL_TABLE_DEFAULT_COLUMNS,
  6:   RESPONSIBLE_FIELD_ID,
  7: } from "@/lib/crm-constants";
  8: // ─── Client-side fetch timeout (prevents infinite loading spinner) ───
  9: // Server-side bitrix helpers already have 15s/30s timeouts,
 10: // but the client→server fetch had NO timeout — if the API hangs,
 11: // the user sees a forever-spinning loader.
 12: const CLIENT_FETCH_TIMEOUT_MS = 30_000; // 30 seconds
 13: function fetchWithTimeout(url: string, options?: RequestInit): Promise<Response> {
 14:   const controller = new AbortController();
 15:   const timeoutId = setTimeout(() => controller.abort(), CLIENT_FETCH_TIMEOUT_MS);
 16:   return fetch(url, { ...options, signal: controller.signal }).finally(() => {
 17:     clearTimeout(timeoutId);
 18:   });
 19: }
 20: export interface FieldInfo {
 21:   id: string;
 22:   title: string;
 23:   type: string;
 24:   isMultiple: boolean;
 25:   isSortable: boolean;
 26:   listValues?: Array<{ ID: string; VALUE: string }>;
 27: }
 28: export type DateFilterPreset =
 29:   | "all"
 30:   | "7days"
 31:   | "14days"
 32:   | "30days"
 33:   | "90days"
 34:   | "custom";
 35: export interface DateFilter {
 36:   preset: DateFilterPreset;
 37:   customFrom?: string;
 38:   customTo?: string;
 39: }
 40: export type SortDirection = "asc" | "desc" | null;
 41: export interface ColumnSort {
 42:   columnId: string;
 43:   direction: SortDirection;
 44: }
 45: export interface ColumnFilter {
 46:   columnId: string;
 47:   value: string;
 48: }
 49: export interface DealData {
 50:   [key: string]: string | string[] | number | null;
 51: }
 52: export interface SavedView {
 53:   id: string;
 54:   name: string;
 55:   dateFilter: DateFilter;
 56:   pipelineFilter: string;
 57:   responsibleFilter: string;
 58:   selectedColumns: string[];
 59:   columnSort: ColumnSort;
 60:   createdAt: number;
 61: }
 62: interface DashboardState {
 63:   // Configuration
 64:   isConfigured: boolean | null;
 65:   isDemoMode: boolean;
 66:   // Fields
 67:   fields: FieldInfo[];
 68:   fieldsLoading: boolean;
 69:   fieldsError: string | null;
 70:   // Selected columns
 71:   selectedColumns: string[];
 72:   columnSelectorOpen: boolean;
 73:   // Deals
 74:   deals: DealData[];
 75:   allDeals: DealData[];
 76:   dealsLoading: boolean;
 77:   dealsError: string | null;
 78:   dealsTotal: number;
 79:   dealsTruncated: boolean;
 80:   dealsFetched: number;
 81:   // Date filter
 82:   dateFilter: DateFilter;
 83:   // Search
 84:   searchQuery: string;
 85:   // Column sorting
 86:   columnSort: ColumnSort;
 87:   // Column filters
 88:   columnFilters: ColumnFilter[];
 89:   // Pagination
 90:   currentPage: number;
 91:   pageSize: number;
 92:   // New state fields for header features
 93:   lastSyncAt: number | null;
 94:   lastReadAlertsAt: number | null;
 95:   pipelineFilter: string;
 96:   responsibleFilter: string;
 97:   viewMode: "table" | "cards" | "kanban";
 98:   connectionStatus: "checking" | "connected" | "demo" | "disconnected";
 99:   appLoaded: boolean;
100:   savedViews: SavedView[];
101:   // User name mapping (ID -> Name) for responsible persons
102:   userNames: Record<string, string>;
103:   // Company data mapping (ID -> Company Data)
104:   companiesData: Record<string, any>;
105:   companiesDataFetchedAt: Record<string, number>;
106:   companiesDataLoading: boolean;
107:   // Activities data mapping (Deal ID -> { last: ActivityData, next: ActivityData })
108:   activitiesData: Record<string, any>;
109:   activitiesDataFetchedAt: Record<string, number>;
110:   activitiesDataLoading: boolean;
111:   // ─── Actions ───
112:   checkConfig: () => Promise<void>;
113:   fetchFields: () => Promise<void>;
114:   fetchDeals: () => Promise<void>;
115:   loadDemoData: () => void;
116:   setSelectedColumns: (columns: string[]) => void;
117:   toggleColumn: (columnId: string) => void;
118:   reorderColumns: (startIndex: number, endIndex: number) => void;
119:   setColumnSelectorOpen: (open: boolean) => void;
120:   setDateFilter: (filter: DateFilter) => void;
121:   setSearchQuery: (query: string) => void;
122:   setColumnSort: (sort: ColumnSort) => void;
123:   toggleColumnSort: (columnId: string) => void;
124:   setColumnFilter: (columnId: string, value: string) => void;
125:   clearColumnFilter: (columnId: string) => void;
126:   clearAllColumnFilters: () => void;
127:   setCurrentPage: (page: number) => void;
128:   setPageSize: (size: number) => void;
129:   syncData: () => Promise<void>;
130:   applyClientFilters: () => void;
131:   // ─── Actions (header features) ───
132:   setPipelineFilter: (filter: string) => void;
133:   setResponsibleFilter: (id: string) => void;
134:   setViewMode: (mode: "table" | "cards" | "kanban") => void;
135:   saveView: (name: string) => void;
136:   deleteSavedView: (id: string) => void;
137:   loadSavedView: (id: string) => void;
138:   setConnectionStatus: (status: "checking" | "connected" | "demo" | "disconnected") => void;
139:   setAppLoaded: (loaded: boolean) => void;
140:   fetchUserNames: () => Promise<void>;
141:   fetchCompaniesData: () => Promise<void>;
142:   fetchActivitiesData: () => Promise<void>;
143:   markAlertsAsRead: () => void;
144: }
145: function getDateFilterRange(filter: DateFilter): Record<string, string> {
146:   const now = new Date();
147:   const bitrixFilter: Record<string, string> = {};
148:   if (filter.preset === "all") {
149:     return {};
150:   }
151:   if (filter.preset === "custom") {
152:     if (filter.customFrom) {
153:       bitrixFilter[">=DATE_CREATE"] = filter.customFrom;
154:     }
155:     if (filter.customTo) {
156:       // ✅ Force Bitrix API to include the entirety of the selected end day
157:       bitrixFilter["<=DATE_CREATE"] = `${filter.customTo}T23:59:59`;
158:     }
159:     return bitrixFilter;
160:   }
161:   const daysMap: Record<string, number> = {
162:     "7days": 7,
163:     "14days": 14,
164:     "30days": 30,
165:     "90days": 90,
166:   };
167:   const days = daysMap[filter.preset];
168:   if (days) {
169:     const from = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
170:     bitrixFilter[">=DATE_CREATE"] = from.toISOString().slice(0, 19);
171:   }
172:   return bitrixFilter;
173: }
174: export const DEFAULT_COLUMNS = [...DEAL_TABLE_DEFAULT_COLUMNS] as string[];
175: const sortColumns = (columns: string[]) => {
176:   return [...columns].sort((a, b) => {
177:     const indexA = DEFAULT_COLUMNS.indexOf(a);
178:     const indexB = DEFAULT_COLUMNS.indexOf(b);
179:     if (indexA !== -1 && indexB !== -1) {
180:       return indexA - indexB;
181:     }
182:     if (indexA !== -1) return -1;
183:     if (indexB !== -1) return 1;
184:     return 0;
185:   });
186: };
187: export const useDashboardStore = create<DashboardState>()(
188:   persist(
189:     (set, get) => ({
190:       // Configuration
191:       isConfigured: null,
192:       isDemoMode: false,
193:       // Fields
194:       fields: [],
195:       fieldsLoading: false,
196:       fieldsError: null,
197:       // Selected columns
198:       selectedColumns: DEFAULT_COLUMNS,
199:       columnSelectorOpen: false,
200:       // Deals
201:       deals: [],
202:       allDeals: [],
203:       dealsLoading: false,
204:       dealsError: null,
205:       dealsTotal: 0,
206:       dealsTruncated: false,
207:       dealsFetched: 0,
208:       // Date filter
209:       dateFilter: { preset: "all" },
210:       // Search
211:       searchQuery: "",
212:       // Column sorting
213:       columnSort: { columnId: "", direction: null },
214:       // Column filters
215:       columnFilters: [],
216:       // Pagination
217:       currentPage: 1,
218:       pageSize: 50,
219:       // New state fields
220:       lastSyncAt: null,
221:       lastReadAlertsAt: null,
222:       pipelineFilter: "all",
223:       responsibleFilter: "all",
224:       viewMode: "table",
225:       connectionStatus: "checking",
226:       appLoaded: false,
227:       savedViews: [],
228:       userNames: {},
229:       companiesData: {},
230:       companiesDataFetchedAt: {},
231:       companiesDataLoading: false,
232:       activitiesData: {},
233:       activitiesDataFetchedAt: {},
234:       activitiesDataLoading: false,
235:       // ─── Actions ───
236:       checkConfig: async () => {
237:         try {
238:           const response = await fetchWithTimeout("/api/bitrix/status");
239:           // Check HTTP status — fetch doesn't throw on 401/403/500
240:           if (!response.ok) {
241:             // Auth error or server error — treat as disconnected
242:             set({
243:               isConfigured: false,
244:               connectionStatus: response.status === 401 ? "demo" : "disconnected",
245:             });
246:             return;
247:           }
248:           const data = await response.json();
249:           set({
250:             isConfigured: data.configured,
251:             connectionStatus: data.configured ? "connected" : "demo",
252:           });
253:         } catch {
254:           set({
255:             isConfigured: false,
256:             connectionStatus: "disconnected",
257:           });
258:         }
259:       },
260:       fetchFields: async () => {
261:         set({ fieldsLoading: true, fieldsError: null });
262:         try {
263:           const response = await fetchWithTimeout("/api/bitrix/fields");
264:           // Check HTTP status — fetch doesn't throw on 401/403/500
265:           if (!response.ok) {
266:             // Fall through to catch block for demo fallback
267:             throw new Error(`API returned ${response.status}`);
268:           }
269:           const data = await response.json();
270:           if (!data.success) {
271:             throw new Error(data.error || "Failed to fetch fields");
272:           }
273:           if (data.fields.length === 0) {
274:             set({ fields: DEMO_FIELDS, fieldsLoading: false, isDemoMode: true });
275:           } else {
276:             set({ fields: data.fields, fieldsLoading: false, isDemoMode: false, isConfigured: true });
277:           }
278:           const currentSelected = get().selectedColumns;
279:           const availableFields = get().fields;
280:           // Migration logic is now handled by Zustand persist migrate function
281:           // We just need to make sure we have valid columns selected
282:           if (currentSelected.length === 0 && availableFields.length > 0) {
283:             const availableDefaults = DEFAULT_COLUMNS.filter((col) =>
284:               availableFields.some((f) => f.id === col)
285:             );
286:             if (availableDefaults.length === 0) {
287:               set({ selectedColumns: [availableFields[0].id] });
288:             } else {
289:               set({ selectedColumns: availableDefaults });
290:             }
291:           }
292:         } catch (error) {
293:           const { isDemoMode } = get();
294:           if (isDemoMode) {
295:             set({
296:               fields: DEMO_FIELDS,
297:               fieldsLoading: false,
298:               fieldsError: null,
299:             });
300:           } else {
301:             set({
302:               fieldsLoading: false,
303:               fieldsError: "Failed to load fields",
304:             });
305:           }
306:         }
307:       },
308:       fetchDeals: async () => {
309:         set({ dealsLoading: true, dealsError: null });
310:         try {
311:           const { dateFilter, selectedColumns } = get();
312:           const filter = getDateFilterRange(dateFilter);
313:           const select = selectedColumns.length > 0
314:             ? [...selectedColumns]
315:             : ["*", "UF_*"];
316:           if (!select.includes("DATE_CREATE")) select.push("DATE_CREATE");
317:           if (!select.includes("TITLE")) select.push("TITLE");
318:           if (!select.includes("ID")) select.push("ID");
319:           // Required by filters/alerts/stats even if not in selectedColumns:
320:           if (!select.includes("ASSIGNED_BY_ID")) select.push("ASSIGNED_BY_ID");
321:           if (!select.includes("ASSIGNED_BY_NAME")) select.push("ASSIGNED_BY_NAME");
322:           if (!select.includes("DATE_MODIFY")) select.push("DATE_MODIFY");
323:           if (!select.includes("STAGE_ID")) select.push("STAGE_ID");
324:           if (!select.includes("OPPORTUNITY")) select.push("OPPORTUNITY");
325:           if (!select.includes("CURRENCY_ID")) select.push("CURRENCY_ID");
326:           if (!select.includes("COMPANY_ID")) select.push("COMPANY_ID");
327:           if (!select.includes("COMPANY_TITLE")) select.push("COMPANY_TITLE");
328:           const response = await fetchWithTimeout("/api/bitrix/deals", {
329:             method: "POST",
330:             headers: { "Content-Type": "application/json" },
331:             body: JSON.stringify({
332:               select,
333:               filter,
334:               order: { DATE_CREATE: "DESC" },
335:             }),
336:           });
337:           // Check HTTP status — fetch doesn't throw on 401/403/500
338:           if (!response.ok) {
339:             throw new Error(`API returned ${response.status}`);
340:           }
341:           const data = await response.json();
342:           if (!data.success) {
343:             throw new Error(data.error || "Failed to fetch deals");
344:           }
345:           set({
346:             allDeals: data.deals,
347:             dealsTotal: data.total,
348:             dealsTruncated: data.truncated || false,
349:             dealsFetched: data.fetched || data.deals.length,
350:             dealsLoading: false,
351:             isDemoMode: false,
352:             connectionStatus: "connected",
353:             isConfigured: true,
354:             lastSyncAt: Date.now(),
355:           });
356:           get().applyClientFilters();
357:           // Fetch user names for responsible persons (non-blocking)
358:           get().fetchUserNames();
359:           // Fetch companies data (non-blocking)
360:           get().fetchCompaniesData();
361:           // Fetch activities data (non-blocking)
362:           get().fetchActivitiesData();
363:         } catch (error) {
364:           const message = error instanceof Error ? error.message : "Не удалось загрузить данные";
365:           set({
366:             dealsLoading: false,
367:             dealsError: message,
368:             connectionStatus: "disconnected",
369:           });
370:         }
371:       },
372:       loadDemoData: () => {
373:         const demoDeals = generateDemoDeals(150);
374:         set({
375:           fields: DEMO_FIELDS,
376:           allDeals: demoDeals,
377:           dealsTotal: demoDeals.length,
378:           isDemoMode: true,
379:           selectedColumns: DEFAULT_COLUMNS,
380:         });
381:         get().applyClientFilters();
382:       },
383:       setSelectedColumns: (columns) => {
384:         set({ selectedColumns: columns });
385:         if (!get().isDemoMode) {
386:           get().fetchActivitiesData();
387:           get().fetchCompaniesData();
388:         }
389:       },
390:       toggleColumn: (columnId) => {
391:         const { selectedColumns } = get();
392:         if (selectedColumns.includes(columnId)) {
393:           if (selectedColumns.length <= 1) return;
394:           set({ selectedColumns: selectedColumns.filter((c) => c !== columnId) });
395:         } else {
396:           set({ selectedColumns: [...selectedColumns, columnId] });
397:           // Fetch data for the new column if needed
398:           if (columnId === "ACTIVITY_LAST" || columnId === "ACTIVITY_NEXT") {
399:             get().fetchActivitiesData();
400:           } else if (columnId.startsWith("COMPANY_")) {
401:             get().fetchCompaniesData();
402:           }
403:         }
404:       },
405:       reorderColumns: (startIndex, endIndex) => {
406:         const { selectedColumns } = get();
407:         const result = Array.from(selectedColumns);
408:         const [removed] = result.splice(startIndex, 1);
409:         result.splice(endIndex, 0, removed);
410:         set({ selectedColumns: result });
411:       },
412:       setColumnSelectorOpen: (open) => set({ columnSelectorOpen: open }),
413:       setDateFilter: (filter) => {
414:         set({ dateFilter: filter, currentPage: 1 });
415:         get().applyClientFilters();
416:         if (!get().isDemoMode) {
417:           get().fetchDeals();
418:         }
419:       },
420:       applyClientFilters: () => {
421:         const { allDeals, dateFilter, pipelineFilter, responsibleFilter } = get();
422:         let filtered = allDeals;
423:         // 1. Date filter
424:         if (dateFilter.preset !== "all") {
425:           const now = new Date();
426:           let fromDate: Date | null = null;
427:           let toDate: Date | null = null;
428:           if (dateFilter.preset === "custom") {
429:             if (dateFilter.customFrom) fromDate = new Date(dateFilter.customFrom);
430:             if (dateFilter.customTo) {
431:               toDate = new Date(dateFilter.customTo);
432:               // ✅ Push JS Date object to 23:59:59 so afternoon deals aren't filtered out
433:               toDate.setHours(23, 59, 59, 999);
434:             }
435:           } else {
436:             const daysMap: Record<string, number> = {
437:               "7days": 7,
438:               "14days": 14,
439:               "30days": 30,
440:               "90days": 90,
441:             };
442:             const days = daysMap[dateFilter.preset];
443:             if (days) {
444:               fromDate = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
445:             }
446:           }
447:           filtered = filtered.filter((deal) => {
448:             const dateStr = deal.DATE_CREATE as string;
449:             if (!dateStr) return false;
450:             const d = new Date(dateStr);
451:             if (isNaN(d.getTime())) return false;
452:             if (fromDate && d < fromDate) return false;
453:             if (toDate && d > toDate) return false;
454:             return true;
455:           });
456:         }
457:         // 2. Pipeline filter
458:         if (pipelineFilter === "in_work") {
459:           filtered = filtered.filter((deal) => {
460:             const stage = String(deal.STAGE_ID || "");
461:             return !["WON", "LOSE"].includes(stage);
462:           });
463:         } else if (pipelineFilter !== "all") {
464:           filtered = filtered.filter((deal) => String(deal.STAGE_ID) === pipelineFilter);
465:         }
466:         // 3. Responsible filter
467:         if (responsibleFilter !== "all") {
468:           filtered = filtered.filter((deal) => String(deal.ASSIGNED_BY_ID || "") === responsibleFilter);
469:         }
470:         const { pageSize, currentPage } = get();
471:         const totalPages = Math.ceil(filtered.length / pageSize);
472:         let newPage = currentPage;
473:         if (currentPage > totalPages) {
474:           newPage = totalPages || 1;
475:         }
476:         set({ deals: filtered, currentPage: newPage });
477:       },
478:       setSearchQuery: (query) => {
479:         set({ searchQuery: query, currentPage: 1 });
480:         get().applyClientFilters();
481:       },
482:       setColumnSort: (sort) => set({ columnSort: sort, currentPage: 1 }),
483:       toggleColumnSort: (columnId) => {
484:         const { columnSort } = get();
485:         if (columnSort.columnId === columnId) {
486:           // Cycle: asc → desc → null
487:           if (columnSort.direction === "asc") {
488:             set({ columnSort: { columnId, direction: "desc" }, currentPage: 1 });
489:           } else if (columnSort.direction === "desc") {
490:             set({ columnSort: { columnId: "", direction: null }, currentPage: 1 });
491:           }
492:         } else {
493:           set({ columnSort: { columnId, direction: "asc" }, currentPage: 1 });
494:         }
495:       },
496:       setColumnFilter: (columnId, value) => {
497:         const { columnFilters } = get();
498:         const existing = columnFilters.find((f) => f.columnId === columnId);
499:         if (existing) {
500:           set({
501:             columnFilters: columnFilters.map((f) =>
502:               f.columnId === columnId ? { ...f, value } : f
503:             ),
504:             currentPage: 1,
505:           });
506:         } else {
507:           set({
508:             columnFilters: [...columnFilters, { columnId, value }],
509:             currentPage: 1,
510:           });
511:         }
512:       },
513:       clearColumnFilter: (columnId) => {
514:         set({
515:           columnFilters: get().columnFilters.filter((f) => f.columnId !== columnId),
516:           currentPage: 1,
517:         });
518:       },
519:       clearAllColumnFilters: () => {
520:         set({ columnFilters: [], currentPage: 1 });
521:       },
522:       setCurrentPage: (page) => set({ currentPage: page }),
523:       setPageSize: (size) => set({ pageSize: size, currentPage: 1 }),
524:       syncData: async () => {
525:         const { isDemoMode } = get();
526:         if (isDemoMode) {
527:           const demoDeals = generateDemoDeals(150);
528:           set({
529:             allDeals: demoDeals,
530:             dealsTotal: demoDeals.length,
531:             lastSyncAt: Date.now(),
532:           });
533:           get().applyClientFilters();
534:           return;
535:         }
536:         // Fetch fields first (sequentially), then deals — avoids race condition
537:         // where fetchDeals depends on selectedColumns that may be updated by fetchFields
538:         await get().fetchFields();
539:         await get().fetchDeals();
540:       },
541:       // ─── Actions (header features) ───
542:       setPipelineFilter: (filter) => {
543:         set({ pipelineFilter: filter, currentPage: 1 });
544:         get().applyClientFilters();
545:       },
546:       setResponsibleFilter: (id) => {
547:         set({ responsibleFilter: id, currentPage: 1 });
548:         get().applyClientFilters();
549:       },
550:       setViewMode: (mode) => set({ viewMode: mode }),
551:       saveView: (name) => {
552:         const { dateFilter, pipelineFilter, responsibleFilter, selectedColumns, columnSort, savedViews } = get();
553:         const newView: SavedView = {
554:           id: `sv_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
555:           name,
556:           dateFilter: { ...dateFilter },
557:           pipelineFilter,
558:           responsibleFilter,
559:           selectedColumns: [...selectedColumns],
560:           columnSort: { ...columnSort },
561:           createdAt: Date.now(),
562:         };
563:         set({ savedViews: [...savedViews, newView] });
564:       },
565:       deleteSavedView: (id) => {
566:         set({ savedViews: get().savedViews.filter((v) => v.id !== id) });
567:       },
568:       loadSavedView: (id) => {
569:         const view = get().savedViews.find((v) => v.id === id);
570:         if (!view) return;
571:         set({
572:           dateFilter: { ...view.dateFilter },
573:           pipelineFilter: view.pipelineFilter,
574:           responsibleFilter: view.responsibleFilter,
575:           selectedColumns: [...view.selectedColumns],
576:           columnSort: { ...view.columnSort },
577:           currentPage: 1,
578:         });
579:         get().applyClientFilters();
580:         get().fetchActivitiesData();
581:         get().fetchCompaniesData();
582:       },
583:       setConnectionStatus: (status) => set({ connectionStatus: status }),
584:       setAppLoaded: (loaded) => set({ appLoaded: loaded }),
585:       markAlertsAsRead: () => set({ lastReadAlertsAt: Date.now() }),
586:       fetchUserNames: async () => {
587:         const { isDemoMode, userNames } = get();
588:         // In demo mode, use the demo responsible persons
589:         if (isDemoMode) {
590:           const { RESPONSIBLE_PERSONS } = await import("@/lib/demo-data");
591:           const demoNames: Record<string, string> = {};
592:           for (const person of RESPONSIBLE_PERSONS) {
593:             demoNames[person.ID] = person.NAME;
594:           }
595:           set({ userNames: demoNames });
596:           return;
597:         }
598:         try {
599:           // Fetch all users
600:           const response = await fetchWithTimeout(`/api/bitrix/users`);
601:           if (!response.ok) {
602:             console.warn("[Dashboard] Failed to fetch user names: API returned", response.status);
603:             return;
604:           }
605:           const data = await response.json();
606:           if (data.success && data.users) {
607:             set({ userNames: { ...userNames, ...data.users } });
608:           }
609:         } catch {
610:           // Non-critical — responsible filter will show "ID xxx" fallback
611:           console.warn("[Dashboard] Failed to fetch user names");
612:         }
613:       },
614:       fetchCompaniesData: async () => {
615:         const { isDemoMode, allDeals, companiesData, selectedColumns } = get();
616:         if (isDemoMode) return;
617:         // Check if any company fields are selected
618:         const hasCompanyFields = selectedColumns.some(col => col.startsWith("COMPANY_"));
619:         if (!hasCompanyFields) return;
620:         // Collect unique company IDs from deals
621:         const uniqueIds = [...new Set(
622:           allDeals.map((d) => String(d.COMPANY_ID || "")).filter((id) => id && id !== "0")
623:         )];
624:         if (uniqueIds.length === 0) return;
625:         // Only fetch IDs we don't already have data for or if data is older than 5 minutes
626:         const now = Date.now();
627:         const missingIds = uniqueIds.filter((id) => {
628:           const cached = companiesData[id];
629:           const fetchedAt = get().companiesDataFetchedAt[id];
630:           if (!cached) return true;
631:           if (!fetchedAt || now - fetchedAt > 5 * 60 * 1000) return true;
632:           return false;
633:         });
634:         if (missingIds.length === 0) return;
635:         set({ companiesDataLoading: true });
636:         // Determine which company fields to fetch based on selected columns
637:         const companyFieldsToSelect = selectedColumns
638:           .filter(col => col.startsWith("COMPANY_"))
639:           .map(col => col.replace("COMPANY_", ""));
640:         if (!companyFieldsToSelect.includes("TITLE")) {
641:           companyFieldsToSelect.push("TITLE");
642:         }
643:         try {
644:           const response = await fetchWithTimeout("/api/bitrix/companies", {
645:             method: "POST",
646:             headers: { "Content-Type": "application/json" },
647:             body: JSON.stringify({
648:               ids: missingIds,
649:               select: companyFieldsToSelect,
650:             }),
651:           });
652:           if (!response.ok) {
653:             console.warn("[Dashboard] Failed to fetch companies data: API returned", response.status);
654:             set({ companiesDataLoading: false });
655:             return;
656:           }
657:           const data = await response.json();
658:           if (data.success && data.companies) {
659:             set((state) => {
660:               const newCompaniesData = { ...state.companiesData, ...data.companies };
661:               const newCompaniesDataFetchedAt = { ...state.companiesDataFetchedAt };
662:               const now = Date.now();
663:               // ✅ Mark ALL requested IDs as fetched to prevent infinite loops
664:               for (const id of missingIds) {
665:                 newCompaniesDataFetchedAt[id] = now;
666:               }
667:               // Prune cache to only keep companies present in allDeals
668:               const validCompanyIds = new Set(state.allDeals.map(d => String(d.COMPANY_ID || "")).filter(Boolean));
669:               console.log("[Dashboard] validCompanyIds size:", validCompanyIds.size, "sample:", Array.from(validCompanyIds).slice(0, 5));
670:               console.log("[Dashboard] newCompaniesData keys before prune:", Object.keys(newCompaniesData).length);
671:               for (const id in newCompaniesData) {
672:                 if (!validCompanyIds.has(id)) {
673:                   delete newCompaniesData[id];
674:                   delete newCompaniesDataFetchedAt[id];
675:                 }
676:               }
677:               console.log("[Dashboard] newCompaniesData keys after prune:", Object.keys(newCompaniesData).length);
678:               return { companiesData: newCompaniesData, companiesDataFetchedAt: newCompaniesDataFetchedAt, companiesDataLoading: false };
679:             });
680:           } else {
681:             set({ companiesDataLoading: false });
682:           }
683:         } catch {
684:           console.warn("[Dashboard] Failed to fetch companies data");
685:           set({ companiesDataLoading: false });
686:         }
687:       },
688:       fetchActivitiesData: async () => {
689:         const { isDemoMode, allDeals, activitiesData, selectedColumns } = get();
690:         if (isDemoMode) return;
691:         // Check if any activity fields are selected
692:         const hasActivityFields = selectedColumns.includes("ACTIVITY_LAST") || selectedColumns.includes("ACTIVITY_NEXT");
693:         if (!hasActivityFields) return;
694:         // Collect unique deal IDs
695:         const uniqueIds = [...new Set(
696:           allDeals.map((d) => String(d.ID || d.id || "")).filter(Boolean)
697:         )];
698:         if (uniqueIds.length === 0) return;
699:         // Only fetch IDs we don't already have data for or if data is older than 5 minutes
700:         const now = Date.now();
701:         const missingIds = uniqueIds.filter((id) => {
702:           const cached = activitiesData[id];
703:           const fetchedAt = get().activitiesDataFetchedAt[id];
704:           if (!cached) return true;
705:           if (!fetchedAt || now - fetchedAt > 5 * 60 * 1000) return true;
706:           return false;
707:         });
708:         if (missingIds.length === 0) return;
709:         set({ activitiesDataLoading: true });
710:         try {
711:           const response = await fetchWithTimeout("/api/bitrix/activities", {
712:             method: "POST",
713:             headers: { "Content-Type": "application/json" },
714:             body: JSON.stringify({
715:               dealIds: missingIds,
716:             }),
717:           });
718:           if (!response.ok) {
719:             console.warn("[Dashboard] Failed to fetch activities data: API returned", response.status);
720:             set({ activitiesDataLoading: false });
721:             return;
722:           }
723:           const data = await response.json();
724:           if (data.success && data.activities) {
725:             set((state) => {
726:               const newActivitiesData = { ...state.activitiesData, ...data.activities };
727:               const newActivitiesDataFetchedAt = { ...state.activitiesDataFetchedAt };
728:               const now = Date.now();
729:               // ✅ Mark ALL requested IDs as fetched to prevent infinite loops
730:               for (const id of missingIds) {
731:                 newActivitiesDataFetchedAt[id] = now;
732:               }
733:               // Prune cache to only keep deals present in allDeals
734:               const validDealIds = new Set(state.allDeals.map(d => String(d.ID || d.id || "")).filter(Boolean));
735:               for (const id in newActivitiesData) {
736:                 if (!validDealIds.has(id)) {
737:                   delete newActivitiesData[id];
738:                   delete newActivitiesDataFetchedAt[id];
739:                 }
740:               }
741:               return { activitiesData: newActivitiesData, activitiesDataFetchedAt: newActivitiesDataFetchedAt, activitiesDataLoading: false };
742:             });
743:           } else {
744:             set({ activitiesDataLoading: false });
745:           }
746:         } catch {
747:           console.warn("[Dashboard] Failed to fetch activities data");
748:           set({ activitiesDataLoading: false });
749:         }
750:       },
751:     }),
752:     {
753:       name: "bitrix-bi-dashboard",
754:       version: 2,
755:       migrate: (persistedState: any, version: number) => {
756:         if (version === 0 || version === 1) {
757:           // Migration from older versions
758:           const state = persistedState as DashboardState;
759:           if (state.selectedColumns) {
760:             const currentSelected = state.selectedColumns;
761:             const isOldDefault = currentSelected.length === 14 && currentSelected.includes("ACTIVITY_LAST");
762:             const isNewDefault = currentSelected.length === DEFAULT_COLUMNS.length && DEFAULT_COLUMNS.every((col) => currentSelected.includes(col));
763:             const isGenuineUserCustomisation = !isOldDefault && !isNewDefault && currentSelected.length > 0;
764:             if (!isGenuineUserCustomisation) {
765:               state.selectedColumns = DEFAULT_COLUMNS;
766:             } else if (!currentSelected.includes(RESPONSIBLE_FIELD_ID)) {
767:               const closeDateIndex = currentSelected.indexOf("CLOSEDATE");
768:               if (closeDateIndex !== -1) {
769:                 const newColumns = [...currentSelected];
770:                 newColumns.splice(closeDateIndex + 1, 0, RESPONSIBLE_FIELD_ID);
771:                 state.selectedColumns = newColumns;
772:               } else {
773:                 state.selectedColumns = [...currentSelected, RESPONSIBLE_FIELD_ID];
774:               }
775:             }
776:           }
777:         }
778:         return persistedState;
779:       },
780:       partialize: (state) => ({
781:         selectedColumns: state.selectedColumns,
782:         dateFilter: state.dateFilter,
783:         pageSize: state.pageSize,
784:         pipelineFilter: state.pipelineFilter,
785:         responsibleFilter: state.responsibleFilter,
786:         viewMode: state.viewMode,
787:         savedViews: state.savedViews,
788:         lastReadAlertsAt: state.lastReadAlertsAt,
789:       }),
790:     }
791:   )
792: );
```

## File: src/components/dashboard/data-table.tsx
```typescript
  1: "use client";
  2: import { useDashboardStore, type FieldInfo, type DealData } from "@/store/dashboard-store";
  3: import {
  4:   RESPONSIBLE_FIELD_ID,
  5:   RESPONSIBLE_FIELD_TITLE,
  6: } from "@/lib/crm-constants";
  7: import { useTableState } from "@/hooks/use-table-state";
  8: import { Badge } from "@/components/ui/badge";
  9: import { Skeleton } from "@/components/ui/skeleton";
 10: import { Alert, AlertDescription } from "@/components/ui/alert";
 11: import { Input } from "@/components/ui/input";
 12: import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";
 13: import {
 14:   AlertCircle,
 15:   Database,
 16:   ChevronLeft,
 17:   ChevronRight,
 18:   ArrowUp,
 19:   ArrowDown,
 20:   ArrowUpDown,
 21:   Filter,
 22:   X,
 23:   AlertTriangle,
 24: } from "lucide-react";
 25: import { Button } from "@/components/ui/button";
 26: import { useMemo, useState, useRef, useEffect } from "react";
 27: import { useEntityDrawerStore } from "@/store/entity-drawer-store";
 28: /**
 29:  * SECURITY NOTE: All cell values are rendered as JSX text content.
 30:  * React automatically escapes HTML entities in JSX text (<td>{value}</td>),
 31:  * which prevents XSS attacks even if CRM data contains malicious scripts.
 32:  * We do NOT use dangerouslySetInnerHTML anywhere in this component.
 33:  */
 34: export function DataTable() {
 35:   const {
 36:     deals,
 37:     dealsLoading,
 38:     dealsError,
 39:     dealsTotal,
 40:     dealsTruncated,
 41:     dealsFetched,
 42:     fields,
 43:     selectedColumns,
 44:     searchQuery,
 45:     currentPage,
 46:     pageSize,
 47:     setCurrentPage,
 48:     setPageSize,
 49:     columnSort,
 50:     toggleColumnSort,
 51:     columnFilters,
 52:     setColumnFilter,
 53:     clearColumnFilter,
 54:     clearAllColumnFilters,
 55:   } = useDashboardStore();
 56:   const companiesDataLoading = useDashboardStore(s => s.companiesDataLoading);
 57:   const activitiesDataLoading = useDashboardStore(s => s.activitiesDataLoading);
 58:   const openDrawer = useEntityDrawerStore((s) => s.open);
 59:   const [activeFilterCol, setActiveFilterCol] = useState<string | null>(null);
 60:   const filterInputRef = useRef<HTMLInputElement>(null);
 61:   // Auto-focus filter input when activated
 62:   useEffect(() => {
 63:     if (activeFilterCol && filterInputRef.current) {
 64:       filterInputRef.current.focus();
 65:     }
 66:   }, [activeFilterCol]);
 67:   const {
 68:     fieldMap,
 69:     resolveValue,
 70:     sortedDeals,
 71:     columns,
 72:   } = useTableState();
 73:   const activeFilterCount = columnFilters.filter((f) => f.value.trim()).length;
 74:   const totalPages = Math.ceil(sortedDeals.length / pageSize);
 75:   const paginatedDeals = useMemo(() => {
 76:     const start = (currentPage - 1) * pageSize;
 77:     return sortedDeals.slice(start, start + pageSize);
 78:   }, [sortedDeals, currentPage, pageSize]);
 79:   // Loading state
 80:   if (dealsLoading && deals.length === 0) {
 81:     return (
 82:       <div className="flex-1 p-4 sm:p-6">
 83:         <div className="space-y-4">
 84:           <div className="flex items-center gap-3">
 85:             <Skeleton className="h-9 w-64 rounded-md" />
 86:           </div>
 87:           <div className="rounded-md border border-border overflow-hidden">
 88:             <div className="bg-muted/50 p-3 flex gap-4">
 89:               {[1, 2, 3, 4, 5].map((i) => (
 90:                 <Skeleton key={i} className="h-4 w-24 rounded" />
 91:               ))}
 92:             </div>
 93:             {[1, 2, 3, 4, 5, 6, 7, 8].map((row) => (
 94:               <div key={row} className="p-3 flex gap-4 border-t border-border">
 95:                 {[1, 2, 3, 4, 5].map((col) => (
 96:                   <Skeleton key={col} className="h-4 w-20 rounded" />
 97:                 ))}
 98:               </div>
 99:             ))}
100:           </div>
101:         </div>
102:       </div>
103:     );
104:   }
105:   // Error state
106:   if (dealsError) {
107:     return (
108:       <div className="flex-1 p-4 sm:p-6">
109:         <Alert variant="destructive" className="rounded-md">
110:           <AlertCircle className="h-4 w-4" />
111:           <AlertDescription>
112:             Ошибка загрузки данных: {dealsError}
113:           </AlertDescription>
114:         </Alert>
115:       </div>
116:     );
117:   }
118:   // Empty state
119:   if (deals.length === 0) {
120:     if (searchQuery || activeFilterCount > 0) {
121:       return (
122:         <div className="flex-1 flex items-center justify-center p-6">
123:           <div className="text-center space-y-4 animate-fade-in">
124:             <div className="mx-auto h-16 w-16 rounded-2xl bg-muted flex items-center justify-center">
125:               <Filter className="h-8 w-8 text-muted-foreground" />
126:             </div>
127:             <div>
128:               <h3 className="text-lg font-semibold">Ничего не найдено</h3>
129:               <p className="text-sm text-muted-foreground mt-1">
130:                 Попробуйте изменить параметры поиска или фильтры
131:               </p>
132:             </div>
133:           </div>
134:         </div>
135:       );
136:     }
137:     return (
138:       <div className="flex-1 flex items-center justify-center p-6">
139:         <div className="text-center space-y-4 animate-fade-in">
140:           <div className="mx-auto h-16 w-16 rounded-2xl bg-muted flex items-center justify-center">
141:             <Database className="h-8 w-8 text-muted-foreground" />
142:           </div>
143:           <div>
144:             <h3 className="text-lg font-semibold">Нет данных</h3>
145:             <p className="text-sm text-muted-foreground mt-1">
146:               Нажмите «Синхронизация» для загрузки сделок из CRM
147:             </p>
148:           </div>
149:         </div>
150:       </div>
151:     );
152:   }
153:   return (
154:     <div className="flex-1 flex flex-col min-h-0 mx-4 sm:mx-6 mb-4">
155:       {/* Table container card */}
156:       <div className="flex-1 flex flex-col min-h-0 rounded-md border border-border bg-card shadow-sm overflow-hidden">
157:         {/* Filter bar */}
158:         <div className="px-4 py-2 border-b border-border bg-card flex items-center gap-3 flex-wrap">
159:           <div className="flex items-center gap-2">
160:             {activeFilterCount > 0 && (
161:               <>
162:                 <Badge variant="secondary" className="text-[10px] gap-1 h-6 filter-badge-pulse bg-brand-orange/10 text-brand-orange border-brand-orange/20">
163:                   <Filter className="h-2.5 w-2.5" />
164:                   {activeFilterCount}
165:                 </Badge>
166:                 <Button
167:                   variant="ghost"
168:                   size="sm"
169:                   onClick={clearAllColumnFilters}
170:                   className="h-6 text-[10px] gap-1 text-muted-foreground hover:text-foreground px-2"
171:                 >
172:                   <X className="h-2.5 w-2.5" />
173:                   Сбросить
174:                 </Button>
175:               </>
176:             )}
177:           </div>
178:           <div className="text-[10px] text-muted-foreground tabular-nums ml-auto flex items-center gap-2">
179:             {dealsTruncated && (
180:               <span className="text-amber-600 dark:text-amber-400 flex items-center gap-1" title="Показаны не все сделки. Уточните фильтры.">
181:                 <AlertTriangle className="h-3 w-3" />
182:                 Показаны первые {dealsFetched.toLocaleString("ru-RU")}
183:               </span>
184:             )}
185:             <span>
186:               {sortedDeals.length.toLocaleString("ru-RU")} из {dealsTotal.toLocaleString("ru-RU")}
187:             </span>
188:           </div>
189:         </div>
190:         {/* Table */}
191:         <div className="flex-1 min-h-0 overflow-hidden">
192:           <div className="h-full overflow-auto custom-scrollbar">
193:             <div className="min-w-full">
194:               <table className="data-table w-full border-separate border-spacing-0">
195:                 <thead className="bg-card shadow-sm">
196:                   <tr>
197:                     {/* Fixed Row Number Column */}
198:                     <th className="text-center sticky top-0 left-0 z-30 bg-card border-r border-b border-border w-10 min-w-[40px] px-2">
199:                       №
200:                     </th>
201:                     {columns.map((colId) => {
202:                       const field = fieldMap.get(colId);
203:                       const isSorted = columnSort.columnId === colId;
204:                       const hasFilter = columnFilters.some(
205:                         (f) => f.columnId === colId && f.value.trim()
206:                       );
207:                       const isFilterActive = activeFilterCol === colId;
208:                       const isNumeric = field?.type === "double" || field?.type === "integer" || field?.type === "money";
209:                       const isDate = field?.type === "date" || field?.type === "datetime";
210:                       return (
211:                         <th key={colId} className="text-left sticky top-0 z-20 group bg-card border-b border-border">
212:                           <div className="flex items-center gap-1">
213:                             {/* Sort button */}
214:                             <button
215:                               onClick={() => toggleColumnSort(colId)}
216:                               className="flex items-center gap-1 hover:text-foreground transition-colors cursor-pointer"
217:                               title={
218:                                 isNumeric
219:                                   ? isSorted
220:                                     ? columnSort.direction === "asc"
221:                                       ? "По возрастанию чисел (нажмите для убывания)"
222:                                       : "По убыванию чисел (нажмите для сброса)"
223:                                     : "Сортировка по числам"
224:                                   : isDate
225:                                   ? isSorted
226:                                     ? columnSort.direction === "asc"
227:                                       ? "По возрастанию дат (нажмите для убывания)"
228:                                       : "По убыванию дат (нажмите для сброса)"
229:                                     : "Сортировка по датам"
230:                                   : isSorted
231:                                   ? columnSort.direction === "asc"
232:                                     ? "По алфавиту А→Я (нажмите для Я→А)"
233:                                     : "По алфавиту Я→А (нажмите для сброса)"
234:                                   : "Сортировка по алфавиту"
235:                               }
236:                             >
237:                               <span className="truncate max-w-[160px]">
238:                                 {colId === RESPONSIBLE_FIELD_ID ? RESPONSIBLE_FIELD_TITLE : field?.title || colId}
239:                               </span>
240:                               {isSorted && columnSort.direction === "asc" && (
241:                                 <ArrowUp className="h-3 w-3 text-brand-blue flex-shrink-0 sort-icon-enter" />
242:                               )}
243:                               {isSorted && columnSort.direction === "desc" && (
244:                                 <ArrowDown className="h-3 w-3 text-brand-blue flex-shrink-0 sort-icon-enter" />
245:                               )}
246:                               {!isSorted && (
247:                                 <ArrowUpDown className="h-3 w-3 opacity-0 group-hover:opacity-30 transition-opacity flex-shrink-0" />
248:                               )}
249:                             </button>
250:                             {/* Column filter toggle */}
251:                             <button
252:                               onClick={() =>
253:                                 setActiveFilterCol(isFilterActive ? null : colId)
254:                               }
255:                               className={`p-0.5 rounded transition-all ${
256:                                 hasFilter
257:                                   ? "text-brand-orange filter-badge-pulse"
258:                                   : "opacity-0 group-hover:opacity-40 hover:!opacity-70"
259:                               }`}
260:                               title="Фильтр по столбцу"
261:                             >
262:                               <Filter className="h-2.5 w-2.5" />
263:                             </button>
264:                           </div>
265:                           {/* Per-column filter input */}
266:                           {isFilterActive && (
267:                             <div className="mt-1.5 animate-fade-in">
268:                               <div className="relative">
269:                                 <Input
270:                                   ref={filterInputRef}
271:                                   placeholder={`Фильтр...`}
272:                                   value={
273:                                     columnFilters.find((f) => f.columnId === colId)
274:                                       ?.value || ""
275:                                   }
276:                                   onChange={(e) =>
277:                                     setColumnFilter(colId, e.target.value)
278:                                   }
279:                                   className="h-6 text-[11px] rounded-sm pr-6 bg-muted/50 border-0 focus-visible:bg-background focus-visible:ring-1"
280:                                 />
281:                                 {(columnFilters.find((f) => f.columnId === colId)
282:                                   ?.value || "") && (
283:                                   <button
284:                                     onClick={() => clearColumnFilter(colId)}
285:                                     className="absolute right-1 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
286:                                   >
287:                                     <X className="h-2.5 w-2.5" />
288:                                   </button>
289:                                 )}
290:                               </div>
291:                             </div>
292:                           )}
293:                         </th>
294:                       );
295:                     })}
296:                   </tr>
297:                 </thead>
298:                 <tbody>
299:                   {paginatedDeals.length === 0 && (searchQuery || activeFilterCount > 0) && (
300:                     <tr>
301:                       <td colSpan={columns.length + 1} className="text-center py-8 text-muted-foreground">
302:                         Ничего не найдено по фильтрам
303:                       </td>
304:                     </tr>
305:                   )}
306:                   {paginatedDeals.map((deal, idx) => {
307:                     const dealId = deal.ID || deal.id || idx;
308:                     const rowIndex = (currentPage - 1) * pageSize + idx + 1;
309:                     return (
310:                       <tr key={String(dealId)}>
311:                         {/* Fixed Row Number Cell */}
312:                         <td className="sticky left-0 z-10 bg-card border-r border-border text-center px-2">
313:                           <span className="font-mono text-[11px] tabular-nums font-normal text-muted-foreground">
314:                             {rowIndex}
315:                           </span>
316:                         </td>
317:                         {columns.map((colId) => {
318:                           const resolved = resolveValue(deal, colId);
319:                           return (
320:                             <td key={colId} title={resolved}>
321:                               <CellValue
322:                                 raw={deal[colId]}
323:                                 resolved={resolved}
324:                                 field={fieldMap.get(colId)}
325:                                 deal={deal}
326:                                 colId={colId}
327:                                 companiesLoading={companiesDataLoading}
328:                                 activitiesLoading={activitiesDataLoading}
329:                                 openDrawer={openDrawer}
330:                               />
331:                             </td>
332:                           );
333:                         })}
334:                       </tr>
335:                     );
336:                   })}
337:                 </tbody>
338:               </table>
339:             </div>
340:           </div>
341:         </div>
342:         {/* Pagination */}
343:         <div className="px-4 py-2 border-t border-border bg-muted/30 flex items-center justify-between">
344:           <div className="flex items-center gap-3 text-[11px] text-muted-foreground">
345:             <span className="tabular-nums">
346:               {((currentPage - 1) * pageSize) + 1}–{Math.min(currentPage * pageSize, sortedDeals.length)} из {sortedDeals.length}
347:             </span>
348:             {(searchQuery || activeFilterCount > 0) && (
349:               <Tooltip>
350:                 <TooltipTrigger asChild>
351:                   <Badge variant="outline" className="text-[10px] h-5 font-normal cursor-help">
352:                     из {dealsTotal}
353:                   </Badge>
354:                 </TooltipTrigger>
355:                 <TooltipContent>
356:                   <p>из всего {dealsTotal} сделок до фильтрации</p>
357:                 </TooltipContent>
358:               </Tooltip>
359:             )}
360:           </div>
361:           <div className="flex items-center gap-2">
362:             <div className="flex items-center gap-1.5">
363:               <span className="text-[10px] text-muted-foreground hidden sm:inline">Строк:</span>
364:               <select
365:                 value={pageSize}
366:                 onChange={(e) => setPageSize(Number(e.target.value))}
367:                 className="h-7 rounded-sm border-0 bg-muted/80 text-[11px] px-1.5 py-0 focus:ring-1 cursor-pointer"
368:               >
369:                 <option value={25}>25</option>
370:                 <option value={50}>50</option>
371:                 <option value={100}>100</option>
372:                 <option value={250}>250</option>
373:               </select>
374:             </div>
375:             <div className="flex items-center gap-1">
376:               <Button
377:                 variant="ghost"
378:                 size="icon"
379:                 className="h-7 w-7 rounded-sm"
380:                 onClick={() => setCurrentPage(Math.max(1, currentPage - 1))}
381:                 disabled={currentPage <= 1}
382:               >
383:                 <ChevronLeft className="h-3.5 w-3.5" />
384:               </Button>
385:               <span className="text-[11px] text-muted-foreground min-w-[50px] text-center tabular-nums">
386:                 {currentPage} / {Math.max(1, totalPages)}
387:               </span>
388:               <Button
389:                 variant="ghost"
390:                 size="icon"
391:                 className="h-7 w-7 rounded-sm"
392:                 onClick={() => setCurrentPage(Math.min(totalPages, currentPage + 1))}
393:                 disabled={currentPage >= totalPages}
394:               >
395:                 <ChevronRight className="h-3.5 w-3.5" />
396:               </Button>
397:             </div>
398:           </div>
399:         </div>
400:       </div>
401:     </div>
402:   );
403: }
404: function CellValue({
405:   raw,
406:   resolved,
407:   field,
408:   deal,
409:   colId,
410:   companiesLoading,
411:   activitiesLoading,
412:   openDrawer,
413: }: {
414:   raw: string | string[] | number | null;
415:   resolved: string;
416:   field?: FieldInfo;
417:   deal?: any;
418:   colId?: string;
419:   companiesLoading: boolean;
420:   activitiesLoading: boolean;
421:   openDrawer: (type: "company" | "responsible", id: string) => void;
422: }) {
423:   if (!resolved) {
424:     if (colId === "COMPANY_TITLE" || colId?.startsWith("COMPANY_")) {
425:       if (companiesLoading) {
426:         return <Skeleton className="h-4 w-24 rounded" />;
427:       }
428:       const companyId = String(deal.COMPANY_ID || "").trim();
429:       if (companyId) {
430:         return (
431:           <span 
432:             className="text-muted-foreground" 
433:             title={`Company ID: ${companyId}`}
434:           >
435:             {colId === "COMPANY_TITLE" ? `ID ${companyId}` : "—"}
436:           </span>
437:         );
438:       }
439:     }
440:     if (colId === "ACTIVITY_LAST" || colId === "ACTIVITY_NEXT") {
441:       if (activitiesLoading) {
442:         return <Skeleton className="h-4 w-32 rounded" />;
443:       }
444:     }
445:     return <span className="text-muted-foreground/30">—</span>;
446:   }
447:   // Boolean / char fields
448:   if (field?.type === "char" || field?.type === "boolean") {
449:     if (raw === "Y" || raw === "1" || String(raw) === "true") {
450:       return (
451:         <Badge className="bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400 text-[10px] h-5 rounded-sm border-0 font-medium">
452:           Да
453:         </Badge>
454:       );
455:     }
456:     if (raw === "N" || raw === "0" || String(raw) === "false") {
457:       return (
458:         <Badge variant="secondary" className="text-[10px] h-5 rounded-sm font-normal">
459:           Нет
460:         </Badge>
461:       );
462:     }
463:   }
464:   // Money type — formatted with currency
465:   if (field?.type === "money" && raw) {
466:     const parts = String(raw).split("|");
467:     const amount = parseFloat(parts[0]);
468:     const currency = parts[1] || "";
469:     if (!isNaN(amount)) {
470:       return (
471:         <span className="font-mono text-[11px] tabular-nums font-normal text-muted-foreground">
472:           {amount.toLocaleString("ru-RU", {
473:             minimumFractionDigits: 2,
474:             maximumFractionDigits: 2,
475:           })}{" "}
476:           <span>{currency}</span>
477:         </span>
478:       );
479:     }
480:   }
481:   // Numeric fields (double, integer)
482:   if (field?.type === "double" || field?.type === "integer") {
483:     const num = parseFloat(resolved);
484:     if (!isNaN(num) && field?.type === "double") {
485:       return (
486:         <span className="font-mono text-[11px] tabular-nums font-normal text-muted-foreground">
487:           {num.toLocaleString("ru-RU", {
488:             minimumFractionDigits: 2,
489:             maximumFractionDigits: 2,
490:           })}
491:         </span>
492:       );
493:     }
494:     if (!isNaN(num) && field?.type === "integer") {
495:       return (
496:         <span className="font-mono text-[11px] tabular-nums font-normal text-muted-foreground">
497:           {Math.round(num).toLocaleString("ru-RU")}
498:         </span>
499:       );
500:     }
501:   }
502:   // Opportunity field
503:   if (field?.id === "OPPORTUNITY") {
504:     const num = parseFloat(resolved);
505:     if (!isNaN(num)) {
506:       return (
507:         <span className="font-mono text-[11px] tabular-nums font-normal text-muted-foreground">
508:           {num.toLocaleString("ru-RU", {
509:             minimumFractionDigits: 2,
510:             maximumFractionDigits: 2,
511:           })}
512:         </span>
513:       );
514:     }
515:   }
516:   // Date fields
517:   if (
518:     field?.type === "date" ||
519:     field?.type === "datetime" ||
520:     field?.id === "DATE_CREATE" ||
521:     field?.id === "DATE_MODIFY"
522:   ) {
523:     const d = new Date(resolved);
524:     if (!isNaN(d.getTime())) {
525:       const dateStr = d.toLocaleDateString("ru-RU", {
526:         day: "2-digit",
527:         month: "2-digit",
528:         year: "numeric",
529:       });
530:       const timeStr =
531:         field?.type === "datetime"
532:           ? ` ${d.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" })}`
533:           : "";
534:       return (
535:         <span className="font-mono text-[11px] tabular-nums font-normal text-muted-foreground">
536:           {dateStr}
537:           {timeStr}
538:         </span>
539:       );
540:     }
541:   }
542:   // Payment status — colored badges
543:   if (field?.id === "UF_CRM_1584464068013") {
544:     const statusColors: Record<string, string> = {
545:       "Не оплачен": "bg-red-50 text-red-700 dark:bg-red-900/30 dark:text-red-400",
546:       "Выставлен счет": "bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
547:       "Ожидает подтверждения": "bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
548:       "Платеж проведен": "bg-sky-50 text-sky-700 dark:bg-sky-900/30 dark:text-sky-400",
549:       "Ошибка": "bg-red-100 text-red-800 dark:bg-red-900/50 dark:text-red-300",
550:       "Оплачен": "bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400",
551:       "Возвращен": "bg-gray-50 text-gray-700 dark:bg-gray-900/30 dark:text-gray-400",
552:     };
553:     const colorClass = statusColors[resolved];
554:     if (colorClass) {
555:       return (
556:         <Badge className={`${colorClass} text-[10px] h-5 rounded-sm border-0 font-medium`}>
557:           {resolved}
558:         </Badge>
559:       );
560:     }
561:   }
562:   // Stage — colored badges
563:   if (field?.id === "STAGE_ID") {
564:     const stageColors: Record<string, string> = {
565:       "Новая": "bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
566:       "Подготовка": "bg-sky-50 text-sky-700 dark:bg-sky-900/30 dark:text-sky-400",
567:       "Счёт выставлен": "bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
568:       "В работе": "bg-violet-50 text-violet-700 dark:bg-violet-900/30 dark:text-violet-400",
569:       "Сделка успешна": "bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400",
570:       "Сделка провалена": "bg-red-50 text-red-700 dark:bg-red-900/30 dark:text-red-400",
571:     };
572:     const colorClass = stageColors[resolved];
573:     if (colorClass) {
574:       return (
575:         <Badge className={`${colorClass} text-[10px] h-5 rounded-sm border-0 font-medium`}>
576:           {resolved}
577:         </Badge>
578:       );
579:     }
580:   }
581:   // Enumeration with list values — show as subtle badge for short values
582:   if (field?.listValues && field.listValues.length <= 8) {
583:     const isKnownValue = field.listValues.some(
584:       (lv) => lv.VALUE === resolved || resolved.includes(lv.VALUE)
585:     );
586:     if (isKnownValue && resolved.length <= 35) {
587:       return (
588:         <Badge
589:           variant="secondary"
590:           className="text-[10px] h-5 rounded-sm font-normal max-w-[200px] truncate bg-muted/80"
591:         >
592:           {resolved}
593:         </Badge>
594:       );
595:     }
596:   }
597:   // Address type
598:   if (field?.type === "address") {
599:     return (
600:       <span className="text-xs truncate max-w-[220px] block text-muted-foreground" title={resolved}>
601:         {resolved}
602:       </span>
603:     );
604:   }
605:   // Activities
606:   if (field?.id === "ACTIVITY_LAST" || field?.id === "ACTIVITY_NEXT") {
607:     return (
608:       <span className="text-xs truncate max-w-[250px] block" title={resolved}>
609:         {resolved}
610:       </span>
611:     );
612:   }
613:   // Default — React auto-escapes JSX text, preventing XSS from CRM data
614:   if (colId === "COMPANY_TITLE") {
615:     const companyId = String(deal.COMPANY_ID || "").trim();
616:     if (companyId) {
617:       return (
618:         <span className="text-xs">
619:           {resolved}
620:         </span>
621:       );
622:     }
623:   }
624:   if (colId === "ASSIGNED_BY_ID") {
625:     const userId = String(deal.ASSIGNED_BY_ID || "").trim();
626:     if (userId) {
627:       return (
628:         <span
629:           className="text-xs cursor-pointer hover:underline text-brand-blue"
630:           onClick={() => openDrawer("responsible", userId)}
631:         >
632:           {resolved}
633:         </span>
634:       );
635:     }
636:   }
637:   return <span className="text-xs">{resolved}</span>;
638: }
```
