import { getAdapter } from './adapters/index.js';
import { chunkMarkdown } from './markdownChunks.js';

let extractedText = $state(null);
let markdownSource = $state(null);
let chunkMap = $state(null);
let markdownHtml = $state('');
let displayIdsByUuid = $state(null);

export function getExtractedText() {
  return extractedText;
}

export function getFormattedText() {
  return extractedText?.formatted ?? '';
}

export function getChunks() {
  return extractedText?.chunks ?? [];
}

export function getMarkdownSource() {
  return markdownSource;
}

export function getMarkdownHtml() {
  return markdownHtml;
}

export function getChunkMap() {
  return chunkMap;
}

export function getChunkByUuid(uuid) {
  if (!chunkMap || !uuid) return null;
  return chunkMap.get(uuid) ?? null;
}

export function getChunkByDisplayId(displayId) {
  if (!chunkMap || !displayId) return null;
  for (const [uuid, meta] of chunkMap.entries()) {
    if (meta.displayId === displayId) return { uuid, ...meta };
  }
  return null;
}

export function clearExtractedText() {
  extractedText = null;
  markdownSource = null;
  chunkMap = null;
  markdownHtml = '';
  displayIdsByUuid = null;
}

export async function setMarkdownSource(source) {
  const src = source ?? '';
  const result = await chunkMarkdown(src, chunkMap || new Map());
  markdownSource = src;
  chunkMap = result.chunkMap;
  markdownHtml = result.html;
  displayIdsByUuid = result.displayIdsByUuid;
  extractedText = { chunks: result.chunks, formatted: result.formatted };
  return result;
}

export async function extractAndStore(data, fileType) {
  const adapter = getAdapter(fileType);
  if (!adapter) throw new Error(`No adapter for file type: ${fileType}`);
  const result = await adapter.extract(data);
  if (fileType === 'markdown') {
    markdownSource = result.markdownSource ?? null;
    chunkMap = result.chunkMap ?? null;
    markdownHtml = result.html ?? '';
    displayIdsByUuid = result.displayIdsByUuid ?? null;
    extractedText = { chunks: result.chunks, formatted: result.formatted };
  } else {
    markdownSource = null;
    chunkMap = null;
    markdownHtml = '';
    displayIdsByUuid = null;
    extractedText = result;
  }
  return extractedText;
}

export function getDocumentContextSnapshot() {
  if (!extractedText) return null;
  if (markdownSource != null) {
    return {
      __format: 'v2',
      extractedText: JSON.parse(JSON.stringify(extractedText)),
      markdownSource,
    };
  }
  return JSON.parse(JSON.stringify(extractedText));
}

export function restoreDocumentContextSnapshot(snapshot) {
  if (!snapshot) {
    extractedText = null;
    markdownSource = null;
    chunkMap = null;
    markdownHtml = '';
    displayIdsByUuid = null;
    return;
  }
  if (snapshot.__format === 'v2') {
    extractedText = snapshot.extractedText || null;
    if (snapshot.markdownSource != null) {
      // Re-chunk asynchronously to rebuild chunkMap and html.
      // Consumers can read markdownSource immediately; chunkMap/html populate after the await.
      markdownSource = snapshot.markdownSource;
      chunkMap = null;
      markdownHtml = '';
      displayIdsByUuid = null;
      setMarkdownSource(snapshot.markdownSource);
    } else {
      markdownSource = null;
      chunkMap = null;
      markdownHtml = '';
      displayIdsByUuid = null;
    }
    return;
  }
  extractedText = snapshot;
  markdownSource = null;
  chunkMap = null;
  markdownHtml = '';
  displayIdsByUuid = null;
}
