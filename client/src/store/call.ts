import { createSignal } from "solid-js";
import { WebRTCCall } from "../lib/webrtc";
import { wsClient } from "../lib/ws";
import { startRingtone, stopRingtone } from "../lib/ringtone";

export type CallStatus = "idle" | "calling" | "incoming" | "connected";

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
        await call.handleAnswer(data.answer);
        setCallStatus("connected");
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
      const call = new WebRTCCall(targetId);
      call.onRemoteStream = (s) => setRemoteStream(s);
      call.onEnded = () => endCall();

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
      const call = new WebRTCCall(senderId);
      call.onRemoteStream = (s) => setRemoteStream(s);
      call.onEnded = () => endCall();

      const stream = await call.startLocalMedia();
      setLocalStream(stream);
      setActiveCall(call);

      await call.handleOffer(offer);

      for (const c of pendingCandidates) {
        await call.handleIceCandidate(c);
      }
      pendingCandidates = [];

      setCallStatus("connected");
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
    if (callStatus() === "idle") return;
    stopRingtone();
    setCallError("");
    const call = activeCall();
    if (call) {
      call.onEnded = undefined; // prevent re-entrant loop
      call.end();
    }
    setActiveCall(null);
    setLocalStream(null);
    setRemoteStream(null);
    setCallStatus("idle");
    setCallTargetId(null);
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
