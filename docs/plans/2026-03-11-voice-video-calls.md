# Voice & Video Calls Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add distinct voice and video call types with mid-call camera upgrade.

**Architecture:** Two call buttons (phone/camera) in chat header. Voice calls render a centered card overlay; video calls use existing fullscreen layout. Either party can add video mid-call, prompting the other to expand. Server relays new `callType` field and `camera-on` message.

**Tech Stack:** SolidJS, WebRTC, WebSocket, Hono, bun:test

---

### Task 1: Server — relay `callType` in call-offer and add `camera-on` message

**Files:**
- Modify: `server/src/ws.ts:169-177` (call-offer case)
- Modify: `server/src/ws.ts:283-286` (add camera-on case before default)
- Test: `server/src/ws.test.ts`

**Step 1: Write failing tests**

Add to the `message — call signaling` describe block in `server/src/ws.test.ts`:

```typescript
  it("relays callType in call-offer to target", async () => {
    await handlers.message(
      wsA as unknown as ServerWebSocket<WsData>,
      JSON.stringify({ type: "call-offer", targetId: userBId, offer: { sdp: "v=0...", type: "offer" }, callType: "voice" }),
    );

    const msg = lastMsg(wsB);
    expect(msg.type).toBe("call-offer");
    expect(msg.callType).toBe("voice");
  });

  it("relays camera-on to target", async () => {
    await handlers.message(
      wsA as unknown as ServerWebSocket<WsData>,
      JSON.stringify({ type: "camera-on", targetId: userBId }),
    );

    const msg = lastMsg(wsB);
    expect(msg.type).toBe("camera-on");
    expect(msg.senderId).toBe(userAId);
  });

  it("drops camera-on to non-friend", async () => {
    const userC = await createUser(db, "charlie@test.com", "Charlie");
    const wsC = makeMockWs();
    await authWs(handlers, wsC, userC.id, "charlie@test.com");
    wsB.sent = [];

    await handlers.message(
      wsC as unknown as ServerWebSocket<WsData>,
      JSON.stringify({ type: "camera-on", targetId: userBId }),
    );

    expect(wsB.sent).toHaveLength(0);
  });
```

**Step 2: Run tests to verify they fail**

Run: `bun test server/src/ws.test.ts`
Expected: 2 failures (callType not relayed, camera-on unknown type)

**Step 3: Implement server changes**

In `server/src/ws.ts`, modify the `call-offer` case to include `callType`:

```typescript
        case "call-offer": {
          if (typeof data.targetId !== "number" || !isFriend(data.targetId)) break;
          if (typeof data.offer?.sdp !== "string" || data.offer.sdp.length > MAX_SDP) break;
          const callType = data.callType === "voice" || data.callType === "video" ? data.callType : "video";
          pendingOffers.set(callKey(userId, data.targetId), { callerId: userId, calleeId: data.targetId, offeredAt: Date.now() });
          const target = onlineUsers.get(data.targetId);
          if (target) {
            target.ws.send(JSON.stringify({ type: "call-offer", senderId: userId, offer: data.offer, callType }));
          }
          break;
        }
```

Add new `camera-on` case before the `default` case:

```typescript
        case "camera-on": {
          if (typeof data.targetId !== "number" || !isFriend(data.targetId)) break;
          const target = onlineUsers.get(data.targetId);
          if (target) {
            target.ws.send(JSON.stringify({ type: "camera-on", senderId: userId }));
          }
          break;
        }
```

**Step 4: Run tests to verify they pass**

Run: `bun test server/src/ws.test.ts`
Expected: all pass

**Step 5: Commit**

```bash
git add server/src/ws.ts server/src/ws.test.ts
git commit -m "feat: relay callType in call-offer + add camera-on signaling"
```

---

### Task 2: WebRTC — add `callType` param and `addVideoTrack()` method

**Files:**
- Modify: `client/src/lib/webrtc.ts`

No test file — WebRTC relies on browser APIs (navigator.mediaDevices, RTCPeerConnection) unavailable in bun test runner.

