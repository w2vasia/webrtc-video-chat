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
    <div class="flex-1 overflow-y-auto" onClick={(e) => { if (e.target === e.currentTarget) props.onDeselect(); }}>
      <Show when={friends()?.length === 0}>
        <div class="px-4 py-8 text-center">
          <svg class="w-10 h-10 mx-auto mb-3 opacity-40 text-gray-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75"/></svg>
          <p class="text-gray-400 text-[0.9375rem]">No friends yet</p>
          <p class="text-gray-400 text-[0.8125rem] mt-1">Add someone by email above</p>
        </div>
      </Show>
      <For each={friends()}>
        {(friend) => (
          <button
            class={`w-full flex items-center gap-3 px-4 py-3 border-0 border-l-[3px] [border-left-style:solid] text-gray-900 cursor-pointer text-left font-[inherit] transition-all min-h-[48px] ${props.activeId === friend.id ? "bg-primary-soft border-l-primary" : "bg-transparent border-l-transparent hover:bg-surface-2"}`}
            onClick={() => props.onSelect(friend.id)}
          >
            <div class="relative flex-shrink-0">
              <div class="w-10 h-10 bg-primary rounded-full flex items-center justify-center font-semibold text-[1.05rem] text-white">
                {friend.displayName[0].toUpperCase()}
              </div>
              <div class={`absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full border-2 border-white ${props.onlineUsers.has(friend.id) ? "bg-green-500" : "bg-gray-400"}`} />
            </div>
            <div class="flex flex-col min-w-0">
              <span class="font-semibold text-[0.9375rem] text-gray-900">{friend.displayName}</span>
              <span class="text-[0.8125rem] text-gray-400 truncate">{friend.email}</span>
            </div>
            <Show when={state.unreadCounts[friend.id]}>
              <span class="ml-auto flex-shrink-0 min-w-[22px] h-[22px] px-1.5 bg-primary text-white rounded-full text-xs font-semibold flex items-center justify-center">
                {state.unreadCounts[friend.id]}
              </span>
            </Show>
          </button>
        )}
      </For>
    </div>
  );
}
