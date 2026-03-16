<script>
  import { FileText, FileType, File, Plus, Trash2, PanelLeftClose, PanelLeftOpen, FileSearch } from 'lucide-svelte';

  let { collapsed = $bindable(false), sessions = [], activeId = null, onswitch = () => {}, ondelete = () => {}, oncreate = () => {} } = $props();

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

<div
  class="bg-white dark:bg-gray-900 border-r border-gray-200 dark:border-gray-800 flex flex-col overflow-hidden transition-[width,min-width] duration-200 ease-in-out"
  style="width:{collapsed ? 48 : 220}px;min-width:{collapsed ? 48 : 220}px"
>
  {#if collapsed}
    <div class="flex flex-col items-center py-2.5 gap-1.5 border-b border-gray-200 dark:border-gray-800">
      <div class="flex items-center justify-center w-7 h-7 rounded-md bg-primary-500 text-white">
        <FileSearch size={14} />
      </div>
      <button
        class="flex items-center justify-center w-8 h-8 rounded-md bg-transparent border-none text-gray-400 dark:text-gray-500 cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-800 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
        onclick={() => collapsed = false}
        title="Expand sessions"
      >
        <PanelLeftOpen size={18} />
      </button>
    </div>
    <div class="flex flex-col items-center py-2 gap-1">
      <button
        class="flex items-center justify-center w-8 h-8 rounded-md bg-primary-500 hover:bg-primary-600 text-white cursor-pointer border-none transition-colors"
        onclick={oncreate}
        title="New session"
      >
        <Plus size={16} />
      </button>
    </div>
    <div class="flex-1 overflow-y-auto flex flex-col items-center gap-1 py-1">
      <!-- svelte-ignore a11y_click_events_have_key_events -->
      <!-- svelte-ignore a11y_no_static_element_interactions -->
      {#each sessions as session (session.id)}
        <div
          class="flex items-center justify-center w-8 h-8 rounded-md cursor-pointer transition-colors
            {activeId === session.id
              ? 'bg-primary-500/10 text-primary-500'
              : 'text-gray-400 dark:text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800 hover:text-gray-600 dark:hover:text-gray-300'}"
          onclick={() => onswitch(session.id)}
          title={session.name}
        >
          <svelte:component this={getFileIcon(session.fileType)} size={16} />
        </div>
      {/each}
    </div>
  {:else}
    <div class="flex items-center justify-between px-3 py-2.5 border-b border-gray-200 dark:border-gray-800">
      <div class="flex items-center gap-1.5">
        <div class="flex items-center justify-center w-6 h-6 rounded-md bg-primary-500 text-white">
          <FileSearch size={13} />
        </div>
        <span class="font-semibold text-sm tracking-tight">CheckMate</span>
      </div>
      <div class="flex items-center gap-1.5">
        <button
          class="flex items-center justify-center w-6 h-6 rounded-md bg-primary-500 hover:bg-primary-600 text-white cursor-pointer border-none transition-colors"
          onclick={oncreate}
          title="New session"
        >
          <Plus size={14} />
        </button>
        <button
          class="flex items-center justify-center w-6 h-6 rounded-md border border-gray-200 dark:border-gray-600 bg-transparent text-gray-400 dark:text-gray-500 cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-800 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
          onclick={() => collapsed = true}
          title="Collapse sessions"
        >
          <PanelLeftClose size={14} />
        </button>
      </div>
    </div>

    <div class="flex-1 overflow-y-auto">
      {#if sessions.length === 0}
        <div class="px-3 py-6 text-center text-xs text-gray-400 dark:text-gray-500">
          <p>No sessions yet.</p>
          <p class="mt-1">Drop a file to start.</p>
        </div>
      {:else}
        <!-- svelte-ignore a11y_click_events_have_key_events -->
        <!-- svelte-ignore a11y_no_static_element_interactions -->
        {#each sessions as session (session.id)}
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
              <div class="text-sm font-medium truncate {activeId === session.id ? 'text-gray-900 dark:text-gray-100' : 'text-gray-700 dark:text-gray-300'}">
                {session.name}
              </div>
              <div class="text-[0.65rem] text-gray-400 dark:text-gray-500 mt-0.5">
                {formatRelativeTime(session.lastModified)}
              </div>
            </div>
            <button
              class="shrink-0 mt-0.5 p-0.5 rounded opacity-0 group-hover:opacity-100 text-gray-400 hover:text-red-500 bg-transparent border-none cursor-pointer transition-all"
              onclick={(e) => { e.stopPropagation(); ondelete(session.id); }}
              title="Delete session"
            >
              <Trash2 size={13} />
            </button>
          </div>
        {/each}
      {/if}
    </div>
  {/if}
</div>
