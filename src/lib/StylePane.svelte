<script>
  import {
    Wand2,
    RefreshCw,
    AlertCircle,
    Loader2,
    Trash2,
  } from 'lucide-svelte';
  import {
    getStyleRatings,
    getStyleStatus,
    getStyleError,
    getLastStyleReviewedAt,
    setStyleLoading,
    setStyleResult,
    setStyleError,
    clearStyleRatings,
  } from './style.svelte.js';
  import { reviewStyle, STYLE_PROMPT_USER, DIMENSIONS } from './style.js';
  import { getExtractedText } from './documentContext.svelte.js';
  import { getModel } from './model.svelte.js';

  let showPromptModal = $state(false);
  let promptPreview = $state('');

  const ratings = $derived(getStyleRatings());
  const status = $derived(getStyleStatus());
  const error = $derived(getStyleError());
  const lastAt = $derived(getLastStyleReviewedAt());

  const ratingsByKey = $derived.by(() => {
    const m = new Map();
    for (const r of ratings) m.set(r.dimension, r);
    return m;
  });

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
    promptPreview = STYLE_PROMPT_USER;
    showPromptModal = true;
  }

  function cancelPromptModal() {
    showPromptModal = false;
    promptPreview = '';
  }

  function resetPromptToDefault() {
    promptPreview = STYLE_PROMPT_USER;
  }

  function confirmPromptAndRun() {
    const userPrompt = promptPreview.trim();
    showPromptModal = false;
    promptPreview = '';
    runStyle(userPrompt);
  }

  async function runStyle(userPrompt) {
    const text = getExtractedText();
    if (!text || !text.formatted) {
      setStyleError('No document text is available to analyze.');
      return;
    }
    setStyleLoading();
    try {
      const result = await reviewStyle(text, getModel(), userPrompt);
      setStyleResult(result);
    } catch (e) {
      console.error('Style review failed:', e);
      setStyleError(e?.message || 'Style review failed.');
    }
  }

  function markerLeft(score) {
    const s = Math.max(1, Math.min(10, Number(score) || 1));
    return ((s - 1) / 9) * 100;
  }
</script>

