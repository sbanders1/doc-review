import { listCorpusFiles } from './citationCorpus.js';

let corpusFiles = $state([]);
let corpusLoading = $state(false);
let mappingByCitationId = $state({});
let resultsByCitationId = $state({});
let status = $state('idle');
let error = $state(null);
let lastReviewedAt = $state(null);
let expandedCitationId = $state(null);
let filterSeverity = $state('all');
let filterRelationship = $state('all');

export function getCorpusFiles() {
  return corpusFiles;
}

export function getCorpusLoading() {
  return corpusLoading;
}

export function setCorpusLoading(b) {
  corpusLoading = !!b;
}

export function setCorpusFiles(list) {
  corpusFiles = Array.isArray(list) ? list : [];
}

export async function loadCorpusForSession(sessionId) {
  if (!sessionId) {
    corpusFiles = [];
    return;
  }
  corpusLoading = true;
  try {
    const list = await listCorpusFiles(sessionId);
    corpusFiles = list;
  } catch (err) {
    console.warn('loadCorpusForSession failed:', err);
    corpusFiles = [];
  } finally {
    corpusLoading = false;
  }
}

export function getMappingByCitationId() {
  return mappingByCitationId;
}

export function setMapping(citationId, fileId) {
  if (!citationId) return;
  mappingByCitationId = { ...mappingByCitationId, [citationId]: fileId || null };
}

export function clearMapping(citationId) {
  if (!citationId) return;
  const next = { ...mappingByCitationId };
  delete next[citationId];
  mappingByCitationId = next;
}

export function setMappings(map) {
  mappingByCitationId = { ...(map || {}) };
}

export function mergeMappings(map) {
  mappingByCitationId = { ...mappingByCitationId, ...(map || {}) };
}

export function getResultsByCitationId() {
  return resultsByCitationId;
}

export function setResultForCitation(citationId, result) {
  if (!citationId) return;
  resultsByCitationId = { ...resultsByCitationId, [citationId]: result };
}

export function clearAllResults() {
  resultsByCitationId = {};
  status = 'idle';
  error = null;
  lastReviewedAt = null;
  expandedCitationId = null;
  filterSeverity = 'all';
  filterRelationship = 'all';
}

export function getStatus() {
  return status;
}

export function setStatus(s) {
  status = s;
}

export function getError() {
  return error;
}

export function setError(message) {
  status = 'error';
  error = message;
}

export function getLastReviewedAt() {
  return lastReviewedAt;
}

export function setLastReviewedAt(ts) {
  lastReviewedAt = ts;
}

export function getExpandedCitationId() {
  return expandedCitationId;
}

export function setExpandedCitationId(id) {
  expandedCitationId = id;
}

export function toggleExpandedCitation(id) {
  expandedCitationId = expandedCitationId === id ? null : id;
}

export function getFilterSeverity() {
  return filterSeverity;
}

export function setFilterSeverity(v) {
  filterSeverity = v;
}

export function getFilterRelationship() {
  return filterRelationship;
}

export function setFilterRelationship(v) {
  filterRelationship = v;
}

export function getCitationsReviewSnapshot() {
  return {
    mappingByCitationId: JSON.parse(JSON.stringify(mappingByCitationId)),
    resultsByCitationId: JSON.parse(JSON.stringify(resultsByCitationId)),
    lastReviewedAt,
  };
}

export function restoreCitationsReviewSnapshot(snap) {
  if (!snap) {
    mappingByCitationId = {};
    resultsByCitationId = {};
    lastReviewedAt = null;
    status = 'idle';
    error = null;
    expandedCitationId = null;
    filterSeverity = 'all';
    filterRelationship = 'all';
    return;
  }
  mappingByCitationId = snap.mappingByCitationId && typeof snap.mappingByCitationId === 'object'
    ? { ...snap.mappingByCitationId }
    : {};
  resultsByCitationId = snap.resultsByCitationId && typeof snap.resultsByCitationId === 'object'
    ? { ...snap.resultsByCitationId }
    : {};
  lastReviewedAt = snap.lastReviewedAt || null;
  status = Object.keys(resultsByCitationId).length > 0 ? 'ready' : 'idle';
  error = null;
  expandedCitationId = null;
  filterSeverity = 'all';
  filterRelationship = 'all';
}
