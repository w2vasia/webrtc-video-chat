import { createSignal } from "solid-js";
import { api } from "../lib/api";

export default function AddFriend(props: { onAdded?: () => void }) {
  const [email, setEmail] = createSignal("");
  const [status, setStatus] = createSignal<{ ok: boolean; msg: string } | null>(null);
  const [loading, setLoading] = createSignal(false);

  async function handleSearch(e: Event) {
    e.preventDefault();
    setLoading(true);
    setStatus(null);

    try {
      await api("/api/friends/request", {
        method: "POST",
        body: { email: email() },
      });
      setStatus({ ok: true, msg: "Friend request sent!" });
      setEmail("");
      props.onAdded?.();
    } catch (err: any) {
      setStatus({ ok: false, msg: err.message });
    } finally {
      setLoading(false);
    }
  }

  return (
    <form class="add-friend" onSubmit={handleSearch}>
      <input
        type="email"
        placeholder="Add friend by email..."
        value={email()}
        onInput={(e) => setEmail(e.target.value)}
        required
      />
      <button type="submit" disabled={loading()}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" style="vertical-align: -2px; margin-right: 4px;"><path d="M12 5v14M5 12h14"/></svg>
        Add
      </button>
      {status() && (
        <p class={status()!.ok ? "success-msg" : "error-msg"}>{status()!.msg}</p>
      )}
    </form>
  );
}
