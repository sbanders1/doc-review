<script>
  import { tick } from 'svelte';
  import { marked } from 'marked';
  import { ChevronUp, ChevronDown, Send, MessageSquare } from 'lucide-svelte';
  import { sendMessage } from './chat.js';
  import { getFormattedText } from './documentContext.svelte.js';
  import { getModel } from './model.svelte.js';

  marked.setOptions({ breaks: true, gfm: true });

  let { collapsed = $bindable(false) } = $props();

  let messages = $state([]);
  let inputText = $state('');
  let streaming = $state(false);
  let error = $state(null);
  let selectedModel = $derived(getModel());
  let messageListEl;
  let panelHeight = $state(320);

  function startResize(e) {
    e.preventDefault();
    const startY = e.clientY;
    const startHeight = panelHeight;
    function onMouseMove(e) {
      panelHeight = Math.max(150, Math.min(600, startHeight - (e.clientY - startY)));
    }
    function onMouseUp() {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    }
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
  }

  function scrollToBottom() {
    tick().then(() => {
      if (messageListEl) {
        messageListEl.scrollTop = messageListEl.scrollHeight;
      }
    });
  }

  async function handleSend() {
    const text = inputText.trim();
    if (!text || streaming) return;

    error = null;
    inputText = '';

    messages = [...messages, { role: 'user', content: text }];
    scrollToBottom();

    messages = [...messages, { role: 'assistant', content: '' }];
    streaming = true;

    try {
      const apiMessages = messages.slice(0, -1).map((m) => ({
        role: m.role,
        content: m.content,
      }));

      const fullText = await sendMessage({
        model: selectedModel,
        messages: apiMessages,
        documentText: getFormattedText(),
        onChunk(text) {
          messages = messages.map((m, i) =>
            i === messages.length - 1 ? { ...m, content: text } : m
          );
          scrollToBottom();
        },
      });

      messages = messages.map((m, i) =>
        i === messages.length - 1 ? { ...m, content: fullText } : m
      );
    } catch (e) {
      console.error('Chat error:', e);
      error = e.message;
      messages = messages.filter((_, i) => i !== messages.length - 1);
    } finally {
      streaming = false;
      scrollToBottom();
    }
  }

  export function clearChat() {
    messages = [];
    error = null;
  }

  export function getChatSnapshot() {
    return { messages: [...messages], selectedModel };
  }

  export function restoreChatSnapshot(snapshot) {
    // Note: don't restore selectedModel from the snapshot. The model is a
    // global user preference (model.svelte.js + localStorage), not a per-
    // session attribute — overwriting it on session switch leaks the
    // session's saved choice into the global selector.
    if (!snapshot) {
      messages = [];
      return;
    }
    messages = snapshot.messages || [];
  }
</script>

{#if collapsed}
  <button
    class="flex items-center gap-2 w-full px-4 py-3 border-none border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 text-gray-400 dark:text-gray-500 cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-800 hover:text-gray-600 dark:hover:text-gray-300 transition-colors text-sm"
    onclick={() => collapsed = false}
    title="Show chat"
  >
    <MessageSquare size={14} />
    <span>Chat with AI</span>
    <ChevronUp size={16} class="ml-auto" />
  </button>
{:else}
  <div class="relative w-full bg-gray-50 dark:bg-gray-900 border-t border-gray-200 dark:border-gray-700 flex flex-col overflow-hidden" style="height:{panelHeight}px;min-height:{panelHeight}px">
    <!-- Resize handle at top -->
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div class="absolute top-0 left-0 w-full h-[6px] cursor-row-resize z-10 hover:bg-primary-500/30" onmousedown={startResize}></div>

    <div class="flex items-center justify-between px-4 py-2 border-b border-gray-200 dark:border-gray-700">
      <h3 class="m-0 text-sm font-semibold text-gray-900 dark:text-gray-100">Chat</h3>
      <div class="flex items-center gap-2">
        <button
          class="px-2 py-0.5 text-xs rounded border border-gray-200 dark:border-gray-600 bg-transparent text-gray-400 dark:text-gray-500 cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-800 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
          onclick={clearChat}
          title="Clear chat"
        >Clear</button>
        <button
          class="flex items-center justify-center w-7 h-7 rounded-md border border-gray-200 dark:border-gray-600 bg-transparent text-gray-400 dark:text-gray-500 cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-800 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
          onclick={() => collapsed = true}
          title="Hide chat"
        >
          <ChevronDown size={16} />
        </button>
      </div>
    </div>

    <div class="flex-1 overflow-y-auto p-2 flex flex-col gap-2" bind:this={messageListEl}>
      {#if messages.length === 0}
        <div class="px-4 py-6 text-center text-gray-400 dark:text-gray-500 text-sm">
          <p>Ask questions about the document.</p>
        </div>
      {/if}
      {#each messages as msg, i (i)}
        <div class="p-2.5 rounded-lg {msg.role === 'user' ? 'bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700' : 'bg-gray-100 dark:bg-gray-800/50 border border-gray-100 dark:border-gray-700/50'}">
          <div class="text-[0.65rem] font-semibold uppercase tracking-wider mb-1 {msg.role === 'user' ? 'text-primary-500' : 'text-green-500'}">
            {msg.role === 'user' ? 'You' : 'Claude'}
          </div>
          <div class="text-sm text-gray-700 dark:text-gray-300 leading-relaxed break-words {msg.role === 'user' ? 'whitespace-pre-wrap' : ''}">
            {#if msg.content}
              {#if msg.role === 'assistant'}
                <div class="markdown-content">{@html marked(msg.content)}</div>
              {:else}
                {msg.content}
              {/if}
            {:else if streaming && i === messages.length - 1}
              <span class="text-gray-400 italic">Thinking...</span>
            {/if}
          </div>
        </div>
      {/each}
    </div>

    {#if error}
      <div class="px-3 py-1.5 text-xs text-red-500 bg-red-500/5 border-t border-gray-200 dark:border-gray-700">{error}</div>
    {/if}

    <div class="border-t border-gray-200 dark:border-gray-700 p-2 flex flex-col gap-1.5">
      <div class="flex gap-1.5 items-end">
        <textarea
          bind:value={inputText}
          placeholder="Ask about the document..."
          disabled={streaming}
          class="flex-1 min-h-[40px] max-h-[120px] p-2 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded text-sm text-gray-900 dark:text-gray-100 resize-y focus:outline-none focus:border-primary-500 disabled:opacity-50"
          onkeydown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); }
          }}
        ></textarea>
        <button
          class="flex items-center justify-center w-9 h-9 rounded-md bg-primary-500 border-none text-white cursor-pointer shrink-0 hover:bg-primary-600 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          onclick={handleSend}
          disabled={streaming || !inputText.trim()}
        >
          <Send size={16} />
        </button>
      </div>
    </div>
  </div>
{/if}
