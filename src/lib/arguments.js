import { createClient } from './anthropicClient.js';
import { getMockMode } from './mockMode.svelte.js';
import { mockAnalyzeArguments } from './mock.js';
import { addUsageCost } from './cost.svelte.js';
import { setProgressMessage, clearProgressMessage } from './argumentTree.svelte.js';

// Threshold and chunk targets for the map-reduce path on large documents.
// Below or at MAP_REDUCE_THRESHOLD, the single-call path is used unchanged.
const MAP_REDUCE_THRESHOLD = 50_000;
const CHUNK_TARGET_MIN = 25_000;
const CHUNK_TARGET_MAX = 30_000;

// Hierarchical reduce: when the map phase produces more partials than
// BATCH_SIZE, we collapse them in tiers of BATCH_SIZE-wide batches. Keeps
// each reduce call's input/output bounded regardless of document length.
const BATCH_SIZE = 4;

export const ARGUMENT_PROMPT_USER = `Analyze the argument structure of the document below.

Your task is to comprehend the document's argumentative content and surface its tree:
- Identify the document's central claim — the single overarching argument it is trying to establish. This becomes the root.
- Identify the supporting arguments (sub-claims) that build toward the root, and the specific facts (evidence, citations, dated events, document references, quantitative findings) that ground those supporting arguments.
- Build the tree only as deep as the document's content genuinely warrants. Do not invent supporting structure that is not actually present.
- A fact node represents one evidentiary point, not one sentence. When multiple consecutive sentences elaborate or restate the same point, group them into a single fact node citing all their chunk_ids — do not split one point into multiple facts. Surface only the load-bearing facts; omit sentences that merely repeat, elaborate, or color in detail an already-cited point. Quality over quantity: prefer fewer well-chosen facts over an exhaustive sentence-by-sentence list.

What to OMIT:
- Chunks that do not participate in the argument should be left out of the tree entirely. This includes asides, tangents, narrative throat-clearing, signatures, boilerplate, page furniture, headings or section labels, acknowledgements, and anything else that is not load-bearing for the argument.
- Do not create a placeholder node just to give a non-argumentative chunk a home.

Node types:
1. argument — the root and any supporting arguments. Supporting arguments are sub-claims that justify a parent argument; nest as deeply as the document warrants.
2. fact — a leaf node carrying a specific factual claim, evidentiary citation, dated event, document reference, or quantitative finding.
3. transition — a connector whose chunks bridge between sibling arguments ("Having established X, we turn to Y"). They do not themselves carry argumentative weight.

High quality results are of utmost importance. If the document does not actually contain a tree-shaped argument — for example, a transcript, a narrative, a loose collection of observations, or material with no clear central claim — return a minimal honest structure (root plus a small handful of children, or even just the root alone with a label that accurately characterizes what the document is). Do not pad the tree.`;

const ARGUMENT_PROMPT_INTERNAL = `Each sentence in the document is labeled with an ID like [s1.3] or [p1.3]. Cite those IDs in chunk_ids so each argument and fact can be traced back to specific passages.

Output via the analyze_argument_structure tool as a flat list of nodes. Each node has:
- id: a short unique identifier you mint, e.g. "n1", "n2"
- parent_id: the id of the parent node, or null for the root
- type: one of argument | fact | transition
- text: a single compact sentence stating the actual claim or fact the node represents. Never a structural placeholder like "root claim", "sub-claim", or "supporting fact"; the reader should learn what is being asserted from this field alone.
- chunk_ids: an array of sentence IDs from the document assigned to this node. Required on every node, but may be empty on internal argument nodes that have no own framing prose. A given chunk_id may appear under at most one node, and need not appear anywhere at all if it is not part of the argument.

Constraints:
- Exactly one node has parent_id = null (the root). The root must be type "argument".
- Every other node references a valid parent_id from the same response.
- No chunk_id may appear under more than one node. A chunk MAY appear in zero nodes — chunks not part of the argument are simply omitted.
- The order of children under any parent must reflect the order their cited chunks appear in the document. For a node with no chunk_ids, use the earliest chunk position among its descendants.
- The order of chunk_ids on a node must reflect their order in the document.
- Facts must be leaves (no children).`;

