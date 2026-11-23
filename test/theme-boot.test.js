// Tests for the pre-paint theme boot (issue 066) — the ESM port over the
// Svelte app tree. Run with `node --test test/*.test.js`.
//
// The fix has three moving parts, each pinned here:
//   1. an inline <head> replay snippet — now carried ONCE, in app/src/app.html
//      (the single document shell every painted route prerenders through, so
//      the old byte-identical-across-four-pages pin becomes a one-carrier
//      pin), immediately before the stylesheet link — that rewrites the
//      stored per-scheme output maps before first paint, plus the
//      <meta name="color-scheme" content="light dark"> next to the viewport
//      meta that lets the UA paint the right scheme;
//   2. app/src/lib/theme.js persisting those maps under `time-theme` on
//      every applyState, via the single writer varsFor, so the replay and the
//      apply are the same values (double-apply is a no-op). The legacy
//      DOMContentLoaded auto-init is gone — the layout component calls
//      init() after mount, so the boots below call init() explicitly.
//   3. the ONE additive prefers-color-scheme: dark block in app.css that
//      gives first-visit dark visitors (and no-JS visitors) a dark first
//      frame, pinned against the engine so it cannot drift.

import test from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { readSrc } from './helpers.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const APP = path.join(HERE, '..', 'app');

// Issues 072 + 073: four painted pages — the two app pages and the two
// utility views — all prerender through app.html; the root landing is a redirect.
const PAGES = ['app/src/routes/+page.svelte', 'app/src/routes/omni/+page.svelte'];

const APPHTML = readSrc('app', 'src', 'app.html');
const THEME_SRC = readSrc('app', 'src', 'lib', 'theme.js');

// The raw <script>…</script> block of the issue-066 replay snippet.
function replaySnippet(html) {
	const at = html.indexOf('/* Issue 066:');
	assert.ok(at !== -1, 'the replay snippet must exist');
	const open = html.lastIndexOf('<script>', at);
	const close = html.indexOf('</script>', at);
	assert.ok(open !== -1 && close !== -1, 'the snippet must sit in one script block');
	return html.slice(open, close + '</script>'.length);
}

const SNIPPET_JS = replaySnippet(APPHTML)
	.replace(/^<script>\n?/, '')
	.replace(/\n?<\/script>$/, '');

// ---- 1. wiring: one snippet, positioned before the sheet -------------------

test('app.html carries the inline replay snippet immediately before the stylesheet link; the pages carry no theme script of their own', () => {
	const bytes = Buffer.byteLength(replaySnippet(APPHTML), 'utf8');
	assert.ok(bytes >= 900 && bytes <= 1000, 'the snippet stays under ~1 KB inline');
	// exactly one replay block in the shell
	assert.strictEqual(APPHTML.split('/* Issue 066:').length - 1, 1,
		'app.html carries exactly one issue-066 replay snippet');
	const end = APPHTML.indexOf('</script>', APPHTML.indexOf('/* Issue 066:')) + '</script>'.length;
	const link = APPHTML.indexOf('rel="manifest" href="%sveltekit.assets%/manifest.json"');
	assert.ok(link !== -1, 'the manifest link must exist');
	// the snippet sits immediately before the manifest link (only whitespace between)
	const linkTagStart = APPHTML.lastIndexOf('<link', link);
	assert.ok(/^\s*$/.test(APPHTML.slice(end, linkTagStart)),
		'the snippet must sit immediately before the stylesheet link');
	// every painted page prerenders through that shell — none ships its own
	// inline theme script (which would fork the replay)
	PAGES.forEach((p) => {
		const src = readSrc(p);
		assert.strictEqual(src.indexOf('/* Issue 066:'), -1,
			p + ' has no inline replay of its own');
		assert.strictEqual(src.indexOf("localStorage.getItem('time-theme')"), -1,
			p + ' never re-reads the theme store');
	});
});

