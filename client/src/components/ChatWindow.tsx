import { createSignal, For, createEffect, Show, onCleanup } from "solid-js";
import { useChat } from "../store/chat";
import { useCall } from "../store/call";

export default function ChatWindow(props: { friendId: number; onBack: () => void; onStartCall?: (friendId: number) => void }) {
  const { state, sendMessage, sendTyping, loadHistory } = useChat();
  const { callStatus, callTargetId, acceptCall, rejectCall } = useCall();
  const [input, setInput] = createSignal("");
  const [error, setError] = createSignal("");
  const [loadingMore, setLoadingMore] = createSignal(false);
  let messagesEnd: HTMLDivElement | undefined;
  let messagesContainer: HTMLDivElement | undefined;
  let shouldScrollToBottom = true;
  let typingTimer: ReturnType<typeof setTimeout> | undefined;

  function handleInput() {
    sendTyping(props.friendId, true);
    clearTimeout(typingTimer);
    typingTimer = setTimeout(() => sendTyping(props.friendId, false), 2000);
  }

  onCleanup(() => {
    clearTimeout(typingTimer);
    sendTyping(props.friendId, false);
  });

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
    <div class="flex flex-col h-full w-full">
      {/* Header */}
      <div class="flex items-center gap-3 px-5 py-4 bg-white shadow-sm relative z-[2]">
        <button
          class="sm:hidden flex items-center justify-center w-11 h-11 rounded-[10px] text-gray-500 hover:bg-surface-2 transition-colors"
          onClick={props.onBack}
        >
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 10H5M5 10l5-5M5 10l5 5"/></svg>
        </button>
        <h3 class="font-semibold text-[1.0625rem] text-gray-900">Chat</h3>
        <button
          class="ml-auto flex items-center px-4 py-2 bg-green-500 hover:opacity-90 text-white rounded-full font-semibold text-sm font-[inherit] cursor-pointer min-h-[40px] transition-opacity"
          onClick={() => props.onStartCall?.(props.friendId)}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align: -2px; margin-right: 6px;"><path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07 19.5 19.5 0 01-6-6A19.79 19.79 0 012.12 4.18 2 2 0 014.11 2h3a2 2 0 012 1.72 12.84 12.84 0 00.7 2.81 2 2 0 01-.45 2.11L8.09 9.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45 12.84 12.84 0 002.81.7A2 2 0 0122 16.92z"/></svg>
          Call
        </button>
      </div>

      {/* Incoming call banner */}
      <Show when={callStatus() === "incoming" && callTargetId() === props.friendId}>
        <div class="flex items-center gap-2.5 px-5 py-2.5 bg-success-soft text-gray-900 font-medium text-[0.9375rem] border-b border-gray-200 animate-pulse-bg">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07 19.5 19.5 0 01-6-6A19.79 19.79 0 012.12 4.18 2 2 0 014.11 2h3a2 2 0 012 1.72 12.84 12.84 0 00.7 2.81 2 2 0 01-.45 2.11L8.09 9.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45 12.84 12.84 0 002.81.7A2 2 0 0122 16.92z"/></svg>
          <span>Incoming call</span>
          <button class="ml-auto px-4 py-1.5 bg-green-500 hover:opacity-90 text-white rounded-[10px] text-sm font-medium font-[inherit] cursor-pointer min-h-[32px] transition-opacity" onClick={acceptCall}>Accept</button>
          <button class="px-4 py-1.5 bg-red-500 hover:opacity-90 text-white rounded-[10px] text-sm font-medium font-[inherit] cursor-pointer min-h-[32px] transition-opacity" onClick={rejectCall}>Decline</button>
        </div>
      </Show>

      {/* Messages */}
      <div class="flex-1 overflow-y-auto p-5 flex flex-col gap-2 bg-chat-bg messages-scroll" ref={messagesContainer} onScroll={handleScroll}>
        <Show when={loadingMore()}>
          <div class="text-center text-gray-400 text-sm py-2">Loading...</div>
        </Show>
        <For each={messages()}>
          {(msg) => (
            <div class={`flex ${msg.from === 0 ? "justify-end" : "justify-start"}`}>
              <div class={`px-4 py-2.5 rounded-2xl max-w-[70%] ${msg.from === 0 ? "bg-primary text-white rounded-br-[4px]" : "bg-chat-surface text-gray-900 rounded-bl-[4px] shadow-sm"}`}>
                <p class="text-[0.9375rem] leading-relaxed whitespace-pre-wrap break-words">{msg.text}</p>
                <span class={`text-[0.7rem] mt-1 block ${msg.from === 0 ? "text-white/70 text-right" : "text-gray-400"}`}>
                  {new Date(msg.timestamp * 1000).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                </span>
              </div>
            </div>
          )}
        </For>
        <Show when={state.typingUsers[props.friendId]}>
          <div class="flex gap-1 items-center px-3 py-2.5 bg-chat-surface rounded-[14px] rounded-bl-[4px] w-fit mb-2 ml-1">
            <span class="w-1.5 h-1.5 rounded-full bg-gray-400 animate-bounce-dot" />
            <span class="w-1.5 h-1.5 rounded-full bg-gray-400 animate-bounce-dot dot-delay-1" />
            <span class="w-1.5 h-1.5 rounded-full bg-gray-400 animate-bounce-dot dot-delay-2" />
          </div>
        </Show>
        <div ref={messagesEnd} />
      </div>

      {/* Error */}
      {error() && <p class="text-red-500 text-sm px-4 py-2">{error()}</p>}

      {/* Input */}
      <form class="flex items-end gap-3 px-4 py-3 bg-white border-t border-gray-200" onSubmit={handleSend}>
        <textarea
          class="flex-1 px-4 py-3 bg-surface-2 border border-transparent rounded-[10px] text-gray-900 text-[0.9375rem] font-[inherit] outline-none resize-none field-sizing-content min-h-[44px] max-h-32 transition-all placeholder:text-gray-400 focus:border-primary focus:ring-[3px] focus:ring-primary/50"
          placeholder="Type a message..."
          value={input()}
          onInput={(e) => { setInput(e.target.value); handleInput(); }}
          onKeyDown={handleKeyDown}
        />
        <button
          class="flex-shrink-0 w-11 h-11 bg-primary hover:bg-primary-hover text-white rounded-full flex items-center justify-center cursor-pointer transition-colors"
          type="submit"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/></svg>
        </button>
      </form>
    </div>
  );
}
