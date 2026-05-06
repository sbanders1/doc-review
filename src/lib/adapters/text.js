import { findTextInSpans } from './findTextInSpans.js';
import { splitSentences } from './splitSentences.js';

async function extract(data) {
  const text = data instanceof Uint8Array ? new TextDecoder().decode(data) : data;
  const chunks = [];
  const paragraphs = text.split(/\n\s*\n/).filter((p) => p.trim());

  const p = 1;
  let sentenceIndex = 0;
  const lines = [`[Page ${p}]`];

  for (let pi = 0; pi < paragraphs.length; pi++) {
    // Preserve paragraph boundaries in `formatted` via a blank line so
    // downstream consumers that split on \n\s*\n (e.g. tonal-drift chunking)
    // can still see the structure even after sentence-level labeling.
    if (pi > 0) lines.push('');
    const paraLines = paragraphs[pi].split(/\n/).map((l) => l.trim()).filter(Boolean);
    for (const line of paraLines) {
      let sentences = splitSentences(line);
      if (sentences.length === 0) sentences = [line];

      for (const sentence of sentences) {
        sentenceIndex++;
        const id = `p${p}.${sentenceIndex}`;
        const cleaned = sentence.trim();
        chunks.push({ id, pageNumber: p, text: cleaned });
        lines.push(`[${id}] ${cleaned}`);
      }
    }
  }
  lines.push('');

  return { chunks, formatted: lines.join('\n') };
}

export const textAdapter = {
  type: 'text',
  extensions: ['.txt', '.text'],
  extract,
  findChunkRects: findTextInSpans,
};