**Step 1: Add callType to create() and constructor**

In `client/src/lib/webrtc.ts`, add a `callType` field and update `create()`:

```typescript
export type CallType = "voice" | "video";
```

Add field to class:
```typescript
  callType: CallType;
```

Update `create()` signature:
```typescript
  static async create(targetId: number, callType: CallType = "video"): Promise<WebRTCCall> {
    const iceServers = await getIceServers();
    return new WebRTCCall(targetId, callType, { iceServers, iceCandidatePoolSize: 10 });
  }
```

Update constructor:
```typescript
  constructor(targetId: number, callType: CallType = "video", config?: RTCConfiguration) {
    this.targetId = targetId;
    this.callType = callType;
    // ... rest unchanged
  }
```

**Step 2: Update startLocalMedia call convention**

The existing `startLocalMedia(video, audio)` already supports `video=false`. No change needed to the method itself. Callers will pass the right values based on `callType`.

**Step 3: Add addVideoTrack() method**

Add after `toggleAudio()`:

```typescript
  async addVideoTrack(): Promise<MediaStream> {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: "user" },
    });
    const videoTrack = stream.getVideoTracks()[0];
    this.pc.addTrack(videoTrack, this.localStream!);
    if (this.localStream) {
      this.localStream.addTrack(videoTrack);
    }
    this.callType = "video";
    return this.localStream!;
  }
```

**Step 4: Update createOffer to include callType**

```typescript
  async createOffer(): Promise<void> {
    const offer = await this.pc.createOffer();
    await this.pc.setLocalDescription(offer);
    wsClient.send({ type: "call-offer", targetId: this.targetId, offer, callType: this.callType });
  }
```

**Step 5: Commit**

```bash
git add client/src/lib/webrtc.ts
git commit -m "feat: WebRTCCall supports callType + addVideoTrack for mid-call upgrade"
```

---

### Task 3: Store — add callType, remoteVideoPrompt, enableCamera, expandToVideo

**Files:**
- Modify: `client/src/store/call.ts`

**Step 1: Add new signals and imports**

Add import of `CallType` and new signals after existing ones:

```typescript
import { WebRTCCall, type CallType } from "../lib/webrtc";
```

```typescript
const [callType, setCallType] = createSignal<CallType>("video");
const [remoteVideoPrompt, setRemoteVideoPrompt] = createSignal(false);
```

**Step 2: Store callType from incoming offer**

In `setupCallListeners`, update the `call-offer` handler to store callType. Add a module-level variable:

```typescript
let pendingCallType: CallType = "video";
```

In the `call-offer` handler, after `pendingSenderId = data.senderId;`:

```typescript
      pendingCallType = data.callType || "video";
```

**Step 3: Add camera-on listener**

In `setupCallListeners`, add after the `call-end` listener:

```typescript
    unsubs.push(wsClient.on("camera-on", () => {
      if (callStatus() === "connected" || callStatus() === "connecting") {
        setRemoteVideoPrompt(true);
      }
    }));
```

**Step 4: Update startCall to accept callType**

```typescript
  async function startCall(targetId: number, type: CallType = "video") {
    setCallError("");
    setCallType(type);
    setRemoteVideoPrompt(false);
    try {
      const call = await WebRTCCall.create(targetId, type);
      call.onRemoteStream = (s) => setRemoteStream(s);
      call.onConnected = () => setCallStatus("connected");
      call.onEnded = () => endCall();
      call.onReconnecting = () => setCallStatus("connecting");
      call.onFailed = () => showToast("Call lost", "error");

      const stream = await call.startLocalMedia(type === "video");
      setLocalStream(stream);
      setActiveCall(call);
      setCallTargetId(targetId);
      setCallStatus("calling");

      await call.createOffer();
    } catch (e) {
      console.error("Failed to start call", e);
      setCallError(e instanceof Error ? e.message : "Failed to start call");
      endCall();
    }
  }
```

**Step 5: Update acceptCall to use pendingCallType**

