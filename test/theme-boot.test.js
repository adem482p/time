// Tests for the pre-paint theme boot (issue 066) — run with the other suites:
// `node --test test/theme-boot.test.js` … or the count form
// `node --test "test/*.test.js"` (the directory form `node --test test/` still
// fails; files stay listed).
//
// The fix has three moving parts, each pinned here:
//   1. an inline <head> replay snippet — byte-identical on all five pages
//      (the landing and the four views), immediately before the stylesheet
//      link — that rewrites the stored
//      per-scheme output maps before first paint, plus the
//      <meta name="color-scheme" content="light dark"> next to the viewport
//      meta that lets the UA paint the right scheme;
//   2. js/theme.js persisting those maps under `emplois-theme` on every
//      applyState, via the single writer varsFor, so the replay and the
//      DOMContentLoaded apply are the same values (double-apply is a no-op);
//   3. the ONE additive prefers-color-scheme: dark block in styles.css that
//      gives first-visit dark visitors (and no-JS visitors) a dark first
//      frame, pinned against the engine so it cannot drift.

'use strict';

var test = require('node:test');
var assert = require('node:assert');
var fs = require('node:fs');
var path = require('node:path');
var vm = require('node:vm');

var ROOT = path.join(__dirname, '..');
// Issue 072: five pages carry the snippet — the root landing, the two app
// pages (whose stylesheet link is ../-relative) and the two utility views.
var PAGES = [
  { page: 'index.html', sheet: '<link rel="stylesheet" href="styles.css">' },
  { page: 'teachers/index.html', sheet: '<link rel="stylesheet" href="../styles.css">' },
  { page: 'classes/index.html', sheet: '<link rel="stylesheet" href="../styles.css">' },
  { page: 'time.html', sheet: '<link rel="stylesheet" href="styles.css">' },
  { page: 'timetable.html', sheet: '<link rel="stylesheet" href="styles.css">' }
];

function readSrc(rel) {
  return fs.readFileSync(path.join(ROOT, rel), 'utf8');
}

// The raw <script>…</script> block of the issue-066 replay snippet in a page.
function replaySnippet(html) {
  var at = html.indexOf('/* Issue 066:');
  assert.ok(at !== -1, 'the replay snippet must exist');
  var open = html.lastIndexOf('<script>', at);
  var close = html.indexOf('</script>', at);
  assert.ok(open !== -1 && close !== -1, 'the snippet must sit in one script block');
  return html.slice(open, close + '</script>'.length);
}

var SNIPPET_JS = replaySnippet(readSrc(PAGES[0].page))
  .replace(/^<script>\n?/, '')
  .replace(/\n?<\/script>$/, '');

// ---- 1. HTML wiring: byte-identical snippet, positioned before the sheet ---

test('the inline replay snippet is byte-identical on all five pages, immediately before the stylesheet link', function () {
  var first = replaySnippet(readSrc(PAGES[0].page));
  assert.ok(Buffer.byteLength(first, 'utf8') >= 900 && Buffer.byteLength(first, 'utf8') <= 1000,
    'the snippet stays under ~1 KB inline');
  PAGES.forEach(function (entry) {
    var html = readSrc(entry.page);
    var snip = replaySnippet(html);
    assert.strictEqual(snip, first, entry.page + ': the snippet must be byte-identical to ' + PAGES[0].page);
    var end = html.indexOf('</script>', html.indexOf('/* Issue 066:')) + '</script>'.length;
    var link = html.indexOf(entry.sheet);
    assert.ok(link !== -1, entry.page + ': the stylesheet link must exist');
    assert.ok(html.slice(end, link).trim() === '',
      entry.page + ': the snippet must sit immediately before the stylesheet link');
  });
});

test('meta color-scheme "light dark" sits right after the viewport meta on all five pages', function () {
  var line = '<meta name="color-scheme" content="light dark">';
  PAGES.forEach(function (entry) {
    var html = readSrc(entry.page);
    var vp = html.indexOf('<meta name="viewport"');
    assert.ok(vp !== -1, entry.page + ': the viewport meta must exist');
    var after = html.indexOf('>', vp) + 1;
    assert.strictEqual(html.slice(after + 1, after + 1 + line.length), line,
      entry.page + ': the color-scheme meta sits on the next line after the viewport meta');
  });
});

