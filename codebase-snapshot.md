# Codebase Snapshot: Архитектура, Логика и Код

Этот документ содержит выжимку ключевой логики работы системы, а также **исходный код** критически важных участков для ИИ-аудитора. Цель — обеспечить возможность проверки правильности выполнения кода и понимания контекста последних правок.

## 1. Архитектура и Зависимости
- **Фреймворк:** Next.js (App Router).
- **Стейт-менеджмент:** Zustand (`src/store/dashboard-store.ts`).
- **Интеграция с CRM:** Серверные API-роуты (`src/app/api/bitrix/*`), обертки `bitrixGet` / `bitrixPost` (`src/lib/bitrix.ts`).

## 2. Логика рендеринга данных (Код)

Основная логика преобразования сырых ID из CRM в читаемые значения находится в хуке `useTableState` (`src/hooks/use-table-state.ts`), в функции `resolveValue`.

### Код: `resolveValue` (фрагмент для Ответственного и Компании)
```typescript
// src/hooks/use-table-state.ts
const resolveValue = useCallback(
  (deal: DealData, colId: string): string => {
    const raw = deal[colId];
    const field = fieldMap.get(colId);

    if (raw === null || raw === undefined || raw === "") return "";

    // Логика для колонки "Ответственный"
    if (colId === RESPONSIBLE_FIELD_ID) {
      const id = String(raw);
      const userName = userNames[id]?.trim();
      const dealName = String(deal.ASSIGNED_BY_NAME || "").trim();

      return userName || dealName || `ID ${id}`;
    }

    // Логика для колонки "Компания"
    if (colId === "COMPANY_TITLE") {
      // 1. Prefer direct value from deal (fast path)
      const directTitle = String(deal.COMPANY_TITLE || "").trim();
      if (directTitle) return directTitle;

      // 2. Fallback to companiesData via COMPANY_ID
      const companyId = String(deal.COMPANY_ID ?? "").trim();
      if (!companyId || companyId === "0") return "—";

      const fromDict = companiesData?.[companyId];
      const title = typeof fromDict === "string"
        ? fromDict
        : fromDict?.TITLE ?? fromDict?.title ?? "";

      return title.trim() || "";
    }
    
    // ... остальной код resolveValue
  },
  [fieldMap, userNames, companiesData, activitiesData]
);
```

### Код: `CellValue` (фрагмент рендеринга ячеек)
Компонент `CellValue` (`src/components/dashboard/data-table.tsx`) получает `resolved` значение и рендерит UI.

```tsx
// src/components/dashboard/data-table.tsx
function CellValue({
  raw,
  resolved,
  field,
  deal,
  colId,
  companiesLoading,
  activitiesLoading,
  userNamesLoading, // <-- ДОБАВЛЕНО: проп для отслеживания загрузки имен
  openDrawer,
}: {
  // ... типы пропсов
}) {
  // Рендеринг колонки "Компания"
  if (colId === "COMPANY_TITLE") {
    if (companiesLoading && !resolved) {
      return <Skeleton className="h-4 w-28 rounded" />;
    }

    if (resolved?.trim() && resolved !== "—") {
      return (
        <span className="truncate block max-w-[180px]" title={resolved}>
          {resolved}
        </span>
      );
    }

    const companyId = String(deal.COMPANY_ID ?? "").trim();
    if (companyId && companyId !== "0") {
      // ФОЛЛБЭК: Если название пустое, выводим ID
      return (
        <span className="text-muted-foreground text-xs" title={`Company ID: ${companyId}`}>
          ID {companyId}
        </span>
      );
    }

    return <span className="text-muted-foreground">—</span>;
  }

  // Рендеринг колонки "Ответственный"
  if (colId === RESPONSIBLE_FIELD_ID) {
    const userId = String(deal?.ASSIGNED_BY_ID || "").trim();
    if (userId) {
      // ПОКАЗ СКЕЛЕТОНА: Если имена еще грузятся и значение равно "ID {id}"
      if (userNamesLoading && resolved === `ID ${userId}`) {
        return <Skeleton className="h-4 w-28 rounded" />;
      }
      return (
        <span
          className="text-xs cursor-pointer hover:underline text-brand-blue"
          onClick={() => openDrawer("responsible", userId)}
        >
          {resolved}
        </span>
      );
    }
  }

  // ... остальной код CellValue
}
```

---

## 3. Пояснения по правкам для ИИ-аудитора

### Правки: Колонка «Ответственный» (Responsible)
**Проблема:** Ошибка TypeScript — в `CellValue` не передавался `userNamesLoading`.
**Как исправлено (см. код выше):**
1. В `data-table.tsx` вычисляется `isUserNamesLoading` и передается в `CellValue`.
2. В самом `CellValue` добавлено условие: `if (userNamesLoading && resolved === 'ID ${userId}') return <Skeleton ... />`.
**Результат:** Пока имена асинхронно грузятся из `/api/bitrix/users`, пользователь видит скелетон вместо сырого ID. Как только имя загружено, `resolveValue` отдает реальное имя, и оно рендерится как кликабельная ссылка.

### Правки: Колонка «Компания» (Company)
**Проблема:** В таблице вместо названия компании отображается `ID 123`.
**Анализ кода (почему так происходит):**
1. В `resolveValue` (см. код) идет попытка взять `TITLE` из `companiesData`. Если данных нет или `TITLE` пустой, возвращается `""`.
2. В `CellValue` (см. код) есть проверка: `if (resolved?.trim() && resolved !== "—")`. Если `resolved` пустое, код проваливается ниже к фоллбэку: `return <span ...>ID {companyId}</span>`.
**Что нужно проверить аудитору:**
- **Расположение колонок:** В `src/lib/crm-constants.ts` колонки `COMPANY_TITLE` и `ASSIGNED_BY_ID` должны стоять рядом в массиве `DEAL_TABLE_DEFAULT_COLUMNS`.
- **Данные API:** Почему `companiesData` не содержит `TITLE`? Нужно проверить ответ `/api/bitrix/companies`. Либо у пользователя нет прав на чтение компаний в CRM, либо запрос `crm.company.list` сформирован неверно и не запрашивает поле `TITLE`. Код фронтенда отрабатывает корректно (показывает ID как защиту от пустой ячейки), проблема кроется в данных, приходящих от API.