const ARGUMENT_TOOL = {
  name: 'analyze_argument_structure',
  description: 'Submit the argument structure of the document as a flat list of nodes that form a tree.',
  input_schema: {
    type: 'object',
    properties: {
      nodes: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            id: { type: 'string', description: 'Short unique node id, e.g. "n1".' },
            parent_id: {
              type: ['string', 'null'],
              description: 'Id of the parent node. null for the single root.',
            },
            type: {
              type: 'string',
              enum: ['argument', 'fact', 'transition'],
              description: '"argument" for root + supporting arguments; "fact" for evidentiary leaves; "transition" for connector sentences between siblings.',
            },
            text: {
              type: 'string',
              description: 'A single compact sentence stating the actual claim or fact as the document presents it. NOT a structural placeholder like "root claim", "sub-claim", or "supporting fact" — a reader who sees only this field should learn what is being asserted.',
            },
            chunk_ids: {
              type: 'array',
              items: { type: 'string' },
              description: 'Sentence IDs from the document assigned to this node, e.g. ["s1.3", "s2.7"]. Required on every node, but may be empty on internal argument nodes that have no own framing prose. Not every chunk in the document needs to appear in the tree — chunks that do not participate in the argument should be omitted entirely. A given chunk_id may appear under at most one node.',
            },
          },
          required: ['id', 'parent_id', 'type', 'text', 'chunk_ids'],
        },
      },
    },
    required: ['nodes'],
  },
};

export async function analyzeArgumentStructure(extractedText, model, userPrompt) {
  if (getMockMode()) {
    return mockAnalyzeArguments(extractedText);
  }

  const formatted = (extractedText && extractedText.formatted) || '';
  if (formatted.length > MAP_REDUCE_THRESHOLD) {
    try {
      return await analyzeArgumentStructureMapReduce(extractedText, model, userPrompt);
    } finally {
      clearProgressMessage();
    }
  }

  return await analyzeArgumentStructureSingleCall(extractedText, model, userPrompt);
}

async function analyzeArgumentStructureSingleCall(extractedText, model, userPrompt) {
  const client = createClient();

  const userPart = (userPrompt && userPrompt.trim()) ? userPrompt : ARGUMENT_PROMPT_USER;
  const fullPrompt = `${userPart}\n\n${ARGUMENT_PROMPT_INTERNAL}`;

  const response = await client.messages.stream({
    model,
    max_tokens: 8192,
    tools: [ARGUMENT_TOOL],
    tool_choice: { type: 'tool', name: 'analyze_argument_structure' },
    messages: [
      {
        role: 'user',
        content: `${fullPrompt}\n\nDocument to analyze:\n\n${extractedText.formatted}`,
      },
    ],
  }).finalMessage();

  addUsageCost(model, response.usage);

  const toolUse = response.content.find((block) => block.type === 'tool_use');
  if (!toolUse) {
    throw new Error('No tool use block in response');
  }

  let nodes = toolUse.input.nodes;
  if (typeof nodes === 'string') nodes = JSON.parse(nodes);
  if (!Array.isArray(nodes)) {
    throw new Error(`Unexpected nodes type: ${typeof nodes}`);
  }

  return buildTree(nodes);
}

const VALID_TYPES = new Set(['argument', 'fact', 'transition']);

