# Corpus Strategy: Expert Deposition & Daubert Materials

## Purpose

This application helps experts prepare for deposition by critiquing their expert reports. To improve the quality of critiques, we want to build a corpus of real adversarial questioning patterns and challenges to expert testimony. This document outlines the two primary source types and the practical considerations for each.

---

## Option 1: Expert Deposition Transcripts

### What they provide
- Direct examples of opposing counsel's questioning strategies
- Common lines of attack: qualifications, methodology, data sources, assumptions, conclusions
- Patterns in how experts are tripped up or forced into concessions
- The rhythm and escalation of cross-examination

### Availability

Deposition transcripts are **not public records by default**. They become available only under specific circumstances:

| Source | Access | Cost | Notes |
|--------|--------|------|-------|
| **PACER** (federal courts) | Filed exhibits only | $0.10/page | Only available when deposition is filed as an exhibit in a motion or at trial |
| **State court e-filing portals** | Varies by state | Free to moderate | CA, NY, FL have reasonably accessible systems; many states do not |
| **Court reporters** | Purchase from reporting firm | $3-6/page typical | Requires knowing the case and reporter; parties may object |
| **Westlaw / LexisNexis** | Subscription databases | Expensive | Have expert deposition banks; best coverage but significant cost |
| **Legal publishers** | Curated collections | Moderate | E.g., Deposition Transcripts Online (DTO) |
| **Attorneys / law firms** | Direct relationships | Free (if shared) | Subject to confidentiality rules; may require redaction |

### Challenges
- **Cost**: Building a meaningful corpus (50-100+ transcripts) through PACER or reporters adds up quickly
- **Confidentiality**: Many depositions are subject to protective orders; even filed transcripts may be sealed
- **Format inconsistency**: Transcripts come in varied formats (PDF, ASCII, proprietary reporter formats) requiring normalization
- **Relevance filtering**: Most of a deposition is not about the expert report — you need to extract the relevant portions (methodology challenges, opinion challenges, qualification challenges)
- **Specialization**: Deposition styles vary significantly by practice area (patent vs. personal injury vs. securities); a general corpus may not match the user's domain

### Recommended approach
1. Start with PACER searches for cases where Daubert challenges were filed (these cases will have the most adversarial expert depositions)
2. Focus on depositions filed as exhibits to summary judgment or Daubert motions — these are the portions counsel found most damaging
3. Target 3-5 practice areas initially to provide breadth
4. Budget: expect $500-2,000 for an initial corpus of 30-50 relevant transcript excerpts

---

## Option 2: Daubert Motion Filings

### What they provide
- The **distilled adversarial argument** against an expert's methodology and conclusions
- Legal standards for what makes expert testimony admissible (reliability, relevance, fit)
- Common attack patterns organized by argument type rather than scattered across hours of testimony
- Judicial rulings on what constitutes a valid critique vs. a weak one

### Why this may be more valuable than raw transcripts
- **Higher signal-to-noise ratio**: Daubert motions are pure adversarial critique, not hours of procedural and foundational questioning
- **Structured arguments**: Briefs follow a logical structure (qualifications, methodology, data, conclusions) that maps directly to report sections
- **Judicial feedback**: The court's ruling tells you which critiques were persuasive and which were rejected — this can help calibrate critique severity
- **More accessible**: These are standard court filings, routinely available through PACER and state portals

### Availability

| Source | Access | Cost | Notes |
|--------|--------|------|-------|
| **PACER** | Search by motion type | $0.10/page | Search for "Daubert" or "motion to exclude expert" in case dockets |
| **State court portals** | Varies | Free to low | State equivalents to Daubert (e.g., Frye in some states) |
| **Google Scholar** | Court opinions | Free | Published opinions on Daubert challenges; no access to the underlying briefs, but the opinions summarize both sides' arguments |
| **Westlaw / LexisNexis** | Full brief databases | Subscription | Can search specifically for Daubert briefs by practice area |
| **Law school databases** | Varies | Free with affiliation | Some law schools maintain Daubert research databases |
| **DaubertTracker.com** | Specialized database | Subscription | Tracks Daubert challenges by expert, methodology, and outcome |

