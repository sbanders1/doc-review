import { createClient } from './anthropicClient.js';
import { getMockMode } from './mockMode.svelte.js';
import { mockCritiqueArguments } from './mock.js';
import { addUsageCost } from './cost.svelte.js';

export const CRITIQUE_PROMPT_USER = `Critique the argument tree below as opposing counsel would. Look for logical inconsistencies, weakly supported claims, unjustified leaps from supporting arguments to the central claim, evidentiary gaps where a fact does not actually establish what its parent argument needs, equivocation, and any other angles a competent adversary would press at deposition or in motion practice. Each critique should be specific enough that the document author can act on it.

Do not return results to placate the user or to feel productive. Returning *no* critiques is a perfectly acceptable outcome if the document does not actually have issues worth flagging at this level.

Only surface high-priority, big issues — the kind that a competent adversary would actually press in a deposition or motion. The reviewers using this tool do not have time to triage minor concerns. Skip low-priority observations entirely. Skip stylistic or copy-edit nits. Skip critiques that wouldn't change the outcome of the dispute. If you are uncertain whether something rises to the level of a meaningful weakness, err on the side of leaving it out.

Quality over quantity. A response with two genuinely strong critiques is better than a response with eight critiques where six are filler.

Be succinct. Each critique should be one direct sentence stating the issue. Extend to a second sentence only when the second adds something the first did not. Do not hedge ("appears to", "seems"), do not recap what the document said before stating the critique, and do not pad with framing. Get to the point.`;

export const CRITIQUE_CATEGORIES = [
  'inconsistency',
  'unsupported_claim',
  'weak_inference',
  'overreach',
  'unaddressed_counter',
  'definitional',
];

const CATEGORY_GUIDE = `Categories (pick the most direct fit; do not invent new categories):
- inconsistency: internal contradiction; claims contradict each other or established fact.
- unsupported_claim: assertion offered without evidentiary support; the data slot is empty.
- weak_inference: evidence is offered, but doesn't actually establish the claim; includes post hoc, hasty generalization, cherry-picking, single-anecdote.
- overreach: the conclusion is stronger or broader than the evidence permits.
- unaddressed_counter: an obvious counter, alternative explanation, or confounder is unengaged; strawmen of opposing views also live here.
- definitional: equivocation, vagueness on a load-bearing term, or smuggled premises via loaded language; begging-the-question variants.`;

const CRITIQUE_PROMPT_INTERNAL = `Output via the critique_argument_tree tool. Each critique references one or more argument-tree node ids by their "id" field, using the same ids that appear in the input tree. Critiques may reference a single node (e.g. a specific weak fact) or multiple nodes (e.g. a chain of reasoning where the leap from supporting argument to central claim is weak).

Required fields per critique:
- comment: One direct sentence stating the critique (two only if necessary). Phrased as opposing counsel would press it — no hedging, no recap, no padding. Specific enough to be actionable.
- category: one of "inconsistency" | "unsupported_claim" | "weak_inference" | "overreach" | "unaddressed_counter" | "definitional". Classify each critique under exactly one category from this list. Pick the most direct fit; do not invent new categories.
- severity: one of "high" | "medium" | "low". High = a critique a competent adversary would lead with; low = a minor cleanup issue.
- argument_node_ids: a non-empty array of ids drawn from the input tree. Only reference ids that actually exist in the tree.

${CATEGORY_GUIDE}

Constraints:
- Do not reference any node id that is not present in the input tree.
- Every critique must reference at least one node.
- Aim for the critiques a real opposing counsel would actually raise — quality over quantity. If the tree is strong, return fewer critiques rather than padding.
- An empty critiques array is a valid response. The schema accepts \`{ "critiques": [] }\` and you should return exactly that when the document does not have issues worth flagging at the high-priority threshold described above. Do NOT invent or downgrade-then-include critiques to avoid an empty result.

CRITICAL — natural-language comments only:
The "comment" field is shown to end users who never see the argument tree's internal node ids. The comment must be self-contained natural language describing the issue in terms of the CONTENT of the argument or fact, not its identifier. Never write "node n3", "n5", "n5's claim", or any tree id in the comment. The structural reference belongs in argument_node_ids; the prose belongs in comment.

- BAD: "Node n3's claim about wear rates lacks support."
- GOOD: "The wear-rate claim lacks support."
- BAD: "n5 contradicts n7."
- GOOD: "The expert's testimony about scheduling contradicts the timeline established earlier."`;

