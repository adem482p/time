// app/src/lib/display.js — display-boundary helpers. Timetable class labels
// are raw model values; they are shortened to the issue-075 shortcut form
// (with a real <sub> for the cohort) only at the display boundary, leaving
// matching and data identity untouched. Every part is escaped BEFORE the
// markup is appended, so a malformed field can never inject HTML.
import { shortcutOf } from './libgroups.js';
import { esc } from './data.js';

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
 * Manual right-arrow for the "Next" marker, drawn as an SVG so it renders
 * identically across platforms and inherits the tag color.
 *
 * @returns {string} safe HTML
 */
export function nextArrowHTML() {
	return '<svg class="nextarrow" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 12h14M12 6l6 6-6 6"/></svg>';
}