test('meta color-scheme "light dark" sits right after the viewport meta in app.html', () => {
	const line = '<meta name="color-scheme" content="light dark" />';
	const vp = APPHTML.indexOf('<meta name="viewport"');
	assert.ok(vp !== -1, 'the viewport meta must exist');
	// both metas are self-closing; color-scheme sits on the next line after viewport
	const m = APPHTML.slice(vp).match(
		/<meta name="viewport"[^>]*\/>\n[\t ]*<meta name="color-scheme" content="light dark" \/>/);
	assert.ok(m, 'the color-scheme meta sits on the next line after the viewport meta');
	assert.strictEqual(APPHTML.split(line).length - 1, 1,
		'exactly one color-scheme meta');
});

// ---- 2. the replay logic, executed in a vm with a stubbed DOM --------------

// Sentinel maps for the two schemes — the snippet must pick one whole-map and
// write it verbatim, never merge or transform it.
const LIGHT = { '--md-primary': '#111111', '--md-surface': '#222222', 'color-scheme': 'light' };
const DARK = { '--md-primary': '#333333', '--md-surface': '#444444', 'color-scheme': 'dark' };

function asWrites(map) {
	return Object.keys(map).map((k) => [k, map[k]]);
}

// Run the extracted snippet against a stub environment; return the list of
// setProperty calls (host-realm arrays, safe for deepStrictEqual).
function runReplay(opts) {
	const writes = [];
	const sandbox = {
		document: {
			documentElement: {
				style: { setProperty: (k, v) => { writes.push([k, v]); } }
			}
		},
		localStorage: {
			getItem: () => {
				if (opts.getThrows) throw new Error('storage denied');
				return opts.store === undefined ? null : opts.store;
			}
		}
	};
	sandbox.window = opts.matchMedia === false ? {} : {
		matchMedia: () => ({ matches: !!opts.dark })
	};
	vm.runInNewContext(SNIPPET_JS, sandbox, { filename: 'replay-snippet' });
	return writes;
}

test('the inline replay writes the stored map for the live scheme verbatim (dark, light, no matchMedia = light)', () => {
	const store = JSON.stringify({ preset: 'Ember', vars: { light: LIGHT, dark: DARK } });
	assert.deepStrictEqual(runReplay({ store, dark: true }), asWrites(DARK),
		'dark scheme replays vars.dark');
	assert.deepStrictEqual(runReplay({ store, dark: false }), asWrites(LIGHT),
		'light scheme replays vars.light');
	assert.deepStrictEqual(runReplay({ store, matchMedia: false }), asWrites(LIGHT),
		'no matchMedia support falls back to the light map');
});

