function uuid() {
  if (crypto.randomUUID) return crypto.randomUUID();
  return '10000000-1000-4000-8000-100000000000'.replace(/[018]/g, c =>
    (+c ^ crypto.getRandomValues(new Uint8Array(1))[0] & 15 >> +c / 4).toString(16)
  );
}

let citations = $state([]);
let activeCitationId = $state(null);

export function getCitations() {
  return citations;
}

export function getActiveCitationId() {
  return activeCitationId;
}

export function setActiveCitationId(id) {
  activeCitationId = id;
}

/**
 * @param {Object} opts
 * @param {number} opts.pageNumber
 * @param {string} opts.text - The cited text as it appears in the document
 * @param {Array} opts.rects - Normalized rects [{left, top, width, height}]
 * @param {string} opts.citationRef - Normalized citation reference
 * @param {string} opts.category - 'case_law' | 'statute' | 'regulation' | 'secondary' | 'other'
 * @param {string} [opts.source='pattern'] - 'ai' | 'pattern' | 'manual'
 * @param {string} [opts.comment='']
 * @param {string} [opts.author='system']
 */
export function addCitation({ pageNumber, text, rects, citationRef, category, source = 'pattern', comment = '', author = 'system' }) {
  const citation = {
    id: uuid(),
    pageNumber,
    text,
    rects,
    citationRef,
    category,
    source,
    verified: false,
    comment,
    author,
    timestamp: Date.now(),
    resolved: false,
    replies: [],
  };
  citations = sortByPosition([...citations, citation]);
  return citation;
}

function sortByPosition(list) {
  return list.slice().sort((a, b) => {
    if (a.pageNumber !== b.pageNumber) return a.pageNumber - b.pageNumber;
    const aTop = a.rects.length > 0 ? a.rects[0].top : Infinity;
    const bTop = b.rects.length > 0 ? b.rects[0].top : Infinity;
    return aTop - bTop;
  });
}

export function updateCitationComment(id, comment) {
  citations = citations.map(c => c.id === id ? { ...c, comment } : c);
}

export function verifyCitation(id) {
  citations = citations.map(c => c.id === id ? { ...c, verified: !c.verified } : c);
}

export function resolveCitation(id) {
  citations = citations.map(c => c.id === id ? { ...c, resolved: !c.resolved } : c);
}

export function deleteCitation(id) {
  citations = citations.filter(c => c.id !== id);
  if (activeCitationId === id) {
    activeCitationId = null;
  }
}

export function clearCitations() {
  citations = [];
  activeCitationId = null;
}

export function addCitationReply(citationId, { comment, author = 'user' }) {
  const reply = {
    id: uuid(),
    comment,
    author,
    timestamp: Date.now(),
    resolved: false,
  };
  citations = citations.map(c =>
    c.id === citationId ? { ...c, replies: [...c.replies, reply] } : c
  );
  return reply;
}

export function deleteCitationReply(citationId, replyId) {
  citations = citations.map(c =>
    c.id === citationId
      ? { ...c, replies: c.replies.filter(r => r.id !== replyId) }
      : c
  );
}

export function getCitationsSnapshot() {
  return {
    citations: JSON.parse(JSON.stringify(citations)),
    activeCitationId,
  };
}

export function restoreCitationsSnapshot(snapshot) {
  if (!snapshot) {
    citations = [];
    activeCitationId = null;
    return;
  }
  citations = snapshot.citations || [];
  activeCitationId = snapshot.activeCitationId || null;
}
