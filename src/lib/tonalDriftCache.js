const DB_NAME = 'doc-review-tonal-drift';
const DB_VERSION = 1;
const STORE_NAME = 'chunk_scores';

let dbPromise = null;

export function openCacheDB() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    try {
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = (e) => {
        const db = e.target.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME, { keyPath: 'hash' });
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

export async function getCachedScore(hash, model, scoringVersion) {
  if (!hash) return null;
  try {
    const db = await openCacheDB();
    return await new Promise((resolve) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const req = tx.objectStore(STORE_NAME).get(hash);
      req.onsuccess = (e) => {
        const v = e.target.result;
        if (!v) return resolve(null);
        if (model && v.model && v.model !== model) return resolve(null);
        if (scoringVersion != null && v.scoringVersion !== scoringVersion) return resolve(null);
        resolve(v);
      };
      req.onerror = () => resolve(null);
    });
  } catch (err) {
    console.warn('tonalDriftCache.getCachedScore failed; treating as miss.', err);
    return null;
  }
}

export async function putCachedScore(hash, model, scoringVersion, payload) {
  if (!hash) return;
  try {
    const db = await openCacheDB();
    await new Promise((resolve) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const entry = {
        hash,
        model,
        scoringVersion,
        topic_label: payload?.topic_label || '',
        is_citation_only: payload?.is_citation_only === true,
        scores: payload?.scores || {},
        createdAt: Date.now(),
      };
      const req = tx.objectStore(STORE_NAME).put(entry);
      req.onsuccess = () => resolve();
      req.onerror = () => resolve();
    });
  } catch (err) {
    console.warn('tonalDriftCache.putCachedScore failed; ignoring.', err);
  }
}

export async function clearCache() {
  try {
    const db = await openCacheDB();
    await new Promise((resolve) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const req = tx.objectStore(STORE_NAME).clear();
      req.onsuccess = () => resolve();
      req.onerror = () => resolve();
    });
  } catch (err) {
    console.warn('tonalDriftCache.clearCache failed; ignoring.', err);
  }
}
