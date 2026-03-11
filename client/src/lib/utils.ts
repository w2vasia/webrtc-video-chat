export function formatLastSeen(ts: number): string {
  if (!ts) return "Offline";
  const diff = Math.floor(Date.now() / 1000) - ts;
  if (diff < 60) return "Last seen just now";
  if (diff < 3600) return `Last seen ${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `Last seen ${Math.floor(diff / 3600)}h ago`;
  return `Last seen ${Math.floor(diff / 86400)}d ago`;
}
