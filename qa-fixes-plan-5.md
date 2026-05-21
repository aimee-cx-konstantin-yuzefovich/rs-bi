# QA & Stress Test Plan: Table Header Wrapping

## Identified Potential Issues (QA Review)

1. **Filter Icon Misalignment (The "Floating Icon" Problem):**
   - **Scenario:** A column title wraps to 3 lines.
   - **Current State:** The outer container holding the title and the filter icon is set to `flex items-center`.
   - **Result:** The filter icon will be vertically centered across the 3 lines, looking disconnected from the text.
   - **Fix:** Change the outer container to `items-start` and add a slight top margin (`mt-1`) to the filter button so it aligns with the first line of text.

2. **Cramped Text (Missing Vertical Padding):**
   - **Scenario:** Text wraps to multiple lines.
   - **Current State:** The `<th>` element lacks explicit vertical padding (`py`).
   - **Result:** The wrapped text might touch the top and bottom borders of the header row, making it hard to read and visually unappealing.
   - **Fix:** Add `py-2 px-2` to the `<th>` element to ensure the text has "breathing room" regardless of how many lines it takes up.

3. **Extremely Long Unbreakable Words:**
   - **Scenario:** A title like `VeryLongWordWithoutSpaces`.
   - **Current State:** We added `break-words`.
   - **Result:** Tailwind's `break-words` handles this correctly by breaking the word mid-character if it exceeds the container width. No further action needed, but verified as safe.

4. **Virtualizer Conflict:**
   - **Scenario:** Header height changes dynamically.
   - **Current State:** The table uses `@tanstack/react-virtual`.
   - **Result:** The `thead` is rendered outside the virtualized `tbody` area. The virtualizer only cares about row heights in the body. No conflict. Verified as safe.

## Implementation Steps for Code Mode
1. Update the `<th>` classes to include `py-2 px-2`.
2. Update the `div` inside `<th>` from `flex items-center gap-1` to `flex items-start gap-1`.
3. Add `mt-0.5` or `mt-1` to the filter `<button>` to align it with the text.