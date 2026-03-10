# Tailwind CSS v4 Migration

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace all plain CSS in `global.css` and component `class` strings with Tailwind CSS v4 utilities, preserving every visual detail of the existing design.

**Architecture:** Tailwind v4 CSS-first configuration — `@import "tailwindcss"` + `@theme {}` block in `global.css`. No `tailwind.config.js` needed. `@tailwindcss/vite` plugin handles JIT scanning. Keep only animation keyframes and unavoidable overrides in CSS; everything else moves to utility classes in JSX.

**Tech Stack:** Tailwind CSS v4, `@tailwindcss/vite`, SolidJS (uses `class=` not `className=`), Vite 6, bun.

**Worktree path:** `.worktrees/feature/ux-reliability/` — all edits happen inside that worktree.

**Design tokens that map to custom `@theme` colors:**
| CSS var | Tailwind utility (bg/text/border) |
|---|---|
| `--color-primary: #6366f1` | `bg-primary`, `text-primary`, `border-primary` |
| `--color-primary-hover: #4f46e5` | `bg-primary-hover`, `hover:bg-primary-hover` |
| `--color-primary-soft: rgba(99,102,241,0.08)` | `bg-primary-soft` |
| `--color-surface-2: #eef0f6` | `bg-surface-2` |
| `--color-surface-3: #e2e5ee` | `bg-surface-3` |
| `--color-chat-bg: #f0f1f5` | `bg-chat-bg` |
| `--color-chat-surface: #ffffff` | `bg-chat-surface` |
| `--color-page: #f5f6fa` | `bg-page` |
| `--color-danger-soft: rgba(239,68,68,0.08)` | `bg-danger-soft` |
| `--color-success-soft: rgba(34,197,94,0.08)` | `bg-success-soft` |

Standard Tailwind utilities used for common colors (no custom token needed):
- `text-gray-900` (--text), `text-gray-500` (--text-secondary), `text-gray-400` (--text-muted)
- `text-red-500` / `bg-red-500` (--danger), `text-green-500` / `bg-green-500` (--success)
- `bg-white` (--surface), `border-gray-200` (--border)
- `shadow-sm`, `shadow-md`, `shadow-lg` from Tailwind defaults

---

## Task 1: Install Tailwind v4

**Files:**
- Modify: `.worktrees/feature/ux-reliability/client/package.json`
- Modify: `.worktrees/feature/ux-reliability/client/vite.config.ts`

**Step 1: Install packages**

```bash
cd .worktrees/feature/ux-reliability/client && bun add -d tailwindcss @tailwindcss/vite
```

**Step 2: Update vite.config.ts — add plugin**

```ts
import { defineConfig } from "vite";
import solid from "vite-plugin-solid";
import tailwindcss from "@tailwindcss/vite";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  plugins: [
    tailwindcss(),
    solid(),
    VitePWA({
      devOptions: { enabled: true },
      registerType: "autoUpdate",
      manifest: {
        name: "Whisper — Encrypted Chat",
        short_name: "Whisper",
        description: "E2E encrypted chat & video calls",
        theme_color: "#f5f6fa",
        background_color: "#f5f6fa",
        display: "standalone",
        icons: [
          { src: "icon-192.svg", sizes: "192x192", type: "image/svg+xml" },
          { src: "icon-512.svg", sizes: "512x512", type: "image/svg+xml" },
        ],
      },
      workbox: {
        importScripts: ["/sw-custom.js"],
        globPatterns: ["**/*.{js,css,html,svg,png,woff2}"],
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/.*\/api\//,
            handler: "NetworkFirst",
            options: { cacheName: "api-cache", expiration: { maxEntries: 50 } },
          },
        ],
      },
    }),
  ],
  server: {
    allowedHosts: true,
    proxy: {
      "/api": "http://localhost:3000",
      "/ws": { target: "http://localhost:3000", ws: true, rewriteWsOrigin: true },
    },
  },
});
```

**Step 3: Verify dev server starts**

```bash
cd .worktrees/feature/ux-reliability && bun run dev:client 2>&1 | head -10
```

Expected: Vite starts on port 5173, no errors.

---

## Task 2: Rewrite global.css

**Files:**
- Rewrite: `.worktrees/feature/ux-reliability/client/src/styles/global.css`