<div class="flex flex-col flex-1 min-h-0">
  <div class="flex items-center justify-between gap-2 px-3 py-2 border-b border-gray-200 dark:border-gray-700">
    <div class="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400 min-w-0">
      <Wand2 size={13} class="shrink-0" />
      {#if status === 'ready' && lastAt}
        <span class="truncate">Reviewed {formatTime(lastAt)}</span>
      {:else if status === 'loading'}
        <span class="truncate">Reviewing...</span>
      {:else}
        <span class="truncate">No review yet.</span>
      {/if}
    </div>
    <div class="flex items-center gap-1.5">
      {#if status === 'ready' || status === 'error'}
        <button
          class="flex items-center justify-center w-7 h-7 rounded-md border border-gray-300 dark:border-gray-600 text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 hover:text-red-600 dark:hover:text-red-400 cursor-pointer transition-colors"
          onclick={clearStyleRatings}
          title="Clear style ratings"
          aria-label="Clear style ratings"
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
          Reviewing...
        {:else if status === 'ready'}
          <RefreshCw size={12} />
          Re-review
        {:else}
          <Wand2 size={12} />
          Review style
        {/if}
      </button>
    </div>
  </div>

  {#if status === 'error'}
    <div class="m-3 p-3 rounded-md border border-red-300 dark:border-red-700 bg-red-50 dark:bg-red-900/20 text-xs text-red-700 dark:text-red-300 flex items-start gap-2">
      <AlertCircle size={14} class="mt-0.5 shrink-0" />
      <div class="flex-1">
        <div class="font-semibold mb-0.5">Style review failed</div>
        <div class="leading-snug">{error}</div>
      </div>
    </div>
  {/if}

  {#if status === 'idle' && ratings.length === 0}
    <div class="flex-1 flex flex-col items-center justify-center text-center px-6 text-gray-400 dark:text-gray-500">
      <Wand2 size={28} strokeWidth={1.5} class="mb-2" />
      <p class="m-0 text-sm">Build a stylistic profile of the document.</p>
      <p class="m-1 text-xs">Click "Review style" to score the prose on six dimensions: register, hedging, conciseness, advocacy, voice, and signposting.</p>
    </div>
  {:else if status === 'loading' && ratings.length === 0}
    <div class="flex-1 flex flex-col items-center justify-center text-center px-6 text-gray-400 dark:text-gray-500 gap-2">
      <Loader2 size={20} class="animate-spin" />
      <p class="m-0 text-xs">Scoring stylistic dimensions...</p>
    </div>
  {:else}
    <div class="flex-1 min-h-0 overflow-auto bg-gray-50 dark:bg-gray-950 px-3 py-4">
      {#each DIMENSIONS as dim, i (dim.key)}
        {@const r = ratingsByKey.get(dim.key)}
        <div class="mb-5 {i < DIMENSIONS.length - 1 ? 'pb-5 border-b border-gray-200 dark:border-gray-800' : ''}">
          <div class="flex items-center justify-between text-[0.7rem] uppercase tracking-wide text-gray-500 dark:text-gray-400 mb-1.5">
            <span>{dim.leftLabel}</span>
            <span>{dim.rightLabel}</span>
          </div>
          {#if r}
            <div class="relative h-2 rounded-full bg-gray-200 dark:bg-gray-800">
              <div
                class="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-3.5 h-3.5 rounded-full bg-primary-500 border-2 border-white dark:border-gray-950 shadow"
                style:left="{markerLeft(r.score)}%"
                title="Score: {r.score}/10"
              ></div>
            </div>
            {#if r.explanation}
              <p class="m-0 mt-3 text-sm leading-relaxed text-gray-600 dark:text-gray-400">{r.explanation}</p>
            {/if}
          {:else}
            <div class="relative h-2 rounded-full bg-gray-200 dark:bg-gray-800 opacity-50"></div>
            <p class="m-0 mt-3 text-xs italic text-gray-400 dark:text-gray-500">No rating returned for this dimension.</p>
          {/if}
        </div>
      {/each}
    </div>
  {/if}

  {#if showPromptModal}
    <div class="fixed inset-0 bg-black/50 flex items-center justify-center z-50 cursor-pointer" onclick={cancelPromptModal}>
      <div class="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-6 w-[700px] max-w-[90vw] max-h-[80vh] flex flex-col shadow-xl cursor-default" onclick={(e) => e.stopPropagation()}>
        <h3 class="m-0 mb-2 text-gray-900 dark:text-gray-100 text-base font-semibold">Style Review Prompt</h3>
        <div class="mb-4 flex items-baseline justify-between gap-2">
          <p class="m-0 text-gray-500 dark:text-gray-400 text-sm">Edit the prompt that will be sent to the Claude API:</p>
          <button
            type="button"
            class="text-xs text-primary-600 dark:text-primary-400 hover:underline cursor-pointer bg-transparent border-none p-0"
            onclick={resetPromptToDefault}
          >Reset to default</button>
        </div>
        <textarea
          class="w-full min-h-[200px] mb-4 p-3 bg-gray-50 dark:bg-gray-900 border border-gray-300 dark:border-gray-600 rounded-md text-gray-900 dark:text-gray-100 text-sm leading-relaxed resize-y focus:outline-none focus:border-primary-500 focus:ring-1 focus:ring-primary-500"
          bind:value={promptPreview}
          onkeydown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) confirmPromptAndRun(); }}
        ></textarea>
        <div class="flex gap-2 justify-end">
          <button class="px-4 py-2 rounded-md bg-primary-500 hover:bg-primary-600 text-white text-sm font-medium cursor-pointer border-none transition-colors" onclick={confirmPromptAndRun}>Review style</button>
          <button class="px-4 py-2 rounded-md border border-gray-300 dark:border-gray-600 bg-transparent text-gray-600 dark:text-gray-400 text-sm cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors" onclick={cancelPromptModal}>Cancel</button>
        </div>
      </div>
    </div>
  {/if}
</div>
