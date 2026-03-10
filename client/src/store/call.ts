import { createSignal } from "solid-js";
import { WebRTCCall } from "../lib/webrtc";
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

let pendingOffer: RTCSessionDescriptionInit | null = null;
let pendingSenderId: number | null = null;
let pendingCandidates: RTCIceCandidateInit[] = [];

export function useCall() {
  function setupCallListeners(): () => void {
    const unsubs: (() => void)[] = [];
    unsubs.push(wsClient.on("call-offer", async (data) => {
      const existing = activeCall();
      if (existing && data.iceRestart) {
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
      startRingtone();
    }));

    unsubs.push(wsClient.on("call-answer", async (data) => {
      const call = activeCall();
      if (call) {
        setCallStatus("connecting");
        await call.handleAnswer(data.answer);
      }
    }));

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

    return () => unsubs.forEach((fn) => fn());
  }

  async function startCall(targetId: number) {
    setCallError("");
    try {
      const call = await WebRTCCall.create(targetId);
      call.onRemoteStream = (s) => setRemoteStream(s);
      call.onConnected = () => setCallStatus("connected");
      call.onEnded = () => endCall();
      call.onReconnecting = () => setCallStatus("connecting");
      call.onFailed = () => showToast("Call lost", "error");

      const stream = await call.startLocalMedia();
      setLocalStream(stream);
      setActiveCall(call);
      setCallTargetId(targetId);
      setCallStatus("calling");

      await call.createOffer();
    } catch (e: any) {
      console.error("Failed to start call", e);
      setCallError(e?.message || "Failed to start call");
      endCall();
    }
  }

  async function acceptCall() {
    if (!pendingSenderId || !pendingOffer) return;
    stopRingtone();

    const senderId = pendingSenderId;
    const offer = pendingOffer;
    pendingOffer = null;
    pendingSenderId = null;

    try {
      const call = await WebRTCCall.create(senderId);
      call.onRemoteStream = (s) => setRemoteStream(s);
      call.onConnected = () => setCallStatus("connected");
      call.onEnded = () => endCall();
      call.onReconnecting = () => setCallStatus("connecting");
      call.onFailed = () => showToast("Call lost", "error");

      const stream = await call.startLocalMedia();
      setLocalStream(stream);
      setActiveCall(call);

      await call.handleOffer(offer);

      for (const c of pendingCandidates) {
        await call.handleIceCandidate(c);
      }
      pendingCandidates = [];

      setCallStatus("connecting");
    } catch (e: any) {
      console.error("Failed to accept call", e);
      setCallError(e?.message || "Failed to accept call");
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
    setActiveCall(null);
    setLocalStream(null);
    setRemoteStream(null);
    setCallStatus("ended");
    setTimeout(() => {
      setCallStatus("idle");
      setCallTargetId(null);
    }, 1500);
  }

  return {
    callStatus,
    callError,
    activeCall,
    localStream,
    remoteStream,
    callTargetId,
    setupCallListeners,
    startCall,
    acceptCall,
    rejectCall,
    endCall,
  };
}
