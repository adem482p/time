<script>
	// app/src/lib/components/SearchBox.svelte — the single omni search box.
	// Flex-row input (back/clear as siblings, never absolutely positioned over
	// the input, so every control is clickable by construction) + one sub-row
	// whose contents switch on completion.node. Viewport chrome (mobile back
	// button, mobile selected bar) is a media-query decision in omni.css;
	// `mode` (selected|editing|browse) decides which flex siblings mount.
	// No style block: styling lives in static/omni.css under .sbox*.
	let {
		query,
		completion,
		values,
		suggestions,
		statusText,
		previewText,
		selection,
		mode,
		focused,
		onQuery,
		onFocus,
		onBlur,
		onKeydown,
		onClear,
		onCompleteType,
		onEnterValue,
		onAddPredicate,
		onHoverKind,
		onBack,
		onOpenList,
		onDismiss,
		onReady
	} = $props();

	let el = $state(null);
	$effect(() => onReady?.(el));

	// Active type tab: complete `type:class`/`type:teacher` in the query wins,
	// otherwise the partial pins the matching tab (parser gating verbatim).
	const activeType = $derived.by(() => {
		const q = String(query ?? '').toLowerCase();
		if (/\btype:teacher\b/.test(q)) return 'teacher';
		if (/\btype:class\b/.test(q)) return 'class';
		const p = String(completion?.partial ?? '').toLowerCase();
		if (p && 'teacher'.startsWith(p)) return 'teacher';
		if (p && 'class'.startsWith(p)) return 'class';
		return null;
	});

	// Unified predicate options: values (inside `key:value`) and key
	// suggestions (free text) render through one button list. JS picks
	// the layout — CSS alone can't tell 1 short value from 12 long ones.
	const options = $derived.by(() => {
		if (completion?.node === 'value') {
			return (values ?? []).map((v) => ({ id: `v:${v.value}`, label: String(v.value), kind: 'value' }));
		}
		if (completion?.node === 'type') return [];
		return (suggestions ?? []).map((s) => ({ id: `k:${s.key}`, label: String(s.label), kind: 'key' }));
	});
	const layout = $derived.by(() => {
		const n = options.length;
		if (n === 0) return { mode: 'none' };
		if (n === 1) return { mode: 'row' };
		const maxLen = Math.max(...options.map((o) => o.label.length));
		const totalLen = options.reduce((a, o) => a + o.label.length, 0);
		// ~7px/char + 2×16px padding per cell; bar content width ≈ 600px.
		const est = totalLen * 7 + n * 32;
		if (est <= 600 && maxLen <= 24) return { mode: 'row' };
		return { mode: 'grid' };
	});
	const isLong = (label) => String(label).length > 16;
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
				class:previewing={!!previewText}
				type="search"
				placeholder="Search teacher, class, or subject…"
				autocomplete="off"
				value={previewText ?? query}
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
			{#if completion?.node === 'type'}
				<div class="sbox-tabs" role="tablist" aria-label="Result types">
					<button
						type="button"
						class="sbox-tab"
						class:active={activeType === 'teacher'}
						onmouseenter={() => onHoverKind('teacher')}
						onmouseleave={() => onHoverKind(null)}
						onmousedown={(e) => e.preventDefault()}
						onclick={() => onCompleteType('teacher')}
					>
						Teachers
					</button>
					<button
						type="button"
						class="sbox-tab"
						class:active={activeType === 'class'}
						onmouseenter={() => onHoverKind('class')}
						onmouseleave={() => onHoverKind(null)}
						onmousedown={(e) => e.preventDefault()}
						onclick={() => onCompleteType('class')}
					>
						Classes
					</button>
				</div>
			{:else if options.length}
				<div
					class="sbox-options"
					class:is-row={layout.mode === 'row'}
					class:is-grid={layout.mode === 'grid'}
					role={completion?.node === 'value' ? 'listbox' : 'group'}
					aria-label={completion?.node === 'value' ? 'Values' : 'Filter by'}
				>
					{#each options as o (o.id)}
						<button
							type="button"
							class="sbox-option"
							class:is-long={isLong(o.label)}
							onmouseenter={() => onHoverKind(o.kind === 'value' ? o.label : o.id.slice(2))}
							onmouseleave={() => onHoverKind(null)}
							onmousedown={(e) => e.preventDefault()}
							onclick={() => (o.kind === 'value' ? onEnterValue(o.label) : onAddPredicate(o.id.slice(2)))}
						>
							{o.label}
						</button>
					{/each}
				</div>
			{:else}
				<p class="sbox-status">{statusText}</p>
			{/if}
		</div>
	</div>
{/if}
