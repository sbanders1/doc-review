import { createClient } from './anthropicClient.js';
import { getMockMode } from './mockMode.svelte.js';
import { mockReviewStyle } from './mock.js';
import { addUsageCost } from './cost.svelte.js';

export const DIMENSIONS = [
  { key: 'plain_english_to_technical', leftLabel: 'Plain English', rightLabel: 'Technical' },
  { key: 'hedged_to_assertive', leftLabel: 'Hedged', rightLabel: 'Assertive' },
  { key: 'concise_to_expansive', leftLabel: 'Concise', rightLabel: 'Expansive' },
  { key: 'advocate_to_neutral', leftLabel: 'Advocate-y', rightLabel: 'Neutral/Objective' },
  { key: 'active_to_passive', leftLabel: 'Active voice', rightLabel: 'Passive voice' },
  { key: 'signposted_to_sparse', leftLabel: 'Signposted', rightLabel: 'Sparse' },
];

const VALID_KEYS = new Set(DIMENSIONS.map((d) => d.key));

export const STYLE_PROMPT_USER = `Rate the document below on six stylistic dimensions, each on a scale from 1 to 10. A score of 1 means the document sits at the LEFT pole of the dimension; 10 means it sits at the RIGHT pole. The score is a description of the document's tendency, not a judgment about whether the prose is good or bad — both extremes can be appropriate or inappropriate depending on context.

The six dimensions:

1. plain_english_to_technical — 1 = Plain English (accessible lay-reader prose, e.g. "when prices rise, people buy less"); 10 = Technical (specialist register, e.g. "the derivative of quantity with respect to price is negative").

2. hedged_to_assertive — 1 = Hedged (heavy caveating: "may", "could", "appears to", multi-clause qualifications); 10 = Assertive (declarative, confident claims).

3. concise_to_expansive — 1 = Concise (tight prose, no redundancy); 10 = Expansive (repetition, elaboration, length growth where less would do).

4. advocate_to_neutral — 1 = Advocate-y (reads as making a case); 10 = Neutral/Objective (reads as describing findings). This is distinct from assertiveness — one can be assertive without being advocate-y.

5. active_to_passive — 1 = Active voice (most constructions are active); 10 = Passive voice (most constructions are passive). This is roughly the proportion of passive constructions in the prose.

6. signposted_to_sparse — 1 = Signposted (explicit roadmaps, "Having established X, we turn to Y", clear section transitions); 10 = Sparse (structure left implicit; reader has to find their own way).

For each dimension, provide a 1–2 sentence explanation that grounds the score in specific aspects of the document's prose (word choice, sentence structure, examples, transitions, etc.).`;

const STYLE_PROMPT_INTERNAL = `You are a stylistic analysis system. Use the rate_style tool to report exactly six ratings — one for each of the six dimensions defined by the user. Use the dimension keys verbatim:

- plain_english_to_technical
- hedged_to_assertive
- concise_to_expansive
- advocate_to_neutral
- active_to_passive
- signposted_to_sparse

Be concise. Do not hedge in the explanations. Reference concrete features of the prose (specific word choices, sentence patterns, structural moves) rather than generic descriptors. Score is an integer from 1 to 10 inclusive.

High quality results are of utmost importance. Do not attempt to please the user or placate the user to satisfy their request. Score honestly based on what the prose actually does.`;

export const STYLE_TOOL = {
  name: 'rate_style',
  description: 'Report the document\'s position on each of the six stylistic dimensions. Must include exactly six entries — one for each dimension key (plain_english_to_technical, hedged_to_assertive, concise_to_expansive, advocate_to_neutral, active_to_passive, signposted_to_sparse).',
  input_schema: {
    type: 'object',
    properties: {
      ratings: {
        type: 'array',
        description: 'Exactly six rating entries, one per dimension.',
        items: {
          type: 'object',
          properties: {
            dimension: {
              type: 'string',
              enum: [
                'plain_english_to_technical',
                'hedged_to_assertive',
                'concise_to_expansive',
                'advocate_to_neutral',
                'active_to_passive',
                'signposted_to_sparse',
              ],
            },
            score: {
              type: 'integer',
              minimum: 1,
              maximum: 10,
              description: 'Integer 1-10. 1 = left pole, 10 = right pole.',
            },
            explanation: {
              type: 'string',
              description: '1-2 sentences grounding the score in specific aspects of the prose.',
            },
          },
          required: ['dimension', 'score', 'explanation'],
        },
      },
    },
    required: ['ratings'],
  },
};

export async function reviewStyle(extractedText, model, userPrompt) {
  if (getMockMode()) {
    return mockReviewStyle(extractedText);
  }

  const client = createClient();
  const prompt = (userPrompt && userPrompt.trim()) || STYLE_PROMPT_USER;

  const response = await client.messages.stream({
    model,
    max_tokens: 4096,
    system: STYLE_PROMPT_INTERNAL,
    tools: [STYLE_TOOL],
    tool_choice: { type: 'tool', name: 'rate_style' },
    messages: [
      {
        role: 'user',
        content: `${prompt}\n\nDocument:\n\n${extractedText.formatted}`,
      },
    ],
  }).finalMessage();

  addUsageCost(model, response.usage);

  const toolUse = response.content.find((block) => block.type === 'tool_use');
  if (!toolUse) {
    throw new Error('No tool use block in response');
  }

  let ratings = toolUse.input.ratings;
  if (typeof ratings === 'string') {
    ratings = JSON.parse(ratings);
  }
  if (!Array.isArray(ratings)) {
    throw new Error(`Unexpected ratings type: ${typeof ratings}`);
  }

  return ratings
    .filter((r) => r && typeof r.dimension === 'string' && VALID_KEYS.has(r.dimension))
    .map((r) => {
      const score = Math.max(1, Math.min(10, Math.round(Number(r.score))));
      const explanation = typeof r.explanation === 'string' ? r.explanation : '';
      return { dimension: r.dimension, score, explanation };
    });
}
