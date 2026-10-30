CREATE TABLE IF NOT EXISTS products (
  id          INTEGER PRIMARY KEY,
  name        TEXT NOT NULL,
  brand       TEXT,
  category    TEXT,
  ingredients TEXT NOT NULL DEFAULT '[]', -- JSON array of ingredient names
  opened_on   TEXT,                       -- YYYY-MM-DD
  expires_on  TEXT,                       -- YYYY-MM-DD
  notes       TEXT,
  image       TEXT,                       -- filename in the uploads directory
  catalog_code TEXT,                      -- Open Beauty Facts barcode, if added from search
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Local copy of Open Beauty Facts, replaced by `npm run import:catalog`.
CREATE TABLE IF NOT EXISTS catalog_products (
  code        TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  brand       TEXT,
  category    TEXT,
  ingredients TEXT NOT NULL DEFAULT '', -- as printed; the product form splits it for review
  image_url   TEXT,
  search_text TEXT NOT NULL             -- brand and name, lowercase without accents
);

CREATE TABLE IF NOT EXISTS routines (
  id         INTEGER PRIMARY KEY,
  name       TEXT NOT NULL,
  period     TEXT NOT NULL CHECK (period IN ('AM', 'PM')),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Products in use by a routine can't be deleted; the step must be removed first.
CREATE TABLE IF NOT EXISTS routine_steps (
  id         INTEGER PRIMARY KEY,
  routine_id INTEGER NOT NULL REFERENCES routines (id) ON DELETE CASCADE,
  product_id INTEGER NOT NULL REFERENCES products (id) ON DELETE NO ACTION,
  position   INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_routine_steps_routine ON routine_steps (routine_id);
CREATE INDEX IF NOT EXISTS idx_routine_steps_product ON routine_steps (product_id);

CREATE TABLE IF NOT EXISTS daily_logs (
  id          INTEGER PRIMARY KEY,
  log_date    TEXT NOT NULL UNIQUE, -- YYYY-MM-DD
  skin_rating INTEGER CHECK (skin_rating BETWEEN 1 AND 5),
  notes       TEXT,
  is_complete INTEGER NOT NULL DEFAULT 0, -- stored so the streak outlives routine edits
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS step_completions (
  id              INTEGER PRIMARY KEY,
  daily_log_id    INTEGER NOT NULL REFERENCES daily_logs (id) ON DELETE CASCADE,
  routine_step_id INTEGER NOT NULL REFERENCES routine_steps (id) ON DELETE CASCADE,
  completed_at    TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (daily_log_id, routine_step_id)
);

CREATE INDEX IF NOT EXISTS idx_step_completions_step ON step_completions (routine_step_id);
