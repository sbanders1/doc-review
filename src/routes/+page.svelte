<script>
  import { onMount, tick } from 'svelte';
  import PdfViewer from '$lib/PdfViewer.svelte';
  import TextViewer from '$lib/TextViewer.svelte';
  import DocxViewer from '$lib/DocxViewer.svelte';
  import MarkdownViewer from '$lib/MarkdownViewer.svelte';
  import CritiquesPane from '$lib/CritiquesPane.svelte';
  import CitationsPane from '$lib/CitationsPane.svelte';
  import ChatSidebar from '$lib/ChatSidebar.svelte';
  import Toolbar from '$lib/Toolbar.svelte';
  import { addAnnotation, deleteAnnotation, setActiveAnnotationId, clearAnnotations, getAnnotations, getAnnotationsSnapshot, restoreAnnotationsSnapshot } from '$lib/annotations.svelte.js';
  import { clearArgumentTree, getArgumentTreeSnapshot, restoreArgumentTreeSnapshot } from '$lib/argumentTree.svelte.js';
  import { detectCitationsWithLLM } from '$lib/citationReview.js';
  import { addCitationsBatch, clearCitations, getCitations, getCitationsSnapshot, restoreCitationsSnapshot } from '$lib/citations.svelte.js';
  import { clearCritiques, getCritiquesSnapshot, restoreCritiquesSnapshot } from '$lib/critiques.svelte.js';
  import { clearStyleRatings, getStyleSnapshot, restoreStyleSnapshot } from '$lib/style.svelte.js';
  import StylePane from '$lib/StylePane.svelte';
  import { clearDepositionQuestions, getDepositionSnapshot, restoreDepositionSnapshot } from '$lib/depositionPrep.svelte.js';
  import DepositionPrepPane from '$lib/DepositionPrepPane.svelte';
  import { clearTonalDrift, getTonalDriftSnapshot, restoreTonalDriftSnapshot } from '$lib/tonalDrift.svelte.js';
  import TonalDriftPane from '$lib/TonalDriftPane.svelte';
  import { extractAndStore, getExtractedText, getFormattedText, clearExtractedText, getDocumentContextSnapshot, restoreDocumentContextSnapshot } from '$lib/documentContext.svelte.js';
  import { getAdapter } from '$lib/adapters/index.js';
  import { reviewDocument, REVIEW_PROMPT_USER } from '$lib/review.js';
  import { sendMessage, DEFAULT_MODEL, migrateModelId } from '$lib/chat.js';
  import { getModel } from '$lib/model.svelte.js';
  import { getSession, putSession, deleteSessionFromDB } from '$lib/db.js';
  import { getSessions, getActiveSessionId, setActiveSessionId, loadSessionList, addSessionToList, removeSessionFromList, updateSessionMeta } from '$lib/session.svelte.js';
  import { clearHistory } from '$lib/commandHistory.svelte.js';
  import { FileUp, X, Network, Shield, BookOpen, Wand2, Gavel, LineChart, PanelLeftClose, PanelLeftOpen } from 'lucide-svelte';
  import ArgumentsTab from '$lib/ArgumentsTab.svelte';
  import CritiqueTab from '$lib/CritiqueTab.svelte';
  import EXAMPLE_MARKDOWN_SOURCE from '../../mna-argument.md?raw';
  import SAMPLE_NEGLIGENCE_REPORT from '../../negligence-grass-report.txt?raw';

  const SAMPLE_SESSION_ID = 'sample:negligence-grass';

  let fileContent = $state(null);
  let fileName = $state(null);
  let fileType = $state(null);
  let dragging = $state(false);
  let uploadError = $state(null);
  let chatCollapsed = $state(true);
  let argsPanelCollapsed = $state(false);
  let argsPanelWidth = $state(360);
  let argsSplitPct = $state(60);
  let argsPanelBodyEl = $state(null);
  let taskPanelMode = $state('arguments');

  const TASK_MODES = [
    { id: 'arguments', label: 'Arguments', icon: Network },
    { id: 'critiques', label: 'Critiques', icon: Shield },
    { id: 'citations', label: 'Citations', icon: BookOpen },
    { id: 'style', label: 'Style', icon: Wand2 },
    { id: 'deposition', label: 'Deposition Prep', icon: Gavel },
    { id: 'tonal_drift', label: 'Tonal Drift', icon: LineChart },
  ];

  function startArgsSplitResize(e) {
    e.preventDefault();
    const containerEl = argsPanelBodyEl;
    if (!containerEl) return;
    function onMouseMove(ev) {
      const rect = containerEl.getBoundingClientRect();
      const pct = ((ev.clientY - rect.top) / rect.height) * 100;
      argsSplitPct = Math.max(15, Math.min(85, pct));
    }
    function onMouseUp() {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    }
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
  }

  function startArgsResize(e) {
    e.preventDefault();
    const startX = e.clientX;
    const startWidth = argsPanelWidth;
    function onMouseMove(ev) {
      argsPanelWidth = Math.max(280, Math.min(720, startWidth + (ev.clientX - startX)));
    }
    function onMouseUp() {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    }
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
  }

  // Review state
  let reviewing = $state(false);
  let reviewError = $state(null);
  let showCloseConfirm = $state(false);
  let showPromptModal = $state(false);
  let promptPreview = $state('');

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
  let critiquesPaneRef = $state(null);
  let citationsPaneRef = $state(null);
  let chatSidebarRef = $state(null);
  let fileInputRef = $state(null);

  // Pending viewer snapshot to restore after viewer mounts
  let pendingViewerSnapshot = $state(null);
  let pendingChatSnapshot = $state(null);

  function uuid() {
    if (crypto.randomUUID) return crypto.randomUUID();
    return '10000000-1000-4000-8000-100000000000'.replace(/[018]/g, c =>
      (+c ^ crypto.getRandomValues(new Uint8Array(1))[0] & 15 >> +c / 4).toString(16)
    );
  }

  // --- Session Management ---

  // NOTE: Don't use $derived for these — call getters directly in the template
  // and inside handlers. $derived captures stale values in async callbacks (FileReader.onload).

  async function seedSampleSession() {
    const existing = await getSession(SAMPLE_SESSION_ID);
    if (existing) return;
    // Use a fixed far-past timestamp so the entry is stable across builds.
    const fixedTs = 0;
    await putSession({
      id: SAMPLE_SESSION_ID,
      name: 'Sample: Negligent Lawn Care Expert Report',
      createdAt: fixedTs,
      lastModified: fixedTs,
      fileType: 'text',
      fileContent: SAMPLE_NEGLIGENCE_REPORT,
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
  }

  onMount(async () => {
    await seedSampleSession();
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
      argumentTree: getArgumentTreeSnapshot(),
      critiques: getCritiquesSnapshot(),
      style: getStyleSnapshot(),
      deposition: getDepositionSnapshot(),
      tonalDrift: getTonalDriftSnapshot(),
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
    taskPanelMode = 'arguments';

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
    restoreArgumentTreeSnapshot(session.argumentTree || null);
    restoreCritiquesSnapshot(session.critiques || null);
    restoreStyleSnapshot(session.style || null);
    restoreDepositionSnapshot(session.deposition || null);
    restoreTonalDriftSnapshot(session.tonalDrift || null);
    restoreDocumentContextSnapshot(session.extractedText || null);

    // Set active session (triggers {#key} re-render of viewer)
    setActiveSessionId(id);

    // If this session has file content but no extracted text yet (e.g. the
    // pre-loaded sample on first open), extract it now.
    if (!session.extractedText && session.fileContent && session.fileType) {
      try {
        const data = session.fileContent instanceof Uint8Array
          ? session.fileContent
          : new TextEncoder().encode(session.fileContent);
        await extractAndStore(data, session.fileType);
      } catch (e) {
        console.error('Failed to extract text on session switch:', e);
      }
    }

    // Queue snapshots to restore after viewer/chat mount
    pendingViewerSnapshot = {
      scale: session.viewerScale ?? 1,
      scrollTop: session.scrollTop ?? 0,
      scrollLeft: session.scrollLeft ?? 0,
    };
    pendingChatSnapshot = {
      messages: session.chatMessages || [],
      selectedModel: migrateModelId(session.chatModel),
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
    clearArgumentTree();
    clearCritiques();
    clearStyleRatings();
    clearDepositionQuestions();
    clearTonalDrift();
    setActiveSessionId(null);
    reviewError = null;
    reviewResultToast = null;
  }

  async function handleDeleteSession(id) {
    if (id === SAMPLE_SESSION_ID) return; // sample session is not deletable
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
      clearArgumentTree();
      clearCritiques();
      clearStyleRatings();
      clearDepositionQuestions();
      clearTonalDrift();
      // Load next session if available
      const list = getSessions();
      if (list.length > 0) {
        await switchToSession(list[0].id);
      }
    }
  }

  let spotlightTimer;
  let activeSpotlightId = null;

  function handleFactSelect({ chunkIds, text }) {
    if (!Array.isArray(chunkIds) || chunkIds.length === 0) return;

    if (fileType === 'markdown') {
      viewerRef?.scrollToChunks?.(chunkIds);
      return;
    }

    const extractedText = getExtractedText();
    if (!extractedText) return;
    const adapter = getAdapter(fileType);
    const pageWrappers = viewerRef?.getPageWrappers() || [];
    if (!adapter || pageWrappers.length === 0) return;
    const chunkMap = new Map(extractedText.chunks.map((c) => [c.id, c]));

    let allRects = [];
    let primaryPage = 0;
    const referencedTexts = [];

    for (const chunkId of chunkIds) {
      const chunk = chunkMap.get(chunkId);
      if (!chunk) continue;
      if (!primaryPage) primaryPage = chunk.pageNumber;
      referencedTexts.push(chunk.text);
      const pageWrapper = pageWrappers[chunk.pageNumber - 1];
      if (!pageWrapper) continue;
      const found = adapter.findChunkRects(pageWrapper, chunk.text);
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

    if (allRects.length === 0) return;

    if (spotlightTimer) clearTimeout(spotlightTimer);
    if (activeSpotlightId) {
      deleteAnnotation(activeSpotlightId);
      activeSpotlightId = null;
    }

    const annotation = addAnnotation({
      pageNumber: primaryPage || 1,
      text: referencedTexts.join(' ... ') || text || '',
      rects: allRects,
      comment: text || '',
      author: 'argument-spotlight',
      priority: null,
    });
    activeSpotlightId = annotation.id;
    setActiveAnnotationId(annotation.id);
    viewerRef?.scrollToAnnotation(annotation.id);

    spotlightTimer = setTimeout(() => {
      if (activeSpotlightId) {
        deleteAnnotation(activeSpotlightId);
        activeSpotlightId = null;
      }
      spotlightTimer = null;
    }, 4000);
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
      const detectedRaw = detectFileType(new Uint8Array(rawBuffer, 0, Math.min(8192, rawBuffer.byteLength)));
      if (!detectedRaw) {
        uploadError = `"${file.name}" is not a supported file type. Please upload a PDF, Word document (.docx/.doc), or text file.`;
        return;
      }
      const detectedType = (detectedRaw === 'text' && /\.(md|markdown)$/i.test(file.name))
        ? 'markdown'
        : detectedRaw;
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
      clearArgumentTree();
      clearCritiques();
      clearStyleRatings();
      clearDepositionQuestions();
      clearTonalDrift();
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

  function loadExampleMarkdown() {
    const file = new File([EXAMPLE_MARKDOWN_SOURCE], 'mna-argument.md', { type: 'text/markdown' });
    processFile(file);
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
    clearArgumentTree();
    clearCritiques();
    clearStyleRatings();
    clearDepositionQuestions();
    clearTonalDrift();
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
    summaryLoading = true;
    summaryError = null;
    try {
      const result = await sendMessage({
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
    promptPreview = REVIEW_PROMPT_USER;
    showPromptModal = true;
  }

  function confirmReview() {
    const userPrompt = promptPreview.trim();
    showPromptModal = false;
    runReview(userPrompt);
    promptPreview = '';
  }

  function cancelReview() {
    showPromptModal = false;
    promptPreview = '';
  }

  async function runReview(userPrompt) {
    reviewing = true;
    reviewError = null;
    try {
      const extractedText = getExtractedText();
      if (!extractedText) throw new Error('No document text available. Please re-upload the file.');
      const currentModel = getModel();

      // Run review and citation detection in parallel
      const [reviewResult, citationResult] = await Promise.allSettled([
        reviewDocument(extractedText, userPrompt, currentModel),
        detectCitationsWithLLM(extractedText, currentModel),
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

      // Auto-switch task panel to show whichever results are most relevant
      if (critiqueCount > 0) {
        taskPanelMode = 'critiques';
      } else if (citationCount > 0) {
        taskPanelMode = 'citations';
      }

      saveCurrentSession();
    } catch (e) {
      console.error('Review error:', e);
      reviewError = e.message;
    } finally {
      reviewing = false;
    }
  }
</script>

<main class="h-full flex flex-col">
  <Toolbar
    sessions={getSessions()}
    activeId={getActiveSessionId()}
    sampleId={SAMPLE_SESSION_ID}
    onswitch={switchToSession}
    ondelete={handleDeleteSession}
    oncreate={handleNewSession}
  />
  <div class="flex-1 flex min-h-0">

  {#if fileContent !== null}
    <div
      class="relative bg-white dark:bg-gray-900 border-r border-gray-200 dark:border-gray-800 flex flex-col overflow-hidden {argsPanelCollapsed ? 'transition-[width,min-width] duration-200 ease-in-out' : ''}"
      style="width:{argsPanelCollapsed ? 48 : argsPanelWidth}px;min-width:{argsPanelCollapsed ? 48 : argsPanelWidth}px"
    >
      {#if !argsPanelCollapsed}
        <!-- svelte-ignore a11y_no_static_element_interactions -->
        <div class="absolute top-0 -right-[3px] w-[6px] h-full cursor-col-resize z-10 hover:bg-primary-500/30" onmousedown={startArgsResize}></div>
      {/if}
      <div class="flex items-center {argsPanelCollapsed ? 'justify-center' : 'justify-between'} gap-1 p-2">
        {#if !argsPanelCollapsed}
          <div class="flex items-center gap-1 min-w-0">
            {#each TASK_MODES as m}
              {@const isActive = taskPanelMode === m.id}
              <button
                class="flex items-center justify-center w-8 h-8 rounded-md border-none transition-colors {isActive
                  ? 'bg-primary-500/15 text-primary-600 dark:text-primary-400 cursor-pointer'
                  : 'bg-transparent text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 cursor-pointer'}"
                onclick={() => taskPanelMode = m.id}
                title={m.label}
                aria-label={m.label}
                aria-pressed={isActive}
              >
                <svelte:component this={m.icon} size={16} />
              </button>
            {/each}
          </div>
        {/if}
        <button
          class="flex items-center justify-center w-8 h-8 rounded-md bg-transparent text-gray-400 dark:text-gray-500 cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-800 hover:text-gray-600 dark:hover:text-gray-300 transition-colors shrink-0"
          onclick={() => argsPanelCollapsed = !argsPanelCollapsed}
          title={argsPanelCollapsed ? 'Expand panel' : 'Collapse panel'}
        >
          {#if argsPanelCollapsed}
            {#if taskPanelMode === 'arguments'}
              <Network size={18} />
            {:else if taskPanelMode === 'critiques'}
              <Shield size={18} />
            {:else if taskPanelMode === 'citations'}
              <BookOpen size={18} />
            {:else if taskPanelMode === 'deposition'}
              <Gavel size={18} />
            {:else if taskPanelMode === 'tonal_drift'}
              <LineChart size={18} />
            {:else}
              <Wand2 size={18} />
            {/if}
          {:else}
            <PanelLeftClose size={18} />
          {/if}
        </button>
      </div>
      {#if !argsPanelCollapsed}
        {#if taskPanelMode === 'arguments'}
          <div class="flex-1 overflow-hidden flex flex-col min-h-0" bind:this={argsPanelBodyEl}>
            <div class="min-h-0 flex flex-col" style="height:{argsSplitPct}%">
              <ArgumentsTab onfactselect={handleFactSelect} />
            </div>
            <!-- svelte-ignore a11y_no_static_element_interactions -->
            <div
              class="h-[6px] -my-[3px] z-10 cursor-row-resize hover:bg-primary-500/30 border-t border-gray-200 dark:border-gray-800"
              onmousedown={startArgsSplitResize}
            ></div>
            <div class="min-h-0 flex flex-col flex-1" style="height:{100 - argsSplitPct}%">
              <CritiqueTab />
            </div>
          </div>
        {:else if taskPanelMode === 'critiques'}
          <CritiquesPane bind:this={critiquesPaneRef} onselect={(id) => viewerRef?.scrollToAnnotation(id)} />
        {:else if taskPanelMode === 'citations'}
          <CitationsPane bind:this={citationsPaneRef} oncitationselect={(id) => viewerRef?.scrollToAnnotation(id)} />
        {:else if taskPanelMode === 'style'}
          <StylePane />
        {:else if taskPanelMode === 'deposition'}
          <DepositionPrepPane />
        {:else if taskPanelMode === 'tonal_drift'}
          <TonalDriftPane />
        {/if}
      {/if}
    </div>
  {/if}

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
              <PdfViewer data={fileContent} bind:this={viewerRef} onAnnotationClick={(id) => { taskPanelMode = 'critiques'; tick().then(() => critiquesPaneRef?.scrollToComment(id)); }} onCitationClick={(id) => { taskPanelMode = 'citations'; tick().then(() => citationsPaneRef?.scrollToCitation(id)); }} onready={handlePdfReady} />
            {:else if fileType === 'docx'}
              <DocxViewer content={fileContent} bind:this={viewerRef} onAnnotationClick={(id) => { taskPanelMode = 'critiques'; tick().then(() => critiquesPaneRef?.scrollToComment(id)); }} onCitationClick={(id) => { taskPanelMode = 'citations'; tick().then(() => citationsPaneRef?.scrollToCitation(id)); }} />
            {:else if fileType === 'markdown'}
              <MarkdownViewer content={fileContent} bind:this={viewerRef} onAnnotationClick={(id) => { taskPanelMode = 'critiques'; tick().then(() => critiquesPaneRef?.scrollToComment(id)); }} onCitationClick={(id) => { taskPanelMode = 'citations'; tick().then(() => citationsPaneRef?.scrollToCitation(id)); }} />
            {:else}
              <TextViewer content={fileContent} bind:this={viewerRef} onAnnotationClick={(id) => { taskPanelMode = 'critiques'; tick().then(() => critiquesPaneRef?.scrollToComment(id)); }} onCitationClick={(id) => { taskPanelMode = 'citations'; tick().then(() => citationsPaneRef?.scrollToCitation(id)); }} />
            {/if}
          {/key}
          <ChatSidebar bind:collapsed={chatCollapsed} bind:this={chatSidebarRef} />
        </div>
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
          accept=".pdf,.docx,.doc,.txt,.text,.md,.markdown"
          class="hidden"
          bind:this={fileInputRef}
          onchange={handleFileInput}
        />
        <div class="text-center">
          <div class="flex justify-center mb-3">
            <FileUp size={48} strokeWidth={1.5} />
          </div>
          <p class="text-lg">Drop a file here to get started</p>
          <p class="text-sm mt-1 text-gray-400 dark:text-gray-500">.txt, .md, .pdf, .docx, .doc</p>
          <div class="mt-4 flex justify-center gap-2">
            <button
              class="px-5 py-2 rounded-md bg-primary-500 hover:bg-primary-600 text-white text-sm font-medium cursor-pointer border-none transition-colors"
              onclick={(e) => { e.stopPropagation(); openFilePicker(); }}
            >Upload File</button>
            <button
              class="px-5 py-2 rounded-md bg-transparent hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-600 dark:text-gray-300 text-sm font-medium cursor-pointer border border-gray-300 dark:border-gray-600 transition-colors"
              onclick={(e) => { e.stopPropagation(); loadExampleMarkdown(); }}
            >+ Example Markdown</button>
          </div>
          {#if uploadError}
            <p class="text-sm mt-4 text-red-500 max-w-[400px] mx-auto">{uploadError}</p>
          {/if}
        </div>
      </div>
    {/if}
  </div>
  </div>

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
