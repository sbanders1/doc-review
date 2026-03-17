<script>
	import '../app.css';
	import { getTheme, setTheme } from '$lib/theme.svelte.js';
	import { onMount } from 'svelte';

	let { children } = $props();

	onMount(() => {
		setTheme(getTheme());
	});
</script>

<div class="flex flex-col h-screen bg-gray-50 dark:bg-gray-950 text-gray-900 dark:text-gray-100">
	<!-- Main content -->
	<div class="flex-1 min-h-0">
		{@render children()}
	</div>
</div>