**Step 1: Replace entire file**

```css
@import "tailwindcss";

@theme {
  --color-primary: #6366f1;
  --color-primary-hover: #4f46e5;
  --color-primary-soft: rgba(99, 102, 241, 0.08);
  --color-surface-2: #eef0f6;
  --color-surface-3: #e2e5ee;
  --color-chat-bg: #f0f1f5;
  --color-chat-surface: #ffffff;
  --color-page: #f5f6fa;
  --color-danger-soft: rgba(239, 68, 68, 0.08);
  --color-success-soft: rgba(34, 197, 94, 0.08);
  --font-family-sans: 'Inter', system-ui, -apple-system, sans-serif;
}

body {
  min-height: 100dvh;
  background: #f5f6fa;
  color: #111827;
  -webkit-font-smoothing: antialiased;
}

/* Animation keyframes — not expressible as Tailwind utilities */
@keyframes toast-in {
  from { opacity: 0; transform: translateY(8px); }
  to { opacity: 1; transform: none; }
}
@keyframes bounce-dot {
  0%, 60%, 100% { transform: translateY(0); }
  30% { transform: translateY(-4px); }
}
@keyframes pulse-dot {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.4; }
}
@keyframes pulse-bg {
  0%, 100% { background-color: rgba(34, 197, 94, 0.08); }
  50% { background-color: rgba(34, 197, 94, 0.15); }
}

/* Named animation utilities */
.animate-toast-in { animation: toast-in 0.2s ease; }
.animate-bounce-dot { animation: bounce-dot 1.2s infinite; }
.animate-pulse-dot { animation: pulse-dot 1.5s infinite; }
.animate-pulse-bg { animation: pulse-bg 1.5s ease-in-out infinite; }
.dot-delay-1 { animation-delay: 0.2s; }
.dot-delay-2 { animation-delay: 0.4s; }

/* Scrollbar polish */
.messages-scroll::-webkit-scrollbar { width: 4px; }
.messages-scroll::-webkit-scrollbar-track { background: transparent; }
.messages-scroll::-webkit-scrollbar-thumb { background: rgba(0,0,0,0.12); border-radius: 4px; }
```

**Step 2: Verify build compiles**

```bash
cd .worktrees/feature/ux-reliability/client && bun run build 2>&1 | tail -5
```

