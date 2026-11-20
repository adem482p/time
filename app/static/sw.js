// static/sw.js — service worker for the omni timetable app.
// Location-agnostic: BASE is derived from this script's own URL, so the same
// file works at /time, /time/dev, or any supported deployment path.
// Installable PWA: cache-first for immutable assets, network-first for time.csv.

const BASE = new URL('.', self.location).pathname.replace(/\/$/, '');
if (!BASE.endsWith('/time') && !BASE.endsWith('/time/dev') && BASE !== '') {
	throw new Error(`[sw] Unexpected base path "${BASE}".`);
}
const CACHE_NAME = 'time-omni' + (BASE.replace(/\//g, '-') || '-root') + '-v1';
const IMMUTABLE_CACHE = 'time-omni-immutable' + (BASE.replace(/\//g, '-') || '-root') + '-v1';

// Assets to cache on install (app shell)
const PRECACHE_ASSETS = [
	BASE + '/',
	BASE + '/app.css',
	BASE + '/omni.css',
	BASE + '/time.csv',
	BASE + '/manifest.json'
];

// Patterns for cache-first (immutable, hashed filenames)
const IMMUTABLE_PATTERNS = [
	/_app\/immutable\//,
	/\/vendor\//,
	/\/assets\//
];

// Install: precache the app shell
self.addEventListener('install', (event) => {
	event.waitUntil(
		caches.open(CACHE_NAME).then((cache) => cache.addAll(PRECACHE_ASSETS))
	);
	self.skipWaiting();
});

// Activate: clean old caches
self.addEventListener('activate', (event) => {
	event.waitUntil(
		caches.keys().then((keys) => {
			return Promise.all(
				keys.filter((k) => k !== CACHE_NAME && k !== IMMUTABLE_CACHE).map((k) => caches.delete(k))
			);
		})
	);
	self.clients.claim();
});

// Fetch: cache-first for immutable, network-first for time.csv, fallback to cache
self.addEventListener('fetch', (event) => {
	const url = new URL(event.request.url);

	// Only handle same-origin requests
	if (url.origin !== location.origin) return;

	const pathname = url.pathname;

	// Cache-first for immutable assets (hashed filenames)
	if (IMMUTABLE_PATTERNS.some((p) => p.test(pathname))) {
		event.respondWith(
			caches.open(IMMUTABLE_CACHE).then(async (cache) => {
				const cached = await cache.match(event.request);
				if (cached) return cached;
				const response = await fetch(event.request);
				if (response.ok) cache.put(event.request, response.clone());
				return response;
			})
		);
		return;
	}

	// Network-first for time.csv (always check for updates)
	if (pathname === BASE + '/time.csv') {
		event.respondWith(
			fetch(event.request)
				.then((response) => {
					if (response.ok) {
						const clone = response.clone();
						caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
					}
					return response;
				})
				.catch(() => caches.match(event.request))
		);
		return;
	}

	// For everything else (app shell, index.html): stale-while-revalidate
	event.respondWith(
		caches.open(CACHE_NAME).then(async (cache) => {
			const cached = await cache.match(event.request);
			const fetchPromise = fetch(event.request)
				.then((response) => {
					if (response.ok) cache.put(event.request, response.clone());
					return response;
				})
				.catch(() => cached);
			return cached || fetchPromise;
		})
	);
});

// Optional: skip waiting on message from client
self.addEventListener('message', (event) => {
	if (event.data === 'skipWaiting') self.skipWaiting();
});
