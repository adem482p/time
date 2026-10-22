# Features

The features that make up the website: the snapshot model that keeps it working
offline, the material the pages model, the four views, search and matching, the
theme system, redaction, the installable-app surface, and the small navigation
behaviors. Every claim here is read off the code and the issue tracker — issue
numbers appear as parenthetical provenance, not as a changelog. What the world
*is* (sessions, subjects, teachers, the class hierarchy, the PDF→CSV pipeline)
is outside this file's scope; this file only says what the app does
with it.

## Material: what the site models

All four pages read `emplois.csv` and nothing else. On top of the raw rows, the model layer builds
the material the views are drawn from:

- **Session fusion** — the same teacher, day and slot in different rooms (or the
  two alternating halves of one slot) collapse into a single row whose room and
  subject read `A or B`. The `SA` / `SB` week marker is model material rather
  than a rendered badge: a fused row keeps one marker only when every member of
  the slot agrees, and empty otherwise (never the stripped `S1` tag), while the
  views simply show the fused row.
- **Grouping pills** — the time page's slot detail lists the classes in that
  slot as pills resolved through the grouping hierarchy.
- **Indexes and availability** — unique teachers, subjects and grouping nodes,
  plus per-teacher availability (teaching now / free), which the teachers list
  re-ranks on every clock tick.

## The views

Four views over the same CSV, in the split of issue 072: the teachers app lives
at `teachers/index.html` and the classes app at `classes/index.html` (each its
own installable app with its own worker and manifest), the two utility views
live unlisted at `at/index.html` and `all/index.html` — reachable only by
their URL, never by navigation (issue 073) — and the root landing page does
nothing but redirect to `teachers/`. No page carries a cross-page nav bar: the
classes app's own one was removed (issue 075), leaving that app a dead-end
reachable only by its URL and the root `classes.html` redirect stub.

### Matrix — `all/index.html`

The full timetable matrix: teachers crossed with the six time slots of the week.
Each cell where a teacher is engaged shows where they can be found — the room,
plus the day and subject of the session. It answers "when and where is this
teacher teaching?" at a glance, and can be filtered by day or teacher.

### Teachers — `teachers/index.html`

A view with teachers as the main object. The teacher list is searchable and
filterable live; teachers available today are raised to the top. Selecting a
teacher reveals their week: sessions grouped by day, the current and next session
highlighted, and days with no live stake dimmed. The same view adapts to narrow
screens: the list and the session table collapse into stacked cards.

### Time — `at/index.html`

A view with time slots as the main object. The week is grouped by day; today's
section is marked and scrolled into view, with the current and next slots
highlighted. Selecting a slot lists the teachers teaching then, where each can be
found, and which classes they teach. It answers "who is teaching right now, and
where?"

### Classes — `classes/index.html`

A view with classes as the main object — the student-facing counterpart to the
teacher and time views. The class is chosen through a live search over the
catalogue: only leaves — fully specified classes that own a timetable of their
own — are listed and selectable, typing only filters the list (the page ships
no autocomplete, issue 075), and a reference to a broader class reports no
match. Selecting a class draws its
week as a grid with the days as columns and the six slots as rows; the detail
heads with the class's shortcut form — `LCS3-GLSI_D Groupe 2` renders as
`GLSI3 D<sub>2</sub>`, the cohort as a real subscript, any shape the shortcut
rule does not know falling back to the full name (issue 075). Each cell lists
the sessions held then, every line giving the subject, the teacher and the room. A
semi-transparent red cursor crosses the grid at the current time, its arrowhead
resting in a small gutter beside the time column, and the current and next slots
are highlighted — the next only while it is still today, with nothing marked at
all on Sunday, before the day begins, or once it has ended. On narrow screens the
week collapses into stacked session cards, as the teachers view does. It answers
"what does this class have right now, and where?"

## Live time

One clock per page (issue 051): a single 30-second interval hands a fresh `Date`
to every subscribed region, and each region re-renders its own markup wholesale —
no diffing, no gates — with a catch-up tick when the tab becomes visible again.
The matrix page runs no timer at all. What it drives:

