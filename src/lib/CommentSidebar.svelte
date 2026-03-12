<script>
  import {
    getAnnotations,
    getActiveAnnotationId,
    setActiveAnnotationId,
    updateAnnotationComment,
    resolveAnnotation,
    deleteAnnotation,
  } from './annotations.svelte.js';

  let { collapsed = $bindable(false), onselect = () => {} } = $props();

  let editingId = $state(null);
  let editText = $state('');

  function formatTime(ts) {
    const d = new Date(ts);
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) +
      ' ' + d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
  }

  function startEdit(annotation) {
    editingId = annotation.id;
    editText = annotation.comment;
  }

  function saveEdit(id) {
    updateAnnotationComment(id, editText);
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

  const annotations = $derived(getAnnotations());
  const activeId = $derived(getActiveAnnotationId());
  const unresolvedCount = $derived(annotations.filter(a => !a.resolved).length);
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
            onclick={() => handleClick(annotation.id)}
            role="button"
            tabindex="0"
          >
            <div class="comment-meta">
              <span class="author">{annotation.author}</span>
              <span class="time">{formatTime(annotation.timestamp)}</span>
            </div>

            <blockquote class="quoted-text">"{annotation.text}"</blockquote>

            {#if editingId === annotation.id}
              <textarea
                bind:value={editText}
                class="edit-input"
                onkeydown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); saveEdit(annotation.id); }
                  if (e.key === 'Escape') cancelEdit();
                }}
              ></textarea>
              <div class="edit-actions">
                <button class="btn-save" onclick={() => saveEdit(annotation.id)}>Save</button>
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
              <button class="btn-delete" onclick={(e) => { e.stopPropagation(); deleteAnnotation(annotation.id); }}>Delete</button>
            </div>
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
    justify-content: space-between;
    margin-bottom: 6px;
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
    overflow: hidden;
    text-overflow: ellipsis;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
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
</style>
