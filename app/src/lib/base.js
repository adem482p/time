// app/src/lib/base.js — runtime detection of the app's base path, so a single
// build works at any of the supported deployment locations (/time, /time/dev)
// without a per-build PUBLIC_BASE env var.
//
// Fail fast: only /time and /time/dev are supported deployment locations.
// An unexpected path (e.g. a typo'd or stale deployment) throws instead of
// silently serving a broken page.

const KNOWN_BASES = ['/time/dev', '/time']; // longest first

export function detectBase() {
	if (typeof window === 'undefined') return ''; // SSR / prerender
	const p = window.location.pathname;
	for (const b of KNOWN_BASES) {
		if (p === b || p.startsWith(b + '/')) return b;
	}
	if (p.startsWith('/time')) {
		throw new Error(
			`[base] Unexpected path "${p}". Supported deployment paths: ${KNOWN_BASES.join(', ')}.`
		);
	}
	// Root: the Vite dev server is served at its own origin with no path
	// prefix (http://localhost:5173/), so the base is ''. This is the local-dev
	// fallback only — production deployments always match a KNOWN_BASES entry
	// above or throw.
	return '';
}

export const base = detectBase();
