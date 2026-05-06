import { findTextInSpans } from './findTextInSpans.js';
import { chunkMarkdown } from '../markdownChunks.js';

async function extract(data) {
  const text = data instanceof Uint8Array ? new TextDecoder().decode(data) : (data ?? '');
  const result = await chunkMarkdown(text, new Map());
  return {
    chunks: result.chunks,
    formatted: result.formatted,
    markdownSource: text,
    chunkMap: result.chunkMap,
    html: result.html,
    displayIdsByUuid: result.displayIdsByUuid,
  };
}

export const markdownAdapter = {
  type: 'markdown',
  extensions: ['.md', '.markdown'],
  extract,
  findChunkRects: findTextInSpans,
};
