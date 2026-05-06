<script>
  import {
    Gavel,
    RefreshCw,
    AlertCircle,
    Loader2,
    Lightbulb,
    Trash2,
    CheckCircle2,
  } from 'lucide-svelte';
  import {
    getCritiques,
    getCritiqueStatus,
    getCritiqueError,
    getLastCritiqueAt,
    getActiveCritiqueId,
    setActiveCritiqueId,
    setCritiqueLoading,
    setCritiqueResult,
    setCritiqueError,
    getLastRunCount,
    clearCritiques,
  } from './critiques.svelte.js';
  import { critiqueArguments, CRITIQUE_PROMPT_USER } from './critique.js';
  import { getArgumentTree, getNodeById } from './argumentTree.svelte.js';
  import { getModel } from './model.svelte.js';

  let showPromptModal = $state(false);
  let promptPreview = $state('');
  let runs = $state(3);

  const critiques = $derived(getCritiques());
  const status = $derived(getCritiqueStatus());
  const error = $derived(getCritiqueError());
  const lastAt = $derived(getLastCritiqueAt());
  const activeId = $derived(getActiveCritiqueId());
  const tree = $derived(getArgumentTree());
  const totalRuns = $derived(getLastRunCount() || 1);

  const hasTree = $derived(tree != null);

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
    if (!hasTree) return;
    promptPreview = CRITIQUE_PROMPT_USER;
    showPromptModal = true;
  }

  function cancelPromptModal() {
    showPromptModal = false;
    promptPreview = '';
  }

  function resetPromptToDefault() {
    promptPreview = CRITIQUE_PROMPT_USER;
  }

  function clampRuns(n) {
    const v = Math.floor(Number(n));
    if (!Number.isFinite(v)) return 3;
    return Math.max(1, Math.min(5, v));
  }

  function bumpRuns(delta) {
    runs = clampRuns(runs + delta);
  }

  function confirmPromptAndRun() {
    const userPrompt = promptPreview.trim();
    const runCount = clampRuns(runs);
    showPromptModal = false;
    promptPreview = '';
    runCritique(userPrompt, runCount);
  }

  async function runCritique(userPrompt, runCount) {
    const currentTree = getArgumentTree();
    if (!currentTree) {
      setCritiqueError('No argument tree available. Run argument analysis first.');
      return;
    }
    setCritiqueLoading();
    try {
      const result = await critiqueArguments(currentTree, getModel(), userPrompt, runCount);
      setCritiqueResult(result.critiques || [], runCount);
    } catch (e) {
      console.error('Critique failed:', e);
      setCritiqueError(e?.message || 'Critique failed.');
    }
  }

  function severityClass(sev) {
    if (sev === 'high') return 'bg-red-500/15 text-red-700 dark:text-red-300 border-red-500/30';
    if (sev === 'low') return 'bg-gray-500/15 text-gray-600 dark:text-gray-400 border-gray-500/30';
    return 'bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30';
  }

  // Category visual mapping. Pill style mirrors severityClass.
  const CATEGORY_LABELS = {
    inconsistency: 'Inconsistency',
    unsupported_claim: 'Unsupported',
    weak_inference: 'Weak inference',
    overreach: 'Overreach',
    unaddressed_counter: 'Counter unaddressed',
    definitional: 'Definitional',
  };

  function categoryLabel(cat) {
    return CATEGORY_LABELS[cat] || cat || 'Critique';
  }

  function categoryClass(cat) {
    // Cool spectrum, fuchsia → teal, picked to avoid red/amber/gray
    // (which carry severity meaning) and the primary green theme.
    switch (cat) {
      case 'inconsistency':
        return 'bg-fuchsia-500/15 text-fuchsia-700 dark:text-fuchsia-300 border-fuchsia-500/30';
      case 'unsupported_claim':
        return 'bg-violet-500/15 text-violet-700 dark:text-violet-300 border-violet-500/30';
      case 'weak_inference':
        return 'bg-indigo-500/15 text-indigo-700 dark:text-indigo-300 border-indigo-500/30';
      case 'overreach':
        return 'bg-blue-500/15 text-blue-700 dark:text-blue-300 border-blue-500/30';
      case 'unaddressed_counter':
        return 'bg-cyan-500/15 text-cyan-700 dark:text-cyan-300 border-cyan-500/30';
      case 'definitional':
        return 'bg-teal-500/15 text-teal-700 dark:text-teal-300 border-teal-500/30';
      default:
        return 'bg-gray-500/15 text-gray-600 dark:text-gray-400 border-gray-500/30';
    }
  }

  function supportClass(supportCount, total) {
    if (total > 1 && supportCount === total) {
      // Consensus across all runs — emphasized.
      return 'font-semibold text-primary-600 dark:text-primary-400';
    }
    if (total > 1 && supportCount === 1) {
      // Singleton catch.
      return 'text-gray-400 dark:text-gray-500';
    }
    return 'text-gray-500 dark:text-gray-400';
  }

  function nodePreview(id) {
    const node = getNodeById(id);
    if (!node) return id;
    const text = (node.text || '').trim();
    if (!text) return id;
    return text.length > 60 ? text.slice(0, 60) + '…' : text;
  }

  function handleCardClick(id) {
    setActiveCritiqueId(id);
  }
