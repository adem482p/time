# 046: Classes page mirrors teachers page chrome and mobile week behavior

- Status: Fixed
- Date: 2026-10-15, Reporter: user

## Description

Observed: the classes page (`classes.html`) uses its own minimal chrome while
the teachers page (`index.html`) has the full treatment — no SEO/meta head
tags, no author credit, a plain-text empty state (`<p class="empty">…`) with no
kaomoji vendor loaded, uncentered `h1`/`#status`, an unconstrained `#classList`
on desktop, no today-column tint in the week grid (only the header cell and the
now/next cells are marked), and day columns always in Monday-first order on
narrow screens.

Expected: `classes.html` mirrors the teachers page chrome (SEO head,
author-credit, kaomoji empty state with hop easter egg, centered header,
desktop list-pane placement) and the week grid marks the whole current-day
column and, on narrow screens, orders columns starting with the current school
day. The grid itself (days as columns, six slots as rows) stays on both
viewports — it is not replaced with a session table.

## Root cause

The classes page was built with its own minimal markup and styles: `classes.html`
carries only `<title>` + stylesheet in `<head>` and no author-credit/kaomoji
script in `<body>`; the teachers-only CSS selectors (`body[data-page="teachers"]`
header chrome, `#teacherList` max-height, `.no-teacher-selected`) were never
extended to `body[data-page="classes"]`; `renderWeek` in `js/app.js` highlights
only `th.today` plus now/next cells and always iterates `store.days` in natural
order; `initClassesPage` renders a plain-text empty state.

## Repro steps

Commands (from the repo root):

```
python3 -m http.server 8000
node --test test/classes.test.js test/libgroups.test.js
```

URLs + clicks:

1. Open http://localhost:8000/classes.html — note the left-aligned header, the
   missing author credit, and the plain "Search for a class to see its week."
   empty detail area (compare http://localhost:8000/index.html, which shows a
   centered title, author credit and a giant faint kaomoji face).
2. Pick any class (e.g. click `GLSI3D1`) on a school day during school hours —
   only the day header and the now/next cells are tinted, not the whole
   current-day column.
3. Shrink the viewport below 700px — the grid columns still start on Monday
   instead of the current school day.

## Discussion

### Maintainer triage (2026-10-15)

- **Verdict**: valid and in scope. The classes page should mirror the teachers
  page chrome and gain the today-column treatment; the grid stays a grid.
- **Acceptance criteria**:
  1. `classes.html` head mirrors `index.html` SEO/meta tags with
     classes-specific URLs (`https://adem482p.github.io/time/classes.html`);
     `<title>Classes — Emplois</title>` is kept.
  2. `classes.html` body gains the identical author-credit paragraph after
     `#status` and `vendor/kaomoji.js` immediately before `js/app.js`.
  3. `styles.css` teachers-only chrome selectors are extended to
     `body[data-page="classes"]` (centered `h1`/`#status`, display `h1`, all
     three `.author-credit` rules, desktop `#listPane`/`#themeCycle`), plus a
     `#classList` max-height counterpart; comments stay accurate.
  4. `#detail .no-teacher-selected` also covers `#detail .no-class-selected`.
  5. `table.week td.c-cell.today` tints the whole current-day column with the
     `th.today` fill, placed BEFORE the now/next cell rules.
  6. `initClassesPage` gains the kaomoji empty state mirroring
     `initTeachersPage` (facePool length<=12, HOP_MS=240, reducedMotion guard,
     `.no-class-selected` "No Class Selected", click-to-hop + animationend
     listeners delegated on `#detail`).
  7. `renderWeek` orders columns from the current school day on narrow screens
     (`isNarrow` via `matchMedia('(max-width: 700px)')`, guarded like
     `isCoarsePointer`; `orderedDays` rotates `store.days`; Sunday/unknown keep
     natural order; both thead and cell loops use it), marks the full
     current-day column (`C.today` in addition to now/next), and `applyCursor`
     toggles `C.today` on `td.c-cell`; cursor-line positioning untouched.
     Today-only `model.dayCursor` is kept — never `nextSessionIdx`.
  8. Union selections keep per-line `span.s-class` labels; no columns are added.
  9. `test/classes.test.js` is updated (kaomoji IS loaded, author-credit,
     canonical/meta description, `td.c-cell.today`, `no-class-selected`); all
     tests in `node --test` pass.
- **Risks/constraints**: `td.c-cell.today` must precede now/next rules so equal
  specificity keeps now/next on top; `isNarrow`/`matchMedia` must be guarded for
  node; the `#layout:not(.is-list) … #classList` hide rule and the mobile
  search-button block must stay intact; `Design.md` needs no changes.

### Fix implemented (2026-10-15)

- Diff summary (5 files, nothing else):
  - `classes.html`: full SEO/meta head mirroring `index.html` (description,
    theme-color, og:* with `classes.html` URL, twitter card, canonical
    `https://adem482p.github.io/time/classes.html`); author-credit paragraph
    after `#status`; `vendor/kaomoji.js` before `js/app.js`; title unchanged.
  - `styles.css`: teachers-only selectors extended with
    `body[data-page="classes"]` counterparts (centered `h1`/`#status`, display
    `h1`, three `.author-credit` rules, desktop `#listPane`/`#themeCycle`);
    `#classList` max-height counterpart added; `#detail .no-class-selected`
    added to the empty-state heading rule; `table.week td.c-cell.today` added
    before the now/next cell rules with the `th.today` fill.
  - `js/app.js`: `initClassesPage` gains the kaomoji empty state
    (facePool/emptyFace/HOP_MS/reducedMotion/emptyStateHTML/nextFace,
    click-to-hop + animationend listeners on `#detail`); `isNarrow` +
    `orderedDays` added; `renderWeek` uses ordered days in both loops and
    pushes `C.today` on current-day cells; `applyCursor` toggles `C.today` on
    `td.c-cell`. Union `span.s-class` labels untouched; no `nextSessionIdx`.
  - `test/classes.test.js`: page-structure test now asserts kaomoji IS loaded,
    author-credit, canonical/meta description; CSS test covers
    `td.c-cell.today` (incl. before-now ordering) and `no-class-selected`.
  - `issues/046-classes-mirror-teachers.md`: this file.
- Verification results:
  - `node --test test/classes.test.js test/libgroups.test.js`: 52 pass, 0 fail
    (34 classes + 18 libgroups).
  - Node assertions against the real `emplois.csv`: `dayCursor` boundary cases
    (Sunday/before/after/gap from the existing tests) plus real-code
    `orderedDays`/`isNarrow` extracted from `js/app.js` — Sunday/before/after/
    unknown keep natural order; narrow Wednesday rotates to MERCREDI-first,
    narrow Saturday to SAMEDI-first; node guard returns false.
  - Structural asserts: author-credit/kaomoji/canonical in `classes.html`;
    extended selectors + rule order + hide rule in `styles.css`; classes
    section of `app.js` references `no-class-selected`/`orderedDays`/
    `isNarrow`/`C.today` and no `nextSessionIdx`.
  - `python3 -m http.server` re-serve: `curl` 200 for `classes.html`,
    `index.html`, `styles.css`, `js/app.js`, `vendor/kaomoji.js`; new selectors
    present in served CSS.
