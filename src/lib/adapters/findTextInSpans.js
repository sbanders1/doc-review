/**
 * Shared utility: find highlight rects for text within a container's .textLayer spans.
 * Works for any viewer that renders a .textLayer with <span> elements.
 *
 * @param {HTMLElement} pageWrapper - The page container element
 * @param {string} chunkText - The text to search for
 * @param {object} [options] - Optional settings
 * @param {boolean} [options.firstMatchOnly=false] - If true, only return rects for the first
 *   occurrence of the text found in the text layer. Useful for citation detection where
 *   the same text may appear in both the body and footnotes of a page.
 */
export function findTextInSpans(pageWrapper, chunkText, options = {}) {
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

  for (const span of spans) {
    const rawText = span.textContent;
    const normalizedSpanText = rawText.replace(/\s+/g, ' ');
    const spanStart = normalizedCount;
    const spanEnd = spanStart + normalizedSpanText.length;

    // Check if this span overlaps with the match range [idx, matchEnd)
    if (spanEnd > idx && spanStart < matchEnd) {
      // Character offsets within the normalized span text
      const localStart = Math.max(0, idx - spanStart);
      const localEnd = Math.min(normalizedSpanText.length, matchEnd - spanStart);

      // Map normalized offsets back to raw text offsets, accounting for
      // whitespace normalization (multiple whitespace chars collapsed to one)
      let normalizedIdx = 0;
      let rawStart = 0;
      let rawEnd = rawText.length;
      let foundStart = false;

      for (let rawIdx = 0; rawIdx < rawText.length; rawIdx++) {
        if (normalizedIdx === localStart && !foundStart) {
          rawStart = rawIdx;
          foundStart = true;
        }
        if (normalizedIdx === localEnd) {
          rawEnd = rawIdx;
          break;
        }
        // Advance normalized index: collapse whitespace runs to single space
        if (/\s/.test(rawText[rawIdx])) {
          normalizedIdx++;
          while (rawIdx + 1 < rawText.length && /\s/.test(rawText[rawIdx + 1])) {
            rawIdx++;
          }
        } else {
          normalizedIdx++;
        }
      }

      // Use a Range to measure just the matching substring within the text node
      const textNode = span.firstChild;
      if (textNode && textNode.nodeType === Node.TEXT_NODE) {
        try {
          const range = document.createRange();
          range.setStart(textNode, rawStart);
          range.setEnd(textNode, rawEnd);
          const rangeRects = range.getClientRects();
          for (const r of rangeRects) {
            rects.push({
              left: r.left - pageRect.left,
              top: r.top - pageRect.top,
              width: r.width,
              height: r.height,
            });
          }
        } catch {
          // Fallback to full span rect if Range fails
          const spanRect = span.getBoundingClientRect();
          rects.push({
            left: spanRect.left - pageRect.left,
            top: spanRect.top - pageRect.top,
            width: spanRect.width,
            height: spanRect.height,
          });
        }
      } else {
        // No text node (shouldn't happen), fall back to full span rect
        const spanRect = span.getBoundingClientRect();
        rects.push({
          left: spanRect.left - pageRect.left,
          top: spanRect.top - pageRect.top,
          width: spanRect.width,
          height: spanRect.height,
        });
      }
    }

    normalizedCount = spanEnd;
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
