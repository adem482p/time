# 086: Fix accessibility warnings from Svelte compiler

Status: Open
Date: 2026-11-02
Reporter: coordinator

## Description

The Vite/Svelte build emits 6 accessibility warnings (pre-existing, unrelated to the search refactor in #085). Each is a non-interactive element (`<li>` or `<div>`) with click/mousedown handlers that must become keyboard-accessible.

## Repro steps

```
cd app && npm run build
```

Observe the six warnings from `vite-plugin-svelte` (a11y_click_events_have_key_events, a11y_no_noninteractive_element_interactions).

## Root cause

Interactive elements implemented as `<li onclick>` or `<div onclick>` without keyboard support or ARIA roles. Svelte's accessibility plugin flags these.

## Fix plan

Replace each with `<button type="button">` preserving classes, handlers, and adding `aria-label` where needed:

| File | Line | Current | Fix |
|------|------|---------|-----|
| `at/+page.svelte` | 137 | `<li onclick={show}>` | `<button type="button">` |
| `classes/+page.svelte` | 564 | `<div onclick={openMenu}>` | `<button type="button" aria-label="Open class menu">` |
| `classes/+page.svelte` | 605 | `<li onclick={selectClass}>` | `<button type="button">` |
| `teachers/+page.svelte` | 534 | `<div onclick={openMenu}>` | `<button type="button" aria-label="Open teacher menu">` |
| `teachers/+page.svelte` | 556 | `<li onmousedown={acceptSuggest}>` | `<button type="button">` |
| `teachers/+page.svelte` | 577 | `<li onclick={selectTeacher}>` | `<button type="button">` |

No logic changes — purely mechanical replacement. Each button keeps existing `class`, `onclick`, `data-*` attributes.

## Acceptance criteria

1. `npm run build` → 0 accessibility warnings
2. Visual behavior unchanged (buttons styled same as `<li>`/`<div>` via existing CSS)
3. Keyboard navigation works: Tab to focus, Enter/Space to activate
4. All existing tests pass (`node --test test/*.test.js`)

## Discussion

### Maintainer triage (2026-11-02)

Straightforward mechanical fix. Each replacement is a 1:1 swap with preserved behavior. No architectural decisions needed.