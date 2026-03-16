<script>
	import '../app.css';
	import { Sun, Moon, User, Monitor } from 'lucide-svelte';
	import { getTheme, setTheme, toggleTheme } from '$lib/theme.svelte.js';
	import { getModel, setModel, getModelLabel, AVAILABLE_MODELS } from '$lib/model.svelte.js';
	import { getMockMode, toggleMockMode } from '$lib/mockMode.svelte.js';
	import { onMount } from 'svelte';

	let { children } = $props();
	let menuOpen = $state(false);

	onMount(() => {
		setTheme(getTheme());
	});

	function handleClickOutside(e) {
		if (menuOpen && !e.target.closest('.avatar-menu-container')) {
			menuOpen = false;
		}
	}

	function toggleMenu(e) {
		e.stopPropagation();
		menuOpen = !menuOpen;
	}

	const theme = $derived(getTheme());
</script>

<svelte:window onclick={handleClickOutside} />

<div class="flex flex-col h-screen bg-gray-50 dark:bg-gray-950 text-gray-900 dark:text-gray-100">
	<!-- Main content -->
	<div class="flex-1 min-h-0">
		{@render children()}
	</div>

	<!-- Footer -->
	<footer class="flex items-center justify-between px-3 py-1.5 bg-white dark:bg-gray-900 border-t border-gray-200 dark:border-gray-800 shrink-0">
		<div class="avatar-menu-container relative">
			<button
				onclick={toggleMenu}
				class="flex items-center justify-center w-8 h-8 rounded-full bg-primary-500/10 hover:bg-primary-500/20 text-primary-600 dark:text-primary-400 cursor-pointer border-none transition-colors"
				title="Settings"
			>
				<User size={16} />
			</button>

			{#if menuOpen}
				<!-- svelte-ignore a11y_click_events_have_key_events -->
				<!-- svelte-ignore a11y_no_static_element_interactions -->
				<div class="absolute bottom-full left-0 mb-2 w-56 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-xl overflow-hidden z-50" onclick={(e) => e.stopPropagation()}>
					<!-- Model selection -->
					<div class="px-3 pt-3 pb-2">
						<div class="text-[0.6rem] font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500 mb-1.5">Model</div>
						{#each AVAILABLE_MODELS as model}
							<button
								class="w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-sm text-left cursor-pointer border-none transition-colors
									{getModel() === model.id
										? 'bg-primary-500/10 text-primary-600 dark:text-primary-400 font-medium'
										: 'bg-transparent text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'}"
								onclick={() => setModel(model.id)}
							>
								<span class="w-1.5 h-1.5 rounded-full {getModel() === model.id ? 'bg-primary-500' : 'bg-transparent'}"></span>
								{model.label}
							</button>
						{/each}
					</div>

					<div class="border-t border-gray-100 dark:border-gray-700"></div>

					<!-- Theme toggle -->
					<button
						class="w-full flex items-center gap-2.5 px-3 py-2.5 text-sm text-gray-700 dark:text-gray-300 bg-transparent border-none cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors text-left"
						onclick={toggleTheme}
					>
						{#if theme === 'dark'}
							<Sun size={14} />
							<span>Light mode</span>
						{:else}
							<Moon size={14} />
							<span>Dark mode</span>
						{/if}
					</button>

					<div class="border-t border-gray-100 dark:border-gray-700"></div>

					<!-- Mock API toggle -->
					<button
						class="w-full flex items-center justify-between px-3 py-2.5 text-sm text-gray-700 dark:text-gray-300 bg-transparent border-none cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors text-left"
						onclick={toggleMockMode}
					>
						<span>Mock API</span>
						<span
							class="relative inline-flex h-5 w-9 items-center rounded-full transition-colors {getMockMode() ? 'bg-primary-500' : 'bg-gray-300 dark:bg-gray-600'}"
						>
							<span
								class="inline-block h-3.5 w-3.5 rounded-full bg-white transition-transform {getMockMode() ? 'translate-x-4.5' : 'translate-x-0.5'}"
							></span>
						</span>
					</button>
				</div>
			{/if}
		</div>

		<div class="text-xs text-gray-400 dark:text-gray-500 flex items-center gap-1.5">
			<Monitor size={12} />
			<span>{getModelLabel()}</span>
		</div>
	</footer>
</div>