</script>

<div class="flex flex-col flex-1 min-h-0">
  <div class="flex items-center justify-between gap-2 px-3 py-2 border-b border-gray-200 dark:border-gray-700">
    <div class="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400 min-w-0">
      <Gavel size={13} class="shrink-0" />
      {#if status === 'ready' && lastAt}
        <span class="truncate">Critiqued {formatTime(lastAt)} · {critiques.length} critique{critiques.length !== 1 ? 's' : ''}</span>
      {:else if status === 'loading'}
        <span class="truncate">Critiquing...</span>
      {:else}
        <span class="truncate">No critique yet.</span>
      {/if}
    </div>
    <div class="flex items-center gap-1.5">
      {#if critiques.length > 0}
        <button
          class="flex items-center justify-center p-1 rounded-md border transition-colors {status === 'loading'
            ? 'border-gray-300 dark:border-gray-600 text-gray-400 dark:text-gray-500 cursor-not-allowed'
            : 'border-gray-300 dark:border-gray-600 text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 hover:text-gray-700 dark:hover:text-gray-200 cursor-pointer'}"
          onclick={clearCritiques}
          disabled={status === 'loading'}
          title="Clear all critiques."
          aria-label="Clear all critiques"
        >
          <Trash2 size={12} />
        </button>
      {/if}
      <button
        class="flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-semibold border transition-colors {!hasTree || status === 'loading'
          ? 'border-gray-300 dark:border-gray-600 text-gray-400 dark:text-gray-500 cursor-not-allowed'
          : 'border-red-500/40 bg-red-500/10 text-red-600 dark:text-red-400 hover:bg-red-500/20 cursor-pointer'}"
        onclick={openPromptModal}
        disabled={!hasTree || status === 'loading'}
        title={!hasTree ? 'Run argument analysis first' : 'Critique the argument tree as opposing counsel'}
      >
        {#if status === 'loading'}
          <Loader2 size={12} class="animate-spin" />
          Critiquing...
        {:else if critiques.length > 0}
          <RefreshCw size={12} />
          Re-critique
        {:else}
          <Gavel size={12} />
          Critique
        {/if}
      </button>
    </div>
  </div>

  {#if status === 'error'}
    <div class="m-3 p-3 rounded-md border border-red-300 dark:border-red-700 bg-red-50 dark:bg-red-900/20 text-xs text-red-700 dark:text-red-300 flex items-start gap-2">
      <AlertCircle size={14} class="mt-0.5 shrink-0" />
      <div class="flex-1">
        <div class="font-semibold mb-0.5">Critique failed</div>
        <div class="leading-snug">{error}</div>
      </div>
    </div>
  {/if}

  {#if status === 'loading' && critiques.length === 0}
    <!-- In-flight, no prior results to keep visible. -->
    <div class="flex-1 flex flex-col items-center justify-center text-center px-6 text-gray-400 dark:text-gray-500 gap-2">
      <Loader2 size={20} class="animate-spin" />
      <p class="m-0 text-xs">Critiquing argument tree...</p>
    </div>
  {:else if critiques.length === 0 && lastAt != null}
    <!-- Ran successfully but the model surfaced no high-priority issues. -->
    <div class="flex-1 flex flex-col items-center justify-center text-center px-6 text-gray-400 dark:text-gray-500">
      <CheckCircle2 size={28} strokeWidth={1.5} class="mb-2" />
      <p class="m-0 text-sm font-medium">No significant critiques surfaced.</p>
      <p class="m-1 text-xs leading-snug max-w-sm">
        The reviewers did not find issues worth flagging at the high-priority threshold. You can re-run with a different prompt or run count if you want to push harder.
      </p>
    </div>
  {:else if critiques.length === 0}
    <!-- Never run yet. -->
    <div class="flex-1 flex flex-col items-center justify-center text-center px-6 text-gray-400 dark:text-gray-500">
      <Gavel size={28} strokeWidth={1.5} class="mb-2" />
      <p class="m-0 text-sm">Critique the argument as opposing counsel.</p>
      <p class="m-1 text-xs">
        {#if hasTree}
          Click "Critique" to ask Claude to find weak claims, evidentiary gaps, and unjustified leaps.
        {:else}
          Run argument analysis first to build the tree, then critique it.
        {/if}
      </p>
    </div>
  {:else}
    <div class="flex-1 min-h-0 overflow-auto bg-gray-50 dark:bg-gray-950 px-2 py-2 flex flex-col gap-1.5">
      {#each critiques as c (c.id)}
        {@const isActive = activeId === c.id}
        {@const sc = Number.isInteger(c.supportCount) ? c.supportCount : 1}
        <!-- svelte-ignore a11y_click_events_have_key_events -->
        <!-- svelte-ignore a11y_no_static_element_interactions -->
        <div
          class="rounded-md border bg-white dark:bg-gray-900 px-3 py-2 cursor-pointer transition-colors hover:border-gray-300 dark:hover:border-gray-600
            {isActive
              ? 'border-l-2 border-l-red-500 border-red-500/30 bg-red-500/5 dark:bg-red-500/10'
              : 'border-gray-200 dark:border-gray-700'}"
          onclick={() => handleCardClick(c.id)}
        >
          <div class="flex items-center justify-between gap-2 mb-1">
            <span class="shrink-0 text-[0.6rem] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded border {categoryClass(c.category)}">
              {categoryLabel(c.category)}
            </span>
            <span class="shrink-0 text-[0.6rem] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded border {severityClass(c.severity)}">
              {c.severity}
            </span>
          </div>
          <p class="m-0 text-sm leading-snug text-gray-800 dark:text-gray-100">
            {c.comment}
          </p>
          {#if isActive && typeof c.suggestion === 'string' && c.suggestion.trim().length > 0}
            <div class="mt-1.5 pl-3 border-l-2 border-amber-400/50 flex items-start gap-1.5 text-sm leading-snug text-gray-600 dark:text-gray-400">
              <Lightbulb size={13} class="mt-0.5 shrink-0 text-amber-500" />
              <span>{c.suggestion}</span>
            </div>
          {/if}
          <div class="mt-1 flex items-center justify-between gap-2 text-[0.65rem] text-gray-500 dark:text-gray-400">
            <span class="truncate">
              {#if c.argumentNodeIds.length === 1}
                <span title={nodePreview(c.argumentNodeIds[0])}>Refs 1 node: {nodePreview(c.argumentNodeIds[0])}</span>
              {:else}
                <span>Refs {c.argumentNodeIds.length} nodes</span>
              {/if}
            </span>
            <span
              class="shrink-0 {supportClass(sc, totalRuns)}"
              title={totalRuns > 1
                ? `Raised by ${sc} of ${totalRuns} review run${totalRuns !== 1 ? 's' : ''}`
                : 'Single-run critique'}
            >
              {sc}/{totalRuns}
            </span>
          </div>
        </div>
      {/each}
    </div>
  {/if}

  {#if showPromptModal}
    <div class="fixed inset-0 bg-black/50 flex items-center justify-center z-50 cursor-pointer" onclick={cancelPromptModal}>
      <div class="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-6 w-[700px] max-w-[90vw] max-h-[80vh] flex flex-col shadow-xl cursor-default" onclick={(e) => e.stopPropagation()}>
        <h3 class="m-0 mb-2 text-gray-900 dark:text-gray-100 text-base font-semibold">Critique Prompt</h3>
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
        <div class="flex items-center justify-between gap-3 mb-4">
          <div class="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
            <span>Runs:</span>
            <div class="inline-flex items-center border border-gray-300 dark:border-gray-600 rounded-md overflow-hidden">
              <button
                type="button"
                class="px-2 py-1 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer border-none bg-transparent"
                onclick={() => bumpRuns(-1)}
                disabled={runs <= 1}
                aria-label="Decrease runs"
              >−</button>
              <input
                type="number"
                min="1"
                max="5"
                step="1"
                class="w-10 text-center bg-transparent border-none text-gray-900 dark:text-gray-100 text-sm focus:outline-none"
                bind:value={runs}
                onchange={() => { runs = clampRuns(runs); }}
                onkeydown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) confirmPromptAndRun(); }}
              />
              <button
                type="button"
                class="px-2 py-1 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer border-none bg-transparent"
                onclick={() => bumpRuns(1)}
                disabled={runs >= 5}
                aria-label="Increase runs"
              >+</button>
            </div>
            <span class="text-xs text-gray-400 dark:text-gray-500">parallel passes (1–5)</span>
          </div>
        </div>
        <div class="flex gap-2 justify-end">
          <button class="px-4 py-2 rounded-md bg-primary-500 hover:bg-primary-600 text-white text-sm font-medium cursor-pointer border-none transition-colors" onclick={confirmPromptAndRun}>Critique</button>
          <button class="px-4 py-2 rounded-md border border-gray-300 dark:border-gray-600 bg-transparent text-gray-600 dark:text-gray-400 text-sm cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors" onclick={cancelPromptModal}>Cancel</button>
        </div>
      </div>
    </div>
  {/if}
</div>