const AGGREGATION_PROMPT_INTERNAL = `You are aggregating critiques from multiple independent reviewers (each "run") of the same argument tree. Your job is to cluster overlapping critiques and emit a single consolidated list via the consolidate_critiques tool.

Rules:
- Group critiques pointing to the same underlying issue, even if worded differently or referencing slightly different nodes.
- A critique unique to ONE run should still appear as its own consolidated entry with support_count: 1 — do NOT drop singletons; they may be the strongest catches.
- For each consolidated entry:
  - id: a short unique id you mint, e.g. "c1", "c2".
  - comment: synthesized strongest version of the cluster's complaint, in one direct sentence (two only if necessary). Prefer the clearest, most actionable framing — no hedging, no recap, no padding.
  - category: dominant category in the cluster; if mixed, pick the best-fit consolidated framing. Must be one of "inconsistency" | "unsupported_claim" | "weak_inference" | "overreach" | "unaddressed_counter" | "definitional".
  - severity: the MAX severity in the cluster ("high" beats "medium" beats "low").
  - argument_node_ids: the UNION of node ids across all critiques in the cluster. Only include ids that appear in the original input tree node id list.
  - support_count: the number of DISTINCT runs (1..runCount) that raised this issue. Must be ≤ runCount.

Do not invent issues by clustering loosely related ones to puff up the result. Drop anything that doesn't survive cross-run consensus *as a real issue*. If after consolidation there are no high-quality issues left, return an empty consolidated list. An empty \`consolidated\` array is a valid response and you should return exactly \`{ "consolidated": [] }\` when no cluster rises to the level of a meaningful weakness.

CRITICAL — natural-language comments only:
The consolidated "comment" field is shown to end users who never see the argument tree's internal node ids. The comment must be self-contained natural language describing the issue in terms of the CONTENT of the argument or fact, not its identifier. Never write "node n3", "n5", "n5's claim", or any tree id in the comment. The structural reference belongs in argument_node_ids; the prose belongs in comment.

- BAD: "Node n3's claim about wear rates lacks support."
- GOOD: "The wear-rate claim lacks support."
- BAD: "n5 contradicts n7."
- GOOD: "The expert's testimony about scheduling contradicts the timeline established earlier."

${CATEGORY_GUIDE}`;

export const SUGGESTION_PROMPT_USER = `For each critique below, propose an actionable suggestion the document's author can take to address the issue. The suggestion should describe an *action* — what to do, where to look, what to add or revise — not the text itself. Do not propose replacement sentences, paragraphs, or section text. Do not write what the author "should say." Do not paraphrase the missing prose. The author will write the actual language; your job is to point them at the right move.

Good suggestions look like:
- "Cite a peer-reviewed source for the wear-rate figure, or qualify it as an estimate."
- "Acknowledge and respond to the obvious counter-argument that the witness's testimony reflects bias."
- "Define what is meant by 'reasonable' in this context — the conclusion turns on the term."
- "Reduce the scope of the conclusion to match the evidence, or add evidence sufficient to support the broader claim."

Bad suggestions look like:
- "Replace paragraph 3 with: 'The grass had grown to fourteen inches, exceeding…'" (provides text)
- "Add a sentence saying 'The plaintiff was a forty-eight year old letter carrier…'" (provides text)
- "Write: 'It is my opinion that…'" (provides text)

Keep each suggestion to one or two sentences. Be specific to the critique — not generic advice.`;

