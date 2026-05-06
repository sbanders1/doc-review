<script>
  import {
    Gavel,
    RefreshCw,
    AlertCircle,
    Loader2,
    Trash2,
    ChevronRight,
  } from 'lucide-svelte';
  import {
    getDepositionQuestions,
    getDepositionStatus,
    getDepositionError,
    getLastGeneratedAt,
    getExpandedIds,
    getFilterCategory,
    getFilterPage,
    setDepositionLoading,
    setDepositionResult,
    setDepositionError,
    clearDepositionQuestions,
    toggleExpanded,
    expandAll,
    collapseAll,
    setFilterCategory,
    setFilterPage,
  } from './depositionPrep.svelte.js';
  import { generateDepositionQuestions, DEPOSITION_PROMPT_USER } from './depositionPrep.js';
  import { getExtractedText } from './documentContext.svelte.js';
  import { getModel } from './model.svelte.js';

  let showPromptModal = $state(false);
  let promptPreview = $state('');

  const questions = $derived(getDepositionQuestions());
  const status = $derived(getDepositionStatus());
  const error = $derived(getDepositionError());
  const lastAt = $derived(getLastGeneratedAt());
  const expandedIds = $derived(getExpandedIds());
  const filterCategory = $derived(getFilterCategory());
  const filterPage = $derived(getFilterPage());

  const CATEGORY_LABELS = {
    concession: 'Concession',
    scope: 'Scope',
    self_contradiction: 'Self-contradiction',
  };

  function pageOf(chunkId) {
    if (typeof chunkId !== 'string') return null;
    const m = chunkId.match(/^p(\d+)\./);
    if (!m) return null;
    return Number(m[1]);
  }

  function primaryPage(q) {
    if (!q.chunk_ids || q.chunk_ids.length === 0) return null;
    let min = Infinity;
    for (const cid of q.chunk_ids) {
      const p = pageOf(cid);
      if (p != null && p < min) min = p;
    }
    return min === Infinity ? null : min;
  }

  const pagesAvailable = $derived.by(() => {
    const set = new Set();
    for (const q of questions) {
      for (const cid of q.chunk_ids || []) {
        const p = pageOf(cid);
        if (p != null) set.add(p);
      }
    }
    return Array.from(set).sort((a, b) => a - b);
  });

  const sortedFiltered = $derived.by(() => {
    const indexed = questions.map((q, i) => ({ q, i, page: primaryPage(q) }));
    indexed.sort((a, b) => {
      const ap = a.page == null ? Infinity : a.page;
      const bp = b.page == null ? Infinity : b.page;
      if (ap !== bp) return ap - bp;
      return a.i - b.i;
    });
    return indexed
      .filter(({ q, page }) => {
        if (filterCategory !== 'all' && q.category !== filterCategory) return false;
        if (filterPage !== 'all') {
          const want = Number(filterPage);
          if (page !== want) return false;
        }
        return true;
      })
      .map(({ q, page }) => ({ q, page }));
  });

  const allExpanded = $derived(
    questions.length > 0 && expandedIds.size === questions.length,
  );

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

  function openPromptModal() {
    promptPreview = DEPOSITION_PROMPT_USER;
    showPromptModal = true;
  }

  function cancelPromptModal() {
    showPromptModal = false;
    promptPreview = '';
  }

  function resetPromptToDefault() {
    promptPreview = DEPOSITION_PROMPT_USER;
  }

  function confirmPromptAndRun() {
    const userPrompt = promptPreview.trim();
    showPromptModal = false;
    promptPreview = '';
    runGenerate(userPrompt);
  }

  async function runGenerate(userPrompt) {
    const text = getExtractedText();
    if (!text || !text.formatted) {
      setDepositionError('No document text is available to analyze.');
      return;
    }
    setDepositionLoading();
    try {
      const result = await generateDepositionQuestions(text, getModel(), userPrompt);
      setDepositionResult(result);
    } catch (e) {
      console.error('Deposition prep failed:', e);
      setDepositionError(e?.message || 'Deposition prep failed.');
    }
  }

  function categoryClass(cat) {
    if (cat === 'concession') return 'bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/30';
    if (cat === 'scope') return 'bg-blue-500/10 text-blue-700 dark:text-blue-300 border-blue-500/30';
    if (cat === 'self_contradiction') return 'bg-red-500/10 text-red-700 dark:text-red-300 border-red-500/30';
    return 'bg-gray-500/10 text-gray-700 dark:text-gray-300 border-gray-500/30';
  }

</script>

