import { getAllSessionsMeta } from './db.js';

let sessions = $state([]);
let activeSessionId = $state(null);

export function getSessions() {
  return sessions;
}

export function getActiveSessionId() {
  return activeSessionId;
}

export function setActiveSessionId(id) {
  activeSessionId = id;
}

export async function loadSessionList() {
  sessions = await getAllSessionsMeta();
}

export function addSessionToList(meta) {
  sessions = [meta, ...sessions];
}

export function removeSessionFromList(id) {
  sessions = sessions.filter(s => s.id !== id);
  if (activeSessionId === id) {
    activeSessionId = null;
  }
}

export function updateSessionMeta(id, partial) {
  sessions = sessions.map(s =>
    s.id === id ? { ...s, ...partial } : s
  );
}
