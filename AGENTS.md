# AGENTS.md — how work gets done in this repo

## Project

- The raw input is a set of timetable PDFs in `data/pdfs/`. A parser (`data/extract.py`)
  flattens them into a single CSV with columns
  `professor,day,time,room,subject,field,week,source`, where `field`
  carries the class name, `week` carries the week-alternation marker
  (`SA`/`SB`, empty = every week; `S1` is a semestre label stripped at parse
  time, never a week), `source` identifies the exact PDF page, and `color`
  carries the background fill color of the timetable cell the session was
  parsed from (lowercase `#rrggbb`, empty when no fill contains it).
- That CSV is the single source of truth for the site: every page reads it and
  nothing else. Re-running the parser updates the site; there is no build step and
  no backend.
- Serve over HTTP for local work (`python3 -m http.server`); browsers block `fetch`
  on `file://`.
- Git: commit signing is disabled locally (`commit.gpgsign=false`, `tag.gpgsign=false`).

## Issue tracker (`issues/`)

- One markdown file per issue: `issues/NNN-short-slug.md`.
- File structure:
  - `# NNN: Title`, `Status:` (`Open` → `Fixed` once merged), a date/reporter line.
  - `## Description` (observed vs expected), `## Root cause`, `## Repro steps`
    (commands + URL + clicks).
  - `## Discussion`: append-only, chronological, one
    `### <Role> <topic> (YYYY-MM-DD)` entry per contribution. A role may appear
    several times (a loop of requests and re-evaluations produces several
    maintainer entries). Never reorder or rewrite another role's entries.

## Roles

The main agent coordinates; subagents do the work in parallel.

### Main agent (coordinator)

- **Coordination and instruction** — decide the split and write each subagent's brief.
- **Folding** — keep related tasks in the same subagent. A subagent that already
  holds the context should get its kindred tasks, instead of two subagents racing
  over the same files.
- **Corrections** — fix subagent output using the big picture the subagent cannot see.
- **Running the request loop** — when a maintainer entry ends with requests,
  spawn one agent per request (folding kindred requests into one agent), have
  each append its findings to the issue thread, then re-spawn the maintainer to
  re-evaluate — repeat until it declares a final decision — and only then hand
  the criteria to an Implementer.
- **Merging** — once a subagent finishes implementation, review its diff and merge it.
- Git is the main agent's alone: worktrees, commits and merges happen here.

### Subagents

- **Do not use git.** No commits, branches, worktrees, checkout, or history
  rewriting — the main agent owns all version-control operations.
- Work only inside the worktree the main agent assigns, using absolute paths.
- The main agent runs several subagents at the same time, each in its own worktree,
  so concurrent work cannot collide.

### The three roles

1. **Reporter** — read-only, no code changes. Confirms the bug against the code and
   data, writes the issue file (`Description`, `Root cause`, `Repro steps`, empty
   `Discussion`). Returns the root cause and what it did not do.
2. **Maintainer** — the steward of the issue, and of the codebase it lands in.
   Its main job is **not** triage: it is to figure out the *best way to handle
   the issue*, taking into account the maintainability of the project, future
   development, and design decisions (existing conventions, the shape of the
   code, how this change will be read and extended later). It researches the
   relevant code and data as needed — read-only — then decides whether the issue
   is valid, in scope, and, above all, *how* to solve it.

   The maintainer is willing to revise the architecture and change things at a
   deeper level when that is the right answer, instead of piling up state and
   behaviour to work around issues. A fix that adds a special case may be
   rejected in favour of one that removes the need for it.

   Each round, it appends a `### Maintainer decision (YYYY-MM-DD)` entry (topic
   may be `triage`, `re-evaluation`, etc.) with its verdict/decision, the
   reasoning (including any architectural direction), numbered acceptance
   criteria when it is ready for implementation, and risks/constraints
   (regressions to guard, invariants to preserve).

   **Requests**: a maintainer entry may end with requests — things it wants
   researched, verified, designed, or prototyped before it can decide, or to
   inform a deeper rework. The main agent spawns one agent per request (in its
   own worktree if code is involved); each such agent appends its own entry to
   the issue's `## Discussion` and returns its findings to the main agent. The
   main agent then re-spawns the maintainer, which reads the whole thread,
   re-evaluates, and either issues further requests or settles on a final
   decision. This loops until the maintainer declares a final decision; only
   then does the Implementer act. The maintainer never edits code itself.
3. **Implementer** — the minimal diff that honors the criteria. Verifies in place
   (node assertions + `curl` 200 from the dev server; no browser available),
   appends a `### Fix implemented (YYYY-MM-DD)` entry with the exact diff and
   results. Does not commit — the main agent merges.

## Verification standards

- Data/logic changes: exercise the real logic in `node` against the real CSV (row
  counts, grouping, search queries, date-boundary cases with a stubbed clock).
- Page changes: re-serve and `curl` for 200; assert template/CSS structure by
  parsing the HTML in node with DOM stubs where needed.
- Before merging, the diff must contain only the intended files.