export function buildTree(nodes, _allChunkIds = null) {
  const byId = new Map();
  let droppedStructural = 0;
  for (const n of nodes) {
    if (!n || typeof n.id !== 'string' || typeof n.text !== 'string') continue;
    if (n.type === 'structural') {
      droppedStructural++;
      continue;
    }
    byId.set(n.id, {
      id: n.id,
      parentId: n.parent_id ?? null,
      type: VALID_TYPES.has(n.type) ? n.type : 'argument',
      text: n.text,
      chunkIds: Array.isArray(n.chunk_ids) ? n.chunk_ids.filter((c) => typeof c === 'string') : [],
      children: [],
    });
  }

  if (droppedStructural > 0) {
    console.warn(`buildTree: dropped ${droppedStructural} legacy "structural" node(s); their non-structural descendants will be reparented to root.`);
  }

  let root = null;
  for (const node of byId.values()) {
    if (node.parentId === null || node.parentId === undefined || !byId.has(node.parentId)) {
      if (!root) {
        root = node;
        node.parentId = null;
      } else {
        node.parentId = root.id;
        root.children.push(node);
      }
      continue;
    }
    byId.get(node.parentId).children.push(node);
  }

  if (!root) {
    throw new Error('Argument analysis returned no root node');
  }

  validateTree(root);
  return root;
}

export function validateTree(root, _allChunkIds = null) {
  const seen = new Set();
  const dups = new Set();

  function walk(node) {
    if (Array.isArray(node.chunkIds)) {
      const cleaned = [];
      for (const c of node.chunkIds) {
        if (seen.has(c)) {
          dups.add(c);
          continue;
        }
        seen.add(c);
        cleaned.push(c);
      }
      node.chunkIds = cleaned;
    }
    for (const ch of node.children || []) walk(ch);
  }
  walk(root);

  if (dups.size > 0) {
    console.warn(`Argument tree had ${dups.size} duplicated chunk_ids; later occurrences dropped:`, [...dups]);
  }

  return root;
}

// =============================================================================
// Map-reduce path for large documents.
// =============================================================================

/**
 * Split a `formatted` document into chunks at paragraph boundaries.
 * Paragraphs (delimited by blank lines, i.e. /\n\s*\n/) are atomic — a single
 * paragraph that exceeds `targetMax` is emitted as one oversized chunk rather
 * than being split mid-paragraph. The chunk-id labels embedded in the text
 * (`[s1.3]`, `[p1.3]`) are preserved verbatim because we never split inside
 * a paragraph.
 *
 * @param {string} formatted
 * @param {number} targetMin soft lower bound on chunk size
 * @param {number} targetMax soft upper bound on chunk size
 * @returns {string[]} non-empty array of chunk strings (or [] if input is empty)
 */
export function splitDocumentByParagraphs(formatted, targetMin = CHUNK_TARGET_MIN, targetMax = CHUNK_TARGET_MAX) {
  if (typeof formatted !== 'string' || formatted.length === 0) return [];

  // Split on blank-line paragraph boundaries. The separators are NOT preserved
  // verbatim, but each paragraph is rejoined with `\n\n` which is the canonical
  // form anyway. This preserves chunk-id labels because they live INSIDE
  // paragraphs, not in the whitespace between them.
  const paragraphs = formatted
    .split(/\n\s*\n/)
    .map((p) => p.replace(/^\s+|\s+$/g, ''))
    .filter((p) => p.length > 0);

  if (paragraphs.length === 0) return [];

  const chunks = [];
  let buf = [];
  let bufLen = 0;
  const SEP_LEN = 2; // `\n\n` between paragraphs

  for (const p of paragraphs) {
    const pLen = p.length;

    // A single paragraph that on its own exceeds the upper target. Flush
    // anything pending, emit this paragraph as its own oversized chunk, warn.
    if (pLen > targetMax) {
      if (buf.length > 0) {
        chunks.push(buf.join('\n\n'));
        buf = [];
        bufLen = 0;
      }
      console.warn(
        `splitDocumentByParagraphs: paragraph of ${pLen} chars exceeds target max ${targetMax}; emitting as one oversized chunk.`
      );
      chunks.push(p);
      continue;
    }

    const projected = bufLen === 0 ? pLen : bufLen + SEP_LEN + pLen;
    if (bufLen > 0 && projected > targetMax) {
      // Adding this paragraph would push the current buffer past the upper
      // target. Cut here, start a new chunk with this paragraph.
      chunks.push(buf.join('\n\n'));
      buf = [p];
      bufLen = pLen;
    } else {
      buf.push(p);
      bufLen = projected;
    }
  }

  if (buf.length > 0) {
    chunks.push(buf.join('\n\n'));
  }

  return chunks;
}

