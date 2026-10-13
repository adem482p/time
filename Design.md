# Design

## Context

The university organizes teaching around **classes**: student populations that
follow a timetable. A class is a node of the hierarchy defined in
[Grouping model](#grouping-model); broader classes cover everything beneath them.
Every week, a class attends a set of **sessions**.

A **session** is one teaching event: a subject, taught by a teacher, in a room, on
a day and time slot. Days are `Lundi`–`Samedi`. Each day is divided into six fixed
slots: `08h15-09h45`, `10h00-11h30`, `11h40-13h10`, `13h20-14h50`, `15h00-16h30`,
`16h45-18h15`. A session may be shared: one teacher may lecture several classes at
once, and one slot may hold two sessions that alternate weekly.

A **subject** is a course (e.g. `Systèmes d'exploitation`). A **teacher** teaches
subjects to classes; the same teacher typically serves many classes across the
hierarchy.

The university publishes the timetables as PDFs. For students they are the only
source of truth, and they are inconvenient: finding where a teacher is on a
Wednesday afternoon means opening the right PDF, the right class, the right page,
and reading a dense grid. The data is public but effectively inaccessible.

## Grouping model

Classes form a strict hierarchy. The levels, from root to leaf:

| # | Level | Values | Required |
|---|-------|--------|----------|
| 1 | **track** | `LBC` `LCE` `LCS` (licences), `MP` (masters) | yes |
| 2 | **year** | `1` `2` `3` (masters: `1` `2`) | yes |
| 3 | **specialization** | a subfield (`BI` `EB` `GLSI` `IoT` `IRS` `SD` `EXR`), or a common branch (`LBC1` `LCE1` `LCS1`) | yes |
| 4 | **section** | `A`–`H` | no |
| 5 | **cohort** | `Groupe 1` `Groupe 2` | no |

- **Track** is the degree family, written as a tag.
- **Year** is the year of study within the track.
- **Specialization** is the only level that is never omitted. It is either an
  explicit subfield, or — for a year taught as a single common branch — the
  track+year itself (`LBC1`, `LCE1`, `LCS1`). A track+year that is not a common
  branch is an interior node with no timetable of its own: `LCS2` is not
  scheduled, `GLSI2` is.
- **Section** is a lettered division (`A`–`H`) scoped to one specialization. A
  section letter means nothing outside its specialization: `LCE2-IoT_A` and
  `LCE2-IRS_A` are unrelated classes despite both ending in `_A`.
- **Cohort** is the `Groupe 1` / `Groupe 2` division, scoped to one section. (The
  source prints *Groupe* for this level; a cohort is not a section.)

A **fully specified class** is one that has descended to the deepest level that
exists for its specialization. It owns exactly one timetable, and is the unit the
services list, search and link. A level a class does not have is simply absent.

Worked examples:

| Source string | track | year | specialization | section | cohort |
|---|---|---|---|---|---|
| `LBC1-A Groupe 1` | LBC | 1 | LBC1 | A | 1 |
| `LBC2-BI_E Groupe 2` | LBC | 2 | BI | E | 2 |
| `LBC3-EB_A` | LBC | 3 | EB | A | — |
| `LCE3-IRS_A Groupe 1` | LCE | 3 | IRS | A | 1 |
| `LCS2-GLSI_C Groupe 2` | LCS | 2 | GLSI | C | 2 |
| `MP1-SD` | MP | 1 | SD | — | — |
| `MP2-SD_A` | MP | 2 | SD | A | — |

The catalogue currently published, summarized (always read from the data, never
assumed):

| track | year 1 | year 2 | year 3 |
|---|---|---|---|
| `LBC` | common branch | `BI` | `BI`, `EB` |
| `LCE` | common branch | `IoT`, `IRS` | `IoT`, `IRS` |
| `LCS` | common branch | `GLSI` | `GLSI` |
| `MP` | `SD`, `EXR` | `SD`, `EXR` | — |

Masters are a track like any other. `MP` has no common branch, its specializations
are never divided into cohorts, and only some of them are divided into sections
(`MP2-SD_A`, but `MP1-SD`). Section sets vary and are read from the data: some
specializations have a single section, others reach `H`.

**Names.** The full name writes the levels in order, exactly as the source prints
them, dropping the levels a class does not have: `LCS2-GLSI_A Groupe 1`,
`LBC3-EB_A`, `MP1-SD`. The compact name is
`<specialization><year><section><cohort>` — `GLSI3D1`, `LCS1A2`, `BI2E1`, `SD2A`,
`EB3A` — where the specialization slot holds the subfield or, for a common branch,
the track tag. Track-first and specialization-first spellings are aliases:
`LCS-3-GLSI` ≡ `GLSI3`.

**Resolution.** Any prefix of a fully specified class is itself a valid class and
denotes everything beneath it: `GLSI3` covers every year-3 GLSI section and
cohort; `LCS1-A` covers both cohorts of section `A`. Resolution runs against the
set of known specializations, not merely the ones that appear in the timetables on
hand: a reference is ambiguous when that set names more than one candidate. Bare
`GLSI` is ambiguous because it spans years 2 and 3. `LCS2` is unambiguous today
because CS year 2 names a single specialization, and becomes ambiguous the moment
it names several. A reference whose candidate set is empty is invalid and reported,
never silently mapped: `GLSI1`, `EB2` and unknown subfields are all invalid.

A reference does not carry a semester. The semester is a property of time, not of
a class: semester 1 runs 14/09–10/01, and the rest of the academic year is
semester 2. An underspecified reference such as `LCS1` is read as the current
semester.

## Purpose and pipeline

The project opens the PDFs through three stages:

1. **Timetable PDFs** — the raw input, one file per track and year (the master
   specializations are published as separate files), as distributed to students.
2. **Single CSV** — the parser (`parse_timetables.py`) flattens all PDFs into one
   `emplois.csv` with columns `professor,day,time,room,subject,field`, where
   `field` carries the class name. This file is the single source of truth; every
   page reads it and nothing else.
3. **Web pages** — static pages that load the CSV and provide services on top of it
   (below). No backend, no build step: re-running the parser updates the site.

The purpose is not to add information but to remove friction: the same data,
queryable.

## PDF structure

A PDF is a sequence of classes. A class that is divided into cohorts contributes
three pages: a combined page naming the class (e.g. `LCS1-A - Semestre 1`), then a
`Groupe 1` page and a `Groupe 2` page that print only the cohort label and inherit
the class from the preceding page. A class without cohorts contributes a single
page naming it (`LBC3-EB_A`, `MP1-SD`).

Every page is a fixed grid: six time-slot columns crossed with six day rows. A
cell holds one or more sessions. A session line opens with its kind — `C_`
(lecture), `TD_` (tutorial), `TP_` (lab) — prefixed to the subject, followed on
later lines by the teacher's name and the room. A session may carry the semester
tag `S1`; when a slot alternates weekly, its two alternatives carry the week tags
`SA` and `SB`. Text may spill across column boundaries, and a cell may stack two
sessions.

## Service: Matrix

The full timetable matrix: teachers crossed with the six time slots of the week.
Each cell where a teacher is engaged shows where they can be found — the room,
plus the day and subject of the session. It answers "when and where is this
teacher teaching?" at a glance, and can be filtered by day or teacher.

## Service: Teachers

A view with teachers as the main object. The teacher list is searchable and
filterable live; teachers available today are raised to the top. Selecting a
teacher reveals their week: sessions grouped by day, the current and next session
highlighted, and days with no live stake dimmed. A generated summary states, in
one sentence, what the teacher is doing right now and when their next class is.
The same view adapts to narrow screens: the list and the session table collapse
into stacked cards.

## Service: Time

A view with time slots as the main object. The week is grouped by day; today's
section is marked and scrolled into view, with the current and next slots
highlighted. Selecting a slot lists the teachers teaching then, where each can be
found, and which classes they teach. It answers "who is teaching right now, and
where?"

## Service: Classes
A view with classes as the main object — the student-facing counterpart to the
teacher and time views. The class is chosen through a live search over the
grouping hierarchy: any named class is selectable, whether fully specified or an
interior prefix, and a broader class shows the union of every timetable beneath
it, each line labelled with the class it comes from. Selecting a class draws its
week as a grid with the days as columns and the six slots as rows; each cell lists
the sessions held then, every line giving the subject, the teacher and the room. A
semi-transparent red cursor crosses the grid at the current time, its arrowhead
resting in a small gutter beside the time column, and the current and next slots
are highlighted — the next only while it is still today, with nothing marked at
all on Sunday, before the day begins, or once it has ended. It answers "what does
this class have right now, and where?"
