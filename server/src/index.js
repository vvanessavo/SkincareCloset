import { createApp } from './app.js';
import { databasePath, openDatabase } from './db.js';

const port = process.env.PORT ?? 3001;

const app = createApp(openDatabase(databasePath));

app.listen(port, () => {
  console.log(`API listening on http://localhost:${port}`);
});
