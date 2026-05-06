<script>
  import {
    LineChart,
    RefreshCw,
    AlertCircle,
    Loader2,
    Trash2,
    X,
  } from 'lucide-svelte';
  import {
    getStatus,
    getError,
    getLastAnalyzedAt,
    getDocumentTooLong,
    getChunks,
    getChunkScores,
    getVoiceConsistency,
    getDescriptionsByDimension,
    getSelectedDimension,
    getExpandedChunkIndex,
    getPhase1Progress,
    getPhase2Progress,
    setSelectedDimension,
    setExpandedChunkIndex,
    setError,
    clearTonalDrift,
  } from './tonalDrift.svelte.js';
  import {
    DIMENSIONS,
    VOICE_CONSISTENCY_KEY,
    VOICE_CONSISTENCY_DIMENSION,
    SCORE_MAX,
  } from './tonalDrift.js';
  import { runTonalDrift } from './tonalDriftRunner.js';
  import { getExtractedText } from './documentContext.svelte.js';
  import { getModel } from './model.svelte.js';

  const status = $derived(getStatus());
  const error = $derived(getError());
  const lastAt = $derived(getLastAnalyzedAt());
  const tooLong = $derived(getDocumentTooLong());
  const chunks = $derived(getChunks());
  const chunkScores = $derived(getChunkScores());
  const voiceConsistency = $derived(getVoiceConsistency());
  const descriptions = $derived(getDescriptionsByDimension());
  const selectedDimension = $derived(getSelectedDimension());
  const expandedChunkIndex = $derived(getExpandedChunkIndex());
  const p1 = $derived(getPhase1Progress());
  const p2 = $derived(getPhase2Progress());

  const ALL_DIMS = [...DIMENSIONS, VOICE_CONSISTENCY_DIMENSION];
  const DIM_LABELS = Object.fromEntries(
    ALL_DIMS.map((d) => [d.key, d.key === VOICE_CONSISTENCY_KEY ? 'Voice consistency' : `${d.leftLabel} ↔ ${d.rightLabel}`]),
  );

  const activeDimension = $derived(
    ALL_DIMS.find((d) => d.key === selectedDimension) || DIMENSIONS[0],
  );

  const seriesPoints = $derived.by(() => {
    if (!chunks || chunks.length === 0) return [];
    const isVoice = selectedDimension === VOICE_CONSISTENCY_KEY;
    const voiceByIndex = new Map(voiceConsistency.map((v) => [v.index, v]));
    const out = [];
    for (const c of chunks) {
      let score = null;
      if (isVoice) {
        const v = voiceByIndex.get(c.index);
        if (v && typeof v.score === 'number') score = v.score;
      } else {
        const s = chunkScores[c.index];
        const dim = s?.scores?.[selectedDimension];
        if (dim && typeof dim.score === 'number') score = dim.score;
      }
      if (score == null) continue;
      out.push({ index: c.index, score });
    }
    return out;
  });

  const downsampledPoints = $derived.by(() => {
    const pts = seriesPoints;
    if (pts.length <= 75) return pts;
    const stride = Math.ceil(pts.length / 75);
    const out = [];
    for (let i = 0; i < pts.length; i += stride) out.push(pts[i]);
    if (out[out.length - 1]?.index !== pts[pts.length - 1].index) {
      out.push(pts[pts.length - 1]);
    }
    return out;
  });

  let graphContainer = $state(null);
  let graphContainerWidth = $state(0);

  const padLeft = 80;
  const padRight = 16;
  // graphContainerWidth comes from clientWidth, which includes the container's
  // p-2 padding (8px each side = 16px total). The SVG must render inside the
  // content box, so subtract that padding from the SVG width — otherwise the
  // last point's circle (especially when selected) overflows the container.
  const CONTAINER_PADDING_TOTAL = 16;
  const svgWidth = $derived(Math.max(120, graphContainerWidth - CONTAINER_PADDING_TOTAL));
  const innerWidth = $derived(Math.max(120, svgWidth - padLeft - padRight));
  const graphHeight = 180;
  const padTop = 16;
  const padBottom = 16;

  const xScale = $derived.by(() => {
    const N = downsampledPoints.length;
    if (N <= 1) return () => padLeft + innerWidth / 2;
    return (i) => padLeft + (i / (N - 1)) * innerWidth;
  });

  const yScale = (score) => padTop + (1 - score / SCORE_MAX) * (graphHeight - padTop - padBottom);

  const polylinePoints = $derived(
    downsampledPoints
      .map((p, i) => `${xScale(i).toFixed(1)},${yScale(p.score).toFixed(1)}`)
      .join(' '),
  );

  const expandedScores = $derived.by(() => {
    if (expandedChunkIndex == null) return null;
    return chunkScores[expandedChunkIndex] || null;
  });

  const expandedVoice = $derived.by(() => {
    if (expandedChunkIndex == null) return null;
    return voiceConsistency.find((v) => v.index === expandedChunkIndex) || null;
  });

  const expandedChunk = $derived.by(() => {
    if (expandedChunkIndex == null) return null;
    return chunks.find((c) => c.index === expandedChunkIndex) || null;
  });

  const activeScore = $derived.by(() => {
    if (expandedChunkIndex == null) return null;
    if (selectedDimension === VOICE_CONSISTENCY_KEY) {
      return expandedVoice ? expandedVoice.score : null;
    }
    return expandedScores?.scores?.[selectedDimension]?.score ?? null;
  });

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

  async function startAnalyze() {
    const text = getExtractedText();
    if (!text || !text.formatted) {
      setError('No document text is available to analyze.');
      return;
    }
    try {
      await runTonalDrift(text, getModel());
    } catch (e) {
      console.error('Tonal drift failed:', e);
      setError(e?.message || 'Tonal drift analysis failed.');
    }
  }

  const hasAnyScores = $derived(Object.keys(chunkScores).length > 0);
  const isWorking = $derived(status === 'phase1' || status === 'phase2');
  const isSampling = $derived(p1.total > 0 && chunks.length > 0 && p1.total < chunks.length);
  const phase1Label = $derived(isSampling ? 'Analyzing sample' : 'Analyzing');
  const buttonLabel = $derived.by(() => {
    if (status === 'phase1') return `${phase1Label}... (${p1.done}/${p1.total})`;
    if (status === 'phase2') return `Refining... (${p2.done}/${p2.total})`;
    if (status === 'ready') return 'Re-analyze';
    return 'Analyze drift';
  });
