import { createSignal } from "solid-js";
import { useNavigate } from "@solidjs/router";
import { useAuth } from "../store/auth";
import { api } from "../lib/api";

const inputCls = "px-4 py-3 bg-surface-2 border border-transparent rounded-[10px] text-gray-900 text-base font-[inherit] outline-none min-h-[44px] w-full transition-all placeholder:text-gray-400 focus:border-primary focus:ring-[3px] focus:ring-primary/50";
const btnCls = "px-4 py-3 bg-primary hover:bg-primary-hover text-white rounded-[10px] font-semibold text-base font-[inherit] cursor-pointer min-h-[44px] w-full transition-colors disabled:opacity-50 disabled:cursor-not-allowed";

export default function Register() {
  const [email, setEmail] = createSignal("");
  const [password, setPassword] = createSignal("");
  const [displayName, setDisplayName] = createSignal("");
  const [error, setError] = createSignal("");
  const [loading, setLoading] = createSignal(false);
  const { login } = useAuth();
  const navigate = useNavigate();

  async function handleSubmit(e: Event) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await api("/api/auth/register", {
        method: "POST",
        body: { email: email(), password: password(), displayName: displayName() },
      });
      login(res.token, res.user);
      navigate("/");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Registration failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div class="flex items-center justify-center min-h-[100dvh] p-5 bg-page">
      <form class="bg-white p-10 rounded-2xl w-full max-w-sm flex flex-col gap-4 shadow-lg" onSubmit={handleSubmit}>
        <h1 class="text-primary text-4xl text-center font-semibold">Whisper</h1>
        <h2 class="text-gray-500 text-xl text-center font-normal">Create Account</h2>
        <p class="text-gray-400 text-sm text-center">End-to-end encrypted messaging</p>
        {error() && <p class="text-danger text-sm text-center">{error()}</p>}
        <input class={inputCls} type="text" placeholder="Display Name" value={displayName()} onInput={(e) => setDisplayName(e.target.value)} autocomplete="name" required />
        <input class={inputCls} type="email" placeholder="Email" value={email()} onInput={(e) => setEmail(e.target.value)} autocomplete="email" required />
        <input class={inputCls} type="password" placeholder="Password (min 8 chars)" value={password()} onInput={(e) => setPassword(e.target.value)} autocomplete="new-password" minLength={8} required />
        <button class={btnCls} type="submit" disabled={loading()}>
          {loading() ? "Creating..." : "Create Account"}
        </button>
        <p class="text-center text-gray-500 text-sm">
          Have an account? <a class="text-primary font-medium no-underline hover:underline" href="/login">Sign In</a>
        </p>
      </form>
    </div>
  );
}
