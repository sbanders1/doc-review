import { pdfAdapter } from './pdf.js';
import { textAdapter } from './text.js';
import { docxAdapter } from './docx.js';

const adapters = new Map();

function registerAdapter(adapter) {
  adapters.set(adapter.type, adapter);
}

// Register built-in adapters
registerAdapter(pdfAdapter);
registerAdapter(textAdapter);
registerAdapter(docxAdapter);

export function getAdapter(fileType) {
  return adapters.get(fileType) || null;
}

export function getAdapterForFile(fileName) {
  const ext = '.' + fileName.split('.').pop().toLowerCase();
  for (const adapter of adapters.values()) {
    if (adapter.extensions.includes(ext)) return adapter;
  }
  return null;
}
