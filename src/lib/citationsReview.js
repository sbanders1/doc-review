import { addUsageCost } from './cost.svelte.js';

export const MAX_CORPUS_FILES = 500;
export const MAX_CORPUS_CHARS = 100_000;

export const RELATIONSHIPS = ['supports', 'contradicts', 'unrelated', 'partial', 'unmappable'];
export const SEVERITIES = ['severe', 'moderate', 'minor', 'clean'];
export const CONFIDENCES = ['high', 'medium', 'low'];

const VALID_RELATIONSHIPS = new Set(RELATIONSHIPS);
const VALID_CONFIDENCES = new Set(CONFIDENCES);

const STOPWORDS = new Set([
  'v', 'vs', 'inc', 'co', 'corp', 'llc', 'llp', 'ltd', 'pa',
  'f', 'fd', 'f2d', 'f3d', 'f4th', 'us', 'sct', 'led', 'led2d',
  'cir', 'cal', 'tex', 'ny', 'app', 'ed',
  'no', 'note', 'fn', 'see', 'cf', 'eg', 'ie',
  'the', 'a', 'an', 'of', 'and', 'in', 'on', 'at', 'to', 'for', 'by',
  'id', 'supra', 'infra', 'ibid',
  'pdf', 'txt', 'doc', 'docx', 'md', 'markdown',
  'opinion', 'order', 'ruling', 'decision', 'memorandum', 'mem',
]);

function tokenize(s) {
  if (!s || typeof s !== 'string') return [];
  const tokens = s
    .toLowerCase()
    .replace(/['']/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .split(/\s+/)
    .filter((t) => t && t.length >= 2 && !STOPWORDS.has(t));
  return tokens;
}

function stripExt(name) {
  return (name || '').replace(/\.[^/.]+$/, '');
}

export function suggestFileMatch(citationRef, corpusFiles) {
  if (!citationRef || !Array.isArray(corpusFiles) || corpusFiles.length === 0) return null;
  const refTokens = new Set(tokenize(citationRef));
  if (refTokens.size === 0) return null;

  let best = null;
  let bestScore = 0;
  for (const f of corpusFiles) {
    const nameTokens = new Set(tokenize(stripExt(f.name)));
    if (nameTokens.size === 0) continue;
    let overlap = 0;
    for (const t of refTokens) {
      if (nameTokens.has(t)) overlap++;
    }
    if (overlap === 0) continue;
    // Score by overlap, normalized by smaller set so short names aren't unfairly penalized.
    const denom = Math.min(refTokens.size, nameTokens.size);
    const score = overlap / denom;
    if (score > bestScore) {
      bestScore = score;
      best = f;
    }
  }

  // Threshold: at least 1/3 of the smaller set's tokens must overlap.
  if (best && bestScore >= 0.34) return best.id;
  return null;
}

function extractQuoteFromComment(comment) {
  if (!comment || typeof comment !== 'string') return null;
  // Match smart and straight quotes, double or single. Look for runs >20 chars.
  const patterns = [
    /"([^"]{21,})"/,
    /"([^"]{21,})"/,
    /'([^']{21,})'/,
  ];
  for (const re of patterns) {
    const m = comment.match(re);
    if (m && m[1]) return m[1];
  }
  return null;
}

function normalize(s) {
  return (s || '').toLowerCase().replace(/\s+/g, ' ').trim();
}

export function verifyMechanical(citation, mappedFile) {
  if (!mappedFile) {
    return { status: 'unmapped', detail: 'No corpus file is mapped to this citation.' };
  }
  if (!mappedFile.extractedText || !mappedFile.extractedText.formatted) {
    return { status: 'missing_document', detail: 'Mapped file has no extractable text.' };
  }
  const quote = extractQuoteFromComment(citation?.comment);
  if (!quote) {
    return { status: 'pass', detail: 'No quoted excerpt to verify; document is present.' };
  }
  const haystack = normalize(mappedFile.extractedText.formatted);
  const needle = normalize(quote);
  if (!needle) {
    return { status: 'pass', detail: 'Quote was empty after normalization.' };
  }
  if (haystack.includes(needle)) {
    return { status: 'pass', detail: 'Quoted text was located in the cited document.' };
  }
  return {
    status: 'quote_mismatch',
    detail: `Quoted text was not found verbatim in the cited document: "${quote.slice(0, 120)}${quote.length > 120 ? '…' : ''}".`,
  };
}

