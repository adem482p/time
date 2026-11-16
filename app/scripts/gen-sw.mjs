// app/scripts/gen-sw.mjs — postbuild: generate the SPA shell index.html and
// mirror it into every route directory so direct URL visits (and refreshes)
// resolve to a real file under a plain static file server (no SPA fallback
// middleware on GitHub Pages). Base-aware via PUBLIC_BASE so the shell works
// both served from the build/ root (PUBLIC_BASE='') and from a subdirectory
// such as GitHub Pages project pages (PUBLIC_BASE=/time).
//
// All service-worker generation and registration was removed: the omni app is
// a single static page with no offline cache.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const appDir = path.resolve(here, '..');
const buildDir = path.join(appDir, 'build');

if (!fs.existsSync(buildDir)) {
	console.error('gen-sw: build/ missing — run the SvelteKit build first');
	process.exit(1);
}

// Paths are prefixed with the build base (PUBLIC_BASE, '' locally) so the
// shell works both from the build/ root and from /time/ on GitHub Pages.
const base = process.env.PUBLIC_BASE || '';

const entryDir = path.join(buildDir, '_app', 'immutable', 'entry');
const startFile = fs.existsSync(entryDir)
	? fs.readdirSync(entryDir).find((f) => f.startsWith('start.') && f.endsWith('.js'))
	: null;

if (!startFile) {
	console.error('gen-sw: no start.*.js entry found in build/_app/immutable/entry/');
	process.exit(1);
}

const shell = `<!doctype html>
<html lang="en">
	<head>
		<meta charset="utf-8" />
		<meta name="viewport" content="width=device-width, initial-scale=1" />
		<meta name="color-scheme" content="light dark" />
		<script>
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
		<link rel="stylesheet" href="${base}/app.css" />
		<link rel="manifest" href="${base}/manifest.json" />
		<title>Time</title>
	</head>
	<body data-sveltekit-preload-data="hover">
		<script type="module" src="${base}/_app/immutable/entry/${startFile}"></script>
	</body>
</html>
`;

fs.writeFileSync(path.join(buildDir, 'index.html'), shell);

// Mirror the shell into every route directory so each route URL serves it.
// Routes are discovered from the source tree (app/src/routes/<name>/). Legacy
// routes (all/, at/) are kept in the repo for reference but are not deployed.
const LEGACY_ROUTES = new Set(['all', 'at']);
const routesSrc = path.join(appDir, 'src', 'routes');
const routeDirs = [];
for (const entry of fs.readdirSync(routesSrc, { withFileTypes: true })) {
	if (!entry.isDirectory()) continue;
	if (LEGACY_ROUTES.has(entry.name)) continue;
	routeDirs.push(entry.name);
}
for (const route of routeDirs) {
	const routeBuildDir = path.join(buildDir, route);
	fs.mkdirSync(routeBuildDir, { recursive: true });
	fs.copyFileSync(path.join(buildDir, 'index.html'), path.join(routeBuildDir, 'index.html'));
}
console.log(`gen-sw: SPA shell written to index.html and mirrored into ${routeDirs.length} route dir(s): ${routeDirs.join(', ')}`);
