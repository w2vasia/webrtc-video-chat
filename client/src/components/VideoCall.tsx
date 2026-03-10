import { createSignal, Show } from "solid-js";
import { useCall } from "../store/call";

export default function VideoCall() {
  const { localStream, remoteStream, activeCall, endCall, callStatus } = useCall();
  const [videoOn, setVideoOn] = createSignal(true);
  const [audioOn, setAudioOn] = createSignal(true);

  return (
    <div class="video-call-overlay">
      <div class="video-call">
        <div class="video-remote">
          <Show when={remoteStream()} fallback={<div class="video-placeholder">{callStatus() === "calling" ? "Calling..." : "Connecting..."}</div>}>
            <video ref={(el) => { el.srcObject = remoteStream(); }} autoplay playsinline />
          </Show>
        </div>

        <div class="video-local">
          <video ref={(el) => { if (localStream()) el.srcObject = localStream(); }} autoplay playsinline muted />
        </div>

        <div class="call-controls">
          <button
            class={`call-btn ${videoOn() ? "" : "off"}`}
            onClick={() => { const on = activeCall()?.toggleVideo(); setVideoOn(!!on); }}
          >
            {videoOn() ? "Cam On" : "Cam Off"}
          </button>
          <button
            class={`call-btn ${audioOn() ? "" : "off"}`}
            onClick={() => { const on = activeCall()?.toggleAudio(); setAudioOn(!!on); }}
          >
            {audioOn() ? "Mic On" : "Mic Off"}
          </button>
          <button class="call-btn end" onClick={endCall}>End Call</button>
        </div>
      </div>
    </div>
  );
}
