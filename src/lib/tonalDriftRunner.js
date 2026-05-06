import { createClient } from './anthropicClient.js';
import { getMockMode } from './mockMode.svelte.js';
import { mockTonalDrift } from './mock.js';
import {
  MAX_DOCUMENT_CHARS,
  SAMPLE_THRESHOLD,
  SCORING_VERSION,
  DIMENSIONS,
  VOICE_CONSISTENCY_KEY,
  chunkDocument,
  hashChunk,
  scoreChunk,
  generateDriftDescription,
  computeVoiceConsistency,
  stratifiedSample,
} from './tonalDrift.js';
import { getCachedScore, putCachedScore } from './tonalDriftCache.js';
import {
  setStatus,
  setError,
  setDocumentTooLong,
  setLastAnalyzedAt,
  setChunks,
  setChunkScore,
  replaceChunkScores,
  setVoiceConsistency,
  replaceDescriptionsByDimension,
  setPhase1Total,
  incPhase1Done,
  setPhase2Total,
  incPhase2Done,
  getChunkScores,
} from './tonalDrift.svelte.js';

async function pMap(items, mapper, concurrency = 6) {
  const ret = new Array(items.length);
  let next = 0;
  async function worker() {
    while (true) {
      const i = next++;
      if (i >= items.length) return;
      ret[i] = await mapper(items[i], i);
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(concurrency, items.length) }, worker),
  );
  return ret;
}

async function generateAllDescriptions(client, model, chunks, scoresByIndex, voiceList) {
  const voiceByIndex = {};
  for (const v of voiceList) voiceByIndex[v.index] = v;

  const dims = [...DIMENSIONS.map((d) => d.key), VOICE_CONSISTENCY_KEY];
  const settled = await Promise.allSettled(
    dims.map((key) => {
      const source = key === VOICE_CONSISTENCY_KEY ? voiceByIndex : scoresByIndex;
      return generateDriftDescription(client, model, key, chunks, source);
    }),
  );
  const out = {};
  for (let i = 0; i < dims.length; i++) {
    const r = settled[i];
    if (r.status === 'fulfilled' && r.value) {
      out[dims[i]] = { text: r.value };
    } else if (r.status === 'rejected') {
      console.warn(`generateAllDescriptions: dimension "${dims[i]}" failed`, r.reason);
    }
  }
  return out;
}

export async function runTonalDrift(extractedText, model) {
  if (getMockMode()) {
    const formatted = extractedText?.formatted || '';
    if (formatted.length > MAX_DOCUMENT_CHARS) {
      setDocumentTooLong(true);
      return;
    }
    const chunks = chunkDocument(formatted);
    const hashed = await Promise.all(
      chunks.map(async (c) => ({ ...c, hash: await hashChunk(c.text) })),
    );
    setChunks(hashed);
    setStatus('phase1');
    const mock = mockTonalDrift(hashed);
    const result = mock instanceof Promise ? await mock : mock;
    replaceChunkScores(result.chunkScores || {});
    setVoiceConsistency(result.voiceConsistency || []);
    replaceDescriptionsByDimension(result.descriptionsByDimension || {});
    setLastAnalyzedAt(Date.now());
    setStatus('ready');
    return;
  }

  const formatted = (extractedText && extractedText.formatted) || '';
  if (!formatted) {
    setError('No document text is available to analyze.');
    return;
  }
  if (formatted.length > MAX_DOCUMENT_CHARS) {
    setDocumentTooLong(true);
    return;
  }

  const rawChunks = chunkDocument(formatted);
  if (rawChunks.length === 0) {
    setError('Document produced no chunks.');
    return;
  }

  const chunks = await Promise.all(
    rawChunks.map(async (c) => ({ ...c, hash: await hashChunk(c.text) })),
  );
  setChunks(chunks);

  const client = createClient();

  const skipSampling = chunks.length < SAMPLE_THRESHOLD;
  const phase1Indices = skipSampling
    ? chunks.map((c) => c.index)
    : stratifiedSample(chunks.length, 0.4);
  const phase1Set = new Set(phase1Indices);
  const phase2Indices = chunks
    .map((c) => c.index)
    .filter((idx) => !phase1Set.has(idx));

  setStatus('phase1');
  setPhase1Total(phase1Indices.length);

  async function processOne(chunk) {
    try {
      const cached = await getCachedScore(chunk.hash, model, SCORING_VERSION);
      if (cached) {
        if (cached.is_citation_only) return { skipped: true };
        return { topic_label: cached.topic_label, scores: cached.scores };
      }
      const result = await scoreChunk(client, model, chunk.text);
      putCachedScore(chunk.hash, model, SCORING_VERSION, result).catch(() => {});
      if (result.is_citation_only) return { skipped: true };
      return { topic_label: result.topic_label, scores: result.scores };
    } catch (err) {
      console.warn(`runTonalDrift: chunk ${chunk.index} failed`, err);
      return null;
    }
  }

  const phase1Chunks = phase1Indices.map((i) => chunks[i]);
  await pMap(
    phase1Chunks,
    async (chunk) => {
      const result = await processOne(chunk);
      if (result && !result.skipped) setChunkScore(chunk.index, result);
      incPhase1Done();
    },
    6,
  );

  let scoresMap = getChunkScores();
  let voice = computeVoiceConsistency(scoresMap);
  setVoiceConsistency(voice);

  // If no Phase 2 will run (small doc), this description pass IS the final
  // result — stamp it 'phase2' so the UI doesn't show "Preliminary, refining…".
  const phase1Stage = phase2Indices.length === 0 ? 'phase2' : 'phase1';
  try {
    const partialDescs = await generateAllDescriptions(client, model, chunks, scoresMap, voice);
    const stamped = {};
    for (const [k, v] of Object.entries(partialDescs)) stamped[k] = { ...v, stage: phase1Stage };
    replaceDescriptionsByDimension(stamped);
  } catch (err) {
    console.warn('runTonalDrift: phase1 description pass failed', err);
  }

  if (phase2Indices.length === 0) {
    setLastAnalyzedAt(Date.now());
    setStatus('ready');
    return;
  }

  setStatus('phase2');
  setPhase2Total(phase2Indices.length);

  const phase2Chunks = phase2Indices.map((i) => chunks[i]);
  await pMap(
    phase2Chunks,
    async (chunk) => {
      const result = await processOne(chunk);
      if (result && !result.skipped) setChunkScore(chunk.index, result);
      incPhase2Done();
    },
    6,
  );

  scoresMap = getChunkScores();
  voice = computeVoiceConsistency(scoresMap);
  setVoiceConsistency(voice);

  try {
    const finalDescs = await generateAllDescriptions(client, model, chunks, scoresMap, voice);
    const stamped = {};
    for (const [k, v] of Object.entries(finalDescs)) stamped[k] = { ...v, stage: 'phase2' };
    replaceDescriptionsByDimension(stamped);
  } catch (err) {
    console.warn('runTonalDrift: phase2 description pass failed; keeping phase1 prose.', err);
  }

  setLastAnalyzedAt(Date.now());
  setStatus('ready');
}
