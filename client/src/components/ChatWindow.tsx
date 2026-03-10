import { createSignal, For, createEffect, onMount, Show } from "solid-js";
import { useChat } from "../store/chat";
import { useCall } from "../store/call";

export default function ChatWindow(props: { friendId: number; onBack: () => void; onStartCall?: (friendId: number) => void }) {
  const { state, sendMessage, loadHistory } = useChat();
  const { callStatus, callTargetId, acceptCall, rejectCall } = useCall();
  const [input, setInput] = createSignal("");
  const [error, setError] = createSignal("");
  const [loadingMore, setLoadingMore] = createSignal(false);
  let messagesEnd: HTMLDivElement | undefined;
  let messagesContainer: HTMLDivElement | undefined;
  let shouldScrollToBottom = true;

  const messages = () => state.conversations[props.friendId] || [];

  createEffect(() => {
    shouldScrollToBottom = true;
    loadHistory(props.friendId);
  });

  createEffect(() => {
    messages();
    if (!messagesContainer) return;
    if (shouldScrollToBottom) {
      requestAnimationFrame(() => messagesEnd?.scrollIntoView());
      return;
    }
    const { scrollTop, scrollHeight, clientHeight } = messagesContainer;
    if (scrollHeight - scrollTop - clientHeight < 150) {
      messagesEnd?.scrollIntoView({ behavior: "smooth" });
    }
  });

  function handleScroll() {
    if (!messagesContainer) return;
    const { scrollTop, scrollHeight, clientHeight } = messagesContainer;
    shouldScrollToBottom = scrollHeight - scrollTop - clientHeight < 150;
    if (scrollTop < 50) loadOlder();
  }

  async function loadOlder() {
    if (!messagesContainer || loadingMore()) return;
    if (state.hasMore[props.friendId] === false) return;
    const msgs = messages();
    if (!msgs.length) return;
    const oldestId = msgs[0].id;
    const prevHeight = messagesContainer.scrollHeight;
    setLoadingMore(true);
    await loadHistory(props.friendId, oldestId);
    setLoadingMore(false);
    requestAnimationFrame(() => {
      if (messagesContainer) {
        messagesContainer.scrollTop = messagesContainer.scrollHeight - prevHeight;
      }
    });
  }

  async function handleSend(e: Event) {
    e.preventDefault();
    const text = input().trim();
    if (!text) return;
    setInput("");
    setError("");
    try {
      await sendMessage(props.friendId, text);
    } catch (err: any) {
      setError(err.message);
    }
  }

  function handleKeyDown(e: KeyboardEvent) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend(e);
    }
  }

  return (
    <div class="chat-window">
      <div class="chat-header">
        <button class="btn-back" onClick={props.onBack}>
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 10H5M5 10l5-5M5 10l5 5"/></svg>
        </button>
        <h3>Chat</h3>
        <button class="btn-call" onClick={() => props.onStartCall?.(props.friendId)}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align: -2px; margin-right: 6px;"><path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07 19.5 19.5 0 01-6-6A19.79 19.79 0 012.12 4.18 2 2 0 014.11 2h3a2 2 0 012 1.72 12.84 12.84 0 00.7 2.81 2 2 0 01-.45 2.11L8.09 9.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45 12.84 12.84 0 002.81.7A2 2 0 0122 16.92z"/></svg>
          Call
        </button>
      </div>

      <Show when={callStatus() === "incoming" && callTargetId() === props.friendId}>
        <div class="chat-call-banner">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07 19.5 19.5 0 01-6-6A19.79 19.79 0 012.12 4.18 2 2 0 014.11 2h3a2 2 0 012 1.72 12.84 12.84 0 00.7 2.81 2 2 0 01-.45 2.11L8.09 9.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45 12.84 12.84 0 002.81.7A2 2 0 0122 16.92z"/></svg>
          <span>Incoming call</span>
          <button class="call-btn accept" onClick={acceptCall}>Accept</button>
          <button class="call-btn end" onClick={rejectCall}>Decline</button>
        </div>
      </Show>
      <div class="messages" ref={messagesContainer} onScroll={handleScroll}>
        <Show when={loadingMore()}>
          <div class="loading-more">Loading...</div>
        </Show>
        <For each={messages()}>
          {(msg) => (
            <div class={`message ${msg.from === 0 ? "sent" : "received"}`}>
              <div class="message-bubble">
                <p>{msg.text}</p>
                <span class="message-time">
                  {new Date(msg.timestamp * 1000).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                </span>
              </div>
            </div>
          )}
        </For>
        <div ref={messagesEnd} />
      </div>

      {error() && <p class="error" style="padding: 8px 16px">{error()}</p>}
      <form class="chat-input" onSubmit={handleSend}>
        <textarea
          placeholder="Type a message..."
          value={input()}
          onInput={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          rows={1}
        />
        <button type="submit">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/></svg>
        </button>
      </form>
    </div>
  );
}
