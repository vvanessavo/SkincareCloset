import { mkdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import Database from 'better-sqlite3';

const schema = readFileSync(new URL('./schema.sql', import.meta.url), 'utf8');

export const databasePath =
  process.env.DATABASE_PATH ?? fileURLToPath(new URL('../data/skincare.db', import.meta.url));

// Next to the database, so a different database never shares pictures with this one.
export const uploadsPath = join(dirname(databasePath), 'uploads');

const ADDED_COLUMNS = [
  ['products', 'image', 'TEXT'],
  ['products', 'catalog_code', 'TEXT'],
  ['daily_logs', 'is_complete', 'INTEGER NOT NULL DEFAULT 0'],
];

export function openDatabase(path) {
  if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });

  const db = new Database(path);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.exec(schema);

  // CREATE TABLE IF NOT EXISTS leaves existing tables as they are.
  for (const [table, column, definition] of ADDED_COLUMNS) {
    const columns = db.pragma(`table_info(${table})`).map((info) => info.name);
    if (!columns.includes(column)) {
      db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
    }
  }

  return db;
}
