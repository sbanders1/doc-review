<script>
  import { tick } from 'svelte';
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

  export function scrollToComment(id) {
    collapsed = false;
    tick().then(() => {
      const el = document.querySelector(`.comment-card[data-annotation-id="${id}"]`);
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    });
  }
</script>

{#if collapsed}
  <button class="expand-btn" onclick={() => collapsed = false} title="Show comments">
    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <polyline points="15 18 9 12 15 6"/>
    </svg>
    {#if unresolvedCount > 0}
      <span class="badge">{unresolvedCount}</span>
    {/if}
  </button>
{:else}
  <div class="sidebar" onclick={(e) => { if (e.target.closest('.comment-card')) return; setActiveAnnotationId(null); }}>
    <div class="sidebar-header">
      <h3>Comments</h3>
      <div class="header-right">
        <span class="count">{unresolvedCount} open</span>
        <button class="collapse-btn" onclick={() => collapsed = true} title="Hide comments">
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="9 18 15 12 9 6"/>
          </svg>
        </button>
      </div>
    </div>

    {#if annotations.length === 0}
      <div class="empty">
        <p>No comments yet.</p>
        <p class="hint">Select text on the document to add a comment.</p>
      </div>
    {:else}
      <div class="comment-list">
        {#each annotations as annotation (annotation.id)}
          <div
            class="comment-card"
            class:active={activeId === annotation.id}
            class:resolved={annotation.resolved}
            data-annotation-id={annotation.id}
            onclick={() => handleClick(annotation.id)}
            role="button"
            tabindex="0"
          >
            <div class="comment-meta">
              <span class="author">{annotation.author}</span>
              <span class="time">{formatTime(annotation.timestamp)}</span>
              <!-- svelte-ignore a11y_no_static_element_interactions -->
              <!-- svelte-ignore a11y_click_events_have_key_events -->
              <div class="priority-badge-wrapper" onclick={(e) => e.stopPropagation()}>
                <span
                  class="priority-badge priority-{annotation.priority || 'none'}"
                  onclick={() => priorityDropdownId = priorityDropdownId === annotation.id ? null : annotation.id}
                >{annotation.priority ? annotation.priority : '—'}</span>
                {#if priorityDropdownId === annotation.id}
                  <div class="priority-dropdown">
                    <button class="opt-high" onclick={() => { updateAnnotationPriority(annotation.id, 'high'); priorityDropdownId = null; }}>High</button>
                    <button class="opt-medium" onclick={() => { updateAnnotationPriority(annotation.id, 'medium'); priorityDropdownId = null; }}>Medium</button>
                    <button class="opt-low" onclick={() => { updateAnnotationPriority(annotation.id, 'low'); priorityDropdownId = null; }}>Low</button>
                    <button class="opt-none" onclick={() => { updateAnnotationPriority(annotation.id, null); priorityDropdownId = null; }}>None</button>
                  </div>
                {/if}
              </div>
            </div>

            <blockquote class="quoted-text">"{annotation.text.length > 200 ? annotation.text.slice(0, 200) + '...' : annotation.text}"</blockquote>

            {#if editingId === annotation.id}
              <textarea
                bind:value={editText}
                class="edit-input"
                onkeydown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); saveEdit(annotation.id, null); }
                  if (e.key === 'Escape') cancelEdit();
                }}
              ></textarea>
              <div class="edit-actions">
                <button class="btn-save" onclick={() => saveEdit(annotation.id, null)}>Save</button>
                <button class="btn-cancel" onclick={cancelEdit}>Cancel</button>
              </div>
            {:else}
              <p class="comment-text">{annotation.comment}</p>
            {/if}

            <div class="comment-actions">
              <button
                class="btn-resolve"
                class:is-resolved={annotation.resolved}
                onclick={(e) => { e.stopPropagation(); resolveAnnotation(annotation.id); }}
              >
                {annotation.resolved ? 'Reopen' : 'Resolve'}
              </button>
              {#if editingId !== annotation.id}
                <button class="btn-edit" onclick={(e) => { e.stopPropagation(); startEdit(annotation); }}>Edit</button>
              {/if}
              {#if !annotation.replies || annotation.replies.length === 0}
                <button class="btn-reply" onclick={(e) => { e.stopPropagation(); startReply(annotation.id); }}>Reply</button>
              {/if}
              <button class="btn-delete" onclick={(e) => { e.stopPropagation(); deleteAnnotation(annotation.id); }}>Delete</button>
            </div>

            {#if annotation.replies && annotation.replies.length > 0}
              <button
                class="thread-toggle"
                onclick={(e) => { e.stopPropagation(); toggleThread(annotation.id); }}
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"
                  class:chevron-expanded={expandedThreads.has(annotation.id)}
                >
                  <polyline points="9 18 15 12 9 6"/>
                </svg>
                {annotation.replies.length} {annotation.replies.length === 1 ? 'reply' : 'replies'}
              </button>

              {#if expandedThreads.has(annotation.id)}
                <div class="replies">
                  {#each annotation.replies as reply, replyIndex (reply.id)}
                    <div class="reply-card" class:resolved={reply.resolved}>
                      <div class="comment-meta">
                        <span class="author">{reply.author}</span>
                        <span class="time">{formatTime(reply.timestamp)}</span>
                      </div>

                      {#if editingId === reply.id}
                        <textarea
                          bind:value={editText}
                          class="edit-input"
                          onkeydown={(e) => {
                            if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); saveEdit(annotation.id, reply.id); }
                            if (e.key === 'Escape') cancelEdit();
                          }}
                        ></textarea>
                        <div class="edit-actions">
                          <button class="btn-save" onclick={() => saveEdit(annotation.id, reply.id)}>Save</button>
                          <button class="btn-cancel" onclick={cancelEdit}>Cancel</button>
                        </div>
                      {:else}
                        <p class="comment-text">{reply.comment}</p>
                      {/if}

                      <div class="comment-actions">
                        <button
                          class="btn-resolve"
                          class:is-resolved={reply.resolved}
                          onclick={(e) => { e.stopPropagation(); resolveReply(annotation.id, reply.id); }}
                        >
                          {reply.resolved ? 'Reopen' : 'Resolve'}
                        </button>
                        {#if editingId !== reply.id}
                          <button class="btn-edit" onclick={(e) => { e.stopPropagation(); startEdit(reply); }}>Edit</button>
                        {/if}
                        {#if replyIndex === annotation.replies.length - 1}
                          <button class="btn-reply" onclick={(e) => { e.stopPropagation(); startReply(annotation.id); }}>Reply</button>
                        {/if}
                        <button class="btn-delete" onclick={(e) => { e.stopPropagation(); deleteReply(annotation.id, reply.id); }}>Delete</button>
                      </div>
                    </div>
                  {/each}
                </div>
              {/if}
            {/if}

            {#if replyingTo === annotation.id}
              <div class="reply-input" data-annotation-id={annotation.id} onclick={(e) => e.stopPropagation()}>
                <textarea
                  bind:value={replyText}
                  placeholder="Write a reply..."
                  onkeydown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submitReply(annotation.id); }
                    if (e.key === 'Escape') cancelReply();
                  }}
                ></textarea>
                <div class="edit-actions">
                  <button class="btn-save" onclick={() => submitReply(annotation.id)}>Reply</button>
                  <button class="btn-cancel" onclick={cancelReply}>Cancel</button>
                </div>
              </div>
            {/if}
          </div>
        {/each}
      </div>
    {/if}
  </div>
{/if}

<style>
  .sidebar {
    width: 320px;
    min-width: 320px;
    background: #13132a;
    border-left: 1px solid #2a2a4a;
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }

  .sidebar-header {
    padding: 12px 16px;
    border-bottom: 1px solid #2a2a4a;
    display: flex;
    align-items: center;
    justify-content: space-between;
  }

  .sidebar-header h3 {
    margin: 0;
    font-size: 0.95rem;
    color: #ddd;
  }

  .header-right {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .count {
    font-size: 0.8rem;
    color: #888;
  }

  .collapse-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 28px;
    height: 28px;
    padding: 0;
    border-radius: 4px;
    border: 1px solid #333;
    background: transparent;
    color: #888;
    cursor: pointer;
  }

  .collapse-btn:hover {
    background: #2a2a4a;
    color: #ccc;
  }

  .expand-btn {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 4px;
    padding: 8px 6px;
    border: none;
    border-left: 1px solid #2a2a4a;
    background: #13132a;
    color: #888;
    cursor: pointer;
  }

  .expand-btn:hover {
    background: #1a1a35;
    color: #ccc;
  }

  .badge {
    font-size: 0.7rem;
    background: #646cff;
    color: white;
    border-radius: 8px;
    padding: 1px 5px;
    min-width: 16px;
    text-align: center;
  }

  .empty {
    padding: 24px 16px;
    text-align: center;
    color: #666;
  }

  .empty p {
    margin: 4px 0;
  }

  .hint {
    font-size: 0.8rem;
    color: #555;
  }

  .comment-list {
    flex: 1;
    overflow-y: auto;
    padding: 8px;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .comment-card {
    padding: 10px 12px;
    border-radius: 6px;
    background: #1a1a35;
    border: 1px solid #2a2a4a;
    cursor: pointer;
    transition: border-color 0.15s;
  }

  .comment-card:hover {
    border-color: #444;
  }

  .comment-card.active {
    border-color: #646cff;
  }

  .comment-card.resolved {
    opacity: 0.5;
  }

  .comment-meta {
    display: flex;
    align-items: center;
    gap: 6px;
    margin-bottom: 6px;
  }

  .comment-meta .time {
    margin-right: auto;
  }

  .priority-badge-wrapper {
    margin-left: auto;
    position: relative;
  }

  .priority-badge {
    padding: 1px 6px;
    font-size: 0.65rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.03em;
    border-radius: 3px;
    border: 1px solid;
    cursor: pointer;
    background: transparent;
    white-space: nowrap;
    line-height: 1.4;
    display: inline-block;
  }

  .priority-badge:hover {
    filter: brightness(1.3);
  }

  .priority-dropdown {
    position: absolute;
    right: 0;
    top: 100%;
    margin-top: 2px;
    background: #1a1a2e;
    border: 1px solid #444;
    border-radius: 4px;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.5);
    z-index: 20;
    overflow: hidden;
  }

  .priority-dropdown button {
    display: block;
    width: 100%;
    padding: 4px 12px;
    font-size: 0.7rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.03em;
    border: none;
    background: transparent;
    cursor: pointer;
    white-space: nowrap;
    text-align: left;
  }

  .priority-dropdown button:hover {
    background: #2a2a4a;
  }

  .priority-dropdown .opt-high { color: #f87171; }
  .priority-dropdown .opt-medium { color: #fbbf24; }
  .priority-dropdown .opt-low { color: #60a5fa; }
  .priority-dropdown .opt-none { color: #666; }

  .priority-high {
    color: #f87171;
    border-color: #f8717144;
    background: #f8717115;
  }

  .priority-medium {
    color: #fbbf24;
    border-color: #fbbf2444;
    background: #fbbf2415;
  }

  .priority-low {
    color: #60a5fa;
    border-color: #60a5fa44;
    background: #60a5fa15;
  }

  .priority-none {
    color: #666;
    border-color: #333;
  }

  .author {
    font-size: 0.8rem;
    font-weight: 600;
    color: #aaa;
  }

  .time {
    font-size: 0.75rem;
    color: #555;
  }

  .quoted-text {
    margin: 0 0 8px 0;
    padding: 4px 8px;
    border-left: 2px solid #646cff;
    font-size: 0.8rem;
    color: #999;
    font-style: italic;
  }

  .comment-text {
    margin: 0 0 8px 0;
    font-size: 0.85rem;
    color: #ccc;
    line-height: 1.4;
  }

  .edit-input {
    width: 100%;
    min-height: 60px;
    padding: 6px 8px;
    background: #0d0d1a;
    border: 1px solid #444;
    border-radius: 4px;
    color: #ddd;
    font-size: 0.85rem;
    font-family: inherit;
    resize: vertical;
    margin-bottom: 6px;
  }

  .edit-actions {
    display: flex;
    gap: 6px;
    margin-bottom: 6px;
  }

  .comment-actions {
    display: flex;
    gap: 6px;
  }

  .comment-actions button, .edit-actions button {
    padding: 2px 8px;
    font-size: 0.75rem;
    border-radius: 3px;
    border: 1px solid #333;
    background: transparent;
    color: #888;
    cursor: pointer;
  }

  .comment-actions button:hover, .edit-actions button:hover {
    background: #2a2a4a;
    color: #ccc;
  }

  .btn-resolve.is-resolved {
    color: #4ade80;
    border-color: #4ade8044;
  }

  .btn-save {
    color: #646cff !important;
    border-color: #646cff44 !important;
  }

  .btn-delete:hover {
    color: #f87171 !important;
    border-color: #f8717144 !important;
  }

  /* Thread toggle */
  .thread-toggle {
    display: flex;
    align-items: center;
    gap: 4px;
    margin-top: 8px;
    padding: 2px 0;
    border: none;
    background: transparent;
    color: #646cff;
    font-size: 0.75rem;
    cursor: pointer;
  }

  .thread-toggle:hover {
    color: #535bf2;
  }

  .thread-toggle svg {
    transition: transform 0.15s;
  }

  .thread-toggle :global(.chevron-expanded) {
    transform: rotate(90deg);
  }

  /* Replies */
  .replies {
    margin-top: 6px;
    padding-left: 12px;
    border-left: 2px solid #2a2a4a;
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .reply-card {
    padding: 8px 10px;
    border-radius: 4px;
    background: #141428;
    border: 1px solid #222244;
  }

  .reply-card.resolved {
    opacity: 0.5;
  }

  .reply-card .comment-text {
    font-size: 0.8rem;
  }

  .reply-card .comment-actions button {
    font-size: 0.7rem;
    padding: 1px 6px;
  }

  /* Reply input */
  .reply-input {
    margin-top: 8px;
    padding-left: 12px;
    border-left: 2px solid #646cff44;
  }

  .reply-input textarea {
    width: 100%;
    min-height: 50px;
    padding: 6px 8px;
    background: #0d0d1a;
    border: 1px solid #444;
    border-radius: 4px;
    color: #ddd;
    font-size: 0.8rem;
    font-family: inherit;
    resize: vertical;
    margin-bottom: 6px;
  }

  .reply-input textarea:focus {
    outline: none;
    border-color: #646cff;
  }
</style>
