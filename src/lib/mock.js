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
/**
 * Mock version of detectCitationsWithLLM. Returns fake citations using real chunk IDs.
 */
export async function mockDetectCitations(extractedText) {
  await delay(500);

  const chunks = extractedText?.chunks || [];
  if (chunks.length === 0) {
    return [];
  }

  const pickChunkId = (offset = 0) => {
    const idx = Math.min(offset, chunks.length - 1);
    return chunks[idx].id;
  };

  const citations = [
    {
      chunk_ids: [pickChunkId(0), pickChunkId(3)],
      citation_ref: 'Daubert v. Merrell Dow Pharmaceuticals, Inc., 509 U.S. 579 (1993)',
      citation_type: 'Case Law',
      comment: 'Foundational case establishing the standard for admissibility of expert testimony under Federal Rules of Evidence.',
    },
    {
      chunk_ids: [pickChunkId(5)],
      citation_ref: 'Kumho Tire Co. v. Carmichael, 526 U.S. 137 (1999)',
      citation_type: 'Case Law',
      comment: 'Extended Daubert gatekeeping role to all expert testimony, not just scientific testimony.',
    },
    {
      chunk_ids: [pickChunkId(7)],
      citation_ref: 'Fed. R. Evid. 702',
      citation_type: 'Statute',
      comment: 'Federal Rule of Evidence governing the admissibility of expert testimony.',
    },
    {
      chunk_ids: [pickChunkId(9)],
      citation_ref: 'Id. at 589',
      citation_type: 'Short Form',
      comment: 'Short form reference to the immediately preceding citation.',
      linked_to: 'Daubert v. Merrell Dow Pharmaceuticals, Inc., 509 U.S. 579 (1993)',
    },
  ];

  return citations;
}

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

export async function mockReviewStyle(extractedText) {
  await delay(600);
  void extractedText;
  return [
    {
      dimension: 'plain_english_to_technical',
      score: 7,
      explanation: 'The prose leans on specialist terminology ("derivative", "marginal", "regression coefficient") with little lay-reader translation, sitting closer to the technical pole.',
    },
    {
      dimension: 'hedged_to_assertive',
      score: 4,
      explanation: 'Frequent uses of "appears to", "may suggest", and multi-clause qualifications soften most of the document\'s central claims, pulling it toward the hedged end.',
    },
    {
      dimension: 'concise_to_expansive',
      score: 8,
      explanation: 'Several paragraphs restate the same point with minor variation, and key conclusions are previewed, asserted, then summarized again across multiple sections.',
    },
    {
      dimension: 'advocate_to_neutral',
      score: 6,
      explanation: 'The framing language is mostly descriptive, but section openers and transitions occasionally telegraph the desired conclusion before evidence is presented.',
    },
    {
      dimension: 'active_to_passive',
      score: 7,
      explanation: 'Many causal sentences are framed in passive voice ("the result was obtained by", "data were analyzed"), giving the prose a noticeably passive cadence.',
    },
    {
      dimension: 'signposted_to_sparse',
      score: 3,
      explanation: 'Sections open with explicit roadmaps ("Having established X, we now turn to Y") and transitions are clearly labeled, holding the reader\'s hand throughout.',
    },
  ];
}