### Recommended approach
1. Start with **Google Scholar** for free published opinions — these summarize the arguments and provide judicial reasoning at no cost
2. Supplement with PACER filings for the underlying briefs in the most relevant cases
3. Organize by practice area and attack type (methodology, qualifications, data, conclusions, bias)
4. Budget: $100-500 for an initial corpus of 50-100 motions/opinions

---

## Comparison

| Factor | Deposition Transcripts | Daubert Motions |
|--------|----------------------|-----------------|
| **Cost to acquire** | High | Low to moderate |
| **Signal-to-noise** | Low (relevant portions buried in hours of testimony) | High (pure adversarial argument) |
| **Public availability** | Limited | Good |
| **Format consistency** | Poor | Good (standard legal brief format) |
| **Actionable critique patterns** | Implicit (must be extracted) | Explicit (structured arguments) |
| **Covers questioning style** | Yes | No |
| **Covers legal standards** | No | Yes |

---

## Recommended Strategy

### Phase 1: Foundation (low cost, high value)
- Collect 50-100 published Daubert opinions via Google Scholar
- Extract the common critique categories and attack patterns
- Use these patterns to improve the review prompt

### Phase 2: Depth (moderate cost)
- Purchase 20-30 Daubert briefs from PACER for the most relevant practice areas
- These provide the full adversarial argument, not just the court's summary
- Add selected deposition excerpts that were cited in successful Daubert challenges

### Phase 3: Specialization (ongoing)
- Build practice-area-specific sub-corpora based on user demand
- Incorporate deposition transcripts for questioning-style training
- Consider partnerships with law firms or legal publishers for ongoing access

---

## Corpus Integration

Materials should be stored in `corpus/` with the following structure:

```
corpus/
  daubert/
    opinions/       # Court opinions (free, Google Scholar)
    briefs/         # Full motion briefs (PACER)
  depositions/
    excerpts/       # Relevant portions of expert depositions
  metadata.json     # Index with practice area, attack type, outcome
```

The review pipeline can use this corpus as few-shot examples or as a reference for the system prompt, giving Claude concrete patterns of how expert reports are challenged in practice.

---

# DOCX Rendering Strategy

## Context

Expert reports are typically authored in Microsoft Word. The application needs to display these documents with reasonable formatting fidelity while supporting text selection and annotation overlays for the review workflow.

## Options Evaluated

### Option 1: mammoth.js

Converts DOCX to semantic HTML. Strips visual formatting, keeping only document structure (headings, lists, tables, bold/italic).

| Factor | Assessment |
|--------|------------|
| **Rendering fidelity** | Low — no fonts, colors, alignment, indentation, margins, or page breaks |
| **Text selection** | Excellent — standard HTML elements, native browser selection works perfectly |
| **Annotation overlays** | Works for manual selection; programmatic placement needs adaptation |
| **Bundle size** | ~150 KB |
| **Maintenance** | Stable, ~2M weekly downloads, infrequent updates |
| **Cost** | Free (BSD-2-Clause) |

**Best for**: Text extraction for AI pipelines. Poor for visual preview since expert reports with specific formatting (numbered paragraphs, indented block quotes, page-referenced content) will look unfamiliar to users.

### Option 2: docx-preview (docxjs) — CURRENT CHOICE

Parses DOCX XML directly and renders styled HTML/CSS preserving the original document's visual appearance — page dimensions, fonts, colors, margins, indentation, tables, headers/footers, page breaks.

| Factor | Assessment |
|--------|------------|
| **Rendering fidelity** | High — preserves font sizes, colors, alignment, indentation, table styling, page breaks. Not pixel-perfect but significantly closer to the original. |
| **Text selection** | Good — renders real DOM elements (`<p>`, `<span>`, `<td>`) with CSS styling |
| **Annotation overlays** | Compatible — renders into a container element; highlight-layer overlay works on top |
| **Bundle size** | ~964 KB |
| **Maintenance** | Actively maintained, pre-1.0 (API may change). Single maintainer (VolodymyrBaydalka). |
| **Cost** | Free (MIT) |

