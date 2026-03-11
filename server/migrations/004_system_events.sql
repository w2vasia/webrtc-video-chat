CREATE TABLE system_events (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  user1_id   INTEGER NOT NULL,
  user2_id   INTEGER NOT NULL,
  event_type TEXT NOT NULL,
  metadata   TEXT,
  target_id  INTEGER,
  delivered  INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  FOREIGN KEY (user1_id) REFERENCES users(id),
  FOREIGN KEY (user2_id) REFERENCES users(id)
);

CREATE INDEX idx_system_events_users ON system_events (user1_id, user2_id, created_at)