export async function mockAnalyzeArguments(extractedText) {
  await delay(600);

  const chunks = extractedText?.chunks || [];
  if (chunks.length === 0) {
    return {
      id: 'n1',
      parentId: null,
      type: 'argument',
      text: 'No document content available to analyze.',
      chunkIds: [],
      children: [],
    };
  }

  const pick = (offset = 0) => chunks[Math.min(offset, chunks.length - 1)].id;

  const node = (id, parent_id, type, text, chunkOffsets) => ({
    id,
    parent_id,
    type,
    text,
    chunk_ids: (chunkOffsets || []).map((o) => pick(o)),
  });

  const third = Math.floor(chunks.length / 3);
  const twoThirds = Math.floor((2 * chunks.length) / 3);
  const nodes = [
    node('n1', null, 'argument', 'The document advances a single overarching argument.', []),
    node('n2', 'n1', 'argument', 'The first supporting line of reasoning is established.', []),
    node('n3', 'n1', 'argument', 'The second supporting line of reasoning is established.', []),
    node('n4', 'n1', 'argument', 'The third supporting line of reasoning is established.', []),
    node('n5', 'n2', 'fact', 'A specific factual claim grounding the first line of reasoning.', [0, 1]),
    node('n6', 'n2', 'fact', 'A second factual claim grounding the first line of reasoning.', [2]),
    node('nt1', 'n1', 'transition', 'Transition into the second line of reasoning.', [Math.max(3, third - 1)]),
    node('n7', 'n3', 'fact', 'A factual claim grounding the second line of reasoning.', [third]),
    node('n8', 'n3', 'fact', 'A second factual claim grounding the second line of reasoning.', [third + 1]),
    node('n9', 'n4', 'argument', 'A nested supporting argument under the third line.', []),
    node('n10', 'n9', 'fact', 'A factual claim grounding the nested supporting argument.', [twoThirds]),
    node('n11', 'n9', 'fact', 'A second factual claim grounding the nested supporting argument.', [twoThirds + 1, twoThirds + 2]),
  ];

  const { buildTree } = await import('./arguments.js');
  return buildTree(nodes);
}

export async function mockGenerateDepositionQuestions(extractedText) {
  await delay(700);

  const chunks = extractedText?.chunks || [];
  const pick = (offset = 0) => {
    if (chunks.length === 0) return null;
    return chunks[Math.min(offset, chunks.length - 1)].id;
  };

  const ids = (offsets) => offsets.map(pick).filter(Boolean);

  return [
    {
      question: "Isn't it true that you didn't personally inspect the site, but instead relied entirely on photographs supplied by counsel?",
      category: 'concession',
      extracts: 'An admission that the expert never observed the conditions firsthand and depended on materials curated by retaining counsel.',
      danger: 'Undercuts the reliability of every site-specific conclusion in the report and frames the expert as a counsel-fed mouthpiece.',
      defensible_answer: 'Acknowledge the photographs were supplied, but explain why the photos are independently sufficient given the methodology.',
      bad_answer: '"Yes, I never visited the site."',
      bad_answer_reasoning: 'A bare yes concedes the framing without anchoring the answer in why the materials were nonetheless sufficient.',
      chunk_ids: ids([0, 1]),
    },
    {
      question: 'Would your conclusion change if the grass had been measured at twelve inches rather than fourteen?',
      category: 'scope',
      extracts: 'A commitment to a counterfactual the expert did not analyze, exposing how thin the basis for the threshold actually is.',
      danger: 'If the expert opines outside the analyzed fact pattern, every off-record conclusion becomes impeachable at trial.',
      defensible_answer: 'Decline to opine beyond the conditions analyzed in the report and explain why that scope was chosen.',
      bad_answer: '"Probably yes, the conclusion still holds at twelve inches."',
      bad_answer_reasoning: 'Improvises a finding outside the report and invites a challenge that the underlying threshold is arbitrary.',
      chunk_ids: ids([3]),
    },
    {
      question: 'Earlier in your report you described the standard as "industry custom," but later you call it a "regulatory requirement" — which is it?',
      category: 'self_contradiction',
      extracts: 'An admission that the expert is conflating two distinct legal categories that carry very different evidentiary weight.',
      danger: 'Forces the expert to either retreat from the regulatory framing or be impeached on the inconsistency at trial.',
      defensible_answer: 'Reconcile the two terms by explaining the relationship between custom and regulation in this domain, without retreating from either.',
      bad_answer: '"I used the terms interchangeably."',
      bad_answer_reasoning: 'Treats a legally consequential distinction as a wording choice and surrenders the regulatory framing entirely.',
      chunk_ids: ids([5, 7]),
    },
    {
      question: 'What peer-reviewed source supports the wear-rate figure you cite?',
      category: 'concession',
      extracts: 'An acknowledgment that the cited figure is unsourced or sourced only to grey literature.',
      danger: 'Removes the evidentiary anchor for a quantitative claim the report leans on heavily.',
      defensible_answer: 'Identify the underlying source and explain why the methodology is reliable in this field even if not strictly peer-reviewed.',
      bad_answer: '"I don\'t recall the specific source."',
      bad_answer_reasoning: 'Suggests the figure was adopted without verification and invites a Daubert challenge.',
      chunk_ids: ids([2]),
    },
    {
      question: 'Have you ever reached the opposite conclusion in a case where you were retained by the defense?',
      category: 'scope',
      extracts: 'Material for a bias attack — a prior inconsistent opinion in similar facts where the retaining party was different.',
      danger: 'Frames the expert as result-driven rather than methodology-driven, weakening the witness across all opinions.',
      defensible_answer: 'Acknowledge any prior cases truthfully and explain how the methodology produced different conclusions on different facts.',
      bad_answer: '"No, never."',
      bad_answer_reasoning: 'Categorical denials about prior testimony are easy to impeach with one contrary transcript.',
      chunk_ids: [],
    },
    {
      question: 'You assume the maintenance schedule was followed — what would your conclusion be if it wasn\'t?',
      category: 'self_contradiction',
      extracts: 'A concession that the conclusion rests on an assumption the expert did not independently verify.',
      danger: 'Reframes the central conclusion as conditional on a fact the defense will dispute.',
      defensible_answer: 'Explain why the assumption was reasonable on the record and decline to opine on a counterfactual not analyzed.',
      bad_answer: '"Then my conclusion might be different."',
      bad_answer_reasoning: 'Volunteers that the conclusion is fragile without forcing counsel to establish the contrary fact.',
      chunk_ids: ids([4, 6]),
    },
  ];
}

