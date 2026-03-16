const MOCK_CHAT_RESPONSES = {
  'claude-opus-4-20250514':
    "This is a detailed mock response from Opus 4. The document appears to contain several interesting sections that warrant further analysis. I'd be happy to discuss any specific aspects in more detail.",
  'claude-sonnet-4-20250514':
    'This is a mock response from Sonnet 4. The document covers the key topics as expected.',
  'claude-haiku-4-20250506':
    'Mock response from Haiku 4. Document reviewed.',
};

const MOCK_SUMMARY_RESPONSES = {
  'claude-opus-4-20250514':
    'This document presents a comprehensive analysis spanning multiple topics. The author methodically addresses each point with supporting evidence and draws conclusions based on the presented data. Key themes include regulatory compliance, methodological rigor, and evidentiary standards. [Mock summary — Opus 4]',
  'claude-sonnet-4-20250514':
    'This document covers several key topics with supporting analysis. The main points are well-structured and the conclusions follow from the evidence presented. [Mock summary — Sonnet 4]',
  'claude-haiku-4-20250506':
    'Document summarized. Key points noted. [Mock summary — Haiku 4]',
};

const STOCK_COMMENTS = [
  'This claim lacks sufficient supporting evidence and could be challenged under cross-examination.',
  'The methodology described here may not meet Daubert reliability standards.',
  'This conclusion appears to contradict the data presented in earlier sections.',
  'The causal link asserted here is not adequately established.',
  'This statement relies on assumptions that are not explicitly justified.',
  'An opposing expert could challenge the statistical significance of these findings.',
];

const PRIORITIES = ['high', 'medium', 'low'];

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function pickRandom(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

/**
 * Mock version of sendMessage (chat). Simulates streaming word-by-word.
 */
export async function mockSendMessage({ model, onChunk }) {
  const text = MOCK_CHAT_RESPONSES[model] || MOCK_CHAT_RESPONSES['claude-sonnet-4-20250514'];
  const words = text.split(' ');
  let accumulated = '';

  for (let i = 0; i < words.length; i++) {
    accumulated += (i === 0 ? '' : ' ') + words[i];
    onChunk(accumulated);
    await delay(5);
  }

  return accumulated;
}

/**
 * Mock version of sendMessage for summary. Returns full text after a short delay.
 */
export async function mockSendSummary({ model, onChunk }) {
  await delay(50);
  const text = MOCK_SUMMARY_RESPONSES[model] || MOCK_SUMMARY_RESPONSES['claude-sonnet-4-20250514'];
  onChunk(text);
  return text;
}

/**
 * Mock version of reviewDocument. Returns fake observations using real chunk IDs.
 */
export async function mockReviewDocument(extractedText) {
  await delay(500);

  const chunks = extractedText?.chunks || [];
  if (chunks.length === 0) {
    return [];
  }

  // Pick 3-6 random groups of 1-3 adjacent chunks
  const numGroups = 3 + Math.floor(Math.random() * 4);
  const observations = [];

  for (let g = 0; g < numGroups; g++) {
    const groupSize = 1 + Math.floor(Math.random() * 3);
    const startIdx = Math.floor(Math.random() * Math.max(1, chunks.length - groupSize));
    const selectedChunks = chunks.slice(startIdx, startIdx + groupSize);
    const chunkIds = selectedChunks.map((c) => c.id);

    observations.push({
      chunk_ids: chunkIds,
      comment: pickRandom(STOCK_COMMENTS),
      priority: pickRandom(PRIORITIES),
    });
  }

  return observations;
}
