// app/src/lib/omni-model.js — Domain model integration and timetable derivations for the omni app.
// Uses the new data modeling library in domain-model/ ($domain).
import { createCatalogue } from '../../../domain-model/catalogue.js';
import * as dm from '../../../domain-model/index.js';
import { normStr, tokenize, fuzzyRanges, scoreMatch, mergeRanges } from './search.js';

export const DAYS = ['LUNDI', 'MARDI', 'MERCREDI', 'JEUDI', 'VENDREDI', 'SAMEDI'];
export const SLOTS = [
	'08h15-09h45',
	'10h00-11h30',
	'11h40-13h10',
	'13h20-14h50',
	'15h00-16h30',
	'16h45-18h15'
];
export const HOURS_PER_SESSION = 1.5;
export const JS_DAY = ['DIMANCHE', 'LUNDI', 'MARDI', 'MERCREDI', 'JEUDI', 'VENDREDI', 'SAMEDI'];
export const DAY_IDX = { LUNDI: 1, MARDI: 2, MERCREDI: 3, JEUDI: 4, VENDREDI: 5, SAMEDI: 6 };

/**
 * French day names display lowercase (lundi..samedi); data stays uppercase.
 */
export function frDay(d) {
	return String(d || '').toLowerCase();
}

/**
 * Format hours label: sessions count -> "57h00" or "57h30".
 */
export function hoursLabel(nSessions) {
	const h = nSessions * HOURS_PER_SESSION;
	const whole = Math.floor(h + 1e-9);
	return whole + 'h' + (h - whole >= 0.5 ? '30' : '00');
}

/**
 * "08h15-09h45" -> endpoints in minutes since midnight: [495, 585].
 */
export function slotMinutes(slot) {
	const m = /(\d+)h(\d+)-(\d+)h(\d+)/.exec(slot);
	if (!m) return [0, 0];
	return [+m[1] * 60 + +m[2], +m[3] * 60 + +m[4]];
}

/**
 * Check if the given session is happening at `now`.
 */
export function isCurrentSession(day, time, now) {
	now = now || new Date();
	if (JS_DAY[now.getDay()] !== day) return false;
	const se = slotMinutes(time);
	const cur = now.getHours() * 60 + now.getMinutes();
	return cur >= se[0] && cur < se[1];
}

/**
 * Calculate the day cursor for the week grid.
 */
export function dayCursor(now, slots) {
	now = now || new Date();
	slots = slots || SLOTS;
	const today = JS_DAY[now.getDay()];
	const isSunday = DAY_IDX[today] === undefined;
	const out = {
		today,
		isSunday,
		phase: isSunday ? 'sunday' : 'before',
		visible: false,
		cur: null,
		next: null,
		frac: null
	};
	if (isSunday) return out;
	const mins = now.getHours() * 60 + now.getMinutes();
	if (mins < slotMinutes(slots[0])[0]) return out;
	if (mins >= slotMinutes(slots[slots.length - 1])[1]) {
		out.phase = 'after';
		return out;
	}
	out.phase = 'during';
	out.visible = true;
	for (let i = 0; i < slots.length; i++) {
		const se = slotMinutes(slots[i]);
		if (mins >= se[0] && mins < se[1]) {
			out.cur = slots[i];
			out.frac = (mins - se[0]) / (se[1] - se[0]);
		}
		if (se[0] > mins && out.next === null) out.next = slots[i];
	}
	return out;
}

/**
 * Minutes from midnight to next occurrence of session strictly after `now`.
 */
export function nextKey(s, now) {
	const st = slotMinutes(s.time)[0];
	const cur = now.getHours() * 60 + now.getMinutes();
	let ahead = (DAY_IDX[s.day] - now.getDay() + 7) % 7;
	if (ahead === 0 && st <= cur) ahead = 7;
	return ahead * 1440 + st;
}

/**
 * Indices of the earliest next occurrence sessions.
 */
export function nextSessionIdx(sessions, now) {
	now = now || new Date();
	const keys = (sessions || []).map((s) => nextKey(s, now));
	const best = Math.min.apply(null, keys);
	const out = new Set();
	keys.forEach((k, i) => {
		if (k === best) out.add(i);
	});
	return out;
}

/**
 * Anchor day for start-from-today day rotation.
 */
