<script>
	import { base } from '$app/paths';
	import { onMount } from 'svelte';

	onMount(() => {
		location.replace(base + '/' + location.search + location.hash);
	});
</script>

<svelte:head>
	<title>Time — ISIM Mahdia Timetable</title>
	<meta http-equiv="refresh" content="0; url=../" />
</svelte:head>