Expected: build completes (may have visual breakage since components still use old classes — that's ok, will fix per task).

---

## Task 3: Migrate Login + Register pages

**Files:**
- Rewrite: `.worktrees/feature/ux-reliability/client/src/pages/Login.tsx`
- Rewrite: `.worktrees/feature/ux-reliability/client/src/pages/Register.tsx`

**Step 1: Input + button class helpers**

Both pages share the same input/button styles. Define these constants at top of each file (or extract to a shared file — but keep it simple, just copy).

**Input class:**
```
px-4 py-3 bg-surface-2 border border-transparent rounded-[10px] text-gray-900 text-base font-[inherit] outline-none min-h-[44px] w-full transition-all placeholder:text-gray-400 focus:border-primary focus:ring-[3px] focus:ring-primary/20
```

**Button class:**
```
py-3 bg-primary hover:bg-primary-hover text-white rounded-[10px] font-semibold text-base font-[inherit] cursor-pointer min-h-[44px] w-full transition-colors disabled:opacity-50 disabled:cursor-not-allowed
```

**Step 2: Rewrite Login.tsx**

```tsx
import { createSignal } from "solid-js";
import { useNavigate } from "@solidjs/router";
import { useAuth } from "../store/auth";
import { api } from "../lib/api";

const inputCls = "px-4 py-3 bg-surface-2 border border-transparent rounded-[10px] text-gray-900 text-base font-[inherit] outline-none min-h-[44px] w-full transition-all placeholder:text-gray-400 focus:border-primary focus:ring-[3px] focus:ring-primary/20";
const btnCls = "py-3 bg-primary hover:bg-primary-hover text-white rounded-[10px] font-semibold text-base font-[inherit] cursor-pointer min-h-[44px] w-full transition-colors disabled:opacity-50 disabled:cursor-not-allowed";

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
    <div class="flex items-center justify-center min-h-[100dvh] p-5 bg-page">
      <form class="bg-white p-10 rounded-2xl w-full max-w-sm flex flex-col gap-4 shadow-lg" onSubmit={handleSubmit}>
        <h1 class="text-primary text-4xl text-center font-semibold">Whisper</h1>
        <h2 class="text-gray-500 text-xl text-center font-normal">Sign In</h2>
        <p class="text-gray-400 text-sm text-center">End-to-end encrypted messaging</p>
        {error() && <p class="text-red-500 text-sm text-center">{error()}</p>}
        <input class={inputCls} type="email" placeholder="Email" value={email()} onInput={(e) => setEmail(e.target.value)} autocomplete="email" required />
        <input class={inputCls} type="password" placeholder="Password" value={password()} onInput={(e) => setPassword(e.target.value)} autocomplete="current-password" required />
        <button class={btnCls} type="submit" disabled={loading()}>
          {loading() ? "Signing in..." : "Sign In"}
        </button>
        <p class="text-center text-gray-500 text-sm">
          No account? <a class="text-primary font-medium no-underline hover:underline" href="/register">Register</a>
        </p>
      </form>
    </div>
  );
}
```

**Step 3: Rewrite Register.tsx**

Same structure as Login:

```tsx
import { createSignal } from "solid-js";
import { useNavigate } from "@solidjs/router";
import { useAuth } from "../store/auth";
import { api } from "../lib/api";

const inputCls = "px-4 py-3 bg-surface-2 border border-transparent rounded-[10px] text-gray-900 text-base font-[inherit] outline-none min-h-[44px] w-full transition-all placeholder:text-gray-400 focus:border-primary focus:ring-[3px] focus:ring-primary/20";
const btnCls = "py-3 bg-primary hover:bg-primary-hover text-white rounded-[10px] font-semibold text-base font-[inherit] cursor-pointer min-h-[44px] w-full transition-colors disabled:opacity-50 disabled:cursor-not-allowed";

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
    <div class="flex items-center justify-center min-h-[100dvh] p-5 bg-page">
      <form class="bg-white p-10 rounded-2xl w-full max-w-sm flex flex-col gap-4 shadow-lg" onSubmit={handleSubmit}>
        <h1 class="text-primary text-4xl text-center font-semibold">Whisper</h1>
        <h2 class="text-gray-500 text-xl text-center font-normal">Create Account</h2>
        <p class="text-gray-400 text-sm text-center">End-to-end encrypted messaging</p>
        {error() && <p class="text-red-500 text-sm text-center">{error()}</p>}
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
```

**Step 4: Verify in browser** — open `/login` and `/register`, check visual parity with old design.

---

## Task 4: Migrate Chat.tsx layout

**Files:**
- Modify: `.worktrees/feature/ux-reliability/client/src/pages/Chat.tsx`

**Step 1: Update JSX class attributes**

Note: `sidebarOpen()` drives mobile sidebar visibility via `open` class. Translate with Tailwind responsive + conditional.

```tsx
import { onMount, Show, createSignal, createEffect } from "solid-js";
import { useAuth } from "../store/auth";
import { useChat } from "../store/chat";
import { useCall } from "../store/call";
import { wsClient } from "../lib/ws";
import FriendList from "../components/FriendList";
import AddFriend from "../components/AddFriend";
import PendingRequests from "../components/PendingRequests";
import ChatWindow from "../components/ChatWindow";
import VideoCall from "../components/VideoCall";
import IncomingCall from "../components/IncomingCall";
import { ToastContainer } from "../components/Toast";

export default function Chat() {
  const { user, token, logout } = useAuth();
  const { state, setActiveFriend, initKeys, setupListeners } = useChat();
  const { callStatus, callTargetId, setupCallListeners, startCall } = useCall();
  const [sidebarOpen, setSidebarOpen] = createSignal(true);

  createEffect(() => {
    if (callStatus() === "incoming" && callTargetId()) {
      setActiveFriend(callTargetId()!);
      setSidebarOpen(false);
    }
  });

  onMount(async () => {
    wsClient.connect(token()!);
    await initKeys();
    setupListeners();
    setupCallListeners();
    if ("Notification" in window && Notification.permission === "default") {
      Notification.requestPermission();
    }
    navigator.serviceWorker?.addEventListener("message", (e) => {
      if (e.data?.type === "open-chat" && e.data.friendId) {
        setActiveFriend(e.data.friendId);
        setSidebarOpen(false);
      }
    });
  });

  return (
    <div class="flex h-[100dvh]">
      <ToastContainer />

      <Show when={callStatus() === "calling" || callStatus() === "connecting" || callStatus() === "connected"}>
        <VideoCall />
      </Show>

      {/* Sidebar */}
      <aside class={`w-80 bg-white border-r border-gray-200 flex flex-col flex-shrink-0 sm:relative sm:translate-x-0 ${sidebarOpen() ? "translate-x-0" : "-translate-x-full"} fixed inset-y-0 left-0 z-10 transition-transform sm:transition-none`}>
        <div class="px-4 pt-5 pb-4 border-b border-gray-200 flex flex-col gap-2">
          <div class="flex items-center justify-between">
            <h2 class="text-primary text-xl font-semibold">Whisper</h2>
            <button
              class="px-3.5 py-1.5 bg-surface-2 hover:bg-surface-3 text-gray-500 hover:text-gray-900 rounded-[10px] text-sm font-medium font-[inherit] cursor-pointer transition-colors min-h-[36px]"
              onClick={logout}
            >
              Logout
            </button>
          </div>
          <div class="flex flex-col gap-0.5">
            <span class="font-semibold text-[0.9375rem] text-gray-900">{user()?.displayName}</span>
            <span class="text-[0.8125rem] text-gray-400">{user()?.email}</span>
          </div>
        </div>
        <AddFriend />
        <PendingRequests />
        <FriendList
          onSelect={(id) => { setActiveFriend(id); setSidebarOpen(false); }}
          onDeselect={() => { setActiveFriend(null); setSidebarOpen(true); }}
          activeId={state.activeFriend}
          onlineUsers={state.onlineUsers}
        />
      </aside>

      {/* Main */}
      <main class="flex-1 flex items-center justify-center bg-page min-w-0">
        <Show when={state.activeFriend} fallback={<p class="text-gray-400 text-[0.9375rem]">Select a friend to chat</p>}>
          <ChatWindow
            friendId={state.activeFriend!}
            onBack={() => { setActiveFriend(null); setSidebarOpen(true); }}
            onStartCall={(id) => startCall(id)}
          />
        </Show>
      </main>
    </div>
  );
}
```

**Step 2: Verify** — layout renders correctly on desktop and mobile (sidebar slides in/out).

---

## Task 5: Migrate FriendList

**Files:**
- Modify: `.worktrees/feature/ux-reliability/client/src/components/FriendList.tsx`

**Step 1: Rewrite JSX**

```tsx
import { createResource, createEffect, For, Show } from "solid-js";
import { api } from "../lib/api";
import { useChat } from "../store/chat";

interface Friend {
  id: number;
  email: string;
  displayName: string;
  lastSeen: number;
  friendshipId: number;
}

export default function FriendList(props: { onSelect: (id: number) => void; onDeselect: () => void; activeId: number | null; onlineUsers: Set<number> }) {
  const { state, registerFriendNames } = useChat();
  const [friends, { refetch }] = createResource(async () => {
    const res = await api("/api/friends");
    return res.friends as Friend[];
  });

  createEffect(() => {
    const f = friends();
    if (f) registerFriendNames(f);
  });

  setInterval(refetch, 30000);

  return (
    <div class="flex-1 overflow-y-auto" onClick={(e) => { if (e.target === e.currentTarget) props.onDeselect(); }}>
      <Show when={friends()?.length === 0}>
        <div class="px-4 py-8 text-center">
          <svg class="w-10 h-10 mx-auto mb-3 opacity-40 text-gray-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75"/></svg>
          <p class="text-gray-400 text-[0.9375rem]">No friends yet</p>
          <p class="text-gray-400 text-[0.8125rem] mt-1">Add someone by email above</p>
        </div>
      </Show>
      <For each={friends()}>
        {(friend) => (
          <button
            class={`w-full flex items-center gap-3 px-4 py-3 border-none border-l-[3px] text-gray-900 cursor-pointer text-left font-[inherit] transition-all min-h-[48px] ${props.activeId === friend.id ? "bg-primary-soft border-l-primary" : "bg-transparent border-l-transparent hover:bg-surface-2"}`}
            onClick={() => props.onSelect(friend.id)}
          >
            <div class="relative flex-shrink-0">
              <div class="w-10 h-10 bg-primary rounded-full flex items-center justify-center font-semibold text-[1.05rem] text-white">
                {friend.displayName[0].toUpperCase()}
              </div>
              <div class={`absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full border-2 border-white ${props.onlineUsers.has(friend.id) ? "bg-green-500" : "bg-gray-400"}`} />
            </div>
            <div class="flex flex-col min-w-0">
              <span class="font-semibold text-[0.9375rem] text-gray-900">{friend.displayName}</span>
              <span class="text-[0.8125rem] text-gray-400 overflow-hidden text-ellipsis whitespace-nowrap">{friend.email}</span>
            </div>
            <Show when={state.unreadCounts[friend.id]}>
              <span class="ml-auto flex-shrink-0 min-w-[22px] h-[22px] px-1.5 bg-primary text-white rounded-full text-xs font-semibold flex items-center justify-center">
                {state.unreadCounts[friend.id]}
              </span>
            </Show>
          </button>
        )}
      </For>
    </div>
  );
}
```

---

## Task 6: Migrate AddFriend + PendingRequests

**Files:**
- Modify: `.worktrees/feature/ux-reliability/client/src/components/AddFriend.tsx`
- Modify: `.worktrees/feature/ux-reliability/client/src/components/PendingRequests.tsx`

**Step 1: Rewrite AddFriend.tsx**

```tsx
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
        class="flex-1 px-3 py-2 bg-surface-2 border border-transparent rounded-[10px] text-gray-900 text-sm font-[inherit] outline-none min-w-0 min-h-[40px] transition-all placeholder:text-gray-400 focus:border-primary focus:ring-[3px] focus:ring-primary/20"
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
```

**Step 2: Rewrite PendingRequests.tsx**

```tsx
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
```

---

## Task 7: Migrate ChatWindow

**Files:**
- Modify: `.worktrees/feature/ux-reliability/client/src/components/ChatWindow.tsx`

**Step 1: Rewrite JSX**

```tsx
import { createSignal, For, createEffect, Show } from "solid-js";
import { useChat } from "../store/chat";
import { useCall } from "../store/call";

export default function ChatWindow(props: { friendId: number; onBack: () => void; onStartCall?: (friendId: number) => void }) {
  const { state, sendMessage, loadHistory } = useChat();
  const { callStatus, callTargetId, acceptCall, rejectCall } = useCall();
  const [input, setInput] = createSignal("");
  const [error, setError] = createSignal("");
  const [loadingMore, setLoadingMore] = createSignal(false);
  let messagesEnd: HTMLDivElement | undefined;
  let messagesContainer: HTMLDivElement | undefined;
  let shouldScrollToBottom = true;

  const messages = () => state.conversations[props.friendId] || [];

  createEffect(() => {
    shouldScrollToBottom = true;
    loadHistory(props.friendId);
  });

  createEffect(() => {
    messages();
    if (!messagesContainer) return;
    if (shouldScrollToBottom) {
      requestAnimationFrame(() => messagesEnd?.scrollIntoView());
      return;
    }
    const { scrollTop, scrollHeight, clientHeight } = messagesContainer;
    if (scrollHeight - scrollTop - clientHeight < 150) {
      messagesEnd?.scrollIntoView({ behavior: "smooth" });
    }
  });

  function handleScroll() {
    if (!messagesContainer) return;
    const { scrollTop, scrollHeight, clientHeight } = messagesContainer;
    shouldScrollToBottom = scrollHeight - scrollTop - clientHeight < 150;
    if (scrollTop < 50) loadOlder();
  }

  async function loadOlder() {
    if (!messagesContainer || loadingMore()) return;
    if (state.hasMore[props.friendId] === false) return;
    const msgs = messages();
    if (!msgs.length) return;
    const oldestId = msgs[0].id;
    const prevHeight = messagesContainer.scrollHeight;
    setLoadingMore(true);
    await loadHistory(props.friendId, oldestId);
    setLoadingMore(false);
    requestAnimationFrame(() => {
      if (messagesContainer) {
        messagesContainer.scrollTop = messagesContainer.scrollHeight - prevHeight;
      }
    });
  }

  async function handleSend(e: Event) {
    e.preventDefault();
    const text = input().trim();
    if (!text) return;
    setInput("");
    setError("");
    try {
      await sendMessage(props.friendId, text);
    } catch (err: any) {
      setError(err.message);
    }
  }

  function handleKeyDown(e: KeyboardEvent) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend(e);
    }
  }

  return (
    <div class="flex flex-col h-[100dvh] w-full">
      {/* Header */}
      <div class="flex items-center gap-3 px-5 py-4 bg-white shadow-sm relative z-[2]">
        <button
          class="sm:hidden flex items-center justify-center w-11 h-11 rounded-[10px] text-gray-500 hover:bg-surface-2 transition-colors"
          onClick={props.onBack}
        >
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 10H5M5 10l5-5M5 10l5 5"/></svg>
        </button>
        <h3 class="font-semibold text-[1.0625rem] text-gray-900">Chat</h3>
        <button
          class="ml-auto flex items-center px-4 py-2 bg-green-500 hover:opacity-90 text-white rounded-full font-semibold text-sm font-[inherit] cursor-pointer min-h-[40px] transition-opacity"
          onClick={() => props.onStartCall?.(props.friendId)}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align: -2px; margin-right: 6px;"><path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07 19.5 19.5 0 01-6-6A19.79 19.79 0 012.12 4.18 2 2 0 014.11 2h3a2 2 0 012 1.72 12.84 12.84 0 00.7 2.81 2 2 0 01-.45 2.11L8.09 9.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45 12.84 12.84 0 002.81.7A2 2 0 0122 16.92z"/></svg>
          Call
        </button>
      </div>

      {/* Incoming call banner */}
      <Show when={callStatus() === "incoming" && callTargetId() === props.friendId}>
        <div class="flex items-center gap-2.5 px-5 py-2.5 bg-success-soft text-gray-900 font-medium text-[0.9375rem] border-b border-gray-200 animate-pulse-bg">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07 19.5 19.5 0 01-6-6A19.79 19.79 0 012.12 4.18 2 2 0 014.11 2h3a2 2 0 012 1.72 12.84 12.84 0 00.7 2.81 2 2 0 01-.45 2.11L8.09 9.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45 12.84 12.84 0 002.81.7A2 2 0 0122 16.92z"/></svg>
          <span>Incoming call</span>
          <button class="ml-auto px-4 py-1.5 bg-green-500 hover:opacity-90 text-white rounded-[10px] text-sm font-medium font-[inherit] cursor-pointer min-h-[32px]" onClick={acceptCall}>Accept</button>
          <button class="px-4 py-1.5 bg-red-500 hover:opacity-90 text-white rounded-[10px] text-sm font-medium font-[inherit] cursor-pointer min-h-[32px]" onClick={rejectCall}>Decline</button>
        </div>
      </Show>

      {/* Messages */}
      <div class="flex-1 overflow-y-auto p-5 flex flex-col gap-2 bg-chat-bg messages-scroll" ref={messagesContainer} onScroll={handleScroll}>
        <Show when={loadingMore()}>
          <div class="text-center text-gray-400 text-sm py-2">Loading...</div>
        </Show>
        <For each={messages()}>
          {(msg) => (
            <div class={`flex ${msg.from === 0 ? "justify-end" : "justify-start"}`}>
              <div class={`px-4 py-2.5 rounded-2xl max-w-[70%] ${msg.from === 0 ? "bg-primary text-white rounded-br-[4px]" : "bg-chat-surface text-gray-900 rounded-bl-[4px] shadow-sm"}`}>
                <p class="text-[0.9375rem] leading-relaxed whitespace-pre-wrap break-words">{msg.text}</p>
                <span class={`text-[0.7rem] mt-1 block ${msg.from === 0 ? "text-white/70 text-right" : "text-gray-400"}`}>
                  {new Date(msg.timestamp * 1000).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                </span>
              </div>
            </div>
          )}
        </For>
        <div ref={messagesEnd} />
      </div>

      {/* Error */}
      {error() && <p class="text-red-500 text-sm px-4 py-2">{error()}</p>}

      {/* Input */}
      <form class="flex items-end gap-3 px-4 py-3 bg-white border-t border-gray-200" onSubmit={handleSend}>
        <textarea
          class="flex-1 px-4 py-3 bg-surface-2 border border-transparent rounded-[10px] text-gray-900 text-[0.9375rem] font-[inherit] outline-none resize-none min-h-[44px] max-h-32 transition-all placeholder:text-gray-400 focus:border-primary focus:ring-[3px] focus:ring-primary/20"
          placeholder="Type a message..."
          value={input()}
          onInput={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          rows={1}
        />
        <button
          class="flex-shrink-0 w-11 h-11 bg-primary hover:bg-primary-hover text-white rounded-full flex items-center justify-center cursor-pointer transition-colors"
          type="submit"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/></svg>
        </button>
      </form>
    </div>
  );
}
```

---

## Task 8: Migrate VideoCall + IncomingCall

**Files:**
- Modify: `.worktrees/feature/ux-reliability/client/src/components/VideoCall.tsx`
- Modify: `.worktrees/feature/ux-reliability/client/src/components/IncomingCall.tsx` (read file first — structure unknown)

**Step 1: Read IncomingCall.tsx before editing**

```bash
cat .worktrees/feature/ux-reliability/client/src/components/IncomingCall.tsx
```

**Step 2: Rewrite VideoCall.tsx**

```tsx
import { createSignal, createEffect, Show } from "solid-js";
import { useCall } from "../store/call";

function bindStream(el: HTMLVideoElement, stream: MediaStream | null) {
  if (!stream) return;
  el.srcObject = stream;
  el.play().catch(() => {});
}

export default function VideoCall() {
  const { localStream, remoteStream, activeCall, endCall, callStatus } = useCall();
  const [videoOn, setVideoOn] = createSignal(true);
  const [audioOn, setAudioOn] = createSignal(true);
  let remoteVideoEl: HTMLVideoElement | undefined;
  let localVideoEl: HTMLVideoElement | undefined;

  createEffect(() => { if (remoteVideoEl) bindStream(remoteVideoEl, remoteStream()); });
  createEffect(() => { if (localVideoEl) bindStream(localVideoEl, localStream()); });

  const statusText: Record<string, string> = {
    calling: "Calling...",
    ringing: "Ringing...",
    connecting: "Connecting...",
  };

  return (
    <div class="fixed inset-0 z-50 bg-black flex items-center justify-center">
      <div class="relative w-full h-full">
        {/* Remote video */}
        <div class="w-full h-full relative bg-gray-900 flex items-center justify-center">
          <video ref={remoteVideoEl} autoplay playsinline class={remoteStream() ? "w-full h-full object-cover" : "hidden"} />
          <Show when={!remoteStream()}>
            <div class="text-white text-xl font-medium">
              {statusText[callStatus()] ?? "Connecting..."}
            </div>
          </Show>
        </div>

        {/* Local video PiP */}
        <div class="absolute top-4 right-4 w-36 h-24 bg-gray-900 rounded-xl overflow-hidden shadow-lg">
          <video ref={localVideoEl} autoplay playsinline muted class="w-full h-full object-cover" />
        </div>

        {/* Controls */}
        <div class="absolute bottom-6 left-1/2 -translate-x-1/2 flex gap-4 items-center bg-black/50 backdrop-blur-sm rounded-full px-6 py-3">
          <button
            class={`w-12 h-12 rounded-full flex items-center justify-center text-white border-0 cursor-pointer transition-colors ${videoOn() ? "bg-white/20 hover:bg-white/30" : "bg-red-500 hover:bg-red-600"}`}
            onClick={() => { const on = activeCall()?.toggleVideo(); setVideoOn(!!on); }}
            title={videoOn() ? "Turn off camera" : "Turn on camera"}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              {videoOn()
                ? <><rect x="2" y="5" width="14" height="14" rx="2"/><polygon points="23 7 17 12 23 17 23 7"/></>
                : <><path d="M10.66 5H14a2 2 0 012 2v3.34"/><path d="M1 1l22 22"/><path d="M2 7a2 2 0 00-2 2v8a2 2 0 002 2h10"/><polygon points="23 7 17 12 23 17 23 7"/></>
              }
            </svg>
          </button>
          <button
            class={`w-12 h-12 rounded-full flex items-center justify-center text-white border-0 cursor-pointer transition-colors ${audioOn() ? "bg-white/20 hover:bg-white/30" : "bg-red-500 hover:bg-red-600"}`}
            onClick={() => { const on = activeCall()?.toggleAudio(); setAudioOn(!!on); }}
            title={audioOn() ? "Mute microphone" : "Unmute microphone"}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              {audioOn()
                ? <><rect x="9" y="1" width="6" height="12" rx="3"/><path d="M19 10v1a7 7 0 01-14 0v-1"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/></>
                : <><line x1="1" y1="1" x2="23" y2="23"/><path d="M9 9v3a3 3 0 005.12 2.12M15 9.34V4a3 3 0 00-5.94-.6"/><path d="M17 16.95A7 7 0 015 12v-2m14 0v2c0 .67-.1 1.32-.27 1.93"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/></>
              }
            </svg>
          </button>
          <button
            class="w-14 h-14 rounded-full bg-red-500 hover:bg-red-600 flex items-center justify-center text-white border-0 cursor-pointer transition-colors"
            onClick={endCall}
            title="End call"
          >
            <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor"><path d="M12 9c-1.6 0-3.15.25-4.6.72v3.1c0 .39-.23.74-.56.9-.98.49-1.87 1.12-2.66 1.85-.18.18-.43.28-.7.28-.28 0-.53-.11-.71-.29L.29 13.08a.99.99 0 01-.29-.7c0-.28.11-.53.29-.71C3.34 8.78 7.46 7 12 7s8.66 1.78 11.71 4.67c.18.18.29.43.29.71 0 .28-.11.53-.29.71l-2.48 2.48c-.18.18-.43.29-.71.29-.27 0-.52-.1-.7-.28-.79-.73-1.68-1.36-2.66-1.85a.994.994 0 01-.56-.9v-3.1C15.15 9.25 13.6 9 12 9z"/></svg>
          </button>
        </div>
      </div>
    </div>
  );
}
```

**Step 3: Update IncomingCall.tsx** — after reading the file in Step 1, replace CSS class strings with equivalent Tailwind utilities following the same patterns as above.

---

## Task 9: Rewrite Toast.tsx with Tailwind

**Files:**
- Rewrite: `.worktrees/feature/ux-reliability/client/src/components/Toast.tsx`

**Step 1: Replace file**

```tsx
import { createSignal, For } from "solid-js";

interface Toast {
  id: number;
  message: string;
  type: "info" | "error" | "success";
}

const [toasts, setToasts] = createSignal<Toast[]>([]);
let nextId = 0;

export function showToast(message: string, type: Toast["type"] = "info", duration = 3000) {
  const id = nextId++;
  setToasts((prev) => [...prev.slice(-2), { id, message, type }]);
  setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), duration);
}

export function ToastContainer() {
  return (
    <div class="fixed bottom-6 right-6 flex flex-col gap-2 z-[1000]">
      <For each={toasts()}>
        {(t) => (
          <div class={`px-4 py-2.5 rounded-[10px] bg-white shadow-md text-sm min-w-[220px] animate-toast-in ${t.type === "error" ? "border-l-[3px] border-red-500" : t.type === "success" ? "border-l-[3px] border-green-500" : ""}`}>
            {t.message}
          </div>
        )}
      </For>
    </div>
  );
}
```

---

## Task 10: Final Verify + Commit

**Step 1: Run tests**

```bash
cd .worktrees/feature/ux-reliability && bun run test 2>&1 | tail -10
```

Expected: 16 server + 4 client tests pass.

**Step 2: Build check**

```bash
cd .worktrees/feature/ux-reliability/client && bun run build 2>&1 | tail -5
```

Expected: build succeeds, no TS errors.

**Step 3: Commit**

```bash
cd .worktrees/feature/ux-reliability
git add -A
git commit -m "migrate to Tailwind CSS v4"
```

**Step 4: Continue with UX improvements**

After this commit, continue implementing the UX & reliability improvements from `docs/plans/2026-03-10-ux-reliability-improvements.md`, but use Tailwind utilities instead of the CSS class strings defined in that plan.