// ---- 2. the replay logic, executed in a vm with a stubbed DOM --------------

// Sentinel maps for the two schemes — the snippet must pick one whole-map and
// write it verbatim, never merge or transform it.
var LIGHT = { '--md-primary': '#111111', '--md-surface': '#222222', 'color-scheme': 'light' };
var DARK = { '--md-primary': '#333333', '--md-surface': '#444444', 'color-scheme': 'dark' };

function asWrites(map) {
  return Object.keys(map).map(function (k) { return [k, map[k]]; });
}

// Run the extracted snippet against a stub environment; return the list of
// setProperty calls (host-realm arrays, safe for deepStrictEqual).
function runReplay(opts) {
  var writes = [];
  var sandbox = {
    document: {
      documentElement: {
        style: { setProperty: function (k, v) { writes.push([k, v]); } }
      }
    },
    localStorage: {
      getItem: function () {
        if (opts.getThrows) throw new Error('storage denied');
        return opts.store === undefined ? null : opts.store;
      }
    }
  };
  sandbox.window = opts.matchMedia === false ? {} : {
    matchMedia: function () { return { matches: !!opts.dark }; }
  };
  vm.runInNewContext(SNIPPET_JS, sandbox, { filename: 'replay-snippet' });
  return writes;
}

test('the inline replay writes the stored map for the live scheme verbatim (dark, light, no matchMedia = light)', function () {
  var store = JSON.stringify({ preset: 'Ember', vars: { light: LIGHT, dark: DARK } });
  assert.deepStrictEqual(runReplay({ store: store, dark: true }), asWrites(DARK),
    'dark scheme replays vars.dark');
  assert.deepStrictEqual(runReplay({ store: store, dark: false }), asWrites(LIGHT),
    'light scheme replays vars.light');
  assert.deepStrictEqual(runReplay({ store: store, matchMedia: false }), asWrites(LIGHT),
    'no matchMedia support falls back to the light map');
});

test('the inline replay is a silent no-op on first visit, old shape, corrupt JSON, missing live map and denied storage', function () {
  var none = [];
  assert.deepStrictEqual(runReplay({ store: null }), none, 'first visit: no storage');
  assert.deepStrictEqual(runReplay({ store: 'null' }), none, 'storage holding literal null');
  assert.deepStrictEqual(runReplay({ store: JSON.stringify({ preset: 'Ember' }) }), none,
    'old shape without vars');
  assert.deepStrictEqual(runReplay({ store: '{"preset":' }), none, 'corrupt JSON');
  assert.deepStrictEqual(runReplay({ store: JSON.stringify({ preset: 'Ember', vars: {} }) }),
    none, 'vars present but no map for any scheme');
  assert.deepStrictEqual(runReplay({ store: JSON.stringify({ preset: 'Ember', vars: { light: LIGHT } }), dark: true }),
    none, 'dark scheme requested but only the light map exists');
  assert.deepStrictEqual(runReplay({ store: null, getThrows: true }), none,
    'a throwing localStorage is swallowed');
});

// ---- 3. theme.js persistence, exercised through a real init() --------------

// Boot js/theme.js in a fresh vm against a stub DOM, exactly like a page load:
// readyState is already 'complete', so autoInit runs init() synchronously.
function bootTheme(seedStorage, dark) {
  var store = {};
  if (seedStorage !== undefined) store['emplois-theme'] = seedStorage;
  var writes = {};   // documentElement.style.setProperty calls, in order
  var btnAttrs = {}; // attributes written on the #themeCycle stub (issue 059)
  var sandbox = {
    module: { exports: {} },
    console: console,
    localStorage: {
      getItem: function (k) {
        return Object.prototype.hasOwnProperty.call(store, k) ? store[k] : null;
      },
      setItem: function (k, v) { store[k] = String(v); }
    },
    window: {
      matchMedia: function () {
        return { matches: !!dark, addEventListener: function () {}, addListener: function () {} };
      }
    },
    document: {
      readyState: 'complete',
      documentElement: { style: { setProperty: function (k, v) { writes[k] = v; } } },
      head: { appendChild: function () {} },
      getElementById: function (id) {
        if (id !== 'themeCycle') return null;
        return {
          setAttribute: function (k, v) { btnAttrs[k] = v; },
          removeAttribute: function () {},
          addEventListener: function () {}
        };
      },
      querySelector: function () { return null; },
      querySelectorAll: function () { return []; },
      createElement: function () { return { setAttribute: function () {}, style: {} }; }
    }
  };
  vm.createContext(sandbox);
  vm.runInContext(readSrc('js/theme.js'), sandbox, { filename: 'js/theme.js' });
  return { theme: sandbox.module.exports, store: store, writes: writes, btnAttrs: btnAttrs };
}

