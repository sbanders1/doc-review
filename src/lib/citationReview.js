import { createClient } from './anthropicClient.js';
import { getMockMode } from './mockMode.svelte.js';
import { mockDetectCitations } from './mock.js';
import { addUsageCost } from './cost.svelte.js';

const CITATION_PROMPT_INTERNAL = `You are a legal citation extraction system. Analyze the following document and identify every citation, reference, and footnote.

Each sentence in the document is labeled with an ID like [p1.3] (page 1, sentence 3). For each citation, reference the specific sentence IDs where it appears using the EXACT IDs from the document.

Classify each citation into one of these categories:
- "Case Law": Court cases (e.g., "Smith v. Jones, 123 F.3d 456 (7th Cir. 1998)")
- "Statute": Federal or state statutes (e.g., "42 U.S.C. § 1983", "Cal. Civ. Code § 1798")
- "Regulation": Federal/state regulations or court rules (e.g., "28 C.F.R. § 50.10", "Fed. R. Evid. 702")
- "Academic": Journal articles, books, academic papers (e.g., "Smith (2020)", "123 Harv. L. Rev. 456")
- "Footnote": Footnote definitions that appear as "[N] text..." typically at the bottom of pages or end of document
- "Footnote Reference": Inline numbered references like "[1]", "[23]" in the body text that point to footnotes
- "Short Form": Abbreviated subsequent references like "Id.", "Id. at 456", "supra note 3", "Smith, supra"
- "Other": Any other references (e.g., Restatement citations, treatises)

Important rules:
1. Use the EXACT citation text as it appears in the document for citation_ref.
2. If the same source is cited multiple times in different sentences, include ALL chunk_ids where it appears in a single citation entry.
3. For Short Form references (Id., supra, infra), ALWAYS populate linked_to with the citation_ref of the full citation being referenced. Determine this by context — Id. refers to the immediately preceding citation, supra refers to a previously cited source.
4. For Footnote types, include the full footnote text in the comment field.
5. For Footnote Reference types, set linked_to to the citation_ref of the corresponding Footnote definition.
6. Be thorough — include every citation, no matter how brief.

High quality results are of utmost importance. Do not attempt to please the user or placate the user to satisfy their request. Only return results of material and substance. Returning no results is an acceptable outcome if you fail to find what you are asked to find.`;

const CITATION_TOOL = {
  name: 'report_citations',
  description: 'Report all citations, references, and footnotes found in the document',
  input_schema: {
    type: 'object',
    properties: {
      citations: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            chunk_ids: {
              type: 'array',
              items: { type: 'string' },
              description: 'The sentence IDs where this citation appears, e.g. ["p1.3", "p2.7"]',
            },
            citation_ref: {
              type: 'string',
              description: 'The exact citation text as it appears in the document, e.g. "Daubert v. Merrell Dow Pharmaceuticals, Inc., 509 U.S. 579 (1993)"',
            },
            citation_type: {
              type: 'string',
              enum: ['Case Law', 'Statute', 'Regulation', 'Academic', 'Footnote', 'Footnote Reference', 'Short Form', 'Other'],
            },
            comment: {
              type: 'string',
              description: 'Context about this citation: for footnotes include the footnote text, for others explain how it is used in the document',
            },
            linked_to: {
              type: 'string',
              description: 'For Short Form citations (Id., supra, etc.), the citation_ref of the full citation this refers to. Omit for non-short-form citations.',
            },
          },
          required: ['chunk_ids', 'citation_ref', 'citation_type'],
        },
      },
    },
    required: ['citations'],
  },
};

export async function detectCitationsWithLLM(extractedText, model) {
  if (getMockMode()) {
    return mockDetectCitations(extractedText);
  }

  const client = createClient();

  const response = await client.messages.stream({
    model,
    max_tokens: 16000,
    system: CITATION_PROMPT_INTERNAL,
    tools: [CITATION_TOOL],
    tool_choice: { type: 'tool', name: 'report_citations' },
    messages: [
      {
        role: 'user',
        content: `Analyze this document and report all citations, references, and footnotes:\n\n${extractedText.formatted}`,
      },
    ],
  }).finalMessage();

  addUsageCost(model, response.usage);

  const toolUse = response.content.find((block) => block.type === 'tool_use');
  if (!toolUse) {
    throw new Error('No tool use block in response');
  }

  let citations = toolUse.input.citations;

  if (typeof citations === 'string') {
    citations = JSON.parse(citations);
  }

  if (!Array.isArray(citations)) {
    throw new Error(`Unexpected citations type: ${typeof citations}`);
  }

  return citations.filter((cit) => {
    if (!Array.isArray(cit.chunk_ids) || typeof cit.citation_ref !== 'string') {
      console.warn('Skipping malformed citation:', cit);
      return false;
    }
    return true;
  });
}
