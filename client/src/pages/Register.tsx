import { createSignal } from "solid-js";
import { useNavigate } from "@solidjs/router";
import { useAuth } from "../store/auth";
import { api } from "../lib/api";

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
    } catch (err: any) {
      setError(err.message || "Registration failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div class="auth-page">
      <form class="auth-form" onSubmit={handleSubmit}>
        <h1>Whisper</h1>
        <h2>Create Account</h2>
        <p class="auth-desc">End-to-end encrypted messaging</p>
        {error() && <p class="error">{error()}</p>}
        <input type="text" placeholder="Display Name" value={displayName()} onInput={(e) => setDisplayName(e.target.value)} autocomplete="name" required />
        <input type="email" placeholder="Email" value={email()} onInput={(e) => setEmail(e.target.value)} autocomplete="email" required />
        <input type="password" placeholder="Password (min 8 chars)" value={password()} onInput={(e) => setPassword(e.target.value)} autocomplete="new-password" minLength={8} required />
        <button type="submit" disabled={loading()}>
          {loading() ? "Creating..." : "Create Account"}
        </button>
        <p class="link">
          Have an account? <a href="/login">Sign In</a>
        </p>
      </form>
    </div>
  );
}
