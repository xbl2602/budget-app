# User Log — Budget App v2.4.0

## Summary
Two changes were made to the budget app:

### 1. Predicted Total Now Includes All Records
Previously, the "predicted total" on the overview page (your estimated spending for the month) excluded records marked as "一次性大额消费" (exclude from average). Now it includes **all records** — matching the behavior of the month total display. This gives a more accurate spending prediction.

### 2. Sort Controls Added to Records Page
The 流水 (records) page now has sort controls in the filter section. You can:
- **Sort by:** 日期 (date), 金额 (amount), 备注 (note), or 分类 (category name)
- **Sort direction:** 正序 (ascending) ↑ or 倒序 (descending) ↓
- **Multi-level sorting:** Add multiple sort levels (e.g., first by category, then by amount)
- **Persistent:** Your sorting preferences are saved and remembered after refresh

## Agents Involved
- All work done directly by team-leader

## Version
- Updated from **v2.3.3 → v2.4.0**

## Limitations
- Sort applies to the full filtered record set, not just the current page
- Sort state is stored in browser localStorage (same device only)
