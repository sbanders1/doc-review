<script>
  import { onMount, tick } from 'svelte';
  import {
    getAnnotations,
    getActiveAnnotationId,
    setActiveAnnotationId,
    addAnnotation,
  } from './annotations.svelte.js';

  let { content, onAnnotationClick = () => {} } = $props();

  let scrollArea;
  let pageWrapper;

  // Selection popover state
  let popover = $state({ visible: false, x: 0, y: 0 });
  let commentInput = $state({ visible: false, x: 0, y: 0, text: '', selectionRects: [] });
  let commentText = $state('');

  // Split content into lines for span-based rendering
  let lines = $derived(content ? content.split('\n') : []);

  onMount(() => {
    document.addEventListener('mouseup', handleMouseUp);
    document.addEventListener('mousedown', handleMouseDown);
    return () => {
      document.removeEventListener('mouseup', handleMouseUp);
      document.removeEventListener('mousedown', handleMouseDown);
    };
  });

  function handleClick(e) {
    if (e.target.closest('.selection-popover') || e.target.closest('.comment-input-popover')) return;

    const highlightEl = e.target.closest('.highlight-rect');
    if (highlightEl) {
      const id = highlightEl.dataset.annotationId;
      if (id) {
        setActiveAnnotationId(id);
        onAnnotationClick(id);
        return;
      }
    }

    // Click outside annotations — deactivate
    if (!e.target.closest('.comment-card')) {
      setActiveAnnotationId(null);
    }
  }

  function handleMouseDown(e) {
    if (!e.target.closest('.selection-popover') && !e.target.closest('.comment-input-popover')) {
      if (popover.visible) {
        popover = { visible: false, x: 0, y: 0 };
      }
      if (!e.target.closest('.comment-input-popover') && commentInput.visible) {
        commentInput = { ...commentInput, visible: false };
        commentText = '';
      }
    }
  }

  function handleMouseUp(e) {
    if (e.target.closest('.selection-popover') || e.target.closest('.comment-input-popover')) return;

    const selection = window.getSelection();
    if (!selection || selection.isCollapsed || !selection.toString().trim()) {
      if (popover.visible) {
        popover = { visible: false, x: 0, y: 0 };
      }
      return;
    }

    const range = selection.getRangeAt(0);
    if (!scrollArea || !scrollArea.contains(range.commonAncestorContainer)) {
      return;
    }

    const rect = range.getBoundingClientRect();
    const scrollRect = scrollArea.getBoundingClientRect();

    popover = {
      visible: true,
      x: rect.left + rect.width / 2 - scrollRect.left + scrollArea.scrollLeft,
      y: rect.top - scrollRect.top + scrollArea.scrollTop - 8,
    };
  }

  function startComment() {
    const selection = window.getSelection();
    if (!selection || selection.isCollapsed) return;

    const range = selection.getRangeAt(0);
    const selectedText = selection.toString().trim();
    if (!selectedText) return;

    if (!pageWrapper || !pageWrapper.contains(range.commonAncestorContainer)) return;

    const pageRect = pageWrapper.getBoundingClientRect();
    const clientRects = range.getClientRects();
    const rects = [];
    for (let i = 0; i < clientRects.length; i++) {
      const r = clientRects[i];
      rects.push({
        left: r.left - pageRect.left,
        top: r.top - pageRect.top,
        width: r.width,
        height: r.height,
      });
    }

    const scrollRect = scrollArea.getBoundingClientRect();
    const lastClientRect = clientRects[clientRects.length - 1];

    commentInput = {
      visible: true,
      x: lastClientRect.right - scrollRect.left + scrollArea.scrollLeft + 8,
      y: lastClientRect.top - scrollRect.top + scrollArea.scrollTop,
      text: selectedText,
      selectionRects: rects,
    };
    commentText = '';
    popover = { visible: false, x: 0, y: 0 };

    tick().then(() => {
      const ta = scrollArea.querySelector('.comment-input-popover textarea');
      if (ta) ta.focus();
    });
  }

  function submitComment() {
    if (!commentText.trim()) return;

    const pageWidth = pageWrapper.offsetWidth;
    const pageHeight = pageWrapper.offsetHeight;

    const normalizedRects = commentInput.selectionRects.map((r) => ({
      left: r.left / pageWidth,
      top: r.top / pageHeight,
      width: r.width / pageWidth,
      height: r.height / pageHeight,
    }));

    addAnnotation({
      pageNumber: 1,
      text: commentInput.text,
      rects: normalizedRects,
      comment: commentText.trim(),
    });

    commentInput = { ...commentInput, visible: false };
    commentText = '';
    window.getSelection()?.removeAllRanges();
  }

  function cancelComment() {
    commentInput = { ...commentInput, visible: false };
    commentText = '';
  }

  export function getPageWrappers() {
    return pageWrapper ? [pageWrapper] : [];
  }

  export function scrollToAnnotation(id) {
    tick().then(() => {
      renderHighlights();
      const el = scrollArea?.querySelector(`[data-annotation-id="${id}"]`);
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        return;
      }
    });
  }

  function renderHighlights() {
    const highlightLayer = pageWrapper?.querySelector('.highlight-layer');
    if (!highlightLayer) return;

    highlightLayer.innerHTML = '';

    const annotations = getAnnotations();
    const activeId = getActiveAnnotationId();
    const pageWidth = pageWrapper.offsetWidth;
    const pageHeight = pageWrapper.offsetHeight;

    // Render pending highlight while comment input is open
    if (commentInput.visible) {
      for (const rect of commentInput.selectionRects) {
        const el = document.createElement('div');
        el.className = 'highlight-rect active';
        el.style.left = `${rect.left}px`;
        el.style.top = `${rect.top}px`;
        el.style.width = `${rect.width}px`;
        el.style.height = `${rect.height}px`;
        highlightLayer.appendChild(el);
      }
    }

    for (const annotation of annotations) {
      if (annotation.pageNumber !== 1) continue;
      const isActive = annotation.id === activeId;

      for (const rect of annotation.rects) {
        const el = document.createElement('div');
        el.className = 'highlight-rect' + (isActive ? ' active' : '') + (annotation.resolved ? ' resolved' : '');
        el.dataset.annotationId = annotation.id;
        el.style.left = `${rect.left * pageWidth}px`;
        el.style.top = `${rect.top * pageHeight}px`;
        el.style.width = `${rect.width * pageWidth}px`;
        el.style.height = `${rect.height * pageHeight}px`;
        highlightLayer.appendChild(el);
      }
    }
  }

  $effect(() => {
    const _ = getAnnotations();
    const __ = getActiveAnnotationId();
    const ___ = commentInput.visible;
    renderHighlights();
  });

  onMount(() => {
    renderHighlights();
  });
