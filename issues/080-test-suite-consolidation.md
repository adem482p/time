# 080: Consolidate test suite helpers and canonical CSV path

Status: Open
Date: 2026-11-01
Reporter: coordinator

## Description

The test suite (`test/*.test.js`, 13 files, 192 tests) has significant duplicated plumbing and reads the CSV from two different paths:
- **Duplicated helpers**: `readSrc` defined 7 times, `toRoot`/`isRelative` twice, `linkHrefs`/`pngIhdr`/`countTok` twice, the `APPS` descriptor array twice, CSS `rule()` reader twice
- **Two CSV paths**: `classes`, `teacher-daygroups`, `time-live` read `app/static/emplois.csv`; `fusion`, `libgroups`, `redact`, `teacher-subjects` read root `emplois.csv` — same bytes only because `sync-static.mjs` copies

## Root cause

Helpers were copied per-file when tests were ported (issue 054). The CSV path split happened when `sync-static.mjs` was added but test files were never unified.

## Repro steps

```bash
# From repo root
grep -n "function readSrc" test/*.test.js        # 7 definitions
grep -n "CSV_PATH.*emplois" test/*.test.js       # 2 different roots
```

## Discussion

### Maintainer triage (2026-11-01)

Create `test/helpers.js` exporting: `readSrc`, `toRoot`, `isRelative`, `linkHrefs`, `pngIhdr`, `APPS`, `rule`. Update all 13 test files to import from it. Unify `CSV_PATH` to root `emplois.csv` via the helper. No assertion changes — byte-identical plumbing only.

Acceptance criteria:
1. `node --test test/*.test.js` → 192 pass / 0 fail (same totals)
2. No `readSrc`/`CSV_PATH` definitions remain in individual test files
3. All tests import from `test/helpers.js`