function kebab(role) { return role.replace(/([A-Z])/g, '-$1').toLowerCase(); }

function presetOpts(theme, name, dark) {
  var p = null;
  theme.PRESETS.forEach(function (x) { if (x.name === name) p = x; });
  assert.ok(p, 'preset ' + name + ' exists');
  var opts = { primary: p.primary, dark: !!dark, contrast: 0 };
  if (p.secondary) opts.secondary = p.secondary;
  if (p.tertiary) opts.tertiary = p.tertiary;
  if (p.error) opts.error = p.error;
  if (p.variant) opts.variant = p.variant;
  return opts;
}

test('applyState persists both schemes’ 41-key output maps equal to the engine (Ember + Monochrome variant path)', function () {
  ['Ember', 'Monochrome'].forEach(function (name) {
    var boot = bootTheme(JSON.stringify({ preset: name }), false); // light scheme
    var saved = JSON.parse(boot.store['emplois-theme']);
    assert.strictEqual(saved.preset, name, name + ': the preset stays stored');
    ['light', 'dark'].forEach(function (scheme) {
      var vars = saved.vars && saved.vars[scheme];
      assert.ok(vars && typeof vars === 'object', name + '/' + scheme + ': the map is stored');
      var keys = Object.keys(vars);
      assert.strictEqual(keys.filter(function (k) { return k.indexOf('--md-') === 0; }).length, 37,
        name + '/' + scheme + ': all 37 --md-* roles');
      assert.strictEqual(keys.filter(function (k) { return k.indexOf('--pal-') === 0; }).length, 3,
        name + '/' + scheme + ': all 3 --pal-* swatches');
      assert.strictEqual(vars['color-scheme'], scheme,
        name + '/' + scheme + ': color-scheme marks the map');
      assert.strictEqual(keys.length, 41, name + '/' + scheme + ': 37 + 3 + 1 = 41 keys');
      var expected = boot.theme.createTheme(presetOpts(boot.theme, name, scheme === 'dark'));
      Object.keys(expected).forEach(function (role) {
        assert.strictEqual(vars['--md-' + kebab(role)], expected[role],
          name + '/' + scheme + ': --md-' + kebab(role) + ' equals the engine output');
      });
    });
    // The applied scheme's map (light — the stubbed system scheme here) was
    // written verbatim on <html>: replay and apply agree key-for-key, so the
    // handoff double-apply is a visual no-op.
    var applied = saved.vars.light;
    Object.keys(applied).forEach(function (k) {
      assert.strictEqual(boot.writes[k], applied[k], name + ': apply() wrote ' + k);
    });
    // 059's tooltip contract survives inside applyState.
    assert.strictEqual(boot.btnAttrs['aria-label'], 'Theme: ' + name + ' — click to change',
      name + ': aria-label still feeds the tooltip');
    assert.strictEqual(boot.btnAttrs['data-tip'], boot.btnAttrs['aria-label'],
      name + ': data-tip still feeds the CSS tooltip');
  });
});

