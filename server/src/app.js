import { mkdirSync } from 'node:fs';
import express from 'express';
import { uploadsPath } from './db.js';
import { catalogRouter } from './routes/catalog.js';
import { checklistRouter } from './routes/checklist.js';
import { productsRouter } from './routes/products.js';
import { routinesRouter } from './routes/routines.js';

export function createApp(db, uploadsDir = uploadsPath) {
  const app = express();

  mkdirSync(uploadsDir, { recursive: true });

  app.use(express.json());
  app.use('/api/uploads', express.static(uploadsDir));
  app.use('/api/catalog', catalogRouter(db));
  app.use('/api/checklist', checklistRouter(db));
  app.use('/api/products', productsRouter(db, uploadsDir));
  app.use('/api/routines', routinesRouter(db));

  app.use((req, res) => {
    res.status(404).json({ error: 'Not found' });
  });

  app.use((err, req, res, next) => {
    const status = err.status ?? 500;
    if (status >= 500) console.error(err);
    res.status(status).json({ error: status >= 500 ? 'Internal server error' : err.message });
  });

  return app;
}
