// test/omni.test.js — Tests for the unified omni timetable page, search matching, tabs, and fonts.
import test from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { readSrc, ROOT, CSV_PATH } from './helpers.js';
import {
	buildOmniStore,
	getTeacherDetail,
	getClassDetail,
	searchOmniTeachers,
	searchOmniClasses,
	startFromToday
} from '../app/src/lib/omni-model.js';
import { teacherName, highlightHTML, highlightClassLabel } from '../app/src/lib/display.js';
import { normStr, tokenize, mergeRanges, fuzzyRanges, scoreMatch } from '../app/src/lib/search.js';

test('omni page does not import old modeling code (libgroups.js or model.js)', () => {
	const src = readSrc('app/src/routes/+page.svelte');
	assert.ok(!src.includes('$lib/model.js'), 'omni page must not import model.js');
	assert.ok(!src.includes('$lib/libgroups.js'), 'omni page must not import libgroups.js');
	assert.ok(!src.includes('modelObjs'), 'omni page must not use legacy modelObjs');

	const modelSrc = readSrc('app/src/lib/omni-model.js');
	assert.ok(
		!modelSrc.includes("from './model.js'") && !modelSrc.includes("from '$lib/model.js'"),
		'omni-model must not import model.js'
	);
	assert.ok(!modelSrc.includes('libgroups.js'), 'omni-model must not import libgroups.js');
	assert.ok(
		modelSrc.includes('domain-model/catalogue.js') || modelSrc.includes('$domain'),
		'omni-model must use the new domain-model library'
	);
});

test('omni store builds from time.csv with 132 teachers and 94 active classes', () => {
	const csvText = fs.readFileSync(CSV_PATH, 'utf8');
	const store = buildOmniStore(csvText);

	assert.strictEqual(store.teachers.length, 132, 'exactly 132 teachers');
	assert.strictEqual(store.classes.length, 94, 'exactly 94 published leaf classes');
	assert.strictEqual(store.size, 2093, '2093 valid session records (incl. 4 with null teacher)');
});

test('polished filter matching and highlighting on teachers and classes', () => {
	const csvText = fs.readFileSync(CSV_PATH, 'utf8');
	const store = buildOmniStore(csvText);

	// 1. Searching "machi" finds Marrakchi and highlights Ma and chi
	const machiHits = searchOmniTeachers(store.teachers, 'machi');
	const marrakchi = machiHits.find((t) => t.name === 'Marrakchi');
	assert.ok(marrakchi, 'Marrakchi is found');
	assert.deepStrictEqual(marrakchi.nameRanges, [[0, 2], [6, 9]], 'matches Ma and chi ranges');
	const formattedName = teacherName(marrakchi.name, marrakchi.nameRanges);
	assert.strictEqual(formattedName, '<mark>Ma</mark>rrak<mark>chi</mark>');

	// 2. Searching "python" finds teachers who teach Python (e.g. Barboura)
	const pythonHits = searchOmniTeachers(store.teachers, 'python');
	const barboura = pythonHits.find((t) => t.name === 'Barboura');
	assert.ok(barboura, 'Barboura is found for python query');
	const pyMatch = barboura.subjectMatches.find((sm) => sm.label.toLowerCase().includes('python'));
	assert.ok(pyMatch, 'Barboura carries subject match for Python');
	const formattedSubject = highlightHTML(pyMatch.label, pyMatch.ranges);
	assert.ok(formattedSubject.includes('<mark>Python</mark>'));

	// 3. Searching "glsi 1" finds GLSI cohort 1 classes and highlights both tokens
	const glsiHits = searchOmniClasses(store.classes, 'glsi 1');
	const glsiA1 = glsiHits.find((c) => c.identifier === 'GLSI3 A1');
	assert.ok(glsiA1, 'GLSI3 A1 matches query');
	assert.ok(glsiA1.headRanges && glsiA1.headRanges.length > 0, 'has head ranges on GLSI3 A');
	assert.ok(glsiA1.subRanges && glsiA1.subRanges.length > 0, 'has sub ranges on 1');
	const highlightedHead = highlightHTML(glsiA1.shortcut.head, glsiA1.headRanges);
	const highlightedSub = highlightHTML(glsiA1.shortcut.sub, glsiA1.subRanges);
	assert.strictEqual(highlightedHead, '<mark>GLSI</mark>3 A');
	assert.strictEqual(highlightedSub, '<mark>1</mark>');

	// 4. Searching track "lcs" matches LCS classes and exposes Track attribute match
	const lcsHits = searchOmniClasses(store.classes, 'lcs');
	const lcsHit = lcsHits.find((c) => c.track === 'LCS');
	assert.ok(lcsHit, 'LCS class hit found');
	const trackMatch = lcsHit.attributeMatches.find((a) => a.name === 'Track');
	assert.ok(trackMatch, 'has Track attribute match');
	assert.strictEqual(highlightHTML(trackMatch.value, trackMatch.ranges), '<mark>LCS</mark>');
});

