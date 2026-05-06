import { createClient } from './anthropicClient.js';
import { getMockMode } from './mockMode.svelte.js';
import { mockSendMessage, mockSendSummary } from './mock.js';
import { addUsageCost } from './cost.svelte.js';

const SYSTEM_PROMPT = `You are a helpful assistant analyzing the following document. Answer questions about its content concisely.

High quality results are of utmost importance. Do not attempt to please the user or placate the user to satisfy their request. Only return results of material and substance. Returning no results is an acceptable outcome if you fail to find what you are asked to find.`;

/**
 * Send a message to Claude and stream the response.
 * @param {Object} options
 * @param {string} options.model - Model ID to use
 * @param {Array} options.messages - Conversation history [{role, content}]
 * @param {string} options.documentText - Full document text (included in system prompt)
 * @param {(chunk: string) => void} options.onChunk - Called with each text chunk
 * @returns {Promise<string>} Full response text
 */
export async function sendMessage({ model, messages, documentText, onChunk }) {
  if (getMockMode()) {
    // Detect summary requests and use the summary mock
    const lastMsg = messages?.[messages.length - 1];
    const isSummary = lastMsg?.content?.toLowerCase().includes('summary');
    if (isSummary) {
      return mockSendSummary({ model, onChunk });
    }
    return mockSendMessage({ model, onChunk });
  }

  const client = createClient();

  const systemPrompt = documentText
    ? `${SYSTEM_PROMPT}\n\n---\n\nDocument contents:\n\n${documentText}`
    : SYSTEM_PROMPT;

  const stream = await client.messages.stream({
    model,
    max_tokens: 4096,
    system: systemPrompt,
    messages,
  });

  let fullText = '';
  for await (const event of stream) {
    if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
      fullText += event.delta.text;
      onChunk(fullText);
    }
  }

  try {
    const finalMessage = await stream.finalMessage();
    addUsageCost(model, finalMessage?.usage);
  } catch (err) {
    console.warn('[chat] failed to record usage cost:', err);
  }

  return fullText;
}

export const AVAILABLE_MODELS = [
  { id: 'claude-opus-4-7', label: 'Opus 4.7 (latest)' },
  { id: 'claude-sonnet-4-6', label: 'Sonnet 4.6 (latest)' },
];

export const DEFAULT_MODEL = 'claude-opus-4-7';

// Map obsolete dated model IDs to their bare-alias replacement. Sessions
// saved before the Vertex-proxy migration may have these persisted in
// IndexedDB; rewrite on load so the dropdown stays in sync and requests
// don't 404.
const MODEL_MIGRATIONS = {
  'claude-opus-4-1-20250805': 'claude-opus-4-7',
  'claude-opus-4-20250514': 'claude-opus-4-7',
  'claude-sonnet-4-20250514': 'claude-sonnet-4-6',
  'claude-haiku-4-5-20251001': 'claude-opus-4-7',
};

const VALID_MODEL_IDS = new Set(AVAILABLE_MODELS.map((m) => m.id));

export function migrateModelId(id) {
  if (!id) return DEFAULT_MODEL;
  if (VALID_MODEL_IDS.has(id)) return id;
  return MODEL_MIGRATIONS[id] || DEFAULT_MODEL;
}
