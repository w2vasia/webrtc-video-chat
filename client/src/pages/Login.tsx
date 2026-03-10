import { createSignal } from "solid-js";
import { useNavigate } from "@solidjs/router";
import { useAuth } from "../store/auth";
import { api } from "../lib/api";

export default function Login() {
  const [email, setEmail] = createSignal("");
  const [password, setPassword] = createSignal("");
  const [error, setError] = createSignal("");
  const [loading, setLoading] = createSignal(false);
  const { login } = useAuth();
  const navigate = useNavigate();

  async function handleSubmit(e: Event) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await api("/api/auth/login", {
        method: "POST",
        body: { email: email(), password: password() },
      });
      login(res.token, res.user);
      navigate("/");
    } catch (err: any) {
      setError(err.message || "Login failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div class="auth-page">
      <form class="auth-form" onSubmit={handleSubmit}>
        <h1>Whisper</h1>
        <h2>Sign In</h2>
        {error() && <p class="error">{error()}</p>}
        <input type="email" placeholder="Email" value={email()} onInput={(e) => setEmail(e.target.value)} required />
        <input type="password" placeholder="Password" value={password()} onInput={(e) => setPassword(e.target.value)} required />
        <button type="submit" disabled={loading()}>
          {loading() ? "Signing in..." : "Sign In"}
        </button>
        <p class="link">
          No account? <a href="/register">Register</a>
        </p>
      </form>
    </div>
  );
}
