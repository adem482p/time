<script>
	// app/src/routes/+page.svelte — the root does nothing but hand over to the
	// teachers app (issue 073). The meta refresh covers no-JS; the script for
	// everyone else forwards the ?redact=1 query and any hash (README captures
	// rely on it).
	//
	// ssr=true prerenders this page; the redirect itself only runs in the
	// browser, so guard it.
	import { onMount } from 'svelte';

	onMount(() => {
		location.replace('teachers/' + location.search + location.hash);
	});
</script>

<svelte:head>
	<title>Time — ISIM Mahdia Timetable</title>
	<meta http-equiv="refresh" content="0; url=teachers/" />
</svelte:head>