// Per-chunk map tool: same shape as ARGUMENT_TOOL but adds chunk_summary and
// is described as operating on a single excerpt rather than a full document.
const ARGUMENT_LOCAL_TOOL = {
  name: 'analyze_local_argument_structure',
  description: 'Submit local arguments and facts extracted from a single passage of the document, plus a one-sentence summary of that passage.',
  input_schema: {
    type: 'object',
    properties: {
      chunk_summary: {
        type: 'string',
        description: 'A single sentence summarizing what this passage is about, written so a downstream reducer can understand the chunk without re-reading it.',
      },
      nodes: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            id: { type: 'string', description: 'Short unique node id within this chunk, e.g. "n1".' },
            parent_id: {
              type: ['string', 'null'],
              description: 'Id of the parent node within this chunk. null for the chunk-local root.',
            },
            type: {
              type: 'string',
              enum: ['argument', 'fact', 'transition'],
              description: '"argument" for chunk-local root + supporting arguments; "fact" for evidentiary leaves; "transition" for connectors.',
            },
            text: {
              type: 'string',
              description: 'A single compact sentence stating the actual claim or fact as the passage presents it. NOT a structural placeholder like "root claim", "sub-claim", or "supporting fact" — a reader who sees only this field should learn what is being asserted.',
            },
            chunk_ids: {
              type: 'array',
              items: { type: 'string' },
              description: 'Sentence IDs from the passage assigned to this node, e.g. ["s1.3", "s2.7"]. Use the same IDs that appear inline in the passage.',
            },
          },
          required: ['id', 'parent_id', 'type', 'text', 'chunk_ids'],
        },
      },
    },
    required: ['chunk_summary', 'nodes'],
  },
};

const MAP_PROMPT_INTERNAL = `Each sentence in this passage is labeled with an ID like [s1.3] or [p1.3]. Cite those IDs in chunk_ids on every node so each argument and fact can be traced back to specific sentences. Use the IDs verbatim — do not invent or alter them.

Output via the analyze_local_argument_structure tool. The output has two parts:

1) chunk_summary: One single sentence describing what this passage is about. This is grounding for a downstream reducer that will combine your output with other passages — it does NOT need to make a claim about the document's overall thesis. Just describe the passage.

2) nodes: a flat list of LOCAL argument-tree nodes. Each node has:
- id: a short unique identifier you mint, with a chunk-index prefix (provided in the user message) to avoid collisions across chunks, e.g. "m1n1", "m1n2".
- parent_id: the id of the parent node within THIS passage's tree, or null for the chunk-local root.
- type: one of argument | fact | transition
- text: a single compact sentence stating the actual claim or fact the node represents. Never a structural placeholder like "root claim", "sub-claim", or "supporting fact"; the reader should learn what is being asserted from this field alone.
- chunk_ids: an array of sentence IDs from THIS passage assigned to this node. Required on every node, but may be empty on internal argument nodes that have no own framing prose.

Critical instructions:
- This is one EXCERPT of a larger document, not the whole document. Do NOT attempt to identify the document's overall thesis. Describe what is in this excerpt.
- The chunk-local root may itself be a supporting argument, an observation, or just a placeholder grouping node holding several independent items. Pick whichever genuinely fits this passage.
- Exactly one node has parent_id = null (the chunk-local root).
- Facts must be leaves.
- A fact node represents one evidentiary point, not one sentence. When multiple consecutive sentences elaborate or restate the same point, group them into a single fact node citing all their chunk_ids — do not split one point into multiple facts. Quality over quantity: prefer fewer well-chosen facts over an exhaustive sentence-by-sentence list.
- Do not reference any sentence ID that does not appear in this passage.
- Omit chunks that do not participate in argumentation (asides, narrative throat-clearing, signatures, headings, page furniture, etc.). Not every sentence ID needs to appear in the tree.`;

