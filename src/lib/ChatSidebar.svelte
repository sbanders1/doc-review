<script>
  import { tick } from 'svelte';
  import { sendMessage, AVAILABLE_MODELS, DEFAULT_MODEL } from './chat.js';
  import { getFormattedText } from './documentContext.svelte.js';

  let { collapsed = $bindable(false), apiKey = '' } = $props();

  let messages = $state([]);       // [{role, content}]
  let inputText = $state('');
  let streaming = $state(false);
  let error = $state(null);
  let selectedModel = $state(DEFAULT_MODEL);
  let messageListEl;

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

    // Add user message
    messages = [...messages, { role: 'user', content: text }];
    scrollToBottom();

    // Add placeholder for assistant response
    messages = [...messages, { role: 'assistant', content: '' }];
    streaming = true;

    try {
      // Build the API messages (exclude the empty assistant placeholder)
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
          // Update the last message (assistant placeholder) with streamed text
          messages = messages.map((m, i) =>
            i === messages.length - 1 ? { ...m, content: text } : m
          );
          scrollToBottom();
        },
      });

      // Final update
      messages = messages.map((m, i) =>
        i === messages.length - 1 ? { ...m, content: fullText } : m
      );
    } catch (e) {
      console.error('Chat error:', e);
      error = e.message;
      // Remove the empty assistant placeholder on error
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
</script>

{#if collapsed}
  <button class="expand-btn" onclick={() => collapsed = false} title="Show chat">
    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <polyline points="9 18 15 12 9 6"/>
    </svg>
  </button>
{:else}
  <div class="sidebar">
    <div class="sidebar-header">
      <h3>Chat</h3>
      <div class="header-right">
        <button class="header-btn" onclick={clearChat} title="Clear chat">Clear</button>
        <button class="collapse-btn" onclick={() => collapsed = true} title="Hide chat">
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="15 18 9 12 15 6"/>
          </svg>
        </button>
      </div>
    </div>

    <div class="message-list" bind:this={messageListEl}>
      {#if messages.length === 0}
        <div class="empty">
          <p>Ask questions about the document.</p>
        </div>
      {/if}
      {#each messages as msg, i (i)}
        <div class="message" class:user={msg.role === 'user'} class:assistant={msg.role === 'assistant'}>
          <div class="message-role">{msg.role === 'user' ? 'You' : 'Claude'}</div>
          <div class="message-content">
            {#if msg.content}
              {msg.content}
            {:else if streaming && i === messages.length - 1}
              <span class="typing">Thinking...</span>
            {/if}
          </div>
        </div>
      {/each}
    </div>

    {#if error}
      <div class="chat-error">{error}</div>
    {/if}

    <div class="input-area">
      <div class="model-selector">
        <select bind:value={selectedModel}>
          {#each AVAILABLE_MODELS as model}
            <option value={model.id}>{model.label}</option>
          {/each}
        </select>
      </div>
      <div class="input-row">
        <textarea
          bind:value={inputText}
          placeholder="Ask about the document..."
          disabled={streaming}
          onkeydown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); }
          }}
        ></textarea>
        <button class="send-btn" onclick={handleSend} disabled={streaming || !inputText.trim()}>
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <line x1="22" y1="2" x2="11" y2="13"/>
            <polygon points="22 2 15 22 11 13 2 9 22 2"/>
          </svg>
        </button>
      </div>
    </div>
  </div>
{/if}

<style>
  .sidebar {
    width: 350px;
    min-width: 350px;
    background: #13132a;
    border-right: 1px solid #2a2a4a;
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }

  .sidebar-header {
    padding: 12px 16px;
    border-bottom: 1px solid #2a2a4a;
    display: flex;
    align-items: center;
    justify-content: space-between;
  }

  .sidebar-header h3 {
    margin: 0;
    font-size: 0.95rem;
    color: #ddd;
  }

  .header-right {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .header-btn {
    padding: 2px 8px;
    font-size: 0.75rem;
    border-radius: 3px;
    border: 1px solid #333;
    background: transparent;
    color: #888;
    cursor: pointer;
  }

  .header-btn:hover {
    background: #2a2a4a;
    color: #ccc;
  }

  .collapse-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 28px;
    height: 28px;
    padding: 0;
    border-radius: 4px;
    border: 1px solid #333;
    background: transparent;
    color: #888;
    cursor: pointer;
  }

  .collapse-btn:hover {
    background: #2a2a4a;
    color: #ccc;
  }

  .expand-btn {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 4px;
    padding: 8px 6px;
    border: none;
    border-right: 1px solid #2a2a4a;
    background: #13132a;
    color: #888;
    cursor: pointer;
  }

  .expand-btn:hover {
    background: #1a1a35;
    color: #ccc;
  }

  .message-list {
    flex: 1;
    overflow-y: auto;
    padding: 8px;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .empty {
    padding: 24px 16px;
    text-align: center;
    color: #666;
    font-size: 0.85rem;
  }

  .message {
    padding: 8px 10px;
    border-radius: 6px;
  }

  .message.user {
    background: #1e1e3a;
    border: 1px solid #2a2a4a;
  }

  .message.assistant {
    background: #141428;
    border: 1px solid #222244;
  }

  .message-role {
    font-size: 0.7rem;
    font-weight: 600;
    color: #888;
    margin-bottom: 4px;
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }

  .message.user .message-role {
    color: #646cff;
  }

  .message.assistant .message-role {
    color: #4ade80;
  }

  .message-content {
    font-size: 0.85rem;
    color: #ccc;
    line-height: 1.5;
    white-space: pre-wrap;
    word-wrap: break-word;
  }

  .typing {
    color: #666;
    font-style: italic;
  }

  .chat-error {
    padding: 6px 12px;
    font-size: 0.8rem;
    color: #f87171;
    background: #1a1a2e;
    border-top: 1px solid #2a2a4a;
  }

  .input-area {
    border-top: 1px solid #2a2a4a;
    padding: 8px;
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .model-selector select {
    width: 100%;
    padding: 4px 8px;
    background: #0d0d1a;
    border: 1px solid #333;
    border-radius: 4px;
    color: #aaa;
    font-size: 0.75rem;
    cursor: pointer;
  }

  .model-selector select:focus {
    outline: none;
    border-color: #646cff;
  }

  .input-row {
    display: flex;
    gap: 6px;
    align-items: flex-end;
  }

  .input-row textarea {
    flex: 1;
    min-height: 40px;
    max-height: 120px;
    padding: 8px;
    background: #0d0d1a;
    border: 1px solid #333;
    border-radius: 4px;
    color: #ddd;
    font-size: 0.85rem;
    font-family: inherit;
    resize: vertical;
  }

  .input-row textarea:focus {
    outline: none;
    border-color: #646cff;
  }

  .input-row textarea:disabled {
    opacity: 0.5;
  }

  .send-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 36px;
    height: 36px;
    padding: 0;
    border-radius: 4px;
    border: 1px solid #646cff;
    background: #646cff;
    color: white;
    cursor: pointer;
    flex-shrink: 0;
  }

  .send-btn:hover:not(:disabled) {
    background: #535bf2;
  }

  .send-btn:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }
</style>
