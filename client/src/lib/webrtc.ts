import { wsClient } from "./ws";

const ICE_SERVERS: RTCConfiguration = {
  iceServers: [
    { urls: "stun:stun.l.google.com:19302" },
    { urls: "stun:stun1.l.google.com:19302" },
  ],
};

export class WebRTCCall {
  pc: RTCPeerConnection;
  localStream: MediaStream | null = null;
  remoteStream = new MediaStream();
  targetId: number;
  onRemoteStream?: (stream: MediaStream) => void;
  onEnded?: () => void;

  constructor(targetId: number) {
    this.targetId = targetId;
    this.pc = new RTCPeerConnection(ICE_SERVERS);

    this.pc.ontrack = (e) => {
      e.streams[0].getTracks().forEach((t) => this.remoteStream.addTrack(t));
      this.onRemoteStream?.(this.remoteStream);
    };

    this.pc.onicecandidate = (e) => {
      if (e.candidate) {
        wsClient.send({ type: "ice-candidate", targetId, candidate: e.candidate });
      }
    };

    this.pc.onconnectionstatechange = () => {
      if (this.pc.connectionState === "failed" || this.pc.connectionState === "disconnected") {
        this.end();
      }
    };
  }

  async startLocalMedia(video = true, audio = true): Promise<MediaStream> {
    this.localStream = await navigator.mediaDevices.getUserMedia({ video, audio });
    this.localStream.getTracks().forEach((t) => this.pc.addTrack(t, this.localStream!));
    return this.localStream;
  }

  async createOffer(): Promise<void> {
    const offer = await this.pc.createOffer();
    await this.pc.setLocalDescription(offer);
    wsClient.send({ type: "call-offer", targetId: this.targetId, offer });
  }

  async handleOffer(offer: RTCSessionDescriptionInit): Promise<void> {
    await this.pc.setRemoteDescription(new RTCSessionDescription(offer));
    const answer = await this.pc.createAnswer();
    await this.pc.setLocalDescription(answer);
    wsClient.send({ type: "call-answer", targetId: this.targetId, answer });
  }

  async handleAnswer(answer: RTCSessionDescriptionInit): Promise<void> {
    await this.pc.setRemoteDescription(new RTCSessionDescription(answer));
  }

  async handleIceCandidate(candidate: RTCIceCandidateInit): Promise<void> {
    await this.pc.addIceCandidate(new RTCIceCandidate(candidate));
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
