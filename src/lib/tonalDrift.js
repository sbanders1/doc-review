import { createClient } from './anthropicClient.js';
import { addUsageCost } from './cost.svelte.js';
import { splitDocumentByParagraphs } from './arguments.js';

export const MAX_DOCUMENT_CHARS = 900_000;
export const CHUNK_TARGET_PARAGRAPHS = 4;
export const CHUNK_MIN_CHARS = 400;
export const CHUNK_MAX_CHARS = 5_000;

// At or above this chunk count, the runner uses the stratified sample-then-
// expand flow (Phase 1 = ~40% sample, Phase 2 = remainder). Below it, the
// runner just scores every chunk in one pass — sampling buys nothing for
// short documents and a 40% sample of e.g. 6 chunks is too sparse to be
// useful.
export const SAMPLE_THRESHOLD = 30;

// Maximum integer score for a single dimension. Bumping this invalidates
// existing cached scores via SCORING_VERSION below.
export const SCORE_MAX = 5;

// Bump this whenever the scoring schema/scale changes so the IndexedDB cache
// stops returning stale entries (e.g. old 0–10 scores after the move to 0–5).
export const SCORING_VERSION = 3;

export const DIMENSIONS = [
  {
    key: 'hedged_assertive',
    leftLabel: 'Hedged',
    rightLabel: 'Assertive',
    prose:
      'How confident the prose sounds. Hedged uses qualifications ("may suggest", "could potentially indicate"); Assertive states claims directly.',
  },
  {
    key: 'plain_technical',
    leftLabel: 'Plain',
    rightLabel: 'Technical',
    prose:
      'How accessible the prose is to a non-economist. Plain uses everyday language; Technical uses jargon, formal econometric framings, or unmodified mathematical descriptions.',
  },
  {
    key: 'concise_expansive',
    leftLabel: 'Concise',
    rightLabel: 'Expansive',
    prose:
      'How efficiently the prose conveys content. Concise says things once, briefly; Expansive elaborates, repeats for emphasis, or builds slowly. Captures sentence-length patterns.',
  },
  {
    key: 'active_passive',
    leftLabel: 'Active',
    rightLabel: 'Passive',
    prose:
      'Mechanical: proportion of active vs. passive constructions. Position reflects passive-voice prevalence (rightmost = heavily passive, leftmost = predominantly active).',
  },
  {
    key: 'signposted_sparse',
    leftLabel: 'Signposted',
    rightLabel: 'Sparse',
    prose:
      'How much the prose holds the reader\'s hand. Signposted has explicit roadmaps and "now we will discuss…" framing; Sparse assumes the reader is following.',
  },
];

export const VOICE_CONSISTENCY_KEY = 'voice_consistency';
export const VOICE_CONSISTENCY_DIMENSION = {
  key: VOICE_CONSISTENCY_KEY,
  leftLabel: 'Drifting',
  rightLabel: 'Consistent',
  prose:
    'Derived metric: how closely each chunk\'s five-dimension stylistic vector tracks its neighbors. Drifting end = notably different from surrounding chunks; Consistent end = closely matches neighbors.',
};

const DIM_KEYS = DIMENSIONS.map((d) => d.key);
const DIM_KEY_SET = new Set(DIM_KEYS);

const ANCHOR_EXAMPLES = `Anchored examples (use these to calibrate position across runs):

- Hedged↔Assertive
  - 0 (Hedged end): "the data may suggest a possible relationship that is consistent with…"
  - 5 (Assertive end): "the data show X. The conclusion follows."

- Plain↔Technical
  - 0 (Plain end): "when prices rise, people buy less"
  - 5 (Technical end): "the partial derivative of quantity demanded with respect to price is negative under standard regularity conditions."

- Concise↔Expansive
  - 0 (Concise end): "X. Therefore Y."
  - 5 (Expansive end): "It is worth noting at this juncture that, as has been previously articulated and will further be elaborated upon below, X obtains in the present analysis, and accordingly Y likewise follows..."

- Active↔Passive
  - 0 (Active end): "I performed the regression and found…"
  - 5 (Passive end): "the regression was performed by the analyst and the result was found to be…"

- Signposted↔Sparse
  - 0 (Signposted end): "Having established the framework, we now turn to the empirical results, which are organized as follows..."
  - 5 (Sparse end): bare prose with no transitions or roadmaps.`;

