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

const APPS = ['teachers', 'classes', 'omni'];

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

// ---- stage three: generate the SPA shell index.html -----------------------

// With ssr = false there are no prerendered pages. The site is a pure
// client-side app: every route serves the same index.html shell, and the
// SvelteKit client runtime mounts and fetches time.csv on demand. We generate
// a single shell at build/index.html and mirror it into every route directory
// so that direct URL visits (and refreshes) resolve to a real file under a
// plain static file server (no SPA fallback middleware needed).

const entryDir = path.join(buildDir, '_app', 'immutable', 'entry');
const startFile = fs.existsSync(entryDir)
  ? fs.readdirSync(entryDir).find((f) => f.startsWith('start.') && f.endsWith('.js'))
  : null;

if (!startFile) {
	console.error('gen-sw: no start.*.js entry found in build/_app/immutable/entry/');
	process.exit(1);
}

// root-relative paths work when served from the build/ root (python3 -m http.server)
const shell = `<!doctype html>
<html lang="en">
	<head>
		<meta charset="utf-8" />
		<meta name="viewport" content="width=device-width, initial-scale=1" />
		<meta name="color-scheme" content="light dark" />
		<script>
			/* theme replay before first paint — persisted per-scheme custom
			   properties written verbatim so the first frame is already themed. */
			(function () {
				try {
					var s = JSON.parse(localStorage.getItem('time-theme') || 'null');
					if (!s || !s.vars) return;
					var d = !!(window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches);
					var v = s.vars[d ? 'dark' : 'light'];
					if (!v) return;
					var st = document.documentElement.style;
					for (var k in v) if (v.hasOwnProperty(k)) st.setProperty(k, v[k]);
				} catch (e) { /* corrupt/unavailable storage: default theme */ }
			})();
		</script>
		<link rel="stylesheet" href="/app.css" />
		<title>Time</title>
	</head>
	<body data-sveltekit-preload-data="hover">
		<script type="module" src="/_app/immutable/entry/${startFile}"></script>
	</body>
</html>
`;

fs.writeFileSync(path.join(buildDir, 'index.html'), shell);

// mirror the shell into every route directory so each route URL serves it.
// Routes are discovered from the source tree (app/src/routes/<name>/), so
// routes with no static adapter output (e.g. /all, /at under ssr=false) are
// still covered.
const routesSrc = path.join(appDir, 'src', 'routes');
const routeDirs = [];
for (const entry of fs.readdirSync(routesSrc, { withFileTypes: true })) {
	if (entry.isDirectory()) {
		routeDirs.push(entry.name);
	}
}
for (const route of routeDirs) {
	const routeBuildDir = path.join(buildDir, route);
	fs.mkdirSync(routeBuildDir, { recursive: true });
	fs.copyFileSync(path.join(buildDir, 'index.html'), path.join(routeBuildDir, 'index.html'));
}
console.log(`gen-sw: SPA shell written to index.html and mirrored into ${routeDirs.length} route dirs`);
