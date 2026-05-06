<script>
  import { FileText, FileType, File, Trash2, PanelLeftClose, PanelLeftOpen, User, Sun, Moon, Monitor } from 'lucide-svelte';
  import { getTheme, toggleTheme } from '$lib/theme.svelte.js';
  import { getModel, setModel, getModelLabel, AVAILABLE_MODELS } from '$lib/model.svelte.js';
  import { getMockMode, toggleMockMode } from '$lib/mockMode.svelte.js';
  import { getTotalCost, getTotalInputTokens, getTotalOutputTokens, formatCost } from '$lib/cost.svelte.js';

  let { collapsed = $bindable(false), sessions = [], activeId = null, sampleId = null, onswitch = () => {}, ondelete = () => {} } = $props();

  // Pin sample sessions first regardless of lastModified.
  const orderedSessions = $derived(
    sampleId
      ? [...sessions.filter(s => s.id === sampleId), ...sessions.filter(s => s.id !== sampleId)]
      : sessions
  );

  let menuOpen = $state(false);
  const theme = $derived(getTheme());
  const costLabel = $derived(formatCost(getTotalCost()));
  const costTooltip = $derived(
    `${getTotalInputTokens().toLocaleString()} in · ${getTotalOutputTokens().toLocaleString()} out`
  );

  function handleClickOutside(e) {
    if (menuOpen && !e.target.closest('.avatar-menu-container')) {
      menuOpen = false;
    }
  }

  function toggleMenu(e) {
    e.stopPropagation();
    menuOpen = !menuOpen;
  }

  function formatRelativeTime(ts) {
    const diff = Date.now() - ts;
    const minutes = Math.floor(diff / 60000);
    if (minutes < 1) return 'just now';
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    if (days < 30) return `${days}d ago`;
    return new Date(ts).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  }

  function getFileIcon(fileType) {
    if (fileType === 'pdf') return FileText;
    if (fileType === 'docx') return FileType;
    return File;
  }
</script>

<svelte:window onclick={handleClickOutside} />

<div
  class="bg-white dark:bg-gray-900 border-r border-gray-200 dark:border-gray-800 flex flex-col overflow-hidden transition-[width,min-width] duration-200 ease-in-out"
  style="width:{collapsed ? 48 : 330}px;min-width:{collapsed ? 48 : 330}px"
>
  <div class="border-b border-gray-200 dark:border-gray-800">
    <div class="flex items-center {collapsed ? 'justify-center' : 'justify-end'} p-2">
      <button
        class="flex items-center justify-center w-8 h-8 rounded-md bg-transparent text-gray-400 dark:text-gray-500 cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-800 hover:text-gray-600 dark:hover:text-gray-300 transition-colors shrink-0"
        onclick={() => collapsed = !collapsed}
        title={collapsed ? 'Expand sessions' : 'Collapse sessions'}
      >
        {#if collapsed}
          <PanelLeftOpen size={18} />
        {:else}
          <PanelLeftClose size={18} />
        {/if}
      </button>
    </div>
  </div>

  {#if collapsed}
    <div class="flex-1 overflow-y-auto flex flex-col items-center gap-1 py-1">
      <!-- svelte-ignore a11y_click_events_have_key_events -->
      <!-- svelte-ignore a11y_no_static_element_interactions -->
      {#each orderedSessions as session (session.id)}
        <div
          class="flex items-center justify-center w-8 h-8 rounded-md cursor-pointer transition-colors
            {activeId === session.id
              ? 'bg-primary-500/10 text-primary-500'
              : 'text-gray-400 dark:text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800 hover:text-gray-600 dark:hover:text-gray-300'}"
          onclick={() => onswitch(session.id)}
          title={session.name}
        >
          <svelte:component this={getFileIcon(session.fileType)} size={18} />
        </div>
      {/each}
    </div>
  {:else}
    <div class="flex-1 overflow-y-auto">
      {#if sessions.length === 0}
        <div class="px-3 py-6 text-center text-xs text-gray-400 dark:text-gray-500">
          <p>No sessions yet.</p>
          <p class="mt-1">Drop a file to start.</p>
        </div>
      {:else}
        <!-- svelte-ignore a11y_click_events_have_key_events -->
        <!-- svelte-ignore a11y_no_static_element_interactions -->
        {#each orderedSessions as session (session.id)}
          <div
            class="group w-full flex items-start gap-2.5 px-3 py-2.5 cursor-pointer text-left transition-colors border-l-2
              {activeId === session.id
                ? 'border-l-primary-500 bg-primary-500/5 dark:bg-primary-500/10'
                : 'border-l-transparent hover:bg-gray-50 dark:hover:bg-gray-800'}"
            onclick={() => onswitch(session.id)}
          >
            <div class="mt-0.5 shrink-0 {activeId === session.id ? 'text-primary-500' : 'text-gray-400 dark:text-gray-500'}">
              <svelte:component this={getFileIcon(session.fileType)} size={16} />
            </div>
            <div class="flex-1 min-w-0">
              <div class="text-sm font-medium truncate flex items-center gap-1.5 {activeId === session.id ? 'text-gray-900 dark:text-gray-100' : 'text-gray-700 dark:text-gray-300'}">
                <span class="truncate">{session.name}</span>
                {#if session.id === sampleId}
                  <span class="shrink-0 px-1.5 py-px text-[0.6rem] font-semibold uppercase tracking-wide rounded border border-gray-300 dark:border-gray-600 text-gray-400 dark:text-gray-500">Sample</span>
                {/if}
              </div>
            </div>
            {#if session.id !== sampleId}
              <button
                class="shrink-0 mt-0.5 p-0.5 rounded opacity-0 group-hover:opacity-100 text-gray-400 hover:text-red-500 bg-transparent border-none cursor-pointer transition-all"
                onclick={(e) => { e.stopPropagation(); ondelete(session.id); }}
                title="Delete session"
              >
                <Trash2 size={13} />
              </button>
            {/if}
          </div>
        {/each}
      {/if}
    </div>
  {/if}

  <!-- Footer -->
  <div class="border-t border-gray-200 dark:border-gray-800 shrink-0 {collapsed ? 'px-1.5' : 'px-3'} py-1.5">
    {#if collapsed}
      <div class="avatar-menu-container relative flex justify-center">
        <button
          onclick={toggleMenu}
          class="flex items-center justify-center w-8 h-8 rounded-full bg-primary-500/10 hover:bg-primary-500/20 text-primary-600 dark:text-primary-400 cursor-pointer border-none transition-colors"
          title="Settings"
        >
          <User size={18} />
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
    {:else}
      <div class="flex items-center justify-between">
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

        <div class="text-xs text-gray-400 dark:text-gray-500 flex items-center gap-2">
          <span class="flex items-center gap-1.5">
            <Monitor size={12} />
            <span>{getModelLabel()}</span>
          </span>
          <span class="tabular-nums" title={costTooltip}>{costLabel}</span>
        </div>
      </div>
    {/if}
  </div>
</div>