export async function mockTonalDrift(chunks) {
  await delay(600);

  const { computeVoiceConsistency } = await import('./tonalDrift.js');

  const list = Array.isArray(chunks) ? chunks : [];
  const topicPool = [
    'market definition',
    'regression methodology',
    'damages calculation',
    'industry background',
    'expert qualifications',
    'data sources and assumptions',
    'counterfactual analysis',
    'summary of conclusions',
  ];
  const snippetPool = [
    'the data may suggest a possible relationship',
    'the regression coefficient indicates',
    'we now turn to the empirical results',
    'the conclusion follows directly from the analysis',
    'when prices rise, demand falls',
    'the methodology is consistent with prior literature',
  ];

  const N = Math.max(1, list.length);
  const dimKeys = [
    'hedged_assertive',
    'plain_technical',
    'concise_expansive',
    'active_passive',
    'signposted_sparse',
  ];

  const chunkScores = {};
  for (let i = 0; i < N; i++) {
    const t = i / Math.max(1, N - 1);
    // smooth drift across the document; values land in 0–5 range.
    const wave = Math.sin(t * Math.PI);
    const base = {
      hedged_assertive: 1 + wave * 3,
      plain_technical: 2.5 + wave * 1,
      concise_expansive: 3.5 - wave * 1.5,
      active_passive: 2 + (1 - wave) * 1.5,
      signposted_sparse: 1.5 + wave * 2,
    };
    const scores = {};
    for (const k of dimKeys) {
      const score = Math.max(0, Math.min(5, Math.round(base[k])));
      scores[k] = {
        score,
        reasoning: `Mock reasoning for ${k} at chunk ${i} grounded in the prose's surface features.`,
      };
    }
    chunkScores[i] = {
      topic_label: topicPool[i % topicPool.length],
      scores,
    };
  }

  const voiceConsistency = computeVoiceConsistency(chunkScores);

  const quoteA = `"${snippetPool[0]}"`;
  const quoteB = `"${snippetPool[3]}"`;

  const descriptionsByDimension = {};
  for (const k of dimKeys) {
    descriptionsByDimension[k] = {
      stage: 'phase2',
      text: `Mock drift summary for ${k}: the document opens around ${topicPool[0]} with phrases like ${quoteA}, drifts toward the opposite pole through ${topicPool[2]}, and lands near ${quoteB} by the section on ${topicPool[5] || topicPool[4]}.`,
    };
  }
  descriptionsByDimension['voice_consistency'] = {
    stage: 'phase2',
    text: `Mock voice-consistency summary: the prose stays largely coherent across ${topicPool[0]} and ${topicPool[1]}, with one notable shift around ${topicPool[2]} where multiple dimensions move together.`,
  };

  return { chunkScores, voiceConsistency, descriptionsByDimension };
}

