// Tests for the page chrome the user pinned in issue 076 — the ESM port over
// the Svelte app tree. Run with `node --test test/*.test.js`.
//
// Port mapping (issue-076 pins kept verbatim where the surface survived):
//   - every CSS pin now reads app/static/app.css — the verbatim copy of the
//     old styles.css, still the single visual definition of the vocabulary;
//   - every markup pin now reads the four +page.svelte components: the two
//     app pages (teachers/, classes/) and the two online-only utility views
//     (at/, all/). All legacy ids survive (#searchWrap, #status, #suggest,
//     #teacherList, #classList, …) because the components keep the legacy id
//     vocabulary on purpose (their own header comments say so).
//   - the old `js/*.js` writer pins collapse onto the component script
//     sections: #status is rendered (never re-parented) by markup.
//
// Issue 076: (1) ONE unified h1 rule — `h1 { font-size: 17pt }`; (2) the
// `.author-credit` at `margin: 2px 0 20pt` with the author NAME (the link) at
// 1.3em (issue 078 reverted the 14pt — Tiny5 blurs off its 5px grid — the 076
// margins stand); (3) on the two filter pages the count line `#status` sits
// UNDER the filter box (`#searchWrap`) and ABOVE the results list, in normal
// flow so it scrolls away with the page — while the utility views at/ and all/
// keep `#status` under their title (no filter box there). The count line's
// text and its writers are untouched: a position change, never a behaviour
// change. The image 078 sticky day heads, the folding count line, the class
// facts <dl> and the issue-079 narrow-facts layout are pinned after.

import test from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const APP = path.join(HERE, '..', 'app');

function readSrc(rel) {
	return fs.readFileSync(path.join(APP, rel), 'utf8');
}

const CSS = readSrc('static/app.css');
const TEACHERS = readSrc('src/routes/teachers/+page.svelte');
const CLASSES = readSrc('src/routes/classes/+page.svelte');
const AT = readSrc('src/routes/at/+page.svelte');
const ALL = readSrc('src/routes/all/+page.svelte');

// the first `{…}` block after `sel` — the suite's usual rule-extraction idiom
function rule(css, sel) {
	const at = css.indexOf(sel);
	assert.ok(at !== -1, 'missing rule for ' + sel);
	const open = css.indexOf('{', at);
	const close = css.indexOf('}', open);
	assert.ok(open !== -1 && close !== -1, 'unterminated rule for ' + sel);
	return css.slice(open + 1, close);
}

// ---- (1) the unified h1 ----------------------------------------------------

