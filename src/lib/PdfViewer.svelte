<script>
  import { onMount, tick } from 'svelte';
  import * as pdfjsLib from 'pdfjs-dist';
  import { TextLayer } from 'pdfjs-dist';
  import 'pdfjs-dist/web/pdf_viewer.css';
  import { Plus, Minus } from 'lucide-svelte';
  import {
    getAnnotations,
    getActiveAnnotationId,
    setActiveAnnotationId,
    addAnnotation,
  } from './annotations.svelte.js';

  let { data, onAnnotationClick = () => {} } = $props();

  let container;
  let scrollArea;
  let pageCount = $state(0);
  let scale = $state(1);
  let pdfDoc = $state(null);
  let rendering = $state(false);

  let popover = $state({ visible: false, x: 0, y: 0 });
  let commentInput = $state({ visible: false, x: 0, y: 0, text: '', selectionRects: [], pageNumber: 0 });
  let commentText = $state('');

  let pageWrappers = $state([]);

  let dbgScaleX = $state(1.175);
  let dbgTranslateX = $state(-36.5);
  let dbgShowPanel = $state(false);

  pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
    'pdfjs-dist/build/pdf.worker.mjs',
    import.meta.url
  ).href;

  onMount(() => {
    loadPdf();
    document.addEventListener('mouseup', handleMouseUp);
    document.addEventListener('mousedown', handleMouseDown);
    document.addEventListener('click', handleAnnotationClick);
    return () => {
      document.removeEventListener('mouseup', handleMouseUp);
      document.removeEventListener('mousedown', handleMouseDown);
      document.removeEventListener('click', handleAnnotationClick);
    };
  });

  function handleAnnotationClick(e) {
    if (e.target.closest('.sidebar') || e.target.closest('.comment-card') || e.target.closest('.expand-btn')) return;

    if (!container) {
      setActiveAnnotationId(null);
      return;
    }

    const highlightEl = e.target.closest('.highlight-rect');
    if (highlightEl && highlightEl.dataset.annotationId) {
      const id = highlightEl.dataset.annotationId;
      setActiveAnnotationId(id);
      onAnnotationClick(id);
      return;
    }

    const wrapper = e.target.closest('.page-wrapper');
    if (!wrapper || !container.contains(wrapper)) {
      const elAtPoint = document.elementFromPoint(e.clientX, e.clientY);
      const wrapperAtPoint = elAtPoint?.closest('.page-wrapper');

      const highlightAtPoint = elAtPoint?.closest('.highlight-rect');
      if (highlightAtPoint && highlightAtPoint.dataset.annotationId) {
        const id = highlightAtPoint.dataset.annotationId;
        setActiveAnnotationId(id);
        onAnnotationClick(id);
        return;
      }

      if (!wrapperAtPoint || !container.contains(wrapperAtPoint)) {
        setActiveAnnotationId(null);
        return;
      }
      return handleAnnotationHitTest(e, wrapperAtPoint);
    }

    handleAnnotationHitTest(e, wrapper);
  }

  function handleAnnotationHitTest(e, wrapper) {
    const pageNum = parseInt(wrapper.dataset.pageNumber);
    const wrapperRect = wrapper.getBoundingClientRect();
    const x = e.clientX - wrapperRect.left;
    const y = e.clientY - wrapperRect.top;
    const pageW = wrapper.offsetWidth;
    const pageH = wrapper.offsetHeight;

    const currentAnnotations = getAnnotations();
    const pageAnnotations = currentAnnotations.filter((a) => a.pageNumber === pageNum && !a.resolved);
    for (const annotation of pageAnnotations) {
      for (const rect of annotation.rects) {
        const left = rect.left * pageW;
        const top = rect.top * pageH;
        const right = left + rect.width * pageW;
        const bottom = top + rect.height * pageH;
        if (x >= left && x <= right && y >= top && y <= bottom) {
          setActiveAnnotationId(annotation.id);
          onAnnotationClick(annotation.id);
          return;
        }
      }
    }

    setActiveAnnotationId(null);
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

    tick().then(() => {
      const ta = container.parentElement.querySelector('.comment-input-popover textarea');
      if (ta) ta.focus();
    });
  }

  function submitComment() {
    if (!commentText.trim()) return;

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

      const canvas = document.createElement('canvas');
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      wrapper.appendChild(canvas);

      const textLayerDiv = document.createElement('div');
      textLayerDiv.className = 'textLayer';
      textLayerDiv.style.setProperty('--scale-factor', scale * (globalThis.devicePixelRatio || 1));
      textLayerDiv.style.setProperty('--user-unit', 1);
      textLayerDiv.style.transform = `scaleX(${dbgScaleX}) translateX(${dbgTranslateX}px)`;
      wrapper.appendChild(textLayerDiv);

      const highlightLayer = document.createElement('div');
      highlightLayer.className = 'highlight-layer';
      highlightLayer.dataset.page = num;
      wrapper.appendChild(highlightLayer);

      const pageLabel = document.createElement('div');
      pageLabel.className = 'page-label';
      pageLabel.textContent = `Page ${num} of ${pdfDoc.numPages}`;
      wrapper.appendChild(pageLabel);

      container.appendChild(wrapper);
      pageWrappers[num - 1] = wrapper;

      const ctx = canvas.getContext('2d');
      await page.render({ canvasContext: ctx, viewport }).promise;

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

  const annotations = $derived(getAnnotations());
  const activeId = $derived(getActiveAnnotationId());

  $effect(() => {
    const _annotations = annotations;
    const _activeId = activeId;
    const _pending = commentInput.visible;
    renderHighlights();
  });

  $effect(() => {
    const sx = dbgScaleX;
    const tx = dbgTranslateX;
    container?.querySelectorAll('.textLayer').forEach((el) => {
      el.style.transform = `scaleX(${sx}) translateX(${tx}px)`;
    });
  });

  export function getViewerSnapshot() {
    return {
      scale,
      scrollTop: scrollArea?.scrollTop ?? 0,
      scrollLeft: scrollArea?.scrollLeft ?? 0,
    };
  }

  export async function restoreViewerSnapshot(snapshot) {
    if (!snapshot) return;
    if (snapshot.scale && snapshot.scale !== scale) {
      scale = snapshot.scale;
      await renderAllPages();
    }
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
          layer.appendChild(el);
        }
      }
    });
  }