export const Q2_TOOL = {
  name: 'evaluate_citation_support',
  description: 'Evaluate whether a cited document supports the specific claim it is being used to support in an expert report.',
  input_schema: {
    type: 'object',
    properties: {
      result: {
        type: 'object',
        properties: {
          relationship: {
            type: 'string',
            enum: RELATIONSHIPS,
            description: 'How the cited document relates to the claim being made.',
          },
          reasoning: {
            type: 'string',
            description: 'One direct sentence stating why. No hedging, no recap.',
          },
          cited_excerpt: {
            type: 'string',
            description: 'A short verbatim excerpt (≤300 chars) copied from the cited document that drove the assessment.',
          },
          confidence: {
            type: 'string',
            enum: CONFIDENCES,
            description: 'high | medium | low.',
          },
        },
        required: ['relationship', 'reasoning', 'cited_excerpt', 'confidence'],
      },
    },
    required: ['result'],
  },
};

export const Q2_PROMPT = `You are evaluating whether a cited document supports the specific claim it is being used to support in an expert report. You will receive: (1) the report passage that contains the citation, (2) the cited document's text. Determine the relationship: supports / contradicts / unrelated / partial. Quote a short excerpt (≤300 chars) from the cited document that drove your assessment — never invent the excerpt; copy it verbatim from the cited document. If the cited document does not contain enough material to assess, set relationship='unrelated' and confidence='low'.

Be succinct. One direct sentence of reasoning, no hedging ("appears to", "seems"), no recap of what either document says before your assessment, no padding. Get to the point. Do not include numeric chunk references or sentence ids in user-facing prose.

Confidence calibration:
- high = the cited material clearly speaks to the claim and the relationship is unambiguous.
- medium = the relationship is plausible but the text could reasonably be read multiple ways.
- low = the cited material barely engages with the claim, the fit is forced, or there is too little to tell.

Output via the evaluate_citation_support tool. Do not produce any text outside the tool call.`;

function clampExcerpt(s) {
  if (!s || typeof s !== 'string') return '';
  const trimmed = s.trim();
  if (trimmed.length <= 300) return trimmed;
  return trimmed.slice(0, 300);
}

export async function evaluateNarrowSupport(client, model, { citationRef, comment, reportPassage, citedText, citedName }) {
  const truncatedCited = (citedText || '').slice(0, MAX_CORPUS_CHARS);
  const userContent = `${Q2_PROMPT}

Citation reference: ${citationRef || '(none)'}
Cited document name: ${citedName || '(unnamed)'}
Citation comment / context (from the report's citation extraction):
${comment || '(none)'}

Report passage that contains the citation:
"""
${reportPassage || '(empty passage)'}
"""

Cited document text:
"""
${truncatedCited || '(empty)'}
"""`;

  const response = await client.messages.stream({
    model,
    max_tokens: 1024,
    tools: [Q2_TOOL],
    tool_choice: { type: 'tool', name: 'evaluate_citation_support' },
    messages: [{ role: 'user', content: userContent }],
  }).finalMessage();

  addUsageCost(model, response.usage);

  const toolUse = response.content.find((block) => block.type === 'tool_use');
  if (!toolUse) {
    return {
      relationship: 'unmappable',
      reasoning: 'Model returned no tool_use block.',
      cited_excerpt: '',
      confidence: 'low',
    };
  }

  let raw = toolUse.input?.result;
  if (typeof raw === 'string') {
    try { raw = JSON.parse(raw); } catch { raw = null; }
  }
  if (!raw || typeof raw !== 'object') {
    return {
      relationship: 'unmappable',
      reasoning: 'Model returned a malformed result.',
      cited_excerpt: '',
      confidence: 'low',
    };
  }

  const relationship = VALID_RELATIONSHIPS.has(raw.relationship) ? raw.relationship : 'unrelated';
  const confidence = VALID_CONFIDENCES.has(raw.confidence) ? raw.confidence : 'low';
  const reasoning = typeof raw.reasoning === 'string' ? raw.reasoning.trim() : '';
  const excerpt = clampExcerpt(typeof raw.cited_excerpt === 'string' ? raw.cited_excerpt : '');

  if (!excerpt) {
    return {
      relationship: 'unmappable',
      reasoning: 'Model returned no excerpt; cannot ground the assessment.',
      cited_excerpt: '',
      confidence: 'low',
    };
  }

  return { relationship, reasoning, cited_excerpt: excerpt, confidence };
}

export function computeSeverity({ q1, q2 }) {
  const q1Status = q1?.status;
  const q2Rel = q2?.relationship;
  const q2Conf = q2?.confidence;

  if (q1Status === 'missing_document' || q1Status === 'unmapped') return 'severe';
  if (q2Rel === 'contradicts' || q2Rel === 'unrelated') return 'severe';
  if (q2Rel === 'partial') return 'moderate';
  if (q1Status === 'quote_mismatch') return 'moderate';
  if (q2Rel === 'unmappable') return 'moderate';

  if (q1Status === 'pass' && q2Rel === 'supports') {
    if (q2Conf === 'low') return 'minor';
    return 'clean';
  }

  // Default: nothing matched cleanly.
  return 'moderate';
}
