// DEV ONLY — seeds test data for local development
// Usage: bun run seed (stop server first)

import { Database } from "bun:sqlite";
import { mkdirSync, readFileSync, readdirSync } from "fs";
import { join } from "path";

const DB_PATH = join(import.meta.dir, "../server/data/app.db");
mkdirSync(join(import.meta.dir, "../server/data"), { recursive: true });

// Wipe and recreate
const db = new Database(DB_PATH);
db.exec("PRAGMA journal_mode = WAL");
db.exec("PRAGMA foreign_keys = ON");

// Run migrations
const migrationsDir = join(import.meta.dir, "../server/migrations");
const files = readdirSync(migrationsDir).filter((f) => f.endsWith(".sql")).sort();
for (const file of files) {
  const sql = readFileSync(join(migrationsDir, file), "utf-8");
  for (const stmt of sql.split(";").map((s) => s.trim()).filter(Boolean)) {
    db.exec(stmt);
  }
}

// Seed users
const users = [
  { email: "alice@test.com", name: "Alice", password: "password123" },
  { email: "bob@test.com", name: "Bob", password: "password123" },
  { email: "charlie@test.com", name: "Charlie", password: "password123" },
];

for (const u of users) {
  const hash = await Bun.password.hash(u.password, { algorithm: "argon2id" });
  db.query("INSERT OR IGNORE INTO users (email, password_hash, display_name) VALUES (?, ?, ?)").run(
    u.email, hash, u.name,
  );
}

// Alice <-> Bob are friends (accepted)
db.query("INSERT OR IGNORE INTO friendships (requester_id, addressee_id, status) VALUES (1, 2, 'accepted')").run();

// Charlie sent a friend request to Alice (pending)
db.query("INSERT OR IGNORE INTO friendships (requester_id, addressee_id, status) VALUES (3, 1, 'pending')").run();

console.log("Seeded 3 users:");
console.log("  alice@test.com / password123  (friends with Bob, pending request from Charlie)");
console.log("  bob@test.com   / password123  (friends with Alice)");
console.log("  charlie@test.com / password123  (pending request to Alice)");
