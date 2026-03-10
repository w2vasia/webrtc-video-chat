# UX & Reliability Improvements

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Improve daily usability (typing indicators, read receipts, call flow polish) and core reliability (WS reconnection, ICE restart, TURN server support).

---

## PR 1 — Message UX

### Task 1: Toast System

**Files:**
- Add: `client/src/components/Toast.tsx`
- Modify: `client/src/styles/global.css`
- Modify: `client/src/pages/Chat.tsx`

**Step 1: Create toast store**

In `Toast.tsx`, export a `toasts` signal and `showToast(msg, duration=3000)` helper. Each toast: `{id, message, type: 'info'|'error'|'success'}`.

**Step 2: Toast component**

```tsx
// fixed bottom-right stack, max 3 visible, slide-in animation
<div class="toast-container">
  <For each={toasts()}>
    {t => <div class={`toast toast-${t.type}`}>{t.message}</div>}
  </For>
</div>
```

**Step 3: Mount in Chat.tsx**

Add `<ToastContainer />` inside the Chat page root.

**Step 4: CSS**

```css
.toast-container { position: fixed; bottom: 1.5rem; right: 1.5rem; display: flex; flex-direction: column; gap: 0.5rem; z-index: 1000; }
.toast { padding: 0.625rem 1rem; border-radius: var(--radius); background: var(--surface); box-shadow: var(--shadow-md); font-size: 0.875rem; min-width: 220px; animation: toast-in 0.2s ease; }
.toast-error { border-left: 3px solid var(--danger); }
.toast-success { border-left: 3px solid var(--success); }
@keyframes toast-in { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: none; } }
```

**Verify:** Call `showToast('Hello')` from console — toast appears and auto-dismisses.

---

### Task 2: Typing Indicators

**Files:**
- Modify: `server/src/routes/ws.ts` (or wherever WS messages are handled)
- Modify: `client/src/lib/ws.ts`
- Modify: `client/src/components/ChatWindow.tsx`
- Modify: `client/src/styles/global.css`

**Step 1: Server relay**

Add `typing` to WS message whitelist. Relay `{type:"typing", from, to, isTyping}` to recipient — no persistence.

```ts
case 'typing':
  const typingPayload = { type: 'typing', from: userId, to: msg.to, isTyping: msg.isTyping }
  relayToUser(msg.to, typingPayload)
  break
```

**Step 2: Client send**

In `ChatWindow`, on textarea keydown send typing=true; debounce 2s to send typing=false on idle. Also send false on blur.

```ts
let typingTimer: ReturnType<typeof setTimeout>
function handleKeydown() {
  sendTyping(friendId, true)
  clearTimeout(typingTimer)
  typingTimer = setTimeout(() => sendTyping(friendId, false), 2000)
}
```

**Step 3: Client receive**

In `ws.ts`, on `type === 'typing'`, update a `typingUsers: Map<number, boolean>` signal in `chat.ts`.

**Step 4: Typing bubble in ChatWindow**

```tsx
<Show when={isTyping()}>
  <div class="typing-bubble">
    <span class="dot" /><span class="dot" /><span class="dot" />
  </div>
</Show>
```

**Step 5: CSS**

```css
.typing-bubble { display: flex; gap: 4px; padding: 10px 14px; background: var(--chat-surface); border-radius: var(--radius-lg); border-bottom-left-radius: 4px; width: fit-content; margin-bottom: 0.5rem; }
.typing-bubble .dot { width: 6px; height: 6px; border-radius: 50%; background: var(--text-muted); animation: bounce 1.2s infinite; }
.typing-bubble .dot:nth-child(2) { animation-delay: 0.2s; }
.typing-bubble .dot:nth-child(3) { animation-delay: 0.4s; }
@keyframes bounce { 0%, 60%, 100% { transform: translateY(0); } 30% { transform: translateY(-4px); } }
```

**Verify:** Open two tabs, type in one — typing bubble appears in the other.

---

### Task 3: Read Receipts

**Files:**
- Modify: `server/src/db/migrations.ts` (or equivalent migration file)
- Modify: `server/src/routes/ws.ts`
- Modify: `client/src/lib/ws.ts`
- Modify: `client/src/components/ChatWindow.tsx`
- Modify: `client/src/styles/global.css`

