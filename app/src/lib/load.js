// app/src/lib/load.js — shared boot helper: fetch the timetable CSV into the
// in-memory store. In the old static tree each page resolved '../emplois.csv'
// off its script URL; the Svelte pages resolve it against the build base
// (svelte.config.js paths.base) so a subdirectory deployment keeps working.
import { createStore } from './data.js';

/**
 * Fetch emplois.csv and build the in-memory store from its text.
 *
 * @param {string} base the site base URL as configured for the build
 *   ('' or e.g. '/time'); the CSV always lives at `<base>/emplois.csv`.
 * @returns {Promise<*>} a promise resolving to the created store object
 */
export async function loadStore(base) {
	const res = await fetch(`${base}/emplois.csv`);
	if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
	return createStore(await res.text());
}
