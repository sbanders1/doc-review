<script>
  import { tick } from 'svelte';
  import { ChevronLeft, ChevronRight, Pencil, Trash2, Check, Reply, RotateCcw } from 'lucide-svelte';
  import {
    getAnnotations,
    getActiveAnnotationId,
    setActiveAnnotationId,
    updateAnnotationComment,
    updateAnnotationPriority,
    resolveAnnotation,
    deleteAnnotation,
    addReply,
    updateReplyComment,
    resolveReply,
    deleteReply,
  } from './annotations.svelte.js';

  let { collapsed = $bindable(false), onselect = () => {} } = $props();

  let sidebarWidth = $state(320);

  function startResize(e) {
    e.preventDefault();
    const startX = e.clientX;
    const startWidth = sidebarWidth;
    function onMouseMove(e) {
      sidebarWidth = Math.max(200, Math.min(800, startWidth - (e.clientX - startX)));
    }
    function onMouseUp() {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    }
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
  }

  let activeTab = $state('open');
  let editingId = $state(null);
  let editText = $state('');
  let replyingTo = $state(null);
  let replyText = $state('');
  let expandedThreads = $state(new Set());
  let priorityDropdownId = $state(null);

  function formatTime(ts) {
    const d = new Date(ts);
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) +
      ' ' + d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
  }

  function startEdit(item) {
    editingId = item.id;
    editText = item.comment;
  }

  function saveEdit(annotationId, replyId) {
    if (replyId) {
      updateReplyComment(annotationId, replyId, editText);
    } else {
      updateAnnotationComment(annotationId, editText);
    }
    editingId = null;
    editText = '';
  }

  function cancelEdit() {
    editingId = null;
    editText = '';
  }

  function handleClick(id) {
    setActiveAnnotationId(id);
    onselect(id);
  }

  function startReply(annotationId) {
    replyingTo = annotationId;
    replyText = '';
    expandedThreads = new Set([...expandedThreads, annotationId]);
    tick().then(() => {
      const el = document.querySelector(`.reply-input[data-annotation-id="${annotationId}"] textarea`);
      if (el) el.focus();
    });
  }

  function submitReply(annotationId) {
    if (!replyText.trim()) return;
    addReply(annotationId, { comment: replyText.trim() });
    replyingTo = null;
    replyText = '';
  }

  function cancelReply() {
    replyingTo = null;
    replyText = '';
  }

  function toggleThread(annotationId) {
    const next = new Set(expandedThreads);
    if (next.has(annotationId)) {
      next.delete(annotationId);
    } else {
      next.add(annotationId);
    }
    expandedThreads = next;
  }

  const annotations = $derived(getAnnotations());
  const activeId = $derived(getActiveAnnotationId());
  const unresolvedCount = $derived(annotations.filter(a => !a.resolved).length);
  const resolvedCount = $derived(annotations.filter(a => a.resolved).length);
  const filteredAnnotations = $derived(
    activeTab === 'open'
      ? annotations.filter(a => !a.resolved)
      : annotations.filter(a => a.resolved)
  );

  export function scrollToComment(id) {
    collapsed = false;
    tick().then(() => {
      const el = document.querySelector(`.comment-card[data-annotation-id="${id}"]`);
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    });
  }
</script>

