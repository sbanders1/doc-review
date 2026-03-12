let annotations = $state([]);
let activeAnnotationId = $state(null);

export function getAnnotations() {
  return annotations;
}

export function getActiveAnnotationId() {
  return activeAnnotationId;
}

export function setActiveAnnotationId(id) {
  activeAnnotationId = id;
}

export function addAnnotation({ pageNumber, text, rects, comment, author = 'user', priority = null }) {
  const annotation = {
    id: crypto.randomUUID(),
    pageNumber,
    text,
    rects, // [{left, top, width, height}] relative to page dimensions
    comment,
    author,
    priority, // 'high', 'medium', 'low', or null
    timestamp: Date.now(),
    resolved: false,
    replies: [],
  };
  annotations = sortByPosition([...annotations, annotation]);
  activeAnnotationId = annotation.id;
  return annotation;
}

function sortByPosition(list) {
  return list.slice().sort((a, b) => {
    if (a.pageNumber !== b.pageNumber) return a.pageNumber - b.pageNumber;
    const aTop = a.rects.length > 0 ? a.rects[0].top : Infinity;
    const bTop = b.rects.length > 0 ? b.rects[0].top : Infinity;
    return aTop - bTop;
  });
}

export function updateAnnotationComment(id, comment) {
  annotations = annotations.map((a) =>
    a.id === id ? { ...a, comment } : a
  );
}

export function updateAnnotationPriority(id, priority) {
  annotations = annotations.map((a) =>
    a.id === id ? { ...a, priority } : a
  );
}

export function resolveAnnotation(id) {
  annotations = annotations.map((a) =>
    a.id === id ? { ...a, resolved: !a.resolved } : a
  );
}

export function deleteAnnotation(id) {
  annotations = annotations.filter((a) => a.id !== id);
  if (activeAnnotationId === id) {
    activeAnnotationId = null;
  }
}

export function clearAnnotations() {
  annotations = [];
  activeAnnotationId = null;
}

export function addReply(annotationId, { comment, author = 'user' }) {
  const reply = {
    id: crypto.randomUUID(),
    comment,
    author,
    timestamp: Date.now(),
    resolved: false,
  };
  annotations = annotations.map((a) =>
    a.id === annotationId ? { ...a, replies: [...a.replies, reply] } : a
  );
  return reply;
}

export function updateReplyComment(annotationId, replyId, comment) {
  annotations = annotations.map((a) =>
    a.id === annotationId
      ? { ...a, replies: a.replies.map((r) => (r.id === replyId ? { ...r, comment } : r)) }
      : a
  );
}

export function resolveReply(annotationId, replyId) {
  annotations = annotations.map((a) =>
    a.id === annotationId
      ? { ...a, replies: a.replies.map((r) => (r.id === replyId ? { ...r, resolved: !r.resolved } : r)) }
      : a
  );
}

export function deleteReply(annotationId, replyId) {
  annotations = annotations.map((a) =>
    a.id === annotationId
      ? { ...a, replies: a.replies.filter((r) => r.id !== replyId) }
      : a
  );
}
