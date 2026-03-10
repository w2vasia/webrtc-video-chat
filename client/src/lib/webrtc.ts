import { wsClient } from "./ws";

const ICE_SERVERS: RTCConfiguration = {
  iceServers: [
    { urls: "stun:stun.l.google.com:19302" },
    { urls: "stun:stun1.l.google.com:19302" },
    // TURN relay — required for cellular/symmetric NAT
    ...(import.meta.env.VITE_TURN_URL ? [{
      urls: import.meta.env.VITE_TURN_URL,
      username: import.meta.env.VITE_TURN_USERNAME || "",
      credential: import.meta.env.VITE_TURN_CREDENTIAL || "",
    }] : []),
  ],
  iceCandidatePoolSize: 10,
};

export class WebRTCCall {
  pc: RTCPeerConnection;
  localStream: MediaStream | null = null;
  remoteStream = new MediaStream();
  targetId: number;
  onRemoteStream?: (stream: MediaStream) => void;
  onEnded?: () => void;
  private pendingIceCandidates: RTCIceCandidateInit[] = [];
  private remoteDescSet = false;
  private disconnectTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(targetId: number) {
    this.targetId = targetId;
    this.pc = new RTCPeerConnection(ICE_SERVERS);

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
      if (this.disconnectTimer) { clearTimeout(this.disconnectTimer); this.disconnectTimer = null; }
      if (this.pc.connectionState === "failed") {
        this.end();
      } else if (this.pc.connectionState === "disconnected") {
        this.disconnectTimer = setTimeout(() => this.end(), 8000);
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
