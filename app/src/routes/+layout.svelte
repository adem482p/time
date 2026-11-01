<script>
	// app/src/routes/+layout.svelte — the document shell. The stylesheet is
	// linked in app.html (static/app.css, the single visual definition of the
	// vocabulary, exactly like the old styles.css); the theme engine reuses the
	// same custom property vocabulary.
	import { onMount } from 'svelte';
	import { page } from '$app/state';
	import { init as initTheme } from '$lib/theme.js';

	// the route content ({@render children()} below)
	let { children } = $props();

	// data-page attribute for CSS scoping (required by app.css). No component
	// owns the <body> element (app.html does — a nested <body> renders fine in
	// SSR but Svelte cannot carry it client-side: the parser strips <body> out
	// of a template's contents and <svelte:body> takes no attributes), so the
	// attribute is maintained two ways:
	//   - at prerender time the postbuild stamp writes it into every built
	//     index.html (scripts/stamp-page.mjs) — the static pages are the site;
	//   - here at runtime, off the current route, for hydration and any
	//     client-side navigation. Same rule on both sides: first path
	//     segment, teachers at the root.
	const pageName = page.url.pathname.split('/').filter(Boolean)[0] || 'teachers';

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

{@render children()}