test('readState stays backward compatible: the old shape restores and upgrades, the new shape restores intact', function () {
  // Old shape: only the preset. One transitional load, then the maps appear.
  var oldBoot = bootTheme(JSON.stringify({ preset: 'Ember' }), true); // dark scheme
  assert.strictEqual(oldBoot.theme.current.preset, 'Ember',
    'the old shape still resolves the preset');
  var upgraded = JSON.parse(oldBoot.store['emplois-theme']);
  assert.ok(upgraded.vars && upgraded.vars.light && upgraded.vars.dark,
    'the old shape is upgraded to the new one on the first apply');
  assert.strictEqual(Object.keys(upgraded.vars.light).length, 41, 'upgraded light map is complete');
  var wantDark = oldBoot.theme.createTheme(presetOpts(oldBoot.theme, 'Ember', true));
  assert.strictEqual(oldBoot.writes['--md-primary'], wantDark.primary,
    'the old-shape visitor is applied at the live (dark) scheme');
  assert.strictEqual(oldBoot.writes['color-scheme'], 'dark', 'color-scheme follows the system');

  // New shape: preset + maps. Resolves the preset and re-persists complete maps.
  var newBoot = bootTheme(JSON.stringify({
    preset: 'Monochrome',
    vars: { light: LIGHT, dark: DARK }
  }), false);
  assert.strictEqual(newBoot.theme.current.preset, 'Monochrome',
    'the new shape still resolves the preset');
  var saved = JSON.parse(newBoot.store['emplois-theme']);
  assert.strictEqual(saved.preset, 'Monochrome');
  assert.strictEqual(Object.keys(saved.vars.light).length, 41, 'the light map is re-persisted intact');
  assert.strictEqual(Object.keys(saved.vars.dark).length, 41, 'the dark map is re-persisted intact');
});

// ---- 4. the CSS dark fallback ----------------------------------------------

test('the styles.css dark-fallback block is additive, singular, top-positioned and drift-free against the engine', function () {
  var css = readSrc('styles.css');
  var marker = '@media (prefers-color-scheme: dark)';
  var start = css.indexOf(marker);
  assert.ok(start !== -1, 'the dark-fallback block must exist');
  assert.strictEqual(css.indexOf(marker, start + 1), -1, 'exactly ONE dark-fallback block');
  // Brace-match the whole block (comments mention braces; lastIndexOf would lie).
  var open = css.indexOf('{', start);
  var depth = 0, end = -1;
  for (var i = open; i < css.length; i++) {
    if (css[i] === '{') depth++;
    else if (css[i] === '}') { depth--; if (depth === 0) { end = i; break; } }
  }
  assert.ok(end !== -1, 'the block closes');
  var block = css.slice(start, end + 1);

  var pairs = {}, m;
  var def = /(--md-[a-z-]+):\s*(#[0-9A-Fa-f]{6})\s*;/g;
  while ((m = def.exec(block))) pairs[m[1]] = m[2];
  assert.strictEqual(Object.keys(pairs).length, 22, 'the block defines 22 roles');

  // Purely additive: styles.css consumes exactly those 22 via var(--md-…,
  // #fallback) and defines no --md-* anywhere outside this block.
  var consumed = {}, use = /var\((--md-[a-z-]+)[,)]/g;
  while ((m = use.exec(css))) consumed[m[1]] = true;
  assert.deepStrictEqual(Object.keys(pairs).sort(), Object.keys(consumed).sort(),
    'the block covers exactly the roles styles.css consumes');
  var outside = css.slice(0, start) + css.slice(end + 1);
  assert.ok(!/--md-[a-z-]+\s*:/.test(outside),
    'no --md-* property is defined anywhere else in styles.css');

  // Top placement (per the issue-066 decision), after the @import that CSS
  // requires to precede every other at-rule.
  assert.ok(start < css.indexOf('* { box-sizing'), 'the block precedes the first rule');
  assert.ok(start > css.indexOf('@import'), 'the @import stays the first at-rule');

  // Drift pin: every value equals the engine's dark ISIM Blue output.
  var engine = require('../js/theme.js');
  var want = engine.createTheme({ primary: '#0b4da2', secondary: '#4b5f7d', tertiary: '#7c5260', dark: true });
  Object.keys(pairs).forEach(function (prop) {
    var role = prop.slice('--md-'.length).replace(/-([a-z])/g, function (_, c) { return c.toUpperCase(); });
    assert.ok(want[role], prop + ' maps to an engine role');
    assert.strictEqual(pairs[prop].toUpperCase(), String(want[role]).toUpperCase(),
      prop + ' equals createTheme(…, dark:true)');
  });
});