const SUGGESTION_PROMPT_INTERNAL = `Output via the attach_suggestions tool. For every critique in the input, emit exactly one suggestion entry whose \`critique_id\` matches the critique's \`id\`. Do not invent new critique ids; do not omit any input critique. The order in your output need not match the input order.

CRITICAL — natural-language suggestions only:
The "suggestion" field is shown to end users who never see the argument tree's internal node ids. Every suggestion must be self-contained natural language that refers to the CONTENT of an argument or fact, not its identifier. Never write "node n3", "n5", "n5's claim", "c2", or any tree/critique id in the suggestion. If you need to point at a specific argument, paraphrase what it says.

- BAD: "Cite a peer-reviewed source for n3's wear-rate figure."
- GOOD: "Cite a peer-reviewed source for the wear-rate figure, or qualify it as an estimate."
- BAD: "Reconcile n5 with n7."
- GOOD: "Reconcile the expert's scheduling testimony with the timeline established earlier in the report."`;

const SUGGESTION_TOOL = {
  name: 'attach_suggestions',
  description: 'Attach an actionable suggestion to each critique describing what the author should do — without supplying the text.',
  input_schema: {
    type: 'object',
    properties: {
      suggestions: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            critique_id: { type: 'string', description: 'Matches a critique id from the input.' },
            suggestion: { type: 'string', description: 'One or two sentences directing the author toward an action. Must NOT contain replacement prose or text to insert.' },
          },
          required: ['critique_id', 'suggestion'],
        },
      },
    },
    required: ['suggestions'],
  },
};

const CRITIQUE_TOOL = {
  name: 'critique_argument_tree',
  description: 'Submit a list of critiques against the supplied argument tree, each tied to one or more node ids from the tree and classified into an argumentation-theory category.',
  input_schema: {
    type: 'object',
    properties: {
      critiques: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            comment: { type: 'string', description: 'The critique itself, in one direct sentence (two only if necessary). As opposing counsel would phrase it — no hedging, no recap, no padding.' },
            category: {
              type: 'string',
              enum: CRITIQUE_CATEGORIES,
              description: 'Argumentation-theory category. Pick the most direct fit.',
            },
            severity: {
              type: 'string',
              enum: ['high', 'medium', 'low'],
              description: 'How heavily an adversary would press this. "high" = lead-with material; "low" = minor cleanup.',
            },
            argument_node_ids: {
              type: 'array',
              items: { type: 'string' },
              description: 'Non-empty array of node ids from the input tree that this critique addresses.',
            },
          },
          required: ['comment', 'category', 'severity', 'argument_node_ids'],
        },
      },
    },
    required: ['critiques'],
  },
};

const CONSOLIDATE_TOOL = {
  name: 'consolidate_critiques',
  description: 'Cluster overlapping critiques from multiple runs into a single consolidated list with support counts.',
  input_schema: {
    type: 'object',
    properties: {
      consolidated: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            id: { type: 'string', description: 'Short unique id for this consolidated critique, e.g. "c1".' },
            comment: { type: 'string', description: 'Synthesized strongest version of the cluster\'s complaint, in one direct sentence (two only if necessary). No hedging, no recap, no padding.' },
            category: {
              type: 'string',
              enum: CRITIQUE_CATEGORIES,
              description: 'Dominant category in the cluster.',
            },
            severity: {
              type: 'string',
              enum: ['high', 'medium', 'low'],
              description: 'MAX severity in the cluster.',
            },
            argument_node_ids: {
              type: 'array',
              items: { type: 'string' },
              description: 'UNION of node ids across critiques in the cluster.',
            },
            support_count: {
              type: 'integer',
              description: 'Number of distinct runs (1..runCount) that raised this issue.',
            },
          },
          required: ['id', 'comment', 'category', 'severity', 'argument_node_ids', 'support_count'],
        },
      },
    },
    required: ['consolidated'],
  },
};

const VALID_SEVERITIES = new Set(['high', 'medium', 'low']);
const VALID_CATEGORIES = new Set(CRITIQUE_CATEGORIES);
const SEVERITY_RANK = { low: 0, medium: 1, high: 2 };

