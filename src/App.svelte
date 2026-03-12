<script>
  import PdfViewer from './lib/PdfViewer.svelte';
  import TextViewer from './lib/TextViewer.svelte';
  import CommentSidebar from './lib/CommentSidebar.svelte';
  import ChatSidebar from './lib/ChatSidebar.svelte';
  import { addAnnotation, clearAnnotations } from './lib/annotations.svelte.js';
  import { extractAndStore, getExtractedText, getFormattedText, clearExtractedText } from './lib/documentContext.svelte.js';
  import { getAdapter } from './lib/adapters/index.js';
  import { reviewDocument, REVIEW_PROMPT_USER } from './lib/review.js';
  import { sendMessage, DEFAULT_MODEL } from './lib/chat.js';

  let fileContent = $state(null);
  let fileName = $state(null);
  let fileType = $state(null);
  let dragging = $state(false);
  let sidebarCollapsed = $state(false);
  let chatCollapsed = $state(false);

  // Review state
  let reviewing = $state(false);
  let reviewError = $state(null);
  let showApiKeyModal = $state(false);
  let apiKeyInput = $state('');
  let showCloseConfirm = $state(false);
  let showPromptModal = $state(false);
  let promptPreview = $state('');
  let pendingApiKey = $state(null);

  // Summary state
  let showSummary = $state(false);
  let summaryText = $state('');
  let summaryLoading = $state(false);
  let summaryError = $state(null);

  let viewerRef = $state(null);
  let commentSidebarRef = $state(null);
  let chatSidebarRef = $state(null);

  function getApiKey() {
    return localStorage.getItem('anthropic_api_key');
  }

  function saveApiKey(key) {
    localStorage.setItem('anthropic_api_key', key);
  }

  function getFileType(file) {
    if (file.type === 'application/pdf' || file.name.endsWith('.pdf')) return 'pdf';
    return 'text';
  }

  function handleDrop(event) {
    event.preventDefault();
    dragging = false;

    const file = event.dataTransfer.files[0];
    if (!file) return;

    fileName = file.name;
    fileType = getFileType(file);

    const reader = new FileReader();
    reader.onload = async (e) => {
      const bytes = new Uint8Array(e.target.result);
      fileContent = fileType === 'pdf' ? bytes : new TextDecoder().decode(bytes);
      try {
        await extractAndStore(bytes, fileType);
        fetchSummary();
      } catch (err) {
        console.error('Failed to extract document text:', err);
      }
    };
    reader.readAsArrayBuffer(file);
  }

  function handleDragOver(event) {
    event.preventDefault();
    dragging = true;
  }

  function handleDragLeave() {
    dragging = false;
  }

  function clearFile() {
    fileContent = null;
    fileName = null;
    fileType = null;
    clearExtractedText();
    clearAnnotations();
    chatSidebarRef?.clearChat();
    summaryText = '';
    summaryLoading = false;
    showSummary = false;
    summaryError = null;
    reviewError = null;
  }

  function toggleSummary() {
    showSummary = !showSummary;
  }

  async function fetchSummary() {
    const key = getApiKey();
    if (!key) return; // will fetch when key is set

    summaryLoading = true;
    summaryError = null;
    try {
      const result = await sendMessage({
        apiKey: key,
        model: DEFAULT_MODEL,
        messages: [{ role: 'user', content: 'Please provide a concise summary of this document in one or two paragraphs.' }],
        documentText: getFormattedText(),
        onChunk() {},
      });
      summaryText = result;
    } catch (e) {
      summaryError = e.message;
    } finally {
      summaryLoading = false;
    }
  }

  function startReview() {
    const key = getApiKey();
    if (!key) {
      showApiKeyModal = true;
      return;
    }
    showPromptConfirmation(key);
  }

  function submitApiKey() {
    const key = apiKeyInput.trim();
    if (!key) return;
    saveApiKey(key);
    showApiKeyModal = false;
    apiKeyInput = '';
    showPromptConfirmation(key);
  }

  function showPromptConfirmation(apiKey) {
    promptPreview = REVIEW_PROMPT_USER;
    pendingApiKey = apiKey;
    showPromptModal = true;
  }

  function confirmReview() {
    const userPrompt = promptPreview.trim();
    showPromptModal = false;
    runReview(pendingApiKey, userPrompt);
    pendingApiKey = null;
    promptPreview = '';
  }

  function cancelReview() {
    showPromptModal = false;
    pendingApiKey = null;
    promptPreview = '';
  }

  async function runReview(apiKey, userPrompt) {
    reviewing = true;
    reviewError = null;
    sidebarCollapsed = false;

    try {
      const extractedText = getExtractedText();
      if (!extractedText) throw new Error('No document text available. Please re-upload the file.');
      const adapter = getAdapter(fileType);
      const observations = await reviewDocument(extractedText, apiKey, userPrompt);

      const pageWrappers = viewerRef?.getPageWrappers() || [];
      const chunkMap = new Map(extractedText.chunks.map((c) => [c.id, c]));
      for (const obs of observations) {
        if (!obs.chunk_ids || !obs.comment) continue;

        // Collect rects from all referenced chunks
        let allRects = [];
        let primaryPage = 0;
        const referencedTexts = [];

        for (const chunkId of obs.chunk_ids) {
          const chunk = chunkMap.get(chunkId);
          if (!chunk) continue;

          if (!primaryPage) primaryPage = chunk.pageNumber;
          referencedTexts.push(chunk.text);

          const pageWrapper = pageWrappers[chunk.pageNumber - 1];
          if (!pageWrapper) continue;

          const found = adapter?.findChunkRects(pageWrapper, chunk.text);
          if (found) {
            const pageWidth = pageWrapper.offsetWidth;
            const pageHeight = pageWrapper.offsetHeight;
            const normalized = found.map((r) => ({
              left: r.left / pageWidth,
              top: r.top / pageHeight,
              width: r.width / pageWidth,
              height: r.height / pageHeight,
            }));
            allRects = allRects.concat(normalized);
          }
        }

        const displayText = referencedTexts.join(' ... ');

        addAnnotation({
          pageNumber: primaryPage || 1,
          text: displayText,
          rects: allRects,
          comment: obs.comment,
          author: 'claude',
          priority: obs.priority || null,
        });
      }
    } catch (e) {
      console.error('Review error:', e);
      reviewError = e.message;
      if (e.message.includes('401') || e.message.includes('403')) {
        localStorage.removeItem('anthropic_api_key');
        reviewError = 'Invalid API key. Click Review to try again.';
      }
    } finally {
      reviewing = false;
    }
  }