<div class="flex flex-col flex-1 min-h-0">
  <div class="flex items-center justify-between gap-2 px-3 py-2 border-b border-gray-200 dark:border-gray-700">
    <div class="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400 min-w-0">
      <Gavel size={13} class="shrink-0" />
      {#if status === 'ready' && lastAt}
        <span class="truncate">Generated {formatTime(lastAt)}</span>
      {:else if status === 'loading'}
        <span class="truncate">Generating...</span>
      {:else}
        <span class="truncate">No questions yet.</span>
      {/if}
    </div>
    <div class="flex items-center gap-1.5">
      {#if status === 'ready' || status === 'error'}
        <button
          class="flex items-center justify-center w-7 h-7 rounded-md border border-gray-300 dark:border-gray-600 text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 hover:text-red-600 dark:hover:text-red-400 cursor-pointer transition-colors"
          onclick={clearDepositionQuestions}
          title="Clear deposition questions"
          aria-label="Clear deposition questions"
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
          Generating...
        {:else if status === 'ready'}
          <RefreshCw size={12} />
          Re-generate
        {:else}
          <Gavel size={12} />
          Generate questions
        {/if}
      </button>
    </div>
  </div>

  {#if status === 'error'}
    <div class="m-3 p-3 rounded-md border border-red-300 dark:border-red-700 bg-red-50 dark:bg-red-900/20 text-xs text-red-700 dark:text-red-300 flex items-start gap-2">
      <AlertCircle size={14} class="mt-0.5 shrink-0" />
      <div class="flex-1">
        <div class="font-semibold mb-0.5">Deposition prep failed</div>
        <div class="leading-snug">{error}</div>
      </div>
    </div>
  {/if}

  {#if status === 'ready' && questions.length > 0}
    <div class="flex items-center gap-2 px-3 py-2 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/40 text-xs">
      <select
        class="px-1.5 py-0.5 rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 text-xs cursor-pointer focus:outline-none focus:border-primary-500"
        value={filterCategory}
        onchange={(e) => setFilterCategory(e.currentTarget.value)}
        aria-label="Filter by category"
      >
        <option value="all">All categories</option>
        <option value="concession">Concession</option>
        <option value="scope">Scope</option>
        <option value="self_contradiction">Self-contradiction</option>
      </select>
      <select
        class="px-1.5 py-0.5 rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 text-xs cursor-pointer focus:outline-none focus:border-primary-500"
        value={filterPage}
        onchange={(e) => setFilterPage(e.currentTarget.value)}
        aria-label="Filter by page"
        disabled={pagesAvailable.length === 0}
      >
        <option value="all">All pages</option>
        {#each pagesAvailable as p (p)}
          <option value={String(p)}>Page {p}</option>
        {/each}
      </select>
      <button
        class="ml-auto px-2 py-0.5 rounded border border-gray-300 dark:border-gray-600 bg-transparent text-gray-600 dark:text-gray-400 text-xs cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
        onclick={() => { if (allExpanded) collapseAll(); else expandAll(); }}
      >
        {allExpanded ? 'Collapse all' : 'Expand all'}
      </button>
    </div>
  {/if}

  {#if status === 'idle' && questions.length === 0}
    <div class="flex-1 flex flex-col items-center justify-center text-center px-6 text-gray-400 dark:text-gray-500">
      <Gavel size={28} strokeWidth={1.5} class="mb-2" />
      <p class="m-0 text-sm">Anticipate deposition questions opposing counsel might ask.</p>
      <p class="m-1 text-xs">Click "Generate questions" to surface concession traps, scope-pushing questions, and self-contradiction risks.</p>
    </div>
  {:else if status === 'loading' && questions.length === 0}
    <div class="flex-1 flex flex-col items-center justify-center text-center px-6 text-gray-400 dark:text-gray-500 gap-2">
      <Loader2 size={20} class="animate-spin" />
      <p class="m-0 text-xs">Generating deposition questions...</p>
    </div>
  {:else if status !== 'idle' && questions.length > 0}
    <div class="flex-1 min-h-0 overflow-auto bg-gray-50 dark:bg-gray-950 px-3 py-3">
      {#if sortedFiltered.length === 0}
        <p class="m-0 px-2 py-4 text-center text-xs text-gray-400 dark:text-gray-500 italic">No questions match the current filters.</p>
      {:else}
        <div class="flex flex-col gap-2">
          {#each sortedFiltered as { q, page } (q.id)}
            {@const isOpen = expandedIds.has(q.id)}
            <div class="rounded-md border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900">
              <!-- svelte-ignore a11y_no_static_element_interactions -->
              <!-- svelte-ignore a11y_click_events_have_key_events -->
              <div
                class="flex items-start gap-2 p-2.5 cursor-pointer"
                onclick={() => toggleExpanded(q.id)}
                role="button"
                tabindex="0"
              >
                <ChevronRight
                  size={14}
                  class="mt-0.5 shrink-0 text-gray-400 dark:text-gray-500 transition-transform {isOpen ? 'rotate-90' : ''}"
                />
                <div class="flex flex-col gap-1.5 min-w-0 flex-1">
                  <div class="flex items-center gap-1.5 flex-wrap">
                    <span class="px-1.5 py-px text-[0.65rem] font-semibold uppercase tracking-wide rounded border whitespace-nowrap leading-snug {categoryClass(q.category)}">
                      {CATEGORY_LABELS[q.category]}
                    </span>
                    {#if page != null}
                      <span class="text-[0.65rem] text-gray-400 dark:text-gray-500">p{page}</span>
                    {/if}
                  </div>
                  <p class="m-0 text-sm text-gray-800 dark:text-gray-200 leading-snug {isOpen ? '' : 'line-clamp-2'}">{q.question}</p>
                </div>
              </div>

              {#if isOpen}
                <div class="px-3 pb-3 pt-1 border-t border-gray-100 dark:border-gray-800 flex flex-col gap-3 text-sm text-gray-700 dark:text-gray-300">
                  {#if q.extracts}
                    <div>
                      <div class="text-[0.65rem] font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400 mb-0.5">What it extracts</div>
                      <p class="m-0 leading-snug">{q.extracts}</p>
                    </div>
                  {/if}
                  {#if q.danger}
                    <div>
                      <div class="text-[0.65rem] font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400 mb-0.5">Why it's dangerous</div>
                      <p class="m-0 leading-snug">{q.danger}</p>
                    </div>
                  {/if}
                  {#if q.defensible_answer}
                    <div>
                      <div class="text-[0.65rem] font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400 mb-0.5">Defensible answer</div>
                      <p class="m-0 leading-snug">{q.defensible_answer}</p>
                    </div>
                  {/if}
                  {#if q.bad_answer}
                    <div>
                      <div class="text-[0.65rem] font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400 mb-0.5">Bad answer</div>
                      <p class="m-0 leading-snug">{q.bad_answer}</p>
                      {#if q.bad_answer_reasoning}
                        <p class="m-0 mt-1 text-xs italic text-gray-500 dark:text-gray-400 leading-snug">{q.bad_answer_reasoning}</p>
                      {/if}
                    </div>
                  {/if}
                </div>
              {/if}
            </div>
          {/each}
        </div>
      {/if}
    </div>
  {/if}

  {#if showPromptModal}
    <!-- svelte-ignore a11y_click_events_have_key_events -->
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div class="fixed inset-0 bg-black/50 flex items-center justify-center z-50 cursor-pointer" onclick={cancelPromptModal}>
      <div class="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-6 w-[700px] max-w-[90vw] max-h-[80vh] flex flex-col shadow-xl cursor-default" onclick={(e) => e.stopPropagation()}>
        <h3 class="m-0 mb-2 text-gray-900 dark:text-gray-100 text-base font-semibold">Deposition Prep Prompt</h3>
        <div class="mb-4 flex items-baseline justify-between gap-2">
          <p class="m-0 text-gray-500 dark:text-gray-400 text-sm">Edit the prompt that will be sent to the Claude API:</p>
          <button
            type="button"
            class="text-xs text-primary-600 dark:text-primary-400 hover:underline cursor-pointer bg-transparent border-none p-0"
            onclick={resetPromptToDefault}
          >Reset to default</button>
        </div>
        <textarea
          class="w-full min-h-[260px] mb-4 p-3 bg-gray-50 dark:bg-gray-900 border border-gray-300 dark:border-gray-600 rounded-md text-gray-900 dark:text-gray-100 text-sm leading-relaxed resize-y focus:outline-none focus:border-primary-500 focus:ring-1 focus:ring-primary-500"
          bind:value={promptPreview}
          onkeydown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) confirmPromptAndRun(); }}
        ></textarea>
        <div class="flex gap-2 justify-end">
          <button class="px-4 py-2 rounded-md bg-primary-500 hover:bg-primary-600 text-white text-sm font-medium cursor-pointer border-none transition-colors" onclick={confirmPromptAndRun}>Generate questions</button>
          <button class="px-4 py-2 rounded-md border border-gray-300 dark:border-gray-600 bg-transparent text-gray-600 dark:text-gray-400 text-sm cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors" onclick={cancelPromptModal}>Cancel</button>
        </div>
      </div>
    </div>
  {/if}
</div>
