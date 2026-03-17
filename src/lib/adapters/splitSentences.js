/**
 * Smart sentence splitter that avoids breaking on common legal abbreviations.
 *
 * The naive regex /(?<=[.!?])\s+/ splits after ANY period followed by
 * whitespace, which breaks citations like "18 U.S.C. § 2510" or
 * "Cal. Penal Code § 502" across chunks.  This function uses a replacement
 * strategy: known abbreviation patterns are temporarily shielded, the split
 * is performed, then the shields are restored.
 *
 * @param {string} text - The input text to split into sentences
 * @returns {string[]} Array of sentence strings (empty entries filtered out)
 */
export function splitSentences(text) {
  if (!text || !text.trim()) return [];

  // Placeholder that won't appear in real text
  const DOT_PH = '\x00DOT\x00';
  const SPACE_PH = '\x00SP\x00';

  let shielded = text;

  // Shield common legal / citation abbreviations where a period should NOT
  // be treated as a sentence boundary.  Order matters — more specific
  // patterns first.

  // U.S.C., U.S.C.A., C.F.R., U.S., F.2d, F.3d, S.Ct., L.Ed., etc.
  // General pattern: uppercase letter(s) followed by dots (initialism)
  shielded = shielded.replace(
    /\b([A-Z]\.(?:[A-Za-z]\.)+[A-Za-z]?\.?)/g,
    (m) => m.replace(/\./g, DOT_PH)
  );

  // Single-letter abbreviations like "P." in "Fed. R. Civ. P. 12"
  shielded = shielded.replace(
    /\b([A-Z])\.\s/g,
    (m, letter) => letter + DOT_PH + SPACE_PH
  );

  // Common abbreviated words in legal citations (2-4 lowercase letters + dot)
  // e.g., "Cal.", "Civ.", "Crim.", "App.", "Evid.", "Gen.", "Bus.", "Com.",
  //        "Stat.", "Penal." (if it appeared), "Rev.", "Fed.", "Supp.", etc.
  // Must be preceded by a space or start-of-string, followed by a space.
  shielded = shielded.replace(
    /(?<=\s|^)([A-Z][a-z]{1,5})\.\s/g,
    (m, word) => word + DOT_PH + SPACE_PH
  );

  // "et al." and "et seq." — always abbreviations
  shielded = shielded.replace(/\bet al\./g, 'et al' + DOT_PH);
  shielded = shielded.replace(/\bet seq\./g, 'et seq' + DOT_PH);

  // "No." as in case numbers
  shielded = shielded.replace(/\bNo\.\s/g, 'No' + DOT_PH + SPACE_PH);

  // "v." in case names
  shielded = shielded.replace(/\bv\.\s/g, 'v' + DOT_PH + SPACE_PH);

  // Section symbol preceded by abbreviated word shouldn't split
  // e.g., "Code § " — already handled by the general abbreviated words rule above

  // Now split on actual sentence boundaries
  const parts = shielded.split(/(?<=[.!?])\s+/).filter((s) => s.trim());

  // Restore placeholders
  return parts.map((s) =>
    s
      .replace(new RegExp(DOT_PH, 'g'), '.')
      .replace(new RegExp(SPACE_PH, 'g'), ' ')
      .trim()
  );
}