function anchorDay(sessions, now) {
	now = now || new Date();
	const mins = now.getHours() * 60 + now.getMinutes();
	const today = JS_DAY[now.getDay()];
	const ss = sessions || [];
	if (ss.some((s) => s.day === today && slotMinutes(s.time)[1] > mins)) return today;
	const start = DAY_IDX[today] - 1;
	for (let k = 1; k <= 6; k++) {
		const d = DAYS[(((start + k) % 6) + 6) % 6];
		if (ss.some((s) => s.day === d)) return d;
	}
	return null;
}

/**
 * Rotate a distinct day list cyclically so it starts at the anchor day.
 */
export function startFromToday(days, sessions, now) {
	const a = anchorDay(sessions, now);
	if (a === null) return days.slice();
	const i = days.indexOf(a);
	if (i <= 0) return days.slice();
	return days.slice(i).concat(days.slice(0, i));
}

/**
 * Parse CSV text into row objects.
 */
export function parseCsvRows(text) {
	const rows = [];
	let row = [],
		cur = '',
		inQ = false;
	for (let i = 0; i < text.length; i++) {
		const c = text[i];
		if (inQ) {
			if (c === '"') {
				if (text[i + 1] === '"') {
					cur += '"';
					i++;
				} else inQ = false;
			} else cur += c;
		} else if (c === '"') inQ = true;
		else if (c === ',') {
			row.push(cur);
			cur = '';
		} else if (c === '\n' || c === '\r') {
			if (c === '\r' && text[i + 1] === '\n') i++;
			row.push(cur);
			cur = '';
			if (row.length > 1 || row[0] !== '') rows.push(row);
			row = [];
		} else cur += c;
	}
	if (cur !== '' || row.length) {
		row.push(cur);
		rows.push(row);
	}
	const head = rows.shift() || [];
	return rows.map((r) => {
		const o = {};
		head.forEach((h, j) => {
			o[h] = (r[j] || '').trim();
		});
		return o;
	});
}

/**
 * Format class shortcut representation.
 */
export function classShortcut(cls) {
	const spec =
		cls.specialty?.type === dm.Type.COMMON_SPECIALTY
			? `${cls.specialty.year.track_specifier.value}${cls.specialty.year.year_specifier.value}`
			: `${cls.specialty?.specialty_specifier?.value || ''}${cls.specialty?.specialty_semester_specifier?.value || ''}`;

	const grp = cls.group_specifier?.value;
	const coh = cls.cohort_specifier?.value;

	if (grp && coh) {
		return { head: `${spec} ${grp}`, sub: String(coh) };
	} else if (grp) {
		return { head: `${spec} ${grp}`, sub: '' };
	} else {
		return { head: spec, sub: '' };
	}
}

/**
 * Build the omni store from CSV text using the domain model library.
 */
export function buildOmniStore(csvText) {
	const rawRows = parseCsvRows(csvText);
	const baseCat = createCatalogue();

	const validRecords = [];
	for (const r of rawRows) {
		const rec = dm.fromCsvRecord(r, { catalogue: baseCat });
		if (rec.type === dm.Type.PARTIAL_SESSION_RECORD) {
			validRecords.push(rec);
		}
	}

	const catalogue = createCatalogue(validRecords);

	// Collect unique teachers, session counts, subjects and classes
	const teacherStats = {};
	for (const r of validRecords) {
		if (!teacherStats[r.teacher]) {
			teacherStats[r.teacher] = { count: 0, subjects: new Set(), classes: new Set() };
		}
		teacherStats[r.teacher].count += 1;
		if (r.subject) teacherStats[r.teacher].subjects.add(r.subject);
		if (r.reference) teacherStats[r.teacher].classes.add(r.reference);
	}

	const teachers = Object.keys(teacherStats)
		.sort((a, b) => a.localeCompare(b))
		.map((name) => ({
			name,
			sessionCount: teacherStats[name].count,
			subjects: Array.from(teacherStats[name].subjects),
			classes: Array.from(teacherStats[name].classes)
		}));

	// Collect publication classes present in the CSV
	const publicationClasses = new Set(validRecords.map((r) => r.reference));

	// Match active leaf classes from catalogue.classes
	const classes = [];
	for (const c of catalogue.classes) {
		if (publicationClasses.has(c.identifier)) {
			const sc = classShortcut(c);
			const track = c.specialty?.year?.track_specifier?.value || '';
			const yr = c.specialty?.year?.year_specifier?.value || '';
			const specialty =
				c.specialty?.type === dm.Type.COMMON_SPECIALTY
					? `${track}${yr}`
					: `${c.specialty?.specialty_specifier?.value || ''}${c.specialty?.specialty_semester_specifier?.value || ''}`;

			classes.push({
				identifier: c.identifier,
				type: c.type,
				classObj: c,
				shortcut: sc,
				track,
				year: yr,
				specialty,
				group: c.group_specifier?.value || '',
				cohort: c.cohort_specifier?.value != null ? String(c.cohort_specifier.value) : ''
			});
		}
	}

	// Sort classes deterministically
	classes.sort((a, b) => a.identifier.localeCompare(b.identifier));

	return {
		catalogue,
		records: validRecords,
		teachers,
		classes,
		size: validRecords.length,
		rawSize: rawRows.length
	};
}