</script>

<div class="flex items-center gap-2 px-4 py-2 bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800">
  <button
    class="w-8 h-8 flex items-center justify-center rounded-md border border-gray-200 dark:border-gray-600 bg-transparent text-gray-500 dark:text-gray-400 cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
    onclick={zoomOut}
  >
    <Minus size={16} />
  </button>
  <span class="text-sm text-gray-500 dark:text-gray-400 min-w-[40px] text-center">{Math.round(scale * 100)}%</span>
  <button
    class="w-8 h-8 flex items-center justify-center rounded-md border border-gray-200 dark:border-gray-600 bg-transparent text-gray-500 dark:text-gray-400 cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
    onclick={zoomIn}
  >
    <Plus size={16} />
  </button>
  <span class="text-sm text-gray-400 dark:text-gray-500 ml-auto">{pageCount} page{pageCount !== 1 ? 's' : ''}</span>
</div>
{#if dbgShowPanel}
  <div class="flex items-center gap-4 px-4 py-1.5 bg-gray-100 dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800">
    <label class="flex items-center gap-1.5 text-xs text-gray-500 whitespace-nowrap">
      scaleX: <strong class="min-w-[50px] text-right text-gray-900 dark:text-gray-100 font-mono">{dbgScaleX.toFixed(3)}</strong>
      <input type="range" min="0.8" max="1.3" step="0.005" bind:value={dbgScaleX} class="w-[120px] accent-primary-500" />
    </label>
    <label class="flex items-center gap-1.5 text-xs text-gray-500 whitespace-nowrap">
      translateX: <strong class="min-w-[50px] text-right text-gray-900 dark:text-gray-100 font-mono">{dbgTranslateX.toFixed(1)}px</strong>
      <input type="range" min="-100" max="100" step="0.5" bind:value={dbgTranslateX} class="w-[120px] accent-primary-500" />
    </label>
    <button class="px-2 py-0.5 text-xs rounded border border-gray-300 dark:border-gray-600 bg-transparent text-gray-500 cursor-pointer hover:bg-gray-200 dark:hover:bg-gray-700" onclick={() => { dbgScaleX = 1.175; dbgTranslateX = -36.5; }}>Reset</button>
  </div>
{/if}
<div class="pdf-scroll-area flex-1 relative overflow-auto bg-gray-100 dark:bg-gray-950" bind:this={scrollArea}>
  <div class="pdf-container flex flex-col items-center gap-4 p-4 min-h-full" bind:this={container}></div>

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
  /* These :global() styles target dynamically-created DOM from pdfjs and renderHighlights() */
  .pdf-container :global(.page-wrapper) {
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.12);
    background: white;
    overflow: hidden;
  }

  .pdf-container :global(canvas) {
    display: block;
  }

  .pdf-container :global(.page-label) {
    text-align: center;
    padding: 4px;
    font-size: 0.75rem;
    color: #6b7280;
    background: #f3f4f6;
    position: relative;
  }

  :global(.dark) .pdf-container :global(.page-label) {
    color: #6b7280;
    background: #1f2937;
  }

  .pdf-container :global(.textLayer) {
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    overflow: hidden;
    line-height: 1;
    transform-origin: 0 0;
  }

  .pdf-container :global(.textLayer ::selection) {
    background: rgba(0, 100, 255, 0.3);
  }

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

  .pdf-container :global(.highlight-rect:hover) {
    background: rgba(255, 213, 79, 0.35);
    mix-blend-mode: multiply;
  }

  .pdf-container :global(.highlight-rect.active) {
    background: rgba(66, 153, 225, 0.3);
    border-bottom-color: rgba(66, 153, 225, 0.9);
    mix-blend-mode: multiply;
  }

  .pdf-container :global(.highlight-rect.resolved) {
    background: transparent;
    border-bottom-color: transparent;
    pointer-events: none;
  }
</style>