**Key API**: `renderAsync(data, container, styleContainer, options)` — takes ArrayBuffer and renders into a DOM element. Options include `breakPages`, `renderHeaders`, `renderFooters`, `className`.

**Key risk**: Single maintainer, pre-1.0 version. Page break rendering trusts the DOCX's embedded positions rather than calculating reflow.

### Option 3: Commercial SDKs (Nutrient, Syncfusion, Apryse)

Full document engine SDKs with near-perfect rendering fidelity and built-in annotation APIs.

| Factor | Assessment |
|--------|------------|
| **Rendering fidelity** | Near-perfect |
| **Text selection** | Built-in with annotation APIs |
| **Bundle size** | Multi-MB, heavy runtime |
| **Cost** | $1,000+/year per developer |

**Verdict**: Overkill for this use case. The app needs viewing and annotation, not editing. The cost and complexity are not justified when docx-preview provides adequate fidelity.

### Option 4: Server-side DOCX-to-PDF conversion (LibreOffice)

Convert DOCX to PDF on upload, then render with the existing PdfViewer (which has mature annotation support via pdf.js).

| Factor | Assessment |
|--------|------------|
| **Rendering fidelity** | Very high (LibreOffice rendering) |
| **Text selection** | Already working via pdf.js text layer |
| **Annotation overlays** | Already fully working in PdfViewer |
| **Bundle size** | No additional client-side bundle |
| **Complexity** | Requires server-side processing; breaks fully client-side architecture |

**Verdict**: Best fidelity and annotation support since it reuses the proven PDF pipeline, but requires a backend. Worth revisiting if a server component is added for other reasons.

## Current Architecture

The application uses a **dual-library approach**:

1. **mammoth.js** — Used exclusively for text extraction in the adapter layer (`src/lib/adapters/docx.js`). The `extract()` function calls `mammoth.extractRawText()` to produce sentence-level chunks that feed into the AI review pipeline. This is well-suited because the AI needs clean text, not formatting.

2. **docx-preview** — Used for visual rendering in `DocxViewer.svelte`. The raw DOCX bytes are passed to `renderAsync()` which renders styled HTML directly into the viewer container. Annotation overlays and text selection operate on the rendered DOM.

## Known Issues

- **Programmatic annotation placement**: The `findTextInSpans.js` utility searches for `.textLayer` elements which do not exist in docx-preview's output. The selector needs to be updated to target docx-preview's rendered spans for AI-generated annotations to be positioned correctly on DOCX files.
- **Page break handling**: docx-preview renders page breaks based on the DOCX's embedded positions. Documents that reflow differently at different window sizes may show breaks in unexpected places.

## Future Considerations

- If a backend is added (e.g., for corpus management or collaborative review), **Option 4 (server-side PDF conversion)** should be revisited as it would provide the best rendering fidelity with zero additional client complexity.
- If docx-preview's maintenance stalls, mammoth.js remains as a fallback (already integrated for extraction) — the app would revert to semantic HTML display with reduced fidelity.
- Commercial SDKs should be reconsidered if the application moves to a paid/enterprise model where licensing costs are justifiable.

---

# Corpus Integration Strategy

## Context

The application maintains a corpus of Daubert motion filings, court opinions, and legal articles (in `corpus/daubert/`) that document how opposing counsel challenges expert testimony. Incorporating this material into the AI review pipeline will produce more targeted, adversarial critiques of expert reports.

The current corpus is ~35-50K tokens across 4 documents. The review pipeline (`src/lib/review.js`) sends a single API call to Claude with the expert report text and a review prompt, receiving structured observations via tool use.

## Approaches Evaluated

### Approach 1: Direct Inclusion (Prompt Stuffing) — CURRENT CHOICE (Phase 1)

Build-time Vite plugin strips HTML/extracts PDF text from corpus files, embeds as a static JS module. The full corpus text is injected into the review prompt alongside the expert report.