In `acceptCall`, after creating the WebRTCCall:

```typescript
    setCallType(pendingCallType);
    setRemoteVideoPrompt(false);
```

And pass callType to `create` and `startLocalMedia`:

```typescript
      const call = await WebRTCCall.create(senderId, pendingCallType);
      // ... callbacks ...
      const stream = await call.startLocalMedia(pendingCallType === "video");
```

**Step 6: Add enableCamera function**

```typescript
  async function enableCamera() {
    const call = activeCall();
    if (!call) return;
    try {
      const stream = await call.addVideoTrack();
      setLocalStream(new MediaStream(stream.getTracks()));
      setCallType("video");
      wsClient.send({ type: "camera-on", targetId: call.targetId });
    } catch (e) {
      console.error("Failed to enable camera", e);
      showToast("Could not access camera", "error");
    }
  }
```

**Step 7: Add expandToVideo function**

```typescript
  function expandToVideo() {
    setRemoteVideoPrompt(false);
    setCallType("video");
  }
```

**Step 8: Update endCall to reset new signals**

In `endCall`, add:

```typescript
    setRemoteVideoPrompt(false);
```

**Step 9: Export new values from return**

Add to the return object:

```typescript
    callType,
    remoteVideoPrompt,
    enableCamera,
    expandToVideo,
```

**Step 10: Commit**

```bash
git add client/src/store/call.ts
git commit -m "feat: call store supports callType, camera-on prompt, mid-call upgrade"
```

---

### Task 4: CallView component — voice card + video fullscreen

**Files:**
- Create: `client/src/components/CallView.tsx` (replaces VideoCall.tsx)
- Delete: `client/src/components/VideoCall.tsx`

**Step 1: Create CallView.tsx**

This component handles both voice (card) and video (fullscreen) UIs:

