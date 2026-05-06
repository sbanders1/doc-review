import { createClient } from './anthropicClient.js';
import { getMockMode } from './mockMode.svelte.js';
import { mockGenerateDepositionQuestions } from './mock.js';
import { addUsageCost } from './cost.svelte.js';

export const CATEGORIES = ['concession', 'scope', 'self_contradiction'];

const VALID_CATEGORIES = new Set(CATEGORIES);

export const DEPOSITION_PROMPT_USER = `You are reasoning about how opposing counsel will depose the expert who authored the report below. Generate a list of deposition questions to drill the expert on — the questions opposing counsel is most likely to actually ask.

Opposing counsel's job at deposition is to corner the witness, not to find the strongest counter-argument on the merits. Each question should read as a question designed to extract a damaging admission. Phrase questions the way opposing counsel would actually ask them — short, pointed, leading where appropriate.

Cover three categories:

1. concession — Questions that try to elicit a concession the expert would not freely volunteer: an admission about a limitation in the methodology, a qualification on the conclusion, an acknowledgment of an assumption the expert is making, a fact that cuts against the expert's framing.

2. scope — Questions that push the expert past the scope of what their report actually supports: asking the expert to opine on something adjacent that they did not analyze, drawing the expert into a broader claim the report does not establish, asking what the expert would conclude under a different fact pattern.

3. self_contradiction — Questions that surface internal tension in the report itself: a claim in one section that sits awkwardly with a claim in another, a methodology applied inconsistently, a conclusion that is stronger or weaker than the supporting analysis warrants given what the report says elsewhere.

Quality over quantity. Aim for around 20–30 well-targeted questions, not an exhaustive list. Bias toward fewer, sharper. Returning a tight list of high-signal questions is far better than padding to hit a number. If the report is short or narrow, fewer questions is the right answer.

Each free-text field is one direct sentence (two only if necessary). No hedging, no padding, no recap of what the document says. Get to the point.`;

const DEPOSITION_PROMPT_INTERNAL = `Output via the generate_deposition_questions tool. Do not produce any text outside the tool call.

For every question, supply:
- question: phrased exactly as opposing counsel would ask it at deposition. Short, pointed, leading where natural.
- category: one of "concession" | "scope" | "self_contradiction". Pick the most direct fit; do not invent categories.
- extracts: one direct sentence describing the concession, overreach, or contradiction the question is engineered to extract.
- danger: one direct sentence on what this costs the case if the expert gives ground.
- defensible_answer: one direct sentence describing what a good response from the expert sounds like — the answer that holds the line without overreaching.
- bad_answer: one direct sentence describing the trap response the expert must avoid.
- bad_answer_reasoning: one short clause or sentence on why that answer is bad — what it concedes or how it boxes the expert in.
- chunk_ids: array of sentence IDs from the document this question targets, e.g. ["p3.5", "p3.6"]. Required field; may be an empty array for purely scope-pushing questions that do not target any specific passage. Do not invent ids that are not in the document.

Constraints:
- Every free-text field is one direct sentence (two only if the second adds something the first did not). No hedging ("may", "appears to"), no recap of the document, no padding, no framing.
- Do not duplicate questions that target the same admission with different wording. Pick the sharpest version.
- Do not pad to hit a number. A tight list of high-signal questions is the goal.`;

export const DEPOSITION_TOOL = {
  name: 'generate_deposition_questions',
  description: 'Emit a prioritized list of deposition questions opposing counsel is likely to ask the expert who authored the report.',
  input_schema: {
    type: 'object',
    properties: {
      questions: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            question: {
              type: 'string',
              description: 'The question phrased as opposing counsel would ask it.',
            },
            category: {
              type: 'string',
              enum: CATEGORIES,
              description: 'concession | scope | self_contradiction.',
            },
            extracts: {
              type: 'string',
              description: 'What concession, overreach, or contradiction the question is trying to extract. One direct sentence.',
            },
            danger: {
              type: 'string',
              description: 'What it costs the case if elicited. One direct sentence.',
            },
            defensible_answer: {
              type: 'string',
              description: 'What a good response from the expert sounds like. One direct sentence.',
            },
            bad_answer: {
              type: 'string',
              description: 'The trap response to avoid. One direct sentence.',
            },
            bad_answer_reasoning: {
              type: 'string',
              description: 'Why the bad answer is bad. Short clause or single sentence.',
            },
            chunk_ids: {
              type: 'array',
              items: { type: 'string' },
              description: 'Sentence IDs from the document the question targets. May be empty for scope-pushing questions.',
            },
          },
          required: [
            'question',
            'category',
            'extracts',
            'danger',
            'defensible_answer',
            'bad_answer',
            'bad_answer_reasoning',
            'chunk_ids',
          ],
        },
      },
    },
    required: ['questions'],
  },
};

function asString(v) {
  return typeof v === 'string' ? v : '';
}

function asStringArray(v) {
  if (!Array.isArray(v)) return [];
  return v.filter((x) => typeof x === 'string' && x.length > 0);
}

export async function generateDepositionQuestions(extractedText, model, userPrompt) {
  if (getMockMode()) {
    return mockGenerateDepositionQuestions(extractedText);
  }

  const client = createClient();
  const userPart = (userPrompt && userPrompt.trim()) || DEPOSITION_PROMPT_USER;
  const fullPrompt = `${userPart}\n\n${DEPOSITION_PROMPT_INTERNAL}\n\nDocument:\n\n${extractedText.formatted}`;

  const response = await client.messages.stream({
    model,
    max_tokens: 32000,
    tools: [DEPOSITION_TOOL],
    tool_choice: { type: 'tool', name: 'generate_deposition_questions' },
    messages: [{ role: 'user', content: fullPrompt }],
  }).finalMessage();

  addUsageCost(model, response.usage);

  const toolUse = response.content.find((block) => block.type === 'tool_use');
  if (!toolUse) {
    throw new Error(`No tool_use block in response (stop_reason=${response.stop_reason})`);
  }

  let raw = toolUse.input?.questions;
  if (typeof raw === 'string') raw = JSON.parse(raw);
  if (!Array.isArray(raw)) {
    const inputKeys = toolUse.input && typeof toolUse.input === 'object'
      ? Object.keys(toolUse.input).join(', ') || '(empty)'
      : '(no input)';
    throw new Error(
      `Unexpected questions type: ${typeof raw} ` +
      `(stop_reason=${response.stop_reason}, input keys=${inputKeys}). ` +
      (response.stop_reason === 'max_tokens'
        ? 'Hit max_tokens before finishing the tool call — output was truncated.'
        : 'Model returned a malformed tool call.')
    );
  }

  const out = [];
  for (const q of raw) {
    if (!q || typeof q !== 'object') continue;
    const question = asString(q.question).trim();
    if (!question) continue;
    if (typeof q.category !== 'string' || !VALID_CATEGORIES.has(q.category)) continue;
    out.push({
      question,
      category: q.category,
      extracts: asString(q.extracts),
      danger: asString(q.danger),
      defensible_answer: asString(q.defensible_answer),
      bad_answer: asString(q.bad_answer),
      bad_answer_reasoning: asString(q.bad_answer_reasoning),
      chunk_ids: asStringArray(q.chunk_ids),
    });
  }
  return out;
}
