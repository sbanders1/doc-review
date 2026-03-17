import { findTextInSpans } from './findTextInSpans.js';
import { splitSentences } from './splitSentences.js';

async function extract(data) {
  const text = data instanceof Uint8Array ? new TextDecoder().decode(data) : data;
  const chunks = [];
  const lines = [];

  const paragraphs = text.split(/\n\s*\n/).filter((p) => p.trim());

  const p = 1;
  let sentenceIndex = 0;

  for (const para of paragraphs) {
    let sentences = splitSentences(para);
    if (sentences.length === 0 && para.trim()) {
      sentences = [para.trim()];
    }

    for (const sentence of sentences) {
      sentenceIndex++;
      const id = `p${p}.${sentenceIndex}`;
      chunks.push({ id, pageNumber: p, text: sentence.trim() });
    }
  }

  lines.push(`[Page ${p}]`);
  for (const chunk of chunks) {
    lines.push(`[${chunk.id}] ${chunk.text}`);
  }
  lines.push('');

  return { chunks, formatted: lines.join('\n') };
}

export const textAdapter = {
  type: 'text',
  extensions: ['.txt', '.md', '.text'],
  extract,
  findChunkRects: findTextInSpans,
};
