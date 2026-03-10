import { createResource, createEffect, onCleanup, onMount, For, Show } from "solid-js";
import { api } from "../lib/api";
import { useChat } from "../store/chat";

interface Friend {
  id: number;
  email: string;
  displayName: string;
  lastSeen: number;
  friendshipId: number;
}

export default function FriendList(props: { onSelect: (id: number) => void; onDeselect: () => void; activeId: number | null; onlineUsers: Set<number> }) {
  const { state, registerFriendNames } = useChat();
  const [friends, { refetch }] = createResource(async () => {
    const res = await api("/api/friends");
    return res.friends as Friend[];
  });

  createEffect(() => {
    const f = friends();
    if (f) registerFriendNames(f);
  });

  onMount(() => {
    const intervalId = setInterval(refetch, 30000);
    onCleanup(() => clearInterval(intervalId));
  });

  return (
    <div class="friend-list" onClick={(e) => { if (e.target === e.currentTarget) props.onDeselect(); }}>
      <Show when={friends()?.length === 0}>
        <div style="padding: 32px 16px; text-align: center;">
          <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" style="margin: 0 auto 12px;display:block;opacity:0.5;"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75"/></svg>
          <p class="placeholder">No friends yet</p>
          <p style="color: var(--text-muted); font-size: 0.8125rem; margin-top: 4px;">Add someone by email above</p>
        </div>
      </Show>
      <For each={friends()}>
        {(friend) => (
          <button
            class={`friend-item ${props.activeId === friend.id ? "active" : ""}`}
            onClick={() => props.onSelect(friend.id)}
          >
            <div class="avatar-wrapper">
              <div class="friend-avatar">{(friend.displayName[0] || "?").toUpperCase()}</div>
              <div class={`status-dot ${props.onlineUsers.has(friend.id) ? "online" : ""}`} />
            </div>
            <div class="friend-info">
              <span class="friend-name">{friend.displayName}</span>
              <span class="friend-email">{friend.email}</span>
            </div>
            <Show when={state.unreadCounts[friend.id]}>
              <span class="unread-badge">{state.unreadCounts[friend.id]}</span>
            </Show>
          </button>
        )}
      </For>
    </div>
  );
}
