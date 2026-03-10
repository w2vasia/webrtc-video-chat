import { Database } from "bun:sqlite";
import { join } from "path";
const db = new Database(join(import.meta.dir, "../server/data/app.db"));
const users = db.query("SELECT id, email, display_name FROM users").all();
console.log("Users in DB:", JSON.stringify(users, null, 2));
const friendships = db.query("SELECT * FROM friendships").all();
console.log("Friendships:", JSON.stringify(friendships, null, 2));
