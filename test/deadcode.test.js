// Tests for deliberately-removed surface (issue 055) — run with `node --test test/`.
//
// The committed exact-query machinery (js/match.js) and the shared-boot
// match index (js/app.js) had zero callers when they were deleted; these
// source-level pins keep them from creeping back unnoticed.

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
