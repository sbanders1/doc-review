<script>
  import { tick } from 'svelte';
  import { marked } from 'marked';
  import { ChevronLeft, ChevronRight, Send, Eraser } from 'lucide-svelte';
  import { sendMessage, DEFAULT_MODEL } from './chat.js';
  import { getFormattedText } from './documentContext.svelte.js';
  import { getModel } from './model.svelte.js';

  marked.setOptions({ breaks: true, gfm: true });

  let { collapsed = $bindable(false), apiKey = '' } = $props();

  let messages = $state([]);
  let inputText = $state('');
  let streaming = $state(false);
  let error = $state(null);
  let selectedModel = $derived(getModel());
  let messageListEl;
  let sidebarWidth = $state(350);

  function startResize(e) {
    e.preventDefault();
    const startX = e.clientX;
    const startWidth = sidebarWidth;
    function onMouseMove(e) {
      sidebarWidth = Math.max(200, Math.min(800, startWidth + (e.clientX - startX)));
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

    if (!apiKey) {
      error = 'No API key set. Click Review to configure one.';
      return;
    }

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
        apiKey,
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
    if (!snapshot) {
      messages = [];
      selectedModel = DEFAULT_MODEL;
      return;
    }
    messages = snapshot.messages || [];
    selectedModel = snapshot.selectedModel || DEFAULT_MODEL;
  }
</script>

{#if collapsed}
  <button
    class="flex flex-col items-center gap-1 py-2 px-1.5 border-none border-r border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 text-gray-400 dark:text-gray-500 cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-800 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
    onclick={() => collapsed = false}
    title="Show chat"
  >
    <ChevronRight size={18} />
  </button>
{:else}
  <div class="relative bg-gray-50 dark:bg-gray-900 border-r border-gray-200 dark:border-gray-700 flex flex-col overflow-hidden" style="width:{sidebarWidth}px;min-width:{sidebarWidth}px">
    <div class="flex items-center justify-between px-4 py-3 border-b border-gray-200 dark:border-gray-700">
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
          <ChevronLeft size={16} />
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
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div class="absolute top-0 -right-[3px] w-[6px] h-full cursor-col-resize z-10 hover:bg-primary-500/30" onmousedown={startResize}></div>
  </div>
{/if}
