# AGENTS.md — how work gets done in this repo

## Project

- The raw input is a set of timetable PDFs in `pdfs/`. A parser flattens them into
  a single CSV with columns `professor,day,time,room,subject,field`, where `field`
  carries the class name.
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
    `### <Role> <topic> (YYYY-MM-DD)` entry per role. Never reorder or rewrite
    another role's entries.

## Roles

The main agent coordinates; subagents do the work in parallel.

### Main agent (coordinator)

- **Coordination and instruction** — decide the split and write each subagent's brief.
- **Folding** — keep related tasks in the same subagent. A subagent that already
  holds the context should get its kindred tasks, instead of two subagents racing
  over the same files.
- **Corrections** — fix subagent output using the big picture the subagent cannot see.
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
2. **Maintainer** — read-only, no code changes. Its job is to do the necessary
   research: establish how the relevant code and data actually behave, then decide
   whether the issue is valid and in scope. Appends a
   `### Maintainer triage (YYYY-MM-DD)` entry with a verdict, numbered acceptance
   criteria, and risks/constraints (regressions to guard, invariants to preserve).
   Returns the criteria.
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
