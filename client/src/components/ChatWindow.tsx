import { createSignal, For, createEffect, onMount } from "solid-js";
import { useChat } from "../store/chat";

export default function ChatWindow(props: { friendId: number; onBack: () => void; onStartCall?: (friendId: number) => void }) {
  const { state, sendMessage, loadHistory } = useChat();
  const [input, setInput] = createSignal("");
  const [error, setError] = createSignal("");
  let messagesEnd: HTMLDivElement | undefined;

  const messages = () => state.conversations[props.friendId] || [];

  createEffect(() => {
    loadHistory(props.friendId);
  });

  createEffect(() => {
    messages();
    messagesEnd?.scrollIntoView({ behavior: "smooth" });
  });

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
        <button class="btn-back" onClick={props.onBack}>&#8592;</button>
        <span>Chat</span>
        <button class="btn-call" onClick={() => props.onStartCall?.(props.friendId)}>Call</button>
      </div>

      <div class="messages">
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
        <button type="submit">Send</button>
      </form>
    </div>
  );
}