test('cohort token straddling head/sub highlights both parts', () => {
	const csvText = fs.readFileSync(CSV_PATH, 'utf8');
	const store = buildOmniStore(csvText);
	// "D2" straddles the shortcut split: 'D' is in the head, '2' in the sub.
	// Ranges must be computed on the full identifier and split, not per part.
	const hits = searchOmniClasses(store.classes, 'GLSI3 D2');
	const hit = hits.find((c) => c.identifier === 'GLSI3 D2');
	assert.ok(hit, 'GLSI3 D2 matches');
	assert.ok(hit.headRanges && hit.headRanges.some(([a, b]) => a <= 6 && b >= 7), 'D highlighted in head');
	assert.ok(hit.subRanges && hit.subRanges.some(([a, b]) => a <= 0 && b >= 1), '2 highlighted in sub');
	const head = highlightHTML(hit.shortcut.head, hit.headRanges);
	const sub = highlightHTML(hit.shortcut.sub, hit.subRanges);
	assert.strictEqual(head, '<mark>GLSI3</mark> <mark>D</mark>');
	assert.strictEqual(sub, '<mark>2</mark>');
});


test('class matches in teacher search carry ranges and highlight', () => {
	const csvText = fs.readFileSync(CSV_PATH, 'utf8');
	const store = buildOmniStore(csvText);
	const hits = searchOmniTeachers(store.teachers, 'glsi');
	assert.ok(hits.length > 0, 'GLSI finds teachers');
	const withClass = hits.find((t) => t.classMatches.length > 0);
	assert.ok(withClass, 'at least one teacher has class matches');
	const cm = withClass.classMatches[0];
	assert.ok(cm.ranges && cm.ranges.length > 0, 'class match carries highlight ranges');
	// The GLSI token must land inside a <mark> in the rendered label.
	const html = highlightClassLabel(cm.label, cm.ranges);
	assert.ok(html.includes('<mark>GLSI</mark>'), 'GLSI is highlighted: ' + html);
});

