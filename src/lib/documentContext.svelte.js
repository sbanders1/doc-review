import { getAdapter } from './adapters/index.js';

// Shared reactive state for the extracted document text
let extractedText = $state(null); // { chunks: [{id, pageNumber, text}], formatted: string }

export function getExtractedText() {
  return extractedText;
}

export function getFormattedText() {
  return extractedText?.formatted ?? '';
}

export function getChunks() {
  return extractedText?.chunks ?? [];
}

export function clearExtractedText() {
  extractedText = null;
}

/**
 * Extract text using the appropriate adapter and store in shared context.
 * @param {Uint8Array|string} data - raw file content
 * @param {string} fileType - adapter type key ('pdf', 'text', etc.)
 * @returns {Promise<{chunks, formatted}>}
 */
export async function extractAndStore(data, fileType) {
  const adapter = getAdapter(fileType);
  if (!adapter) throw new Error(`No adapter for file type: ${fileType}`);
  extractedText = await adapter.extract(data);
  return extractedText;
}

export function getDocumentContextSnapshot() {
  if (!extractedText) return null;
  return JSON.parse(JSON.stringify(extractedText));
}

export function restoreDocumentContextSnapshot(snapshot) {
  extractedText = snapshot || null;
}
