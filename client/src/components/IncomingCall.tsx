import { onCleanup } from "solid-js";
import { useCall } from "../store/call";
import { useChat } from "../store/chat";

export default function IncomingCall() {
  const { acceptCall, rejectCall, callType, callTargetId } = useCall();
  const { state: chatState } = useChat();
  const callerName = () => {
    const id = callTargetId();
    return id ? chatState.friendInfo[id]?.name ?? "Someone" : "Someone";
  };

  const timeout = setTimeout(() => rejectCall(), 30_000);
  onCleanup(() => clearTimeout(timeout));

  const icon = () => callType() === "voice"
    ? (
      <svg width="48" height="48" viewBox="0 0 24 24" fill="none" class="text-primary" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
        <path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07 19.5 19.5 0 01-6-6A19.79 19.79 0 012.12 4.18 2 2 0 014.11 2h3a2 2 0 012 1.72 12.84 12.84 0 00.7 2.81 2 2 0 01-.45 2.11L8.09 9.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45 12.84 12.84 0 002.81.7A2 2 0 0122 16.92z"/>
      </svg>
    )
    : (
      <svg width="48" height="48" viewBox="0 0 24 24" fill="none" class="text-primary" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
        <rect x="2" y="5" width="14" height="14" rx="2"/><polygon points="23 7 17 12 23 17 23 7"/>
      </svg>
    );

  return (
    <div class="fixed inset-0 z-50 bg-black/60 flex items-center justify-center">
      <div class="bg-white rounded-[10px] p-8 flex flex-col items-center gap-5 shadow-xl w-72">
        {icon()}
        <h3 class="text-lg font-semibold text-gray-900 m-0">{callerName()}</h3>
        <p class="text-sm text-gray-500 m-0">
          Incoming {callType() === "voice" ? "voice" : "video"} call
        </p>
        <div class="flex gap-3">
          <button
            class="px-5 py-2 rounded-full bg-success hover:bg-success-hover text-white font-medium border-0 cursor-pointer transition-colors"
            onClick={acceptCall}
          >
            Accept
          </button>
          <button
            class="px-5 py-2 rounded-full bg-danger hover:bg-danger-hover text-white font-medium border-0 cursor-pointer transition-colors"
            onClick={rejectCall}
          >
            Decline
          </button>
        </div>
      </div>
    </div>
  );
}