test('the inline replay is a silent no-op on first visit, old shape, corrupt JSON, missing live map and denied storage', () => {
	const none = [];
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

// Boot theme.js in a fresh vm against a stub DOM. The legacy auto-init on
// DOMContentLoaded was removed in the port (the layout calls init() after
// mount), so the boot calls init() explicitly — same boot shape as a page.
// theme.js is dependency-free ESM; the exports are folded down deterministically
// (export statement → plain statement) before the vm sees the source.
function themeModuleSource() {
	let src = THEME_SRC
		.replace(/export \{([\s\S]*?)\};/g, '{$1};')
		.replace(/export const /g, 'const ');
	assert.ok(!/^export /m.test(src), 'the transform must fold every export');
	return src +
		'\nmodule.exports = { PRESETS: PRESETS, createTheme: createTheme, init: init, current: current };\n';
}
const THEME_VM_SRC = themeModuleSource();

function bootTheme(seedStorage, dark) {
	const store = {};
	if (seedStorage !== undefined) store['time-theme'] = seedStorage;
	const writes = {};   // documentElement.style.setProperty calls, in order
	const btnAttrs = {}; // attributes written on the #themeCycle stub (issue 059)
	const sandbox = {
		module: { exports: {} },
		console: console,
		localStorage: {
			getItem: (k) => (Object.prototype.hasOwnProperty.call(store, k) ? store[k] : null),
			setItem: (k, v) => { store[k] = String(v); }
		},
		window: {
			matchMedia: () =>
				({ matches: !!dark, addEventListener: () => {}, addListener: () => {} })
		},
		document: {
			documentElement: { style: { setProperty: (k, v) => { writes[k] = v; } } },
			head: { appendChild: () => {} },
			getElementById: (id) => {
				if (id !== 'themeCycle') return null;
				return {
					setAttribute: (k, v) => { btnAttrs[k] = v; },
					removeAttribute: () => {},
					addEventListener: () => {}
				};
			},
			querySelector: () => null,
			querySelectorAll: () => [],
			createElement: () => ({ setAttribute: () => {}, style: {} })
		}
	};
	vm.createContext(sandbox);
	vm.runInContext(THEME_VM_SRC, sandbox, { filename: 'app/src/lib/theme.js' });
	const theme = sandbox.module.exports;
	theme.init(); // the layout component's post-mount call
	return { theme: theme, store: store, writes: writes, btnAttrs: btnAttrs };
}

function kebab(role) {
	return role.replace(/([A-Z])/g, '-$1').toLowerCase();
}

function presetOpts(theme, name, dark) {
	let p = null;
	theme.PRESETS.forEach((x) => {
		if (x.name === name) p = x;
	});
	assert.ok(p, 'preset ' + name + ' exists');
	const opts = { primary: p.primary, dark: !!dark, contrast: 0 };
	if (p.secondary) opts.secondary = p.secondary;
	if (p.tertiary) opts.tertiary = p.tertiary;
	if (p.error) opts.error = p.error;
	if (p.variant) opts.variant = p.variant;
	return opts;
}

test('applyState persists both schemes’ 41-key output maps equal to the engine (Ember + Monochrome variant path)', () => {
	['Ember', 'Monochrome'].forEach((name) => {
		const boot = bootTheme(JSON.stringify({ preset: name }), false); // light scheme
		const saved = JSON.parse(boot.store['time-theme']);
		assert.strictEqual(saved.preset, name, name + ': the preset stays stored');
		['light', 'dark'].forEach((scheme) => {
			const vars = saved.vars && saved.vars[scheme];
			assert.ok(vars && typeof vars === 'object', name + '/' + scheme + ': the map is stored');
			const keys = Object.keys(vars);
			assert.strictEqual(keys.filter((k) => k.indexOf('--md-') === 0).length, 37,
				name + '/' + scheme + ': all 37 --md-* roles');
			assert.strictEqual(keys.filter((k) => k.indexOf('--pal-') === 0).length, 3,
				name + '/' + scheme + ': all 3 --pal-* swatches');
			assert.strictEqual(vars['color-scheme'], scheme,
				name + '/' + scheme + ': color-scheme marks the map');
			assert.strictEqual(keys.length, 41, name + '/' + scheme + ': 37 + 3 + 1 = 41 keys');
			const expected = boot.theme.createTheme(presetOpts(boot.theme, name, scheme === 'dark'));
			Object.keys(expected).forEach((role) => {
				assert.strictEqual(vars['--md-' + kebab(role)], expected[role],
					name + '/' + scheme + ': --md-' + kebab(role) + ' equals the engine output');
			});
		});
		// The applied scheme's map (light — the stubbed system scheme here) was
		// written verbatim on <html>: replay and apply agree key-for-key, so the
		// handoff double-apply is a visual no-op.
		const applied = saved.vars.light;
		Object.keys(applied).forEach((k) => {
			assert.strictEqual(boot.writes[k], applied[k], name + ': apply() wrote ' + k);
		});
		// 059's tooltip contract survives inside applyState.
		assert.strictEqual(boot.btnAttrs['aria-label'], 'Theme: ' + name + ' — click to change',
			name + ': aria-label still feeds the tooltip');
		assert.strictEqual(boot.btnAttrs['data-tip'], boot.btnAttrs['aria-label'],
			name + ': data-tip still feeds the CSS tooltip');
	});
});

test('readState stays backward compatible: the old shape restores and upgrades, the new shape restores intact', () => {
	// Old shape: only the preset. One load, then the maps persist.
	const oldBoot = bootTheme(JSON.stringify({ preset: 'Ember' }), true); // dark scheme
	assert.strictEqual(oldBoot.theme.current.preset, 'Ember',
		'the old shape still resolves the preset');
	const upgraded = JSON.parse(oldBoot.store['time-theme']);
	assert.ok(upgraded.vars && upgraded.vars.light && upgraded.vars.dark,
		'the old shape is upgraded to the new one on the first apply');
	assert.strictEqual(Object.keys(upgraded.vars.light).length, 41, 'upgraded light map is complete');
	const wantDark = oldBoot.theme.createTheme(presetOpts(oldBoot.theme, 'Ember', true));
	assert.strictEqual(oldBoot.writes['--md-primary'], wantDark.primary,
		'the old-shape visitor is applied at the live (dark) scheme');
	assert.strictEqual(oldBoot.writes['color-scheme'], 'dark', 'color-scheme follows the system');

	// New shape: preset + maps. Resolves the preset and re-persists complete maps.
	const newBoot = bootTheme(JSON.stringify({
		preset: 'Monochrome',
		vars: { light: LIGHT, dark: DARK }
	}), false);
	assert.strictEqual(newBoot.theme.current.preset, 'Monochrome',
		'the new shape still resolves the preset');
	const saved = JSON.parse(newBoot.store['time-theme']);
	assert.strictEqual(saved.preset, 'Monochrome');
	assert.strictEqual(Object.keys(saved.vars.light).length, 41, 'the light map is re-persisted intact');
	assert.strictEqual(Object.keys(saved.vars.dark).length, 41, 'the dark map is re-persisted intact');
});

// ---- 4. the CSS dark fallback ----------------------------------------------

test('the app.css dark-fallback block is additive, singular, top-positioned and drift-free against the engine', () => {
	const css = readSrc('app', 'static', 'app.css');
	const marker = '@media (prefers-color-scheme: dark)';
	const start = css.indexOf(marker);
	assert.ok(start !== -1, 'the dark-fallback block must exist');
	assert.strictEqual(css.indexOf(marker, start + 1), -1, 'exactly ONE dark-fallback block');
	// Brace-match the whole block (comments mention braces; lastIndexOf would lie).
	const open = css.indexOf('{', start);
	let depth = 0, end = -1;
	for (let i = open; i < css.length; i++) {
		if (css[i] === '{') depth++;
		else if (css[i] === '}') { depth--; if (depth === 0) { end = i; break; } }
	}
	assert.ok(end !== -1, 'the block closes');
	const block = css.slice(start, end + 1);

	const pairs = {};
	let m;
	const def = /(--md-[a-z-]+):\s*(#[0-9A-Fa-f]{6})\s*;/g;
	while ((m = def.exec(block))) pairs[m[1]] = m[2];
	assert.strictEqual(Object.keys(pairs).length, 22, 'the block defines 22 roles');

	// Purely additive: app.css consumes exactly those 22 via var(--md-…,
	// #fallback) and defines no --md-* anywhere outside this block.
	const consumed = {};
	const use = /var\((--md-[a-z-]+)[,)]/g;
	while ((m = use.exec(css))) consumed[m[1]] = true;
	assert.deepStrictEqual(Object.keys(pairs).sort(), Object.keys(consumed).sort(),
		'the block covers exactly the roles app.css consumes');
	const outside = css.slice(0, start) + css.slice(end + 1);
	assert.ok(!/--md-[a-z-]+\s*:/.test(outside),
		'no --md-* property is defined anywhere else in app.css');

	// Top placement (per the issue-066 decision), after the @import that CSS
	// requires to precede every other at-rule.
	assert.ok(start < css.indexOf('* { box-sizing'), 'the block precedes the first rule');
	assert.ok(start > css.indexOf('@import'), 'the @import stays the first at-rule');

	// Drift pin: every value equals the engine's dark ISIM Blue output.
	const engine = bootTheme(undefined, false).theme;
	const want = engine.createTheme({ primary: '#0b4da2', secondary: '#4b5f7d', tertiary: '#7c5260', dark: true });
	Object.keys(pairs).forEach((prop) => {
		const role = prop.slice('--md-'.length).replace(/-([a-z])/g, (_, c) => c.toUpperCase());
		assert.ok(want[role], prop + ' maps to an engine role');
		assert.strictEqual(pairs[prop].toUpperCase(), String(want[role]).toUpperCase(),
			prop + ' equals createTheme(…, dark:true)');
	});
});