test('issue 076: ONE unified 17pt h1 rule, the two-tier split gone', () => {
	assert.ok(/(^|\n)h1 \{ font-size: 17pt; margin: \.6rem 0 \.2rem; \}/.test(CSS),
		'the single h1 rule carries the 17pt size and the generic margins');
	// exactly one font-size: 17pt declaration in the whole sheet
	assert.strictEqual(CSS.split('font-size: 17pt').length - 1, 1,
		'the 17pt h1 size is declared exactly once');
	// the replaced values are gone from every declaration (comments may mention them)
	assert.strictEqual(CSS.indexOf('font-size: 1.3rem'), -1,
		'the old generic 1.3rem h1 is gone');
	assert.strictEqual(CSS.indexOf('font-size: 2em'), -1,
		'the teachers/classes 2em display override is gone');
	// no page-scoped h1 font-size survives — only the text-align centre may scope h1
	['body[data-page="teachers"] h1', 'body[data-page="classes"] h1'].forEach((sel) => {
		const re = new RegExp(sel.replace(/[[\]"]/g, '\\$&') + '[^{}]*\\{[^}]*font-size', 'g');
		assert.strictEqual(re.test(CSS), false, 'no page-scoped font-size may survive for ' + sel);
	});
});

// ---- (2) author credit: margin + name size ---------------------------------

test('issue 076+078: .author-credit is margin 2px 0 20pt with the name link back at 1.3em', () => {
	const credit = rule(CSS, 'body[data-page="teachers"] .author-credit,\nbody[data-page="classes"] .author-credit');
	assert.ok(/margin: 2px 0 20pt;/.test(credit), 'credit margin pinned by the user (076, kept)');
	assert.ok(/text-align: center;/.test(credit), 'the credit stays centred');
	assert.strictEqual(CSS.indexOf('margin: 1.2rem 0'), -1, 'the old 1.2rem credit margin is gone');

	// issue 078: the name link keeps the old 1.3em (Tiny5 is a 5px-grid pixel
	// font; 14pt's 18.67px blurred it); the 076 margins stay, the size reverted.
	const name = rule(CSS, 'body[data-page="teachers"] .author-credit a,\nbody[data-page="classes"] .author-credit a');
	assert.ok(/font-size: 1\.3em;/.test(name), 'the author NAME (the link) is 1.3em (issue 078)');
	assert.strictEqual(name.indexOf('14pt'), -1, 'the 076 14pt name size is gone (issue 078)');
	assert.ok(/font-family/.test(name), 'the name link still carries the Tiny5 family');
	assert.ok(/Tiny5/.test(name), 'the name stays on the Tiny5 web font (only the size reverted)');
	// the "By" label keeps the inherited body size: no font-size on the span
	const label = rule(CSS, 'body[data-page="teachers"] .author-credit span,\nbody[data-page="classes"] .author-credit span');
	assert.strictEqual(label.indexOf('font-size'), -1,
		'the "By" label stays at the inherited size (only the name was pinned)');

	// only the two filter pages carry the class — the utility views have no credit
	[TEACHERS, CLASSES].forEach((markup) => {
		assert.strictEqual(markup.split('class="author-credit"').length - 1, 1,
			'exactly one author credit');
	});
	[AT, ALL].forEach((markup) => {
		assert.strictEqual(markup.indexOf('author-credit'), -1,
			'the utility views carry no author credit');
	});
});

// ---- (3) the count line under the filter box -------------------------------

// `<p id="status">` sits directly after the filter box's closing tag and
// directly before the results list, whitespace only in between (the Svelte
// template re-indented the markup; the ADJACENCY is the pin).
function countLineAdjacent(markup, listId) {
	const wrapAt = markup.indexOf('<div id="searchWrap"');
	const listAt = markup.indexOf('<ul id="' + listId + '">');
	const statusAt = markup.indexOf('<p id="status"');
	assert.ok(wrapAt !== -1 && listAt !== -1 && statusAt !== -1,
		'searchWrap, status and the list must all exist');
	assert.ok(wrapAt < statusAt && statusAt < listAt,
		'#status sits between #searchWrap and the list');
	// nothing between the wrap's closing tag and the count line but whitespace:
	// the nearest preceding </div> IS the wrap's own close
	const between = markup.slice(markup.lastIndexOf('</div>', statusAt), statusAt);
	assert.ok(/^<\/div>\s*$/.test(between),
		'#status must directly follow the filter box');
	// and nothing between the count line's close and the list but whitespace
	const after = markup.slice(markup.indexOf('</p>', statusAt) + 4, listAt);
	assert.ok(/^\s*$/.test(after), '#status must directly precede the list');
}

test('issue 076: #status sits under #searchWrap and above the list on both filter pages', () => {
	countLineAdjacent(TEACHERS, 'teacherList');
	countLineAdjacent(CLASSES, 'classList');
	// and it is out of the header: the credit now directly follows the title
	[TEACHERS, CLASSES].forEach((markup) => {
		assert.ok(/<\/h1>\s*<p class="author-credit">/.test(markup),
			'#status left the header block — the credit follows the h1');
		assert.ok(!/<\/p>\s*<p class="author-credit">/.test(markup),
			'the count line must not sit above the credit anymore');
	});
	// the teachers suggest dropdown stays INSIDE the wrap (absolute, top:100%) so an
	// open dropdown overlays the count line instead of pushing it around
	const wrapAt = TEACHERS.indexOf('<div id="searchWrap"');
	const listAt = TEACHERS.indexOf('<ul id="teacherList">');
	const suggestAt = TEACHERS.indexOf('<ul id="suggest"');
	assert.ok(wrapAt !== -1 && suggestAt > wrapAt && suggestAt < listAt,
		'teachers: #suggest lives inside #searchWrap');

	// the count line stays in normal flow: no position/pin declaration in its rule,
	// and the centre rules still cover it on both pages
	const statusRule = rule(CSS, '#status');
	assert.strictEqual(statusRule.indexOf('position'), -1,
		'#status is never positioned — it scrolls away with the page');
	['teachers', 'classes'].forEach((page) => {
		const sel = 'body[data-page="' + page + '"] #status';
		assert.ok(rule(CSS, sel).indexOf('text-align: center') !== -1,
			sel + ' stays centred');
	});
});

// ---- (4) the utility views keep their status where it is -------------------

test('issue 076: at/ and all/ keep #status under the title (no filter box there)', () => {
	assert.ok(/<h1>Who teaches when<\/h1>\s*<p id="status">/.test(AT),
		'at/: the count line stays directly under the title');
	assert.ok(/<h1>Teachers × Time slots<\/h1>\s*<p id="status">\{statusText\(\)\}/.test(ALL),
		'all/: the count line stays directly under the title');
	[AT, ALL].forEach((markup) => {
		assert.strictEqual(markup.indexOf('id="searchWrap"'), -1,
			'the utility views carry no filter box');
	});
});

// ---- the behaviour is untouched: markup-rendered, never re-parented --------

test('issue 076: no component re-parents #status — it renders from markup, textContent only', () => {
	[TEACHERS, CLASSES, AT, ALL].forEach((src) => {
		// the count line has exactly one DOM home, in the markup
		assert.strictEqual(src.split('<p id="status"').length - 1, 1,
			'#status is a markup element, declared exactly once');
		// no script writes or re-parents it (SVG/other elements may exist; only
		// status.* writes are banned)
		assert.ok(!/getElementById\('status'\)/.test(src), 'no getElementById("status") lookup');
		assert.ok(!/status\.(innerHTML|textContent|appendChild|removeChild|insertAdjacentHTML|remove\()/.test(src),
			'#status is never written to or re-parented');
	});
});

// ---- issue 078: sticky day headings, the folding count line, class facts ---

test('issue 078: #detail .day-head sticks with an opaque surface and a padded hit area', () => {
	// the base rule (first occurrence) carries the sticky declaration itself —
	// no second sticky rule may exist to fight it
	const head = rule(CSS, '#detail .day-head');
	assert.ok(/position: sticky/.test(head), 'the day head is sticky');
	assert.ok(/top: 0;/.test(head),
		'the sticky offset pins the label flush at the scrollport top (measured in Chromium: top:-1rem hangs the whole 17px label off-screen)');
	assert.ok(/z-index: 2/.test(head), 'a stuck head paints over the rows beneath it');
	assert.ok(/background: var\(--md-surface, #fff\)/.test(head),
		'the stuck head is opaque — rows must never show through');
	assert.ok(/margin: 0;/.test(head), 'the day head has no outer margin');
	assert.ok(/padding: 1rem 0;/.test(head), 'the day head uses vertical padding for its sticky height');
	// every #detail .day-head rule keeps the padded hit area on every viewport
	// branch, not just the base.
	const re = /#detail \.day-head[^{}]*\{[^}]*\}/g;
	let m, seen = 0;
	while ((m = re.exec(CSS))) {
		seen++;
		assert.ok(/padding: 1rem 0/.test(m[0]), 'every day-head rule keeps padding: 1rem 0 — #' + seen);
	}
	assert.ok(seen >= 2, 'the base rule plus at least one media branch carry .day-head');
});

test('mobile detail h2 is hidden because overlayName supplies the heading', () => {
	const narrow = CSS.slice(CSS.indexOf('@media (max-width: 700px)'));
	assert.ok(/#detail > h2 \{\s*display: none;\s*\}/.test(narrow),
		'mobile hides the duplicated detail heading');
	assert.strictEqual(CSS.slice(0, CSS.indexOf('@media (max-width: 700px)'))
		.indexOf('#detail > h2'), -1,
		'desktop keeps the detail heading available');
});

test('teacher and class lists omit the final item border on every viewport', () => {
	assert.ok(CSS.indexOf('#teacherList li:last-child { border-bottom: 0; }') !== -1,
		'teacher list final item has no bottom border');
	assert.ok(CSS.indexOf('#classList li:last-child { border-bottom: 0; }') !== -1,
		'class list final item has no bottom border');
});

test('issue 078: #status folds away on desktop via a plain CSS transition', () => {
	// the pinned desktop box: a fixed one-line height (auto cannot transition)
	const box = rule(CSS, 'body[data-page="teachers"] #status, body[data-page="classes"] #status');
	assert.ok(/height: 1\.4em/.test(box), 'the count line keeps a pinned one-line height (covers the natural 19px line box — 1.35em clipped descenders)');
	assert.ok(/flex: none/.test(box),
		'the pinned box must not shrink: the pane is a flex column and the list absorbs the space');
	assert.ok(/overflow: hidden/.test(box), 'overflow hides the text while it folds');
	assert.ok(/transition: height \.18s ease, margin \.18s ease, opacity \.18s ease/.test(box),
		'the fold is a plain CSS transition — no JS measurement');
	// the collapsed state
	const away = rule(CSS, 'body[data-page="teachers"] #status.count-away');
	assert.ok(/height: 0/.test(away) && /margin: 0/.test(away) && /opacity: 0/.test(away),
		'count-away collapses the box to nothing');
	// narrow (the max-width: 700px branch) hides it outright — no animation there
	assert.ok(/body\[data-page="teachers"\] #status\.count-away,\s*\n?\s*body\[data-page="classes"\] #status\.count-away \{ display: none; \}/.test(CSS),
		'narrow hides the count line outright (no animation)');
	// the base #status rule is still unpositioned — the fold never turns it
	// into a positioning context
	assert.strictEqual(rule(CSS, '#status').indexOf('position'), -1,
		'the base #status rule stays unpositioned');
	// the utility views are untouched: every #status.count-away selector line
	// stays scoped to the two filter pages, never at/ or all/
	assert.strictEqual((CSS.match(/#status\.count-away/g) || []).length, 4,
		'two two-page rules: the desktop collapse and the narrow hide');
	CSS.split('#status.count-away').slice(0, -1).forEach((before) => {
		const sel = before.slice(Math.max(before.lastIndexOf(';'), before.lastIndexOf('}')) + 1);
		assert.ok(/data-page="teachers"|data-page="classes"/.test(sel),
			'every #status.count-away selector stays scoped to the filter pages');
	});
	// and the class is a markup derivation on both pages, not a JS write:
	// the filter + selection facts alone drive the fold (the legacy
	// syncClear-derived state, now a single Svelte expression)
	assert.ok(TEACHERS.indexOf('<p id="status" class={!!(query || selectedTeacher) ? \'count-away\' : \'\'}>') !== -1,
		'teachers: count-away derives from the filter/selection facts in markup');
	assert.ok(CLASSES.indexOf('<p id="status" class={!!(query || selectedClass !== null) ? \'count-away\' : \'\'}>') !== -1,
		'classes: count-away derives from the filter/selection facts in markup');
});

test('issue 078: the class-facts dl is styled once, for both filter pages', () => {
	const facts = rule(CSS, '.class-facts');
	assert.ok(/display: grid/.test(facts) || /display: table/.test(facts) ||
		/margin/.test(facts), 'the facts dl carries its own rule');
	assert.ok(CSS.indexOf('.class-facts .fact-card { display: block;') !== -1,
		'desktop facts follow the teachers page mostly-item layout');
	assert.ok(CSS.indexOf('#detail .class-facts dt {') !== -1 &&
		CSS.indexOf('font-weight: 600') !== -1,
		'fact keys are bold secondary information');
	assert.strictEqual(CSS.indexOf('dd:not(:last-of-type)::after'), -1,
		'desktop facts do not use inline separators');
	assert.ok((CSS.split('.class-facts').length - 1) >= 2,
		'the .class-facts selector appears (base rule, possibly with a scoped branch)');
	// markup: the teachers page renders the facts dl directly; the classes page
	// builds it in classFactsHTML() with the same card structure
	assert.ok(TEACHERS.indexOf('<dl class="class-facts teacher-facts">') !== -1,
		'teachers: the teacher-facts dl is in the markup');
	assert.ok(CLASSES.indexOf('<dl class="class-facts">') !== -1 &&
		CLASSES.indexOf('<div class="fact-card"><dt class="fact-name">' + '') !== -1,
		'classes: classFactsHTML emits the fact-card structure');
});

test('issue 079: four mobile facts put Track below three equal cards on narrow phones', () => {
	const narrow = CSS.slice(CSS.indexOf('@media (max-width: 700px)'));
	assert.ok(narrow.indexOf('@media (max-width: 400px)') !== -1,
		'the three-card fallback has a narrow-phone breakpoint');
	assert.ok(/grid-template-columns: repeat\(3, minmax\(0, 1fr\)\)/.test(narrow),
		'narrow phones use three fact columns');
	assert.ok(/\.class-facts:has\(\.fact-card:nth-child\(4\)\) \.fact-card:first-child \{[\s\S]*?grid-column: 1 \/ -1;[\s\S]*?order: 4;/.test(narrow),
		'the four-fact layout moves Track below and spans all three columns');
	assert.ok(/\.teacher-facts \{\s*grid-template-columns: 1fr;\s*\}/.test(narrow),
		'mobile teacher facts use one full-width column');
	assert.ok(/\.teacher-facts \.fact-card:first-child \{[\s\S]*?grid-column: 1 \/ -1;[\s\S]*?order: 2;/.test(narrow),
		'mobile teacher facts move Subject below and span the full width');
	assert.ok(narrow.indexOf('.class-facts .fact-name::after { content: ""; }') !== -1,
		'mobile fact cards omit the desktop key colon');
});

test('issue 078: desktop #detail may grow past the viewport so sticky heads can travel', () => {
	// stretch caps #detail's box at the viewport line, which would also cap a
	// sticky child's travel; the teachers/classes branches release it while
	// min-height keeps the definite column the empty state fills
	const fix = rule(CSS, 'body[data-page="teachers"] #layout > #detail,\n  body[data-page="classes"] #layout > #detail');
	assert.ok(/align-self: flex-start/.test(fix), '#detail stretches to its content on the filter pages');
	assert.ok(/min-height: calc\(100vh - 2rem\)/.test(fix), 'min-height keeps the viewport-tall column');
	assert.ok(/min-height: calc\(100dvh - 2rem\)/.test(fix), 'the dvh variant follows');
	// the fix lives in the desktop branch — narrow keeps the document scroll
	const at = CSS.indexOf('body[data-page="teachers"] #layout > #detail');
	assert.ok(at > CSS.indexOf('@media (min-width: 701px)'), 'the release is desktop-only');
});