const REDUCE_PROMPT_INTERNAL = `${ARGUMENT_PROMPT_INTERNAL}

Reducer-specific instructions:
- The input below contains (a) per-chunk summaries in document order, and (b) per-chunk LOCAL argument trees that were produced by independent map-phase passes. Use this material — together with the document chunk-id labels (\`p1.3\`, \`s1.3\`, etc.) — to produce ONE unified argument tree for the whole document.
- Identify the document's overall central claim across the chunks. This is the root of your unified tree.
- Place local arguments under appropriate parents in the unified tree.
- Drop redundancy: the same supporting argument or fact appearing in two chunks should appear once in the unified tree, not twice. Merge the chunk_ids.
- Preserve chunk_ids on facts and other nodes — they are the document-level sentence IDs (\`p1.3\`, \`s1.3\`, etc.) that the rest of the application uses to map back to passages.
- Mint FRESH node ids for the unified tree (e.g. \`n1\`, \`n2\`). Do NOT reuse the per-chunk \`m1n1\`-style or \`L2B1n1\`-style ids from earlier phases; those were working ids.
- Preserve the actual claim/fact content in the \`text\` field of each unified node — carry it over from the partials (rephrasing only for clarity or to merge duplicates). Do NOT replace node text with structural placeholders like "root claim", "sub-claim", or "supporting fact".
- When the same supporting argument or fact recurs across partials, emit one node with merged chunk_ids — not one node per occurrence. Let the depth and breadth of the tree match the document's actual argument; do not pad to mirror partial size, and do not collapse genuinely distinct sub-arguments to be brief.
- Output via the analyze_argument_structure tool with the canonical schema.`;

/**
 * Run a single map-phase Claude call against one chunk of the document.
 * Returns { summary, nodes } where nodes is a validated, normalized list
 * (filtered to known types). Mints a chunk-index prefix on node ids
 * (e.g. "m1n1") to avoid collisions across chunks.
 */
export async function mapChunk(chunkText, chunkIndex, model, userPrompt) {
  const client = createClient();

  const userPart = (userPrompt && userPrompt.trim()) ? userPrompt : ARGUMENT_PROMPT_USER;
  const idPrefix = `m${chunkIndex + 1}`;
  const fullPrompt = `${userPart}\n\n${MAP_PROMPT_INTERNAL}\n\nThis is chunk ${chunkIndex + 1} of a multi-chunk document. Mint your node ids with the prefix "${idPrefix}" (e.g. "${idPrefix}n1", "${idPrefix}n2", ...).\n\nPassage to analyze:\n\n${chunkText}`;

  const response = await client.messages.stream({
    model,
    max_tokens: 8192,
    tools: [ARGUMENT_LOCAL_TOOL],
    tool_choice: { type: 'tool', name: 'analyze_local_argument_structure' },
    messages: [{ role: 'user', content: fullPrompt }],
  }).finalMessage();

  addUsageCost(model, response.usage);

  const toolUse = response.content.find((block) => block.type === 'tool_use');
  if (!toolUse) {
    throw new Error(`mapChunk(${chunkIndex}): no tool_use block in response`);
  }

  const input = toolUse.input || {};
  let summary = typeof input.chunk_summary === 'string' ? input.chunk_summary.trim() : '';
  let nodes = input.nodes;
  if (typeof nodes === 'string') {
    try { nodes = JSON.parse(nodes); } catch { nodes = []; }
  }
  if (!Array.isArray(nodes)) nodes = [];

  // Filter to known types and required string fields. Preserve order.
  const cleaned = [];
  for (const n of nodes) {
    if (!n || typeof n.id !== 'string' || typeof n.text !== 'string') continue;
    if (!VALID_TYPES.has(n.type)) continue;
    cleaned.push({
      id: n.id,
      parent_id: typeof n.parent_id === 'string' ? n.parent_id : null,
      type: n.type,
      text: n.text,
      chunk_ids: Array.isArray(n.chunk_ids) ? n.chunk_ids.filter((c) => typeof c === 'string') : [],
    });
  }

  if (!summary) {
    summary = `Chunk ${chunkIndex + 1} (no summary returned).`;
  }

  return { chunkIndex, summary, nodes: cleaned };
}

