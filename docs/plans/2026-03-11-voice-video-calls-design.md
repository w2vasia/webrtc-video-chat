# Voice & Video Calls Design

## Overview

Add distinct voice and video call types. Voice calls use a minimal centered card overlay; video calls use the existing fullscreen layout. Either party can upgrade a voice call to video mid-call.

## Call Types & Initiation

Two buttons in the chat header replace the single "Call" button:
- **Phone icon** → voice call (audio only, no camera requested)
- **Camera icon** → video call (audio + video)

`call-offer` WebSocket message includes `callType: "voice" | "video"`. Receiver sees "Incoming voice call" or "Incoming video call".

## Call UIs

### Voice Call — Centered Card Overlay

Dimmed backdrop with a centered modal card containing:
- Friend's name
- Call timer (MM:SS)
- Controls: mute, end call, "turn on camera" button

### Video Call — Fullscreen (unchanged)

Current fullscreen layout with remote video, local PiP, and controls (camera toggle, mute, end).

## Mid-Call Camera Upgrade

1. User taps "turn on camera" during voice call
2. `getUserMedia({ video: true })` gets camera track, `pc.addTrack()` adds it to peer connection
3. `{ type: "camera-on", targetId }` sent via WebSocket to notify remote
4. Remote side sees prompt in voice card: "Friend turned on camera" + "Expand" button
5. Tapping "Expand" switches to fullscreen video layout
6. User can optionally enable their own camera from there

## WebRTC Changes

**`WebRTCCall` class**:
- `callType` parameter added to `create()` and constructor
- Voice: `startLocalMedia(false, true)` — audio only
- Video: `startLocalMedia(true, true)` — current behavior
- New `addVideoTrack()` method: gets camera via `getUserMedia`, adds track via `pc.addTrack()`

**Signaling**:
- `call-offer` gains `callType` field (server relays as-is, just whitelist)
- New `camera-on` message type for mid-call video notification

## State Changes (`store/call.ts`)

New signals:
- `callType: "voice" | "video"` — set at call start or accept
- `remoteVideoPrompt: boolean` — true when remote enabled camera, awaiting user expand

Modified functions:
- `startCall(targetId, type)` — takes call type
- `acceptCall()` — reads `callType` from pending offer data

New functions:
- `enableCamera()` — adds video track + sends `camera-on` signal
- `expandToVideo()` — switches to fullscreen view, clears prompt

## Component Changes

### `ChatWindow.tsx` header
Replace single "Call" button with two icon buttons (phone + camera).
`onStartCall: (friendId: number, type: "voice" | "video") => void`

### `VideoCall.tsx` → `CallView.tsx`
Handles both call types:
- `callType === "voice"`: centered card (name, timer, controls, camera-on button)
- `callType === "video"` or expanded: fullscreen layout
- "Friend turned on camera" banner with "Expand" button when `remoteVideoPrompt` is true

### `IncomingCall.tsx`
Displays "Incoming voice call" or "Incoming video call" based on `callType`.

### `Chat.tsx`
Passes call type through to `startCall`. Renders `CallView` instead of `VideoCall`.

## What Stays the Same

- WebRTC connection lifecycle (offer/answer/ICE)
- Mute/unmute audio
- ICE restart and reconnection logic
- End call flow
- Ringtone
- Server-side WebSocket relay (just whitelist new fields)
