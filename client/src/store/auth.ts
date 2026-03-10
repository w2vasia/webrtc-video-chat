import { createSignal } from "solid-js";
import { wsClient } from "../lib/ws";
import { deleteKey } from "../lib/keystore";

interface User {
  id: number;
  email: string;
  displayName: string;
}

const [token, setToken] = createSignal<string | null>(localStorage.getItem("token"));
function loadUser(): User | null {
  try { return JSON.parse(localStorage.getItem("user") || "null"); } catch { return null; }
}
const [user, setUser] = createSignal<User | null>(loadUser());

export function useAuth() {
  function login(t: string, u: User) {
    localStorage.setItem("token", t);
    localStorage.setItem("user", JSON.stringify(u));
    setToken(t);
    setUser(u);
  }

  async function logout() {
    wsClient.disconnect();
    localStorage.removeItem("token");
    localStorage.removeItem("user");
    localStorage.removeItem("unreadCounts");
    setToken(null);
    setUser(null);
    try {
      await deleteKey("privateKey");
      await deleteKey("publicKey");
    } catch { /* ignore if IDB unavailable */ }
  }

  return { token, user, login, logout, isLoggedIn: () => !!token() };
}