export async function mockCritiqueArguments(tree, runs = 3) {
  await delay(500);

  if (!tree) return { critiques: [] };

  // Walk the tree to collect ids by type.
  const argumentIds = [];
  const factIds = [];
  function walk(node) {
    if (!node) return;
    if (node.type === 'argument') argumentIds.push(node.id);
    else if (node.type === 'fact') factIds.push(node.id);
    for (const c of node.children || []) walk(c);
  }
  walk(tree);

  const allIds = [...argumentIds, ...factIds];
  if (allIds.length === 0) {
    return { critiques: [] };
  }

  const pickArg = (i) => argumentIds[Math.min(i, argumentIds.length - 1)] || allIds[0];
  const pickFact = (i) => factIds[Math.min(i, factIds.length - 1)] || allIds[Math.min(i, allIds.length - 1)];

  const root = argumentIds[0] || allIds[0];
  const totalRuns = Math.max(1, Math.floor(runs) || 1);

  // Mix of consensus / partial / singleton support counts. Honor the requested
  // run count: if runs===1, every supportCount collapses to 1.
  const consensusN = totalRuns;
  const partialN = totalRuns >= 2 ? Math.max(1, Math.floor(totalRuns / 2) || (totalRuns - 1)) : 1;
  const singletonN = 1;

  const critiques = [
    {
      // Consensus: every run flagged this.
      id: 'c1',
      comment: 'The leap from this supporting line of reasoning to the central claim is unjustified — the cited evidence does not actually establish the broader proposition the document is asserting.',
      category: 'weak_inference',
      severity: 'high',
      argumentNodeIds: [root, pickArg(1)].filter((v, i, a) => v && a.indexOf(v) === i),
      supportCount: consensusN,
      suggestion: 'Strengthen the link between this fact and the conclusion it supports — either cite an additional supporting fact or weaken the qualifier on the conclusion.',
    },
    {
      // Consensus.
      id: 'c2',
      comment: 'This factual assertion is offered without any cited source or methodological backing; the data slot is effectively empty.',
      category: 'unsupported_claim',
      severity: 'medium',
      argumentNodeIds: [pickFact(0)].filter(Boolean),
      supportCount: consensusN,
      suggestion: 'Provide a citation, exhibit reference, or measurement supporting this assertion, or reframe it as an assumption.',
    },
    {
      // Partial support.
      id: 'c3',
      comment: 'The argument equivocates between two distinct senses of a load-bearing term, and the conclusion only follows under the looser reading.',
      category: 'definitional',
      severity: 'high',
      argumentNodeIds: [pickArg(2), pickFact(1)].filter((v, i, a) => v && a.indexOf(v) === i),
      supportCount: partialN,
      suggestion: 'Clarify the meaning of the load-bearing term so the reader understands its scope.',
    },
    {
      // Singleton catch.
      id: 'c4',
      comment: 'An obvious alternative explanation for the cited correlation is never engaged, leaving a confounder that opposing counsel will press on.',
      category: 'unaddressed_counter',
      severity: 'medium',
      argumentNodeIds: [pickFact(2)].filter(Boolean),
      supportCount: singletonN,
      suggestion: 'Acknowledge the obvious counter-argument and explain why it does not undermine the conclusion.',
    },
    {
      // Singleton, low severity.
      id: 'c5',
      comment: 'The framing language here is conclusory in a way the underlying record does not support — the claim sweeps further than the evidence permits.',
      category: 'overreach',
      severity: 'low',
      argumentNodeIds: [pickFact(0)].filter(Boolean),
      supportCount: singletonN,
      suggestion: 'Reduce the scope of the conclusion to match the evidence, or marshal additional evidence to license the broader claim.',
    },
  ].filter((c) => c.argumentNodeIds.length > 0);

  return { critiques };
}

