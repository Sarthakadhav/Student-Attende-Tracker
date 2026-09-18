// Simple JSON-file database.
// Good enough for development and a department demo.
// To move to MongoDB later, replace only readDb/writeDb usage in index.js.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export const DATA_DIR = path.join(__dirname, "data");
export const UPLOAD_DIR = path.join(DATA_DIR, "uploads");
const DB_FILE = path.join(DATA_DIR, "db.json");

const emptyDb = () => ({
  users: [],
  applications: [],
  attendance: {},
});

fs.mkdirSync(UPLOAD_DIR, { recursive: true });

export function readDb() {
  if (!fs.existsSync(DB_FILE)) {
    writeDb(emptyDb());
  }

  try {
    const db = JSON.parse(fs.readFileSync(DB_FILE, "utf8"));
    return { ...emptyDb(), ...db };
  } catch {
    throw new Error(
      "server/data/db.json is not valid JSON. Fix it or delete it to start fresh."
    );
  }
}

export function writeDb(db) {
  // Write to a temp file first, then rename, so a crash never leaves a half-written file.
  const tmp = `${DB_FILE}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(db, null, 2));
  fs.renameSync(tmp, DB_FILE);
}
