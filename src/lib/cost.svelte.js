// Tracks total Anthropic API cost for the current browser session.
// Lives in memory only — no persistence across reloads.

// USD per 1M tokens. Canonical Anthropic public pricing as of late 2025/2026.
const PRICING = {
  // Opus
  'claude-opus-4-7':              { input: 15, output: 75 },
  'claude-opus-4-1-20250805':     { input: 15, output: 75 },
  'claude-opus-4-20250514':       { input: 15, output: 75 },
  // Sonnet
  'claude-sonnet-4-6':            { input: 3,  output: 15 },
  'claude-sonnet-4-20250514':     { input: 3,  output: 15 },
  // Haiku
  'claude-haiku-4-5-20251001':    { input: 1,  output: 5 },
};

// Cache token rate multipliers (relative to input rate).
const CACHE_WRITE_MULT = 1.25;
const CACHE_READ_MULT = 0.1;

// Defensive fallback rates for unknown models — Sonnet midpoint.
const FALLBACK_RATES = { input: 3, output: 15 };

const warnedUnknownModels = new Set();

let totalCost = $state(0);
let totalInputTokens = $state(0);
let totalOutputTokens = $state(0);

function ratesFor(model) {
  const rates = PRICING[model];
  if (rates) return rates;
  if (!warnedUnknownModels.has(model)) {
    warnedUnknownModels.add(model);
    console.warn(`[cost] Unknown model id "${model}" — falling back to Sonnet rates ($${FALLBACK_RATES.input}/$${FALLBACK_RATES.output} per 1M).`);
  }
  return FALLBACK_RATES;
}

/**
 * Add the cost of a single API response to the running total.
 * No-op if `usage` is null/undefined.
 *
 * @param {string} model - Model id used for the call.
 * @param {Object} usage - Anthropic usage object: { input_tokens, output_tokens, cache_creation_input_tokens?, cache_read_input_tokens? }
 * @returns {number} Dollar amount added.
 */
export function addUsageCost(model, usage) {
  if (!usage) return 0;

  const inputTokens = Number(usage.input_tokens) || 0;
  const outputTokens = Number(usage.output_tokens) || 0;
  const cacheWriteTokens = Number(usage.cache_creation_input_tokens) || 0;
  const cacheReadTokens = Number(usage.cache_read_input_tokens) || 0;

  const { input: inputRate, output: outputRate } = ratesFor(model);

  // All rates are USD per 1M tokens.
  const cost =
    (inputTokens * inputRate) / 1_000_000 +
    (outputTokens * outputRate) / 1_000_000 +
    (cacheWriteTokens * inputRate * CACHE_WRITE_MULT) / 1_000_000 +
    (cacheReadTokens * inputRate * CACHE_READ_MULT) / 1_000_000;

  totalCost += cost;
  // Count cache tokens against the input bucket so the input total reflects
  // all input-side tokens charged for.
  totalInputTokens += inputTokens + cacheWriteTokens + cacheReadTokens;
  totalOutputTokens += outputTokens;

  return cost;
}

export function getTotalCost() {
  return totalCost;
}

export function getTotalInputTokens() {
  return totalInputTokens;
}

export function getTotalOutputTokens() {
  return totalOutputTokens;
}

export function resetCost() {
  totalCost = 0;
  totalInputTokens = 0;
  totalOutputTokens = 0;
}

/**
 * Format a dollar amount for display. Picks decimal places to avoid showing
 * "$0.00" when the actual spend is non-zero but small.
 *
 * @param {number} n - Amount in dollars.
 * @returns {string}
 */
export function formatCost(n) {
  const v = Number(n) || 0;
  if (v === 0) return '$0.00';
  if (v >= 1) return `$${v.toFixed(2)}`;
  if (v >= 0.01) return `$${v.toFixed(2)}`;
  // Sub-cent amounts: 4 decimals. If still rounds to $0.0000, bump precision.
  if (v >= 0.0001) return `$${v.toFixed(4)}`;
  // Vanishingly small but non-zero spend — show enough decimals to be visible.
  return `$${v.toFixed(6)}`;
}
