<script>
  import { tick } from 'svelte';
  import { ChevronRight, Search } from 'lucide-svelte';
  import { setActiveAnnotationId } from './annotations.svelte.js';
  import {
    getCitations,
    getActiveCitationId,
    setActiveCitationId,
    setCitationStatus,
    deleteCitation,
    restoreCitation,
    addCitationReply,
    deleteCitationReply,
    setCitationScouting,
    updateCitationScout,
  } from './citations.svelte.js';
  import { executeCommand, undo, getUndoToast } from './commandHistory.svelte.js';
  import { scoutCitation } from './scout.js';
  import { getExtractedText } from './documentContext.svelte.js';
  import { getModel } from './model.svelte.js';

  let { oncitationselect = () => {} } = $props();

  let citationTab = $state('unresolved');
  let citationTypeFilter = $state('all');
  let replyingTo = $state(null);
  let replyText = $state('');
  let expandedThreads = $state(new Set());
  let snippetPopoverId = $state(null);
  let pendingDeleteCitationId = $state(null);
  let scoutErrorToast = $state(null);

  async function handleScout(citation) {
    if (citation.scoutStatus === 'scouting') return;
    const previousScoutStatus = citation.scoutStatus;
    const previousScoutSummary = citation.scoutSummary || '';
    const previousScoutSourceUrl = citation.scoutSourceUrl || null;
    const previousScoutSourceSnippet = citation.scoutSourceSnippet || '';
    const previousScoutSourceName = citation.scoutSourceName || '';
    setCitationScouting(citation.id);
    try {
      const extractedText = getExtractedText();
      let context = citation.text || '';
      if (extractedText && extractedText.chunks) {
        const citationChunks = extractedText.chunks.filter((c) => c.pageNumber === citation.pageNumber);
        context = citationChunks.map((c) => c.text).join(' ');
      }

      const result = await scoutCitation(citation, context, getModel());
      updateCitationScout(citation.id, {
        scoutStatus: result.scoutStatus,
        scoutSummary: result.summary,
        scoutSourceUrl: result.sourceUrl,
        scoutSourceSnippet: result.sourceSnippet,
        scoutSourceName: result.sourceName,
      });
    } catch (e) {
      console.error('Scout failed:', e);
      updateCitationScout(citation.id, {
        scoutStatus: previousScoutStatus,
        scoutSummary: previousScoutSummary,
        scoutSourceUrl: previousScoutSourceUrl,
        scoutSourceSnippet: previousScoutSourceSnippet,
        scoutSourceName: previousScoutSourceName,
      });
      const requestId = e.request_id || e.headers?.get?.('x-request-id') || e.error?.request_id || '';
      scoutErrorToast = {
        message: 'Scout failed: ' + (e.message || 'Unknown error'),
        requestId: requestId || (typeof e === 'object' ? JSON.stringify(e).match(/"request_id":"([^"]+)"/)?.[1] || '' : ''),
      };
    }
  }

  function scoutStatusColor(status) {
    switch (status) {
      case 'supported': return 'text-green-600 border-green-500/30 bg-green-500/10';
      case 'questionable': return 'text-amber-600 border-amber-500/30 bg-amber-500/10';
      case 'contradictory': return 'text-red-600 border-red-500/30 bg-red-500/10';
      case 'not_found': return 'text-gray-500 border-gray-400/30 bg-gray-400/10';
      case 'scouting': return 'text-purple-500 border-purple-500/30 bg-purple-500/10';
      default: return '';
    }
  }

  function formatTime(ts) {
    const d = new Date(ts);
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) +
      ' ' + d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
  }

  function confirmDeleteCitation() {
    const id = pendingDeleteCitationId;
    pendingDeleteCitationId = null;
    const citationsList = getCitations();
    const citation = citationsList.find(c => c.id === id);
    if (!citation) return;
    const citationCopy = JSON.parse(JSON.stringify(citation));
    executeCommand({
      description: `Deleted citation: ${citation.citationRef}`,
      execute: () => deleteCitation(id),
      undo: () => {
        restoreCitation(citationCopy);
      },
    });
  }

  function citationTypeColor(type) {
    switch (type) {
      case 'Case Law': return 'text-blue-500 border-blue-500/25 bg-blue-500/10';
      case 'Statute': return 'text-purple-500 border-purple-500/25 bg-purple-500/10';
      case 'Regulation': return 'text-orange-500 border-orange-500/25 bg-orange-500/10';
      case 'Academic': return 'text-teal-500 border-teal-500/25 bg-teal-500/10';
      case 'Short Form': return 'text-gray-500 border-gray-500/25 bg-gray-500/10';
      default: return 'text-gray-400 border-gray-400/25 bg-gray-400/10';
    }
  }

  function citationStatusColor(status) {
    switch (status) {
      case 'unresolved': return 'text-amber-500 border-amber-500/25 bg-amber-500/10';
      case 'resolved': return 'text-gray-400 border-gray-400/25 bg-gray-400/10';
      default: return 'text-amber-500 border-amber-500/25 bg-amber-500/10';
    }
  }

  function startCitationReply(citationId) {
    replyingTo = citationId;
    replyText = '';
    expandedThreads = new Set([...expandedThreads, citationId]);
    tick().then(() => {
      const el = document.querySelector(`.reply-input[data-citation-id="${citationId}"] textarea`);
      if (el) el.focus();
    });
  }

  function submitCitationReply(citationId) {
    if (!replyText.trim()) return;
    addCitationReply(citationId, { comment: replyText.trim() });
    replyingTo = null;
    replyText = '';
  }

  function cancelReply() {
    replyingTo = null;
    replyText = '';
  }

  function toggleThread(citationId) {
    const next = new Set(expandedThreads);
    if (next.has(citationId)) {
      next.delete(citationId);
    } else {
      next.add(citationId);
    }
    expandedThreads = next;
  }

  const citationsList = $derived(getCitations());
  const activeCitationId = $derived(getActiveCitationId());
  const citationTypes = $derived([...new Set(citationsList.map(c => c.citationType))].sort());
  const unresolvedCitationCount = $derived(citationsList.filter(c => c.citationStatus !== 'resolved' && (citationTypeFilter === 'all' || c.citationType === citationTypeFilter)).length);
  const resolvedCitationCount = $derived(citationsList.filter(c => c.citationStatus === 'resolved' && (citationTypeFilter === 'all' || c.citationType === citationTypeFilter)).length);
  const filteredCitations = $derived(
    citationsList.filter(c => (citationTab === 'unresolved' ? c.citationStatus !== 'resolved' : c.citationStatus === 'resolved') && (citationTypeFilter === 'all' || c.citationType === citationTypeFilter))
  );

  function getCitationContext(citation) {
    const extractedText = getExtractedText();
    if (!extractedText || !extractedText.chunks) return null;
    const refText = citation.citationRef;
    const contextChunks = extractedText.chunks.filter(c =>
      c.pageNumber === citation.pageNumber && c.text.includes(refText)
    );
    if (contextChunks.length === 0) return null;
    return contextChunks.map(c => c.text).join(' ');
  }

  export function scrollToCitation(id) {
    tick().then(() => {
      const el = document.querySelector(`.citation-card[data-citation-id="${id}"]`);
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    });
  }