export async function mockCitationsReview(citations, corpusFiles) {
  await delay(700);
  const mappings = {};
  const results = {};
  if (!Array.isArray(citations) || citations.length === 0) {
    return { mappings, results };
  }
  const files = Array.isArray(corpusFiles) ? corpusFiles : [];

  const Q2_VARIANTS = [
    {
      severity: 'severe',
      q1: { status: 'pass', detail: 'Cited file located and quote verified.' },
      q2: {
        relationship: 'contradicts',
        reasoning: "The cited passage directly disagrees with the report's framing of the rule.",
        cited_excerpt: 'The court expressly declined to extend the Daubert standard to non-scientific testimony, leaving the question to subsequent rulings.',
        confidence: 'high',
      },
    },
    {
      severity: 'severe',
      q1: { status: 'unmapped', detail: 'No file in the corpus matches this citation.' },
      q2: null,
    },
    {
      severity: 'moderate',
      q1: { status: 'pass', detail: 'Cited file located.' },
      q2: {
        relationship: 'partial',
        reasoning: 'Supports the narrow version of the claim but not the broader generalization the report is using it for.',
        cited_excerpt: 'In the limited case of statutorily prescribed methods, the rule applies; the court did not address other methodologies.',
        confidence: 'medium',
      },
    },
    {
      severity: 'moderate',
      q1: { status: 'quote_mismatch', detail: 'Quoted text not found verbatim in the cited file (likely paraphrase).' },
      q2: {
        relationship: 'supports',
        reasoning: 'The cited material is consistent with the claim despite the quote not matching exactly.',
        cited_excerpt: 'Section 8-114 prohibits residential grass from exceeding the height threshold specified by the municipality.',
        confidence: 'medium',
      },
    },
    {
      severity: 'minor',
      q1: { status: 'pass', detail: 'Cited file located.' },
      q2: {
        relationship: 'supports',
        reasoning: 'The cited material backs the claim, though the engagement is brief.',
        cited_excerpt: 'These standards have been routinely applied in residential premises cases over the past decade.',
        confidence: 'low',
      },
    },
    {
      severity: 'clean',
      q1: { status: 'pass', detail: 'Cited file located and quote verified.' },
      q2: {
        relationship: 'supports',
        reasoning: 'The cited material clearly establishes the proposition the report relies on.',
        cited_excerpt: 'A landowner exercising reasonable care over residential premises in an urban neighborhood is expected to maintain pathways free of concealed hazards.',
        confidence: 'high',
      },
    },
  ];

  for (let i = 0; i < citations.length; i++) {
    const cit = citations[i];
    const variant = Q2_VARIANTS[i % Q2_VARIANTS.length];
    const fileId = variant.q1.status === 'unmapped' || files.length === 0
      ? null
      : files[i % files.length].id;
    mappings[cit.id] = fileId;
    results[cit.id] = {
      q1: variant.q1,
      q2: variant.q2,
      severity: variant.severity,
      evaluatedAt: Date.now(),
    };
  }

  return { mappings, results };
}

