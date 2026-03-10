import { Database } from "bun:sqlite";
import { readFileSync, readdirSync } from "fs";
import { join } from "path";

let _db: Database | null = null;

export function getDb(path: string = "data/app.db"): Database {
  if (_db && path !== ":memory:") return _db;
  const db = new Database(path);
  db.exec("PRAGMA journal_mode = WAL");
  db.exec("PRAGMA foreign_keys = ON");
  if (path !== ":memory:") _db = db;
  return db;
}

export function migrate(db: Database): void {
  db.exec(`CREATE TABLE IF NOT EXISTS _migrations (
    name TEXT PRIMARY KEY,
    applied_at INTEGER DEFAULT (unixepoch())
  )`);

  const migrationsDir = join(import.meta.dir, "../migrations");
  let files: string[];
  try {
    files = readdirSync(migrationsDir).filter((f) => f.endsWith(".sql")).sort();
  } catch {
    return;
  }

  for (const file of files) {
    const applied = db.query("SELECT 1 FROM _migrations WHERE name = ?").get(file);
    if (applied) continue;
    const sql = readFileSync(join(migrationsDir, file), "utf-8");
    // bun:sqlite exec() only runs first statement; split on semicolons
    // NOTE: avoid semicolons inside string literals in migrations
    const statements = sql.split(";").map((s) => s.trim()).filter((s) => s.length > 0);
    for (const stmt of statements) {
      db.exec(stmt);
    }
    db.query("INSERT INTO _migrations (name) VALUES (?)").run(file);
  }
}
