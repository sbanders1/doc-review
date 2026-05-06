const DB_NAME = 'doc-review-citation-corpus';
const DB_VERSION = 1;
const STORE_NAME = 'corpus_files';
const SESSION_INDEX = 'bySession';

let dbPromise = null;

function uuid() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  return '10000000-1000-4000-8000-100000000000'.replace(/[018]/g, (c) =>
    (+c ^ (crypto.getRandomValues(new Uint8Array(1))[0] & (15 >> (+c / 4)))).toString(16),
  );
}

export function openCorpusDB() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    try {
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = (e) => {
        const db = e.target.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' });
          store.createIndex(SESSION_INDEX, 'sessionId', { unique: false });
        }
      };
      request.onsuccess = (e) => resolve(e.target.result);
      request.onerror = (e) => reject(e.target.error);
    } catch (err) {
      reject(err);
    }
  });
  return dbPromise;
}

async function hashContent(content) {
  try {
    let bytes;
    if (content instanceof Uint8Array) {
      bytes = content;
    } else if (typeof content === 'string') {
      bytes = new TextEncoder().encode(content);
    } else {
      bytes = new TextEncoder().encode(String(content || ''));
    }
    const buf = await crypto.subtle.digest('SHA-256', bytes);
    return Array.from(new Uint8Array(buf))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
  } catch (err) {
    console.warn('citationCorpus.hashContent failed; using empty hash.', err);
    return '';
  }
}

export async function listCorpusFiles(sessionId) {
  if (!sessionId) return [];
  try {
    const db = await openCorpusDB();
    return await new Promise((resolve) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const idx = tx.objectStore(STORE_NAME).index(SESSION_INDEX);
      const req = idx.getAll(sessionId);
      req.onsuccess = (e) => {
        const rows = (e.target.result || []).map((row) => ({
          id: row.id,
          sessionId: row.sessionId,
          name: row.name,
          fileType: row.fileType,
          extractedText: row.extractedText
            ? { formatted: row.extractedText.formatted || '', chunks: row.extractedText.chunks || [] }
            : null,
          hash: row.hash,
          size: row.size,
          createdAt: row.createdAt,
          truncated: !!row.truncated,
        }));
        resolve(rows);
      };
      req.onerror = () => resolve([]);
    });
  } catch (err) {
    console.warn('citationCorpus.listCorpusFiles failed; returning empty list.', err);
    return [];
  }
}

export async function getCorpusFile(id) {
  if (!id) return null;
  try {
    const db = await openCorpusDB();
    return await new Promise((resolve) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const req = tx.objectStore(STORE_NAME).get(id);
      req.onsuccess = (e) => resolve(e.target.result || null);
      req.onerror = () => resolve(null);
    });
  } catch (err) {
    console.warn('citationCorpus.getCorpusFile failed; returning null.', err);
    return null;
  }
}

export async function addCorpusFile(sessionId, { name, fileType, content, extractedText, size, truncated = false }) {
  if (!sessionId) return null;
  try {
    const hash = await hashContent(content);
    const entry = {
      id: uuid(),
      sessionId,
      name: name || 'Untitled',
      fileType: fileType || 'text',
      content: content ?? null,
      extractedText: extractedText
        ? { formatted: extractedText.formatted || '', chunks: extractedText.chunks || [] }
        : null,
      hash,
      size: typeof size === 'number' ? size : 0,
      truncated: !!truncated,
      createdAt: Date.now(),
    };
    const db = await openCorpusDB();
    await new Promise((resolve) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const req = tx.objectStore(STORE_NAME).put(entry);
      req.onsuccess = () => resolve();
      req.onerror = () => resolve();
    });
    return entry.id;
  } catch (err) {
    console.warn('citationCorpus.addCorpusFile failed; ignoring.', err);
    return null;
  }
}

export async function deleteCorpusFile(id) {
  if (!id) return;
  try {
    const db = await openCorpusDB();
    await new Promise((resolve) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const req = tx.objectStore(STORE_NAME).delete(id);
      req.onsuccess = () => resolve();
      req.onerror = () => resolve();
    });
  } catch (err) {
    console.warn('citationCorpus.deleteCorpusFile failed; ignoring.', err);
  }
}

export async function deleteCorpusForSession(sessionId) {
  if (!sessionId) return;
  try {
    const db = await openCorpusDB();
    await new Promise((resolve) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const idx = tx.objectStore(STORE_NAME).index(SESSION_INDEX);
      const req = idx.openCursor(IDBKeyRange.only(sessionId));
      req.onsuccess = (e) => {
        const cursor = e.target.result;
        if (cursor) {
          cursor.delete();
          cursor.continue();
        } else {
          resolve();
        }
      };
      req.onerror = () => resolve();
    });
  } catch (err) {
    console.warn('citationCorpus.deleteCorpusForSession failed; ignoring.', err);
  }
}
