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
 * @param {string} opts.citationType - 'Case Law' | 'Statute' | 'Regulation' | 'Academic' | 'Short Form' | 'Other'
 * @param {string} [opts.citationStatus='unresolved'] - 'unresolved' | 'verified' | 'resolved'
 * @param {string} [opts.source='pattern'] - 'ai' | 'pattern' | 'manual'
 * @param {string} [opts.comment='']
 * @param {string} [opts.author='system']
 * @param {string|null} [opts.linkedTo=null] - For Short Form citations, the citation_ref of the full citation this refers to
 */
export function addCitation({ pageNumber, text, rects, citationRef, citationType, citationStatus = 'unresolved', source = 'pattern', comment = '', author = 'system', linkedTo = null }) {
  const citation = {
    id: uuid(),
    pageNumber,
    text,
    rects,
    citationRef,
    citationType,
    citationStatus,
    source,
    comment,
    author,
    linkedTo,
    timestamp: Date.now(),
    replies: [],
    scoutStatus: null,
    scoutSummary: '',
    scoutSourceUrl: null,
    scoutSourceSnippet: '',
    scoutSourceName: '',
  };
  citations = sortByPosition([...citations, citation]);
  return citation;
}

/**
 * Add multiple citations at once (avoids triggering reactive updates per-item).
 */
export function addCitationsBatch(citationList) {
  const newCitations = citationList.map(opts => ({
    id: uuid(),
    pageNumber: opts.pageNumber,
    text: opts.text,
    rects: opts.rects,
    citationRef: opts.citationRef,
    citationType: opts.citationType,
    citationStatus: opts.citationStatus || 'unresolved',
    source: opts.source || 'pattern',
    comment: opts.comment || '',
    author: opts.author || 'system',
    linkedTo: opts.linkedTo || null,
    timestamp: Date.now(),
    replies: [],
    scoutStatus: null,
    scoutSummary: '',
    scoutSourceUrl: null,
    scoutSourceSnippet: '',
    scoutSourceName: '',
  }));
  citations = sortByPosition([...citations, ...newCitations]);
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

export function setCitationStatus(id, status) {
  citations = citations.map(c => c.id === id ? { ...c, citationStatus: status } : c);
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
  };
  citations = citations.map(c =>
    c.id === citationId ? { ...c, replies: [...c.replies, reply] } : c
  );
  return reply;
}

export function updateCitationScout(id, { scoutStatus, scoutSummary, scoutSourceUrl, scoutSourceSnippet, scoutSourceName }) {
  citations = citations.map(c => c.id === id ? {
    ...c,
    scoutStatus,
    scoutSummary: scoutSummary || '',
    scoutSourceUrl: scoutSourceUrl || null,
    scoutSourceSnippet: scoutSourceSnippet || '',
    scoutSourceName: scoutSourceName || '',
  } : c);
}

export function setCitationScouting(id) {
  citations = citations.map(c => c.id === id ? { ...c, scoutStatus: 'scouting' } : c);
}

export function restoreCitation(citationData) {
  citations = sortByPosition([...citations, citationData]);
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
