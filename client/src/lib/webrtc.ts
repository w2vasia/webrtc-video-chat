import { wsClient } from "./ws";

export type CallType = "voice" | "video";

async function getIceServers(): Promise<RTCIceServer[]> {
  try {
    const token = localStorage.getItem("token");
    const res = await fetch("/api/ice-servers", {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    if (res.ok) return await res.json();
  } catch {}
  return [{ urls: "stun:stun.l.google.com:19302" }];
}

export class WebRTCCall {
  pc: RTCPeerConnection;
  localStream: MediaStream | null = null;
  remoteStream = new MediaStream();
  targetId: number;
  callType: CallType;
  onRemoteStream?: (stream: MediaStream) => void;
  onConnected?: () => void;
  onEnded?: () => void;
  onReconnecting?: () => void;
  onFailed?: () => void;
  private pendingIceCandidates: RTCIceCandidateInit[] = [];
  private remoteDescSet = false;
  private reconnectTimer?: ReturnType<typeof setTimeout>;
  private giveUpTimer?: ReturnType<typeof setTimeout>;
  private ended = false;

  static async create(targetId: number, callType: CallType = "video"): Promise<WebRTCCall> {
    const iceServers = await getIceServers();
    return new WebRTCCall(targetId, callType, { iceServers, iceCandidatePoolSize: 10 });
  }

  constructor(targetId: number, callType: CallType = "video", config?: RTCConfiguration) {
    this.targetId = targetId;
    this.callType = callType;
    this.pc = new RTCPeerConnection(config ?? { iceServers: [{ urls: "stun:stun.l.google.com:19302" }], iceCandidatePoolSize: 10 });

    this.pc.ontrack = (e) => {
      this.remoteStream.addTrack(e.track);
      // new reference so SolidJS signal triggers reactivity
      this.onRemoteStream?.(new MediaStream(this.remoteStream.getTracks()));
    };

    this.pc.onicecandidate = (e) => {
      if (e.candidate) {
        wsClient.send({ type: "ice-candidate", targetId, candidate: e.candidate });
      }
    };

    this.pc.onnegotiationneeded = async () => {
      if (this.ended || !this.remoteDescSet) return;
      try {
        const offer = await this.pc.createOffer();
        await this.pc.setLocalDescription(offer);
        wsClient.send({ type: "call-offer", targetId: this.targetId, offer, callType: this.callType, renegotiate: true });
      } catch {}
    };

    this.pc.onconnectionstatechange = () => {
      const state = this.pc.connectionState;
      if (state === "connected") {
        clearTimeout(this.reconnectTimer);
        clearTimeout(this.giveUpTimer);
        this.onConnected?.();
      } else if (state === "disconnected") {
        this.reconnectTimer = setTimeout(() => this.attemptIceRestart(), 2000);
      } else if (state === "failed") {
        this.attemptIceRestart();
      }
    };
  }

  async startLocalMedia(video = true, audio = true): Promise<MediaStream> {
    const attempts: MediaStreamConstraints[] = [
      {
        audio: audio ? { echoCancellation: true, noiseSuppression: true } : false,
        video: video ? { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: "user" } : false,
      },
      { audio, video },
      { audio, video: false }, // voice-only fallback
    ];
    for (const constraints of attempts) {
      try {
        this.localStream = await navigator.mediaDevices.getUserMedia(constraints);
        this.localStream.getTracks().forEach((t) => this.pc.addTrack(t, this.localStream!));
        return this.localStream;
      } catch {}
    }
    throw new Error("No camera or microphone available");
  }

  private async attemptIceRestart(): Promise<void> {
    if (this.ended) return;
    clearTimeout(this.giveUpTimer);
    this.onReconnecting?.();
    try {
      const offer = await this.pc.createOffer({ iceRestart: true });
      await this.pc.setLocalDescription(offer);
      wsClient.send({ type: "call-offer", targetId: this.targetId, offer, callType: this.callType, iceRestart: true });
      this.giveUpTimer = setTimeout(() => {
        this.onFailed?.();
        this.end();
      }, 15000);
    } catch {
      this.onFailed?.();
      this.end();
    }
  }

  async createOffer(): Promise<void> {
    const offer = await this.pc.createOffer();
    await this.pc.setLocalDescription(offer);
    wsClient.send({ type: "call-offer", targetId: this.targetId, offer, callType: this.callType });
  }

  async handleOffer(offer: RTCSessionDescriptionInit): Promise<void> {
    await this.pc.setRemoteDescription(new RTCSessionDescription(offer));
    this.remoteDescSet = true;
    await this.flushIceCandidates();
    const answer = await this.pc.createAnswer();
    await this.pc.setLocalDescription(answer);
    wsClient.send({ type: "call-answer", targetId: this.targetId, answer });
  }

  async handleAnswer(answer: RTCSessionDescriptionInit): Promise<void> {
    await this.pc.setRemoteDescription(new RTCSessionDescription(answer));
    this.remoteDescSet = true;
    await this.flushIceCandidates();
  }

  async handleIceCandidate(candidate: RTCIceCandidateInit): Promise<void> {
    if (!this.remoteDescSet) {
      this.pendingIceCandidates.push(candidate);
      return;
    }
    await this.pc.addIceCandidate(new RTCIceCandidate(candidate));
  }

  private async flushIceCandidates(): Promise<void> {
    const candidates = this.pendingIceCandidates;
    this.pendingIceCandidates = [];
    for (const c of candidates) {
      try {
        await this.pc.addIceCandidate(new RTCIceCandidate(c));
      } catch {
        // stale or invalid candidate — skip
      }
    }
  }

  toggleVideo(): boolean {
    const track = this.localStream?.getVideoTracks()[0];
    if (track) { track.enabled = !track.enabled; return track.enabled; }
    return false;
  }

  toggleAudio(): boolean {
    const track = this.localStream?.getAudioTracks()[0];
    if (track) { track.enabled = !track.enabled; return track.enabled; }
    return false;
  }

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

  end() {
    if (this.ended) return;
    this.ended = true;
    clearTimeout(this.reconnectTimer);
    clearTimeout(this.giveUpTimer);
    this.localStream?.getTracks().forEach((t) => t.stop());
    this.pc.close();
    wsClient.send({ type: "call-end", targetId: this.targetId });
    this.onEnded?.();
  }
}
