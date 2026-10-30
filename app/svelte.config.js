// svelte.config.js — static-site build config. adapter-static emits one
// index.html per route directory (trailingSlash is set per-layout), so the
// built tree keeps the original directory-per-app shape (/, /teachers/,
// /classes/, /at/, /all/). The build target base can be set for a subdirectory
// deployment (e.g. PUBLIC_BASE=/time for GitHub Pages); it stays '' for local
// work, which serves the site from its own root like the old static tree.
import adapter from '@sveltejs/adapter-static';

/** @type {import('@sveltejs/kit').Config} */
const config = {
	kit: {
		adapter: adapter({
			pages: 'build',
			assets: 'build',
			strict: true
		}),
		paths: {
			base: process.env.PUBLIC_BASE || ''
		}
	}
};

export default config;
