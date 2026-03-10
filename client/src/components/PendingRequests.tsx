import { createResource, onCleanup, onMount, For, Show } from "solid-js";
import { api } from "../lib/api";

interface PendingRequest {
  friendshipId: number;
  id: number;
  email: string;
  displayName: string;
}

export default function PendingRequests() {
  const [requests, { refetch }] = createResource(async () => {
    const res = await api("/api/friends/pending");
    return res.requests as PendingRequest[];
  });

  onMount(() => {
    const intervalId = setInterval(refetch, 15000);
    onCleanup(() => clearInterval(intervalId));
  });

  async function accept(friendshipId: number) {
    try {
      await api("/api/friends/accept", { method: "POST", body: { friendshipId } });
      refetch();
    } catch (e) {
      console.error("Failed to accept request", e);
    }
  }

  async function reject(friendshipId: number) {
    try {
      await api("/api/friends/reject", { method: "POST", body: { friendshipId } });
      refetch();
    } catch (e) {
      console.error("Failed to reject request", e);
    }
  }

  return (
    <Show when={requests()?.length}>
      <div class="px-4 py-3 border-b border-gray-200">
        <h3 class="text-[0.8125rem] text-gray-500 font-semibold uppercase tracking-wide mb-2">Requests</h3>
        <For each={requests()}>
          {(req) => (
            <div class="flex justify-between items-center py-2 text-[0.9375rem]">
              <span class="text-gray-900">{req.displayName} <span class="text-gray-400">({req.email})</span></span>
              <div class="flex gap-2">
                <button
                  class="px-3.5 py-1.5 bg-green-500 hover:opacity-90 text-white rounded-[10px] text-[0.8125rem] font-medium font-[inherit] cursor-pointer min-h-[32px] transition-opacity"
                  onClick={() => accept(req.friendshipId)}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="vertical-align: -2px; margin-right: 4px;"><polyline points="20 6 9 17 4 12"/></svg>
                  Accept
                </button>
                <button
                  class="px-3.5 py-1.5 bg-danger-soft hover:bg-red-100 text-red-500 rounded-[10px] text-[0.8125rem] font-medium font-[inherit] cursor-pointer min-h-[32px] transition-colors"
                  onClick={() => reject(req.friendshipId)}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="vertical-align: -2px; margin-right: 4px;"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                  Decline
                </button>
              </div>
            </div>
          )}
        </For>
      </div>
    </Show>
  );
}