</script>

<div class="flex flex-col flex-1 min-h-0">
  <div class="flex items-center justify-between gap-2 px-3 py-2 border-b border-gray-200 dark:border-gray-700">
    <div class="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400 min-w-0">
      <LineChart size={13} class="shrink-0" />
      {#if status === 'ready' && lastAt}
        <span class="truncate">Analyzed {formatTime(lastAt)}</span>
      {:else if status === 'phase1'}
        <span class="truncate">{phase1Label}... ({p1.done}/{p1.total})</span>
      {:else if status === 'phase2'}
        <span class="inline-flex items-center gap-1.5 truncate">
          <span class="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse"></span>
          Refining... ({p2.done}/{p2.total})
        </span>
      {:else if status === 'error'}
        <span class="truncate text-red-500">Failed.</span>
      {:else}
        <span class="truncate">No analysis yet.</span>
      {/if}
    </div>
    <div class="flex items-center gap-1.5">
      {#if (status === 'ready' || status === 'error') && !tooLong}
        <button
          class="flex items-center justify-center w-7 h-7 rounded-md border border-gray-300 dark:border-gray-600 text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 hover:text-red-600 dark:hover:text-red-400 cursor-pointer transition-colors"
          onclick={clearTonalDrift}
          title="Clear tonal drift"
          aria-label="Clear tonal drift"
        >
          <Trash2 size={13} />
        </button>
      {/if}
      {#if !tooLong}
        <button
          class="flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-semibold border transition-colors {isWorking
            ? 'border-gray-300 dark:border-gray-600 text-gray-400 dark:text-gray-500 cursor-not-allowed'
            : 'border-primary-500/40 bg-primary-500/10 text-primary-600 dark:text-primary-400 hover:bg-primary-500/20 cursor-pointer'}"
          onclick={startAnalyze}
          disabled={isWorking}
        >
          {#if isWorking}
            <Loader2 size={12} class="animate-spin" />
            {buttonLabel}
          {:else if status === 'ready'}
            <RefreshCw size={12} />
            Re-analyze
          {:else}
            <LineChart size={12} />
            Analyze drift
          {/if}
        </button>
      {/if}
    </div>
  </div>

  {#if tooLong}
    <div class="m-3 p-3 rounded-md border border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-900/20 text-xs text-amber-700 dark:text-amber-300 flex items-start gap-2">
      <AlertCircle size={14} class="mt-0.5 shrink-0" />
      <div class="flex-1">
        <div class="font-semibold mb-0.5">Document too long</div>
        <div class="leading-snug">This document exceeds the v1 cap of ~300 pages. Tonal drift analysis is not available.</div>
      </div>
    </div>
  {:else if status === 'error' && !hasAnyScores}
    <div class="m-3 p-3 rounded-md border border-red-300 dark:border-red-700 bg-red-50 dark:bg-red-900/20 text-xs text-red-700 dark:text-red-300 flex items-start gap-2">
      <AlertCircle size={14} class="mt-0.5 shrink-0" />
      <div class="flex-1">
        <div class="font-semibold mb-0.5">Tonal drift analysis failed</div>
        <div class="leading-snug">{error}</div>
      </div>
    </div>
  {:else if status === 'idle' && !hasAnyScores}
    <div class="flex-1 flex flex-col items-center justify-center text-center px-6 text-gray-400 dark:text-gray-500">
      <LineChart size={28} strokeWidth={1.5} class="mb-2" />
      <p class="m-0 text-sm">Trace stylistic drift across the document.</p>
      <p class="m-1 text-xs">Click "Analyze drift" to score each ~4-paragraph chunk on five dimensions and see how the prose shifts from start to finish.</p>
    </div>
  {:else if !hasAnyScores && isWorking}
    <div class="flex-1 flex flex-col items-center justify-center text-center px-6 text-gray-400 dark:text-gray-500 gap-2">
      <Loader2 size={20} class="animate-spin" />
      <p class="m-0 text-xs">{buttonLabel}</p>
    </div>
  {:else}
    <div class="flex-1 min-h-0 overflow-auto bg-gray-50 dark:bg-gray-950 px-3 py-3">
      <div class="flex items-center gap-2 mb-2">
        <select
          class="px-1.5 py-0.5 rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 text-xs cursor-pointer focus:outline-none focus:border-primary-500"
          value={selectedDimension}
          onchange={(e) => setSelectedDimension(e.currentTarget.value)}
          aria-label="Select dimension"
        >
          {#each ALL_DIMS as d (d.key)}
            <option value={d.key}>{DIM_LABELS[d.key]}</option>
          {/each}
        </select>
        {#if status === 'phase2'}
          <span class="inline-flex items-center gap-1 text-[0.65rem] text-blue-600 dark:text-blue-400">
            <span class="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse"></span>
            refining
          </span>
        {/if}
      </div>

      <div bind:this={graphContainer} bind:clientWidth={graphContainerWidth} class="w-full bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-md p-2">
        {#if downsampledPoints.length === 0}
          <p class="m-0 text-xs italic text-gray-400 dark:text-gray-500 text-center py-6">No scored chunks for this dimension yet.</p>
        {:else}
          <svg width={svgWidth} height={graphHeight} viewBox="0 0 {svgWidth} {graphHeight}" class="block">
            <!-- gridlines -->
            <g stroke="currentColor" stroke-opacity="0.15" stroke-width="1" class="text-gray-400">
              <line x1={padLeft} y1={yScale(0)} x2={padLeft + innerWidth} y2={yScale(0)} />
              <line x1={padLeft} y1={yScale(SCORE_MAX / 2)} x2={padLeft + innerWidth} y2={yScale(SCORE_MAX / 2)} stroke-dasharray="2 2" />
              <line x1={padLeft} y1={yScale(SCORE_MAX)} x2={padLeft + innerWidth} y2={yScale(SCORE_MAX)} />
            </g>
            <!-- y-axis pole labels: right pole on top, left pole on bottom -->
            <g class="fill-gray-500 dark:fill-gray-400 uppercase" font-size="9" font-weight="600" letter-spacing="0.05em">
              <text x={padLeft - 8} y={yScale(SCORE_MAX) + 3} text-anchor="end">{activeDimension.rightLabel}</text>
              <text x={padLeft - 8} y={yScale(0) + 3} text-anchor="end">{activeDimension.leftLabel}</text>
            </g>
            <!-- polyline -->
            {#if downsampledPoints.length > 1}
              <polyline
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                stroke-linejoin="round"
                stroke-linecap="round"
                points={polylinePoints}
                class="text-primary-500"
              />
            {/if}
            <!-- circles -->
            {#each downsampledPoints as pt, i (pt.index)}
              {@const cx = xScale(i)}
              {@const cy = yScale(pt.score)}
              {@const isActive = pt.index === expandedChunkIndex}
              <circle
                cx={cx}
                cy={cy}
                r={isActive ? 5 : 3}
                fill={isActive ? 'currentColor' : 'white'}
                stroke="currentColor"
                stroke-width="2"
                class="text-primary-500 cursor-pointer"
                role="button"
                tabindex="0"
                aria-label={`Chunk ${pt.index + 1}`}
                data-chunk-index={pt.index}
                onclick={() => setExpandedChunkIndex(pt.index)}
              ></circle>
            {/each}
          </svg>
        {/if}
      </div>

      <div class="mt-3">
        {#if descriptions[selectedDimension]?.text}
          {#if descriptions[selectedDimension].stage === 'phase1'}
            <p class="m-0 mb-1 text-[0.65rem] italic text-blue-600 dark:text-blue-400">Preliminary, refining…</p>
          {/if}
          <p class="m-0 text-sm leading-relaxed text-gray-700 dark:text-gray-300 whitespace-pre-wrap">{descriptions[selectedDimension].text}</p>
        {:else}
          <p class="m-0 text-xs italic text-gray-400 dark:text-gray-500">No drift description for this dimension yet.</p>
        {/if}
      </div>

      {#if expandedChunk}
        <div class="mt-4 rounded-md border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-3">
          <div class="flex items-start justify-between gap-2 mb-3">
            <div class="text-[0.65rem] font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400 min-w-0">Chunk {expandedChunk.index + 1}{expandedScores?.topic_label ? ` · ${expandedScores.topic_label}` : ''}</div>
            <button
              class="flex items-center justify-center w-6 h-6 rounded text-gray-400 dark:text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800 cursor-pointer shrink-0"
              onclick={() => setExpandedChunkIndex(expandedChunkIndex)}
              aria-label="Close panel"
            >
              <X size={14} />
            </button>
          </div>

          {#if activeScore != null}
            <div class="mb-3">
              <div class="flex items-center justify-between text-[0.6rem] uppercase tracking-wide text-gray-500 dark:text-gray-400 mb-1">
                <span>{activeDimension.leftLabel}</span>
                <span>{activeDimension.rightLabel}</span>
              </div>
              <div class="relative h-2 rounded-full bg-gray-200 dark:bg-gray-800">
                <div
                  class="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-3.5 h-3.5 rounded-full bg-primary-500 border-2 border-white dark:border-gray-950 shadow"
                  style:left="{(activeScore / SCORE_MAX) * 100}%"
                ></div>
              </div>
            </div>
          {/if}

          <div class="max-h-40 overflow-auto rounded bg-gray-50 dark:bg-gray-950 border border-gray-100 dark:border-gray-800 p-2 text-xs leading-relaxed text-gray-700 dark:text-gray-300 whitespace-pre-wrap">
            {expandedChunk.text}
          </div>

          {#if expandedScores}
            <div class="mt-3 flex flex-col gap-3">
              {#each DIMENSIONS as d (d.key)}
                {@const entry = expandedScores.scores?.[d.key]}
                {#if entry}
                  <div class="flex flex-col gap-1">
                    <div class="flex items-center justify-between text-[0.6rem] uppercase tracking-wide text-gray-500 dark:text-gray-400">
                      <span>{d.leftLabel}</span>
                      <span>{d.rightLabel}</span>
                    </div>
                    <div class="relative h-1.5 rounded-full bg-gray-200 dark:bg-gray-800">
                      <div
                        class="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-2.5 h-2.5 rounded-full bg-primary-500 border border-white dark:border-gray-950"
                        style:left="{(entry.score / SCORE_MAX) * 100}%"
                      ></div>
                    </div>
                    {#if entry.reasoning}
                      <div class="text-xs text-gray-600 dark:text-gray-400 leading-snug">{entry.reasoning}</div>
                    {/if}
                  </div>
                {/if}
              {/each}
              {#if expandedVoice}
                <div class="flex flex-col gap-1 pt-2 border-t border-gray-100 dark:border-gray-800">
                  <div class="flex items-center justify-between text-[0.6rem] uppercase tracking-wide text-gray-500 dark:text-gray-400">
                    <span>Drifting</span>
                    <span>Consistent</span>
                  </div>
                  <div class="relative h-1.5 rounded-full bg-gray-200 dark:bg-gray-800">
                    <div
                      class="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-2.5 h-2.5 rounded-full bg-primary-500 border border-white dark:border-gray-950"
                      style:left="{(expandedVoice.score / SCORE_MAX) * 100}%"
                    ></div>
                  </div>
                  {#if expandedVoice.reasoning}
                    <div class="text-xs text-gray-600 dark:text-gray-400 leading-snug">{expandedVoice.reasoning}</div>
                  {/if}
                </div>
              {/if}
            </div>
          {/if}
        </div>
      {/if}
    </div>
  {/if}
</div>
