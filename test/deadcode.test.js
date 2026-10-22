// Tests for deliberately-removed surface (issue 055) — run with `node --test test/`.
//
// The committed exact-query machinery (js/match.js) and the shared-boot
// match index (js/app.js) had zero callers when they were deleted; these
// source-level pins keep them from creeping back unnoticed. Later removals
// join the same file: the dead #themeName label path (issue 059) and the
// classes page's nav bar + autocomplete (issue 075) — each gone on purpose,
// each pinned so it cannot silently return.

'use strict';

var test = require('node:test');
var assert = require('node:assert');
var fs = require('node:fs');
var path = require('node:path');

var ROOT = path.join(__dirname, '..');

function readSrc(rel) {
  return fs.readFileSync(path.join(ROOT, rel), 'utf8');
}

test('the committed exact-query machinery stays removed', function () {
  var src = readSrc('js/match.js');
  assert.ok(src.indexOf('parseExactQuery') === -1, 'parseExactQuery must stay removed');
  assert.ok(src.indexOf('exactQuery') === -1, 'exactQuery must stay removed');
});

test('the time/matrix pages never build a match index', function () {
  assert.ok(readSrc('js/app.js').indexOf('buildIndex') === -1,
    'buildIndex must stay out of app.js');
});

test('the dead #themeName label path stays removed (issue 059)', function () {
  var src = readSrc('js/theme.js');
  assert.ok(src.indexOf('themeName') === -1, 'themeName must stay removed');
  assert.ok(src.indexOf('labelEl') === -1, 'labelEl must stay removed');
});

test('the classes page navigation stays removed (issue 075)', function () {
  var html = readSrc('classes/index.html');
  assert.ok(html.indexOf('<nav') === -1, 'the classes nav bar must stay removed');
  assert.ok(html.indexOf('href="../teachers/"') === -1,
    'the classes page must stay linked-out-free (dead-end by the reporter\'s call)');
  assert.ok(html.indexOf('href="index.html"') === -1, 'no self nav link either');
});

test('the classes page autocomplete stays removed (issue 075)', function () {
  var html = readSrc('classes/index.html');
  assert.ok(html.indexOf('id="suggest"') === -1, '#suggest must stay removed');
  assert.ok(html.indexOf('id="ghost"') === -1, 'the ghost completion line must stay removed');
  var src = readSrc('js/classes.js');
  ['renderSuggest', 'renderGhost', 'acceptSuggest', 'suggestIdx', 'suggestRows',
   'isCoarsePointer', 'match.suggest'].forEach(function (tok) {
    assert.ok(src.indexOf(tok) === -1, tok + ' must stay removed from js/classes.js');
  });
  // the teachers page is the other side of the same line: its autocomplete
  // must survive (the shared machinery lives there now)
  assert.ok(readSrc('js/teachers.js').indexOf('function renderSuggest') !== -1,
    'the teachers autocomplete must stay');
});