export const SCORE_PROMPT_USER = `You are a stylistic-drift analyzer. Place the chunk below on five spectrums, each as an integer 0–${SCORE_MAX} where 0 sits at the LEFT pole and ${SCORE_MAX} at the RIGHT pole. The position describes the chunk's tendency, not whether the prose is good or bad. This is subjective — pick the level that best fits; do not pretend false precision.

The five dimensions:

1. hedged_assertive — 0 = Hedged end; ${SCORE_MAX} = Assertive end. ${DIMENSIONS[0].prose}

2. plain_technical — 0 = Plain end; ${SCORE_MAX} = Technical end. ${DIMENSIONS[1].prose}

3. concise_expansive — 0 = Concise end; ${SCORE_MAX} = Expansive end. ${DIMENSIONS[2].prose}

4. active_passive — 0 = Active end; ${SCORE_MAX} = Passive end. ${DIMENSIONS[3].prose}

5. signposted_sparse — 0 = Signposted end; ${SCORE_MAX} = Sparse end. ${DIMENSIONS[4].prose}

${ANCHOR_EXAMPLES}

Also emit a topic_label: a short noun phrase (3–8 words) describing what this chunk is about. Used downstream to refer to regions of the document by content rather than chunk number.

CRITICAL — citation-only chunks: If the chunk is purely a bibliography, works-cited list, references section, footnote dump, or any other citation-only listing with no substantive analytical prose, set is_citation_only = true. Drift analysis is not meaningful for these passages, and they will be excluded from the graph and prose summary. When is_citation_only is true, your scores and reasoning may be brief or perfunctory — they will be discarded. Otherwise (the chunk contains real prose), set is_citation_only = false.

CRITICAL — no numeric references in prose: Do NOT include numeric scores in any free-text field (topic_label or reasoning). Refer to position using the pole names ("leans hedged", "sits at the assertive end", "roughly midway between concise and expansive", "well into passive territory"). Never write "5/${SCORE_MAX}", "scored 3", "a 4 on this dimension", or similar.

Be succinct. No hedging in your reasoning fields — one direct sentence each, grounded in concrete features of the prose (word choice, sentence structure, transitions).`;

const SCORE_PROMPT_INTERNAL = `Use the score_chunk tool. Emit topic_label, is_citation_only, and for each of the five dimensions <key>_score (integer 0–${SCORE_MAX}) and <key>_reasoning (one direct sentence). Each reasoning field is one direct sentence describing position via pole names — no numeric references, no hedging, no recap of the chunk, no padding. Reference concrete features of the prose. Set is_citation_only=true only when the chunk is wholly bibliographic with no substantive prose.`;

function scoreProp(key, leftLabel, rightLabel) {
  return {
    [`${key}_score`]: {
      type: 'integer',
      minimum: 0,
      maximum: SCORE_MAX,
      description: `Integer 0–${SCORE_MAX}. 0 = ${leftLabel} end, ${SCORE_MAX} = ${rightLabel} end.`,
    },
    [`${key}_reasoning`]: {
      type: 'string',
      description: `One direct sentence grounding the position in concrete features of the prose. Refer to position using pole names (e.g. "leans ${leftLabel.toLowerCase()}", "sits at the ${rightLabel.toLowerCase()} end") — no numeric references.`,
    },
  };
}

