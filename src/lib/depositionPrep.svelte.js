import { SvelteSet } from 'svelte/reactivity';

const VALID_CATEGORIES = new Set(['concession', 'scope', 'self_contradiction']);

let questions = $state([]);
let status = $state('idle');
let error = $state(null);
let lastGeneratedAt = $state(null);
let expandedIds = $state(new SvelteSet());
let filterCategory = $state('all');
let filterPage = $state('all');

function mintIds(list) {
  return list.map((q, i) => ({ ...q, id: `q${i + 1}` }));
}

function asString(v) {
  return typeof v === 'string' ? v : '';
}

function asStringArray(v) {
  if (!Array.isArray(v)) return [];
  return v.filter((x) => typeof x === 'string' && x.length > 0);
}

export function getDepositionQuestions() {
  return questions;
}

export function getDepositionStatus() {
  return status;
}

export function getDepositionError() {
  return error;
}

export function getLastGeneratedAt() {
  return lastGeneratedAt;
}

export function getExpandedIds() {
  return expandedIds;
}

export function getFilterCategory() {
  return filterCategory;
}

export function getFilterPage() {
  return filterPage;
}

export function setDepositionLoading() {
  status = 'loading';
  error = null;
}

export function setDepositionResult(list) {
  const incoming = Array.isArray(list) ? list : [];
  questions = mintIds(incoming);
  status = 'ready';
  error = null;
  lastGeneratedAt = Date.now();
  expandedIds = new SvelteSet();
}

export function setDepositionError(message) {
  status = 'error';
  error = message;
}

export function clearDepositionQuestions() {
  questions = [];
  status = 'idle';
  error = null;
  lastGeneratedAt = null;
  expandedIds = new SvelteSet();
  filterCategory = 'all';
  filterPage = 'all';
}

export function toggleExpanded(id) {
  if (expandedIds.has(id)) {
    expandedIds.delete(id);
  } else {
    expandedIds.add(id);
  }
}

export function expandAll() {
  const next = new SvelteSet();
  for (const q of questions) next.add(q.id);
  expandedIds = next;
}

export function collapseAll() {
  expandedIds = new SvelteSet();
}

export function setFilterCategory(value) {
  filterCategory = value;
}

export function setFilterPage(value) {
  filterPage = value;
}

export function getDepositionSnapshot() {
  return {
    questions: JSON.parse(JSON.stringify(questions)),
    lastGeneratedAt,
  };
}

export function restoreDepositionSnapshot(snapshot) {
  if (!snapshot) {
    questions = [];
    lastGeneratedAt = null;
    status = 'idle';
    error = null;
    expandedIds = new SvelteSet();
    filterCategory = 'all';
    filterPage = 'all';
    return;
  }
  const incoming = Array.isArray(snapshot.questions) ? snapshot.questions : [];
  const filtered = incoming.filter(
    (q) =>
      q &&
      typeof q.category === 'string' &&
      VALID_CATEGORIES.has(q.category) &&
      typeof q.question === 'string' &&
      q.question.trim().length > 0,
  );
  questions = filtered.map((q, i) => ({
    id: typeof q.id === 'string' && q.id ? q.id : `q${i + 1}`,
    question: q.question,
    category: q.category,
    extracts: asString(q.extracts),
    danger: asString(q.danger),
    defensible_answer: asString(q.defensible_answer),
    bad_answer: asString(q.bad_answer),
    bad_answer_reasoning: asString(q.bad_answer_reasoning),
    chunk_ids: asStringArray(q.chunk_ids),
  }));
  lastGeneratedAt = snapshot.lastGeneratedAt || null;
  status = questions.length > 0 ? 'ready' : 'idle';
  error = null;
  expandedIds = new SvelteSet();
  filterCategory = 'all';
  filterPage = 'all';
}
