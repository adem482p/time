# Handover: Investigate "machi" Search Highlighting Regression

## Problem
After the structural cleanup (separation of concerns: data.js → search.js → display.js), typing "machi" in the teachers page search shows "Marrakchi" in results but **no highlighting** on "Ma" and "chi".

## Expected Behavior
- Search "machi" → "Marrakchi" appears with `<mark>Ma</mark>rrak<mark>chi</mark>` highlighting
- Machine learning teachers (El ahmer, Hamdani, etc.) still highlight correctly

## What Was Changed
- `display.js` now exports `teacherName(name, rangesOrAlt)` and `highlightHTML(s, ranges)` — single source of truth for name rendering
- `search.js` stripped to pure matching logic (no display functions)
- All pages/components updated to import from `display.js`
- All 192 tests pass, build succeeds

## How to Reproduce
```bash
cd /home/user/.local/share/opencode/worktree/1de5bb/svelte/app
npm run build
cd build
python3 -m http.server 8080
# Open http://localhost:8080/teachers/ in browser
# Type "machi" in search box
# Observe: Marrakchi appears but NO <mark> tags in teacher name
```

## Debug Checklist for Next Agent

### 1. Verify the Search Logic Still Produces Ranges
```bash
cd /home/user/.local/share/opencode/worktree/1de5bb/svelte
node -e "
import fs from 'node:fs';
import * as data from './app/src/lib/data.js';
import * as model from './app/src/lib/model.js';
import * as searchTeachers from './app/src/lib/search-teachers.js';

const store = data.createStore(fs.readFileSync('./app/static/emplois.csv', 'utf8'));
const modelObjs = model.buildAll(store);
const index = searchTeachers.buildTeacherIndex(store, modelObjs.groups);
const results = searchTeachers.searchTeachers(index, 'machi', null);
const m = results.find(r => r.teacher === 'Marrakchi');
console.log('nameRanges:', m.nameRanges);  // Should be [[0,2], [6,9]]
"
```

### 2. Check Built Output for `teacherName` Usage
```bash
grep -n "teacherName" /home/user/.local/share/opencode/worktree/1de5bb/svelte/app/build/_app/immutable/entry/app.*.js | head -20
```

### 3. Inspect Live DOM with Playwright
```javascript
// Navigate to http://localhost:8080/teachers/
// Fill #search with "machi"
// Check #teacherList li[data-name="Marrakchi"] innerHTML for <mark> tags
// Check #suggest li innerHTML for <mark> tags
```

### 4. Key Files to Inspect
- `app/src/routes/teachers/+page.svelte` — `rowHTML()` and `rowBodyHTML()` use `teacherName(r.teacher, r.nameRanges)`
- `app/src/lib/display.js` — `teacherName()` and `highlightHTML()` implementations
- `app/src/lib/search-teachers.js` — `searchTeachers()` produces `nameRanges`

### 5. Common Regression Patterns
- **Import mismatch**: Page imports `teacherName` but calls `nameHTML` (or vice versa)
- **Parameter order**: `teacherName(name, ranges)` vs old `nameHTML(name, alt)`
- **Build caching**: Old bundle served — verify `npm run build` timestamp
- **Module resolution**: `display.js` not bundled correctly — check `app/build/_app/immutable/chunks/`

## Quick Test Commands
```bash
# Verify search logic produces ranges
node -e "import * as s from './app/src/lib/search.js'; console.log(s.fuzzyRanges('Marrakchi', 'machi'))"

# Verify display logic produces marks
node -e "import * as d from './app/src/lib/display.js'; console.log(d.teacherName('Marrakchi', [[0,2],[6,9]]))"

# Check built JS for teacherName
grep -c "teacherName" /home/user/.local/share/opencode/worktree/1de5bb/svelte/app/build/_app/immutable/entry/app.*.js
```

## Files Modified in Cleanup (for context)
- `app/src/lib/display.js` — NEW: `teacherName()`, `highlightHTML()`
- `app/src/lib/search.js` — REMOVED: `highlightHTML`, `nameHTML`
- `app/src/lib/match.js` — RE-EXPORTS from display.js
- `app/src/routes/teachers/+page.svelte` — USES `teacherName`
- `app/src/routes/classes/+page.svelte` — USES `highlightHTML`
- `app/src/routes/at/+page.svelte` — USES `teacherName`
- `app/src/routes/all/+page.svelte` — USES `teacherName`
- `app/src/lib/components/DayGroupCards.svelte` — USES `teacherName`
- `app/src/lib/components/WeekGrid.svelte` — USES `teacherName`
- `test/redact.test.js`, `test/classes.test.js` — UPDATED

## Success Criteria
- [ ] "machi" search highlights "Ma" and "chi" in Marrakchi
- [ ] Machine learning teachers still highlight correctly
- [ ] Redaction mode (`?redact=1`) still works
- [ ] All 192 tests pass