export const SCORE_TOOL = {
  name: 'score_chunk',
  description:
    'Report the chunk\'s position on the five stylistic dimensions plus a short topic label.',
  input_schema: {
    type: 'object',
    properties: {
      result: {
        type: 'object',
        description: 'topic_label plus per-dimension score+reasoning fields.',
        properties: {
          topic_label: {
            type: 'string',
            description: 'Short noun phrase (3–8 words) describing what this chunk is about.',
          },
          is_citation_only: {
            type: 'boolean',
            description: 'True if the chunk is purely a bibliography, works-cited list, references section, footnote dump, or other citation-only listing with no substantive prose. Such chunks are excluded from drift analysis.',
          },
          ...scoreProp('hedged_assertive', 'Hedged', 'Assertive'),
          ...scoreProp('plain_technical', 'Plain', 'Technical'),
          ...scoreProp('concise_expansive', 'Concise', 'Expansive'),
          ...scoreProp('active_passive', 'Active', 'Passive'),
          ...scoreProp('signposted_sparse', 'Signposted', 'Sparse'),
        },
        required: [
          'topic_label',
          'is_citation_only',
          'hedged_assertive_score',
          'hedged_assertive_reasoning',
          'plain_technical_score',
          'plain_technical_reasoning',
          'concise_expansive_score',
          'concise_expansive_reasoning',
          'active_passive_score',
          'active_passive_reasoning',
          'signposted_sparse_score',
          'signposted_sparse_reasoning',
        ],
      },
    },
    required: ['result'],
  },
};

export const DRIFT_DESCRIPTION_TOOL = {
  name: 'describe_drift',
  description:
    'Emit a short prose description of the stylistic drift pattern across the document for one dimension.',
  input_schema: {
    type: 'object',
    properties: {
      description: {
        type: 'string',
        description:
          'Under-200-word prose description of the drift pattern, referencing regions by topic and including 2–4 short quoted phrases.',
      },
    },
    required: ['description'],
  },
};

const DRIFT_DESCRIPTION_PROMPT_INTERNAL = `You are summarizing the stylistic drift of an expert report on a single dimension. Below is a list of chunks in document order with their topic labels and each chunk's position on the dimension's spectrum. Produce a short prose description (under 200 words) of the drift pattern.

Reference document REGIONS by what they discuss (use the topic labels), NOT by chunk number. Identify specific zones of drift and their magnitude using qualitative language ("a slight shift", "a notable jump", "a sharp swing back to the hedged end"). Include 2–4 short language examples (3–8 words each, in quotes) drawn from the chunks themselves to make the description concrete. Do not invent quotes; only quote phrases that actually appear in the chunks. If the dimension is broadly stable, say so honestly. Be succinct, no hedging, no recap.

CRITICAL — no numeric references: Do NOT include numeric scores, point swings, or scale references in your description (no "scored 4", "a 2-point swing", "out of ${SCORE_MAX}", etc.). Describe drift in terms of pole names and qualitative magnitude only ("the prose leans hedged through the early sections, then shifts toward the assertive end during methodology").

Output via the describe_drift tool.`;

// Below this chunk count, we fall back to one chunk per paragraph so that
// short documents still produce a meaningful drift signal instead of a
// single aggregated chunk.
const MIN_GROUPED_CHUNKS = 5;

function chunkByParagraphGroups(paragraphs) {
  const out = [];
  let buf = [];
  let bufLen = 0;
  const SEP_LEN = 2;

  function flush() {
    if (buf.length === 0) return;
    out.push({
      index: out.length,
      text: buf.join('\n\n'),
      paragraphCount: buf.length,
    });
    buf = [];
    bufLen = 0;
  }

  for (const p of paragraphs) {
    if (p.length > CHUNK_MAX_CHARS) {
      flush();
      console.warn(
        `chunkDocument: paragraph of ${p.length} chars exceeds CHUNK_MAX_CHARS=${CHUNK_MAX_CHARS}; emitting as own chunk.`,
      );
      out.push({ index: out.length, text: p, paragraphCount: 1 });
      continue;
    }

    const projected = bufLen === 0 ? p.length : bufLen + SEP_LEN + p.length;
    const wouldExceedMax = projected > CHUNK_MAX_CHARS;
    const reachedTarget = buf.length >= CHUNK_TARGET_PARAGRAPHS && bufLen >= CHUNK_MIN_CHARS;

    if (buf.length > 0 && (wouldExceedMax || reachedTarget)) {
      flush();
      buf.push(p);
      bufLen = p.length;
    } else {
      buf.push(p);
      bufLen = projected;
    }
  }

  flush();
  return out;
}

