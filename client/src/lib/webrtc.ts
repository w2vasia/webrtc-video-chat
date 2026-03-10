import { wsClient } from "./ws";

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
  onRemoteStream?: (stream: MediaStream) => void;
  onConnected?: () => void;
  onEnded?: () => void;
  private pendingIceCandidates: RTCIceCandidateInit[] = [];
  private remoteDescSet = false;

  static async create(targetId: number): Promise<WebRTCCall> {
    const iceServers = await getIceServers();
    return new WebRTCCall(targetId, { iceServers, iceCandidatePoolSize: 10 });
  }

  constructor(targetId: number, config?: RTCConfiguration) {
    this.targetId = targetId;
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

    this.pc.onconnectionstatechange = () => {
      if (this.pc.connectionState === "connected") {
        this.onConnected?.();
      } else if (this.pc.connectionState === "failed" || this.pc.connectionState === "disconnected") {
        this.end();
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

  async createOffer(): Promise<void> {
    const offer = await this.pc.createOffer();
    await this.pc.setLocalDescription(offer);
    wsClient.send({ type: "call-offer", targetId: this.targetId, offer });
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
    for (const c of this.pendingIceCandidates) {
      await this.pc.addIceCandidate(new RTCIceCandidate(c));
    }
    this.pendingIceCandidates = [];
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

  end() {
    this.localStream?.getTracks().forEach((t) => t.stop());
    this.pc.close();
    wsClient.send({ type: "call-end", targetId: this.targetId });
    this.onEnded?.();
  }
}
