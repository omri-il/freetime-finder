const path = require('node:path');
const fs = require('node:fs');
const { DatabaseSync } = require('node:sqlite');

const DATA_DIR = path.join(__dirname, 'data');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

const db = new DatabaseSync(path.join(DATA_DIR, 'freetime.db'));
db.exec('PRAGMA journal_mode = WAL;');
db.exec('PRAGMA foreign_keys = ON;');

db.exec(`
  CREATE TABLE IF NOT EXISTS events (
    id           TEXT PRIMARY KEY,
    title        TEXT NOT NULL,
    mode         TEXT NOT NULL CHECK(mode IN ('recurring','specific')),
    start_date   TEXT,
    end_date     TEXT,
    days_mask    INTEGER,
    start_hour   INTEGER NOT NULL,
    end_hour     INTEGER NOT NULL,
    slot_minutes INTEGER NOT NULL DEFAULT 30,
    created_at   INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS participants (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    event_id      TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
    name          TEXT NOT NULL,
    password_hash TEXT,
    created_at    INTEGER NOT NULL,
    UNIQUE (event_id, name)
  );

  CREATE TABLE IF NOT EXISTS availability (
    participant_id INTEGER NOT NULL REFERENCES participants(id) ON DELETE CASCADE,
    slot_key       TEXT NOT NULL,
    PRIMARY KEY (participant_id, slot_key)
  );

  CREATE INDEX IF NOT EXISTS idx_avail_participant ON availability(participant_id);
  CREATE INDEX IF NOT EXISTS idx_participants_event ON participants(event_id);
`);

module.exports = db;
