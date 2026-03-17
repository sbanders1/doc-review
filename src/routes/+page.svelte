<script>
  import { onMount, tick } from 'svelte';
  import PdfViewer from '$lib/PdfViewer.svelte';
  import TextViewer from '$lib/TextViewer.svelte';
  import DocxViewer from '$lib/DocxViewer.svelte';
  import CommentSidebar from '$lib/CommentSidebar.svelte';
  import ChatSidebar from '$lib/ChatSidebar.svelte';
  import SessionSidebar from '$lib/SessionSidebar.svelte';
  import { addAnnotation, clearAnnotations, getAnnotations, getAnnotationsSnapshot, restoreAnnotationsSnapshot } from '$lib/annotations.svelte.js';
  import { detectCitationsWithLLM } from '$lib/citationReview.js';
  import { addCitationsBatch, clearCitations, getCitations, getCitationsSnapshot, restoreCitationsSnapshot } from '$lib/citations.svelte.js';
  import { extractAndStore, getExtractedText, getFormattedText, clearExtractedText, getDocumentContextSnapshot, restoreDocumentContextSnapshot } from '$lib/documentContext.svelte.js';
  import { getAdapter } from '$lib/adapters/index.js';
  import { reviewDocument, REVIEW_PROMPT_USER } from '$lib/review.js';
  import { sendMessage, DEFAULT_MODEL } from '$lib/chat.js';
  import { getModel } from '$lib/model.svelte.js';
  import { getSession, putSession, deleteSessionFromDB } from '$lib/db.js';
  import { getSessions, getActiveSessionId, setActiveSessionId, loadSessionList, addSessionToList, removeSessionFromList, updateSessionMeta } from '$lib/session.svelte.js';
  import { clearHistory } from '$lib/commandHistory.svelte.js';
  import { FileUp, X } from 'lucide-svelte';

  let fileContent = $state(null);
  let fileName = $state(null);
  let fileType = $state(null);
  let dragging = $state(false);
  let uploadError = $state(null);
  let sidebarCollapsed = $state(false);
  let chatCollapsed = $state(true);
  let sessionsCollapsed = $state(false);

  // Review state
  let reviewing = $state(false);
  let reviewError = $state(null);
  let showApiKeyModal = $state(false);
  let apiKeyInput = $state('');
  let showCloseConfirm = $state(false);
  let showPromptModal = $state(false);
  let promptPreview = $state('');
  let pendingApiKey = $state(null);

  // Review result tracking
  let lastReviewTimestamp = $state(null);
  let lastReviewCritiques = $state(0);
  let lastReviewCitations = $state(0);
  let reviewResultToast = $state(null); // { critiques: N, citations: N }

  // Summary state
  let showSummary = $state(false);
  let summaryText = $state('');
  let summaryLoading = $state(false);
  let summaryError = $state(null);

  let viewerRef = $state(null);
  let commentSidebarRef = $state(null);
  let chatSidebarRef = $state(null);
  let fileInputRef = $state(null);

  // Pending viewer snapshot to restore after viewer mounts
  let pendingViewerSnapshot = $state(null);
  let pendingChatSnapshot = $state(null);

  const EMBEDDED_API_KEY = typeof __ANTHROPIC_API_KEY__ !== 'undefined' ? __ANTHROPIC_API_KEY__ : '';

  function getApiKey() {
    return EMBEDDED_API_KEY || localStorage.getItem('anthropic_api_key');
  }

  function saveApiKey(key) {
    localStorage.setItem('anthropic_api_key', key);
  }

  function uuid() {
    if (crypto.randomUUID) return crypto.randomUUID();
    return '10000000-1000-4000-8000-100000000000'.replace(/[018]/g, c =>
      (+c ^ crypto.getRandomValues(new Uint8Array(1))[0] & 15 >> +c / 4).toString(16)
    );
  }

  // --- Session Management ---

  // NOTE: Don't use $derived for these — call getters directly in the template
  // and inside handlers. $derived captures stale values in async callbacks (FileReader.onload).

  onMount(async () => {
    await loadSessionList();
    const list = getSessions();
    if (list.length > 0) {
      await switchToSession(list[0].id);
    }
  });

  function gatherSessionData() {
    const id = getActiveSessionId();
    const now = Date.now();
    // Preserve createdAt from the session list metadata
    const existing = getSessions().find(s => s.id === id);
    const chatSnap = chatSidebarRef?.getChatSnapshot();
    const viewerSnap = viewerRef?.getViewerSnapshot();
    return {
      id,
      name: fileName,
      createdAt: existing?.createdAt ?? now,
      fileType,
      fileContent: fileContent instanceof Uint8Array
        ? (fileContent.buffer.byteLength === 0
          ? null  // Buffer detached by pdfjs — skip; the original is already persisted in IndexedDB
          : new Uint8Array(fileContent))
        : fileContent,
      lastModified: now,
      extractedText: getDocumentContextSnapshot(),
      ...getAnnotationsSnapshot(),
      ...getCitationsSnapshot(),
      chatMessages: chatSnap?.messages || [],
      chatModel: chatSnap?.selectedModel || DEFAULT_MODEL,
      viewerScale: viewerSnap?.scale ?? 1,
      scrollTop: viewerSnap?.scrollTop ?? 0,
      scrollLeft: viewerSnap?.scrollLeft ?? 0,
      summaryText,
      lastReviewTimestamp,
      lastReviewCritiques,
      lastReviewCitations,
    };
  }

  async function saveCurrentSession() {
    const id = getActiveSessionId();
    if (!id || !fileContent) return;
    try {
      const data = gatherSessionData();
      // If fileContent was null (detached buffer), preserve the copy already in IndexedDB
      if (data.fileContent === null) {
        const existing = await getSession(id);
        if (existing?.fileContent) {
          data.fileContent = existing.fileContent;
        }
      }
      await putSession(data);
      updateSessionMeta(id, { lastModified: data.lastModified, name: data.name, fileType: data.fileType });
    } catch (e) {
      console.error('Failed to save session:', e);
    }
  }

  async function switchToSession(id) {
    if (id === getActiveSessionId()) return;

    // Save outgoing session
    await saveCurrentSession();

    // Load incoming session
    const session = await getSession(id);
    if (!session) return;

    // Restore page-level state
    fileContent = session.fileContent;
    fileName = session.name;
    fileType = session.fileType;
    summaryText = session.summaryText || '';
    lastReviewTimestamp = session.lastReviewTimestamp || null;
    lastReviewCritiques = session.lastReviewCritiques || 0;
    lastReviewCitations = session.lastReviewCitations || 0;
    reviewResultToast = null;
    reviewError = null;
    showSummary = false;

    // Clear command history for the new session
    clearHistory();

    // Restore global stores
    restoreAnnotationsSnapshot({
      annotations: session.annotations || [],
      activeAnnotationId: session.activeAnnotationId || null,
    });
    restoreCitationsSnapshot({
      citations: session.citations || [],
      activeCitationId: session.activeCitationId || null,
    });
    restoreDocumentContextSnapshot(session.extractedText || null);

    // Set active session (triggers {#key} re-render of viewer)
    setActiveSessionId(id);

    // Queue snapshots to restore after viewer/chat mount
    pendingViewerSnapshot = {
      scale: session.viewerScale ?? 1,
      scrollTop: session.scrollTop ?? 0,
      scrollLeft: session.scrollLeft ?? 0,
    };
    pendingChatSnapshot = {
      messages: session.chatMessages || [],
      selectedModel: session.chatModel || DEFAULT_MODEL,
    };
  }

  // Restore pending snapshots when viewer/chat refs become available.
  // For PDFs, this is handled in handlePdfReady (after rendering completes).
  $effect(() => {
    if (viewerRef && pendingViewerSnapshot && fileType !== 'pdf') {
      const snapshot = pendingViewerSnapshot;
      pendingViewerSnapshot = null;
      tick().then(() => {
        viewerRef?.restoreViewerSnapshot(snapshot);
      });
    }
  });

  $effect(() => {
    if (chatSidebarRef && pendingChatSnapshot) {
      const snapshot = pendingChatSnapshot;
      pendingChatSnapshot = null;
      chatSidebarRef.restoreChatSnapshot(snapshot);
    }
  });

  function handlePdfReady() {
    // Restore pending viewer snapshot if any
    if (pendingViewerSnapshot) {
      const snapshot = pendingViewerSnapshot;
      pendingViewerSnapshot = null;
      viewerRef?.restoreViewerSnapshot(snapshot);
    }
  }

  async function handleNewSession() {
    await saveCurrentSession();
    clearHistory();
    // Clear state to show drop zone
    fileContent = null;
    fileName = null;
    fileType = null;
    summaryText = '';
    clearExtractedText();
    clearAnnotations();
    clearCitations();
    setActiveSessionId(null);
    reviewError = null;
    reviewResultToast = null;
  }

  async function handleDeleteSession(id) {
    await deleteSessionFromDB(id);
    removeSessionFromList(id);
    if (getActiveSessionId() === null) {
      // Was the active session — clear state
      fileContent = null;
      fileName = null;
      fileType = null;
      summaryText = '';
      clearExtractedText();
      clearAnnotations();
      clearCitations();
      // Load next session if available
      const list = getSessions();
      if (list.length > 0) {
        await switchToSession(list[0].id);
      }
    }
  }

  function positionAndStoreCitations(llmCitations) {
    const extractedText = getExtractedText();
    if (!extractedText) return;
    const adapter = getAdapter(fileType);
    const pageWrappers = viewerRef?.getPageWrappers() || [];
    const chunkMap = new Map(extractedText.chunks.map(c => [c.id, c]));
    const citationsToAdd = [];

    for (const det of llmCitations) {
      if (!det.chunk_ids || !det.citation_ref) continue;
      let allRects = [];
      let primaryPage = 0;

      for (const chunkId of det.chunk_ids) {
        const chunk = chunkMap.get(chunkId);
        if (!chunk) continue;
        if (!primaryPage) primaryPage = chunk.pageNumber;
        const pageWrapper = pageWrappers[chunk.pageNumber - 1];
        if (!pageWrapper) continue;

        // Try to find the exact citation ref text first, fall back to chunk text
        const found = adapter?.findChunkRects(pageWrapper, det.citation_ref, { firstMatchOnly: true })
          || adapter?.findChunkRects(pageWrapper, chunk.text, { firstMatchOnly: true });
        if (!found || found.length === 0) continue;

        const pageWidth = pageWrapper.offsetWidth;
        const pageHeight = pageWrapper.offsetHeight;
        const normalized = found.map(r => ({
          left: r.left / pageWidth,
          top: r.top / pageHeight,
          width: r.width / pageWidth,
          height: r.height / pageHeight,
          pageNumber: chunk.pageNumber,
        }));
        allRects = allRects.concat(normalized);
      }

      if (allRects.length === 0) continue;

      citationsToAdd.push({
        pageNumber: primaryPage,
        text: det.citation_ref,
        rects: allRects,
        citationRef: det.citation_ref,
        citationType: det.citation_type,
        comment: det.comment || '',
        source: 'ai',
        linkedTo: det.linked_to || null,
      });
    }

    if (citationsToAdd.length > 0) {
      addCitationsBatch(citationsToAdd);
    }
  }

  // Auto-save debounced — tracks annotations and summary changes
  let autoSaveTimer;
  $effect(() => {
    const _id = getActiveSessionId();
    // Touch reactive deps to trigger on changes
    const _annotations = getAnnotations();
    const _citations = getCitations();
    const _summary = summaryText;
    if (!_id) return;

    clearTimeout(autoSaveTimer);
    autoSaveTimer = setTimeout(() => {
      saveCurrentSession();
    }, 3000);

    return () => clearTimeout(autoSaveTimer);
  });

  // --- File Handling ---

  function detectFileType(bytes) {
    if (bytes.length >= 4 && bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46) {
      return 'pdf';
    }
    if (bytes.length >= 4 && bytes[0] === 0x50 && bytes[1] === 0x4B && bytes[2] === 0x03 && bytes[3] === 0x04) {
      return 'docx';
    }
    if (bytes.length >= 4 && bytes[0] === 0xD0 && bytes[1] === 0xCF && bytes[2] === 0x11 && bytes[3] === 0xE0) {
      return 'docx';
    }
    const sample = bytes.slice(0, 8192);
    for (let i = 0; i < sample.length; i++) {
      if (sample[i] === 0x00) return null;
    }
    return 'text';
  }

  function fileTitle(name) {
    return name.replace(/\.[^/.]+$/, '');
  }

  async function processFile(file) {
    try {
      const rawBuffer = await file.arrayBuffer();
      const detectedType = detectFileType(new Uint8Array(rawBuffer, 0, Math.min(8192, rawBuffer.byteLength)));
      if (!detectedType) {
        uploadError = `"${file.name}" is not a supported file type. Please upload a PDF, Word document (.docx/.doc), or text file.`;
        return;
      }
      uploadError = null;
      await saveCurrentSession();

      const title = fileTitle(file.name);
      const isBinary = detectedType === 'pdf' || detectedType === 'docx';

      // Create session immediately with the raw file data — before anything can detach buffers
      const id = uuid();
      const now = Date.now();
      await putSession({
        id,
        name: title,
        createdAt: now,
        lastModified: now,
        fileType: detectedType,
        fileContent: isBinary ? new Uint8Array(rawBuffer.slice(0)) : new TextDecoder().decode(rawBuffer),
        extractedText: null,
        annotations: [],
        activeAnnotationId: null,
        citations: [],
        activeCitationId: null,
        chatMessages: [],
        chatModel: DEFAULT_MODEL,
        viewerScale: 1,
        scrollTop: 0,
        scrollLeft: 0,
        summaryText: '',
      });
      addSessionToList({ id, name: title, createdAt: now, lastModified: now, fileType: detectedType });

      // Now set up the viewer
      const content = isBinary ? new Uint8Array(rawBuffer.slice(0)) : new TextDecoder().decode(rawBuffer);
      fileContent = content;
      fileName = title;
      fileType = detectedType;
      summaryText = '';
      reviewError = null;
      clearAnnotations();
      clearCitations();
      setActiveSessionId(id);
      pendingChatSnapshot = { messages: [], selectedModel: DEFAULT_MODEL };

      // Extract text (pdfjs may detach buffers here — doesn't matter, we already saved)
      await extractAndStore(new Uint8Array(rawBuffer.slice(0)), detectedType);

      fetchSummary();
    } catch (err) {
      console.error('Failed to process file:', err);
    }
  }

  function handleDrop(event) {
    event.preventDefault();
    dragging = false;

    const file = event.dataTransfer.files[0];
    if (!file) return;
    processFile(file);
  }

  function handleFileInput(event) {
    const file = event.target.files[0];
    if (!file) return;
    processFile(file);
    // Reset so the same file can be re-selected
    event.target.value = '';
  }

  function openFilePicker() {
    fileInputRef?.click();
  }

  function handleDragOver(event) {
    event.preventDefault();
    dragging = true;
  }

  function handleDragLeave() {
    dragging = false;
  }

  async function clearFile() {
    // Save before closing, then deactivate
    await saveCurrentSession();
    clearHistory();
    fileContent = null;
    fileName = null;
    fileType = null;
    clearExtractedText();
    clearAnnotations();
    clearCitations();
    summaryText = '';
    summaryLoading = false;
    showSummary = false;
    summaryError = null;
    reviewError = null;
    reviewResultToast = null;
    setActiveSessionId(null);
  }

  function toggleSummary() {
    showSummary = !showSummary;
  }

  async function fetchSummary() {
    const key = getApiKey();
    if (!key) return;

    summaryLoading = true;
    summaryError = null;
    try {
      const result = await sendMessage({
        apiKey: key,
        model: getModel(),
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
      const currentModel = getModel();

      // Run review and citation detection in parallel
      const [reviewResult, citationResult] = await Promise.allSettled([
        reviewDocument(extractedText, apiKey, userPrompt, currentModel),
        detectCitationsWithLLM(extractedText, apiKey, currentModel),
      ]);

      const adapter = getAdapter(fileType);
      const pageWrappers = viewerRef?.getPageWrappers() || [];
      const chunkMap = new Map(extractedText.chunks.map((c) => [c.id, c]));

      // Process review observations (existing annotation logic)
      if (reviewResult.status === 'fulfilled') {
        const observations = reviewResult.value;
        for (const obs of observations) {
          if (!obs.chunk_ids || !obs.comment) continue;

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
      } else {
        console.error('Review failed:', reviewResult.reason);
        reviewError = reviewResult.reason.message;
      }

      // Process citations
      if (citationResult.status === 'fulfilled') {
        positionAndStoreCitations(citationResult.value);
      } else {
        console.error('Citation detection failed:', citationResult.reason);
        // Non-fatal: don't set reviewError, just log
      }

      // Count results
      let critiqueCount = 0;
      if (reviewResult.status === 'fulfilled') {
        critiqueCount = reviewResult.value.filter(obs => obs.chunk_ids && obs.comment).length;
      }
      let citationCount = 0;
      if (citationResult.status === 'fulfilled') {
        citationCount = citationResult.value.filter(c => c.chunk_ids && c.citation_ref).length;
      }

      lastReviewTimestamp = Date.now();
      lastReviewCritiques = critiqueCount;
      lastReviewCitations = citationCount;

      // Show persistent toast
      reviewResultToast = { critiques: critiqueCount, citations: citationCount };

      saveCurrentSession();
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

<main class="h-full flex">
  <SessionSidebar
    bind:collapsed={sessionsCollapsed}
    sessions={getSessions()}
    activeId={getActiveSessionId()}
    onswitch={switchToSession}
    ondelete={handleDeleteSession}
    oncreate={handleNewSession}
  />

  <div class="flex-1 flex flex-col min-w-0">
    {#if fileContent !== null}
      <div class="flex-1 flex overflow-hidden">
        <div class="flex-1 flex flex-col overflow-hidden min-w-0">
          <div class="flex items-center justify-between px-4 py-2 bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800">
            <button
              class="font-semibold text-sm text-gray-700 dark:text-gray-300 bg-transparent border-none cursor-pointer px-1.5 py-0.5 rounded hover:bg-gray-100 dark:hover:bg-gray-800 hover:text-gray-900 dark:hover:text-white transition-colors"
              onclick={toggleSummary}
              title="Click to view document summary"
            >{fileName}</button>
            <div class="flex items-center gap-2">
              {#if reviewError}
                <span class="text-xs text-red-500 cursor-help max-w-[300px] overflow-hidden text-ellipsis whitespace-nowrap" title={reviewError}>{reviewError}</span>
              {/if}
              <button
                class="px-4 py-1.5 rounded-md bg-primary-500 hover:bg-primary-600 text-white text-sm font-medium cursor-pointer border-none disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                onclick={startReview}
                disabled={reviewing}
              >
                {#if reviewing}
                  Reviewing...
                {:else}
                  Review
                {/if}
              </button>
              <button
                class="p-1.5 rounded-md border border-gray-300 dark:border-gray-600 bg-transparent text-gray-600 dark:text-gray-400 cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                onclick={() => showCloseConfirm = true}
                title="Close document"
              >
                <X size={16} />
              </button>
            </div>
          </div>
          {#if showSummary}
            <div class="bg-gray-50 dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800 max-h-[200px] flex flex-col">
              <div class="flex items-center justify-between px-4 py-1.5 text-xs font-semibold text-gray-500 dark:text-gray-400 border-b border-gray-100 dark:border-gray-800">
                <span>Document Summary</span>
                <button class="bg-transparent border-none text-gray-400 dark:text-gray-500 text-base cursor-pointer leading-none hover:text-gray-700 dark:hover:text-gray-300 p-0" onclick={() => showSummary = false}>
                  <X size={14} />
                </button>
              </div>
              <div class="px-4 py-2.5 text-sm text-gray-700 dark:text-gray-300 leading-relaxed overflow-y-auto whitespace-pre-wrap">
                {#if summaryLoading && !summaryText}
                  <span class="text-gray-400 italic">Generating summary...</span>
                {:else if summaryError}
                  <span class="text-red-500">{summaryError}</span>
                {:else}
                  {summaryText}
                {/if}
              </div>
            </div>
          {/if}
          {#key getActiveSessionId()}
            {#if fileType === 'pdf'}
              <PdfViewer data={fileContent} bind:this={viewerRef} onAnnotationClick={(id) => commentSidebarRef?.scrollToComment(id)} onCitationClick={(id) => commentSidebarRef?.scrollToCitation(id)} onready={handlePdfReady} />
            {:else if fileType === 'docx'}
              <DocxViewer content={fileContent} bind:this={viewerRef} onAnnotationClick={(id) => commentSidebarRef?.scrollToComment(id)} onCitationClick={(id) => commentSidebarRef?.scrollToCitation(id)} />
            {:else}
              <TextViewer content={fileContent} bind:this={viewerRef} onAnnotationClick={(id) => commentSidebarRef?.scrollToComment(id)} onCitationClick={(id) => commentSidebarRef?.scrollToCitation(id)} />
            {/if}
          {/key}
          <ChatSidebar bind:collapsed={chatCollapsed} bind:this={chatSidebarRef} apiKey={getApiKey() || ''} />
        </div>
        <CommentSidebar bind:collapsed={sidebarCollapsed} bind:this={commentSidebarRef} onselect={(id) => viewerRef?.scrollToAnnotation(id)} oncitationselect={(id) => viewerRef?.scrollToAnnotation(id)} apiKey={getApiKey() || ''} />
      </div>
    {:else}
      <div
        class="flex-1 flex items-center justify-center border-3 border-dashed rounded-xl m-6 transition-colors cursor-pointer {dragging ? 'border-primary-500 bg-primary-500/5 text-primary-500' : 'border-gray-300 dark:border-gray-600 text-gray-400 dark:text-gray-500'}"
        role="button"
        tabindex="0"
        ondrop={handleDrop}
        ondragover={handleDragOver}
        ondragleave={handleDragLeave}
        onclick={openFilePicker}
        onkeydown={(e) => { if (e.key === 'Enter' || e.key === ' ') openFilePicker(); }}
      >
        <input
          type="file"
          accept=".pdf,.docx,.doc,.txt,.text,.md"
          class="hidden"
          bind:this={fileInputRef}
          onchange={handleFileInput}
        />
        <div class="text-center">
          <div class="flex justify-center mb-3">
            <FileUp size={48} strokeWidth={1.5} />
          </div>
          <p class="text-lg">Drop a file here to get started</p>
          <p class="text-sm mt-1 text-gray-400 dark:text-gray-500">.txt, .pdf, .docx, .doc</p>
          <button
            class="mt-4 px-5 py-2 rounded-md bg-primary-500 hover:bg-primary-600 text-white text-sm font-medium cursor-pointer border-none transition-colors"
            onclick={(e) => { e.stopPropagation(); openFilePicker(); }}
          >Upload File</button>
          {#if uploadError}
            <p class="text-sm mt-4 text-red-500 max-w-[400px] mx-auto">{uploadError}</p>
          {/if}
        </div>
      </div>
    {/if}
  </div>

  <!-- API Key Modal -->
  {#if showApiKeyModal}
    <div class="fixed inset-0 bg-black/50 flex items-center justify-center z-50 cursor-pointer" onclick={() => showApiKeyModal = false}>
      <div class="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-6 w-[400px] max-w-[90vw] shadow-xl cursor-default" onclick={(e) => e.stopPropagation()}>
        <h3 class="m-0 mb-2 text-gray-900 dark:text-gray-100 text-base font-semibold">Anthropic API Key</h3>
        <p class="m-0 mb-4 text-gray-500 dark:text-gray-400 text-sm leading-relaxed">Enter your API key to enable AI review. It will be stored in your browser's localStorage.</p>
        <input
          type="password"
          bind:value={apiKeyInput}
          placeholder="sk-ant-..."
          class="w-full px-3 py-2 bg-gray-50 dark:bg-gray-900 border border-gray-300 dark:border-gray-600 rounded-md text-gray-900 dark:text-gray-100 text-sm font-mono mb-4 focus:outline-none focus:border-primary-500 focus:ring-1 focus:ring-primary-500"
          onkeydown={(e) => { if (e.key === 'Enter') submitApiKey(); }}
        />
        <div class="flex gap-2 justify-end">
          <button class="px-4 py-2 rounded-md bg-primary-500 hover:bg-primary-600 text-white text-sm font-medium cursor-pointer border-none transition-colors" onclick={submitApiKey}>Save & Review</button>
          <button class="px-4 py-2 rounded-md border border-gray-300 dark:border-gray-600 bg-transparent text-gray-600 dark:text-gray-400 text-sm cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors" onclick={() => showApiKeyModal = false}>Cancel</button>
        </div>
      </div>
    </div>
  {/if}

  <!-- Prompt Modal -->
  {#if showPromptModal}
    <div class="fixed inset-0 bg-black/50 flex items-center justify-center z-50 cursor-pointer" onclick={cancelReview}>
      <div class="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-6 w-[700px] max-w-[90vw] max-h-[80vh] flex flex-col shadow-xl cursor-default" onclick={(e) => e.stopPropagation()}>
        <h3 class="m-0 mb-2 text-gray-900 dark:text-gray-100 text-base font-semibold">Review Prompt</h3>
        <p class="m-0 mb-4 text-gray-500 dark:text-gray-400 text-sm">Edit the prompt that will be sent to the Claude API:</p>
        {#if lastReviewTimestamp}
          <div class="mb-4 p-3 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-md">
            <p class="m-0 text-xs text-gray-500 dark:text-gray-400">
              Previous review ({new Date(lastReviewTimestamp).toLocaleString()}) returned <strong class="text-gray-700 dark:text-gray-300">{lastReviewCritiques} critique{lastReviewCritiques !== 1 ? 's' : ''}</strong> and <strong class="text-gray-700 dark:text-gray-300">{lastReviewCitations} citation{lastReviewCitations !== 1 ? 's' : ''}</strong>.
            </p>
            {#if lastReviewCritiques === 0 && lastReviewCitations === 0}
              <p class="m-0 mt-1.5 text-xs text-amber-600 dark:text-amber-400">No results were found. Consider modifying your prompt below and trying again.</p>
            {/if}
          </div>
        {/if}
        <textarea
          class="w-full min-h-[150px] mb-4 p-3 bg-gray-50 dark:bg-gray-900 border border-gray-300 dark:border-gray-600 rounded-md text-gray-900 dark:text-gray-100 text-sm leading-relaxed resize-y focus:outline-none focus:border-primary-500 focus:ring-1 focus:ring-primary-500"
          bind:value={promptPreview}
          onkeydown={(e) => { if (e.key === 'Enter' && e.metaKey) confirmReview(); }}
        ></textarea>
        <div class="flex gap-2 justify-end">
          <button class="px-4 py-2 rounded-md bg-primary-500 hover:bg-primary-600 text-white text-sm font-medium cursor-pointer border-none transition-colors" onclick={confirmReview}>Send Review</button>
          <button class="px-4 py-2 rounded-md border border-gray-300 dark:border-gray-600 bg-transparent text-gray-600 dark:text-gray-400 text-sm cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors" onclick={cancelReview}>Cancel</button>
        </div>
      </div>
    </div>
  {/if}

  <!-- Close Confirm Modal -->
  {#if showCloseConfirm}
    <div class="fixed inset-0 bg-black/50 flex items-center justify-center z-50 cursor-pointer" onclick={() => showCloseConfirm = false}>
      <div class="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-6 w-[400px] max-w-[90vw] shadow-xl cursor-default" onclick={(e) => e.stopPropagation()}>
        <h3 class="m-0 mb-2 text-gray-900 dark:text-gray-100 text-base font-semibold">Close Document</h3>
        <p class="m-0 mb-4 text-gray-500 dark:text-gray-400 text-sm leading-relaxed">This will close the document view. The session will remain in the sidebar.</p>
        <div class="flex gap-2 justify-end">
          <button class="px-4 py-2 rounded-md bg-red-600 hover:bg-red-700 text-white text-sm font-medium cursor-pointer border-none transition-colors" onclick={() => { showCloseConfirm = false; clearFile(); }}>Close Document</button>
          <button class="px-4 py-2 rounded-md border border-gray-300 dark:border-gray-600 bg-transparent text-gray-600 dark:text-gray-400 text-sm cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors" onclick={() => showCloseConfirm = false}>Cancel</button>
        </div>
      </div>
    </div>
  {/if}

  {#if reviewResultToast}
    <div class="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 px-4 py-2.5 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 border border-gray-200 dark:border-gray-700 rounded-lg shadow-xl text-sm">
      <span class="text-xs">
        Review complete: <strong>{reviewResultToast.critiques} critique{reviewResultToast.critiques !== 1 ? 's' : ''}</strong> and <strong>{reviewResultToast.citations} citation{reviewResultToast.citations !== 1 ? 's' : ''}</strong> found.
        {#if reviewResultToast.critiques === 0 && reviewResultToast.citations === 0}
          Try modifying your prompt.
        {/if}
      </span>
      <button
        class="px-2.5 py-1 text-xs font-semibold rounded border border-gray-300 dark:border-gray-600 bg-transparent text-gray-700 dark:text-gray-300 cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
        onclick={() => reviewResultToast = null}
      >Dismiss</button>
    </div>
  {/if}
</main>
