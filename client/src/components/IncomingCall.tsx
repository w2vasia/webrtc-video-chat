import { useCall } from "../store/call";

export default function IncomingCall() {
  const { acceptCall, rejectCall, callTargetId } = useCall();

  return (
    <div class="incoming-call-overlay">
      <div class="incoming-call">
        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="var(--primary)" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" style="margin: 0 auto;"><path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07 19.5 19.5 0 01-6-6A19.79 19.79 0 012.12 4.18 2 2 0 014.11 2h3a2 2 0 012 1.72 12.84 12.84 0 00.7 2.81 2 2 0 01-.45 2.11L8.09 9.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45 12.84 12.84 0 002.81.7A2 2 0 0122 16.92z"/></svg>
        <h3>Incoming call</h3>
        <div class="incoming-actions">
          <button class="call-btn accept" onClick={acceptCall}>Accept</button>
          <button class="call-btn end" onClick={rejectCall}>Decline</button>
        </div>
      </div>
    </div>
  );
}
