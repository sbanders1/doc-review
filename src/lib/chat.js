import Anthropic from '@anthropic-ai/sdk';
import { getMockMode } from './mockMode.svelte.js';
import { mockSendMessage, mockSendSummary } from './mock.js';

const SYSTEM_PROMPT = `You are a helpful assistant analyzing the following document. Answer questions about its content concisely.`;

/**
 * Send a message to Claude and stream the response.
 * @param {Object} options
 * @param {string} options.apiKey
 * @param {string} options.model - Model ID to use
 * @param {Array} options.messages - Conversation history [{role, content}]
 * @param {string} options.documentText - Full document text (included in system prompt)
 * @param {(chunk: string) => void} options.onChunk - Called with each text chunk
 * @returns {Promise<string>} Full response text
 */
export async function sendMessage({ apiKey, model, messages, documentText, onChunk }) {
  if (getMockMode()) {
    // Detect summary requests and use the summary mock
    const lastMsg = messages?.[messages.length - 1];
    const isSummary = lastMsg?.content?.toLowerCase().includes('summary');
    if (isSummary) {
      return mockSendSummary({ model, onChunk });
    }
    return mockSendMessage({ model, onChunk });
  }

  const client = new Anthropic({
    apiKey,
    dangerouslyAllowBrowser: true,
  });

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

  return fullText;
}

export const AVAILABLE_MODELS = [
  { id: 'claude-opus-4-20250514', label: 'Opus 4' },
  { id: 'claude-sonnet-4-20250514', label: 'Sonnet 4' },
  { id: 'claude-haiku-4-20250506', label: 'Haiku 4' },
];

export const DEFAULT_MODEL = 'claude-opus-4-20250514';
