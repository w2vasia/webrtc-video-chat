import { createSignal } from "solid-js";
import { WebRTCCall } from "../lib/webrtc";
import { wsClient } from "../lib/ws";
import { showToast } from "../components/Toast";

export type CallStatus = "idle" | "calling" | "incoming" | "ringing" | "connecting" | "connected" | "ended";

const [callStatus, setCallStatus] = createSignal<CallStatus>("idle");
const [activeCall, setActiveCall] = createSignal<WebRTCCall | null>(null);
const [localStream, setLocalStream] = createSignal<MediaStream | null>(null);
const [remoteStream, setRemoteStream] = createSignal<MediaStream | null>(null);
const [callTargetId, setCallTargetId] = createSignal<number | null>(null);

let pendingOffer: RTCSessionDescriptionInit | null = null;
let pendingSenderId: number | null = null;
let pendingCandidates: RTCIceCandidateInit[] = [];

export function useCall() {
  function setupCallListeners() {
    wsClient.on("call-offer", async (data) => {
      pendingCandidates = [];
      setCallTargetId(data.senderId);
      setCallStatus("incoming");
      pendingOffer = data.offer;
      pendingSenderId = data.senderId;
    });

    wsClient.on("call-answer", async (data) => {
      const call = activeCall();
      if (call) {
        setCallStatus("connecting");
        await call.handleAnswer(data.answer);
      }
    });

    wsClient.on("ice-candidate", async (data) => {
      const call = activeCall();
      if (call) {
        await call.handleIceCandidate(data.candidate);
      } else {
        pendingCandidates.push(data.candidate);
      }
    });

    wsClient.on("call-end", () => {
      endCall();
    });
  }

  async function startCall(targetId: number) {
    const call = await WebRTCCall.create(targetId);
    call.onRemoteStream = (s) => setRemoteStream(s);
    call.onConnected = () => setCallStatus("connected");
    call.onEnded = () => endCall();

    const stream = await call.startLocalMedia();
    setLocalStream(stream);
    setActiveCall(call);
    setCallTargetId(targetId);
    setCallStatus("calling");

    await call.createOffer();
  }

  async function acceptCall() {
    if (!pendingSenderId || !pendingOffer) return;

    const call = await WebRTCCall.create(pendingSenderId);
    call.onRemoteStream = (s) => setRemoteStream(s);
    call.onConnected = () => setCallStatus("connected");
    call.onEnded = () => endCall();

    const stream = await call.startLocalMedia();
    setLocalStream(stream);
    setActiveCall(call);

    await call.handleOffer(pendingOffer);

    // apply ICE candidates that arrived before accept
    for (const c of pendingCandidates) {
      await call.handleIceCandidate(c);
    }
    pendingCandidates = [];

    setCallStatus("connecting");
    pendingOffer = null;
    pendingSenderId = null;
  }

  function rejectCall() {
    if (pendingSenderId) wsClient.send({ type: "call-end", targetId: pendingSenderId });
    setCallStatus("idle");
    setCallTargetId(null);
    pendingOffer = null;
    pendingSenderId = null;
  }

  function endCall() {
    if (callStatus() === "connected") {
      showToast("Call ended", "info");
    }
    const call = activeCall();
    if (call) {
      call.localStream?.getTracks().forEach((t) => t.stop());
      call.pc.close();
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
