# Table Header Dynamic Wrapping Plan

## Objective
Implement a hybrid solution for the data table headers: allow columns to be resizable (already partially implemented) and make the header text wrap dynamically based on the column width, ensuring no text is hidden (no tooltips needed).

## Current State
- Column resizing logic exists in `src/components/dashboard/data-table.tsx`.
- Header text is forced to a single line using Tailwind classes: `truncate max-w-[160px]`.

## Implementation Steps

1. **Update Header Text Wrapping:**
   - File: `src/components/dashboard/data-table.tsx`
   - Locate the `<th>` rendering block inside the `thead`.
   - Find the `<span>` containing the column title: `<span className="truncate max-w-[160px]">`.
   - Replace `truncate max-w-[160px]` with classes that support wrapping: `whitespace-normal break-words text-left leading-tight`.

2. **Adjust Alignment:**
   - The parent `<button>` currently uses `items-center`. When text wraps to multiple lines, centering the sort icon vertically might look awkward.
   - Change the button's alignment to `items-start` and add a slight top margin/padding to the icon if necessary, OR keep `items-center` if it looks visually balanced. (Recommend trying `items-start` with `mt-0.5` on the icons).

3. **Adjust Minimum Column Width:**
   - Locate `handlePointerMove` in the same file.
   - The current minimum width is 50px: `Math.max(50, ...)`.
   - Increase this to `80` or `100` to prevent users from squishing the column so much that the text wraps into a single vertical column of letters.

## Expected Outcome
When a user shrinks a column, the header text will wrap to 2 or more lines automatically, expanding the height of the header row to accommodate the text. When expanded, it will return to a single line.