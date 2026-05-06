import { createClient } from './anthropicClient.js';
import { getMockMode } from './mockMode.svelte.js';
import { addUsageCost } from './cost.svelte.js';

const SCOUT_TOOL = {
  name: 'report_scout_result',
  description: 'Report the result of cross-referencing a citation against its original source',
  input_schema: {
    type: 'object',
    properties: {
      scout_status: {
        type: 'string',
        enum: ['supported', 'questionable', 'contradictory', 'not_found'],
        description: "Whether the document's use of the citation is supported by, questionable given, or contradictory to the original source",
      },
      summary: {
        type: 'string',
        description: 'Detailed explanation of the finding, including what the source actually says vs how the document uses it',
      },
      source_snippet: {
        type: 'string',
        description: 'The most relevant excerpt from the actual statute/source text that supports your assessment',
      },
      source_url: {
        type: 'string',
        description: 'URL where the statute can be found publicly (e.g., law.cornell.edu, uscode.house.gov)',
      },
      source_name: {
        type: 'string',
        description: 'Name of the authoritative source',
      },
    },
    required: ['scout_status', 'summary', 'source_snippet'],
  },
};

const SCOUT_SYSTEM_PROMPT = `You are a legal research assistant specializing in verifying citations. Your task is to cross-reference how a document uses a statutory citation against what the statute actually says.

You have extensive knowledge of US federal and state statutes. Analyze whether the document's characterization of the cited statute is accurate, incomplete, or misleading.

Consider:
1. Does the document accurately represent what the statute says?
2. Does the document omit important exceptions, qualifications, or context?
3. Is the statute being used to support a conclusion it doesn't actually support?
4. Are there subsequent amendments or interpretations that change the meaning?

Use the report_scout_result tool to provide your assessment.

Guidelines for scout_status:
- "supported": The document's use of the citation accurately reflects the statute
- "questionable": The document's use is partially accurate but omits material context or qualifications
- "contradictory": The document misrepresents or cherry-picks from the statute
- "not_found": You cannot determine the actual content of the cited statute with confidence

Always provide the actual text of the relevant statutory provision in source_snippet.
Provide a public URL where the statute can be found (prefer law.cornell.edu for federal, official state legislature sites for state statutes).

High quality results are of utmost importance. Do not attempt to please the user or placate the user to satisfy their request. Only return results of material and substance. Returning no results is an acceptable outcome if you fail to find what you are asked to find.`;

/**
 * Scout a citation — cross-reference against its original public source.
 *
 * @param {Object} citation - The citation object from the store
 * @param {string} documentContext - The surrounding document text for context
 * @returns {Promise<Object>} Scout result
 */
export async function scoutCitation(citation, documentContext, model) {
  // Only certain citation types are supported for scouting
  if (!['Statute', 'Academic', 'Case Law', 'Regulation'].includes(citation.citationType)) {
    return {
      scoutStatus: 'unsupported',
      summary: `Scouting is only available for Statute citations. This citation is of type "${citation.citationType}".`,
      sourceUrl: null,
      sourceSnippet: null,
      sourceName: null,
    };
  }

  // Check mock mode
  if (getMockMode()) {
    return mockScoutCitation(citation);
  }

  const client = createClient();

  const userMessage = `Please analyze how this document uses the following citation and determine if the usage is accurate.

CITATION: ${citation.citationRef}

DOCUMENT CONTEXT (how the citation is used):
${documentContext}

${citation.comment ? `ADDITIONAL CONTEXT: ${citation.comment}` : ''}

Cross-reference this against the actual statute text and assess whether the document's characterization is supported, questionable, or contradictory.`;

  const response = await client.messages.stream({
    model,
    max_tokens: 4000,
    system: SCOUT_SYSTEM_PROMPT,
    messages: [{ role: 'user', content: userMessage }],
    tools: [SCOUT_TOOL],
    tool_choice: { type: 'tool', name: 'report_scout_result' },
  }).finalMessage();

  addUsageCost(model, response.usage);

  const toolUse = response.content.find((block) => block.type === 'tool_use');
  if (!toolUse) {
    throw new Error('No scout result returned');
  }

  const result = toolUse.input;
  return {
    scoutStatus: result.scout_status,
    summary: result.summary,
    sourceUrl: result.source_url || null,
    sourceSnippet: result.source_snippet,
    sourceName: result.source_name || 'Public Source',
  };
}

/**
 * Mock version of scoutCitation. Returns fake data after a simulated delay.
 */
async function mockScoutCitation(citation) {
  // Only certain citation types are supported for scouting
  if (!['Statute', 'Academic', 'Case Law', 'Regulation'].includes(citation.citationType)) {
    return {
      scoutStatus: 'unsupported',
      summary: `Scouting is only available for Statute citations. This citation is of type "${citation.citationType}".`,
      sourceUrl: null,
      sourceSnippet: null,
      sourceName: null,
    };
  }

  // Simulate async delay (1-3 seconds random)
  await new Promise((resolve) => setTimeout(resolve, 1000 + Math.random() * 2000));

  // Mock responses that rotate through different outcomes
  const mockResponses = [
    {
      scoutStatus: 'supported',
      summary: `The document's reference to ${citation.citationRef} accurately reflects the statute's intent and scope. The cited provision is used in proper context and the characterization aligns with the statutory language.`,
      sourceUrl: `https://www.law.cornell.edu/uscode/text/${encodeURIComponent(citation.citationRef)}`,
      sourceSnippet: `${citation.citationRef} provides that: "No person shall, except as authorized by law, intentionally intercept, endeavor to intercept, or procure any other person to intercept or endeavor to intercept, any wire, oral, or electronic communication." This provision establishes the general prohibition that the document correctly references.`,
      sourceName: 'Cornell Law Institute',
    },
    {
      scoutStatus: 'questionable',
      summary: `The document's use of ${citation.citationRef} may be incomplete. While the cited provision does address the topic referenced, the document omits key exceptions and qualifications that could materially affect the analysis. The statute contains carve-outs that may undermine the document's argument.`,
      sourceUrl: `https://www.law.cornell.edu/uscode/text/${encodeURIComponent(citation.citationRef)}`,
      sourceSnippet: `${citation.citationRef} states the general rule as cited, HOWEVER, subsection (d) provides significant exceptions: "It shall not be unlawful under this chapter for a person acting under color of law to intercept a wire, oral, or electronic communication, where such person is a party to the communication or one of the parties to the communication has given prior consent." The document does not address these exceptions.`,
      sourceName: 'Cornell Law Institute',
    },
    {
      scoutStatus: 'contradictory',
      summary: `The document's characterization of ${citation.citationRef} appears to misrepresent the statute's scope. The cited provision, when read in full context, supports a conclusion opposite to what the document suggests. Key qualifying language was omitted that changes the meaning substantially.`,
      sourceUrl: `https://www.law.cornell.edu/uscode/text/${encodeURIComponent(citation.citationRef)}`,
      sourceSnippet: `While ${citation.citationRef} does contain the language quoted in the document, the immediately following subsection clarifies: "This section shall not apply to the use of pen registers or trap and trace devices." Furthermore, the legislative history indicates Congress intended this provision to be narrowly construed, contrary to the broad interpretation presented in the document.`,
      sourceName: 'Cornell Law Institute',
    },
  ];

  // Rotate through mock responses based on citation ID hash
  const hash = citation.id.split('').reduce((a, c) => a + c.charCodeAt(0), 0);
  return mockResponses[hash % mockResponses.length];
}
