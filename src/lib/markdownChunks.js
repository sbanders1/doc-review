import { marked } from 'marked';
import { splitSentences } from './adapters/splitSentences.js';

async function sha1Hex(text) {
  const data = new TextEncoder().encode(String(text).normalize('NFC').trim());
  const buf = await crypto.subtle.digest('SHA-1', data);
  const arr = new Uint8Array(buf);
  let hex = '';
  for (let i = 0; i < arr.length; i++) hex += arr[i].toString(16).padStart(2, '0');
  return hex;
}

const HTML_ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (ch) => HTML_ESC[ch]);
}

function chunkSentences(text) {
  if (!text || !text.trim()) return [];
  const sentences = splitSentences(text).filter((s) => s && s.trim());
  return sentences.length === 0 ? [text.trim()] : sentences;
}

class Builder {
  constructor() {
    this.chunks = [];
    this.html = '';
    this.section = 0;
    this.sentence = 0;
    this.formattedLines = [];
  }

  startSection() {
    this.section++;
    this.sentence = 0;
  }

  emit(text, type) {
    const trimmed = text.trim();
    if (!trimmed) return -1;
    this.sentence++;
    const idx = this.chunks.length;
    const displayId = `s${this.section}.${this.sentence}`;
    this.chunks.push({
      text: trimmed,
      type,
      sectionIndex: this.section,
      sentenceIndex: this.sentence,
      displayId,
    });
    this.formattedLines.push(`[${displayId}] ${trimmed.replace(/\s+/g, ' ')}`);
    return idx;
  }

  inlineSpan(sentenceMd, type) {
    const idx = this.emit(sentenceMd, type);
    if (idx < 0) return '';
    let inner;
    try {
      inner = marked.parseInline(sentenceMd);
    } catch {
      inner = escapeHtml(sentenceMd);
    }
    return `<span data-chunk-id="__UUID_${idx}__">${inner}</span>`;
  }

  renderBlocks(tokens) {
    for (const t of tokens || []) this.renderBlock(t);
  }

  renderBlock(token) {
    switch (token.type) {
      case 'heading': {
        if (token.depth <= 2) this.startSection();
        const parts = chunkSentences(token.text || '').map((s) => this.inlineSpan(s, `heading-${token.depth}`));
        this.html += `<h${token.depth}>${parts.join(' ')}</h${token.depth}>\n`;
        break;
      }
      case 'paragraph': {
        const parts = chunkSentences(token.text || '').map((s) => this.inlineSpan(s, 'paragraph'));
        this.html += `<p>${parts.join(' ')}</p>\n`;
        break;
      }
      case 'list': {
        const tag = token.ordered ? 'ol' : 'ul';
        const startAttr = token.ordered && token.start && token.start !== 1 ? ` start="${token.start}"` : '';
        this.html += `<${tag}${startAttr}>\n`;
        for (const item of token.items || []) this.renderListItem(item);
        this.html += `</${tag}>\n`;
        break;
      }
      case 'blockquote':
        this.html += `<blockquote>\n`;
        this.renderBlocks(token.tokens);
        this.html += `</blockquote>\n`;
        break;
      case 'code': {
        const idx = this.emit(token.text || '', 'code');
        const attr = idx >= 0 ? ` data-chunk-id="__UUID_${idx}__"` : '';
        this.html += `<pre><code${attr}>${escapeHtml(token.text || '')}</code></pre>\n`;
        break;
      }
      case 'hr':
        this.html += '<hr>\n';
        break;
      case 'html':
        this.html += token.raw || token.text || '';
        break;
      case 'space':
        break;
      case 'table': {
        this.html += '<table>\n<thead><tr>';
        for (const cell of token.header || []) this.html += `<th>${marked.parseInline(cell.text || '')}</th>`;
        this.html += '</tr></thead>\n<tbody>\n';
        for (const row of token.rows || []) {
          this.html += '<tr>';
          for (const cell of row) this.html += `<td>${marked.parseInline(cell.text || '')}</td>`;
          this.html += '</tr>\n';
        }
        this.html += '</tbody></table>\n';
        break;
      }
      default:
        if (token.raw) this.html += escapeHtml(token.raw);
    }
  }

  renderListItem(item) {
    this.html += '<li>';
    const tokens = item.tokens || [];
    for (const child of tokens) {
      if (child.type === 'text') {
        const parts = chunkSentences(child.text || '').map((s) => this.inlineSpan(s, 'list-item'));
        this.html += parts.join(' ');
      } else {
        this.renderBlock(child);
      }
    }
    this.html += '</li>\n';
  }
}

export async function chunkMarkdown(source, prevMap) {
  const src = source ?? '';
  const tokens = marked.lexer(src);
  const builder = new Builder();
  builder.renderBlocks(tokens);

  for (const c of builder.chunks) {
    c.contentHash = await sha1Hex(c.text);
  }

  const prev = prevMap instanceof Map ? prevMap : new Map();
  const hashToPrevUuid = new Map();
  for (const [uuid, meta] of prev.entries()) {
    if (meta && meta.contentHash && !hashToPrevUuid.has(meta.contentHash)) {
      hashToPrevUuid.set(meta.contentHash, uuid);
    }
  }

  const usedUuids = new Set();
  for (const c of builder.chunks) {
    const candidate = hashToPrevUuid.get(c.contentHash);
    if (candidate && !usedUuids.has(candidate)) {
      c.uuid = candidate;
      usedUuids.add(candidate);
    } else {
      c.uuid = (typeof crypto !== 'undefined' && crypto.randomUUID)
        ? crypto.randomUUID()
        : `u-${Math.random().toString(16).slice(2)}-${Date.now().toString(16)}`;
    }
  }

  const html = builder.html.replace(/__UUID_(\d+)__/g, (_, i) => builder.chunks[+i].uuid);

  const displayIdsByUuid = new Map();
  const newChunkMap = new Map();
  for (const c of builder.chunks) {
    displayIdsByUuid.set(c.uuid, c.displayId);
    newChunkMap.set(c.uuid, {
      contentHash: c.contentHash,
      displayId: c.displayId,
      text: c.text,
      type: c.type,
      sectionIndex: c.sectionIndex,
      sentenceIndex: c.sentenceIndex,
    });
  }

  const tombstones = [];
  for (const [uuid, meta] of prev.entries()) {
    if (!usedUuids.has(uuid)) tombstones.push({ uuid, ...meta });
  }

  const adapterChunks = builder.chunks.map((c) => ({
    id: c.displayId,
    pageNumber: 1,
    text: c.text,
    uuid: c.uuid,
    type: c.type,
    sectionIndex: c.sectionIndex,
    sentenceIndex: c.sentenceIndex,
  }));

  const formatted = ['[Page 1]', ...builder.formattedLines, ''].join('\n');

  return {
    chunks: adapterChunks,
    chunkMap: newChunkMap,
    displayIdsByUuid,
    formatted,
    tombstones,
    html,
  };
}