```tsx
import { createSignal, createEffect, onCleanup, Show } from "solid-js";
import { useCall } from "../store/call";

function bindStream(el: HTMLVideoElement, stream: MediaStream | null) {
  if (!stream) return;
  el.srcObject = stream;
  el.play().catch(() => {});
}

export default function CallView() {
  const {
    localStream, remoteStream, activeCall, endCall, callStatus,
    callType, remoteVideoPrompt, enableCamera, expandToVideo,
  } = useCall();
  const [videoOn, setVideoOn] = createSignal(true);
  const [audioOn, setAudioOn] = createSignal(true);
  let remoteVideoEl: HTMLVideoElement | undefined;
  let localVideoEl: HTMLVideoElement | undefined;

  createEffect(() => { if (remoteVideoEl) bindStream(remoteVideoEl, remoteStream()); });
  createEffect(() => { if (localVideoEl) bindStream(localVideoEl, localStream()); });

  const statusText: Record<string, string> = {
    calling: "Calling...",
    connecting: "Connecting...",
    ended: "Call ended",
  };

  const [elapsed, setElapsed] = createSignal(0);

  createEffect(() => {
    if (callStatus() === "connected") {
      const id = setInterval(() => setElapsed((e) => e + 1), 1000);
      onCleanup(() => clearInterval(id));
    } else {
      setElapsed(0);
    }
  });

  function formatTime(s: number) {
    return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
  }

  const isVideoView = () => callType() === "video";

  return (
    <Show when={isVideoView()} fallback={
      /* Voice call — centered card */
      <div class="fixed inset-0 z-50 bg-black/60 flex items-center justify-center">
        <div class="bg-gray-900 rounded-2xl p-8 flex flex-col items-center gap-4 shadow-2xl w-80">
          {/* Name */}
          <h3 class="text-white text-lg font-semibold m-0">Voice Call</h3>

          {/* Status / Timer */}
          <div class="text-white/70 text-sm">
            <Show when={callStatus() === "connected"} fallback={statusText[callStatus()] ?? "..."}>
              {formatTime(elapsed())}
            </Show>
          </div>

          {/* Remote video prompt */}
          <Show when={remoteVideoPrompt()}>
            <div class="flex items-center gap-2 bg-white/10 rounded-lg px-4 py-2 text-sm text-white">
              <span>Friend turned on camera</span>
              <button
                class="px-3 py-1 bg-primary hover:bg-primary-hover text-white rounded-full text-xs font-medium border-0 cursor-pointer transition-colors"
                onClick={expandToVideo}
              >
                Expand
              </button>
            </div>
          </Show>

          {/* Controls */}
          <div class="flex gap-3 items-center mt-2">
            {/* Mute */}
            <button
              class={`w-12 h-12 rounded-full flex items-center justify-center text-white border-0 cursor-pointer transition-colors ${audioOn() ? "bg-white/20 hover:bg-white/30" : "bg-danger hover:bg-danger-hover"}`}
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
            {/* Camera on */}
            <button
              class="w-12 h-12 rounded-full flex items-center justify-center text-white bg-white/20 hover:bg-white/30 border-0 cursor-pointer transition-colors"
              onClick={enableCamera}
              title="Turn on camera"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <rect x="2" y="5" width="14" height="14" rx="2"/><polygon points="23 7 17 12 23 17 23 7"/>
              </svg>
            </button>
            {/* End */}
            <button
              class="w-14 h-14 rounded-full bg-danger hover:bg-danger-hover flex items-center justify-center text-white border-0 cursor-pointer transition-colors"
              onClick={endCall}
              title="End call"
            >
              <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor"><path d="M12 9c-1.6 0-3.15.25-4.6.72v3.1c0 .39-.23.74-.56.9-.98.49-1.87 1.12-2.66 1.85-.18.18-.43.28-.7.28-.28 0-.53-.11-.71-.29L.29 13.08a.99.99 0 01-.29-.7c0-.28.11-.53.29-.71C3.34 8.78 7.46 7 12 7s8.66 1.78 11.71 4.67c.18.18.29.43.29.71 0 .28-.11.53-.29.71l-2.48 2.48c-.18.18-.43.29-.71.29-.27 0-.52-.1-.7-.28-.79-.73-1.68-1.36-2.66-1.85a.994.994 0 01-.56-.9v-3.1C15.15 9.25 13.6 9 12 9z"/></svg>
            </button>
          </div>
        </div>
      </div>
    }>
      {/* Video call — fullscreen (existing layout) */}
      <div class="fixed inset-0 z-50 bg-black flex items-center justify-center">
        <div class="relative w-full h-full">
          {/* Remote video */}
          <div class="w-full h-full relative bg-gray-900">
            <video ref={remoteVideoEl} autoplay playsinline class={remoteStream() ? "w-full h-full object-cover" : "hidden"} />
          </div>

          {/* Status/timer overlay */}
          <div class="absolute top-4 left-1/2 -translate-x-1/2 px-3 py-1.5 bg-black/50 rounded-full text-white text-sm">
            <Show when={callStatus() === "connected"} fallback={statusText[callStatus()] ?? "..."}>
              {formatTime(elapsed())}
            </Show>
          </div>

          {/* Local video PiP */}
          <div class="absolute top-4 right-4 w-36 h-24 bg-gray-900 rounded-xl overflow-hidden shadow-lg">
            <video ref={localVideoEl} autoplay playsinline muted class="w-full h-full object-cover" />
          </div>

          {/* Controls */}
          <div class="absolute bottom-6 left-1/2 -translate-x-1/2 flex gap-4 items-center bg-black/50 backdrop-blur-sm rounded-full px-6 py-3">
            <button
              class={`w-12 h-12 rounded-full flex items-center justify-center text-white border-0 cursor-pointer transition-colors ${videoOn() ? "bg-white/20 hover:bg-white/30" : "bg-danger hover:bg-danger-hover"}`}
              onClick={() => { const on = activeCall()?.toggleVideo(); setVideoOn(!!on); }}
              aria-pressed={!videoOn() ? "true" : "false"}
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
              class={`w-12 h-12 rounded-full flex items-center justify-center text-white border-0 cursor-pointer transition-colors ${audioOn() ? "bg-white/20 hover:bg-white/30" : "bg-danger hover:bg-danger-hover"}`}
              onClick={() => { const on = activeCall()?.toggleAudio(); setAudioOn(!!on); }}
              aria-pressed={!audioOn() ? "true" : "false"}
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
              class="w-14 h-14 rounded-full bg-danger hover:bg-danger-hover flex items-center justify-center text-white border-0 cursor-pointer transition-colors"
              onClick={endCall}
              title="End call"
            >
              <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor"><path d="M12 9c-1.6 0-3.15.25-4.6.72v3.1c0 .39-.23.74-.56.9-.98.49-1.87 1.12-2.66 1.85-.18.18-.43.28-.7.28-.28 0-.53-.11-.71-.29L.29 13.08a.99.99 0 01-.29-.7c0-.28.11-.53.29-.71C3.34 8.78 7.46 7 12 7s8.66 1.78 11.71 4.67c.18.18.29.43.29.71 0 .28-.11.53-.29.71l-2.48 2.48c-.18.18-.43.29-.71.29-.27 0-.52-.1-.7-.28-.79-.73-1.68-1.36-2.66-1.85a.994.994 0 01-.56-.9v-3.1C15.15 9.25 13.6 9 12 9z"/></svg>
            </button>
          </div>
        </div>
      </div>
    </Show>
  );
}
```

