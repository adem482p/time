#!/usr/bin/env node
// app/scripts/gen-sw.mjs — the single postbuild script. Stage one stamps the
// data-page body attribute into every built app page (the CSS scoping hook
// app.css required of every painted page; see the comment inside). Stage two
// generates the two app service workers (issues 063/070/072 port, reworked by
// issue 087): it reads scripts/sw-template.js and stamps out build/<app>/sw.js
// for each app (teachers, classes). The template body is the network-first
// runtime-caching worker verbatim, parameterized only by the app/sibling names
// in the comments and the cache prefix — there is NO snapshot URL list any more
// (issue 087: the runtime cache self-populates from real traffic, so the build
// derives nothing but the per-app expansions).
//   - the runtime cache family name uses the __APP__ token;
//   - the status database name uses the __APP__ token;
//   - the teachers-only legacy root snapshot teardown is injected verbatim.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const appDir = path.resolve(here, '..');
const buildDir = path.join(appDir, 'build');

const APPS = ['teachers', 'classes'];

const template = fs.readFileSync(path.join(appDir, 'scripts', 'sw-template.js'), 'utf8');

// ---- stage one: stamp the data-page body attribute -----------------------

//
// No component may render the <body> element: app.html owns it, and Svelte
// cannot carry a nested <body> client-side (the HTML parser strips <body>
// from a template's contents, and <svelte:body> accepts no attributes). The
// prerendered page therefore ships its body without the attribute, and this
// stamp writes it into every built app page — the static pages ARE the site,
// so the attribute must be on them before any script runs. At hydration the
// layout component re-asserts the same value via $effect (+layout.svelte),
// for SPA navigations included.
//
// Same name rule on both sides: first path segment, teachers at the root.
// The redirect stubs (the build-root index.html hand-over and classes.html)
// are never painted app pages and stay untouched (issue 073 / pwa.test.js
// pin them data-page-free).

if (!fs.existsSync(buildDir)) {
	console.error('gen-sw: build/ missing — run the SvelteKit build first');
	process.exit(1);
}

function stampPage(html, pageName) {
	// the <body ...> open tag of the one document this page prerenders
	const at = html.search(/<body(?:\s|>)/);
	if (at === -1) return { html, changed: false };
	const tagEnd = html.indexOf('>', at);
	const bodyTag = html.slice(at, tagEnd + 1);
	if (/\sdata-page[\s=>]/.test(bodyTag)) return { html, changed: false };
	return { html: html.slice(0, tagEnd) + ` data-page="${pageName}"` + html.slice(tagEnd), changed: true };
}

function* appPages(dir) {
	// the prerendered app pages sit at build/<route>/index.html; the build
	// root carries only shared assets and redirect stubs — never visit it
	for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
		if (!entry.isDirectory()) continue;
		const page = path.join(dir, entry.name, 'index.html');
		if (fs.existsSync(page)) yield [page, entry.name];
	}
}

let stamped = 0;
for (const [file, pageName] of appPages(buildDir)) {
	const result = stampPage(fs.readFileSync(file, 'utf8'), pageName);
	if (result.changed) {
		fs.writeFileSync(file, result.html);
		stamped += 1;
	} else {
		console.warn(`gen-sw: ${path.relative(buildDir, file)} already carries data-page`);
	}
}
console.log(`gen-sw: ${stamped} page(s) stamped (body data-page)`);

// ---- stage two: the two app service workers -------------------------------

for (const app of APPS) {
	const sibling = APPS.find((a) => a !== app);
	if (!fs.existsSync(path.join(buildDir, app, 'index.html'))) {
		console.error(`gen-sw: build/${app}/index.html missing — run the SvelteKit build first`);
		process.exit(1);
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
		.replaceAll('__LEGACY_ROOT_CLAUSE__', legacyRoot.clause);
	const out = path.join(buildDir, app, 'sw.js');
	fs.writeFileSync(out, body);
	console.error(`gen-sw: ${path.relative(appDir, out)} — runtime cache '${app}-snapshot-'`);
}
