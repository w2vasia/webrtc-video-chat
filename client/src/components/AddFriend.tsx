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
      <button type="submit" disabled={loading()}>Add</button>
      {status() && (
        <p class={status()!.ok ? "success-msg" : "error-msg"}>{status()!.msg}</p>
      )}
    </form>
  );
}