/**
 * Polished teacher search with fuzzy matching across teacher name, subjects and classes.
 */
export function searchOmniTeachers(teachers, query) {
	const q = String(query == null ? '' : query).trim();
	if (!q) {
		return teachers
			.map((t) => ({
				...t,
				exact: false,
				score: 0,
				nameRanges: null,
				subjectMatches: [],
				classMatches: []
			}))
			.sort((a, b) => a.name.localeCompare(b.name));
	}

	const tokens = tokenize(q);
	const normQuery = normStr(q);
	const out = [];

	teachers.forEach((t) => {
		let ok = true;
		let score = 0;
		const nameRanges = [];
		const subjectMatches = {};
		const classMatches = {};

		tokens.forEach((tok) => {
			let best = -1;
			const nr = fuzzyRanges(t.name, tok);
			if (nr) {
				best = scoreMatch(t.name, tok);
				nameRanges.push(...nr);
			}

			t.subjects.forEach((s) => {
				const sr = fuzzyRanges(s, tok);
				if (!sr) return;
				const sc = scoreMatch(s, tok);
				if (sc > best) best = sc;
				if (!subjectMatches[s]) subjectMatches[s] = { label: s, ranges: [] };
				subjectMatches[s].ranges.push(...sr);
			});

			t.classes.forEach((c) => {
				const cr = fuzzyRanges(c, tok);
				if (!cr) return;
				const sc = scoreMatch(c, tok);
				if (sc > best) best = sc;
				if (!classMatches[c]) classMatches[c] = { label: c, ranges: [] };
				classMatches[c].ranges.push(...cr);
			});

			if (best < 0) {
				ok = false;
				return;
			}
			score += best;
		});

		if (!ok) return;

		if (normStr(t.name) === normQuery) score += 10000;

		out.push({
			...t,
			score,
			nameRanges: nameRanges.length ? mergeRanges(nameRanges) : null,
			subjectMatches: Object.keys(subjectMatches).map((k) => ({
				label: subjectMatches[k].label,
				ranges: mergeRanges(subjectMatches[k].ranges)
			})),
			classMatches: Object.keys(classMatches).map((k) => ({
				label: classMatches[k].label,
				ranges: mergeRanges(classMatches[k].ranges)
			}))
		});
	});

	return out.sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));
}

/**
 * Polished class search with fuzzy matching across shortcut, track, specialty, and cohort.
 */