| Factor | Assessment |
|--------|------------|
| **Context usage** | High (~35-50K tokens overhead). Feasible within Claude's 200K window for most reports. |
| **Quality** | Highest — Claude sees all source material verbatim and can cite specific standards and cases |
| **Complexity** | Low — Vite plugin + one import + prompt modification |
| **Client-side** | Yes — all preprocessing at build time |
| **Scalability** | Poor — linear growth as corpus expands; breaks at ~100K tokens of corpus with large reports |
| **Cost** | High — every review call pays for full corpus in input tokens |

### Approach 2: Distilled Playbook

Use Claude offline (one-time script) to read the full corpus and produce a condensed ~3-5K token "Daubert Challenge Playbook" capturing patterns, standards, and common attack vectors. Embed as a static string constant.

| Factor | Assessment |
|--------|------------|
| **Context usage** | Low (~3-5K tokens fixed overhead) |
| **Quality** | Medium-high — captures patterns well but loses verbatim case citations |
| **Complexity** | Low — one-time distillation script + static file |
| **Client-side** | Yes |
| **Scalability** | Good — playbook size stays fixed; re-distill when corpus updates |
| **Cost** | Low — small fixed overhead per review call |

### Approach 3: Two-Pass Review

Pass 1 sends corpus + report to identify relevant Daubert vulnerability patterns specific to this report. Pass 2 sends report + targeted findings for the full structured review.

| Factor | Assessment |
|--------|------------|
| **Context usage** | Pass 1: high (corpus + report). Pass 2: medium (report + ~2-4K targeted findings) |
| **Quality** | Highest for Daubert-specific depth — combines full corpus fidelity with focused application |
| **Complexity** | Medium — two API calls, progress UI, error handling |
| **Client-side** | Yes |
| **Scalability** | Medium — pass 1 still grows with corpus |
| **Cost** | High — two API calls per review |

### Approach 4: RAG with Vector Search

Pre-process corpus into chunks, generate embeddings, store in a vector database. At review time, query for the most relevant chunks (~5-7K tokens) to include in the prompt.

| Factor | Assessment |
|--------|------------|
| **Context usage** | Low — only relevant chunks included |
| **Quality** | Medium-high — depends on retrieval quality; may miss cross-document patterns |
| **Complexity** | Very high — requires backend, embedding pipeline, vector DB |
| **Client-side** | No — requires server infrastructure |
| **Scalability** | Excellent — handles arbitrarily large corpora |
| **Cost** | Medium — embedding generation is cheap; modest per-query overhead |

### Approach 5: Build-Time Chunked Modules (Client-Side RAG)

Vite plugin creates a lightweight index (~2K tokens) plus per-document chunk modules. At runtime, keyword matching or a quick Claude call selects relevant chunks to include in the review prompt.

| Factor | Assessment |
|--------|------------|
| **Context usage** | Medium (~2K index + 5-15K selected chunks) |
| **Quality** | Medium-high — client-side "poor man's RAG" |
| **Complexity** | Medium-high — Vite plugin with chunking, runtime selection logic |
| **Client-side** | Yes |
| **Scalability** | Medium — works up to ~50 documents |
| **Cost** | Medium |

## Phased Rollout

| Phase | Trigger | Approach | Rationale |
|-------|---------|----------|-----------|
| **1 (Now)** | 4 docs, ~35-50K tokens | Direct Inclusion | Corpus fits in context, highest quality, least effort |
| **2** | 15-20 docs | Distilled Playbook + Selective Chunks (2 + 5) | Context budget pressure; distill common patterns, load specific cases on demand |
| **3** | Large corpus or multi-user | RAG (4) | Only justified when a backend is added for other reasons |

Approach 3 (two-pass) is available as a variant at any phase if single-pass reviews aren't surfacing Daubert-specific observations prominently enough.

## Phase 1 Implementation

1. **Vite plugin** (`vite.config.js`): Read `corpus/daubert/*`, strip HTML tags from `.html` files, extract text from `.pdf` files, expose as `__DAUBERT_CORPUS__` via `define` (same pattern used for the API key).
2. **Review prompt** (`src/lib/review.js`): Import the corpus text and insert it into the prompt with framing: reference materials describing common Daubert challenges, instruct Claude to use them to identify vulnerabilities.
3. **Prompt update**: Expand `REVIEW_PROMPT_USER` to mention Daubert analysis as a review dimension.
