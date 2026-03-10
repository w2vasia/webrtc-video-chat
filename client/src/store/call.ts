import { createSignal } from "solid-js";
import { WebRTCCall } from "../lib/webrtc";
import { wsClient } from "../lib/ws";

export type CallStatus = "idle" | "calling" | "incoming" | "connected";

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
        await call.handleAnswer(data.answer);
        setCallStatus("connected");
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
    const call = new WebRTCCall(targetId);
    call.onRemoteStream = (s) => setRemoteStream(s);
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

    const call = new WebRTCCall(pendingSenderId);
    call.onRemoteStream = (s) => setRemoteStream(s);
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

    setCallStatus("connected");
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
    const call = activeCall();
    if (call) {
      call.localStream?.getTracks().forEach((t) => t.stop());
      call.pc.close();
    }
    setActiveCall(null);
    setLocalStream(null);
    setRemoteStream(null);
    setCallStatus("idle");
    setCallTargetId(null);
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
