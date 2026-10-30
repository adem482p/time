<script>
	// app/src/routes/+layout.svelte — the document shell. The stylesheet is
	// linked in app.html (static/app.css, the single visual definition of the
	// vocabulary, exactly like the old styles.css); the theme engine reuses the
	// same custom property vocabulary.
	import { onMount } from 'svelte';
	import { init as initTheme } from '$lib/theme.js';

	// the route content ({@render children()} below)
	let { children } = $props();

	onMount(() => {
		// issue 066: the pre-paint replay lives inline in app.html; this call
		// then wires the #themeCycle button, restores state and applies the
		// stored (or default) theme. Idempotent.
		initTheme();
	});
</script>

{@render children()}