</script>

<main>
  {#if fileContent !== null}
    <div class="app-layout">
      <ChatSidebar bind:collapsed={chatCollapsed} bind:this={chatSidebarRef} apiKey={getApiKey() || ''} />
      <div class="viewer">
        <div class="toolbar">
          <button class="filename" onclick={toggleSummary} title="Click to view document summary">{fileName}</button>
          <div class="toolbar-actions">
            {#if reviewError}
              <span class="review-error" title={reviewError}>{reviewError}</span>
            {/if}
            <button class="btn-review" onclick={startReview} disabled={reviewing}>
              {#if reviewing}
                Reviewing...
              {:else}
                Review
              {/if}
            </button>
            <button onclick={() => showCloseConfirm = true}>Close</button>
          </div>
        </div>
        {#if showSummary}
          <div class="summary-panel">
            <div class="summary-header">
              <span>Document Summary</span>
              <button onclick={() => showSummary = false}>&times;</button>
            </div>
            <div class="summary-content">
              {#if summaryLoading && !summaryText}
                <span class="summary-loading">Generating summary...</span>
              {:else if summaryError}
                <span class="summary-error">{summaryError}</span>
              {:else}
                {summaryText}
              {/if}
            </div>
          </div>
        {/if}
        {#if fileType === 'pdf'}
          <PdfViewer data={fileContent} bind:this={viewerRef} onAnnotationClick={(id) => commentSidebarRef?.scrollToComment(id)} />
        {:else}
          <TextViewer content={fileContent} bind:this={viewerRef} onAnnotationClick={(id) => commentSidebarRef?.scrollToComment(id)} />
        {/if}
      </div>
      <CommentSidebar bind:collapsed={sidebarCollapsed} bind:this={commentSidebarRef} onselect={(id) => viewerRef?.scrollToAnnotation(id)} />
    </div>
  {:else}
    <div
      class="dropzone"
      class:dragging
      role="button"
      tabindex="0"
      ondrop={handleDrop}
      ondragover={handleDragOver}
      ondragleave={handleDragLeave}
    >
      <div class="dropzone-inner">
        <svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
          <polyline points="14 2 14 8 20 8"/>
          <line x1="12" y1="18" x2="12" y2="12"/>
          <line x1="9" y1="15" x2="12" y2="12"/>
          <line x1="15" y1="15" x2="12" y2="12"/>
        </svg>
        <p>Drop a file here to view it</p>
        <p class="supported-types">.txt, .pdf</p>
      </div>
    </div>
  {/if}

  {#if showApiKeyModal}
    <div class="modal-overlay" onclick={() => showApiKeyModal = false}>
      <div class="modal" onclick={(e) => e.stopPropagation()}>
        <h3>Anthropic API Key</h3>
        <p>Enter your API key to enable AI review. It will be stored in your browser's localStorage.</p>
        <input
          type="password"
          bind:value={apiKeyInput}
          placeholder="sk-ant-..."
          onkeydown={(e) => { if (e.key === 'Enter') submitApiKey(); }}
        />
        <div class="modal-actions">
          <button class="btn-submit" onclick={submitApiKey}>Save & Review</button>
          <button onclick={() => showApiKeyModal = false}>Cancel</button>
        </div>
      </div>
    </div>
  {/if}

  {#if showPromptModal}
    <div class="modal-overlay" onclick={cancelReview}>
      <div class="modal modal-wide" onclick={(e) => e.stopPropagation()}>
        <h3>Review Prompt</h3>
        <p>Edit the prompt that will be sent to the Claude API:</p>
        <textarea
          class="prompt-textarea"
          bind:value={promptPreview}
          onkeydown={(e) => { if (e.key === 'Enter' && e.metaKey) confirmReview(); }}
        ></textarea>
        <div class="modal-actions">
          <button class="btn-submit" onclick={confirmReview}>Send Review</button>
          <button onclick={cancelReview}>Cancel</button>
        </div>
      </div>
    </div>
  {/if}

  {#if showCloseConfirm}
    <div class="modal-overlay" onclick={() => showCloseConfirm = false}>
      <div class="modal" onclick={(e) => e.stopPropagation()}>
        <h3>Close Document</h3>
        <p>This will clear all comments, chat history, and review data. Are you sure?</p>
        <div class="modal-actions">
          <button class="btn-submit btn-danger" onclick={() => { showCloseConfirm = false; clearFile(); }}>Close Document</button>
          <button onclick={() => showCloseConfirm = false}>Cancel</button>
        </div>
      </div>
    </div>
  {/if}
</main>

<style>
  main {
    height: 100vh;
    display: flex;
    flex-direction: column;
  }

  .app-layout {
    flex: 1;
    display: flex;
    overflow: hidden;
  }

  .dropzone {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    border: 3px dashed #444;
    border-radius: 12px;
    margin: 24px;
    transition: border-color 0.2s, background-color 0.2s;
    cursor: pointer;
    color: #888;
  }

  .dropzone.dragging {
    border-color: #646cff;
    background-color: rgba(100, 108, 255, 0.08);
    color: #646cff;
  }

  .dropzone-inner {
    text-align: center;
  }

  .dropzone-inner p {
    margin-top: 12px;
    font-size: 1.1rem;
  }

  .supported-types {
    font-size: 0.85rem !important;
    color: #555;
  }

  .viewer {
    flex: 1;
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }

  .toolbar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 8px 16px;
    background: #1a1a2e;
    border-bottom: 1px solid #333;
  }

  .filename {
    font-weight: 600;
    font-size: 0.9rem;
    color: #ccc;
    background: transparent;
    border: none;
    cursor: pointer;
    padding: 2px 4px;
    border-radius: 3px;
    font-family: inherit;
  }

  .filename:hover {
    background: #2a2a4a;
    color: #fff;
  }

  .toolbar-actions {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .toolbar button {
    padding: 4px 12px;
    border-radius: 4px;
    border: 1px solid #555;
    background: transparent;
    color: #ccc;
    cursor: pointer;
    font-size: 0.85rem;
  }

  .toolbar button:hover {
    background: #333;
  }

  .btn-review {
    background: #646cff !important;
    border-color: #646cff !important;
    color: white !important;
  }

  .btn-review:hover {
    background: #535bf2 !important;
  }

  .btn-review:disabled {
    opacity: 0.6;
    cursor: not-allowed !important;
  }

  .review-error {
    font-size: 0.8rem;
    color: #f87171;
    cursor: help;
    max-width: 300px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .content {
    flex: 1;
    overflow: auto;
    margin: 0;
    padding: 16px 24px;
    font-family: 'Courier New', Courier, monospace;
    font-size: 0.9rem;
    line-height: 1.6;
    white-space: pre-wrap;
    word-wrap: break-word;
    color: #ddd;
    background: #0d0d1a;
  }

  /* Modal */
  .modal-overlay {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.6);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 100;
  }

  .modal {
    background: #1a1a2e;
    border: 1px solid #333;
    border-radius: 8px;
    padding: 24px;
    width: 400px;
    max-width: 90vw;
  }

  .modal h3 {
    margin: 0 0 8px 0;
    color: #ddd;
    font-size: 1rem;
  }

  .modal p {
    margin: 0 0 16px 0;
    color: #888;
    font-size: 0.85rem;
    line-height: 1.4;
  }

  .modal input {
    width: 100%;
    padding: 8px 12px;
    background: #0d0d1a;
    border: 1px solid #444;
    border-radius: 4px;
    color: #ddd;
    font-size: 0.9rem;
    font-family: monospace;
    margin-bottom: 16px;
  }

  .modal input:focus {
    outline: none;
    border-color: #646cff;
  }

  .modal-actions {
    display: flex;
    gap: 8px;
    justify-content: flex-end;
  }

  .modal-actions button {
    padding: 6px 16px;
    border-radius: 4px;
    border: 1px solid #444;
    background: transparent;
    color: #ccc;
    cursor: pointer;
    font-size: 0.85rem;
  }

  .modal-actions .btn-submit {
    background: #646cff;
    border-color: #646cff;
    color: white;
  }

  .modal-actions .btn-submit:hover {
    background: #535bf2;
  }

  .modal-actions .btn-danger {
    background: #dc2626;
    border-color: #dc2626;
  }

  .modal-actions .btn-danger:hover {
    background: #b91c1c;
  }

  .modal-wide {
    width: 700px;
    max-height: 80vh;
    display: flex;
    flex-direction: column;
  }

  .prompt-textarea {
    width: 100%;
    min-height: 150px;
    margin: 0 0 16px 0;
    padding: 12px;
    background: #0d0d1a;
    border: 1px solid #444;
    border-radius: 4px;
    color: #ddd;
    font-family: inherit;
    font-size: 0.85rem;
    line-height: 1.5;
    resize: vertical;
  }

  .prompt-textarea:focus {
    outline: none;
    border-color: #646cff;
  }

  .summary-panel {
    background: #1a1a2e;
    border-bottom: 1px solid #333;
    max-height: 200px;
    display: flex;
    flex-direction: column;
  }

  .summary-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 6px 16px;
    font-size: 0.8rem;
    font-weight: 600;
    color: #aaa;
    border-bottom: 1px solid #2a2a4a;
  }

  .summary-header button {
    background: transparent;
    border: none;
    color: #888;
    font-size: 1.1rem;
    cursor: pointer;
    padding: 0 4px;
    line-height: 1;
  }

  .summary-header button:hover {
    color: #ccc;
  }

  .summary-content {
    padding: 10px 16px;
    font-size: 0.85rem;
    color: #ccc;
    line-height: 1.5;
    overflow-y: auto;
    white-space: pre-wrap;
  }

  .summary-loading {
    color: #666;
    font-style: italic;
  }

  .summary-error {
    color: #f87171;
  }
</style>
