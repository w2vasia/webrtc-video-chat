import { useAuth } from "../store/auth";

export default function Chat() {
  const { user, logout } = useAuth();

  return (
    <div class="chat-layout">
      <aside class="sidebar">
        <div class="sidebar-header">
          <h2>Whisper</h2>
          <span class="user-name">{user()?.displayName}</span>
          <button onClick={logout}>Logout</button>
        </div>
        <div class="friend-list">
          <p class="placeholder">Friends list coming soon</p>
        </div>
      </aside>
      <main class="chat-main">
        <p class="placeholder">Select a friend to start chatting</p>
      </main>
    </div>
  );
}
