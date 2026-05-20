"use client";

import { useDashboardStore, type FieldInfo, DEFAULT_COLUMNS } from "@/store/dashboard-store";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { Columns3, Search, RotateCcw, Check, X, GripVertical } from "lucide-react";
import { useState, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

export function ColumnSelector() {
  const { fields, selectedColumns, toggleColumn, setSelectedColumns, reorderColumns, columnSelectorOpen, setColumnSelectorOpen } =
    useDashboardStore();
  const [search, setSearch] = useState("");

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 5, // 5px movement required before dragging starts
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const filteredFields = useMemo(() => {
    if (!search.trim()) return fields;
    const q = search.toLowerCase();
    return fields.filter(
      (f) =>
        f.title.toLowerCase().includes(q) ||
        f.id.toLowerCase().includes(q)
    );
  }, [fields, search]);

  const selectedCount = selectedColumns.length;

  const handleSelectAll = () => {
    setSelectedColumns(filteredFields.map((f) => f.id));
  };

  const handleDeselectAll = () => {
    // Keep at least the first available field to avoid empty table
    if (filteredFields.length > 0) {
      setSelectedColumns([filteredFields[0].id]);
    }
  };

  const handleReset = () => {
    const availableDefaults = DEFAULT_COLUMNS.filter((col) =>
      fields.some((f) => f.id === col)
    ) as string[];
    const otherFields = fields
      .map((f) => f.id)
      .filter((id) => !availableDefaults.includes(id));
    
    if (availableDefaults.length === 0 && otherFields.length > 0) {
      setSelectedColumns(otherFields);
    } else {
      setSelectedColumns([...availableDefaults, ...otherFields]);
    }
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;

    if (over && active.id !== over.id) {
      const oldIndex = selectedColumns.indexOf(active.id as string);
      const newIndex = selectedColumns.indexOf(over.id as string);
      reorderColumns(oldIndex, newIndex);
    }
  };

  // Group fields
  const selectedFieldsObjects = useMemo(() => {
    return selectedColumns
      .map((id) => fields.find((f) => f.id === id))
      .filter((f): f is FieldInfo => f !== undefined);
  }, [selectedColumns, fields]);

  const availableFields = useMemo(() => {
    return filteredFields.filter((f) => !selectedColumns.includes(f.id));
  }, [filteredFields, selectedColumns]);

  const dealFields = availableFields.filter((f) => !f.id.startsWith("COMPANY_"));
  const companyFields = availableFields.filter((f) => f.id.startsWith("COMPANY_"));

  return (
    <Sheet open={columnSelectorOpen} onOpenChange={setColumnSelectorOpen}>
      <AnimatePresence>
        {columnSelectorOpen && (
          <SheetContent 
            className="w-[400px] sm:w-[440px] p-0 rounded-l-lg flex flex-col" 
            side="right"
          >
            <motion.div
              initial={{ x: "100%", opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              exit={{ x: "100%", opacity: 0 }}
              transition={{ type: "spring", damping: 25, stiffness: 200 }}
              className="flex flex-col h-full"
            >
              <SheetHeader className="p-5 pb-3 space-y-1 shrink-0">
                <SheetTitle className="flex items-center gap-2 text-base">
                  <div className="p-1.5 rounded-md bg-brand-blue/10">
                    <Columns3 className="h-4 w-4 text-brand-blue" />
                  </div>
                  Настройка столбцов
                </SheetTitle>
                <SheetDescription className="text-xs text-muted-foreground">
                  Выберите поля и перетащите для изменения порядка
                </SheetDescription>
              </SheetHeader>

              <div className="px-5 pb-2.5 shrink-0">
                <div className="relative">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground" />
                  <Input
                    placeholder="Поиск полей..."
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className="pl-8 h-8 text-xs rounded-md bg-muted/50 border-0 focus-visible:bg-background focus-visible:ring-1"
                  />
                </div>
              </div>

              <div className="px-5 pb-2.5 flex items-center justify-between shrink-0">
                <Badge variant="secondary" className="text-[10px] font-semibold h-5">
                  {selectedCount} выбрано
                </Badge>
                <div className="flex gap-0.5">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={handleSelectAll}
                    className="h-6 text-[10px] rounded-sm gap-1 px-2"
                  >
                    <Check className="h-2.5 w-2.5" />
                    Все
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={handleDeselectAll}
                    className="h-6 text-[10px] rounded-sm gap-1 px-2"
                  >
                    <X className="h-2.5 w-2.5" />
                    Снять
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={handleReset}
                    className="h-6 text-[10px] rounded-sm gap-1 px-2"
                  >
                    <RotateCcw className="h-2.5 w-2.5" />
                    Сброс
                  </Button>
                </div>
              </div>

              <Separator className="shrink-0" />

              <ScrollArea className="flex-1 min-h-0">
                <div className="p-3 space-y-4">
                  {/* Selected Columns (Draggable) */}
                  {selectedFieldsObjects.length > 0 && (
                    <div>
                      <div className="px-2 py-1.5 text-[10px] font-bold text-muted-foreground uppercase tracking-widest sticky top-0 bg-background/95 backdrop-blur z-10">
                        Выбранные столбцы
                      </div>
                      <DndContext
                        sensors={sensors}
                        collisionDetection={closestCenter}
                        onDragEnd={handleDragEnd}
                      >
                        <SortableContext
                          items={selectedColumns}
                          strategy={verticalListSortingStrategy}
                        >
                          <div className="space-y-0.5">
                            {selectedFieldsObjects.map((field) => (
                              <SortableColumnItem
                                key={field.id}
                                field={field}
                                onToggle={() => toggleColumn(field.id)}
                                isCustom={field.id.startsWith("UF_CRM_") || field.id.startsWith("COMPANY_UF_CRM_")}
                              />
                            ))}
                          </div>
                        </SortableContext>
                      </DndContext>
                    </div>
                  )}

                  {/* Available Columns */}
                  {(dealFields.length > 0 || companyFields.length > 0) && (
                    <div>
                      <div className="px-2 py-1.5 text-[10px] font-bold text-muted-foreground uppercase tracking-widest sticky top-0 bg-background/95 backdrop-blur z-10">
                        Доступные столбцы
                      </div>
                      <div className="space-y-0.5">
                        {dealFields.length > 0 && (
                          <>
                            <div className="px-2 py-1 text-[9px] font-semibold text-muted-foreground/70 uppercase">
                              Сделка
                            </div>
                            {dealFields.map((field) => (
                              <ColumnItem
                                key={field.id}
                                field={field}
                                checked={false}
                                onToggle={() => toggleColumn(field.id)}
                                isCustom={field.id.startsWith("UF_CRM_")}
                              />
                            ))}
                          </>
                        )}
                        {companyFields.length > 0 && (
                          <>
                            <div className="px-2 py-1 mt-2 text-[9px] font-semibold text-muted-foreground/70 uppercase">
                              Компания
                            </div>
                            {companyFields.map((field) => (
                              <ColumnItem
                                key={field.id}
                                field={field}
                                checked={false}
                                onToggle={() => toggleColumn(field.id)}
                                isCustom={field.id.startsWith("COMPANY_UF_CRM_")}
                              />
                            ))}
                          </>
                        )}
                      </div>
                    </div>
                  )}

                  {filteredFields.length === 0 && (
                    <div className="text-center py-8 text-muted-foreground text-xs">
                      {fields.length === 0
                        ? "Загрузите поля с CRM"
                        : "Ничего не найдено"}
                    </div>
                  )}
                </div>
              </ScrollArea>
            </motion.div>
          </SheetContent>
        )}
      </AnimatePresence>
    </Sheet>
  );
}

function SortableColumnItem({
  field,
  onToggle,
  isCustom = false,
}: {
  field: FieldInfo;
  onToggle: () => void;
  isCustom?: boolean;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: field.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 1 : 0,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`flex items-center gap-2.5 px-2.5 py-1.5 rounded-md transition-colors ${
        isDragging
          ? "bg-brand-blue/10 shadow-sm opacity-80"
          : "bg-brand-blue/5 dark:bg-brand-blue/10 hover:bg-brand-blue/10"
      }`}
    >
      <div
        {...attributes}
        {...listeners}
        className="cursor-grab active:cursor-grabbing p-0.5 text-muted-foreground hover:text-foreground rounded"
      >
        <GripVertical className="h-3.5 w-3.5" />
      </div>
      <Checkbox
        checked={true}
        onCheckedChange={onToggle}
        className="data-[state=checked]:bg-brand-blue data-[state=checked]:border-brand-blue h-3.5 w-3.5"
      />
      <ColumnItemContent field={field} isCustom={isCustom} />
    </div>
  );
}

function ColumnItem({
  field,
  checked,
  onToggle,
  isCustom = false,
}: {
  field: FieldInfo;
  checked: boolean;
  onToggle: () => void;
  isCustom?: boolean;
}) {
  return (
    <label
      className={`flex items-center gap-2.5 px-2.5 py-1.5 rounded-md cursor-pointer transition-all ${
        checked
          ? "bg-brand-blue/5 dark:bg-brand-blue/10"
          : "hover:bg-muted/50"
      }`}
    >
      <div className="w-[22px]" /> {/* Spacer to align with GripVertical */}
      <Checkbox
        checked={checked}
        onCheckedChange={onToggle}
        className="data-[state=checked]:bg-brand-blue data-[state=checked]:border-brand-blue h-3.5 w-3.5"
      />
      <ColumnItemContent field={field} isCustom={isCustom} />
    </label>
  );
}

function ColumnItemContent({ field, isCustom }: { field: FieldInfo; isCustom: boolean }) {
  // Type display names in Russian
  const typeLabels: Record<string, string> = {
    string: "Текст",
    double: "Число",
    integer: "Целое",
    date: "Дата",
    datetime: "Дата/Время",
    money: "Деньги",
    enumeration: "Список",
    boolean: "Да/Нет",
    char: "Да/Нет",
    crm_status: "Статус",
    crm_currency: "Валюта",
    crm_category: "Воронка",
    address: "Адрес",
    file: "Файл",
  };

  const typeLabel = typeLabels[field.type] || field.type;

  return (
    <div className="flex-1 min-w-0">
      <div className="text-xs font-medium truncate leading-tight">{field.title}</div>
      <div className="text-[10px] text-muted-foreground truncate flex items-center gap-1 flex-wrap mt-0.5">
        <span className="font-mono opacity-50">{field.id}</span>
        {isCustom && (
          <Badge variant="outline" className="h-3.5 px-1 text-[9px] rounded-sm border-brand-orange/30 text-brand-orange leading-none">
            UF
          </Badge>
        )}
        <Badge variant="outline" className="h-3.5 px-1 text-[9px] rounded-sm leading-none">
          {typeLabel}
        </Badge>
        {field.isMultiple && (
          <Badge variant="outline" className="h-3.5 px-1 text-[9px] rounded-sm border-violet-300 text-violet-600 dark:border-violet-700 dark:text-violet-400 leading-none">
            Множ.
          </Badge>
        )}
      </div>
    </div>
  );
}
