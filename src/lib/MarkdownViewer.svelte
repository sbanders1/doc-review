<script>
  import { tick, untrack } from 'svelte';
  import { getAnnotations } from './annotations.svelte.js';
  import {
    setMarkdownSource,
    getMarkdownSource,
    getChunkByUuid,
    getChunkByDisplayId,
  } from './documentContext.svelte.js';

  let { content, onAnnotationClick = () => {}, onCitationClick = () => {} } = $props();

  let textareaEl;
  let source = $state('');
  let suppressFlush = false;
  let debounceTimer;
  let didInit = false;

  $effect.pre(() => {
    if (didInit) return;
    didInit = true;
    source = content ?? getMarkdownSource() ?? '';
  });

  $effect(() => {
    const ext = getMarkdownSource();
    if (ext == null) return;
    const cur = untrack(() => source);
    if (ext === cur) return;
    suppressFlush = true;
    source = ext;
  });

  $effect(() => {
    const s = source;
    if (suppressFlush) {
      suppressFlush = false;
      return;
    }
    const ext = untrack(() => getMarkdownSource());
    if (s === ext) return;
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => setMarkdownSource(s), 150);
    return () => {
      if (debounceTimer) {
        clearTimeout(debounceTimer);
        debounceTimer = null;
      }
    };
  });

  export function getPageWrappers() {
    return [];
  }

  export function getViewerSnapshot() {
    return { sourceScrollTop: textareaEl?.scrollTop ?? 0 };
  }

  export async function restoreViewerSnapshot(snapshot) {
    if (!snapshot) return;
    await tick();
    if (textareaEl && snapshot.sourceScrollTop != null) {
      textareaEl.scrollTop = snapshot.sourceScrollTop;
    }
  }

  function selectAndScroll(start, end) {
    if (!textareaEl) return;
    textareaEl.focus();
    try {
      textareaEl.setSelectionRange(start, end);
    } catch {
      return;
    }
    const pre = textareaEl.value.slice(0, start);
    const lineNum = pre.split('\n').length - 1;
    const lineHeight = parseFloat(getComputedStyle(textareaEl).lineHeight) || 20;
    const targetTop = Math.max(0, lineNum * lineHeight - textareaEl.clientHeight / 2);
    textareaEl.scrollTop = targetTop;
  }

  function findRange(text) {
    if (!textareaEl || !text) return null;
    const idx = textareaEl.value.indexOf(text);
    if (idx < 0) return null;
    return [idx, idx + text.length];
  }

  export function scrollToAnnotation(id) {
    if (!id) return;
    tick().then(() => {
      const annotation = getAnnotations().find((a) => a.id === id);
      if (!annotation?.text) return;
      const r = findRange(annotation.text);
      if (r) selectAndScroll(r[0], r[1]);
    });
  }

  export function scrollToChunks(chunkIds) {
    if (!Array.isArray(chunkIds) || chunkIds.length === 0) return;
    tick().then(() => {
      const ranges = [];
      for (const cid of chunkIds) {
        const chunk = getChunkByDisplayId(cid) ?? getChunkByUuid(cid);
        if (!chunk?.text) continue;
        const r = findRange(chunk.text);
        if (r) ranges.push(r);
      }
      if (ranges.length === 0) return;
      const start = Math.min(...ranges.map((r) => r[0]));
      const end = Math.max(...ranges.map((r) => r[1]));
      selectAndScroll(start, end);
    });
  }
</script>

<div class="flex-1 min-h-0 overflow-hidden flex flex-col bg-white dark:bg-gray-950">
  <textarea
    bind:value={source}
    bind:this={textareaEl}
    class="flex-1 min-h-0 w-full px-8 py-6 bg-white dark:bg-gray-950 font-mono text-sm leading-relaxed text-gray-800 dark:text-gray-200 resize-none focus:outline-none border-none"
    spellcheck="false"
  ></textarea>
</div>
