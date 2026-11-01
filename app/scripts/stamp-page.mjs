// app/scripts/stamp-page.mjs — postbuild stamp for the data-page body
// attribute (the CSS scoping hook app.css required of every painted page).
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
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const appDir = path.resolve(here, '..');
const buildDir = path.join(appDir, 'build');

if (!fs.existsSync(buildDir)) {
	console.error('stamp-page: build/ missing — run the SvelteKit build first');
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
		console.warn(`stamp-page: ${path.relative(buildDir, file)} already carries data-page`);
	}
}
console.log(`stamp-page: ${stamped} page(s) stamped (body data-page)`);
