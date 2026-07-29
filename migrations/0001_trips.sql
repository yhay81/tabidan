PRAGMA foreign_keys = ON;

CREATE TABLE trips (
  id TEXT PRIMARY KEY,
  edit_token_hash TEXT NOT NULL,
  title TEXT NOT NULL,
  destination TEXT NOT NULL,
  start_date TEXT NOT NULL,
  end_date TEXT NOT NULL,
  accent TEXT NOT NULL CHECK (accent IN ('sunrise', 'coast', 'forest', 'night')),
  plan_json TEXT NOT NULL CHECK (length(plan_json) <= 49152),
  revision INTEGER NOT NULL DEFAULT 1,
  expires_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE INDEX trips_expiry_idx ON trips (expires_at);

CREATE TABLE product_events (
  session_hash TEXT NOT NULL,
  name TEXT NOT NULL CHECK (
    name IN ('visited', 'created', 'edited', 'shared', 'printed', 'exported', 'returned')
  ),
  occurred_on TEXT NOT NULL,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  UNIQUE (session_hash, name, occurred_on)
);

CREATE INDEX product_events_date_idx ON product_events (occurred_on);
