import { createResource, For, Show } from "solid-js";
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

  setInterval(refetch, 15000);

  async function accept(friendshipId: number) {
    await api("/api/friends/accept", { method: "POST", body: { friendshipId } });
    refetch();
  }

  async function reject(friendshipId: number) {
    await api("/api/friends/reject", { method: "POST", body: { friendshipId } });
    refetch();
  }

  return (
    <Show when={requests()?.length}>
      <div class="pending-requests">
        <h3>Friend Requests</h3>
        <For each={requests()}>
          {(req) => (
            <div class="pending-item">
              <span>{req.displayName} ({req.email})</span>
              <div class="pending-actions">
                <button class="btn-accept" onClick={() => accept(req.friendshipId)}>Accept</button>
                <button class="btn-reject" onClick={() => reject(req.friendshipId)}>Reject</button>
              </div>
            </div>
          )}
        </For>
      </div>
    </Show>
  );
}