export function searchOmniClasses(classes, query) {
	const q = String(query == null ? '' : query).trim();
	if (!q) {
		return classes
			.map((c) => ({
				...c,
				score: 0,
				headRanges: null,
				subRanges: null,
				attributeMatches: []
			}))
			.sort((a, b) => a.identifier.localeCompare(b.identifier));
	}

	const tokens = tokenize(q);
	const out = [];

	classes.forEach((c) => {
		let ok = true;
		let score = 0;
		const headRanges = [];
		const subRanges = [];
		const attributeMatches = {};

		tokens.forEach((tok) => {
			let matched = false;
			let best = -1;

			const hr = fuzzyRanges(c.shortcut.head, tok);
			if (hr) {
				matched = true;
				const sc = scoreMatch(c.shortcut.head, tok);
				if (sc > best) best = sc;
				headRanges.push(...hr);
			}

			if (c.shortcut.sub) {
				const sr = fuzzyRanges(c.shortcut.sub, tok);
				if (sr) {
					matched = true;
					const sc = scoreMatch(c.shortcut.sub, tok);
					if (sc > best) best = sc;
					subRanges.push(...sr);
				}
			}

			const attrs = [
				['Track', c.track],
				['Specialty', c.specialty],
				['Year', c.year],
				['Identifier', c.identifier]
			];
			attrs.forEach(([attrName, attrVal]) => {
				if (!attrVal) return;
				const ar = fuzzyRanges(String(attrVal), tok);
				if (ar) {
					matched = true;
					const sc = scoreMatch(String(attrVal), tok);
					if (sc > best) best = sc;
					if (attrName !== 'Identifier') {
						if (!attributeMatches[attrName]) {
							attributeMatches[attrName] = { name: attrName, value: String(attrVal), ranges: [] };
						}
						attributeMatches[attrName].ranges.push(...ar);
					}
				}
			});

			if (!matched) {
				ok = false;
				return;
			}
			score += Math.max(best, 0);
		});

		if (!ok) return;

		if (
			c.identifier.toLowerCase() === q.toLowerCase() ||
			c.shortcut.head.toLowerCase() === q.toLowerCase()
		) {
			score += 10000;
		}

		out.push({
			...c,
			score,
			headRanges: headRanges.length ? mergeRanges(headRanges) : null,
			subRanges: subRanges.length ? mergeRanges(subRanges) : null,
			attributeMatches: Object.keys(attributeMatches).map((k) => ({
				name: attributeMatches[k].name,
				value: attributeMatches[k].value,
				ranges: mergeRanges(attributeMatches[k].ranges)
			}))
		});
	});

	return out.sort((a, b) => b.score - a.score || a.identifier.localeCompare(b.identifier));
}

/**
 * Fuse teacher sessions sharing day and time.
 */
export function fuseTeacherSessions(sessions) {
	const slotGroups = {};
	for (const s of sessions) {
		const k = `${s.day}|${s.time}`;
		if (!slotGroups[k]) {
			slotGroups[k] = [];
		}
		slotGroups[k].push(s);
	}

	const fused = [];
	for (const k of Object.keys(slotGroups)) {
		const list = slotGroups[k];
		const first = list[0];
		const rooms = Array.from(new Set(list.map((s) => s.room).filter(Boolean))).sort();
		const subjects = Array.from(new Set(list.map((s) => s.subject).filter(Boolean))).sort();
		const pills = Array.from(new Set(list.map((s) => s.reference).filter(Boolean))).sort();
		const weeks = Array.from(new Set(list.map((s) => s.week_pattern_specifier).filter(Boolean)));
		const week = weeks.length === 1 ? weeks[0] : '';

		fused.push({
			day: first.day,
			time: first.time,
			room: rooms.join(' or ') || '—',
			subject: subjects.join(' or '),
			pills,
			week,
			rawSessions: list
		});
	}

	fused.sort((a, b) => {
		const dDiff = DAYS.indexOf(a.day) - DAYS.indexOf(b.day);
		if (dDiff !== 0) return dDiff;
		const sDiff = SLOTS.indexOf(a.time) - SLOTS.indexOf(b.time);
		if (sDiff !== 0) return sDiff;
		return a.subject.localeCompare(b.subject);
	});

	return fused;
}

/**
 * Build teacher detail view data.
 */
