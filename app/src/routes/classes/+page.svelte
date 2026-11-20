<script>
	import { base } from '$lib/base.js';
	import { onMount } from 'svelte';

	async function clearLegacyData() {
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

	onMount(async () => {
		await clearLegacyData();
		location.replace(base + '/' + location.search + location.hash);
	});
</script>

<svelte:head>
	<title>Time — ISIM Mahdia Timetable</title>
	<meta http-equiv="refresh" content="0; url=../" />
</svelte:head>
