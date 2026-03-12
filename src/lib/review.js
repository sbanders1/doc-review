import * as pdfjsLib from 'pdfjs-dist';
import Anthropic from '@anthropic-ai/sdk';

/**
 * Extract text from a PDF as indexed chunks.
 * Each chunk gets a unique ID like "p1.3" (page 1, chunk 3).
 * Returns { chunks: [{id, pageNumber, text}], formatted: string }
 */
export async function extractTextFromPdf(data) {
  const doc = await pdfjsLib.getDocument({ data: data.slice() }).promise;
  const chunks = [];
  const lines = [];

  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p);
    const content = await page.getTextContent();

    // Group text items into sentences/chunks by splitting on sentence boundaries
    let currentText = '';
    const items = content.items.filter((item) => item.str);

    for (const item of items) {
      currentText += item.str;
    }

    // Split page text into sentences
    const sentences = currentText.split(/(?<=[.!?])\s+/).filter((s) => s.trim());

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

const REVIEW_PROMPT = `Please review the attached report and identify any internal inconsistencies in the document. Please keep observations clear and direct and about high level argument inconsistencies rather than deeply technical issues.

Each sentence in the document is labeled with an ID like [p1.3] (page 1, sentence 3). For each observation, reference the specific sentence IDs that are relevant. Use the "review" tool to submit your observations.`;

const REVIEW_TOOL = {
  name: 'review',
  description: 'Submit review observations about the document',
  input_schema: {
    type: 'object',
    properties: {
      observations: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            chunk_ids: {
              type: 'array',
              items: { type: 'string' },
              description: 'The sentence IDs being referenced, e.g. ["p1.3", "p2.7"]',
            },
            comment: {
              type: 'string',
              description: 'Your observation about the referenced text',
            },
          },
          required: ['chunk_ids', 'comment'],
        },
      },
    },
    required: ['observations'],
  },
};

export async function reviewDocument(extractedText, apiKey) {
  const client = new Anthropic({
    apiKey,
    dangerouslyAllowBrowser: true,
  });

  const response = await client.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 4096,
    tools: [REVIEW_TOOL],
    tool_choice: { type: 'tool', name: 'review' },
    messages: [
      {
        role: 'user',
        content: `${REVIEW_PROMPT}\n\n---\n\n${extractedText.formatted}`,
      },
    ],
  });

  const toolUse = response.content.find((block) => block.type === 'tool_use');
  if (!toolUse) {
    throw new Error('No tool use block in response');
  }

  let observations = toolUse.input.observations;

  if (typeof observations === 'string') {
    observations = JSON.parse(observations);
  }

  if (!Array.isArray(observations)) {
    throw new Error(`Unexpected observations type: ${typeof observations}`);
  }

  return observations.filter((obs) => {
    if (!Array.isArray(obs.chunk_ids) || typeof obs.comment !== 'string') {
      console.warn('Skipping malformed observation:', obs);
      return false;
    }
    return true;
  });
}

/**
 * Find the rects for a chunk's text within the PDF's text layer.
 * Searches for the chunk text in the specified page's text layer spans.
 */
export function findChunkInPage(pageWrapper, chunkText) {
  if (!chunkText || !pageWrapper) return null;
  const textLayer = pageWrapper.querySelector('.textLayer');
  if (!textLayer) return null;

  const spans = Array.from(textLayer.querySelectorAll('span'));
  if (spans.length === 0) return null;

  const fullText = spans.map((s) => s.textContent).join('');
  const normalizedChunk = chunkText.replace(/\s+/g, ' ').trim();
  const normalizedFull = fullText.replace(/\s+/g, ' ');

  // Try exact match first, then case-insensitive
  let idx = normalizedFull.indexOf(normalizedChunk);
  if (idx === -1) {
    idx = normalizedFull.toLowerCase().indexOf(normalizedChunk.toLowerCase());
  }
  // Try with first 60 chars if full match fails (sentence boundary differences)
  if (idx === -1 && normalizedChunk.length > 60) {
    const prefix = normalizedChunk.slice(0, 60);
    idx = normalizedFull.toLowerCase().indexOf(prefix.toLowerCase());
  }
  if (idx === -1) return null;

  const matchLen = Math.min(normalizedChunk.length, normalizedFull.length - idx);
  const matchEnd = idx + matchLen;

  const pageRect = pageWrapper.getBoundingClientRect();
  const rects = [];
  let normalizedCount = 0;
  let inMatch = false;

  for (const span of spans) {
    const normalizedSpanText = span.textContent.replace(/\s+/g, ' ');

    for (let i = 0; i < normalizedSpanText.length; i++) {
      if (normalizedCount === idx) inMatch = true;
      if (normalizedCount === matchEnd) inMatch = false;
      normalizedCount++;
    }

    if (inMatch || (normalizedCount > idx && normalizedCount <= matchEnd)) {
      const spanRect = span.getBoundingClientRect();
      rects.push({
        left: spanRect.left - pageRect.left,
        top: spanRect.top - pageRect.top,
        width: spanRect.width,
        height: spanRect.height,
      });
    }
  }

  if (rects.length === 0) return null;
  return mergeRects(rects);
}

function mergeRects(rects) {
  const lines = [];
  for (const rect of rects) {
    const existingLine = lines.find((l) => Math.abs(l[0].top - rect.top) < 3);
    if (existingLine) {
      existingLine.push(rect);
    } else {
      lines.push([rect]);
    }
  }

  return lines.map((lineRects) => {
    const left = Math.min(...lineRects.map((r) => r.left));
    const top = Math.min(...lineRects.map((r) => r.top));
    const right = Math.max(...lineRects.map((r) => r.left + r.width));
    const bottom = Math.max(...lineRects.map((r) => r.top + r.height));
    return { left, top, width: right - left, height: bottom - top };
  });
}