</script>

<!-- svelte-ignore a11y_click_events_have_key_events -->
<!-- svelte-ignore a11y_no_static_element_interactions -->
<div class="text-container" bind:this={scrollArea} onclick={handleClick}>
  <div class="page-wrapper" bind:this={pageWrapper}>
    <div class="text-layer">
      {#if lines.length > 0}
        {#each lines as line, i}
          <span>{line}{#if i < lines.length - 1}{'\n'}{/if}</span>
        {/each}
      {:else}
        <span>{content}</span>
      {/if}
    </div>
    <div class="highlight-layer" data-page="1"></div>
  </div>

  {#if popover.visible}
    <div
      class="selection-popover"
      style="left: {popover.x}px; top: {popover.y}px;"
    >
      <button onclick={startComment}>Add Comment</button>
    </div>
  {/if}

  {#if commentInput.visible}
    <div
      class="comment-input-popover"
      style="left: {commentInput.x}px; top: {commentInput.y}px;"
    >
      <div class="comment-input-header">Comment on selection</div>
      <textarea
        bind:value={commentText}
        placeholder="Write a comment..."
        onkeydown={(e) => {
          if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submitComment(); }
          if (e.key === 'Escape') cancelComment();
        }}
      ></textarea>
      <div class="comment-input-actions">
        <button class="btn-submit" onclick={submitComment}>Comment</button>
        <button class="btn-cancel" onclick={cancelComment}>Cancel</button>
      </div>
    </div>
  {/if}
</div>

<style>
  .text-container {
    flex: 1;
    min-height: 0;
    overflow: auto;
    background: #0d0d1a;
    position: relative;
  }

  .page-wrapper {
    position: relative;
    padding: 24px 32px;
    min-height: 100%;
  }

  .text-layer {
    font-family: 'Courier New', Courier, monospace;
    font-size: 0.9rem;
    line-height: 1.6;
    color: #ddd;
    white-space: pre-wrap;
    word-wrap: break-word;
  }

  .text-layer span {
    position: relative;
  }

  .text-container :global(.highlight-layer) {
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    pointer-events: none;
    z-index: 1;
  }

  .text-container :global(.highlight-rect) {
    position: absolute;
    background: rgba(255, 200, 0, 0.15);
    border-bottom: 2px solid rgba(255, 200, 0, 0.6);
    pointer-events: auto;
    cursor: pointer;
  }

  .text-container :global(.highlight-rect:hover) {
    background: rgba(255, 200, 0, 0.25);
    border-bottom-color: rgba(255, 200, 0, 0.9);
  }

  .text-container :global(.highlight-rect.active) {
    background: rgba(100, 108, 255, 0.2);
    border-bottom: 2px solid rgba(100, 108, 255, 0.8);
  }

  .text-container :global(.highlight-rect.resolved) {
    opacity: 0.4;
  }

  .selection-popover {
    position: absolute;
    transform: translateX(-50%) translateY(-100%);
    z-index: 10;
  }

  .selection-popover button {
    padding: 6px 14px;
    border-radius: 6px;
    border: 1px solid #555;
    background: #1a1a2e;
    color: #ddd;
    font-size: 0.85rem;
    cursor: pointer;
    white-space: nowrap;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.5);
  }

  .selection-popover button:hover {
    background: #2a2a4a;
    border-color: #646cff;
  }

  .comment-input-popover {
    position: absolute;
    z-index: 10;
    width: 280px;
    background: #1a1a2e;
    border: 1px solid #444;
    border-radius: 8px;
    box-shadow: 0 4px 16px rgba(0, 0, 0, 0.5);
    padding: 10px;
  }

  .comment-input-header {
    font-size: 0.8rem;
    color: #888;
    margin-bottom: 8px;
  }

  .comment-input-popover textarea {
    width: 100%;
    min-height: 70px;
    padding: 8px;
    background: #0d0d1a;
    border: 1px solid #333;
    border-radius: 4px;
    color: #ddd;
    font-size: 0.85rem;
    font-family: inherit;
    resize: vertical;
    margin-bottom: 8px;
  }

  .comment-input-popover textarea:focus {
    outline: none;
    border-color: #646cff;
  }

  .comment-input-actions {
    display: flex;
    gap: 6px;
    justify-content: flex-end;
  }

  .comment-input-actions button {
    padding: 4px 12px;
    border-radius: 4px;
    border: 1px solid #444;
    background: transparent;
    color: #ccc;
    cursor: pointer;
    font-size: 0.8rem;
  }

  .btn-submit {
    background: #646cff !important;
    border-color: #646cff !important;
    color: white !important;
  }

  .btn-submit:hover {
    background: #535bf2 !important;
  }

  .btn-cancel:hover {
    background: #2a2a4a;
  }
</style>