test('day rotation on Sunday keeps Monday first (regression)', () => {
	const csvText = fs.readFileSync(CSV_PATH, 'utf8');
	const store = buildOmniStore(csvText);
	// 2026-11-08 is a Sunday.
	const sunday = new Date(2026, 10, 8, 12, 0);
	assert.strictEqual(sunday.getDay(), 0, 'fixture is a Sunday');

	// startFromToday anchors on the first teaching day from Monday,
	// for both session shapes (fused `time` and domain `slot`).
	const days = ['LUNDI', 'MARDI', 'MERCREDI'];
	const fused = [{ day: 'LUNDI', time: '08h15-09h45' }, { day: 'MERCREDI', time: '10h00-11h30' }];
	const domain = [{ day: 'LUNDI', slot: '08h15-09h45' }, { day: 'MERCREDI', slot: '10h00-11h30' }];
	assert.deepStrictEqual(startFromToday(days, fused, sunday), ['LUNDI', 'MARDI', 'MERCREDI']);
	assert.deepStrictEqual(startFromToday(days, domain, sunday), ['LUNDI', 'MARDI', 'MERCREDI']);

	// Detail views: entities teaching on Monday start with LUNDI on Sunday,
	// at any hour (morning, mid-day, evening).
	for (const hour of [0, 9, 12, 18, 23]) {
		const at = new Date(2026, 10, 8, hour, 0);
		for (const cls of store.classes) {
			const d = getClassDetail(store, cls.identifier, at);
			if (!d) continue;
			const present = [...new Set(d.sessions.map((s) => s.day))];
			if (present.includes('LUNDI')) {
				assert.strictEqual(d.dayGroups[0].day, 'LUNDI', `${cls.identifier} at ${hour}h`);
			}
		}
		for (const t of store.teachers) {
			const d = getTeacherDetail(store, t.name, at);
			if (!d) continue;
			const present = [...new Set(d.fusedSessions.map((s) => s.day))];
			if (present.includes('LUNDI')) {
				assert.strictEqual(d.dayOrder[0], 'LUNDI', `${t.name} at ${hour}h`);
			}
		}
	}
});

test('empty timeslots render as breaks between a day\'s sessions', () => {
	const csvText = fs.readFileSync(CSV_PATH, 'utf8');
	const store = buildOmniStore(csvText);
	const now = new Date(2026, 10, 8, 12, 0);

	// BI1 A1 on LUNDI has a gap at 13h20-14h50 between its sessions.
	const d = getClassDetail(store, 'BI1 A1', now);
	assert.ok(d, 'class detail exists');
	const lundi = d.dayGroups.find((g) => g.day === 'LUNDI');
	assert.ok(lundi, 'has a LUNDI group');
	const kinds = lundi.items.map((it) => (it.kind === 'break' ? `break:${it.slot}` : `session:${it.s.slot}`));
	assert.ok(kinds.includes('break:13h20-14h50'), 'gap slot is a break: ' + kinds.join(', '));
	// No breaks outside the day's first/last session slots.
	const first = kinds[0];
	const last = kinds[kinds.length - 1];
	assert.ok(first.startsWith('session:'), 'starts with a session, not a break');
	assert.ok(last.startsWith('session:'), 'ends with a session, not a break');

	// Teacher view (fused, `time` shape) gets the same treatment.
	let foundTeacherBreak = false;
	for (const t of store.teachers) {
		const td = getTeacherDetail(store, t.name, now);
		if (!td) continue;
		for (const day of td.dayOrder) {
			if (td.byDay[day].some((it) => it.kind === 'break')) { foundTeacherBreak = true; break; }
		}
		if (foundTeacherBreak) break;
	}
	assert.ok(foundTeacherBreak, 'some teacher day contains a break');
});

