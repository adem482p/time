# 047: Classes page selects leaves only and shows cards on mobile

- Status: Open
- Date: 2026-10-15, Reporter: user

## Description

Observed (change 1 — leaf-only selection): the classes catalogue lists all 163
grouping nodes, so broader classes (interior nodes such as `LCS1` or `LCS`)
are selectable. Typing `LCS1` and pressing Enter shows the union of every
timetable beneath it, with each line labelled by the class it comes from
(`span.s-class`).

Expected: only leaf classes (one timetable each, 94 of them) are selectable.
The catalogue, the autocomplete and the initial paint list leaves only; an
exact reference to a broader class (e.g. typing `LCS1`) takes the no-match
path instead of rendering a union, and `showClass` renders only single-leaf
weeks. No per-line class labels are emitted anymore.

Observed (change 2 — mobile cards): on viewports below 700px the week grid
(days as columns, six slots as rows) is kept via horizontal scrolling, with
columns rotated to start on the current school day.

Expected: narrow screens show a teacher-style session card list
(`table.c-sessions`: Day / Time / Teacher / Subject / Room, with NOW/NEXT
markers, day separators and dimmed idle days) while the desktop grid stays
byte-identical in structure and Monday-first everywhere. The desktop page
hides the card list; narrow screens hide the grid.

## Root cause

`initClassesPage` in `js/app.js` searches the whole grouping hierarchy:
`match.classSearch` / `match.suggest` results are rendered unfiltered,
`commit()` accepts any exact `classWeek` hit (including multi-leaf unions),
and `showClass` renders whenever at least one leaf matches. `renderWeek`
additionally branches on `week.leaves.length > 1` to label union lines and
rotates columns via `isNarrow()`/`orderedDays()`. `styles.css` re-asserts the
table layout for the grid inside the narrow media query instead of swapping
to cards, and has no teacher-cell card rules.

## Repro steps

Commands (from the repo root):

```
python3 -m http.server 8000
node --test test/classes.test.js test/libgroups.test.js
```

URLs + clicks:

1. Open http://localhost:8000/classes.html — the class list holds 163 entries
   including `LCS`/`LCS1`; type `LCS1`, press Enter — the detail shows a
   multi-class union grid with per-line class labels. After the fix the list
   holds 94 leaves only and `LCS1` reports no match.
2. Click a leaf (e.g. `GLSI3D1`) — the week renders with no per-line class
   labels.
3. Shrink the viewport below 700px with a leaf selected — the grid scrolls
   horizontally starting on the current day. After the fix the grid is hidden
   and the week shows as session cards (Day/Time/Teacher/Subject/Room) with
   NOW/NEXT markers; on desktop the cards are hidden and the grid is
   Monday-first.

## Discussion

### Maintainer triage (2026-10-15)

- **Verdict**: valid and in scope. Leaf-only selection removes the ambiguous
  union views; the card list mirrors the teachers page on mobile while the
  desktop grid is untouched.
- **Acceptance criteria**:
  1. `initClassesPage` builds a `leafSet` from `groups.leaves` once and
     filters the initial paint, `onInput` rows, `commit` rows and
     `classSuggestions` (by `leafSet[r.label]`) through it.
  2. `commit()` shows the exact ref only for a single-leaf week
     (`leaves.length === 1`), else a lone filtered row, else no-match.
  3. `showClass` renders only single-leaf weeks; anything else takes the
     existing nomatch path (detail nomatch, `markActive(null)`, remove
     `is-list`, `syncClear`, `stopCursor`).
  4. `renderWeek` drops `isUnion`/`s-class` labels and `isNarrow`/
     `orderedDays` (Monday-first `store.days` loops everywhere), and emits a
     `table.c-sessions` list (Day/Time/Teacher/Subject/Room, teacher cell
     before room cell) with today-only now/next marking via the computed
     cursor — never `nextSessionIdx`.
  5. `styles.css` hides `table.c-sessions` on desktop, hides `.weekwrap` on
     narrow (deleting the dead scroll-grid overrides), and adds `c-teacher`
     card order + `Teacher: ` label; today-before-now order, the
     `#layout:not(.is-list) #classList` rule and the classList flattening stay.
  6. `match.js`/`model.js`/`libgroups.js`/`color.js`, `Design.md` and
     `classes.html` are untouched; full `node --test` passes.
- **Risks/constraints**: equal-specificity orderings must keep now/next above
  the today tint; the `c-teacher`/`c-room` order-4 tie breaks by DOM order
  (teacher cell emitted first); dead-CSS removal must delete exactly the
  scroll-grid overrides; `applyCursor` keeps running harmlessly against the
  hidden grid on mobile.

### Fix implemented (2026-10-15)

- Diff summary (3 files + this issue file, nothing else):
  - `js/app.js`: header comment now describes leaf-only selection; `leafSet` /
    `isLeafRow` / `leafRows` added and applied to the initial paint, `onInput`,
    `commit` and `classSuggestions`; `commit()` gates exact refs on
    `leaves.length === 1`; `showClass` gates on `week.leaves.length !== 1`;
    `isNarrow`/`orderedDays`/`isUnion`/`s-class` removed; `renderWeek` emits
    the unchanged grid (both loops over `store.days`) plus a `table.c-sessions`
    list with `c-teacher` cells, `color.sessionRow` marking (today-only
    `isCurrentSession` + cursor `next`, `liveDays`-dim, `dayStart`,
    `NEXT_ARROW` gutter) and a session-count caption.
  - `styles.css`: desktop block hides `table.c-sessions`; narrow classes block
    hides `#detail .weekwrap` and drops the dead scroll-grid overrides;
    generic narrow card block gains `#detail td.c-teacher { order: 4; }` (tie
    with `c-room`, broken by DOM order — teacher cell emitted first) and the
    `Teacher: ` label.
  - `test/classes.test.js`: 5 new tests (leaf catalogue === 94 leaves,
    `LCS1`/`LCS` excluded / `GLSI3D1` kept, leaf ordering + dayCursor
    boundaries, leaf-only app.js structure, c-sessions emission, per-viewport
    CSS rules); every pre-existing test kept green.
  - `issues/047-classes-leaves-cards.md`: this file.
- Verification results:
  - `node --test test/classes.test.js test/libgroups.test.js`: 57 pass, 0 fail
    (39 classes + 18 libgroups).
  - Node asserts vs real `emplois.csv`: leaf-filtered catalogue length 94 ===
    `groups.leaves.length`; `LCS1`/`LCS` excluded, `GLSI3D1` kept (22
    sessions, ordered by day/slot); dayCursor Sunday/before/after/gap cases
    unchanged.
  - Structural asserts: classes section of `app.js` has
    leafSet/leafRows/isLeafRow, single-leaf gates, c-sessions + c-teacher
    emission, and no orderedDays/isNarrow/s-class/isUnion/`nextSessionIdx(`;
    `styles.css` has the desktop c-sessions hide, narrow weekwrap hide,
    c-teacher label, retained c-cell.today-before-now order + classList hide
    rule + classList flattening, and none of the dead scroll-grid rules.
  - `python3 -m http.server` re-serve: `curl` 200 for `classes.html`,
    `index.html`, `styles.css`, `js/app.js`, `vendor/kaomoji.js`.
