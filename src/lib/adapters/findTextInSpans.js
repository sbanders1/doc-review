/**
 * Shared utility: find highlight rects for text within a container's .textLayer spans.
 * Works for any viewer that renders a .textLayer with <span> elements.
 */
export function findTextInSpans(pageWrapper, chunkText) {
  if (!chunkText || !pageWrapper) return null;
  const textLayer = pageWrapper.querySelector('.textLayer') || pageWrapper.querySelector('.text-layer');
  if (!textLayer) return null;

  const spans = Array.from(textLayer.querySelectorAll('span'));
  if (spans.length === 0) return null;

  const fullText = spans.map((s) => s.textContent).join('');
  const normalizedChunk = chunkText.replace(/\s+/g, ' ').trim();
  const normalizedFull = fullText.replace(/\s+/g, ' ');

  let idx = normalizedFull.indexOf(normalizedChunk);
  if (idx === -1) {
    idx = normalizedFull.toLowerCase().indexOf(normalizedChunk.toLowerCase());
  }
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
    let spanHasMatch = false;

    for (let i = 0; i < normalizedSpanText.length; i++) {
      if (normalizedCount === idx) inMatch = true;
      if (inMatch) spanHasMatch = true;
      if (normalizedCount === matchEnd) inMatch = false;
      normalizedCount++;
    }

    if (spanHasMatch) {
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
