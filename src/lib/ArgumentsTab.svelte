<script>
  import {
    Network,
    RefreshCw,
    AlertCircle,
    Loader2,
    ChevronRight,
    ChevronDown,
    X,
    Plus,
    FileText,
    GitBranch,
    Hash,
    Layers,
    Trash2,
    WrapText,
  } from 'lucide-svelte';
  import {
    getArgumentTree,
    getArgumentStatus,
    getArgumentError,
    getLastAnalyzedAt,
    getMutationVersion,
    getProgressMessage,
    setArgumentLoading,
    setArgumentResult,
    setArgumentError,
    clearArgumentTree,
    moveNode,
    deleteNode,
    insertTransition,
    getNodeById,
    getParentOf,
    applyTreeChangesToDocument,
  } from './argumentTree.svelte.js';
  import { analyzeArgumentStructure, ARGUMENT_PROMPT_USER } from './arguments.js';
  import { getExtractedText, getMarkdownSource } from './documentContext.svelte.js';
  import { getModel } from './model.svelte.js';
  import { SvelteSet } from 'svelte/reactivity';
  import {
    getActiveCritiqueId,
    getHighlightedNodeIdsForActiveCritique,
    clearCritiques,
  } from './critiques.svelte.js';
  import { tick } from 'svelte';

  let { onfactselect = () => {} } = $props();

  const collapsed = new SvelteSet();

  // Prompt confirmation modal state
  let showPromptModal = $state(false);
  let promptPreview = $state('');

  const WRAP_STORAGE_KEY = 'arguments_tab_wrap_text';
  let wrapText = $state(localStorage.getItem(WRAP_STORAGE_KEY) === '1');
  function toggleWrap() {
    wrapText = !wrapText;
    localStorage.setItem(WRAP_STORAGE_KEY, wrapText ? '1' : '0');
  }

  // Drag state
  let dragNodeId = $state(null);
  let dropTargetId = $state(null);
  let dropKind = $state(null); // 'before' | 'after' | 'inside'
  let dropValid = $state(false);

  const tree = $derived(getArgumentTree());
  const status = $derived(getArgumentStatus());
  const error = $derived(getArgumentError());
  const analyzedAt = $derived(getLastAnalyzedAt());
  const progressMessage = $derived(getProgressMessage());
  // Touch mutationVersion so the flat list re-derives after structural mutations.
  const mutationVersion = $derived(getMutationVersion());
  const isMarkdown = $derived(getMarkdownSource() != null);

  const activeCritiqueId = $derived(getActiveCritiqueId());
  const highlightedNodeIds = $derived.by(() => {
    void activeCritiqueId;
    return getHighlightedNodeIdsForActiveCritique();
  });

  // Container ref for auto-scrolling the first highlighted row into view
  // when the active critique changes.
  let listEl = $state(null);
  let lastScrolledForCritiqueId = null;
  $effect(() => {
    const id = activeCritiqueId;
    if (!id || id === lastScrolledForCritiqueId) return;
    if (highlightedNodeIds.size === 0) return;
    lastScrolledForCritiqueId = id;
    tick().then(() => {
      const container = listEl;
      if (!container) return;
      const target = container.querySelector('[data-arg-row-highlighted="true"]');
      if (target && typeof target.scrollIntoView === 'function') {
        target.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    });
  });

  // Flatten the visible tree into a sequence of items: rows plus insert-gap markers
  // interleaved correctly. Each gap has { kind: 'gap', parentId, beforeSiblingId, depth }
  // and represents a place where a new transition can be inserted.
  const items = $derived.by(() => {
    void mutationVersion;
    if (!tree) return [];
    const out = [];
    function walk(node, depth, parentId) {
      const hasChildren = (node.children || []).length > 0;
      const isCollapsed = collapsed.has(node.id);
      out.push({
        kind: 'row',
        id: node.id,
        node,
        depth,
        parentId,
        hasChildren,
        isCollapsed,
      });
      if (hasChildren && !isCollapsed) {
        const kids = node.children;
        const canInsert = node.type !== 'fact';
        for (let i = 0; i < kids.length; i++) {
          if (canInsert) {
            out.push({
              kind: 'gap',
              key: `gap-${node.id}-${kids[i].id}`,
              parentId: node.id,
              beforeSiblingId: kids[i].id,
              depth: depth + 1,
            });
          }
          walk(kids[i], depth + 1, node.id);
        }
        if (canInsert) {
          out.push({
            kind: 'gap',
            key: `gap-${node.id}-end`,
            parentId: node.id,
            beforeSiblingId: null,
            depth: depth + 1,
          });
        }
      }
    }
    walk(tree, 0, null);
    return out;
  });

  // Map id -> set of descendant ids (including self), recomputed when tree changes.
  const descendantMap = $derived.by(() => {
    void mutationVersion;
    const map = new Map();
    if (!tree) return map;
    function collect(node) {
      const ids = new Set([node.id]);
      for (const c of node.children || []) {
        const child = collect(c);
        for (const v of child) ids.add(v);
      }
      map.set(node.id, ids);
      return ids;
    }
    collect(tree);
    return map;
  });

  function openPromptModal() {
    promptPreview = ARGUMENT_PROMPT_USER;
    showPromptModal = true;
  }

  function cancelPromptModal() {
    showPromptModal = false;
    promptPreview = '';
  }

  function resetPromptToDefault() {
    promptPreview = ARGUMENT_PROMPT_USER;
  }

  function confirmPromptAndRun() {
    const userPrompt = promptPreview.trim();
    showPromptModal = false;
    promptPreview = '';
    runAnalysis(userPrompt);
  }

  function clearAnalysis() {
    // Critiques reference tree node ids — clearing the tree without clearing
    // critiques would leave them dangling.
    clearCritiques();
    clearArgumentTree();
  }

  async function runAnalysis(userPrompt) {
    const text = getExtractedText();
    if (!text || !text.formatted) {
      setArgumentError('No document text is available to analyze.');
      return;
    }
    // Re-analyzing replaces the tree, which would leave any prior critiques
    // referencing stale node ids. Clear them up front.
    clearCritiques();
    setArgumentLoading();
    try {
      const result = await analyzeArgumentStructure(text, getModel(), userPrompt);
      setArgumentResult(result);
    } catch (e) {
      console.error('Argument analysis failed:', e);
      setArgumentError(e?.message || 'Argument analysis failed.');
    }
  }

  function toggleCollapse(id) {
    if (collapsed.has(id)) collapsed.delete(id);
    else collapsed.add(id);
  }

  function formatTime(ts) {
    if (!ts) return '';
    const d = new Date(ts);
    return d.toLocaleString(undefined, {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  }

  function handleRowClick(row) {
    const n = row.node;
    if (n.type === 'fact') {
      if (Array.isArray(n.chunkIds) && n.chunkIds.length > 0) {
        onfactselect({ chunkIds: n.chunkIds, text: n.text });
      }
      return;
    }
    if (row.hasChildren) {
      toggleCollapse(n.id);
    }
  }

  async function handleDelete(nodeId, ev) {
    ev?.stopPropagation();
    if (!isMarkdown) return;
    const node = getNodeById(nodeId);
    if (!node) return;
    const summary = (node.text || '').slice(0, 80);
    if (!confirm(`Delete "${summary}" and its sub-tree from the document?`)) return;
    const r = deleteNode(nodeId);
    if (r.ok) {
      try {
        await applyTreeChangesToDocument();
      } catch (err) {
        console.error('applyTreeChangesToDocument failed:', err);
      }
    }
  }

  async function handleInsertTransition(parentId, beforeSiblingId, ev) {
    ev?.stopPropagation();
    if (!isMarkdown) return;
    const text = window.prompt('Transition text');
    if (text === null) return;
    const trimmed = text.trim();
    if (!trimmed) return;
    const r = insertTransition(parentId, beforeSiblingId, { text: trimmed, chunkIds: [] });
    if (r.ok) {
      try {
        await applyTreeChangesToDocument();
      } catch (err) {
        console.error('applyTreeChangesToDocument failed:', err);
      }
    }
  }

  // Compute drop kind from cursor Y in the row.
  function classifyDrop(ev, rowEl, targetType) {
    const rect = rowEl.getBoundingClientRect();
    const ny = ev.clientY - rect.top;
    const third = rect.height / 3;
    if (ny < third) return 'before';
    if (ny > rect.height - third) return 'after';
    // Cannot drop "inside" a fact — fall back to before/after on the closer half.
    if (targetType === 'fact') {
      return ny < rect.height / 2 ? 'before' : 'after';
    }
    return 'inside';
  }

  function isValidDrop(draggedId, targetId, kind) {
    if (!draggedId || !targetId) return false;
    if (draggedId === targetId) return false;
    const banned = descendantMap.get(draggedId);
    if (banned && banned.has(targetId)) return false;
    if (kind === 'inside') {
      const target = getNodeById(targetId);
      if (!target || target.type === 'fact') return false;
      return true;
    }
    // before/after — needs a parent (target cannot be root)
    const parent = getParentOf(targetId);
    if (!parent) return false;
    return true;
  }

  function onRowDragStart(ev, row) {
    if (!isMarkdown || row.depth === 0) {
      ev.preventDefault();
      return;
    }
    dragNodeId = row.id;
    dropTargetId = null;
    dropKind = null;
    dropValid = false;
    try {
      ev.dataTransfer.effectAllowed = 'move';
      ev.dataTransfer.setData('text/plain', row.id);
    } catch {}
  }

  function onRowDragOver(ev, row) {
    if (!dragNodeId) return;
    const kind = classifyDrop(ev, ev.currentTarget, row.node.type);
    const valid = isValidDrop(dragNodeId, row.id, kind);
    dropTargetId = row.id;
    dropKind = kind;
    dropValid = valid;
    if (valid) {
      ev.preventDefault();
      try { ev.dataTransfer.dropEffect = 'move'; } catch {}
    } else {
      // Still preventDefault so we keep receiving dragover events for live feedback,
      // but mark dropEffect 'none'.
      ev.preventDefault();
      try { ev.dataTransfer.dropEffect = 'none'; } catch {}
    }
  }

  function onRowDragLeave(ev, row) {
    // Only clear if we're leaving the same row we last marked.
    if (dropTargetId === row.id) {
      // Don't immediately clear — the user often moves between adjacent rows.
      // dragOver on the next row will overwrite. Leaving the list entirely is
      // handled by onListDragLeave.
    }
  }

  function onListDragLeave(ev) {
    // Only clear if pointer left the list bounds.
    const rect = ev.currentTarget.getBoundingClientRect();
    const x = ev.clientX, y = ev.clientY;
    if (x < rect.left || x > rect.right || y < rect.top || y > rect.bottom) {
      dropTargetId = null;
      dropKind = null;
      dropValid = false;
    }
  }

  async function onRowDrop(ev, row) {
    ev.preventDefault();
    const draggedId = dragNodeId;
    const kind = dropKind;
    const valid = dropValid;
    dragNodeId = null;
    dropTargetId = null;
    dropKind = null;
    dropValid = false;
    if (!draggedId || !kind || !valid) return;

    let r;
    if (kind === 'inside') {
      r = moveNode(draggedId, row.id, null);
    } else {
      const parent = getParentOf(row.id);
      if (!parent) return;
      if (kind === 'before') {
        r = moveNode(draggedId, parent.id, row.id);
      } else {
        const sibIdx = parent.children.findIndex((c) => c.id === row.id);
        const next = parent.children[sibIdx + 1];
        r = moveNode(draggedId, parent.id, next ? next.id : null);
      }
    }
    if (r && r.ok) {
      try {
        await applyTreeChangesToDocument();
      } catch (err) {
        console.error('applyTreeChangesToDocument failed:', err);
      }
    }
  }

  function onRowDragEnd() {
    dragNodeId = null;
    dropTargetId = null;
    dropKind = null;
    dropValid = false;
  }

  function typeIcon(type) {
    if (type === 'fact') return Hash;
    if (type === 'transition') return GitBranch;
    if (type === 'structural') return Layers;
    return FileText; // arg / root
  }
</script>

<div class="flex flex-col flex-1 min-h-0">
  <div class="flex items-center justify-between gap-2 px-3 py-2 border-b border-gray-200 dark:border-gray-700">
    <div class="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
      {#if status === 'ready' && analyzedAt}
        <span>Analyzed {formatTime(analyzedAt)}</span>
      {:else if status === 'idle'}
        <span>No analysis yet.</span>
      {/if}
    </div>
    <div class="flex items-center gap-1.5">
      <button
        class="flex items-center justify-center w-7 h-7 rounded-md border cursor-pointer transition-colors {wrapText
          ? 'border-primary-500/40 bg-primary-500/10 text-primary-600 dark:text-primary-400 hover:bg-primary-500/20'
          : 'border-gray-300 dark:border-gray-600 text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800'}"
        onclick={toggleWrap}
        title={wrapText ? 'Truncate long text' : 'Wrap long text'}
        aria-label="Toggle text wrapping"
        aria-pressed={wrapText}
      >
        <WrapText size={13} />
      </button>
      {#if (status === 'ready' || status === 'error') && tree}
        <button
          class="flex items-center justify-center w-7 h-7 rounded-md border border-gray-300 dark:border-gray-600 text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 hover:text-red-600 dark:hover:text-red-400 cursor-pointer transition-colors"
          onclick={clearAnalysis}
          title="Clear analysis"
          aria-label="Clear analysis"
        >
          <Trash2 size={13} />
        </button>
      {/if}
      <button
        class="flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-semibold border transition-colors {status === 'loading'
          ? 'border-gray-300 dark:border-gray-600 text-gray-400 dark:text-gray-500 cursor-not-allowed'
          : 'border-primary-500/40 bg-primary-500/10 text-primary-600 dark:text-primary-400 hover:bg-primary-500/20 cursor-pointer'}"
        onclick={openPromptModal}
        disabled={status === 'loading'}
      >
        {#if status === 'loading'}
          <Loader2 size={12} class="animate-spin" />
          {progressMessage || 'Analyzing...'}
        {:else if status === 'ready'}
          <RefreshCw size={12} />
          Re-analyze
        {:else}
          <Network size={12} />
          Analyze argument structure
        {/if}
      </button>
    </div>
  </div>

  {#if status === 'error'}
    <div class="m-3 p-3 rounded-md border border-red-300 dark:border-red-700 bg-red-50 dark:bg-red-900/20 text-xs text-red-700 dark:text-red-300 flex items-start gap-2">
      <AlertCircle size={14} class="mt-0.5 shrink-0" />
      <div class="flex-1">
        <div class="font-semibold mb-0.5">Analysis failed</div>
        <div class="leading-snug">{error}</div>
      </div>
    </div>
  {/if}

  {#if status === 'idle'}
    <div class="flex-1 flex flex-col items-center justify-center text-center px-6 text-gray-400 dark:text-gray-500">
      <Network size={28} strokeWidth={1.5} class="mb-2" />
      <p class="m-0 text-sm">Build the argument tree.</p>
      <p class="m-1 text-xs">Click "Analyze argument structure" to ask Claude to identify the document's core argument, supporting arguments, and grounding facts.</p>
    </div>
  {:else if status === 'loading' && !tree}
    <div class="flex-1 flex flex-col items-center justify-center text-center px-6 text-gray-400 dark:text-gray-500 gap-2">
      <Loader2 size={20} class="animate-spin" />
      <p class="m-0 text-xs">{progressMessage || 'Analyzing argument structure...'}</p>
    </div>
  {:else if tree}
    <div
      class="flex-1 min-h-0 overflow-auto bg-gray-50 dark:bg-gray-950 py-1"
      ondragleave={onListDragLeave}
      bind:this={listEl}
    >
      {#each items as item (item.kind === 'row' ? item.id : item.key)}
        {#if item.kind === 'gap'}
          {#if isMarkdown}
            <div class="group/gap relative h-1.5" style:padding-left="{item.depth * 16 + 24}px">
              <button
                class="absolute top-1/2 -translate-y-1/2 h-4 flex items-center opacity-0 group-hover/gap:opacity-100 transition-opacity cursor-pointer"
                style:left="{item.depth * 16 + 24}px"
                onclick={(ev) => handleInsertTransition(item.parentId, item.beforeSiblingId, ev)}
                title="Insert a transition here"
              >
                <span class="flex items-center gap-1 text-[0.6rem] font-semibold text-primary-600 dark:text-primary-400 bg-primary-500/10 hover:bg-primary-500/20 border border-primary-500/40 rounded-full px-1.5 py-0.5">
                  <Plus size={10} />
                  insert
                </span>
              </button>
            </div>
          {/if}
        {:else}
          {@const row = item}
          {@const TypeIcon = typeIcon(row.node.type)}
          {@const isRoot = row.depth === 0}
          {@const isDropTarget = dropTargetId === row.id && dragNodeId != null}
          {@const indicatorColor = dropValid ? 'border-primary-500' : 'border-red-500'}
          {@const isDragging = dragNodeId === row.id}
          {@const isCritiqueHighlight = highlightedNodeIds.has(row.id)}

          <!-- svelte-ignore a11y_click_events_have_key_events -->
          <!-- svelte-ignore a11y_no_static_element_interactions -->
          <div
            class="group/row relative flex items-center gap-1 pr-2 text-sm select-none transition-colors
              {isDragging ? 'opacity-40' : ''}
              {row.node.type === 'fact' || row.hasChildren ? 'cursor-pointer' : ''}
              hover:bg-gray-100 dark:hover:bg-gray-800/60
              {isRoot ? 'bg-primary-500/10 dark:bg-primary-500/15 font-semibold' : ''}
              {isDropTarget && dropKind === 'inside' ? (dropValid ? 'ring-2 ring-inset ring-primary-500' : 'ring-2 ring-inset ring-red-500') : ''}"
            style:padding-left="{row.depth * 16 + 4}px"
            draggable={isMarkdown && !isRoot}
            data-arg-row-highlighted={isCritiqueHighlight ? 'true' : 'false'}
            ondragstart={(ev) => onRowDragStart(ev, row)}
            ondragover={(ev) => onRowDragOver(ev, row)}
            ondragleave={(ev) => onRowDragLeave(ev, row)}
            ondrop={(ev) => onRowDrop(ev, row)}
            ondragend={onRowDragEnd}
            onclick={() => handleRowClick(row)}
          >
            {#if isDropTarget && dropKind === 'before'}
              <div class="pointer-events-none absolute left-0 right-0 top-0 border-t-2 {indicatorColor}"></div>
            {/if}
            {#if isDropTarget && dropKind === 'after'}
              <div class="pointer-events-none absolute left-0 right-0 bottom-0 border-b-2 {indicatorColor}"></div>
            {/if}

            <span class="w-4 h-4 flex items-center justify-center shrink-0 text-gray-400 dark:text-gray-500">
              {#if row.node.type !== 'fact' && row.hasChildren}
                {#if row.isCollapsed}
                  <ChevronRight size={14} />
                {:else}
                  <ChevronDown size={14} />
                {/if}
              {/if}
            </span>

            <span class="shrink-0 flex items-center
              {row.node.type === 'fact'
                ? 'text-gray-400 dark:text-gray-500'
                : row.node.type === 'transition'
                  ? 'text-amber-600 dark:text-amber-400'
                  : row.node.type === 'structural'
                    ? 'text-gray-500 dark:text-gray-400'
                    : 'text-primary-600 dark:text-primary-400'}">
              <TypeIcon size={13} strokeWidth={2} />
            </span>

            <span class="flex-1 min-w-0 py-1 {wrapText ? 'whitespace-normal break-words' : 'truncate'}
              {row.node.type === 'fact' ? 'text-gray-600 dark:text-gray-400 italic' : 'text-gray-800 dark:text-gray-100'}
              {row.node.type === 'transition' ? 'text-amber-700 dark:text-amber-300' : ''}
              {isRoot ? 'text-primary-700 dark:text-primary-300' : ''}
              {isCritiqueHighlight ? 'font-semibold text-red-700 dark:text-red-300' : ''}"
              title={wrapText ? null : row.node.text}
            >
              {row.node.text}
            </span>

            {#if row.node.type === 'fact'}
              {@const ids = (row.node.chunkIds || []).slice(0, 3).join(' ')}
              {#if ids}
                <span class="shrink-0 text-[0.65rem] font-mono text-gray-400 dark:text-gray-600">{ids}</span>
              {/if}
            {/if}

            {#if isMarkdown && !isRoot}
              <button
                class="shrink-0 ml-1 w-5 h-5 flex items-center justify-center rounded text-red-500 hover:bg-red-500/10 hover:text-red-600 dark:hover:text-red-400 opacity-0 group-hover/row:opacity-100 transition-opacity cursor-pointer"
                onclick={(ev) => handleDelete(row.id, ev)}
                title="Delete this node and its sub-tree"
              >
                <X size={13} />
              </button>
            {/if}
          </div>
        {/if}
      {/each}
    </div>
  {/if}

  {#if showPromptModal}
    <div class="fixed inset-0 bg-black/50 flex items-center justify-center z-50 cursor-pointer" onclick={cancelPromptModal}>
      <div class="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-6 w-[700px] max-w-[90vw] max-h-[80vh] flex flex-col shadow-xl cursor-default" onclick={(e) => e.stopPropagation()}>
        <h3 class="m-0 mb-2 text-gray-900 dark:text-gray-100 text-base font-semibold">Argument Analysis Prompt</h3>
        <div class="mb-4 flex items-baseline justify-between gap-2">
          <p class="m-0 text-gray-500 dark:text-gray-400 text-sm">Edit the prompt that will be sent to the Claude API:</p>
          <button
            type="button"
            class="text-xs text-primary-600 dark:text-primary-400 hover:underline cursor-pointer bg-transparent border-none p-0"
            onclick={resetPromptToDefault}
          >Reset to default</button>
        </div>
        <textarea
          class="w-full min-h-[150px] mb-4 p-3 bg-gray-50 dark:bg-gray-900 border border-gray-300 dark:border-gray-600 rounded-md text-gray-900 dark:text-gray-100 text-sm leading-relaxed resize-y focus:outline-none focus:border-primary-500 focus:ring-1 focus:ring-primary-500"
          bind:value={promptPreview}
          onkeydown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) confirmPromptAndRun(); }}
        ></textarea>
        <div class="flex gap-2 justify-end">
          <button class="px-4 py-2 rounded-md bg-primary-500 hover:bg-primary-600 text-white text-sm font-medium cursor-pointer border-none transition-colors" onclick={confirmPromptAndRun}>Analyze</button>
          <button class="px-4 py-2 rounded-md border border-gray-300 dark:border-gray-600 bg-transparent text-gray-600 dark:text-gray-400 text-sm cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors" onclick={cancelPromptModal}>Cancel</button>
        </div>
      </div>
    </div>
  {/if}
</div>