function chunkByParagraph(paragraphs) {
  return paragraphs.map((p, i) => ({
    index: i,
    text: p,
    paragraphCount: 1,
  }));
}

/**
 * Split a `formatted` document into chunks. Default strategy is to group
 * paragraphs into chunks of about CHUNK_TARGET_PARAGRAPHS each. Short
 * documents (where grouping yields fewer than MIN_GROUPED_CHUNKS chunks)
 * fall back to one paragraph per chunk so the drift graph has enough
 * resolution to be useful.
 *
 * Returns [{ index, text, paragraphCount }, ...].
 */
export function chunkDocument(formatted) {
  if (typeof formatted !== 'string' || formatted.length === 0) return [];

  let paragraphs = formatted
    .split(/\n\s*\n/)
    .map((p) => p.replace(/^\s+|\s+$/g, ''))
    .filter((p) => p.length > 0);

  // Defensive fallback for `formatted` text that lacks blank-line paragraph
  // breaks (e.g. older adapter output cached in a session before the text
  // adapter was updated to preserve them). If we get exactly one paragraph
  // back but the text contains many single newlines, treat each line as its
  // own paragraph candidate so chunking still produces a useful number of
  // chunks. The threshold of 5 mirrors MIN_GROUPED_CHUNKS — no point firing
  // the fallback if the result still wouldn't yield useful resolution.
  if (paragraphs.length === 1 && paragraphs[0].includes('\n')) {
    const lines = paragraphs[0]
      .split(/\n+/)
      .map((l) => l.trim())
      .filter((l) => l.length > 0);
    if (lines.length >= MIN_GROUPED_CHUNKS) {
      paragraphs = lines;
    }
  }

  if (paragraphs.length === 0) return [];

  const grouped = chunkByParagraphGroups(paragraphs);
  if (grouped.length >= MIN_GROUPED_CHUNKS) return grouped;
  return chunkByParagraph(paragraphs);
}

// Re-export so callers can verify the underlying primitive matches the one
// arguments.js uses.
export { splitDocumentByParagraphs };

/**
 * Lowercase hex SHA-256 of `text`.
 */
export async function hashChunk(text) {
  const enc = new TextEncoder().encode(text);
  const buf = await crypto.subtle.digest('SHA-256', enc);
  const bytes = new Uint8Array(buf);
  let hex = '';
  for (let i = 0; i < bytes.length; i++) {
    hex += bytes[i].toString(16).padStart(2, '0');
  }
  return hex;
}

function clampScore(v) {
  const n = Math.round(Number(v));
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(SCORE_MAX, n));
}

function asString(v) {
  return typeof v === 'string' ? v : '';
}

/**
 * Single LLM call. Returns
 *   { topic_label, scores: { hedged_assertive: { score, reasoning }, ... } }
 */
