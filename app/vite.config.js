// vite.config.js — Vite wiring for SvelteKit. No plugins beyond the adapter's.
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';

export default defineConfig({
	plugins: [sveltekit()]
});