export function getTeacherDetail(omniStore, teacherName, now) {
	if (!omniStore || !teacherName) return null;
	const teacherSessions = omniStore.records.filter((r) => r.teacher === teacherName);
	if (!teacherSessions.length) return null;

	const fusedSessions = fuseTeacherSessions(teacherSessions);

	const now2 = now || new Date();
	const next = nextSessionIdx(fusedSessions, now2);

	const liveDays = {};
	fusedSessions.forEach((s, i) => {
		if (isCurrentSession(s.day, s.time, now2) || next.has(i)) {
			liveDays[s.day] = true;
		}
	});

	let dayOrder = [];
	const byDay = {};
	fusedSessions.forEach((s, i) => {
		if (!byDay[s.day]) {
			byDay[s.day] = [];
			dayOrder.push(s.day);
		}
		byDay[s.day].push({ s, i });
	});
	dayOrder = startFromToday(dayOrder, fusedSessions, now2);

	const subjectCounts = {};
	for (const s of teacherSessions) {
		subjectCounts[s.subject] = (subjectCounts[s.subject] || 0) + 1;
	}
	const totalSessions = teacherSessions.length;
	const rankedSubjects = Object.keys(subjectCounts)
		.sort((a, b) => subjectCounts[b] - subjectCounts[a] || a.localeCompare(b))
		.map((sub) => ({
			name: sub,
			sessions: subjectCounts[sub],
			share: totalSessions ? subjectCounts[sub] / totalSessions : 0
		}));

	const classCounts = {};
	for (const s of teacherSessions) {
		const ref = s.reference || 'Other';
		classCounts[ref] = (classCounts[ref] || 0) + 1;
	}
	const rankedClasses = Object.keys(classCounts)
		.sort((a, b) => classCounts[b] - classCounts[a] || a.localeCompare(b))
		.map((cls) => ({
			name: cls,
			sessions: classCounts[cls],
			share: totalSessions ? classCounts[cls] / totalSessions : 0
		}));

	return {
		name: teacherName,
		totalSessions,
		topSubject: rankedSubjects[0] ? rankedSubjects[0].name : '—',
		topClass: rankedClasses[0] ? rankedClasses[0].name : '—',
		rankedSubjects,
		rankedClasses,
		fusedSessions,
		upcoming: next,
		liveDays,
		dayOrder,
		byDay
	};
}

/**
 * Build class detail view data using domain model resolution.
 */
export function getClassDetail(omniStore, classIdentifier, now) {
	if (!omniStore || !classIdentifier) return null;
	const resolution = omniStore.catalogue.resolve(classIdentifier, { expected: 'class' });
	if (resolution.type !== dm.Type.UNIQUE_MATCH) return null;
	if (resolution.publication.type !== dm.Type.RECORDS) return null;

	const cls = resolution.syntax.class;
	const sessions = resolution.publication.records;

	const sortedSessions = sessions.slice().sort((a, b) => {
		const dDiff = DAYS.indexOf(a.day) - DAYS.indexOf(b.day);
		if (dDiff !== 0) return dDiff;
		return SLOTS.indexOf(a.time) - SLOTS.indexOf(b.time);
	});

	const now2 = now || new Date();
	const cursor = dayCursor(now2, SLOTS);

	const liveDays = {};
	sortedSessions.forEach((s) => {
		if (
			isCurrentSession(s.day, s.time, now2) ||
			(cursor && cursor.visible && s.day === cursor.today && s.time === cursor.next)
		) {
			liveDays[s.day] = true;
		}
	});

	let dayOrder = [];
	const byDay = {};
	sortedSessions.forEach((s) => {
		if (!byDay[s.day]) {
			byDay[s.day] = [];
			dayOrder.push(s.day);
		}
		byDay[s.day].push(s);
	});
	dayOrder = startFromToday(dayOrder, sortedSessions, now2);
	const dayGroups = dayOrder.map((day) => ({ day, sessions: byDay[day] }));

	const byDaySlot = {};
	sortedSessions.forEach((s) => {
		const k = `${s.day}|${s.time}`;
		(byDaySlot[k] = byDaySlot[k] || []).push(s);
	});

	const track = cls.specialty?.year?.track_specifier?.value || '';
	const yr = cls.specialty?.year?.year_specifier?.value || '';
	const specialty =
		cls.specialty?.type === dm.Type.COMMON_SPECIALTY
			? `${track}${yr}`
			: `${cls.specialty?.specialty_specifier?.value || ''}${cls.specialty?.specialty_semester_specifier?.value || ''}`;
	const group = cls.group_specifier?.value || '';
	const cohort = cls.cohort_specifier?.value != null ? String(cls.cohort_specifier.value) : '';
	const groupe = group ? (cohort ? `${group}<sub>${cohort}</sub>` : group) : cohort || '';

	const facts = [];
	if (track) facts.push({ name: 'Track', value: track, raw: false });
	if (yr) facts.push({ name: 'Year', value: String(yr), raw: false });
	if (specialty) facts.push({ name: 'Specialty', value: specialty, raw: false });
	if (groupe) facts.push({ name: 'Groupe', value: groupe, raw: true });

	const shortcut = classShortcut(cls);

	return {
		identifier: classIdentifier,
		cls,
		shortcut,
		facts,
		sessions: sortedSessions,
		dayGroups,
		byDaySlot,
		cursor,
		liveDays
	};
}
