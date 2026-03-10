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
      await api("/api/friends/request", { method: "POST", body: { email: email() } });
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
    <form class="flex gap-2 px-4 py-3 border-b border-gray-200 flex-wrap" onSubmit={handleSearch}>
      <input
        class="flex-1 px-3 py-2 bg-surface-2 border border-transparent rounded-[10px] text-gray-900 text-sm font-[inherit] outline-none min-w-0 min-h-[40px] transition-all placeholder:text-gray-400 focus:border-primary focus:ring-[3px] focus:ring-primary/50"
        type="email"
        placeholder="Add friend by email..."
        value={email()}
        onInput={(e) => setEmail(e.target.value)}
        required
      />
      <button
        class="px-4 py-2 bg-primary hover:bg-primary-hover text-white rounded-[10px] font-semibold text-sm font-[inherit] cursor-pointer min-h-[40px] transition-colors disabled:opacity-50"
        type="submit"
        disabled={loading()}
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" style="vertical-align: -2px; margin-right: 4px;"><path d="M12 5v14M5 12h14"/></svg>
        Add
      </button>
      {status() && (
        <p class={`w-full text-[0.8125rem] ${status()!.ok ? "text-green-500" : "text-red-500"}`}>{status()!.msg}</p>
      )}
    </form>
  );
}
