import { Database } from "bun:sqlite";
import fs from "fs";

const dbPath = "./data/mydb.sqlite";

// Ensure the data directory exists
if (!fs.existsSync("./data")) {
  fs.mkdirSync("./data");
}

const db = new Database(dbPath, { create: true });

// Initial schema setup if no tables exist
const hasTables = db.query("SELECT name FROM sqlite_master WHERE type='table'").all().length > 0;

if (!hasTables) {
  db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT NOT NULL,
  password TEXT NOT NULL,
  is_premium INTEGER DEFAULT 0
);
CREATE TABLE IF NOT EXISTS file_names (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  job_id INTEGER NOT NULL,
  file_name TEXT NOT NULL,
  output_file_name TEXT NOT NULL,
  status TEXT DEFAULT 'not started',
  FOREIGN KEY (job_id) REFERENCES jobs(id)
);
CREATE TABLE IF NOT EXISTS jobs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  date_created TEXT NOT NULL,
  status TEXT DEFAULT 'not started',
  num_files INTEGER DEFAULT 0,
  FOREIGN KEY (user_id) REFERENCES users(id)
);
PRAGMA user_version = 2;
  `);
  console.log("✅ Fresh DB initialized with version 2 and is_premium column.");
}

// Get DB version
const dbVersion = (db.query("PRAGMA user_version").get() as { user_version?: number }).user_version ?? 0;
console.log("🔍 Current DB version:", dbVersion);

// Migration: v0 → v1
if (dbVersion === 0) {
  db.exec("ALTER TABLE file_names ADD COLUMN status TEXT DEFAULT 'not started';");
  db.exec("PRAGMA user_version = 1;");
  console.log("✅ Migrated DB to version 1 (added status to file_names).");
}

// Migration: v1 → v2
if (dbVersion === 1) {
  db.exec("ALTER TABLE users ADD COLUMN is_premium INTEGER DEFAULT 0;");
  db.exec("PRAGMA user_version = 2;");
  console.log("✅ Migrated DB to version 2 (added is_premium to users).");
}

// 🔁 PATCH: if DB is v2+ but is_premium column is still missing (e.g. due to interrupted migration)
const userColumns = db.query(`PRAGMA table_info(users)`).all() as { name: string }[];
const hasIsPremium = userColumns.some((col) => col.name === "is_premium");

if (!hasIsPremium) {
  db.exec("ALTER TABLE users ADD COLUMN is_premium INTEGER DEFAULT 0;");
  console.log("🔧 Patched users table: added missing is_premium column.");
}

// Enable Write-Ahead Logging
db.exec("PRAGMA journal_mode = WAL;");

export default db;
