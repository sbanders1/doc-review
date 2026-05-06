<script>
  import { ChevronDown, FileText, FileType, File, Upload, Trash2, User, Sun, Moon, Monitor } from 'lucide-svelte';
  import { getTheme, toggleTheme } from '$lib/theme.svelte.js';
  import { getModel, setModel, getModelLabel, AVAILABLE_MODELS } from '$lib/model.svelte.js';
  import { getMockMode, toggleMockMode } from '$lib/mockMode.svelte.js';
  import { getTotalCost, getTotalInputTokens, getTotalOutputTokens, formatCost } from '$lib/cost.svelte.js';

  let {
    sessions = [],
    activeId = null,
    sampleId = null,
    onswitch = () => {},
    ondelete = () => {},
    oncreate = () => {},
  } = $props();

  let sessionMenuOpen = $state(false);
  let userMenuOpen = $state(false);

  const orderedSessions = $derived(
    sampleId
      ? [...sessions.filter((s) => s.id === sampleId), ...sessions.filter((s) => s.id !== sampleId)]
      : sessions,
  );
  const activeSession = $derived(sessions.find((s) => s.id === activeId));
  const activeName = $derived(activeSession?.name ?? 'No document loaded');
  const activeFileType = $derived(activeSession?.fileType);

  const theme = $derived(getTheme());
  const costLabel = $derived(formatCost(getTotalCost()));
  const costTooltip = $derived(
    `${getTotalInputTokens().toLocaleString()} in · ${getTotalOutputTokens().toLocaleString()} out`,
  );

  function handleClickOutside(e) {
    if (sessionMenuOpen && !e.target.closest('.session-menu-container')) sessionMenuOpen = false;
    if (userMenuOpen && !e.target.closest('.user-menu-container')) userMenuOpen = false;
  }

  function getFileIcon(t) {
    if (t === 'pdf') return FileText;
    if (t === 'docx') return FileType;
    return File;
  }

  function pickSession(id) {
    sessionMenuOpen = false;
    onswitch(id);
  }

  function handleNewDoc() {
    sessionMenuOpen = false;
    oncreate();
  }

  function handleDelete(e, id) {
    e.stopPropagation();
    ondelete(id);
  }
</script>

<svelte:window onclick={handleClickOutside} />

<div class="flex items-center px-3 py-2 border-b border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 shrink-0 gap-3">
  <span class="text-lg tracking-tight font-semibold text-gray-800 dark:text-gray-100 whitespace-nowrap pl-1 shrink-0">CheckMate</span>

  <!-- svelte-ignore a11y_click_events_have_key_events -->
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div class="session-menu-container relative shrink-0 min-w-0" onclick={(e) => e.stopPropagation()}>
    <button
      class="flex items-center gap-2 px-2.5 py-1.5 rounded-md bg-gray-50 dark:bg-gray-800 hover:bg-gray-100 dark:hover:bg-gray-700 border border-gray-200 dark:border-gray-700 text-sm text-gray-700 dark:text-gray-200 cursor-pointer transition-colors max-w-[420px]"
      onclick={() => (sessionMenuOpen = !sessionMenuOpen)}
      title="Switch document"
    >
      {#if activeSession}
        <svelte:component this={getFileIcon(activeFileType)} size={14} class="text-gray-400 shrink-0" />
      {/if}
      <span class="truncate">{activeName}</span>
      <ChevronDown size={14} class="text-gray-400 shrink-0" />
    </button>

    {#if sessionMenuOpen}
      <div class="absolute top-full left-0 mt-1 w-[360px] bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-xl overflow-hidden z-50">
        <div class="max-h-[400px] overflow-y-auto">
          {#if orderedSessions.length === 0}
            <div class="px-3 py-6 text-center text-xs text-gray-400 dark:text-gray-500">
              No documents yet.
            </div>
          {:else}
            {#each orderedSessions as session (session.id)}
              {@const Icon = getFileIcon(session.fileType)}
              {@const isActive = activeId === session.id}
              <!-- svelte-ignore a11y_click_events_have_key_events -->
              <!-- svelte-ignore a11y_no_static_element_interactions -->
              <div
                class="group w-full flex items-center gap-2 px-3 py-2 cursor-pointer transition-colors border-l-2 {isActive ? 'bg-primary-500/5 border-l-primary-500' : 'border-l-transparent hover:bg-gray-50 dark:hover:bg-gray-700/50'}"
                onclick={() => pickSession(session.id)}
              >
                <Icon size={14} class="shrink-0 {isActive ? 'text-primary-500' : 'text-gray-400'}" />
                <span class="flex-1 min-w-0 text-sm truncate {isActive ? 'text-gray-900 dark:text-gray-100 font-medium' : 'text-gray-700 dark:text-gray-300'}">{session.name}</span>
                {#if session.id === sampleId}
                  <span class="shrink-0 px-1.5 py-px text-[0.6rem] font-semibold uppercase tracking-wide rounded border border-gray-300 dark:border-gray-600 text-gray-400 dark:text-gray-500">Sample</span>
                {:else}
                  <button
                    class="shrink-0 p-0.5 rounded opacity-0 group-hover:opacity-100 text-gray-400 hover:text-red-500 bg-transparent border-none cursor-pointer transition-all"
                    onclick={(e) => handleDelete(e, session.id)}
                    title="Delete session"
                  >
                    <Trash2 size={13} />
                  </button>
                {/if}
              </div>
            {/each}
          {/if}
        </div>
        <div class="border-t border-gray-100 dark:border-gray-700"></div>
        <button
          class="w-full flex items-center gap-2 px-3 py-2.5 text-sm text-primary-600 dark:text-primary-400 bg-transparent border-none cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors text-left"
          onclick={handleNewDoc}
        >
          <Upload size={14} />
          <span>Upload new document</span>
        </button>
      </div>
    {/if}
  </div>

  <div class="ml-auto flex items-center gap-3 shrink-0">
    <div class="text-xs text-gray-400 dark:text-gray-500 flex items-center gap-2">
      <span class="flex items-center gap-1.5">
        <Monitor size={12} />
        <span>{getModelLabel()}</span>
      </span>
      <span class="tabular-nums" title={costTooltip}>{costLabel}</span>
    </div>

    <!-- svelte-ignore a11y_click_events_have_key_events -->
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div class="user-menu-container relative" onclick={(e) => e.stopPropagation()}>
      <button
        onclick={() => (userMenuOpen = !userMenuOpen)}
        class="flex items-center justify-center w-8 h-8 rounded-full bg-primary-500/10 hover:bg-primary-500/20 text-primary-600 dark:text-primary-400 cursor-pointer border-none transition-colors"
        title="Settings"
      >
        <User size={16} />
      </button>

      {#if userMenuOpen}
        <div class="absolute top-full right-0 mt-1 w-56 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-xl overflow-hidden z-50">
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
  </div>
</div>
