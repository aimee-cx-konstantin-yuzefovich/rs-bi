# Drag-and-Drop Column Reordering Implementation Plan

## Objective
Add a premium Drag-and-Drop feature to the `ColumnSelector` component, allowing users to manually reorder their selected columns.

## Steps

### 1. Install Dependencies
We will use `@dnd-kit` for a modern, accessible, and highly customizable drag-and-drop experience.
- `@dnd-kit/core`
- `@dnd-kit/sortable`
- `@dnd-kit/utilities`

### 2. Update State Management (`src/store/dashboard-store.ts`)
Add a new action to handle the reordering of columns:
```typescript
reorderColumns: (startIndex: number, endIndex: number) => void;
```
This action will mutate the `selectedColumns` array by moving an item from `startIndex` to `endIndex`.

### 3. Refactor `ColumnSelector` UI (`src/components/dashboard/column-selector.tsx`)
Currently, the column selector shows a single list of all fields grouped by "Deal" and "Company".
We will split this into two distinct sections:
1. **Selected Columns (Draggable)**: A list of currently active columns. Each item will have a drag handle (e.g., `GripVertical` icon).
2. **Available Columns**: A list of inactive columns that can be added to the selected list.

### 4. Implement Drag-and-Drop Logic
Wrap the "Selected Columns" section in a `DndContext` and `SortableContext`.
- Use `useSortable` hook for each selected column item.
- Handle the `onDragEnd` event to call the `reorderColumns` action from the store.
- Add smooth animations and visual feedback during dragging (e.g., scaling, shadow, opacity changes).

### 5. UI/UX Polish
- Ensure the drag handle is clearly visible.
- Add a subtle background color change when an item is being dragged.
- Keep the "Available Columns" section clean and easy to search.
- Ensure the "Reset" button still works as expected, restoring the default order.