**Step 2: Delete VideoCall.tsx**

```bash
rm client/src/components/VideoCall.tsx
```

**Step 3: Commit**

```bash
git add client/src/components/CallView.tsx
git rm client/src/components/VideoCall.tsx
git commit -m "feat: CallView component — voice card overlay + video fullscreen"
```

---

### Task 5: IncomingCall — show call type

**Files:**
- Modify: `client/src/components/IncomingCall.tsx`

**Step 1: Update IncomingCall to display callType**

```tsx
import { onCleanup } from "solid-js";
import { useCall } from "../store/call";

export default function IncomingCall() {
  const { acceptCall, rejectCall, callType } = useCall();

  const timeout = setTimeout(() => rejectCall(), 30_000);
  onCleanup(() => clearTimeout(timeout));

  const icon = () => callType() === "voice"
    ? (
      <svg width="48" height="48" viewBox="0 0 24 24" fill="none" class="text-primary" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
        <path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07 19.5 19.5 0 01-6-6A19.79 19.79 0 012.12 4.18 2 2 0 014.11 2h3a2 2 0 012 1.72 12.84 12.84 0 00.7 2.81 2 2 0 01-.45 2.11L8.09 9.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45 12.84 12.84 0 002.81.7A2 2 0 0122 16.92z"/>
      </svg>
    )
    : (
      <svg width="48" height="48" viewBox="0 0 24 24" fill="none" class="text-primary" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
        <rect x="2" y="5" width="14" height="14" rx="2"/><polygon points="23 7 17 12 23 17 23 7"/>
      </svg>
    );

  return (
    <div class="fixed inset-0 z-50 bg-black/60 flex items-center justify-center">
      <div class="bg-white rounded-[10px] p-8 flex flex-col items-center gap-5 shadow-xl w-72">
        {icon()}
        <h3 class="text-lg font-semibold text-gray-900 m-0">
          Incoming {callType() === "voice" ? "voice" : "video"} call
        </h3>
        <div class="flex gap-3">
          <button
            class="px-5 py-2 rounded-full bg-success hover:bg-success-hover text-white font-medium border-0 cursor-pointer transition-colors"
            onClick={acceptCall}
          >
            Accept
          </button>
          <button
            class="px-5 py-2 rounded-full bg-danger hover:bg-danger-hover text-white font-medium border-0 cursor-pointer transition-colors"
            onClick={rejectCall}
          >
            Decline
          </button>
        </div>
      </div>
    </div>
  );
}
```

**Step 2: Commit**

```bash
git add client/src/components/IncomingCall.tsx
git commit -m "feat: IncomingCall shows voice vs video call type"
```

---

