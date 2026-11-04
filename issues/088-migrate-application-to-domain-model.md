# 088: Migrate application to the domain-model library

Status: Open
Date: 2026-11-04
Reporter: coordinator

## Description

The project now contains a generic domain-model library in `domain-model/`,
but the application still uses the older modelling implementation in
`app/src/lib/libgroups.js` and `app/src/lib/model.js`.

Migrate the application so that domain concepts and interpretation are
centralized in the new library. Application code should consume typed domain
representations rather than reimplementing parsing, hierarchy, reference
resolution, semesters, week patterns, session semantics, or CSV
interpretation.

## Root cause

The new library was developed alongside the existing application model. The
application has not yet been migrated, leaving duplicate and potentially
divergent implementations.

## Repro steps

```bash
grep -R "libgroups\\|buildGroups\\|parseRef\\|semOf\\|shortcutOf" \
  app/src domain-model
```

Compare the duplicate model responsibilities in:

- `domain-model/index.js`
- `app/src/lib/libgroups.js`
- `app/src/lib/model.js`
- `data/extract.py`

## Discussion