{#if collapsed}
  <button
    class="flex flex-col items-center gap-1 py-2 px-1.5 border-none border-l border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 text-gray-400 dark:text-gray-500 cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-800 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
    onclick={() => collapsed = false}
    title="Show comments"
  >
    <ChevronLeft size={18} />
    {#if unresolvedCount > 0}
      <span class="text-[0.7rem] bg-primary-500 text-white rounded-full px-1.5 py-px min-w-[16px] text-center">{unresolvedCount}</span>
    {/if}
  </button>
{:else}
  <div
    class="relative bg-gray-50 dark:bg-gray-900 border-l border-gray-200 dark:border-gray-700 flex flex-col overflow-hidden"
    style="width:{sidebarWidth}px;min-width:{sidebarWidth}px"
    onclick={(e) => { if (e.target.closest('.comment-card')) return; setActiveAnnotationId(null); }}
  >
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div class="absolute top-0 -left-[3px] w-[6px] h-full cursor-col-resize z-10 hover:bg-primary-500/30" onmousedown={startResize}></div>

    <div class="flex items-center justify-between px-4 py-3 border-b border-gray-200 dark:border-gray-700">
      <h3 class="m-0 text-sm font-semibold text-gray-900 dark:text-gray-100">Comments</h3>
      <button
        class="flex items-center justify-center w-7 h-7 rounded-md border border-gray-200 dark:border-gray-600 bg-transparent text-gray-400 dark:text-gray-500 cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-800 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
        onclick={() => collapsed = true}
        title="Hide comments"
      >
        <ChevronRight size={16} />
      </button>
    </div>

    <div class="flex border-b border-gray-200 dark:border-gray-700">
      <button
        class="flex-1 py-2 px-3 text-xs font-semibold bg-transparent border-none border-b-2 cursor-pointer flex items-center justify-center gap-1.5 transition-colors {activeTab === 'open' ? 'text-gray-900 dark:text-gray-100 border-b-primary-500' : 'text-gray-400 dark:text-gray-500 border-b-transparent hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800'}"
        onclick={() => activeTab = 'open'}
      >
        Open{#if unresolvedCount > 0}<span class="text-[0.7rem] rounded-full px-1.5 min-w-[18px] text-center {activeTab === 'open' ? 'bg-primary-500/15 text-primary-500' : 'bg-gray-200 dark:bg-gray-700 text-gray-500 dark:text-gray-400'}">{unresolvedCount}</span>{/if}
      </button>
      <button
        class="flex-1 py-2 px-3 text-xs font-semibold bg-transparent border-none border-b-2 cursor-pointer flex items-center justify-center gap-1.5 transition-colors {activeTab === 'resolved' ? 'text-gray-900 dark:text-gray-100 border-b-primary-500' : 'text-gray-400 dark:text-gray-500 border-b-transparent hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800'}"
        onclick={() => activeTab = 'resolved'}
      >
        Resolved{#if resolvedCount > 0}<span class="text-[0.7rem] rounded-full px-1.5 min-w-[18px] text-center {activeTab === 'resolved' ? 'bg-primary-500/15 text-primary-500' : 'bg-gray-200 dark:bg-gray-700 text-gray-500 dark:text-gray-400'}">{resolvedCount}</span>{/if}
      </button>
    </div>

    {#if filteredAnnotations.length === 0}
      <div class="px-4 py-6 text-center text-gray-400 dark:text-gray-500">
        {#if activeTab === 'open'}
          <p class="m-1 text-sm">No open comments.</p>
          <p class="m-1 text-xs text-gray-400 dark:text-gray-600">Select text on the document to add a comment.</p>
        {:else}
          <p class="m-1 text-sm">No resolved comments.</p>
        {/if}
      </div>
    {:else}
      <div class="flex-1 overflow-y-auto p-2 flex flex-col gap-2">
        {#each filteredAnnotations as annotation (annotation.id)}
          <div
            class="comment-card p-2.5 px-3 rounded-lg bg-white dark:bg-gray-800 border cursor-pointer transition-colors {activeId === annotation.id ? 'border-primary-500 shadow-sm' : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600'} {annotation.resolved ? 'opacity-60' : ''}"
            data-annotation-id={annotation.id}
            onclick={() => handleClick(annotation.id)}
            role="button"
            tabindex="0"
          >
            <div class="flex items-center gap-1.5 mb-1.5">
              <span class="text-xs font-semibold text-gray-600 dark:text-gray-400">{annotation.author}</span>
              <span class="text-[0.7rem] text-gray-400 dark:text-gray-500 mr-auto">{formatTime(annotation.timestamp)}</span>
              <!-- svelte-ignore a11y_no_static_element_interactions -->
              <!-- svelte-ignore a11y_click_events_have_key_events -->
              <div class="ml-auto relative" onclick={(e) => e.stopPropagation()}>
                <span
                  class="px-1.5 py-px text-[0.65rem] font-semibold uppercase tracking-wide rounded border cursor-pointer inline-block whitespace-nowrap leading-snug hover:brightness-125
                    {annotation.priority === 'high' ? 'text-red-500 border-red-500/25 bg-red-500/10' :
                     annotation.priority === 'medium' ? 'text-amber-500 border-amber-500/25 bg-amber-500/10' :
                     annotation.priority === 'low' ? 'text-blue-500 border-blue-500/25 bg-blue-500/10' :
                     'text-gray-400 dark:text-gray-500 border-gray-300 dark:border-gray-600'}"
                  onclick={() => priorityDropdownId = priorityDropdownId === annotation.id ? null : annotation.id}
                >{annotation.priority ? annotation.priority : '—'}</span>
                {#if priorityDropdownId === annotation.id}
                  <div class="absolute right-0 top-full mt-0.5 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded-md shadow-lg z-20 overflow-hidden">
                    <button class="block w-full px-3 py-1 text-[0.7rem] font-semibold uppercase tracking-wide border-none bg-transparent cursor-pointer whitespace-nowrap text-left text-red-500 hover:bg-gray-100 dark:hover:bg-gray-700" onclick={() => { updateAnnotationPriority(annotation.id, 'high'); priorityDropdownId = null; }}>High</button>
                    <button class="block w-full px-3 py-1 text-[0.7rem] font-semibold uppercase tracking-wide border-none bg-transparent cursor-pointer whitespace-nowrap text-left text-amber-500 hover:bg-gray-100 dark:hover:bg-gray-700" onclick={() => { updateAnnotationPriority(annotation.id, 'medium'); priorityDropdownId = null; }}>Medium</button>
                    <button class="block w-full px-3 py-1 text-[0.7rem] font-semibold uppercase tracking-wide border-none bg-transparent cursor-pointer whitespace-nowrap text-left text-blue-500 hover:bg-gray-100 dark:hover:bg-gray-700" onclick={() => { updateAnnotationPriority(annotation.id, 'low'); priorityDropdownId = null; }}>Low</button>
                    <button class="block w-full px-3 py-1 text-[0.7rem] font-semibold uppercase tracking-wide border-none bg-transparent cursor-pointer whitespace-nowrap text-left text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700" onclick={() => { updateAnnotationPriority(annotation.id, null); priorityDropdownId = null; }}>None</button>
                  </div>
                {/if}
              </div>
            </div>

            <blockquote class="m-0 mb-2 pl-2 border-l-2 border-primary-500 text-xs text-gray-500 dark:text-gray-400 italic">"{annotation.text.length > 200 ? annotation.text.slice(0, 200) + '...' : annotation.text}"</blockquote>

            {#if editingId === annotation.id}
              <textarea
                bind:value={editText}
                class="w-full min-h-[60px] p-1.5 bg-gray-50 dark:bg-gray-900 border border-gray-300 dark:border-gray-600 rounded text-sm text-gray-900 dark:text-gray-100 resize-y mb-1.5 focus:outline-none focus:border-primary-500"
                onkeydown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); saveEdit(annotation.id, null); }
                  if (e.key === 'Escape') cancelEdit();
                }}
              ></textarea>
              <div class="flex gap-1.5 mb-1.5">
                <button class="px-2 py-0.5 text-xs rounded border border-primary-500/30 bg-transparent text-primary-500 cursor-pointer hover:bg-primary-500/10 transition-colors" onclick={() => saveEdit(annotation.id, null)}>Save</button>
                <button class="px-2 py-0.5 text-xs rounded border border-gray-300 dark:border-gray-600 bg-transparent text-gray-500 dark:text-gray-400 cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors" onclick={cancelEdit}>Cancel</button>
              </div>
            {:else}
              <p class="m-0 mb-2 text-sm text-gray-700 dark:text-gray-300 leading-snug">{annotation.comment}</p>
            {/if}

            <div class="flex gap-1.5">
              <button
                class="px-2 py-0.5 text-[0.7rem] rounded border bg-transparent cursor-pointer transition-colors {annotation.resolved ? 'text-green-500 border-green-500/30 hover:bg-green-500/10' : 'border-gray-300 dark:border-gray-600 text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700'}"
                onclick={(e) => { e.stopPropagation(); resolveAnnotation(annotation.id); }}
              >
                {annotation.resolved ? 'Reopen' : 'Resolve'}
              </button>
              {#if editingId !== annotation.id}
                <button class="px-2 py-0.5 text-[0.7rem] rounded border border-gray-300 dark:border-gray-600 bg-transparent text-gray-500 dark:text-gray-400 cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors" onclick={(e) => { e.stopPropagation(); startEdit(annotation); }}>Edit</button>
              {/if}
              {#if !annotation.replies || annotation.replies.length === 0}
                <button class="px-2 py-0.5 text-[0.7rem] rounded border border-gray-300 dark:border-gray-600 bg-transparent text-gray-500 dark:text-gray-400 cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors" onclick={(e) => { e.stopPropagation(); startReply(annotation.id); }}>Reply</button>
              {/if}
              <button class="px-2 py-0.5 text-[0.7rem] rounded border border-gray-300 dark:border-gray-600 bg-transparent text-gray-500 dark:text-gray-400 cursor-pointer hover:text-red-500 hover:border-red-500/30 transition-colors" onclick={(e) => { e.stopPropagation(); deleteAnnotation(annotation.id); }}>Delete</button>
            </div>

            {#if annotation.replies && annotation.replies.length > 0}
              <button
                class="flex items-center gap-1 mt-2 py-0.5 border-none bg-transparent text-primary-500 text-xs cursor-pointer hover:text-primary-600 dark:hover:text-primary-400 transition-colors"
                onclick={(e) => { e.stopPropagation(); toggleThread(annotation.id); }}
              >
                <ChevronRight size={12} class="{expandedThreads.has(annotation.id) ? 'rotate-90' : ''} transition-transform" />
                {annotation.replies.length} {annotation.replies.length === 1 ? 'reply' : 'replies'}
              </button>

              {#if expandedThreads.has(annotation.id)}
                <div class="mt-1.5 pl-3 border-l-2 border-gray-200 dark:border-gray-700 flex flex-col gap-1.5">
                  {#each annotation.replies as reply, replyIndex (reply.id)}
                    <div class="p-2 rounded bg-gray-50 dark:bg-gray-800/50 border border-gray-100 dark:border-gray-700/50 {reply.resolved ? 'opacity-50' : ''}">
                      <div class="flex items-center gap-1.5 mb-1">
                        <span class="text-xs font-semibold text-gray-600 dark:text-gray-400">{reply.author}</span>
                        <span class="text-[0.7rem] text-gray-400 dark:text-gray-500">{formatTime(reply.timestamp)}</span>
                      </div>

                      {#if editingId === reply.id}
                        <textarea
                          bind:value={editText}
                          class="w-full min-h-[50px] p-1.5 bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-600 rounded text-xs text-gray-900 dark:text-gray-100 resize-y mb-1.5 focus:outline-none focus:border-primary-500"
                          onkeydown={(e) => {
                            if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); saveEdit(annotation.id, reply.id); }
                            if (e.key === 'Escape') cancelEdit();
                          }}
                        ></textarea>
                        <div class="flex gap-1.5 mb-1">
                          <button class="px-2 py-0.5 text-[0.65rem] rounded border border-primary-500/30 bg-transparent text-primary-500 cursor-pointer hover:bg-primary-500/10" onclick={() => saveEdit(annotation.id, reply.id)}>Save</button>
                          <button class="px-2 py-0.5 text-[0.65rem] rounded border border-gray-300 dark:border-gray-600 bg-transparent text-gray-500 cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700" onclick={cancelEdit}>Cancel</button>
                        </div>
                      {:else}
                        <p class="m-0 mb-1 text-xs text-gray-700 dark:text-gray-300 leading-snug">{reply.comment}</p>
                      {/if}

                      <div class="flex gap-1.5">
                        <button
                          class="px-1.5 py-px text-[0.65rem] rounded border bg-transparent cursor-pointer transition-colors {reply.resolved ? 'text-green-500 border-green-500/30' : 'border-gray-300 dark:border-gray-600 text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700'}"
                          onclick={(e) => { e.stopPropagation(); resolveReply(annotation.id, reply.id); }}
                        >
                          {reply.resolved ? 'Reopen' : 'Resolve'}
                        </button>
                        {#if editingId !== reply.id}
                          <button class="px-1.5 py-px text-[0.65rem] rounded border border-gray-300 dark:border-gray-600 bg-transparent text-gray-500 dark:text-gray-400 cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700" onclick={(e) => { e.stopPropagation(); startEdit(reply); }}>Edit</button>
                        {/if}
                        {#if replyIndex === annotation.replies.length - 1}
                          <button class="px-1.5 py-px text-[0.65rem] rounded border border-gray-300 dark:border-gray-600 bg-transparent text-gray-500 dark:text-gray-400 cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700" onclick={(e) => { e.stopPropagation(); startReply(annotation.id); }}>Reply</button>
                        {/if}
                        <button class="px-1.5 py-px text-[0.65rem] rounded border border-gray-300 dark:border-gray-600 bg-transparent text-gray-500 dark:text-gray-400 cursor-pointer hover:text-red-500 hover:border-red-500/30" onclick={(e) => { e.stopPropagation(); deleteReply(annotation.id, reply.id); }}>Delete</button>
                      </div>
                    </div>
                  {/each}
                </div>
              {/if}
            {/if}

            {#if replyingTo === annotation.id}
              <div class="reply-input mt-2 pl-3 border-l-2 border-primary-500/30" data-annotation-id={annotation.id} onclick={(e) => e.stopPropagation()}>
                <textarea
                  bind:value={replyText}
                  placeholder="Write a reply..."
                  class="w-full min-h-[50px] p-1.5 bg-gray-50 dark:bg-gray-900 border border-gray-300 dark:border-gray-600 rounded text-xs text-gray-900 dark:text-gray-100 resize-y mb-1.5 focus:outline-none focus:border-primary-500"
                  onkeydown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submitReply(annotation.id); }
                    if (e.key === 'Escape') cancelReply();
                  }}
                ></textarea>
                <div class="flex gap-1.5">
                  <button class="px-2 py-0.5 text-xs rounded border border-primary-500/30 bg-transparent text-primary-500 cursor-pointer hover:bg-primary-500/10" onclick={() => submitReply(annotation.id)}>Reply</button>
                  <button class="px-2 py-0.5 text-xs rounded border border-gray-300 dark:border-gray-600 bg-transparent text-gray-500 cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700" onclick={cancelReply}>Cancel</button>
                </div>
              </div>
            {/if}
          </div>
        {/each}
      </div>
    {/if}
  </div>
{/if}