### Task 6: ChatWindow — two call buttons (phone + camera)

**Files:**
- Modify: `client/src/components/ChatWindow.tsx:48` (props type)
- Modify: `client/src/components/ChatWindow.tsx:169-175` (call button)

**Step 1: Update props type**

Change `onStartCall` prop type:

```typescript
export default function ChatWindow(props: { friendId: number; onBack: () => void; onStartCall?: (friendId: number, type: "voice" | "video") => void }) {
```

**Step 2: Replace single Call button with two icon buttons**

Replace the single call button (lines 169-175) with:

```tsx
        <div class="ml-auto flex items-center gap-1.5">
          <button
            class="flex items-center justify-center w-10 h-10 rounded-full bg-success hover:bg-success-hover text-white cursor-pointer transition-colors"
            onClick={() => props.onStartCall?.(props.friendId, "voice")}
            title="Voice call"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07 19.5 19.5 0 01-6-6A19.79 19.79 0 012.12 4.18 2 2 0 014.11 2h3a2 2 0 012 1.72 12.84 12.84 0 00.7 2.81 2 2 0 01-.45 2.11L8.09 9.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45 12.84 12.84 0 002.81.7A2 2 0 0122 16.92z"/></svg>
          </button>
          <button
            class="flex items-center justify-center w-10 h-10 rounded-full bg-success hover:bg-success-hover text-white cursor-pointer transition-colors"
            onClick={() => props.onStartCall?.(props.friendId, "video")}
            title="Video call"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="5" width="14" height="14" rx="2"/><polygon points="23 7 17 12 23 17 23 7"/></svg>
          </button>
        </div>
```

**Step 3: Update incoming call banner text**

In the incoming call banner (line 182), update "Incoming call" to show call type. Import `callType` from `useCall()` at the top of the component (it's already importing from `useCall`):

Add `callType` to the destructured imports:
```typescript
  const { callStatus, callTargetId, acceptCall, rejectCall, callType } = useCall();
```

Update the banner text:
```tsx
          <span>Incoming {callType() === "voice" ? "voice" : "video"} call</span>
```

**Step 4: Commit**

```bash
git add client/src/components/ChatWindow.tsx
git commit -m "feat: two call buttons (voice + video) in chat header"
```

---

### Task 7: Chat.tsx — wire up CallView and pass callType

**Files:**
- Modify: `client/src/pages/Chat.tsx`

**Step 1: Replace VideoCall import with CallView**

```typescript
import CallView from "../components/CallView";
```

Remove:
```typescript
import VideoCall from "../components/VideoCall";
```

**Step 2: Replace `<VideoCall />` with `<CallView />`**

In the JSX (line 60):

```tsx
        <CallView />
```

**Step 3: Verify startCall signature compatibility**

`startCall` from `useCall()` now accepts `(targetId, type)`. The `onStartCall={startCall}` prop in `<ChatWindow>` will pass both args since `ChatWindow` now calls `onStartCall(friendId, type)`. No change needed.

**Step 4: Commit**

```bash
git add client/src/pages/Chat.tsx
git commit -m "feat: wire CallView into Chat page"
```

---

### Task 8: Manual smoke test + final commit

**Step 1: Run server tests**

Run: `bun test server/`
Expected: all pass

**Step 2: Build client**

Run: `bun run build`
Expected: no TypeScript/build errors

**Step 3: Manual test checklist**

Run: `bun run dev`

- [ ] Chat header shows two buttons (phone + camera)
- [ ] Clicking phone starts voice call — card overlay appears
- [ ] Clicking camera starts video call — fullscreen layout
- [ ] Incoming call shows "voice" or "video" label
- [ ] In voice call, "turn on camera" adds video + notifies remote
- [ ] Remote sees "Friend turned on camera" + Expand button
- [ ] Expand switches to fullscreen video layout
- [ ] Mute/end call work in both views
- [ ] Call timer works in both views

**Step 4: Final commit if any fixes needed**

```bash
git add -A
git commit -m "fix: polish voice/video call integration"
```