test('omni search box is a single isolated component', () => {
	const page = readSrc('app/src/routes/+page.svelte');
	const box = fs.readFileSync(path.join(ROOT, 'app/src/lib/components/SearchBox.svelte'), 'utf8');

	// One box, no JS viewport fork, no triple.
	assert.ok(page.includes('SearchBox'), 'page renders the single search box');
	assert.ok(!page.includes('isMobile'), 'page has no JS viewport fork');
	assert.ok(!page.includes('let editing'), 'no editing boolean fork');
	assert.ok(!page.includes('let menuOpen'), 'no menuOpen state');
	assert.ok(!page.includes('DesktopSearch') && !page.includes('MobileSearch') && !page.includes('SearchEditor'), 'search triple removed from page');
	for (const gone of ['DesktopSearch.svelte', 'MobileSearch.svelte', 'SearchEditor.svelte']) {
		assert.ok(!fs.existsSync(path.join(ROOT, 'app/src/lib/components', gone)), gone + ' deleted');
	}

	// Completion engine removed: SearchBox is a simple "Coming soon" placeholder.
	assert.ok(box.includes('Coming soon'), 'SearchBox shows coming soon');
	assert.ok(!box.includes('<style>'), 'no component <style> block');

	// Page derives selection + mode (selected? 'selected' : query||focus ? 'editing' : 'browse').
	assert.ok(page.includes('searchFocused'), 'single searchFocused boolean');
	assert.ok(page.includes("mode = $derived(selection ? 'selected'"), 'mode derives from selection first');
	assert.ok(page.includes("'editing' : 'browse'"), 'mode falls through to browse');
	assert.ok(page.includes('selection={selection}'), 'page passes the single selection');
	assert.ok(!page.includes('.omni-tab-btn') && !page.includes('.omni-chip') && !page.includes('.omni-filters') && !page.includes('.omni-tabs'), 'page search styles removed');
	// select*/showEmpty clear query (state model: editing→selected discards query).
	for (const fn of ['function selectTeacher', 'function selectClass', 'function showEmpty']) {
		const body = page.slice(page.indexOf(fn), page.indexOf(fn) + 500);
		assert.ok(body.includes('query = '), fn + ' clears query');
	}
	// Styling ownership: omni.css owns .sbox* (no id selectors, no z-index/:has() in the section).
	const css = fs.readFileSync(path.join(ROOT, 'app/static/omni.css'), 'utf8');
	assert.ok(css.includes('#layout .sbox'), 'omni.css owns the .sbox* section');
	const sboxCss = css.slice(css.indexOf('#layout .sbox'), css.indexOf('#layout .sbox') + 7000);
	assert.ok(!sboxCss.includes('z-index'), '.sbox section has no z-index');
	assert.ok(!sboxCss.includes('[hidden]'), '.sbox section has no [hidden] rules');
	assert.ok(!sboxCss.includes(':has('), '.sbox section has no :has() stacking');
	assert.ok(!css.includes('#searchWrap{') && !css.includes('#suggest{'), 'legacy id rules deleted from omni.css');
});

test('port the animation for the emoticons and include font loading', () => {
	const html = readSrc('app/src/routes/+page.svelte');

	// 1. Animation checks
	assert.ok(html.includes('onEmptyClick'), 'has onEmptyClick handler');
	assert.ok(html.includes('onEmptyAnimEnd'), 'has onEmptyAnimEnd handler');
	assert.ok(html.includes('--hop-rot'), 'sets --hop-rot');
	assert.ok(html.includes('--hop-trans-x'), 'sets --hop-trans-x');
	assert.ok(html.includes('--hop-overshoot-x'), 'sets --hop-overshoot-x');
	assert.ok(html.includes("classList.add('hopping')"), 'toggles hopping class');
	assert.ok(html.includes('no-teacher-selected'), 'uses styled heading font for empty state');

	// 2. Font loading checks
	assert.ok(html.includes('dejavu-sans.woff2'), 'preloads dejavu-sans.woff2');
	assert.ok(html.includes('noto-sans-kannada.woff2'), 'preloads noto-sans-kannada.woff2');
	assert.ok(html.includes('noto-sans-symbols.woff2'), 'preloads noto-sans-symbols.woff2');
	assert.ok(html.includes('DynaPuff'), 'loads DynaPuff');
	assert.ok(html.includes('Tiny5'), 'loads Tiny5');

	// Verify font files exist on disk
	assert.ok(fs.existsSync(path.join(ROOT, 'app/static/vendor/dejavu-sans.woff2')));
	assert.ok(fs.existsSync(path.join(ROOT, 'app/static/vendor/noto-sans-kannada.woff2')));
	assert.ok(fs.existsSync(path.join(ROOT, 'app/static/vendor/noto-sans-symbols.woff2')));
	assert.ok(fs.existsSync(path.join(ROOT, 'app/static/vendor/tiny5.ttf')));
	assert.ok(fs.existsSync(path.join(ROOT, 'app/static/vendor/dynapuff.ttf')));
});