// Patterns for stripping leaked argument-tree / critique node identifiers from
// user-facing prose. These run AFTER the model returns, as a defensive backstop
// to the prompt-level instruction.
//
// We target:
//   "node n3", "Node m1n2", "node c4", etc. (with optional ' s / 's possessive)
//   bare "n3", "c2", "m1n3" tokens — but only when surrounded by word boundaries
//
// We do NOT strip uppercase-N words ("New", "Network") nor letters embedded in
// real words. We DO leave anything ambiguous untouched.
const NODE_ID_PHRASE_RE = /\bnodes?\s+[a-z]\d+[a-z0-9]*(?:'s|s)?\b/gi;
const NODE_ID_TOKEN_RE = /\b[mc]\d+n\d+(?:'s)?\b|\bn\d+(?:'s)?\b|\bc\d+(?:'s)?\b/g;

/**
 * Defensive post-processing: strip leaked argument-tree / critique node-id
 * references from user-facing prose. The model is instructed not to emit
 * these in the prompts, but in practice it sometimes still does. We strip
 * conservatively — when in doubt, leave the original text alone.
 *
 * @param {string} text
 * @returns {string} cleaned text
 */
export function scrubNodeIdReferences(text) {
  if (typeof text !== 'string' || !text) return text;

  const original = text;

  // First pass: explicit "node n3" / "node m1n2's" phrases.
  let out = original.replace(NODE_ID_PHRASE_RE, '').replace(/\s{2,}/g, ' ').trim();

  // Second pass: bare id tokens like " n3 ", "(n3)", "n3,". Be careful with
  // possessives — "n5's" stripped becomes a stray apostrophe-s; the regex
  // includes the optional 's so we drop them together.
  out = out.replace(NODE_ID_TOKEN_RE, '').replace(/\s{2,}/g, ' ');

  // Tidy stranded punctuation left behind by removed tokens, e.g.
  // " ()" -> "", " ," -> ",", " ." -> ".".
  out = out
    .replace(/\(\s*\)/g, '')
    .replace(/\s+([,.;:!?])/g, '$1')
    .replace(/\s{2,}/g, ' ')
    .trim();

  if (out === original) return original;

  // If the scrub produced an obviously broken sentence, log a warning but
  // still emit the cleaned text — leaking node ids is worse than awkward
  // phrasing.
  if (/^(and|but|or|because|so|that|which|whose)\b/i.test(out) || out.length === 0) {
    console.warn(
      'scrubNodeIdReferences: scrub produced an awkward result; emitting anyway.',
      { before: original, after: out }
    );
    if (out.length === 0) return original;
  }

  return out;
}

function flattenTree(root) {
  const out = [];
  function walk(node, parentId) {
    if (!node) return;
    out.push({
      id: node.id,
      parent_id: parentId,
      type: node.type,
      text: node.text,
      chunk_ids: Array.isArray(node.chunkIds) ? node.chunkIds : [],
    });
    for (const child of node.children || []) walk(child, node.id);
  }
  walk(root, null);
  return out;
}

function collectNodeIds(root) {
  const ids = new Set();
  function walk(node) {
    if (!node) return;
    ids.add(node.id);
    for (const child of node.children || []) walk(child);
  }
  walk(root);
  return ids;
}

/**
 * Validate per-run critiques. Drops critiques whose argument_node_ids reference
 * unknown nodes or whose category is outside the enum (warns).
 *
 * NOTE: per-run critiques have no `id` (ids are minted at aggregation).
 * To keep parity with old callers, we still accept (and preserve) an existing
 * `id` if the input had one.
 */
export function validateCritiques(critiques, validNodeIds) {
  if (!Array.isArray(critiques)) return [];
  const out = [];
  let droppedUnknown = 0;
  let droppedCategory = 0;
  for (const c of critiques) {
    if (!c || typeof c.comment !== 'string') continue;
    const refs = Array.isArray(c.argument_node_ids) ? c.argument_node_ids : [];
    const cleanedRefs = refs.filter((r) => typeof r === 'string' && validNodeIds.has(r));
    if (cleanedRefs.length === 0) {
      droppedUnknown++;
      continue;
    }
    if (typeof c.category !== 'string' || !VALID_CATEGORIES.has(c.category)) {
      droppedCategory++;
      continue;
    }
    const severity = VALID_SEVERITIES.has(c.severity) ? c.severity : 'medium';
    const entry = {
      comment: scrubNodeIdReferences(c.comment),
      category: c.category,
      severity,
      argumentNodeIds: cleanedRefs,
    };
    if (typeof c.id === 'string') entry.id = c.id;
    out.push(entry);
  }
  if (droppedUnknown > 0) {
    console.warn(`validateCritiques: dropped ${droppedUnknown} critique(s) referencing unknown node ids.`);
  }
  if (droppedCategory > 0) {
    console.warn(`validateCritiques: dropped ${droppedCategory} critique(s) with missing/unknown category.`);
  }
  return out;
}

/**
 * Run a single critique pass against the tree.
 * Returns a list of per-run critique objects (without ids).
 */
export async function runOneCritique(tree, model, userPrompt, validNodeIds) {
  const client = createClient();

  const userPart = (userPrompt && userPrompt.trim()) ? userPrompt : CRITIQUE_PROMPT_USER;
  const flat = flattenTree(tree);
  const serializedTree = JSON.stringify(flat, null, 2);
  const fullPrompt = `${userPart}\n\n${CRITIQUE_PROMPT_INTERNAL}\n\nArgument tree:\n${serializedTree}`;

  const response = await client.messages.stream({
    model,
    max_tokens: 8192,
    tools: [CRITIQUE_TOOL],
    tool_choice: { type: 'tool', name: 'critique_argument_tree' },
    messages: [{ role: 'user', content: fullPrompt }],
  }).finalMessage();

  addUsageCost(model, response.usage);

  const toolUse = response.content.find((block) => block.type === 'tool_use');
  if (!toolUse) {
    console.warn('[critique] response had no tool_use block, treating as zero critiques');
    return [];
  }

  let raw = toolUse.input.critiques;
  if (typeof raw === 'string') raw = JSON.parse(raw);
  if (!Array.isArray(raw)) {
    console.warn(`[critique] unexpected critiques type (${typeof raw}), treating as zero critiques`);
    return [];
  }

  return validateCritiques(raw, validNodeIds);
}

/**
 * Validate consolidated critiques returned from the aggregator.
 */
function validateConsolidated(list, validNodeIds, runCount) {
  if (!Array.isArray(list)) return [];
  const out = [];
  let droppedUnknown = 0;
  let droppedCategory = 0;
  const seenIds = new Set();
  let autoIdCounter = 1;
  for (const c of list) {
    if (!c || typeof c.comment !== 'string') continue;
    const refs = Array.isArray(c.argument_node_ids) ? c.argument_node_ids : [];
    const cleanedRefs = refs.filter((r) => typeof r === 'string' && validNodeIds.has(r));
    if (cleanedRefs.length === 0) {
      droppedUnknown++;
      continue;
    }
    if (typeof c.category !== 'string' || !VALID_CATEGORIES.has(c.category)) {
      droppedCategory++;
      continue;
    }
    const severity = VALID_SEVERITIES.has(c.severity) ? c.severity : 'medium';
    let id = typeof c.id === 'string' && c.id.trim() ? c.id.trim() : '';
    if (!id || seenIds.has(id)) {
      while (seenIds.has(`c${autoIdCounter}`)) autoIdCounter++;
      id = `c${autoIdCounter}`;
      autoIdCounter++;
    }
    seenIds.add(id);
    let supportCount = Number.isInteger(c.support_count) ? c.support_count : 1;
    if (supportCount < 1) supportCount = 1;
    if (supportCount > runCount) supportCount = runCount;
    out.push({
      id,
      comment: scrubNodeIdReferences(c.comment),
      category: c.category,
      severity,
      argumentNodeIds: cleanedRefs,
      supportCount,
    });
  }
  if (droppedUnknown > 0) {
    console.warn(`validateConsolidated: dropped ${droppedUnknown} consolidated critique(s) referencing unknown node ids.`);
  }
  if (droppedCategory > 0) {
    console.warn(`validateConsolidated: dropped ${droppedCategory} consolidated critique(s) with missing/unknown category.`);
  }
  return out;
}

/**
 * Aggregate per-run critiques into a consolidated list via Claude.
 * `perRunCritiques` is the flat list across all runs; each entry must carry a
 * `_runIndex` (0-based) so we can present them grouped to the model.
 */
export async function aggregateCritiques(perRunCritiques, runCount, model, validNodeIds) {
  const client = createClient();

  // Group by run for clear presentation.
  const byRun = {};
  for (const c of perRunCritiques) {
    const idx = typeof c._runIndex === 'number' ? c._runIndex : 0;
    if (!byRun[idx]) byRun[idx] = [];
    byRun[idx].push({
      comment: c.comment,
      category: c.category,
      severity: c.severity,
      argument_node_ids: c.argumentNodeIds,
    });
  }
  const runs = Object.keys(byRun)
    .map((k) => Number(k))
    .sort((a, b) => a - b)
    .map((idx) => ({ run: idx + 1, critiques: byRun[idx] }));

  const validIdList = Array.from(validNodeIds);
  const payload = {
    runCount,
    valid_node_ids: validIdList,
    runs,
  };

  const fullPrompt = `${AGGREGATION_PROMPT_INTERNAL}\n\nThere were ${runCount} runs total. The per-run critiques (organized by run) and the canonical valid node ids are below as JSON. Cluster the critiques and emit a consolidated list via the consolidate_critiques tool.\n\n${JSON.stringify(payload, null, 2)}`;

  const response = await client.messages.stream({
    model,
    max_tokens: 8192,
    tools: [CONSOLIDATE_TOOL],
    tool_choice: { type: 'tool', name: 'consolidate_critiques' },
    messages: [{ role: 'user', content: fullPrompt }],
  }).finalMessage();

  addUsageCost(model, response.usage);

  const toolUse = response.content.find((block) => block.type === 'tool_use');
  if (!toolUse) {
    console.warn('[critique] aggregation response had no tool_use block, treating as zero critiques');
    return [];
  }

  let raw = toolUse.input.consolidated;
  if (typeof raw === 'string') raw = JSON.parse(raw);
  if (!Array.isArray(raw)) {
    console.warn(`[critique] unexpected consolidated type (${typeof raw}), treating as zero critiques`);
    return [];
  }

  return validateConsolidated(raw, validNodeIds, runCount);
}

/**
 * Run an additional Claude pass that attaches an actionable suggestion to each
 * consolidated critique. Returns a new list with `suggestion` (camelCase) added.
 *
 * If the call fails for any reason, returns the input critiques untouched
 * (no `suggestion` field) so callers can still surface the critiques.
 */
export async function addActionableSuggestions(critiques, tree, model) {
  // Short-circuit: with no critiques there is nothing to suggest. Skip the API
  // call entirely rather than invoking the suggestion pass with an empty list.
  if (!Array.isArray(critiques) || critiques.length === 0) return [];
  try {
    const client = createClient();

    const flattenedTree = flattenTree(tree);
    const critiquesForModel = critiques.map((c) => ({
      id: c.id,
      comment: c.comment,
      category: c.category,
      severity: c.severity,
      argument_node_ids: c.argumentNodeIds,
    }));

    const fullPrompt = `${SUGGESTION_PROMPT_USER}\n\n${SUGGESTION_PROMPT_INTERNAL}\n\nArgument tree:\n${JSON.stringify(flattenedTree, null, 2)}\n\nCritiques:\n${JSON.stringify(critiquesForModel, null, 2)}`;

    const response = await client.messages.stream({
      model,
      max_tokens: 4096,
      tools: [SUGGESTION_TOOL],
      tool_choice: { type: 'tool', name: 'attach_suggestions' },
      messages: [{ role: 'user', content: fullPrompt }],
    }).finalMessage();

    addUsageCost(model, response.usage);

    const toolUse = response.content.find((block) => block.type === 'tool_use');
    if (!toolUse) {
      console.warn('[critique] suggestion response had no tool_use block, returning critiques untouched');
      return critiques;
    }

    let raw = toolUse.input.suggestions;
    if (typeof raw === 'string') raw = JSON.parse(raw);
    if (!Array.isArray(raw)) {
      console.warn(`[critique] unexpected suggestions type (${typeof raw}), returning critiques untouched`);
      return critiques;
    }

    const validIds = new Set(critiques.map((c) => c.id));
    const suggestionMap = new Map();
    const unknownIds = [];
    for (const entry of raw) {
      if (!entry || typeof entry !== 'object') continue;
      const cid = typeof entry.critique_id === 'string' ? entry.critique_id : '';
      const rawSug = typeof entry.suggestion === 'string' ? entry.suggestion.trim() : '';
      const sug = scrubNodeIdReferences(rawSug);
      if (!cid) continue;
      if (!validIds.has(cid)) {
        unknownIds.push(cid);
        continue;
      }
      if (!sug) continue;
      suggestionMap.set(cid, sug);
    }
    if (unknownIds.length > 0) {
      console.warn(`addActionableSuggestions: model returned suggestions for unknown critique ids: ${unknownIds.join(', ')}`);
    }

    const missing = [];
    const enriched = critiques.map((c) => {
      const sug = suggestionMap.get(c.id);
      if (sug && sug.length > 0) {
        return { ...c, suggestion: sug };
      }
      missing.push(c.id);
      return { ...c, suggestion: '' };
    });
    if (missing.length > 0) {
      console.warn(`addActionableSuggestions: no suggestion for critique id(s): ${missing.join(', ')}`);
    }

    return enriched;
  } catch (err) {
    console.warn('addActionableSuggestions: suggestion pass failed; returning critiques untouched.', err);
    return critiques;
  }
}

/**
 * Mint client-side ids for a list of per-run critiques (used in the
 * single-successful-run optimization).
 */
function mintSingleRunResult(perRunCritiques) {
  return perRunCritiques.map((c, i) => ({
    id: `c${i + 1}`,
    comment: c.comment,
    category: c.category,
    severity: c.severity,
    argumentNodeIds: c.argumentNodeIds,
    supportCount: 1,
  }));
}

/**
 * Top-level orchestration: run N critique passes in parallel and aggregate.
 */
export async function critiqueArguments(tree, model, userPrompt, runs = 3) {
  if (getMockMode()) {
    return mockCritiqueArguments(tree, runs);
  }

  if (!tree) {
    return { critiques: [] };
  }

  const requestedRuns = Math.max(1, Math.floor(runs) || 1);
  const validNodeIds = collectNodeIds(tree);

  // Fire all runs in parallel.
  const settled = await Promise.allSettled(
    Array.from({ length: requestedRuns }, (_, i) =>
      runOneCritique(tree, model, userPrompt, validNodeIds).then((list) =>
        list.map((c) => ({ ...c, _runIndex: i }))
      )
    )
  );

  const successes = [];
  const failures = [];
  for (const r of settled) {
    if (r.status === 'fulfilled') successes.push(r.value);
    else failures.push(r.reason);
  }

  if (successes.length === 0) {
    throw failures[0] || new Error('All critique runs failed.');
  }
  if (failures.length > 0) {
    console.warn(`critiqueArguments: ${failures.length} of ${requestedRuns} run(s) failed; proceeding with ${successes.length}.`);
  }

  const successfulRunCount = successes.length;
  const flat = successes.flat();

  // If every successful run returned zero critiques, there's nothing to
  // aggregate or suggest against — skip stages 2 and 3 entirely.
  if (flat.length === 0) {
    return { critiques: [] };
  }

  // Optimization: skip stage 2 if only one run is in play.
  if (requestedRuns === 1 || successfulRunCount === 1) {
    const minted = mintSingleRunResult(flat);
    const withSuggestions = await addActionableSuggestions(minted, tree, model);
    return { critiques: withSuggestions };
  }

  const consolidated = await aggregateCritiques(
    flat,
    successfulRunCount,
    model,
    validNodeIds,
  );
  const withSuggestions = await addActionableSuggestions(consolidated, tree, model);
  return { critiques: withSuggestions };
}

// Export the severity rank for any consumer that cares.
export { SEVERITY_RANK };