/**
 * Reduce phase: take the partial trees and per-chunk summaries from the map
 * phase and produce one unified argument tree via Claude.
 */
async function reduceChunks(partials, model, userPrompt) {
  const client = createClient();

  const userPart = (userPrompt && userPrompt.trim()) ? userPrompt : ARGUMENT_PROMPT_USER;

  const sortedPartials = [...partials].sort((a, b) => a.chunkIndex - b.chunkIndex);
  const summaries = sortedPartials.map((p, i) => `Chunk ${p.chunkIndex + 1}: ${p.summary}`).join('\n');
  const partialTrees = sortedPartials.map((p) => ({
    chunk: p.chunkIndex + 1,
    summary: p.summary,
    nodes: p.nodes,
  }));

  const fullPrompt = `${userPart}\n\n${REDUCE_PROMPT_INTERNAL}\n\nPer-chunk summaries (in document order):\n${summaries}\n\nPer-chunk local argument trees (JSON):\n${JSON.stringify(partialTrees, null, 2)}`;

  const response = await client.messages.stream({
    model,
    max_tokens: 32000,
    tools: [ARGUMENT_TOOL],
    tool_choice: { type: 'tool', name: 'analyze_argument_structure' },
    messages: [{ role: 'user', content: fullPrompt }],
  }).finalMessage();

  addUsageCost(model, response.usage);

  const toolUse = response.content.find((block) => block.type === 'tool_use');
  if (!toolUse) {
    throw new Error(`reduceChunks: no tool_use block in response (stop_reason=${response.stop_reason})`);
  }

  let nodes = toolUse.input?.nodes;
  if (typeof nodes === 'string') nodes = JSON.parse(nodes);
  if (!Array.isArray(nodes)) {
    const inputKeys = toolUse.input && typeof toolUse.input === 'object'
      ? Object.keys(toolUse.input).join(', ') || '(empty)'
      : '(no input)';
    throw new Error(
      `reduceChunks: tool_use.input.nodes was ${typeof nodes} (stop_reason=${response.stop_reason}, input keys=${inputKeys}). ` +
      (response.stop_reason === 'max_tokens'
        ? 'The model hit max_tokens before finishing the tool call — output was truncated.'
        : 'Model returned a malformed tool call.')
    );
  }

  return buildTree(nodes);
}

// =============================================================================
// Hierarchical reduce: tree-shaped multi-level reduce for very long documents.
// =============================================================================

const BATCH_REDUCE_PROMPT_INTERNAL = `You are merging multiple partial argument trees from contiguous segments of a longer document into ONE intermediate partial that combines them.

Each partial tree below has:
- a chunk_summary describing what its segments collectively argue
- a flat list of nodes (id, parent_id, type, text, chunk_ids) forming a chunk-local tree

Output via the analyze_local_argument_structure tool. Two parts:

1) chunk_summary: One single sentence describing what THIS GROUP of partials collectively argues. A downstream reducer will combine this output with other intermediate partials — it does NOT need to make a claim about the document's overall thesis.

2) nodes: a flat list of merged nodes producing one chunk-local tree. Each node has:
- id: a short unique identifier you mint, with the level/batch prefix provided in the user message (e.g. "L1B2n1", "L1B2n2"). Mint FRESH ids; do NOT reuse the input partials' ids.
- parent_id: the id of the parent node within THIS merged tree, or null for the chunk-local root.
- type: one of argument | fact | transition.
- text: a single compact sentence stating the actual claim or fact the node represents. Carry over from the input partials, rephrasing only for clarity or to merge duplicates. Never a structural placeholder like "root claim" or "supporting fact".
- chunk_ids: union of the chunk_ids referenced by all input nodes that merged into this one. Document-level sentence IDs (\`p17.7\`, \`s3.1\`, etc.) — preserve them verbatim.

Critical instructions:
- This is one merged GROUP of partials, not the whole document. Do NOT attempt to identify the document's overall thesis. Describe what this group collectively argues.
- Exactly one node has parent_id = null (the chunk-local root).
- Facts must be leaves.
- When the same supporting argument or fact appears in multiple input partials, emit one node with merged chunk_ids rather than one node per occurrence.
- Do not pad the merged tree to mirror the size of the inputs, and do not collapse genuinely distinct sub-arguments. The shape should match what the inputs actually argue, after deduplication.`;

