# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Development Commands

```bash
npm run dev      # Start dev server (binds 0.0.0.0:5173)
npm run build    # Production build (outputs to build/)
npm run preview  # Preview production build
```

No test framework or linter is configured.

The dev server binds to `0.0.0.0`. Port 5173 is typically firewall-blocked — use SSH port forwarding: `ssh -L 5173:localhost:5173 user@host`.

## API Key Setup

The Anthropic API key is loaded at build time from `secrets/.anthropic.key` (injected via Vite `define` as `__ANTHROPIC_API_KEY__`). Falls back to browser localStorage if not present. Never commit this file.

## Architecture

This is a browser-based document review app built with **SvelteKit + Svelte 5 + Vite 7**. Uses **TailwindCSS v4** for styling and **Lucide Svelte** for icons. Users drop a file (PDF, DOCX, or text), the app extracts text, then sends it to Claude for AI-powered legal/expert review. Results appear as highlight annotations on the document.

### Project Structure

```
src/
  app.html              # SvelteKit HTML template
  app.css               # Tailwind entry + theme config + global styles
  routes/
    +layout.js           # ssr=false, prerender=false (client-side SPA)
    +layout.svelte       # App shell: header with DocDive logo, theme toggle
    +page.svelte         # Main page: file drop, viewer, review workflow, modals
  lib/
    theme.svelte.js      # Light/dark theme store (persists to localStorage)
    annotations.svelte.js # Global reactive store for annotations with replies
    documentContext.svelte.js # Global reactive store for extracted document text
    review.js            # Claude API review call with tool use
    chat.js              # Streaming chat with Claude
    PdfViewer.svelte     # PDF rendering with pdfjs-dist, highlights, zoom
    DocxViewer.svelte    # DOCX rendering with docx-preview
    TextViewer.svelte    # Plain text viewer
    CommentSidebar.svelte # Right sidebar: comments, replies, priority badges
    ChatSidebar.svelte   # Left sidebar: AI chat with model selection
    adapters/            # Pluggable text extraction per file type
```

### Core Flow

1. **File drop** → `+page.svelte` detects type via magic bytes → reads full file
2. **Text extraction** → `documentContext.svelte.js` delegates to the appropriate adapter (`src/lib/adapters/`) which returns `{ chunks, formatted }` — chunks are sentences with IDs like `p17.7` (page 17, sentence 7)
3. **Review** → `review.js` sends the formatted text to Claude with a tool-use schema (`REVIEW_TOOL`), forcing structured observations with `chunk_ids`, `comment`, and `priority`
4. **Annotation rendering** → `+page.svelte` maps chunk IDs back to DOM positions via adapter `findChunkRects()`, normalizes rects as ratios of page dimensions, and stores them via `annotations.svelte.js`
5. **Chat** → `ChatSidebar.svelte` + `chat.js` provide a streaming conversational interface with the document as context

### Styling

- **TailwindCSS v4** with `@tailwindcss/vite` plugin (no PostCSS, no tailwind.config.js)
- Custom color palette defined in `@theme` block in `app.css` — primary green scale anchored at `#2d6a4f`
- **Light/dark theme** via Tailwind `dark:` variant with class strategy. Toggle in header. Theme state in `src/lib/theme.svelte.js`.
- `:global()` styles in `app.css` for dynamically-created DOM (pdfjs text layer, highlight rects, docx-preview output, markdown content)
- Component `<style>` blocks only used for `:global()` styles targeting dynamic DOM elements

### Key Modules

- **`src/lib/annotations.svelte.js`** — Global reactive store (Svelte 5 `$state`) for annotations with replies. Annotations are sorted by page/position. All mutations go through exported functions.
- **`src/lib/documentContext.svelte.js`** — Global reactive store for extracted document text. Bridges adapters and consumers.
- **`src/lib/adapters/`** — Pluggable text extraction and rect-finding per file type (`pdf.js`, `docx.js`, `text.js`). Each adapter exports `extract(data)` and `findChunkRects(pageWrapper, text)`.
- **`src/lib/review.js`** — Review prompt is split: `REVIEW_PROMPT_USER` (shown to user, editable) + `REVIEW_PROMPT_INTERNAL` (hidden, contains chunk ID labeling instructions). Uses Claude tool_choice to force structured output.
- **`src/lib/chat.js`** — Streaming chat with model selection. Document text injected via system prompt.

### Daubert Corpus

`vite.config.js` loads HTML/text files from `corpus/daubert/` at build time and injects them as `__DAUBERT_CORPUS__`. These provide reference material for the legal review prompt. PDFs in the corpus must be pre-converted to `.txt`.

### SvelteKit Configuration

- **Adapter**: `@sveltejs/adapter-static` with `fallback: 'index.html'` for SPA mode
- **SSR**: Disabled (`ssr = false`) — all code runs client-side only
- **Vite config**: Uses `sveltekit()` + `tailwindcss()` plugins, plus custom `define` for API key and corpus injection

## Svelte 5 Pitfalls

- **`$derived` in addEventListener callbacks**: Derived values capture the initial value in plain event handlers. Call the getter function (e.g., `getAnnotations()`) inside the handler instead.
- **Reassigning `$state` objects**: Even same-value reassignment triggers `$effect` reruns and can destroy/rebuild DOM. Guard with conditionals before reassigning.
- **mousedown→click DOM rebuild**: Unconditional state reassignment in mousedown can destroy DOM elements before click fires, making `e.target` a detached node.
