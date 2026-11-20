<script>
	// app/src/routes/+layout.svelte — the document shell. app.css carries the
	// shared vocabulary and legacy-page layout; the omni page is self-contained
	// in omni.css and does not depend on app.css.
	import { onMount } from 'svelte';
	import { page } from '$app/state';
	import { init as initTheme } from '$lib/theme.js';

	const routeId = $derived(page.route.id ?? '/');
	const needsAppCss = $derived(
		!routeId.includes('omni') && routeId !== '/'
	);

	// the route content ({@render children()} below)
	let { children } = $props();

	// data-page attribute for CSS scoping (required by app.css). No component
	// owns the <body> element (app.html does — a nested <body> renders fine in
	// SSR but Svelte cannot carry it client-side: the parser strips <body> out
	// of a template's contents and <svelte:body> takes no attributes), so the
	// attribute is maintained at runtime, off the current route, for hydration
	// and any client-side navigation. Prerendered HTML won't carry
	// body[data-page] until hydration (same as before, no regression).
	const pageName = $derived(routeId.split('/').filter(Boolean)[0] || 'omni');

	$effect(() => {
		document.body.setAttribute('data-page', pageName);
	});

	onMount(() => {
		// issue 066: the pre-paint replay lives inline in app.html; this call
		// then wires the #themeCycle button, restores state and applies the
		// stored (or default) theme. Idempotent.
		initTheme();
	});
</script>

<svelte:head>
	{#if needsAppCss}
		<link rel="stylesheet" href="../app.css" />
	{/if}
</svelte:head>

{@render children()}
