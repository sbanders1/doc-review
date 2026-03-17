import * as pdfjsLib from 'pdfjs-dist';
import { findTextInSpans } from './findTextInSpans.js';
import { splitSentences } from './splitSentences.js';

if (!pdfjsLib.GlobalWorkerOptions.workerSrc) {
  pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
    'pdfjs-dist/build/pdf.worker.mjs',
    import.meta.url
  ).href;
}

async function extract(data) {
  const doc = await pdfjsLib.getDocument({ data: data.slice() }).promise;
  const chunks = [];
  const lines = [];

  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p);
    const content = await page.getTextContent();

    let currentText = '';
    const items = content.items.filter((item) => item.str);
    for (const item of items) {
      currentText += item.str;
    }

    const sentences = splitSentences(currentText);

    for (let i = 0; i < sentences.length; i++) {
      const id = `p${p}.${i + 1}`;
      chunks.push({ id, pageNumber: p, text: sentences[i].trim() });
    }

    lines.push(`[Page ${p}]`);
    const pageChunks = chunks.filter((c) => c.pageNumber === p);
    for (const chunk of pageChunks) {
      lines.push(`[${chunk.id}] ${chunk.text}`);
    }
    lines.push('');
  }

  return { chunks, formatted: lines.join('\n') };
}

export const pdfAdapter = {
  type: 'pdf',
  extensions: ['.pdf'],
  extract,
  findChunkRects: findTextInSpans,
};
