import { createSignal, createEffect, onCleanup, Show } from "solid-js";
import { useCall } from "../store/call";
import { useChat } from "../store/chat";

function bindStream(el: HTMLVideoElement, stream: MediaStream | null) {
  if (!stream) return;
  el.srcObject = stream;
  el.play().catch(() => {});
}

export default function CallView() {
  const {
    localStream, remoteStream, activeCall, endCall, callStatus,
    callType, remoteVideoPrompt, enableCamera, expandToVideo, callTargetId,
  } = useCall();
  const { state: chatState } = useChat();
  const [videoOn, setVideoOn] = createSignal(true);
  const [audioOn, setAudioOn] = createSignal(true);
  let remoteVideoEl: HTMLVideoElement | undefined;
  let localVideoEl: HTMLVideoElement | undefined;

  createEffect(() => { if (remoteVideoEl) bindStream(remoteVideoEl, remoteStream()); });
  createEffect(() => { if (localVideoEl) bindStream(localVideoEl, localStream()); });

  const statusText: Record<string, string> = {
    calling: "Calling...",
    connecting: "Connecting...",
    ended: "Call ended",
  };

  const [elapsed, setElapsed] = createSignal(0);

  createEffect(() => {
    if (callStatus() === "connected") {
      const id = setInterval(() => setElapsed((e) => e + 1), 1000);
      onCleanup(() => clearInterval(id));
    } else {
      setElapsed(0);
    }
  });

  function formatTime(s: number) {
    return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
  }

  const isVideoView = () => callType() === "video";
  const friendName = () => {
    const id = callTargetId();
    return id ? chatState.friendInfo[id]?.name ?? "Friend" : "Friend";
  };

  return (
    <Show when={isVideoView()} fallback={
      /* Voice call — centered card */
      <div class="fixed inset-0 z-50 bg-black/60 flex items-center justify-center">
        <div class="bg-gray-900 rounded-2xl p-8 flex flex-col items-center gap-4 shadow-2xl w-80">
          <h3 class="text-white text-lg font-semibold m-0">{friendName()}</h3>

          <div class="text-white/70 text-sm">
            <Show when={callStatus() === "connected"} fallback={statusText[callStatus()] ?? "..."}>
              {formatTime(elapsed())}
            </Show>
          </div>

          <Show when={remoteVideoPrompt()}>
            <div class="flex items-center gap-2 bg-white/10 rounded-lg px-4 py-2 text-sm text-white">
              <span>Friend turned on camera</span>
              <button
                class="px-3 py-1 bg-primary hover:bg-primary-hover text-white rounded-full text-xs font-medium border-0 cursor-pointer transition-colors"
                onClick={expandToVideo}
              >
                Expand
              </button>
            </div>
          </Show>

          <div class="flex gap-3 items-center mt-2">
            <button
              class={`w-12 h-12 rounded-full flex items-center justify-center text-white border-0 cursor-pointer transition-colors ${audioOn() ? "bg-white/20 hover:bg-white/30" : "bg-danger hover:bg-danger-hover"}`}
              onClick={() => { const on = activeCall()?.toggleAudio(); setAudioOn(!!on); }}
              title={audioOn() ? "Mute microphone" : "Unmute microphone"}
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                {audioOn()
                  ? <><rect x="9" y="1" width="6" height="12" rx="3"/><path d="M19 10v1a7 7 0 01-14 0v-1"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/></>
                  : <><line x1="1" y1="1" x2="23" y2="23"/><path d="M9 9v3a3 3 0 005.12 2.12M15 9.34V4a3 3 0 00-5.94-.6"/><path d="M17 16.95A7 7 0 015 12v-2m14 0v2c0 .67-.1 1.32-.27 1.93"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/></>
                }
              </svg>
            </button>
            <button
              class="w-12 h-12 rounded-full flex items-center justify-center text-white bg-white/20 hover:bg-white/30 border-0 cursor-pointer transition-colors"
              onClick={enableCamera}
              title="Turn on camera"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <rect x="2" y="5" width="14" height="14" rx="2"/><polygon points="23 7 17 12 23 17 23 7"/>
              </svg>
            </button>
            <button
              class="w-14 h-14 rounded-full bg-danger hover:bg-danger-hover flex items-center justify-center text-white border-0 cursor-pointer transition-colors"
              onClick={endCall}
              title="End call"
            >
              <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor"><path d="M12 9c-1.6 0-3.15.25-4.6.72v3.1c0 .39-.23.74-.56.9-.98.49-1.87 1.12-2.66 1.85-.18.18-.43.28-.7.28-.28 0-.53-.11-.71-.29L.29 13.08a.99.99 0 01-.29-.7c0-.28.11-.53.29-.71C3.34 8.78 7.46 7 12 7s8.66 1.78 11.71 4.67c.18.18.29.43.29.71 0 .28-.11.53-.29.71l-2.48 2.48c-.18.18-.43.29-.71.29-.27 0-.52-.1-.7-.28-.79-.73-1.68-1.36-2.66-1.85a.994.994 0 01-.56-.9v-3.1C15.15 9.25 13.6 9 12 9z"/></svg>
            </button>
          </div>
        </div>
      </div>
    }>
      {/* Video call — fullscreen */}
      <div class="fixed inset-0 z-50 bg-black flex items-center justify-center">
        <div class="relative w-full h-full">
          <div class="w-full h-full relative bg-gray-900">
            <video ref={remoteVideoEl} autoplay playsinline class={remoteStream() ? "w-full h-full object-cover" : "hidden"} />
          </div>

          <div class="absolute top-4 left-1/2 -translate-x-1/2 px-3 py-1.5 bg-black/50 rounded-full text-white text-sm">
            <Show when={callStatus() === "connected"} fallback={statusText[callStatus()] ?? "..."}>
              {formatTime(elapsed())}
            </Show>
          </div>

          <div class="absolute top-4 right-4 w-36 h-24 bg-gray-900 rounded-xl overflow-hidden shadow-lg">
            <video ref={localVideoEl} autoplay playsinline muted class="w-full h-full object-cover" />
          </div>

          <div class="absolute bottom-6 left-1/2 -translate-x-1/2 flex gap-4 items-center bg-black/50 backdrop-blur-sm rounded-full px-6 py-3">
            <button
              class={`w-12 h-12 rounded-full flex items-center justify-center text-white border-0 cursor-pointer transition-colors ${videoOn() ? "bg-white/20 hover:bg-white/30" : "bg-danger hover:bg-danger-hover"}`}
              onClick={() => { const on = activeCall()?.toggleVideo(); setVideoOn(!!on); }}
              aria-pressed={!videoOn() ? "true" : "false"}
              title={videoOn() ? "Turn off camera" : "Turn on camera"}
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                {videoOn()
                  ? <><rect x="2" y="5" width="14" height="14" rx="2"/><polygon points="23 7 17 12 23 17 23 7"/></>
                  : <><path d="M10.66 5H14a2 2 0 012 2v3.34"/><path d="M1 1l22 22"/><path d="M2 7a2 2 0 00-2 2v8a2 2 0 002 2h10"/><polygon points="23 7 17 12 23 17 23 7"/></>
                }
              </svg>
            </button>
            <button
              class={`w-12 h-12 rounded-full flex items-center justify-center text-white border-0 cursor-pointer transition-colors ${audioOn() ? "bg-white/20 hover:bg-white/30" : "bg-danger hover:bg-danger-hover"}`}
              onClick={() => { const on = activeCall()?.toggleAudio(); setAudioOn(!!on); }}
              aria-pressed={!audioOn() ? "true" : "false"}
              title={audioOn() ? "Mute microphone" : "Unmute microphone"}
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                {audioOn()
                  ? <><rect x="9" y="1" width="6" height="12" rx="3"/><path d="M19 10v1a7 7 0 01-14 0v-1"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/></>
                  : <><line x1="1" y1="1" x2="23" y2="23"/><path d="M9 9v3a3 3 0 005.12 2.12M15 9.34V4a3 3 0 00-5.94-.6"/><path d="M17 16.95A7 7 0 015 12v-2m14 0v2c0 .67-.1 1.32-.27 1.93"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/></>
                }
              </svg>
            </button>
            <button
              class="w-14 h-14 rounded-full bg-danger hover:bg-danger-hover flex items-center justify-center text-white border-0 cursor-pointer transition-colors"
              onClick={endCall}
              title="End call"
            >
              <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor"><path d="M12 9c-1.6 0-3.15.25-4.6.72v3.1c0 .39-.23.74-.56.9-.98.49-1.87 1.12-2.66 1.85-.18.18-.43.28-.7.28-.28 0-.53-.11-.71-.29L.29 13.08a.99.99 0 01-.29-.7c0-.28.11-.53.29-.71C3.34 8.78 7.46 7 12 7s8.66 1.78 11.71 4.67c.18.18.29.43.29.71 0 .28-.11.53-.29.71l-2.48 2.48c-.18.18-.43.29-.71.29-.27 0-.52-.1-.7-.28-.79-.73-1.68-1.36-2.66-1.85a.994.994 0 01-.56-.9v-3.1C15.15 9.25 13.6 9 12 9z"/></svg>
            </button>
          </div>
        </div>
      </div>
    </Show>
  );
}