- the `● NOW` and `→ NEXT` tags on slots, session rows and grid cells, with
  today's day group raised and days with no live stake dimmed; `NEXT` is
  today-only — Sunday, before the first slot and after the last one show nothing,
  and the time page says so ("No sessions on Sunday…", "Day over — no more
  sessions today.");
- day-group listings that start from today and cycle forward (issue 050), with
  today's bucket auto-scrolled to the top of the slot list;
- the red cursor on the classes week grid, moved in place on every tick without a
  full re-render;
- the classes page's detail: per-day tables with desktop day headings restored
  (issue 048), the first of them starting at today, and exactly one week
  rendering below — the whole-week grid, the flat full-session list that used to
  follow it being gone (issue 049).

## Search and matching

A small pure search engine over the store: live fuzzy filtering that returns one
sorted list (exact matches first, then partial) with a header per fallback
section, and an autocomplete whose ghost line completes the rest of the typed
value inline, including prefix hints such as `subject:`. Queries can be typed
exactly with the `teacher:`, `class:` and `subject:` prefixes, alone or mixed
with free text; ranking keeps own identity above alias-only matches (the legacy
alias vocabulary, issues 010 and 029).

- A free-text query gives each teacher row its best matching subjects and
  classes (up to three each), highlighted where they match, plus a
  `(… relevant)` hours badge counted from the sessions that satisfy every typed
  constraint. The per-name `(n)` session-count badge is deliberately **absent**
  — it was removed as useless (issue 062).
- The teacher detail ranks a teacher's subjects and classes by hours with their
  share percentages; subject counting is case- and whitespace-insensitive so
  `GLSI` and `gl si` add up (issue 053).
- On the classes page the catalogue and the commit gate are
  restricted to leaf classes (issue 047); empty results say so ("No teachers
  match." / "No classes match."), an exact reference to a broader class reports
  `No match for "…"`, and an exact name still wins over longer partial matches
  so picking a row always dismisses the menu.

## Theme system

One button cycles the color presets: 15 named presets — Monochrome first in the
cycle, a fresh visitor landing on the default ISIM Blue — plus a leading
"System" preset when the platform exposes an accent color. The light/dark scheme
follows `prefers-color-scheme` and re-applies live when it changes;
`js/theme.js` derives every Material-3 role from the preset's seed and writes it
as CSS custom properties on `<html>`.

- The button's styled tooltip names the active scheme — `Theme: <name> — click
  to change` — as its accessible label too; the native `title` survives only in
  the static markup as the no-JavaScript fallback (issue 059).
- The applied preset and the exact property maps for *both* schemes are persisted
  in `localStorage`, and an inline script in each page's `<head>` replays them
  before first paint, so a reload starts themed instead of flashing the unthemed
  fallback (issue 066).

## Redaction mode

Opening any page with `?redact=1` swaps every rendered teacher name for a
rectangle filled with the text foreground, sized to the name it replaces and
hidden from assistive technology — lists, tables, detail headings, the selected
name overlay and the search suggestions all redact through the same helper, and
the autocomplete ghost is suppressed so a completion cannot leak a name (issue
061). It exists so the UI can be screenshotted and shared without any name in it;
the screenshots shipped with the project are taken in this mode.

## Offline: the snapshot model

Two network-first service workers (issues 063 + 070 + 072), one per app —
`teachers/sw.js` owns the `teachers/` scope, `classes/sw.js` the `classes/`
scope — each with a "last snapshot" model: the stored copy is a snapshot of
that app, never a cache the app trusts. Cache Storage and IndexedDB are
per-origin, shared between the two workers, so every name is namespaced per
app: the cache families `emplois-teachers-snapshot-*` and
`emplois-classes-snapshot-*` and the status databases `emplois-teachers-status`
and `emplois-classes-status`.

- **Online, the network wins.** Every request is fetched with `cache: 'no-cache'`
  so an HTTP-cache hit can never fake connectivity; the snapshot is only ever
  *built*, wholesale.
- **Offline, the snapshot answers** (navigations ignoring the query string); a
  miss is an honest failure, never fabricated content.
- **Wholesale takes only.** Install precaches each app's 21 URLs all-or-nothing
  (a failing install writes nothing and retries), every network-served navigation
  retakes the whole snapshot, and concurrent takes share one in-flight run.
- **Erase + retake on reconnect** (issue 070): the last online/offline status is
  logged and persisted per app in its own IndexedDB database — outside Cache
  Storage, so teardown can never erase it — and the transition offline → online
  tears down only that app's own cache family and retakes the snapshot from
  scratch (never "delete all": the sibling app shares the origin's Cache
  Storage). Storage errors are best-effort and never wedge the chain; the
  snapshot name carries a version suffix under the family prefix so a semantics
  change forces a clean retake, and activation destroys every non-current cache
  of the own family — plus, in the teachers worker only, the legacy pre-split
  root snapshot `emplois-snapshot-v1` by exact name, which no surviving worker
  would otherwise clean up.
- **The utility pages and the landing are online-only** (issues 072, 073): navigations
  to `/`, `at/`, `all/` and the `classes.html` redirect stub
  match no registration, so no worker ever intercepts them.
- Registration happens once per load with an immediate `update()` byte-diff
  check (`js/register.js`), loaded by the two app pages only — each page
  registers the worker of its own directory, the relative `'sw.js'` resolving
  document-relative. `file://` and other non-http(s) origins are a silent
  no-op. When the worker gets in the way in development, the console escape
  hatch unregisters it and deletes every cache.

Deployment caveat: the GitHub Pages subpath deploy still has an open offline
reload report (issue 067).

## Installable app

Two independently installable apps (issue 072), each linking the manifest of its
own directory: "Emplois — Enseignants" (launcher label "Enseignants") at
`teachers/` and "Emplois — Classes" (launcher label "Classes") at `classes/`,
each a standalone-window app with theme/background colors and a distinct `id`
resolving to its own directory. Neither declares shortcuts: every former
shortcut target (Classes, Time, Matrix) lies outside both `./` scopes (issues
068, 072). The icon set is the official ISIM Mahdia logo — 192, 512 and
maskable 512 PNGs plus the apple-touch icon, also serving as the favicon —
shared by both manifests (issue 069). The root landing, the utility pages and
the `classes.html` redirect stub link no manifest. Chrome's own install
affordance does the rest: there is deliberately no in-page install button and
no `beforeinstallprompt` capture. (A pre-split installed entry is an honest
orphan — its id and manifest URL no longer exist — so the two apps are
installed afresh.)

## Remembering the last class

The classes app (`classes/index.html`) remembers the last selected class across
loads: the committed selection is mirrored under the `emplois-class`
`localStorage` key, and a reload lands on the same detail a fresh selection
produces. An explicit deselect forgets it, so a deliberately cleared page still
boots empty (issue 065).

## Mobile layouts

Below ~700px the two-pane layouts show one pane at a time. The teachers and
classes pages share a three-state navigation — the filterable list, the selected
name overlay, and the detail — driven by the same search box and reachable in
both directions: the list collapses into stacked session cards, the overlay's
chevron opens the list, and the classes page hides the whole-week grid in favour
of per-day cards (issues 046, 056, 057, 058). Coarse pointers get an Enter that
commits the typed query instead of pre-selecting the first suggestion, since
there is no Escape key to back out of it (issue 007).

## Deselect and the back arrow

The search box keeps its two jobs on two controls instead of overloading one
(issue 060). The app's `X` (`#searchClear`) only erases the typed filter — every
state, every viewport — and the engine's native cancel button is suppressed
app-wide so only one X can be on screen; getting back to the list has a dedicated
control per viewport: `#searchDeselect` on desktop, visible while a selection is
up and the filter is empty, whose glyph is a **back arrow** rather than an X
(issue 064), and the selected-name overlay's own `X` (`#overlayClear`) on narrow
screens. Emptying the box from the keyboard still deselects — a deliberate,
pinned divergence from the button, since a keystroke and a press travel
structurally separate funnels. Every deselect runs through one funnel that
preserves the filter text, drops the clock-owned detail view so nothing repaints
over the empty page, and on the classes page forgets the remembered class
(issue 065).

## Empty states

Nothing selected is a state, not a blank pane: both search pages draw a kaomoji
face from the vendored `vendor/kaomoji.js` (CC BY 4.0) above the prompt, and
pressing the empty area swaps in another face that hops in — a reduced-motion
setting swaps it without the hop. The classes page gained the same empty state
when it mirrored the teachers page's chrome (issue 046).