export async function scoreChunk(client, model, text) {
  const userMessage = `${SCORE_PROMPT_USER}\n\n${SCORE_PROMPT_INTERNAL}\n\nChunk to score:\n\n${text}`;

  const response = await client.messages
    .stream({
      model,
      max_tokens: 2048,
      tools: [SCORE_TOOL],
      tool_choice: { type: 'tool', name: 'score_chunk' },
      messages: [{ role: 'user', content: userMessage }],
    })
    .finalMessage();

  addUsageCost(model, response.usage);

  const toolUse = response.content.find((b) => b.type === 'tool_use');
  if (!toolUse) {
    throw new Error(`scoreChunk: no tool_use block (stop_reason=${response.stop_reason})`);
  }

  let result = toolUse.input?.result;
  if (typeof result === 'string') {
    try {
      result = JSON.parse(result);
    } catch {
      result = null;
    }
  }
  if (!result || typeof result !== 'object') {
    throw new Error(`scoreChunk: malformed tool input (stop_reason=${response.stop_reason}).`);
  }

  const scores = {};
  for (const key of DIM_KEYS) {
    scores[key] = {
      score: clampScore(result[`${key}_score`]),
      reasoning: asString(result[`${key}_reasoning`]),
    };
  }

  return {
    topic_label: asString(result.topic_label).trim() || 'Unlabeled passage',
    is_citation_only: result.is_citation_only === true,
    scores,
  };
}

/**
 * Generate a prose description of the drift pattern for one dimension.
 */
export async function generateDriftDescription(client, model, dimensionKey, chunks, scoresByIndex) {
  const dim =
    DIMENSIONS.find((d) => d.key === dimensionKey) ||
    (dimensionKey === VOICE_CONSISTENCY_KEY ? VOICE_CONSISTENCY_DIMENSION : null);
  if (!dim) throw new Error(`generateDriftDescription: unknown dimension "${dimensionKey}".`);

  const isVoice = dimensionKey === VOICE_CONSISTENCY_KEY;

  const items = chunks
    .map((c) => {
      const entry = scoresByIndex[c.index];
      if (!entry) return null;
      const snippet = c.text.slice(0, 300).replace(/\s+/g, ' ').trim();
      let score = null;
      let topic = '';
      if (isVoice) {
        score = typeof entry.score === 'number' ? entry.score : null;
        topic = entry.topic_label || '';
      } else {
        const s = entry.scores?.[dimensionKey];
        score = s ? s.score : null;
        topic = entry.topic_label || '';
      }
      if (score == null) return null;
      return { index: c.index, topic_label: topic, score, snippet };
    })
    .filter(Boolean);

  if (items.length === 0) {
    return '';
  }

  const dimensionDescription = `Dimension: ${dim.leftLabel} end (low values) ↔ ${dim.rightLabel} end (high values). ${dim.prose}\n\nValues below are integer positions on a 0–${SCORE_MAX} scale; treat them as relative position only and never repeat the numbers in your prose.`;

  const userMessage = `${DRIFT_DESCRIPTION_PROMPT_INTERNAL}\n\n${dimensionDescription}\n\nChunks (in document order):\n${JSON.stringify(items, null, 2)}`;

  const response = await client.messages
    .stream({
      model,
      max_tokens: 1500,
      tools: [DRIFT_DESCRIPTION_TOOL],
      tool_choice: { type: 'tool', name: 'describe_drift' },
      messages: [{ role: 'user', content: userMessage }],
    })
    .finalMessage();

  addUsageCost(model, response.usage);

  const toolUse = response.content.find((b) => b.type === 'tool_use');
  if (!toolUse) {
    throw new Error(`generateDriftDescription: no tool_use block (stop_reason=${response.stop_reason})`);
  }
  const desc = asString(toolUse.input?.description).trim();
  if (!desc) {
    throw new Error('generateDriftDescription: empty description.');
  }
  return desc;
}

