import { createClient } from './anthropicClient.js';
import { getMockMode } from './mockMode.svelte.js';
import { mockCitationsReview } from './mock.js';
import { getExtractedText } from './documentContext.svelte.js';
import { getCorpusFile } from './citationCorpus.js';
import {
  suggestFileMatch,
  verifyMechanical,
  evaluateNarrowSupport,
  computeSeverity,
  MAX_CORPUS_CHARS,
} from './citationsReview.js';
import {
  getCorpusFiles,
  loadCorpusForSession,
  getMappingByCitationId,
  setMapping,
  setResultForCitation,
  setStatus,
  setError,
  setLastReviewedAt,
} from './citationsReview.svelte.js';

async function pMap(items, mapper, concurrency = 6) {
  const ret = new Array(items.length);
  let next = 0;
  async function worker() {
    while (true) {
      const i = next++;
      if (i >= items.length) return;
      ret[i] = await mapper(items[i], i);
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(concurrency, items.length) }, worker),
  );
  return ret;
}

function assembleReportPassage(citation, extractedText) {
  if (!citation || !extractedText || !Array.isArray(extractedText.chunks)) return '';
  const ids = Array.isArray(citation.chunk_ids) ? citation.chunk_ids
    : (Array.isArray(citation.chunkIds) ? citation.chunkIds : []);
  if (ids.length === 0) {
    // Fall back to the citation text itself if no chunk ids stored.
    return citation.text || citation.citationRef || '';
  }
  const chunkMap = new Map(extractedText.chunks.map((c) => [c.id, c]));
  const parts = [];
  for (const id of ids) {
    const chunk = chunkMap.get(id);
    if (chunk?.text) parts.push(chunk.text);
  }
  return parts.join(' ');
}

function getCitationChunkIds(citation) {
  if (!citation) return [];
  if (Array.isArray(citation.chunk_ids)) return citation.chunk_ids;
  if (Array.isArray(citation.chunkIds)) return citation.chunkIds;
  return [];
}

export async function runCitationsReview(citations, model, sessionId) {
  if (!Array.isArray(citations) || citations.length === 0) {
    setError('No citations to review.');
    return;
  }

  await loadCorpusForSession(sessionId);
  const corpusFiles = getCorpusFiles();

  if (getMockMode()) {
    setStatus('running');
    try {
      const mock = await mockCitationsReview(citations, corpusFiles);
      const mappings = mock.mappings || {};
      for (const [cid, fid] of Object.entries(mappings)) {
        setMapping(cid, fid);
      }
      const results = mock.results || {};
      for (const [cid, res] of Object.entries(results)) {
        setResultForCitation(cid, res);
      }
      setLastReviewedAt(Date.now());
      setStatus('ready');
    } catch (err) {
      console.error('Mock citations review failed:', err);
      setError(err?.message || 'Citations review failed.');
    }
    return;
  }

  if (corpusFiles.length === 0) {
    setError('No corpus files uploaded; nothing to review against.');
    return;
  }

  // Heuristic: auto-suggest mappings for citations without an explicit one.
  const currentMap = getMappingByCitationId();
  for (const cit of citations) {
    if (currentMap[cit.id] === undefined) {
      const guess = suggestFileMatch(cit.citationRef || cit.citation_ref || '', corpusFiles);
      setMapping(cit.id, guess || null);
    }
  }

  setStatus('running');
  setError(null);

  const extractedText = getExtractedText();
  const client = createClient();

  try {
    await pMap(
      citations,
      async (citation) => {
        try {
          const fileId = getMappingByCitationId()[citation.id] || null;
          let mappedFileMeta = null;
          let mappedFileFull = null;
          if (fileId) {
            mappedFileMeta = corpusFiles.find((f) => f.id === fileId) || null;
            mappedFileFull = await getCorpusFile(fileId);
          }

          const fileForQ1 = mappedFileFull || mappedFileMeta;
          const q1 = verifyMechanical(citation, fileForQ1);

          let q2 = null;
          if (q1.status !== 'unmapped' && q1.status !== 'missing_document') {
            const reportPassage = assembleReportPassage(citation, extractedText);
            const citedText = (mappedFileFull?.extractedText?.formatted || '').slice(0, MAX_CORPUS_CHARS);
            const citedName = mappedFileFull?.name || mappedFileMeta?.name || '';
            q2 = await evaluateNarrowSupport(client, model, {
              citationRef: citation.citationRef || citation.citation_ref || '',
              comment: citation.comment || '',
              reportPassage,
              citedText,
              citedName,
            });
          }

          const severity = computeSeverity({ q1, q2 });
          setResultForCitation(citation.id, {
            q1,
            q2,
            severity,
            evaluatedAt: Date.now(),
          });
        } catch (err) {
          console.error(`runCitationsReview: citation ${citation.id} failed`, err);
          setResultForCitation(citation.id, {
            q1: { status: 'unmapped', detail: 'Internal error during review.' },
            q2: null,
            severity: 'severe',
            evaluatedAt: Date.now(),
            error: err?.message || 'Review failed for this citation.',
          });
        }
      },
      6,
    );

    setLastReviewedAt(Date.now());
    setStatus('ready');
  } catch (err) {
    console.error('runCitationsReview failed:', err);
    setError(err?.message || 'Citations review failed.');
  }
}
