// app/src/lib/clear-legacy.js — shared boot helper: wipe legacy client-side
// storage/caches so old deployments don't leak into the new app.
export async function clearLegacyData() {
	if (typeof window === 'undefined') return;
	try { localStorage.clear(); } catch (e) {}
	try { sessionStorage.clear(); } catch (e) {}
	try {
		if ('caches' in window) {
			const keys = await caches.keys();
			await Promise.all(keys.map((k) => caches.delete(k)));
		}
	} catch (e) {}
	try {
		if ('serviceWorker' in navigator) {
			const regs = await navigator.serviceWorker.getRegistrations();
			await Promise.all(regs.map((r) => r.unregister()));
		}
	} catch (e) {}
	try {
		if (indexedDB && indexedDB.databases) {
			const dbs = await indexedDB.databases();
			await Promise.all(
				dbs
					.filter((d) => d && d.name)
					.map(
						(d) =>
							new Promise((resolve) => {
								const req = indexedDB.deleteDatabase(d.name);
								req.onsuccess = req.onerror = req.onblocked = () => resolve();
							})
					)
			);
		}
	} catch (e) {}
}