function median(arr) {
  if (arr.length === 0) return null;
  const sorted = [...arr].sort((a, b) => a - b);
  const mid = sorted.length >> 1;
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

/**
 * Pure. For each chunk i, compute MAD between its five-dim vector and the
 * median per-dimension over chunks in window [i-3..i-1] ∪ [i+1..i+3]. Map
 * MAD≥4 → 0, MAD≈0 → 10.
 *
 * Input shape: array of { index, scores: { dim: { score, reasoning } } } or
 * a sparse object keyed by index. We accept both.
 */
export function computeVoiceConsistency(chunkScores, neighborWindow = 3) {
  const indexed = [];
  if (Array.isArray(chunkScores)) {
    for (const e of chunkScores) {
      if (e && typeof e === 'object' && typeof e.index === 'number') indexed.push(e);
    }
  } else if (chunkScores && typeof chunkScores === 'object') {
    for (const [k, v] of Object.entries(chunkScores)) {
      if (v && typeof v === 'object') indexed.push({ index: Number(k), ...v });
    }
  }
  indexed.sort((a, b) => a.index - b.index);

  const out = [];
  for (let i = 0; i < indexed.length; i++) {
    const self = indexed[i];
    const selfVec = DIM_KEYS.map((k) => {
      const s = self.scores?.[k];
      return s && typeof s.score === 'number' ? s.score : null;
    });
    if (selfVec.some((v) => v == null)) continue;

    const neighbors = [];
    for (let j = Math.max(0, i - neighborWindow); j < i; j++) neighbors.push(indexed[j]);
    for (let j = i + 1; j <= Math.min(indexed.length - 1, i + neighborWindow); j++) {
      neighbors.push(indexed[j]);
    }
    if (neighbors.length === 0) {
      out.push({ index: self.index, score: SCORE_MAX, reasoning: 'No neighbors to compare against.' });
      continue;
    }

    const perDimMedian = DIM_KEYS.map((k) => {
      const vs = neighbors
        .map((n) => n.scores?.[k]?.score)
        .filter((v) => typeof v === 'number');
      return median(vs);
    });

    if (perDimMedian.some((v) => v == null)) {
      out.push({ index: self.index, score: SCORE_MAX, reasoning: 'Neighbor scores unavailable.' });
      continue;
    }

    let madSum = 0;
    for (let k = 0; k < DIM_KEYS.length; k++) {
      madSum += Math.abs(selfVec[k] - perDimMedian[k]);
    }
    const mad = madSum / DIM_KEYS.length;
    // Map MAD onto 0..SCORE_MAX. With per-dim values in [0, SCORE_MAX], the
    // MAD ceiling is SCORE_MAX/2 in practice — clip there.
    const madCeiling = SCORE_MAX / 2;
    const score = Math.max(
      0,
      Math.min(SCORE_MAX, Math.round(SCORE_MAX - (mad / madCeiling) * SCORE_MAX)),
    );
    // Reasoning bands: relative to the new ceiling. Prose only — no numbers.
    let reasoning;
    if (mad < madCeiling * 0.25) reasoning = 'Closely tracks the surrounding chunks.';
    else if (mad < madCeiling * 0.5) reasoning = 'Within typical range of the surrounding chunks.';
    else if (mad < madCeiling * 0.75) reasoning = 'Noticeably different from the surrounding chunks.';
    else reasoning = 'Reads as a different writer than what surrounds it.';

    out.push({ index: self.index, score, reasoning });
  }
  return out;
}

/**
 * Pick ~fraction*chunkCount stratified indices, sorted ascending.
 */
export function stratifiedSample(chunkCount, fraction = 0.4) {
  if (chunkCount <= 0) return [];
  const target = Math.max(1, Math.ceil(chunkCount * fraction));
  if (target >= chunkCount) {
    return Array.from({ length: chunkCount }, (_, i) => i);
  }
  const out = new Set();
  for (let s = 0; s < target; s++) {
    const lo = Math.floor((s * chunkCount) / target);
    const hi = Math.floor(((s + 1) * chunkCount) / target);
    const span = Math.max(1, hi - lo);
    let pick = lo + Math.floor(Math.random() * span);
    if (pick >= chunkCount) pick = chunkCount - 1;
    while (out.has(pick) && pick < hi - 1) pick++;
    while (out.has(pick) && pick > lo) pick--;
    out.add(pick);
  }
  return Array.from(out).sort((a, b) => a - b);
}

export { DIM_KEYS, DIM_KEY_SET };
