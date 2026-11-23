<script>
	// app/src/lib/components/Redirect.svelte — legacy-route stub: wipe any
	// legacy client data and bounce to the canonical app URL. Shared by the
	// /omni/ and /classes/ redirect stubs so the bounce logic exists once.
	import { base } from '$lib/base.js';
	import { clearLegacyData } from '$lib/clear-legacy.js';
	import { onMount } from 'svelte';

	onMount(async () => {
		await clearLegacyData();
		location.replace(base + '/' + location.search + location.hash);
	});
</script>

<svelte:head>
	<title>Time — ISIM Mahdia Timetable</title>
	<meta http-equiv="refresh" content="0; url=../" />
</svelte:head>
