<script>
	// app/src/lib/components/SearchBox.svelte — completion engine removed.
	// Input row retained; completion sub-row replaced with "Coming soon".
	let {
		query = '',
		mode = 'browse',
		focused = false,
		statusText = '',
		selection = null,
		onQuery = () => {},
		onFocus = () => {},
		onBlur = () => {},
		onKeydown = () => {},
		onClear = () => {},
		onDismiss = () => {},
		onBack = () => {},
		onOpenList = () => {},
		onReady = () => {}
	} = $props();

	let el = $state(null);
	$effect(() => onReady?.(el));
</script>

{#if mode === 'selected'}
	<div class="sbox sbox-selected" data-mode="selected">
		<button type="button" class="sbox-selected-arrow" aria-label="Back" onclick={onBack}>
			<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M19 12h-14M12 6l-7 6 7 6" /></svg>
		</button>
		<button type="button" class="sbox-selected-x" aria-label="Clear selection" onclick={onBack}>
			<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg>
		</button>
		<button type="button" class="sbox-selected-name" onclick={onOpenList}>
			<span class="sbox-selected-text">{selection?.name}</span>
		</button>
		<button type="button" class="sbox-selected-drop-btn" aria-label="Open list" onclick={onOpenList}>
			<svg class="sbox-selected-drop" viewBox="0 0 24 24" aria-hidden="true"><path d="M6 9l6 6 6-6" /></svg>
		</button>
	</div>
{:else}
	<div class="sbox sbox-editor" data-mode={mode} data-focused={focused ? 'true' : 'false'}>
		<div class="sbox-row">
			{#if mode === 'editing'}
				<button type="button" class="sbox-back" aria-label="Back" onclick={onDismiss}>
					<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 6l-6 6 6 6" /></svg>
				</button>
			{/if}
			<input
				bind:this={el}
				class="sbox-input"
				type="search"
				placeholder="Search teacher, class, or subject…"
				autocomplete="off"
				value={query}
				oninput={(e) => onQuery(e.currentTarget.value)}
				onkeydown={onKeydown}
				onfocus={onFocus}
				onclick={onFocus}
				onblur={(e) => onBlur?.(e)}
			/>
			{#if query}
				<button
					type="button"
					class="sbox-clear"
					aria-label="Clear the search"
					onmousedown={(e) => e.preventDefault()}
					onclick={onClear}
				>
					<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg>
				</button>
			{/if}
		</div>

		<div class="sbox-sub">
			<p class="sbox-status">Coming soon</p>
		</div>
	</div>
{/if}