/**
 * Reduce a single batch of partials at an intermediate hierarchical level.
 * Returns a new partial in the same `{ chunkIndex, summary, nodes }` shape so
 * the result can re-enter the reduce loop.
 *
 * @param {Array} batch partials to merge
 * @param {number} batchIndex 0-based index of this batch within its level
 * @param {number} level 1-based hierarchy level
 */
export async function reduceBatch(batch, batchIndex, level, model, userPrompt) {
  const client = createClient();

  const userPart = (userPrompt && userPrompt.trim()) ? userPrompt : ARGUMENT_PROMPT_USER;
  const idPrefix = `L${level}B${batchIndex + 1}`;

  const summaries = batch
    .map((p, i) => `Partial ${i + 1}: ${p.summary}`)
    .join('\n');
  const partialTrees = batch.map((p, i) => ({
    partial: i + 1,
    summary: p.summary,
    nodes: p.nodes,
  }));

  const fullPrompt = `${userPart}\n\n${BATCH_REDUCE_PROMPT_INTERNAL}\n\nMint your node ids with the prefix "${idPrefix}" (e.g. "${idPrefix}n1", "${idPrefix}n2", ...).\n\nInput partial summaries:\n${summaries}\n\nInput partial trees (JSON):\n${JSON.stringify(partialTrees, null, 2)}`;

  const response = await client.messages.stream({
    model,
    max_tokens: 16000,
    tools: [ARGUMENT_LOCAL_TOOL],
    tool_choice: { type: 'tool', name: 'analyze_local_argument_structure' },
    messages: [{ role: 'user', content: fullPrompt }],
  }).finalMessage();

  addUsageCost(model, response.usage);

  const toolUse = response.content.find((b) => b.type === 'tool_use');
  if (!toolUse) {
    throw new Error(`reduceBatch L${level}B${batchIndex + 1}: no tool_use block (stop_reason=${response.stop_reason})`);
  }

  const input = toolUse.input || {};
  let summary = typeof input.chunk_summary === 'string' ? input.chunk_summary.trim() : '';
  let nodes = input.nodes;
  if (typeof nodes === 'string') {
    try { nodes = JSON.parse(nodes); } catch { nodes = []; }
  }
  if (!Array.isArray(nodes)) {
    const inputKeys = typeof input === 'object' ? Object.keys(input).join(', ') || '(empty)' : '(no input)';
    throw new Error(
      `reduceBatch L${level}B${batchIndex + 1}: tool_use.input.nodes was ${typeof nodes} ` +
      `(stop_reason=${response.stop_reason}, input keys=${inputKeys}). ` +
      (response.stop_reason === 'max_tokens'
        ? 'Hit max_tokens — output truncated.'
        : 'Malformed tool call.')
    );
  }

  const cleaned = [];
  for (const n of nodes) {
    if (!n || typeof n.id !== 'string' || typeof n.text !== 'string') continue;
    if (!VALID_TYPES.has(n.type)) continue;
    cleaned.push({
      id: n.id,
      parent_id: typeof n.parent_id === 'string' ? n.parent_id : null,
      type: n.type,
      text: n.text,
      chunk_ids: Array.isArray(n.chunk_ids) ? n.chunk_ids.filter((c) => typeof c === 'string') : [],
    });
  }

  if (!summary) summary = `Level ${level} batch ${batchIndex + 1} (no summary returned).`;
  return { chunkIndex: batchIndex, summary, nodes: cleaned };
}

