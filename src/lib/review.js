import Anthropic from '@anthropic-ai/sdk';

const DAUBERT_CORPUS = typeof __DAUBERT_CORPUS__ !== 'undefined' ? __DAUBERT_CORPUS__ : '';

export const REVIEW_PROMPT_USER = `Please review the attached report as if you were opposing counsel preparing to depose the expert who authored or supported this document. Identify internal inconsistencies, unsupported claims, logical gaps, and any statements that could be challenged under cross-examination or in a Daubert motion. Consider whether the expert's methodology, data sources, assumptions, and conclusions would withstand scrutiny under the Daubert standard (reliability, relevance, fit). Please keep observations clear and direct and focused on high-level argument weaknesses rather than deeply technical issues.`;

const REVIEW_PROMPT_INTERNAL = `Each sentence in the document is labeled with an ID like [p1.3] (page 1, sentence 3). For each observation, reference the specific sentence IDs that are relevant. Classify each observation as "high", "medium", or "low" priority based on the severity of the issue and its potential impact in a deposition, cross-examination, or Daubert challenge. Use the "review" tool to submit your observations.`;

const REVIEW_TOOL = {
  name: 'review',
  description: 'Submit review observations about the document',
  input_schema: {
    type: 'object',
    properties: {
      observations: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            chunk_ids: {
              type: 'array',
              items: { type: 'string' },
              description: 'The sentence IDs being referenced, e.g. ["p1.3", "p2.7"]',
            },
            comment: {
              type: 'string',
              description: 'Your observation about the referenced text',
            },
            priority: {
              type: 'string',
              enum: ['high', 'medium', 'low'],
              description: 'Priority/risk level: high = critical vulnerability likely to be exploited in deposition, medium = notable weakness worth preparing for, low = minor issue or nitpick',
            },
          },
          required: ['chunk_ids', 'comment', 'priority'],
        },
      },
    },
    required: ['observations'],
  },
};

export async function reviewDocument(extractedText, apiKey, userPrompt) {
  const client = new Anthropic({
    apiKey,
    dangerouslyAllowBrowser: true,
  });

  const fullPrompt = `${userPrompt}\n\n${REVIEW_PROMPT_INTERNAL}`;

  let corpusSection = '';
  if (DAUBERT_CORPUS) {
    corpusSection = `\n\n---\n\nThe following reference materials describe common Daubert challenges to expert testimony, particularly economic and financial experts. Use these to identify specific vulnerabilities in the report that could be targeted in a Daubert motion or deposition:\n\n${DAUBERT_CORPUS}\n\n---\n\n`;
  }

  const response = await client.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 8192,
    tools: [REVIEW_TOOL],
    tool_choice: { type: 'tool', name: 'review' },
    messages: [
      {
        role: 'user',
        content: `${fullPrompt}${corpusSection}\n\nExpert report to review:\n\n${extractedText.formatted}`,
      },
    ],
  });

  const toolUse = response.content.find((block) => block.type === 'tool_use');
  if (!toolUse) {
    throw new Error('No tool use block in response');
  }

  let observations = toolUse.input.observations;

  if (typeof observations === 'string') {
    observations = JSON.parse(observations);
  }

  if (!Array.isArray(observations)) {
    throw new Error(`Unexpected observations type: ${typeof observations}`);
  }

  return observations.filter((obs) => {
    if (!Array.isArray(obs.chunk_ids) || typeof obs.comment !== 'string') {
      console.warn('Skipping malformed observation:', obs);
      return false;
    }
    return true;
  });
}
