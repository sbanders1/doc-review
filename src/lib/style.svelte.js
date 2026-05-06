const VALID_KEYS = new Set([
  'plain_english_to_technical',
  'hedged_to_assertive',
  'concise_to_expansive',
  'advocate_to_neutral',
  'active_to_passive',
  'signposted_to_sparse',
]);

let ratings = $state([]);
let status = $state('idle');
let error = $state(null);
let lastReviewedAt = $state(null);

export function getStyleRatings() {
  return ratings;
}

export function getStyleStatus() {
  return status;
}

export function getStyleError() {
  return error;
}

export function getLastStyleReviewedAt() {
  return lastReviewedAt;
}

export function setStyleLoading() {
  status = 'loading';
  error = null;
}

export function setStyleResult(list) {
  ratings = Array.isArray(list) ? list : [];
  status = 'ready';
  error = null;
  lastReviewedAt = Date.now();
}

export function setStyleError(message) {
  status = 'error';
  error = message;
}

export function clearStyleRatings() {
  ratings = [];
  status = 'idle';
  error = null;
  lastReviewedAt = null;
}

export function getStyleSnapshot() {
  return {
    ratings: JSON.parse(JSON.stringify(ratings)),
    lastReviewedAt,
  };
}

export function restoreStyleSnapshot(snapshot) {
  if (!snapshot) {
    ratings = [];
    lastReviewedAt = null;
    status = 'idle';
    error = null;
    return;
  }
  const incoming = Array.isArray(snapshot.ratings) ? snapshot.ratings : [];
  const filtered = incoming.filter(
    (r) => r && typeof r.dimension === 'string' && VALID_KEYS.has(r.dimension),
  );
  ratings = filtered.map((r) => ({
    dimension: r.dimension,
    score: Math.max(1, Math.min(10, Math.round(Number(r.score) || 1))),
    explanation: typeof r.explanation === 'string' ? r.explanation : '',
  }));
  lastReviewedAt = snapshot.lastReviewedAt || null;
  status = ratings.length > 0 ? 'ready' : 'idle';
  error = null;
}
