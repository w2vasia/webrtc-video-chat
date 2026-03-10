import { onMount, Show, createSignal } from "solid-js";
import { useAuth } from "../store/auth";
import { useChat } from "../store/chat";
import { wsClient } from "../lib/ws";
import FriendList from "../components/FriendList";
import AddFriend from "../components/AddFriend";
import PendingRequests from "../components/PendingRequests";
import ChatWindow from "../components/ChatWindow";

export default function Chat() {
  const { user, token, logout } = useAuth();
  const { state, setActiveFriend, initKeys, setupListeners } = useChat();
  const [sidebarOpen, setSidebarOpen] = createSignal(true);

  onMount(async () => {
    wsClient.connect(token()!);
    await initKeys();
    setupListeners();
  });

  return (
    <div class="chat-layout">
      <aside class={`sidebar ${sidebarOpen() ? "open" : ""}`}>
        <div class="sidebar-header">
          <h2>Whisper</h2>
          <span class="user-name">{user()?.displayName}</span>
          <button onClick={logout} class="btn-logout">Logout</button>
        </div>
        <AddFriend />
        <PendingRequests />
        <FriendList
          onSelect={(id) => { setActiveFriend(id); setSidebarOpen(false); }}
          activeId={state.activeFriend}
        />
      </aside>
      <main class="chat-main">
        <Show when={state.activeFriend} fallback={<p class="placeholder">Select a friend to chat</p>}>
          <ChatWindow
            friendId={state.activeFriend!}
            onBack={() => { setActiveFriend(null); setSidebarOpen(true); }}
          />
        </Show>
      </main>
    </div>
  );
}
