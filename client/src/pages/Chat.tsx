import { onMount, onCleanup, Show, createSignal, createEffect } from "solid-js";
import { useAuth } from "../store/auth";
import { useChat } from "../store/chat";
import { useCall } from "../store/call";
import { wsClient } from "../lib/ws";
import FriendList from "../components/FriendList";
import AddFriend from "../components/AddFriend";
import PendingRequests from "../components/PendingRequests";
import ChatWindow from "../components/ChatWindow";
import VideoCall from "../components/VideoCall";
export default function Chat() {
  const { user, token, logout } = useAuth();
  const { state, setActiveFriend, initKeys, setupListeners } = useChat();
  const { callStatus, callTargetId, setupCallListeners, startCall } = useCall();
  const [sidebarOpen, setSidebarOpen] = createSignal(true);

  // auto-open caller's chat on incoming call
  createEffect(() => {
    if (callStatus() === "incoming" && callTargetId()) {
      setActiveFriend(callTargetId()!);
      setSidebarOpen(false);
    }
  });

  let cleanupChat: (() => void) | undefined;
  let cleanupCall: (() => void) | undefined;
  const swHandler = (e: MessageEvent) => {
    if (e.data?.type === "open-chat" && e.data.friendId) {
      setActiveFriend(e.data.friendId);
      setSidebarOpen(false);
    }
  };

  onMount(async () => {
    wsClient.connect(token()!);
    await initKeys();
    cleanupChat = setupListeners();
    cleanupCall = setupCallListeners();
    if ("Notification" in window && Notification.permission === "default") {
      Notification.requestPermission();
    }
    navigator.serviceWorker?.addEventListener("message", swHandler);
  });

  onCleanup(() => {
    cleanupChat?.();
    cleanupCall?.();
    navigator.serviceWorker?.removeEventListener("message", swHandler);
    wsClient.disconnect();
  });

  return (
    <div class="chat-layout">
      <Show when={callStatus() === "calling" || callStatus() === "connected"}>
        <VideoCall />
      </Show>

      <aside class={`sidebar ${sidebarOpen() ? "open" : ""}`}>
        <div class="sidebar-header">
          <div style="display:flex;align-items:center;justify-content:space-between;">
            <h2>Whisper</h2>
            <button onClick={logout} class="btn-logout">Logout</button>
          </div>
          <div style="display:flex;flex-direction:column;gap:2px;">
            <span class="user-name">{user()?.displayName}</span>
            <span class="user-email">{user()?.email}</span>
          </div>
        </div>
        <AddFriend />
        <PendingRequests />
        <FriendList
          onSelect={(id) => { setActiveFriend(id); setSidebarOpen(false); }}
          onDeselect={() => { setActiveFriend(null); setSidebarOpen(true); }}
          activeId={state.activeFriend}
          onlineUsers={state.onlineUsers}
        />
      </aside>
      <main class="chat-main">
        <Show when={state.activeFriend} fallback={<p class="placeholder">Select a friend to chat</p>}>
          <ChatWindow
            friendId={state.activeFriend!}
            onBack={() => { setActiveFriend(null); setSidebarOpen(true); }}
            onStartCall={(id) => startCall(id)}
          />
        </Show>
      </main>
    </div>
  );
}