**Step 1: DB migration**

```sql
ALTER TABLE messages ADD COLUMN read_at INTEGER;
```

**Step 2: Server — handle read event**

```ts
case 'read':
  // mark message read in DB
  db.run('UPDATE messages SET read_at = ? WHERE id = ? AND recipient_id = ?',
    [Date.now(), msg.messageId, userId])
  // relay to sender
  relayToUser(msg.from, { type: 'read', messageId: msg.messageId })
  break
```

**Step 3: Client — send read on open/receive**

When `ChatWindow` mounts or receives a new message while focused, send `{type:"read", messageId, from: friendId}` for all unread messages.

**Step 4: Client — track read state**

Message type gains `readAt?: number`. `chat.ts` updates message in store on incoming `read` event.

**Step 5: Checkmark display in ChatWindow**

For outgoing messages only:
- No ACK yet: clock icon (⏱ or gray dot)
- ACKed (serverId set), not read: `✓`
- Read: `✓✓` in primary color

```tsx
<Show when={msg.from === 0}>
  <span class={`msg-status ${msg.readAt ? 'read' : msg.serverId ? 'delivered' : 'pending'}`}>
    {msg.readAt ? '✓✓' : msg.serverId ? '✓' : '·'}
  </span>
</Show>
```

**Verify:** Send message, open chat on recipient tab — checkmark turns blue.

---

## PR 2 — Call Flow Polish

### Task 4: callStatus Signal

**Files:**
- Modify: `client/src/store/call.ts`
- Modify: `client/src/components/VideoCall.tsx`
- Modify: `client/src/components/ChatWindow.tsx` (start call button)

**Step 1: Replace boolean flags with status**

```ts
export type CallStatus = 'idle' | 'calling' | 'ringing' | 'connecting' | 'connected' | 'ended'
export const [callStatus, setCallStatus] = createSignal<CallStatus>('idle')
```

**Step 2: Update transitions**
- Caller dials → `calling`
- Callee accepts → both go to `connecting`
- ICE `connected` → `connected`
- Either hangs up → `ended` (briefly, then `idle`)

**Step 3: Status display in VideoCall**

Show status text in header overlay:
```tsx
<Show when={callStatus() !== 'connected'}>
  <div class="call-status-overlay">{statusText[callStatus()]}</div>
</Show>
```

---

### Task 5: Call Timer

**Files:**
- Modify: `client/src/components/VideoCall.tsx`

**Step 1: Timer signal**

```ts
const [elapsed, setElapsed] = createSignal(0)
let timerInterval: ReturnType<typeof setInterval>

createEffect(() => {
  if (callStatus() === 'connected') {
    timerInterval = setInterval(() => setElapsed(e => e + 1), 1000)
  } else {
    clearInterval(timerInterval)
    setElapsed(0)
  }
})
onCleanup(() => clearInterval(timerInterval))
```

**Step 2: Format + display**

```ts
const formatTime = (s: number) => `${String(Math.floor(s/60)).padStart(2,'0')}:${String(s%60).padStart(2,'0')}`
```

Show `formatTime(elapsed())` in VideoCall header when `callStatus() === 'connected'`.

---

### Task 6: Connection Status Dot + End-Call Toast

**Files:**
- Modify: `client/src/pages/Chat.tsx`
- Modify: `client/src/lib/ws.ts`
- Modify: `client/src/styles/global.css`

**Step 1: WS connection signal**

`ws.ts` exports `[wsConnected, setWsConnected] = createSignal(false)`. Set true on open, false on close.

**Step 2: Status dot in sidebar header**

```tsx
<span class={`status-dot ${wsConnected() ? 'online' : 'offline'}`} title={wsConnected() ? 'Connected' : 'Reconnecting...'} />
```

```css
.status-dot { width: 8px; height: 8px; border-radius: 50%; background: var(--text-muted); }
.status-dot.online { background: var(--success); }
.status-dot.offline { background: var(--danger); animation: pulse 1.5s infinite; }
```

