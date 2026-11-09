// test/omni.test.js — Tests for the unified omni timetable page, search matching, tabs, and fonts.
import test from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { readSrc, ROOT } from './helpers.js';
import {
	buildOmniStore,
	getTeacherDetail,
	getClassDetail,
	searchOmniTeachers,
	searchOmniClasses,
	startFromToday
} from '../app/src/lib/omni-model.js';
import { teacherName, highlightHTML } from '../app/src/lib/display.js';

test('omni page does not import old modeling code (libgroups.js or model.js)', () => {
	const src = readSrc('app/src/routes/omni/+page.svelte');
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
	const csvText = fs.readFileSync(path.join(ROOT, 'time.csv'), 'utf8');
	const store = buildOmniStore(csvText);

	assert.strictEqual(store.teachers.length, 132, 'exactly 132 teachers');
	assert.strictEqual(store.classes.length, 94, 'exactly 94 published leaf classes');
	assert.strictEqual(store.size, 2093, '2093 valid session records (incl. 4 with null teacher)');
});

test('polished filter matching and highlighting on teachers and classes', () => {
	const csvText = fs.readFileSync(path.join(ROOT, 'time.csv'), 'utf8');
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

test('day rotation on Sunday keeps Monday first (regression)', () => {
	const csvText = fs.readFileSync(path.join(ROOT, 'time.csv'), 'utf8');
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

test('tabs are placed under the filter box and obey mobile visibility rules', () => {
	const html = readSrc('app/src/routes/omni/+page.svelte');

	// Verify markup order: #searchWrap, then .omni-tabs, then #status
	const wrapIdx = html.indexOf('<div id="searchWrap">');
	const tabsIdx = html.indexOf('<div class="omni-tabs" role="tablist">');
	const statusIdx = html.indexOf('<p id="status"');

	assert.ok(wrapIdx !== -1, 'has #searchWrap');
	assert.ok(tabsIdx !== -1, 'has .omni-tabs');
	assert.ok(statusIdx !== -1, 'has #status');
	assert.ok(wrapIdx < tabsIdx, 'tabs must be placed under the filter box');
	assert.ok(tabsIdx < statusIdx, 'tabs sit above status and the list');

	// Verify mobile visibility styling
	assert.ok(
		html.includes(':global(#layout:not(.is-list)) .omni-tabs'),
		'tabs hide on mobile when not .is-list'
	);
	assert.ok(
		html.includes(':global(#layout.is-list) .omni-tabs'),
		'tabs show on mobile when .is-list'
	);
});

test('port the animation for the emoticons and include font loading', () => {
	const html = readSrc('app/src/routes/omni/+page.svelte');

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
