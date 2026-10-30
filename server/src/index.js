import { fileURLToPath } from 'node:url';
import { createApp } from './app.js';
import { openDatabase } from './db.js';

const port = process.env.PORT ?? 3001;
const dbPath =
  process.env.DATABASE_PATH ?? fileURLToPath(new URL('../data/skincare.db', import.meta.url));

const app = createApp(openDatabase(dbPath));

app.listen(port, () => {
  console.log(`API listening on http://localhost:${port}`);
});