**Step 3: End-call toast**

When remote hangs up: `showToast('Call ended by [name]')`
When self hangs up after >5s: `showToast('Call ended (1:23)')`

---

## PR 3 — Reliability

### Task 7: WS Reconnect with Exponential Backoff

**Files:**
- Modify: `client/src/lib/ws.ts`

**Step 1: Backoff logic**

```ts
let retryDelay = 1000
const MAX_DELAY = 30000

function connect() {
  const ws = new WebSocket(WS_URL)
  ws.onopen = () => { retryDelay = 1000; setWsConnected(true); replayUnacked() }
  ws.onclose = () => {
    setWsConnected(false)
    setTimeout(() => { retryDelay = Math.min(retryDelay * 2, MAX_DELAY); connect() }, retryDelay)
  }
}
```

**Step 2: Re-auth on reconnect**

On open, send `{type:"auth", token}` before anything else (same as initial connect).

---

### Task 8: Unacked Message Queue

**Files:**
- Modify: `client/src/lib/ws.ts`
- Modify: `client/src/store/chat.ts`

**Step 1: Pending queue**

```ts
const pendingMessages: Map<string, object> = new Map() // clientId → message payload

export function sendMessage(payload: object & {clientId: string}) {
  pendingMessages.set(payload.clientId, payload)
  ws.send(JSON.stringify(payload))
}

export function ackMessage(clientId: string) {
  pendingMessages.delete(clientId)
}
```

**Step 2: Replay on reconnect**

```ts
function replayUnacked() {
  for (const payload of pendingMessages.values()) {
    ws.send(JSON.stringify(payload))
  }
}
```

Call `ackMessage(clientId)` when server ACK arrives.

---

### Task 9: ICE Servers Endpoint + TURN Support

**Files:**
- Modify: `server/src/routes/` (add `ice.ts`)
- Modify: `server/src/index.ts`
- Modify: `client/src/lib/webrtc.ts`
- Modify: `.env.example`

**Step 1: Server endpoint**

```ts
// GET /api/ice-servers
app.get('/api/ice-servers', authMiddleware(), (c) => {
  const servers: RTCIceServer[] = [
    { urls: 'stun:stun.l.google.com:19302' }
  ]
  if (process.env.TURN_URL) {
    servers.push({
      urls: process.env.TURN_URL,
      username: process.env.TURN_USERNAME,
      credential: process.env.TURN_CREDENTIAL,
    })
  }
  return c.json(servers)
})
```

**Step 2: Client fetch on call start**

```ts
async function getIceServers(): Promise<RTCIceServer[]> {
  const res = await fetch('/api/ice-servers', { headers: authHeader() })
  return res.ok ? res.json() : [{ urls: 'stun:stun.l.google.com:19302' }]
}
```

Replace hardcoded ICE config in `webrtc.ts` with `await getIceServers()`.

**Step 3: .env.example additions**

```
TURN_URL=
TURN_USERNAME=
TURN_CREDENTIAL=
```

---

### Task 10: ICE Restart on Disconnect

**Files:**
- Modify: `client/src/lib/webrtc.ts`

**Step 1: Monitor connection state**

```ts
pc.onconnectionstatechange = () => {
  const state = pc.connectionState
  if (state === 'disconnected') {
    reconnectTimer = setTimeout(() => attemptIceRestart(), 2000)
  } else if (state === 'failed') {
    attemptIceRestart()
  } else if (state === 'connected') {
    clearTimeout(reconnectTimer)
    setCallStatus('connected')
  }
}
```

**Step 2: ICE restart**

```ts
async function attemptIceRestart() {
  setCallStatus('connecting') // shows "Reconnecting..." overlay
  const offer = await pc.createOffer({ iceRestart: true })
  await pc.setLocalDescription(offer)
  sendSignal({ type: 'offer', sdp: offer.sdp, iceRestart: true })

  // auto-hangup after 15s if still not connected
  giveUpTimer = setTimeout(() => {
    hangup()
    showToast('Call lost', 'error')
  }, 15000)
}
```

**Verify:** Disable/re-enable network during call — overlay shows, call recovers.
