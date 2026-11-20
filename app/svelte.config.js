// svelte.config.js — static-site build config. adapter-static emits one
// index.html per route directory (trailingSlash is set per-layout), so the
// built tree keeps the original directory-per-app shape (/, /teachers/,
// /classes/, /at/, /all/). Location-agnostic: base is detected at runtime
// (see $lib/base.js), so a single build works at /time, /time/dev, or root
// (local dev). relative: true makes SvelteKit's own asset references
// portable (depth-aware) too.
import adapter from '@sveltejs/adapter-static';

/** @type {import('@sveltejs/kit').Config} */
const config = {
	kit: {
		alias: {
			'$domain': '../domain-model'
		},
		adapter: adapter({
			pages: 'build',
			assets: 'build',
			strict: true
		}),
		paths: {
			base: '',
			relative: true
		}
	}
};

export default config;
