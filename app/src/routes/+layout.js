// app/src/routes/+layout.js — the whole site is a static build: every route
// prerenders, and each directory route emits a real index.html (the adapter
// and the service workers both assume the directory-per-app shape).
export const prerender = true;
export const trailingSlash = 'always';
export const ssr = true;
