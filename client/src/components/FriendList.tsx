import { createResource, For, Show } from "solid-js";
import { api } from "../lib/api";

interface Friend {
  id: number;
  email: string;
  displayName: string;
  lastSeen: number;
  friendshipId: number;
}

export default function FriendList(props: { onSelect: (id: number) => void; activeId: number | null; onlineUsers: Set<number> }) {
  const [friends, { refetch }] = createResource(async () => {
    const res = await api("/api/friends");
    return res.friends as Friend[];
  });

  setInterval(refetch, 30000);

  return (
    <div class="friend-list">
      <Show when={friends()?.length === 0}>
        <p class="placeholder" style="padding: 16px">No friends yet. Add someone!</p>
      </Show>
      <For each={friends()}>
        {(friend) => (
          <button
            class={`friend-item ${props.activeId === friend.id ? "active" : ""}`}
            onClick={() => props.onSelect(friend.id)}
          >
            <div class="avatar-wrapper">
              <div class="friend-avatar">{friend.displayName[0].toUpperCase()}</div>
              <div class={`status-dot ${props.onlineUsers.has(friend.id) ? "online" : ""}`} />
            </div>
            <div class="friend-info">
              <span class="friend-name">{friend.displayName}</span>
              <span class="friend-email">{friend.email}</span>
            </div>
          </button>
        )}
      </For>
    </div>
  );
}
