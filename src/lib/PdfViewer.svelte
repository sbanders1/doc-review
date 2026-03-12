<script>
  import { onMount, tick } from 'svelte';
  import * as pdfjsLib from 'pdfjs-dist';
  import { TextLayer } from 'pdfjs-dist';
  import 'pdfjs-dist/web/pdf_viewer.css';
  import {
    getAnnotations,
    getActiveAnnotationId,
    setActiveAnnotationId,
    addAnnotation,
  } from './annotations.svelte.js';

  let { data } = $props();

  let container;
  let scrollArea;
  let pageCount = $state(0);
  let scale = $state(1.5);
  let pdfDoc = $state(null);
  let rendering = $state(false);

  // Selection popover state
  let popover = $state({ visible: false, x: 0, y: 0 });
  let commentInput = $state({ visible: false, x: 0, y: 0, text: '', selectionRects: [], pageNumber: 0 });
  let commentText = $state('');

  // Track page wrappers for highlight rendering
  let pageWrappers = $state([]);

  pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
    'pdfjs-dist/build/pdf.worker.mjs',
    import.meta.url
  ).href;

  onMount(() => {
    loadPdf();
    document.addEventListener('mouseup', handleMouseUp);
    document.addEventListener('mousedown', handleMouseDown);
    return () => {
      document.removeEventListener('mouseup', handleMouseUp);
      document.removeEventListener('mousedown', handleMouseDown);
    };
  });

  function handleMouseDown(e) {
    // If clicking outside popover/comment input, close them
    if (!e.target.closest('.selection-popover') && !e.target.closest('.comment-input-popover')) {
      popover = { visible: false, x: 0, y: 0 };
      if (!e.target.closest('.comment-input-popover')) {
        commentInput = { ...commentInput, visible: false };
        commentText = '';
      }
    }
  }

  function handleMouseUp(e) {
    if (e.target.closest('.selection-popover') || e.target.closest('.comment-input-popover')) return;

    const selection = window.getSelection();
    if (!selection || selection.isCollapsed || !selection.toString().trim()) {
      popover = { visible: false, x: 0, y: 0 };
      return;
    }

    // Check if selection is within our pdf container
    const range = selection.getRangeAt(0);
    if (!container || !container.contains(range.commonAncestorContainer)) {
      return;
    }

    const rect = range.getBoundingClientRect();
    const containerRect = container.getBoundingClientRect();

    popover = {
      visible: true,
      x: rect.left + rect.width / 2 - containerRect.left + container.scrollLeft,
      y: rect.top - containerRect.top + container.scrollTop - 8,
    };
  }

  function startComment() {
    const selection = window.getSelection();
    if (!selection || selection.isCollapsed) return;

    const range = selection.getRangeAt(0);
    const selectedText = selection.toString().trim();
    if (!selectedText) return;

    // Find which page wrapper contains this selection
    let pageNumber = 0;
    let pageWrapper = null;
    for (let i = 0; i < pageWrappers.length; i++) {
      if (pageWrappers[i] && pageWrappers[i].contains(range.commonAncestorContainer)) {
        pageNumber = i + 1;
        pageWrapper = pageWrappers[i];
        break;
      }
    }
    if (!pageWrapper) return;

    // Get selection rects relative to the page wrapper
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

    const containerRect = container.getBoundingClientRect();
    const lastClientRect = clientRects[clientRects.length - 1];

    commentInput = {
      visible: true,
      x: lastClientRect.right - containerRect.left + container.scrollLeft + 8,
      y: lastClientRect.top - containerRect.top + container.scrollTop,
      text: selectedText,
      selectionRects: rects,
      pageNumber,
    };
    commentText = '';
    popover = { visible: false, x: 0, y: 0 };

    // Focus the textarea after it renders
    tick().then(() => {
      const ta = container.parentElement.querySelector('.comment-input-popover textarea');
      if (ta) ta.focus();
    });
  }

  function submitComment() {
    if (!commentText.trim()) return;

    // Store rects as ratios of page dimensions for scale independence
    const pageWrapper = pageWrappers[commentInput.pageNumber - 1];
    const pageWidth = pageWrapper.offsetWidth;
    const pageHeight = pageWrapper.offsetHeight;

    const normalizedRects = commentInput.selectionRects.map((r) => ({
      left: r.left / pageWidth,
      top: r.top / pageHeight,
      width: r.width / pageWidth,
      height: r.height / pageHeight,
    }));

    addAnnotation({
      pageNumber: commentInput.pageNumber,
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

  async function loadPdf() {
    const loadingTask = pdfjsLib.getDocument({ data });
    pdfDoc = await loadingTask.promise;
    pageCount = pdfDoc.numPages;
    renderAllPages();
  }

  async function renderAllPages() {
    if (!pdfDoc || rendering) return;
    rendering = true;
    container.innerHTML = '';
    pageWrappers = [];

    for (let num = 1; num <= pdfDoc.numPages; num++) {
      const page = await pdfDoc.getPage(num);
      const viewport = page.getViewport({ scale });

      const wrapper = document.createElement('div');
      wrapper.className = 'page-wrapper';
      wrapper.style.position = 'relative';
      wrapper.style.width = `${viewport.width}px`;
      wrapper.style.height = `${viewport.height}px`;
      wrapper.dataset.pageNumber = num;

      // Canvas layer
      const canvas = document.createElement('canvas');
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      wrapper.appendChild(canvas);

      // Text layer
      const textLayerDiv = document.createElement('div');
      textLayerDiv.className = 'textLayer';
      wrapper.appendChild(textLayerDiv);

      // Highlight overlay container
      const highlightLayer = document.createElement('div');
      highlightLayer.className = 'highlight-layer';
      highlightLayer.dataset.page = num;
      wrapper.appendChild(highlightLayer);

      // Page label
      const pageLabel = document.createElement('div');
      pageLabel.className = 'page-label';
      pageLabel.textContent = `Page ${num} of ${pdfDoc.numPages}`;
      wrapper.appendChild(pageLabel);

      container.appendChild(wrapper);
      pageWrappers[num - 1] = wrapper;

      // Render canvas
      const ctx = canvas.getContext('2d');
      await page.render({ canvasContext: ctx, viewport }).promise;

      // Render text layer
      const textContent = await page.getTextContent();
      const textLayer = new TextLayer({
        textContentSource: textContent,
        container: textLayerDiv,
        viewport,
      });
      await textLayer.render();
    }

    rendering = false;
  }

  export function getPageWrappers() {
    return pageWrappers;
  }

  function zoomIn() {
    scale = Math.min(scale + 0.25, 4);
    renderAllPages();
  }

  function zoomOut() {
    scale = Math.max(scale - 0.25, 0.5);
    renderAllPages();
  }

  // Reactive highlight rendering
  const annotations = $derived(getAnnotations());
  const activeId = $derived(getActiveAnnotationId());

  $effect(() => {
    const _annotations = annotations;
    const _activeId = activeId;
    const _pending = commentInput.visible;
    renderHighlights();
  });

  export function scrollToAnnotation(id) {
    // Defer to next microtask so reactive state (activeId) has updated
    tick().then(() => {
      renderHighlights();
      const el = scrollArea?.querySelector(`[data-annotation-id="${id}"]`);
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        return;
      }

      // No highlight rects — fall back to scrolling to the annotation's page
      const annotation = annotations.find((a) => a.id === id);
      if (annotation && annotation.pageNumber > 0) {
        const pageWrapper = pageWrappers[annotation.pageNumber - 1];
        if (pageWrapper) {
          pageWrapper.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
      }
    });
  }

  function renderHighlights() {
    const highlightLayers = container?.querySelectorAll('.highlight-layer');
    if (!highlightLayers) return;

    highlightLayers.forEach((layer) => {
      layer.innerHTML = '';
      const pageNum = parseInt(layer.dataset.page);
      const wrapper = layer.closest('.page-wrapper');
      if (!wrapper) return;

      const pageWidth = wrapper.offsetWidth;
      const pageHeight = wrapper.offsetHeight;

      // Render pending highlight while comment input is open
      if (commentInput.visible && commentInput.pageNumber === pageNum) {
        for (const rect of commentInput.selectionRects) {
          const el = document.createElement('div');
          el.className = 'highlight-rect active';
          el.style.left = `${rect.left}px`;
          el.style.top = `${rect.top}px`;
          el.style.width = `${rect.width}px`;
          el.style.height = `${rect.height}px`;
          layer.appendChild(el);
        }
      }

      // Render saved annotations
      const pageAnnotations = annotations.filter((a) => a.pageNumber === pageNum);

      for (const annotation of pageAnnotations) {
        const isActive = annotation.id === activeId;

        for (const rect of annotation.rects) {
          const el = document.createElement('div');
          el.className = 'highlight-rect' + (isActive ? ' active' : '') + (annotation.resolved ? ' resolved' : '');
          el.dataset.annotationId = annotation.id;
          el.style.left = `${rect.left * pageWidth}px`;
          el.style.top = `${rect.top * pageHeight}px`;
          el.style.width = `${rect.width * pageWidth}px`;
          el.style.height = `${rect.height * pageHeight}px`;
          el.addEventListener('click', () => setActiveAnnotationId(annotation.id));
          layer.appendChild(el);
        }
      }
    });
  }
</script>

<div class="pdf-controls">
  <button onclick={zoomOut}>-</button>
  <span class="zoom-level">{Math.round(scale * 100)}%</span>
  <button onclick={zoomIn}>+</button>
  <span class="page-info">{pageCount} page{pageCount !== 1 ? 's' : ''}</span>
</div>
<div class="pdf-scroll-area" bind:this={scrollArea}>
  <div class="pdf-container" bind:this={container}></div>

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
  .pdf-controls {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px 16px;
    background: #1a1a2e;
    border-bottom: 1px solid #333;
  }

  .pdf-controls button {
    width: 32px;
    height: 32px;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 4px;
    border: 1px solid #555;
    background: transparent;
    color: #ccc;
    cursor: pointer;
    font-size: 1.1rem;
    padding: 0;
  }

  .pdf-controls button:hover {
    background: #333;
  }

  .zoom-level {
    font-size: 0.85rem;
    color: #aaa;
    min-width: 40px;
    text-align: center;
  }

  .page-info {
    font-size: 0.85rem;
    color: #666;
    margin-left: auto;
  }

  .pdf-scroll-area {
    flex: 1;
    position: relative;
    overflow: auto;
    background: #0d0d1a;
  }

  .pdf-container {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 16px;
    padding: 16px;
    min-height: 100%;
  }

  .pdf-container :global(.page-wrapper) {
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.4);
    background: white;
  }

  .pdf-container :global(canvas) {
    display: block;
  }

  .pdf-container :global(.page-label) {
    text-align: center;
    padding: 4px;
    font-size: 0.75rem;
    color: #666;
    background: #f0f0f0;
    position: relative;
  }

  .pdf-container :global(.textLayer) {
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    overflow: hidden;
    line-height: 1;
  }

  .pdf-container :global(.textLayer ::selection) {
    background: rgba(0, 100, 255, 0.3);
  }

  /* Highlight overlay layer */
  .pdf-container :global(.highlight-layer) {
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    pointer-events: none;
    z-index: 1;
  }

  .pdf-container :global(.highlight-rect) {
    position: absolute;
    background: transparent;
    border-bottom: 2px solid rgba(255, 183, 0, 0.7);
    pointer-events: auto;
    cursor: pointer;
    transition: background 0.15s, border-color 0.15s;
  }

  .pdf-container :global(.highlight-rect:hover),
  .pdf-container :global(.highlight-rect.active) {
    background: rgba(255, 213, 79, 0.35);
    border-bottom-color: transparent;
    mix-blend-mode: multiply;
  }

  .pdf-container :global(.highlight-rect.resolved) {
    background: transparent;
    border-bottom-color: transparent;
    pointer-events: none;
  }

  /* Selection popover */
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

  /* Comment input popover */
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
