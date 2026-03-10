import { createResource, onCleanup, For, Show } from "solid-js";
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

  const intervalId = setInterval(refetch, 15000);
  onCleanup(() => clearInterval(intervalId));

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
      <div class="pending-requests">
        <h3>Requests</h3>
        <For each={requests()}>
          {(req) => (
            <div class="pending-item">
              <span>{req.displayName} ({req.email})</span>
              <div class="pending-actions">
                <button class="btn-accept" onClick={() => accept(req.friendshipId)}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="vertical-align: -2px; margin-right: 4px;"><polyline points="20 6 9 17 4 12"/></svg>
                  Accept
                </button>
                <button class="btn-reject" onClick={() => reject(req.friendshipId)}>
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
