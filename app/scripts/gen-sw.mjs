#!/usr/bin/env node
// app/scripts/gen-sw.mjs — postbuild generator for the two app service
// workers (issues 063/070/072 port). It reads scripts/sw-template.js and
// stamps out build/<app>/sw.js for each app (teachers, classes):
//   - the template body is the legacy worker verbatim, parameterized only
//     by the app/sibling names in the comments, the cache prefix, the
//     status-database name and the teachers-only legacy-root teardown;
//   - SNAPSHOT_URLS is built from the actual build tree: everything under
//     build/<app>/ (the page + its manifest) plus everything else at the
//     build root (app.css, _app/, assets/, vendor/, emplois.csv, …), while
//     the sibling app dir, the at/ and all/ utility pages, the root
//     index.html and the workers themselves are excluded — exactly the
//     geometry the legacy hand-written lists encoded;
//   - SNAPSHOT_SUFFIX is a short digest of the template body + the URL
//     list, so ANY change (new build's hashed chunk names included) forces
//     a new worker byte-diff (reg.update()) and wipes the previous
//     generation of THIS family on activate.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const appDir = path.resolve(here, '..');
const buildDir = path.join(appDir, 'build');

const APPS = ['teachers', 'classes'];

/** every file under dir, posix-style relative to dir (recursively). */
function walkFiles(dir, base) {
	const out = [];
	if (!fs.existsSync(dir)) return out;
	for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
		const p = path.join(dir, entry.name);
		if (entry.isDirectory()) out.push(...walkFiles(p, base));
		else out.push(path.relative(base, p).split(path.sep).join('/'));
	}
	return out;
}

function digest(s) {
	return crypto.createHash('sha1').update(s).digest('hex').slice(0, 8);
}

const template = fs.readFileSync(path.join(appDir, 'scripts', 'sw-template.js'), 'utf8');

for (const app of APPS) {
	const sibling = APPS.find((a) => a !== app);
	if (!fs.existsSync(path.join(buildDir, app, 'index.html'))) {
		console.error(`gen-sw: build/${app}/index.html missing — run the SvelteKit build first`);
		process.exit(1);
	}
	// URL list: the app's own directory + every shared root asset, minus the
	// exclusions above. Paths inside the app dir are worker-relative as-is
	// (plus the bare './' directory navigation); everything else carries
	// the '../' prefix (shared files live at the site root).
	const urls = ['./'];
	const skipped = new Set([
		'index.html', // the root redirect page — online-only by design
		`at/index.html`,
		`all/index.html`,
		`${app}/sw.js`
	]);
	skipped.add(`${sibling}/sw.js`); // the sibling worker stamping runs in parallel
	for (const p of walkFiles(buildDir, buildDir).sort()) {
		const top = p.split('/')[0];
		if (p.startsWith(app + '/')) {
			if (p === `${app}/index.html` || p === `${app}/manifest.json`) urls.push(p.slice(app.length + 1));
			else if (!skipped.has(p)) urls.push(p.slice(app.length + 1));
		} else if (top === app || top === sibling || top === 'at' || top === 'all') {
			// the sibling app dir and the utility pages: excluded wholesale
			continue;
		} else if (p.endsWith('.swp') || p.includes('/.')) {
			continue;
		} else if (skipped.has(p)) {
			continue;
		} else {
			urls.push('../' + p);
		}
	}
	// Teachers worker only: the legacy pre-split root snapshot
	// 'emplois-snapshot-v1' is deleted by exact name — existing installs
	// carry it and no root worker survives to clean it (issue 072).
	const legacyRoot =
		app === 'teachers'
			? {
					comment:
						"\n  // Teachers worker only: the legacy pre-split root snapshot\n  // 'emplois-snapshot-v1' is deleted by exact name — existing installs\n  // carry it and no root worker survives to clean it (issue 072).",
					clause: " || k === 'emplois-snapshot-v1'"
				}
			: { comment: '', clause: '' };
	let body = template
		.replaceAll('__APP__', app)
		.replaceAll('__SIBLING__', sibling)
		.replaceAll(' __LEGACY_ROOT_COMMENT__', legacyRoot.comment)
		.replaceAll('__LEGACY_ROOT_CLAUSE__', legacyRoot.clause)
		.replaceAll('__SNAPSHOT_URLS__', JSON.stringify(urls, null, 2))
		.replaceAll('__SNAP_SUFFIX__', 'v-' + digest(template + JSON.stringify(urls)));
	const out = path.join(buildDir, app, 'sw.js');
	fs.writeFileSync(out, body);
	console.error(`gen-sw: ${path.relative(appDir, out)} — ${urls.length} snapshot URLs, suffix v-${digest(template + JSON.stringify(urls))}`);
}
