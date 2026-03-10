import { useCall } from "../store/call";

export default function IncomingCall() {
  const { acceptCall, rejectCall, callTargetId } = useCall();

  return (
    <div class="incoming-call-overlay">
      <div class="incoming-call">
        <p>Incoming call...</p>
        <div class="incoming-actions">
          <button class="call-btn accept" onClick={acceptCall}>Accept</button>
          <button class="call-btn end" onClick={rejectCall}>Decline</button>
        </div>
      </div>
    </div>
  );
}
