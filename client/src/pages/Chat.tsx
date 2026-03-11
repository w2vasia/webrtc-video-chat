import { onMount, onCleanup, Show, createSignal, createEffect } from "solid-js";
import { useAuth } from "../store/auth";
import { useChat } from "../store/chat";
import { useCall } from "../store/call";
import { wsClient, wsConnected, wsEverConnected } from "../lib/ws";
import FriendList from "../components/FriendList";
import AddFriend from "../components/AddFriend";
import PendingRequests from "../components/PendingRequests";
import ChatWindow from "../components/ChatWindow";
import VideoCall from "../components/VideoCall";
import IncomingCall from "../components/IncomingCall";
import { ToastContainer } from "../components/Toast";


export default function Chat() {
  const { user, token, logout } = useAuth();
  const { state, setActiveFriend, initKeys, setupListeners } = useChat();
  const { callStatus, callTargetId, setupCallListeners, startCall } = useCall();
  const [sidebarOpen, setSidebarOpen] = createSignal(true);

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
    await initKeys();
    cleanupChat = setupListeners();
    cleanupCall = setupCallListeners();
    wsClient.connect(token()!);
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
    <div class="flex h-[100dvh]">
      <ToastContainer />

      <Show when={callStatus() === "calling" || callStatus() === "connecting" || callStatus() === "connected" || callStatus() === "ended"}>
        <VideoCall />
      </Show>

      <Show when={callStatus() === "incoming"}>
        <IncomingCall />
      </Show>

      {/* Sidebar */}
      <aside class={`flex flex-col flex-shrink-0 w-80 bg-white border-r border-gray-200 fixed inset-y-0 left-0 z-10 sm:static sm:z-auto transition-transform sm:transition-none ${sidebarOpen() ? "translate-x-0" : "-translate-x-full sm:translate-x-0"}`}>
        <div class="px-4 pt-5 pb-4 border-b border-gray-200 flex flex-col gap-2">
          <div class="flex items-center justify-between">
            <div class="flex items-center gap-2">
              <h2 class="text-primary text-xl font-semibold">Whisper</h2>
              <span class="flex items-center gap-1.5">
                <span class={`w-2.5 h-2.5 rounded-full transition-colors ${wsConnected() ? "bg-success" : "bg-danger animate-pulse-dot"}`} />
                {!wsConnected() && wsEverConnected() && <span class="text-xs text-danger font-medium">Reconnecting…</span>}
              </span>
            </div>
            <button
              class="px-3.5 py-1.5 bg-surface-2 hover:bg-surface-3 text-gray-500 hover:text-gray-900 rounded-[10px] text-sm font-medium font-[inherit] cursor-pointer transition-colors min-h-[36px]"
              onClick={logout}
            >
              Logout
            </button>
          </div>
          <div class="flex flex-col gap-0.5">
            <span class="font-semibold text-[0.9375rem] text-gray-900">{user()?.displayName}</span>
            <span class="text-[0.8125rem] text-gray-400">{user()?.email}</span>
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

      {/* Main */}
      <main class="flex-1 flex items-center justify-center bg-page min-w-0">
        <Show when={state.activeFriend} fallback={<p class="text-gray-400 text-[0.9375rem]">Select a friend to chat</p>}>
          <ChatWindow
            friendId={state.activeFriend!}
            onBack={() => { setActiveFriend(null); setSidebarOpen(true); }}
            onStartCall={startCall}
          />
        </Show>
      </main>
    </div>
  );
}
