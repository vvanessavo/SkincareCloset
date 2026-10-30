import express from 'express';
import { productsRouter } from './routes/products.js';
import { routinesRouter } from './routes/routines.js';

export function createApp(db) {
  const app = express();

  app.use(express.json());
  app.use('/api/products', productsRouter(db));
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
