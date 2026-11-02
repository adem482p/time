// app/src/lib/display.js — display-boundary helpers. Timetable class labels
// are raw model values; they are shortened to the issue-075 shortcut form
// (with a real <sub> for the cohort) only at the display boundary, leaving
// matching and data identity untouched. Every part is escaped BEFORE the
// markup is appended, so a malformed field can never inject HTML.
import { shortcutOf } from './libgroups.js';
import { esc, redacted, nameHTML as dataNameHTML } from './data.js';
import { mergeRanges } from './search.js';

/**
 * Highlight substrings in a string with <mark> tags.
 * Pure display function - no matching logic.
 *
 * @param {string} s — source string
 * @param {Array<[number,number]>} ranges — merged highlight ranges
 * @returns {string} safe HTML
 */
export function highlightHTML(s, ranges) {
	if (!ranges || !ranges.length) return esc(s);
	let h = '';
	let pos = 0;
	mergeRanges(ranges).forEach(r => {
		h += esc(s.slice(pos, r[0])) + '<mark>' + esc(s.slice(r[0], r[1])) + '</mark>';
		pos = r[1];
	});
	return h + esc(s.slice(pos));
}

/**
 * The display heading for a name: the shortcut form when shortcutOf() knows
 * the shape (`LCS3-GLSI_D Groupe 2` -> `GLSI3 D<sub>2</sub>`), the full
 * escaped name otherwise — the heading is never blank.
 *
 * @param {string} name — a raw class label (full name, compact key, or
 *   anything else the source printed)
 * @returns {string} safe HTML
 */
export function headingHTML(name) {
	const sc = shortcutOf(name);
	if (!sc) return esc(name);
	return esc(sc.head) + (sc.sub ? '<sub>' + esc(sc.sub) + '</sub>' : '');
}

/**
 * Render a teacher name for display, with optional highlight ranges.
 * Handles redaction mode (?redact=1) by delegating to data layer.
 * Supports optional alt fallback for empty names (like data.nameHTML).
 *
 * @param {string} name — teacher name
 * @param {Array<[number,number]>|string|null} rangesOrAlt — highlight ranges from fuzzy match, or alt fallback string
 * @returns {string} safe HTML
 */
export function teacherName(name, rangesOrAlt) {
	if (redacted()) return dataNameHTML(name);
	if (!name) return esc(rangesOrAlt || '');
	// If second arg is an array, treat as ranges; else as alt (ignored when name exists)
	if (Array.isArray(rangesOrAlt) && rangesOrAlt.length) return highlightHTML(name, mergeRanges(rangesOrAlt));
	return esc(name);
}
