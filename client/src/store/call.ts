import { createSignal } from "solid-js";
import { WebRTCCall, type CallType } from "../lib/webrtc";
import { wsClient } from "../lib/ws";
import { showToast } from "../components/Toast";
import { startRingtone, stopRingtone } from "../lib/ringtone";

export type CallStatus = "idle" | "calling" | "incoming" | "connecting" | "connected" | "ended";

const [callStatus, setCallStatus] = createSignal<CallStatus>("idle");
const [activeCall, setActiveCall] = createSignal<WebRTCCall | null>(null);
const [localStream, setLocalStream] = createSignal<MediaStream | null>(null);
const [remoteStream, setRemoteStream] = createSignal<MediaStream | null>(null);
const [callTargetId, setCallTargetId] = createSignal<number | null>(null);
const [callError, setCallError] = createSignal<string>("");
const [callType, setCallType] = createSignal<CallType>("video");
const [remoteVideoPrompt, setRemoteVideoPrompt] = createSignal(false);

let pendingOffer: RTCSessionDescriptionInit | null = null;
let pendingSenderId: number | null = null;
let pendingCandidates: RTCIceCandidateInit[] = [];
let pendingCallType: CallType = "video";

export function useCall() {
  function setupCallListeners(): () => void {
    const unsubs: (() => void)[] = [];
    // eslint-disable-next-line solid/reactivity -- WS event handler, not reactive context
    unsubs.push(wsClient.on("call-offer", async (data) => {
      const existing = activeCall();
      if (existing && (data.iceRestart || data.renegotiate)) {
        await existing.handleOffer(data.offer);
        return;
      }
      if (callStatus() !== "idle") {
        wsClient.send({ type: "call-end", targetId: data.senderId });
        return;
      }
      pendingCandidates = [];
      setCallTargetId(data.senderId);
      setCallStatus("incoming");
      pendingOffer = data.offer;
      pendingSenderId = data.senderId;
      pendingCallType = data.callType || "video";
      setCallType(pendingCallType);
      startRingtone();
    }));

    // eslint-disable-next-line solid/reactivity -- WS event handler
    unsubs.push(wsClient.on("call-answer", async (data) => {
      const call = activeCall();
      if (call) {
        setCallStatus("connecting");
        await call.handleAnswer(data.answer);
      }
    }));

    // eslint-disable-next-line solid/reactivity -- WS event handler
    unsubs.push(wsClient.on("ice-candidate", async (data) => {
      const call = activeCall();
      if (call) {
        await call.handleIceCandidate(data.candidate);
      } else if (pendingCandidates.length < 100) {
        pendingCandidates.push(data.candidate);
      }
    }));

    unsubs.push(wsClient.on("call-end", () => {
      endCall();
    }));

    // eslint-disable-next-line solid/reactivity -- WS event handler
    unsubs.push(wsClient.on("camera-on", () => {
      if (callStatus() === "connected" || callStatus() === "connecting") {
        setRemoteVideoPrompt(true);
      }
    }));

    return () => unsubs.forEach((fn) => fn());
  }

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

  async function acceptCall() {
    if (!pendingSenderId || !pendingOffer) return;
    stopRingtone();
    setCallType(pendingCallType);
    setRemoteVideoPrompt(false);

    const senderId = pendingSenderId;
    const offer = pendingOffer;
    const type = pendingCallType;
    pendingOffer = null;
    pendingSenderId = null;

    try {
      const call = await WebRTCCall.create(senderId, type);
      call.onRemoteStream = (s) => setRemoteStream(s);
      call.onConnected = () => setCallStatus("connected");
      call.onEnded = () => endCall();
      call.onReconnecting = () => setCallStatus("connecting");
      call.onFailed = () => showToast("Call lost", "error");

      const stream = await call.startLocalMedia(type === "video");
      setLocalStream(stream);
      setActiveCall(call);

      await call.handleOffer(offer);

      for (const c of pendingCandidates) {
        await call.handleIceCandidate(c);
      }
      pendingCandidates = [];

      setCallStatus("connecting");
    } catch (e) {
      console.error("Failed to accept call", e);
      setCallError(e instanceof Error ? e.message : "Failed to accept call");
      endCall();
    }
  }

  function rejectCall() {
    stopRingtone();
    if (pendingSenderId) wsClient.send({ type: "call-end", targetId: pendingSenderId });
    setCallStatus("idle");
    setCallTargetId(null);
    pendingOffer = null;
    pendingSenderId = null;
  }

  function endCall() {
    if (callStatus() === "idle" || callStatus() === "ended") return;
    stopRingtone();
    setCallError("");
    if (callStatus() === "connected") {
      showToast("Call ended", "info");
    }
    const call = activeCall();
    if (call) {
      call.onEnded = undefined; // prevent re-entrant loop
      call.end();
    }
    pendingOffer = null;
    pendingSenderId = null;
    pendingCandidates = [];
    setActiveCall(null);
    setLocalStream(null);
    setRemoteStream(null);
    setRemoteVideoPrompt(false);
    setCallType("video");
    setCallStatus("ended");
    setTimeout(() => {
      setCallStatus("idle");
      setCallTargetId(null);
    }, 1500);
  }

  async function enableCamera() {
    const call = activeCall();
    if (!call || callType() === "video") return;
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

  function expandToVideo() {
    setRemoteVideoPrompt(false);
    setCallType("video");
  }

  return {
    callStatus,
    callError,
    callType,
    remoteVideoPrompt,
    activeCall,
    localStream,
    remoteStream,
    callTargetId,
    setupCallListeners,
    startCall,
    acceptCall,
    rejectCall,
    endCall,
    enableCamera,
    expandToVideo,
  };
}
