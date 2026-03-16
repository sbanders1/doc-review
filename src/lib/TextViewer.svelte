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

  let popover = $state({ visible: false, x: 0, y: 0 });
  let commentInput = $state({ visible: false, x: 0, y: 0, text: '', selectionRects: [] });
  let commentText = $state('');

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

  export function getViewerSnapshot() {
    return {
      scrollTop: scrollArea?.scrollTop ?? 0,
      scrollLeft: scrollArea?.scrollLeft ?? 0,
    };
  }

  export async function restoreViewerSnapshot(snapshot) {
    if (!snapshot) return;
    await tick();
    if (scrollArea) {
      scrollArea.scrollTop = snapshot.scrollTop ?? 0;
      scrollArea.scrollLeft = snapshot.scrollLeft ?? 0;
    }
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
<div class="flex-1 min-h-0 overflow-auto bg-white dark:bg-gray-950 relative" bind:this={scrollArea} onclick={handleClick}>
  <div class="page-wrapper relative px-8 py-6 min-h-full" bind:this={pageWrapper}>
    <div class="text-layer font-mono text-sm leading-relaxed text-gray-800 dark:text-gray-200 whitespace-pre-wrap break-words">
      {#if lines.length > 0}
        {#each lines as line, i}
          <span class="relative cursor-text">{line}{#if i < lines.length - 1}{'\n'}{/if}</span>
        {/each}
      {:else}
        <span class="relative cursor-text">{content}</span>
      {/if}
    </div>
    <div class="highlight-layer" data-page="1"></div>
  </div>

  {#if popover.visible}
    <div
      class="selection-popover absolute z-10"
      style="left: {popover.x}px; top: {popover.y}px; transform: translateX(-50%) translateY(-100%);"
    >
      <button
        class="px-3.5 py-1.5 rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 text-sm cursor-pointer whitespace-nowrap shadow-lg hover:bg-gray-50 dark:hover:bg-gray-700 hover:border-primary-500 transition-colors"
        onclick={startComment}
      >Add Comment</button>
    </div>
  {/if}

  {#if commentInput.visible}
    <div
      class="comment-input-popover absolute z-10 w-[280px] bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded-lg shadow-xl p-2.5"
      style="left: {commentInput.x}px; top: {commentInput.y}px;"
    >
      <div class="text-xs text-gray-400 dark:text-gray-500 mb-2">Comment on selection</div>
      <textarea
        bind:value={commentText}
        placeholder="Write a comment..."
        class="w-full min-h-[70px] p-2 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-600 rounded text-sm text-gray-900 dark:text-gray-100 resize-y mb-2 focus:outline-none focus:border-primary-500"
        onkeydown={(e) => {
          if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submitComment(); }
          if (e.key === 'Escape') cancelComment();
        }}
      ></textarea>
      <div class="flex gap-1.5 justify-end">
        <button class="px-3 py-1 rounded-md bg-primary-500 hover:bg-primary-600 text-white text-xs border-none cursor-pointer transition-colors" onclick={submitComment}>Comment</button>
        <button class="px-3 py-1 rounded-md border border-gray-200 dark:border-gray-600 bg-transparent text-gray-500 dark:text-gray-400 text-xs cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors" onclick={cancelComment}>Cancel</button>
      </div>
    </div>
  {/if}
</div>

<style>
  .highlight-layer {
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    pointer-events: none;
    z-index: 1;
  }

  :global(.highlight-rect) {
    position: absolute;
    background: rgba(255, 200, 0, 0.15);
    border-bottom: 2px solid rgba(255, 200, 0, 0.6);
    pointer-events: auto;
    cursor: pointer;
  }

  :global(.highlight-rect:hover) {
    background: rgba(255, 200, 0, 0.25);
    border-bottom-color: rgba(255, 200, 0, 0.9);
  }

  :global(.highlight-rect.active) {
    background: rgba(45, 106, 79, 0.15);
    border-bottom: 2px solid rgba(45, 106, 79, 0.7);
  }

  :global(.highlight-rect.resolved) {
    opacity: 0.4;
  }
</style>
