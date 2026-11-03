// Tests for deliberately-removed surface (issue 055) — run with `node --test test/`.
//
// The committed exact-query machinery (lib/match.js) and the shared-boot
// match index (the legacy app.js) had zero callers when they were deleted;
// these source-level pins keep them from creeping back unnoticed. Later
// removals join the same file: the dead #themeName label path (issue 059)
// and the classes page's nav bar + autocomplete (issue 075) — each gone on
// purpose, each pinned so it cannot silently return.

import test from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { readSrc, ROOT } from './helpers.js';

test('match.js stays deleted and the search modules stay prefix-free (issue 085)', function () {
  assert.strictEqual(fs.existsSync(path.join(ROOT, 'app/src/lib/match.js')), false,
    'app/src/lib/match.js must stay deleted');
  // the deletion must not re-import the removed machinery through the
  // search modules either: no committed-exact-query surface returns
  ['app/src/lib/search.js', 'app/src/lib/search-classes.js', 'app/src/lib/search-teachers.js']
    .forEach(function (rel) {
      var src = readSrc(rel);
      ['parseExactQuery', 'exactQuery', 'completionContext', 'resolveClass',
       'aliasToCanonical', 'legacyKey'].forEach(function (tok) {
        assert.ok(src.indexOf(tok) === -1, tok + ' must stay out of ' + rel);
      });
    });
});

test('the utility pages never build a match index', function () {
  // at/ and all/ are the utility views; they don't use match.classSearch
  var atSrc = readSrc('app/src/routes/at/+page.svelte');
  var allSrc = readSrc('app/src/routes/all/+page.svelte');
  assert.ok(atSrc.indexOf('buildIndex') === -1, 'buildIndex must stay out of at/+page.svelte');
  assert.ok(allSrc.indexOf('buildIndex') === -1, 'buildIndex must stay out of all/+page.svelte');
});

test('the dead #themeName label path stays removed (issue 059)', function () {
  var src = readSrc('app/src/lib/theme.js');
  assert.ok(src.indexOf('themeName') === -1, 'themeName must stay removed');
  assert.ok(src.indexOf('labelEl') === -1, 'labelEl must stay removed');
});

test('the classes page navigation stays removed (issue 075)', function () {
  var html = readSrc('app/src/routes/classes/+page.svelte');
  assert.ok(html.indexOf('<nav') === -1, 'the classes nav bar must stay removed');
  assert.ok(html.indexOf('href="../teachers/"') === -1,
    'the classes page must stay linked-out-free (dead-end by the reporter\'s call)');
  assert.ok(html.indexOf('href="index.html"') === -1, 'no self nav link either');
});

test('the classes page autocomplete stays removed (issue 075)', function () {
  var html = readSrc('app/src/routes/classes/+page.svelte');
  assert.ok(html.indexOf('id="suggest"') === -1, '#suggest must stay removed');
  assert.ok(html.indexOf('id="ghost"') === -1, 'the ghost completion line must stay removed');
  var src = html; // the component script is in the same file
  ['renderSuggest', 'renderGhost', 'acceptSuggest', 'suggestIdx', 'suggestRows',
   'isCoarsePointer', 'match.suggest'].forEach(function (tok) {
    assert.ok(src.indexOf(tok) === -1, tok + ' must stay removed from classes/+page.svelte');
  });
  // the teachers page is the other side of the same line: its autocomplete
  // must survive (the shared machinery lives there now)
  var tsrc = readSrc('app/src/routes/teachers/+page.svelte');
  assert.ok(tsrc.indexOf('function renderSuggest') !== -1,
    'the teachers autocomplete must stay');
});