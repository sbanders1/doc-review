/**
 * Citation detection patterns.
 * Each pattern has: regex, citationType label, and an optional refExtractor
 * to pull out the canonical citation reference from the match.
 */
const CITATION_PATTERNS = [
  {
    // Case Law: "Smith v. Jones, 123 F.3d 456" or "Brown v. Board of Education, 347 U.S. 483 (1954)"
    regex: /([\w.''\-]+(?:\s+[\w.''\-]+){0,5})\s+v\.?\s+([\w.''\-]+(?:\s+[\w.''\-]+){0,5}),?\s*\d+\s+[\w.]+\s+\d+(?:\s*\(\d{4}\))?/g,
    citationType: 'Case Law',
  },
  {
    // Statutes: "42 U.S.C. § 1983", "28 USC §1331", "15 U.S.C. §§ 1-7"
    regex: /\d+\s+U\.?S\.?C\.?A?\.?\s*§+\s*[\d\-]+(?:\([a-z]\))?/gi,
    citationType: 'Statute',
  },
  {
    // Federal Regulations: "28 C.F.R. § 50.10", "40 CFR § 122.21"
    regex: /\d+\s+C\.?F\.?R\.?\s*§+\s*\d+(?:\.\d+)?/gi,
    citationType: 'Regulation',
  },
  {
    // State statutes: "Cal. Civ. Code § 1798", "N.Y. Gen. Bus. Law § 349",
    // "Tex. Bus. & Com. Code § 17.46", "Cal. Penal Code § 502"
    // Allow intermediate words with or without trailing dots, plus "&"
    regex: /[A-Z][a-z]+\.(?:\s+(?:[A-Z][a-z]+\.?|&))*\s+(?:Code|Law|Act|Stat\.?)\s*§+\s*[\d.\-]+/g,
    citationType: 'Statute',
  },
  {
    // Federal Rules: "Fed. R. Civ. P. 12(b)(6)", "Fed. R. Evid. 702"
    regex: /Fed\.\s*R\.\s*(?:Civ|Crim|App|Evid)\.\s*P\.\s*\d+(?:\([a-z]\)(?:\(\d+\))?)?/g,
    citationType: 'Regulation',
  },
{
    // Academic: "Smith (2020)", "Johnson et al. (2019)", "Smith & Jones (2018)"
    regex: /[A-Z][a-z]+(?:\s+(?:et\s+al\.?|&\s+[A-Z][a-z]+))?\s*\(\d{4}\)/g,
    citationType: 'Academic',
  },
  {
    // Footnote definitions: "[4] Some explanation text..." at the start of a chunk
    regex: /^\[(\d+)\]\s+(.+)/g,
    citationType: 'Footnote',
    extractFootnote: true,
  },
  {
    // Numbered references: "[1]", "[23]", "[1, 2, 3]"
    regex: /\[(\d+(?:\s*,\s*\d+)*)\]/g,
    citationType: 'Footnote Reference',
  },
  {
    // Restatement references: "Restatement (Second) of Torts § 402A"
    regex: /Restatement\s*\([A-Za-z]+\)\s+of\s+[A-Za-z\s]+§\s*\d+\w?/g,
    citationType: 'Other',
  },
  {
    // Law reviews / journals: "123 Harv. L. Rev. 456"
    regex: /\d+\s+[A-Z][a-z]+\.?\s+L\.?\s*(?:Rev|J)\.?\s+\d+/g,
    citationType: 'Academic',
  },
];

/**
 * Normalize text for citation matching.  PDF text extraction sometimes
 * produces different Unicode representations:
 *  - Section sign: U+00A7 (§) vs other codepoints
 *  - Non-breaking spaces (U+00A0) vs regular spaces
 *  - Curly/smart quotes vs straight quotes
 *
 * Returns the normalized string.
 */
function normalizeCitationText(text) {
  return text
    .replace(/\u00a0/g, ' ')          // non-breaking space → regular space
    .replace(/[\u2009\u200a\u202f]/g, ' ')  // thin/hair/narrow no-break spaces
    .replace(/[\u2018\u2019\u201a]/g, "'")  // smart single quotes
    .replace(/[\u201c\u201d\u201e]/g, '"')  // smart double quotes
    .replace(/\u00b6/g, '§');          // pilcrow sometimes confused with section sign
}

/**
 * Detect citations in extracted text chunks.
 *
 * @param {Array<{id: string, pageNumber: number, text: string}>} chunks
 * @returns {Array<{citationType: string, citationRef: string, comment?: string, locations: Array<{chunkId: string, pageNumber: number, text: string, matchText: string}>}>}
 */
