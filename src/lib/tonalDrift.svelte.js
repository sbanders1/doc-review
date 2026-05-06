import { DIMENSIONS, VOICE_CONSISTENCY_KEY } from './tonalDrift.js';

let status = $state('idle');
let error = $state(null);
let lastAnalyzedAt = $state(null);
let documentTooLong = $state(false);

let chunks = $state([]);
let chunkScores = $state({});
let voiceConsistency = $state([]);
let descriptionsByDimension = $state({});

let selectedDimension = $state(DIMENSIONS[0].key);
let expandedChunkIndex = $state(null);

let phase1Total = $state(0);
let phase1Done = $state(0);
let phase2Total = $state(0);
let phase2Done = $state(0);

const VALID_DIM_KEYS = new Set([...DIMENSIONS.map((d) => d.key), VOICE_CONSISTENCY_KEY]);

export function getStatus() {
  return status;
}
export function getError() {
  return error;
}
export function getLastAnalyzedAt() {
  return lastAnalyzedAt;
}
export function getDocumentTooLong() {
  return documentTooLong;
}
export function getChunks() {
  return chunks;
}
export function getChunkScores() {
  return chunkScores;
}
export function getVoiceConsistency() {
  return voiceConsistency;
}
export function getDescriptionsByDimension() {
  return descriptionsByDimension;
}
export function getSelectedDimension() {
  return selectedDimension;
}
export function getExpandedChunkIndex() {
  return expandedChunkIndex;
}
export function getPhase1Progress() {
  return { done: phase1Done, total: phase1Total };
}
export function getPhase2Progress() {
  return { done: phase2Done, total: phase2Total };
}

export function setStatus(next) {
  status = next;
}
export function setError(message) {
  error = message;
  status = 'error';
}
export function setDocumentTooLong(flag) {
  documentTooLong = !!flag;
  if (flag) status = 'error';
}
export function setLastAnalyzedAt(ts) {
  lastAnalyzedAt = ts;
}

export function setChunks(list) {
  chunks = Array.isArray(list) ? list : [];
}
export function setChunkScore(index, payload) {
  chunkScores = { ...chunkScores, [index]: payload };
}
export function replaceChunkScores(map) {
  chunkScores = map && typeof map === 'object' ? { ...map } : {};
}
export function setVoiceConsistency(list) {
  voiceConsistency = Array.isArray(list) ? list : [];
}
export function replaceDescriptionsByDimension(next) {
  descriptionsByDimension = next && typeof next === 'object' ? { ...next } : {};
}
export function setDescription(dimKey, entry) {
  descriptionsByDimension = { ...descriptionsByDimension, [dimKey]: entry };
}

export function setSelectedDimension(key) {
  if (!VALID_DIM_KEYS.has(key)) return;
  selectedDimension = key;
}
export function setExpandedChunkIndex(idx) {
  if (expandedChunkIndex === idx) {
    expandedChunkIndex = null;
  } else {
    expandedChunkIndex = idx;
  }
}

export function setPhase1Total(n) {
  phase1Total = n;
  phase1Done = 0;
}
export function incPhase1Done() {
  phase1Done = phase1Done + 1;
}
export function setPhase2Total(n) {
  phase2Total = n;
  phase2Done = 0;
}
export function incPhase2Done() {
  phase2Done = phase2Done + 1;
}

export function clearTonalDrift() {
  status = 'idle';
  error = null;
  lastAnalyzedAt = null;
  documentTooLong = false;
  chunks = [];
  chunkScores = {};
  voiceConsistency = [];
  descriptionsByDimension = {};
  selectedDimension = DIMENSIONS[0].key;
  expandedChunkIndex = null;
  phase1Total = 0;
  phase1Done = 0;
  phase2Total = 0;
  phase2Done = 0;
}

export function getTonalDriftSnapshot() {
  return {
    chunks: JSON.parse(JSON.stringify(chunks)),
    chunkScores: JSON.parse(JSON.stringify(chunkScores)),
    voiceConsistency: JSON.parse(JSON.stringify(voiceConsistency)),
    descriptionsByDimension: JSON.parse(JSON.stringify(descriptionsByDimension)),
    lastAnalyzedAt,
    selectedDimension,
  };
}

export function restoreTonalDriftSnapshot(snap) {
  status = 'idle';
  error = null;
  documentTooLong = false;
  expandedChunkIndex = null;
  phase1Total = 0;
  phase1Done = 0;
  phase2Total = 0;
  phase2Done = 0;

  if (!snap || typeof snap !== 'object') {
    chunks = [];
    chunkScores = {};
    voiceConsistency = [];
    descriptionsByDimension = {};
    lastAnalyzedAt = null;
    selectedDimension = DIMENSIONS[0].key;
    return;
  }

  chunks = Array.isArray(snap.chunks) ? snap.chunks : [];
  chunkScores = snap.chunkScores && typeof snap.chunkScores === 'object' ? { ...snap.chunkScores } : {};
  voiceConsistency = Array.isArray(snap.voiceConsistency) ? snap.voiceConsistency : [];
  descriptionsByDimension =
    snap.descriptionsByDimension && typeof snap.descriptionsByDimension === 'object'
      ? { ...snap.descriptionsByDimension }
      : {};
  lastAnalyzedAt = snap.lastAnalyzedAt || null;
  selectedDimension = VALID_DIM_KEYS.has(snap.selectedDimension)
    ? snap.selectedDimension
    : DIMENSIONS[0].key;

  if (Object.keys(chunkScores).length > 0) {
    status = 'ready';
  }
}