/**
 * Hierarchically reduce a list of partials down to one canonical tree.
 * Loops: while partials.length > BATCH_SIZE, group into batches, reduce each
 * in parallel, replace the partial list with the batch results, repeat. Once
 * partials.length ≤ BATCH_SIZE, run the final reducer to produce the
 * canonical doc-level tree.
 */
export async function hierarchicalReduce(partials, model, userPrompt) {
  let current = [...partials];
  let level = 1;

  while (current.length > BATCH_SIZE) {
    const batches = [];
    for (let i = 0; i < current.length; i += BATCH_SIZE) {
      batches.push(current.slice(i, i + BATCH_SIZE));
    }

    setProgressMessage(`Reducing level ${level}: ${current.length} partials → ${batches.length} batches...`);

    let completed = 0;
    const settled = await Promise.allSettled(
      batches.map((batch, idx) =>
        reduceBatch(batch, idx, level, model, userPrompt).then((res) => {
          completed += 1;
          setProgressMessage(`Reducing level ${level}: ${completed}/${batches.length} batches done...`);
          return res;
        })
      )
    );

    const successes = [];
    const failures = [];
    for (const r of settled) {
      if (r.status === 'fulfilled') successes.push(r.value);
      else failures.push(r.reason);
    }

    if (failures.length > 0) {
      console.warn(`hierarchicalReduce level ${level}: ${failures.length} of ${batches.length} batch(es) failed; proceeding with ${successes.length}.`, failures);
    }
    if (successes.length === 0) {
      throw failures[0] || new Error(`hierarchicalReduce: all batches at level ${level} failed.`);
    }

    current = successes;
    level += 1;
  }

  setProgressMessage(`Final reduce: unifying ${current.length} partial(s) into the document tree...`);
  return await reduceChunks(current, model, userPrompt);
}

/**
 * Map-reduce orchestrator for large documents. Splits the document at
 * paragraph boundaries, runs map-phase Claude calls in parallel against each
 * chunk, then reduces the per-chunk partials into one unified tree.
 */
async function analyzeArgumentStructureMapReduce(extractedText, model, userPrompt) {
  const formatted = extractedText.formatted;
  const chunks = splitDocumentByParagraphs(formatted, CHUNK_TARGET_MIN, CHUNK_TARGET_MAX);

  if (chunks.length === 0) {
    // Defensive: empty input shouldn't reach here (length check upstream),
    // but if it does, fall back to single-call.
    return await analyzeArgumentStructureSingleCall(extractedText, model, userPrompt);
  }

  const total = chunks.length;
  setProgressMessage(`Analyzing ${total} chunks in parallel...`);

  let completed = 0;
  const settled = await Promise.allSettled(
    chunks.map((c, i) =>
      mapChunk(c, i, model, userPrompt).then((res) => {
        completed += 1;
        setProgressMessage(`Analyzed chunk ${completed} of ${total}...`);
        return res;
      })
    )
  );

  const successes = [];
  const failures = [];
  for (const r of settled) {
    if (r.status === 'fulfilled') successes.push(r.value);
    else failures.push(r.reason);
  }

  if (failures.length > 0) {
    console.warn(`analyzeArgumentStructureMapReduce: ${failures.length} of ${total} map-phase chunk(s) failed; proceeding with ${successes.length}.`, failures);
  }
  if (successes.length === 0) {
    throw failures[0] || new Error('All map-phase chunks failed.');
  }

  return await hierarchicalReduce(successes, model, userPrompt);
}