export function detectCitations(chunks) {
  // Pre-pass: build a map of chunk index by id for continuation lookups
  const chunkIndexById = new Map();
  for (let i = 0; i < chunks.length; i++) {
    chunkIndexById.set(chunks[i].id, i);
  }

  // First pass: collect raw detections
  const rawResults = [];
  const seen = new Set(); // deduplicate by chunkId + matchText
  const footnoteDefRegex = /^\[(\d+)\]\s+/;

  for (const chunk of chunks) {
    // Normalize text for matching but keep original for position references
    const normalizedText = normalizeCitationText(chunk.text);

    for (const pattern of CITATION_PATTERNS) {
      const regex = new RegExp(pattern.regex.source, pattern.regex.flags);
      let match;
      while ((match = regex.exec(normalizedText)) !== null) {
        // Use the corresponding substring from the original text for DOM matching
        let matchText = chunk.text.substring(match.index, match.index + match[0].length).trim();
        let citationRef = matchText;
        let comment = undefined;
        let isFootnoteDefinition = false;
        let continuationLocations = [];

        // For footnote definitions, highlight the full text of each chunk
        // that belongs to the footnote and store the definition text as
        // the comment.  Because chunks are split on sentence boundaries,
        // the footnote definition text may span multiple consecutive
        // chunks.  Gather continuation chunks (same page, sequential IDs,
        // not starting a new footnote definition) to capture the full
        // footnote text AND record them as additional highlight locations.
        if (pattern.extractFootnote) {
          citationRef = `[${match[1]}]`;
          // Highlight the entire first chunk (includes the [N] prefix)
          matchText = chunk.text.trim();
          const commentParts = [match[2]?.trim()].filter(Boolean);

          const chunkIdx = chunkIndexById.get(chunk.id);
          if (chunkIdx !== undefined) {
            for (let ci = chunkIdx + 1; ci < chunks.length; ci++) {
              const next = chunks[ci];
              if (next.pageNumber !== chunk.pageNumber) break;
              if (footnoteDefRegex.test(next.text)) break;
              commentParts.push(next.text.trim());
              continuationLocations.push({
                chunkId: next.id,
                pageNumber: next.pageNumber,
                text: next.text,
                matchText: next.text.trim(),
              });
            }
          }

          comment = commentParts.join(' ');
          isFootnoteDefinition = true;
        }

        const key = `${chunk.id}:${matchText}`;
        if (seen.has(key)) continue;
        seen.add(key);

        // Skip very short matches that are likely false positives
        if (matchText.length < 3) continue;

        rawResults.push({
          chunkId: chunk.id,
          pageNumber: chunk.pageNumber,
          text: chunk.text,
          matchText,
          citationType: pattern.citationType,
          citationRef,
          isFootnoteDefinition,
          ...(comment !== undefined && { comment }),
          ...(continuationLocations.length > 0 && { continuationLocations }),
        });
      }
    }
  }

  // Second pass: merge footnote references and definitions by number
  // Group footnote-related results by their ref (e.g., "[4]")
  const footnoteDefinitions = new Map(); // citationRef -> raw result
  const footnoteReferences = new Map();  // citationRef -> [raw results]
  const nonFootnoteResults = [];

  for (const result of rawResults) {
    if (result.citationType === 'Footnote' && result.isFootnoteDefinition) {
      // This is a definition like "[4] Some text..."
      footnoteDefinitions.set(result.citationRef, result);
    } else if (result.citationType === 'Footnote Reference') {
      // This is an inline reference like "[4]"
      if (!footnoteReferences.has(result.citationRef)) {
        footnoteReferences.set(result.citationRef, []);
      }
      footnoteReferences.get(result.citationRef).push(result);
    } else {
      nonFootnoteResults.push(result);
    }
  }

  // Build merged results
  const results = [];

  // Merge footnotes: combine references and definitions with the same number
  const allFootnoteRefs = new Set([...footnoteDefinitions.keys(), ...footnoteReferences.keys()]);
  for (const ref of allFootnoteRefs) {
    const definition = footnoteDefinitions.get(ref);
    const references = footnoteReferences.get(ref) || [];

    const locations = [];

    // Add inline reference locations first
    for (const r of references) {
      locations.push({
        chunkId: r.chunkId,
        pageNumber: r.pageNumber,
        text: r.text,
        matchText: r.matchText,
      });
    }

    // Add definition location (first chunk) and any continuation chunks
    if (definition) {
      locations.push({
        chunkId: definition.chunkId,
        pageNumber: definition.pageNumber,
        text: definition.text,
        matchText: definition.matchText,
      });
      if (definition.continuationLocations) {
        locations.push(...definition.continuationLocations);
      }
    }

    if (locations.length === 0) continue;

    results.push({
      citationType: 'Footnote',
      citationRef: ref,
      ...(definition?.comment && { comment: definition.comment }),
      locations,
    });
  }

  // Add non-footnote results with locations array format
  for (const result of nonFootnoteResults) {
    results.push({
      citationType: result.citationType,
      citationRef: result.citationRef,
      ...(result.comment && { comment: result.comment }),
      locations: [
        {
          chunkId: result.chunkId,
          pageNumber: result.pageNumber,
          text: result.text,
          matchText: result.matchText,
        },
      ],
    });
  }

  return results;
}
