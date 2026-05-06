// Six valid argumentation-theory categories. Kept in sync with critique.js.
const VALID_CATEGORIES = new Set([
  'inconsistency',
  'unsupported_claim',
  'weak_inference',
  'overreach',
  'unaddressed_counter',
  'definitional',
]);

let critiques = $state([]);
let status = $state('idle');
let error = $state(null);
let lastCritiqueAt = $state(null);
let activeCritiqueId = $state(null);
let lastRunCount = $state(null);

export function getCritiques() {
  return critiques;
}

export function getCritiqueStatus() {
  return status;
}

export function getCritiqueError() {
  return error;
}

export function getLastCritiqueAt() {
  return lastCritiqueAt;
}

export function getActiveCritiqueId() {
  return activeCritiqueId;
}

export function getLastRunCount() {
  return lastRunCount;
}

export function setActiveCritiqueId(id) {
  if (activeCritiqueId === id) {
    activeCritiqueId = null;
  } else {
    activeCritiqueId = id;
  }
}

export function setCritiqueLoading() {
  status = 'loading';
  error = null;
}

export function setCritiqueResult(list, runCount) {
  critiques = Array.isArray(list) ? list : [];
  status = 'ready';
  error = null;
  lastCritiqueAt = Date.now();
  if (Number.isInteger(runCount) && runCount > 0) {
    lastRunCount = runCount;
  } else if (lastRunCount == null) {
    lastRunCount = 1;
  }
}

export function setCritiqueError(message) {
  status = 'error';
  error = message;
}

export function clearCritiques() {
  critiques = [];
  status = 'idle';
  error = null;
  lastCritiqueAt = null;
  activeCritiqueId = null;
  lastRunCount = null;
}

export function getCritiquesSnapshot() {
  return {
    critiques: JSON.parse(JSON.stringify(critiques)),
    activeCritiqueId,
    lastCritiqueAt,
    lastRunCount,
  };
}

export function restoreCritiquesSnapshot(snapshot) {
  if (!snapshot) {
    critiques = [];
    activeCritiqueId = null;
    lastCritiqueAt = null;
    lastRunCount = null;
    status = 'idle';
    error = null;
    return;
  }
  // Drop any critique missing `category` or with an out-of-enum `category`.
  // Old snapshots from before the categorized-critique change are pre-release
  // noise; cleaner to drop than to fudge a fallback category.
  const incoming = Array.isArray(snapshot.critiques) ? snapshot.critiques : [];
  const filtered = incoming.filter((c) => c && typeof c.category === 'string' && VALID_CATEGORIES.has(c.category));
  if (filtered.length !== incoming.length) {
    console.warn(`restoreCritiquesSnapshot: dropped ${incoming.length - filtered.length} legacy critique(s) without a valid category.`);
  }
  // Default supportCount to 1 if missing on legacy entries.
  critiques = filtered.map((c) => ({
    ...c,
    supportCount: Number.isInteger(c.supportCount) && c.supportCount >= 1 ? c.supportCount : 1,
  }));
  activeCritiqueId = snapshot.activeCritiqueId || null;
  lastCritiqueAt = snapshot.lastCritiqueAt || null;
  lastRunCount = Number.isInteger(snapshot.lastRunCount) && snapshot.lastRunCount > 0
    ? snapshot.lastRunCount
    : null;
  status = critiques.length > 0 ? 'ready' : 'idle';
  error = null;
}

export function getHighlightedNodeIdsForActiveCritique() {
  if (!activeCritiqueId) return new Set();
  const c = critiques.find((x) => x.id === activeCritiqueId);
  return new Set(c?.argumentNodeIds || []);
}