</script>

<div
  class="flex-1 flex flex-col overflow-hidden min-h-0"
  onclick={(e) => { if (e.target.closest('.citation-card')) return; setActiveCitationId(null); }}
  role="presentation"
>
  <div class="flex border-b border-gray-200 dark:border-gray-700 shrink-0">
    <button
      class="flex-1 py-2 px-3 text-xs font-semibold bg-transparent border-none border-b-2 cursor-pointer flex items-center justify-center gap-1.5 transition-colors {citationTab === 'unresolved' ? 'text-gray-900 dark:text-gray-100 border-b-primary-500' : 'text-gray-400 dark:text-gray-500 border-b-transparent hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800'}"
      onclick={() => citationTab = 'unresolved'}
    >
      Unresolved{#if unresolvedCitationCount > 0}<span class="text-[0.7rem] rounded-full px-1.5 min-w-[18px] text-center {citationTab === 'unresolved' ? 'bg-primary-500/15 text-primary-500' : 'bg-gray-200 dark:bg-gray-700 text-gray-500 dark:text-gray-400'}">{unresolvedCitationCount}</span>{/if}
    </button>
    <button
      class="flex-1 py-2 px-3 text-xs font-semibold bg-transparent border-none border-b-2 cursor-pointer flex items-center justify-center gap-1.5 transition-colors {citationTab === 'resolved' ? 'text-gray-900 dark:text-gray-100 border-b-gray-400' : 'text-gray-400 dark:text-gray-500 border-b-transparent hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800'}"
      onclick={() => citationTab = 'resolved'}
    >
      Resolved{#if resolvedCitationCount > 0}<span class="text-[0.7rem] rounded-full px-1.5 min-w-[18px] text-center {citationTab === 'resolved' ? 'bg-gray-500/15 text-gray-500' : 'bg-gray-200 dark:bg-gray-700 text-gray-500 dark:text-gray-400'}">{resolvedCitationCount}</span>{/if}
    </button>
  </div>

  {#if citationTypes.length > 0}
    <div class="flex items-center gap-1.5 px-3 py-2 border-b border-gray-200 dark:border-gray-700 overflow-x-auto shrink-0">
      <button
        class="px-2 py-0.5 text-[0.65rem] font-semibold rounded-full border whitespace-nowrap cursor-pointer transition-colors {citationTypeFilter === 'all' ? 'bg-primary-500/15 text-primary-600 dark:text-primary-400 border-primary-500/30' : 'bg-transparent text-gray-400 dark:text-gray-500 border-gray-300 dark:border-gray-600 hover:text-gray-600 dark:hover:text-gray-300'}"
        onclick={() => citationTypeFilter = 'all'}
      >All</button>
      {#each citationTypes as type}
        <button
          class="px-2 py-0.5 text-[0.65rem] font-semibold rounded-full border whitespace-nowrap cursor-pointer transition-colors {citationTypeFilter === type ? citationTypeColor(type) : 'bg-transparent text-gray-400 dark:text-gray-500 border-gray-300 dark:border-gray-600 hover:text-gray-600 dark:hover:text-gray-300'}"
          onclick={() => citationTypeFilter = citationTypeFilter === type ? 'all' : type}
        >{type}</button>
      {/each}
    </div>
  {/if}

  {#if filteredCitations.length === 0}
    <div class="px-4 py-6 text-center text-gray-400 dark:text-gray-500">
      <p class="m-1 text-sm">No {citationTab} citations.</p>
      {#if citationTab === 'unresolved'}
        <p class="m-1 text-xs text-gray-400 dark:text-gray-600">Citations are auto-detected when a document is uploaded.</p>
      {/if}
    </div>
  {:else}
    <div class="flex-1 overflow-y-auto p-2 flex flex-col gap-2">
      {#each filteredCitations as citation (citation.id)}
        <div
          class="citation-card p-2.5 px-3 rounded-lg bg-white dark:bg-gray-800 border cursor-pointer transition-colors {activeCitationId === citation.id ? 'border-purple-500 shadow-sm' : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600'}"
          data-citation-id={citation.id}
          onclick={() => { setActiveCitationId(citation.id); setActiveAnnotationId(null); oncitationselect(citation.id); }}
          role="button"
          tabindex="0"
        >
          <div class="flex items-center gap-1.5 mb-1.5">
            <span class="px-1.5 py-px text-[0.65rem] font-semibold uppercase tracking-wide rounded border {citationTypeColor(citation.citationType)}">{citation.citationType}</span>
            <span class="text-xs font-medium text-gray-700 dark:text-gray-300 mr-auto truncate max-w-[60%]" title={citation.citationRef}>{citation.citationRef}</span>
            <span class="px-1.5 py-px text-[0.65rem] font-semibold uppercase tracking-wide rounded border {citationStatusColor(citation.citationStatus)}">{citation.citationStatus === 'resolved' ? 'resolved' : 'unresolved'}</span>
          </div>

          {#if citation.citationType === 'Statute' || citation.citationType === 'Regulation'}
            {@const context = getCitationContext(citation)}
            {#if context}
              <div class="mb-2 pl-2 border-l-2 border-amber-400/50 text-xs text-gray-600 dark:text-gray-400 leading-relaxed">
                <span class="text-[0.65rem] font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-500 block mb-0.5">Used in context:</span>
                <span class="italic">{context.length > 300 ? context.slice(0, 300) + '...' : context}</span>
              </div>
            {/if}
          {/if}

          {#if citation.comment}
            <p class="m-0 mb-2 text-sm text-gray-700 dark:text-gray-300 leading-snug">{citation.comment}</p>
          {/if}

          <div class="flex gap-1.5">
            {#if ['Statute', 'Academic', 'Case Law', 'Regulation'].includes(citation.citationType) && citation.citationStatus !== 'resolved'}
              {#if citation.scoutStatus === 'scouting'}
                <button
                  class="px-2 py-0.5 text-[0.7rem] rounded border border-purple-500/30 bg-transparent text-purple-400 cursor-not-allowed transition-colors flex items-center gap-1 opacity-60"
                  disabled
                >
                  <Search size={11} class="animate-pulse" />
                  Scouting...
                </button>
              {:else}
                <button
                  class="px-2 py-0.5 text-[0.7rem] rounded border border-purple-500/30 bg-transparent text-purple-500 cursor-pointer hover:bg-purple-500/10 transition-colors flex items-center gap-1"
                  onclick={(e) => { e.stopPropagation(); handleScout(citation); }}
                >
                  <Search size={11} />
                  {citation.scoutStatus ? 'Re-scout' : 'Scout'}
                </button>
              {/if}
            {/if}
            {#if citation.citationStatus !== 'resolved'}
              <button
                class="px-2 py-0.5 text-[0.7rem] rounded border border-gray-300 dark:border-gray-600 bg-transparent text-gray-500 dark:text-gray-400 cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                onclick={(e) => { e.stopPropagation(); setCitationStatus(citation.id, 'resolved'); }}
              >Resolve</button>
            {:else}
              <button
                class="px-2 py-0.5 text-[0.7rem] rounded border border-amber-500/30 bg-transparent text-amber-500 cursor-pointer hover:bg-amber-500/10 transition-colors"
                onclick={(e) => { e.stopPropagation(); setCitationStatus(citation.id, 'unresolved'); }}
              >Reopen</button>
            {/if}
            {#if citation.citationStatus !== 'resolved' && (!citation.replies || citation.replies.length === 0)}
              <button class="px-2 py-0.5 text-[0.7rem] rounded border border-gray-300 dark:border-gray-600 bg-transparent text-gray-500 dark:text-gray-400 cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors" onclick={(e) => { e.stopPropagation(); startCitationReply(citation.id); }}>Reply</button>
            {/if}
            <button
              class="px-2 py-0.5 text-[0.7rem] rounded border border-gray-300 dark:border-gray-600 bg-transparent text-gray-500 dark:text-gray-400 cursor-pointer hover:text-red-500 hover:border-red-500/30 transition-colors"
              onclick={(e) => { e.stopPropagation(); pendingDeleteCitationId = citation.id; }}
            >Delete</button>
          </div>

          {#if ['Statute', 'Academic', 'Case Law', 'Regulation'].includes(citation.citationType)}
            {#if citation.scoutStatus && citation.scoutStatus !== 'scouting'}
              <div class="mt-2 pt-2 border-t border-gray-100 dark:border-gray-700/50">
                <!-- svelte-ignore a11y_no_static_element_interactions -->
                <!-- svelte-ignore a11y_click_events_have_key_events -->
                <div class="cursor-pointer" onclick={(e) => {
                  if (e.target.closest('a')) return;
                  e.stopPropagation();
                  snippetPopoverId = snippetPopoverId === citation.id ? null : citation.id;
                }}>
                <div class="flex items-center gap-1.5 mb-1.5">
                  <span class="text-[0.65rem] font-semibold uppercase tracking-wide">Scout:</span>
                  <span
                    class="px-1.5 py-px text-[0.65rem] font-semibold uppercase tracking-wide rounded border cursor-pointer {scoutStatusColor(citation.scoutStatus)}"
                    title="Click to view source snippet"
                  >{citation.scoutStatus}</span>
                  {#if citation.scoutSourceUrl}
                    <a
                      href={citation.scoutSourceUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      class="text-[0.65rem] text-primary-500 hover:text-primary-600 underline"
                      onclick={(e) => e.stopPropagation()}
                    >{citation.scoutSourceName || 'Source'}</a>
                  {/if}
                </div>
                <p class="m-0 mb-1.5 text-xs text-gray-600 dark:text-gray-400 leading-snug">{citation.scoutSummary}</p>
                </div>

                {#if snippetPopoverId === citation.id && citation.scoutSourceSnippet}
                  <div class="mt-1.5 p-2.5 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-md text-xs text-gray-600 dark:text-gray-400 leading-relaxed max-h-[200px] overflow-y-auto">
                    <div class="flex items-center justify-between mb-1.5">
                      <span class="text-[0.65rem] font-semibold uppercase tracking-wide text-gray-500">Source Excerpt</span>
                      <button
                        class="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 bg-transparent border-none cursor-pointer p-0"
                        onclick={(e) => { e.stopPropagation(); snippetPopoverId = null; }}
                      >&times;</button>
                    </div>
                    <p class="m-0 italic whitespace-pre-wrap">{citation.scoutSourceSnippet}</p>
                  </div>
                {/if}

              </div>
            {/if}
          {/if}

          {#if citation.replies && citation.replies.length > 0}
            <button
              class="flex items-center gap-1 mt-2 py-0.5 border-none bg-transparent text-primary-500 text-xs cursor-pointer hover:text-primary-600 dark:hover:text-primary-400 transition-colors"
              onclick={(e) => { e.stopPropagation(); toggleThread(citation.id); }}
            >
              <ChevronRight size={12} class="{expandedThreads.has(citation.id) ? 'rotate-90' : ''} transition-transform" />
              {citation.replies.length} {citation.replies.length === 1 ? 'reply' : 'replies'}
            </button>

            {#if expandedThreads.has(citation.id)}
              <div class="mt-1.5 pl-3 border-l-2 border-gray-200 dark:border-gray-700 flex flex-col gap-1.5">
                {#each citation.replies as reply, replyIndex (reply.id)}
                  <div class="p-2 rounded bg-gray-50 dark:bg-gray-800/50 border border-gray-100 dark:border-gray-700/50">
                    <div class="flex items-center gap-1.5 mb-1">
                      <span class="text-xs font-semibold text-gray-600 dark:text-gray-400">{reply.author}</span>
                      <span class="text-[0.7rem] text-gray-400 dark:text-gray-500">{formatTime(reply.timestamp)}</span>
                    </div>
                    <p class="m-0 mb-1 text-xs text-gray-700 dark:text-gray-300 leading-snug">{reply.comment}</p>
                    <div class="flex gap-1.5">
                      {#if replyIndex === citation.replies.length - 1}
                        <button class="px-1.5 py-px text-[0.65rem] rounded border border-gray-300 dark:border-gray-600 bg-transparent text-gray-500 dark:text-gray-400 cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700" onclick={(e) => { e.stopPropagation(); startCitationReply(citation.id); }}>Reply</button>
                      {/if}
                      <button class="px-1.5 py-px text-[0.65rem] rounded border border-gray-300 dark:border-gray-600 bg-transparent text-gray-500 dark:text-gray-400 cursor-pointer hover:text-red-500 hover:border-red-500/30" onclick={(e) => { e.stopPropagation(); deleteCitationReply(citation.id, reply.id); }}>Delete</button>
                    </div>
                  </div>
                {/each}
              </div>
            {/if}
          {/if}

          {#if replyingTo === citation.id}
            <div class="reply-input mt-2 pl-3 border-l-2 border-primary-500/30" data-citation-id={citation.id} onclick={(e) => e.stopPropagation()}>
              <textarea
                bind:value={replyText}
                placeholder="Write a reply..."
                class="w-full min-h-[50px] p-1.5 bg-gray-50 dark:bg-gray-900 border border-gray-300 dark:border-gray-600 rounded text-xs text-gray-900 dark:text-gray-100 resize-y mb-1.5 focus:outline-none focus:border-primary-500"
                onkeydown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submitCitationReply(citation.id); }
                  if (e.key === 'Escape') cancelReply();
                }}
              ></textarea>
              <div class="flex gap-1.5">
                <button class="px-2 py-0.5 text-xs rounded border border-primary-500/30 bg-transparent text-primary-500 cursor-pointer hover:bg-primary-500/10" onclick={() => submitCitationReply(citation.id)}>Reply</button>
                <button class="px-2 py-0.5 text-xs rounded border border-gray-300 dark:border-gray-600 bg-transparent text-gray-500 cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700" onclick={cancelReply}>Cancel</button>
              </div>
            </div>
          {/if}
        </div>
      {/each}
    </div>
  {/if}
</div>

{#if scoutErrorToast}
  <div class="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 flex flex-col gap-1.5 px-4 py-2.5 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 border border-red-300 dark:border-red-700 rounded-lg shadow-xl text-sm max-w-[500px]">
    <div class="flex items-center gap-3">
      <span class="text-xs text-red-600 dark:text-red-400">{scoutErrorToast.message}</span>
      <button
        class="px-2.5 py-1 text-xs font-semibold rounded border border-gray-300 dark:border-gray-600 bg-transparent text-gray-700 dark:text-gray-300 cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors shrink-0"
        onclick={() => scoutErrorToast = null}
      >Dismiss</button>
    </div>
    {#if scoutErrorToast.requestId}
      <span class="text-[0.6rem] text-gray-400 dark:text-gray-500 font-mono">Request ID: {scoutErrorToast.requestId}</span>
    {/if}
  </div>
{/if}

{#if getUndoToast()}
  <div class="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 px-4 py-2.5 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 border border-gray-200 dark:border-gray-700 rounded-lg shadow-xl text-sm">
    <span class="text-xs">{getUndoToast().description}</span>
    <button
      class="px-2.5 py-1 text-xs font-semibold rounded border border-gray-300 dark:border-gray-600 bg-transparent text-gray-700 dark:text-gray-300 cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
      onclick={undo}
    >Undo</button>
  </div>
{/if}

{#if pendingDeleteCitationId}
  <div class="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onclick={() => pendingDeleteCitationId = null} role="presentation">
    <div class="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-5 w-[350px] max-w-[90vw] shadow-xl" onclick={(e) => e.stopPropagation()} role="presentation">
      <h3 class="m-0 mb-2 text-gray-900 dark:text-gray-100 text-sm font-semibold">Delete Citation</h3>
      <p class="m-0 mb-4 text-gray-500 dark:text-gray-400 text-xs leading-relaxed">Are you sure you want to delete this citation? You can undo this action shortly after.</p>
      <div class="flex gap-2 justify-end">
        <button class="px-3 py-1.5 rounded-md bg-red-600 hover:bg-red-700 text-white text-xs font-medium cursor-pointer border-none transition-colors" onclick={confirmDeleteCitation}>Delete</button>
        <button class="px-3 py-1.5 rounded-md border border-gray-300 dark:border-gray-600 bg-transparent text-gray-600 dark:text-gray-400 text-xs cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors" onclick={() => pendingDeleteCitationId = null}>Cancel</button>
      </div>
    </div>
  </div>
{/if}
