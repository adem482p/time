# 081: Remove dead week-render code left in classes/+page.svelte after component extraction

Status: Open
Date: 2026-11-01
Reporter: coordinator

## Description

After extracting `WeekGrid.svelte` and `DayGroupCards.svelte` (commit 9cbfedc), `app/src/routes/classes/+page.svelte` retained duplicated render helpers that are now dead — the components re-derive their own. The cursor-line `$effect` also exists twice (page + component), doing identical `getBoundingClientRect` work every tick.

## Root cause

Component extraction copied logic but didn't delete the page-level originals. The page template uses the components, so the page's copies are never called.

## Repro steps

```bash
# From repo root
grep -n "indexByDaySlot\|dayGroups\|nextMark\|sessionRowClasses\|isTodayCell\|weekCell" app/src/routes/classes/+page.svelte
# All appear only in their own definitions and internal cross-refs; none in template
grep -n "nextArrowHTML" app/src/routes/classes/+page.svelte app/src/lib/components/DayGroupCards.svelte
# Imported in both, never called
```

## Discussion

### Maintainer triage (2026-11-01)

Delete from `classes/+page.svelte`:
- `indexByDaySlot` (~299–306)
- `dayGroups` $derived (~309–323)
- `nextMark` (~539–542)
- `sessionRowClasses` (~545–549)
- `isTodayCell` (~554–557)
- `weekCell` (~563–570)
- `nextArrowHTML` import (~32)
- cursor `$effect` (~428–455) — keep component's copy; remove page's `weekWrapEl`/`cursorLineEl` bindings

Delete from `DayGroupCards.svelte`: unused `nextArrowHTML` import (L8).
Delete from `WeekGrid.svelte`: unused `now` prop from destructure (L10).

Test pin move: `test/classes.test.js` (~943) asserts `sec.indexOf('color.sessionRow(')` on the page slice. Change to `DAYGROUP_SRC.indexOf('color.sessionRow(')` — the live call is in the component.

Acceptance criteria:
1. `node --test test/*.test.js` → 192 pass / 0 fail
2. Grep confirms no deleted identifier survives in `classes/+page.svelte`
3. `npm run build` in `app/` succeeds; built `classes/index.html` still contains `c-sessions` table and `nexttag` classes