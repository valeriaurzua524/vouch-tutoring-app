import cors from 'cors';
import express, { type Express } from 'express';
import helmet from 'helmet';
import { config } from './config.js';
import type { Db } from './db/index.js';
import { errorHandler, HttpError } from './http.js';
import { accountRoutes } from './routes/accounts.js';
import { adminRoutes } from './routes/admin.js';
import { bookingRoutes } from './routes/bookings.js';
import { ledgerRoutes } from './routes/ledger.js';
import { requestRoutes } from './routes/requests.js';

export function createApp(db: Db): Express {
  const app = express();
  app.disable('x-powered-by');
  app.use(helmet());
  app.use(cors({ origin: config.corsOrigin }));
  app.use(express.json({ limit: '100kb' }));

  app.get('/api/health', async (_req, res) => {
    await db.query('SELECT 1');
    res.json({ ok: true, database: db.kind, llm: config.llmKey ? 'hosted' : 'rules-only' });
  });

  app.use('/api', accountRoutes(db), requestRoutes(db), bookingRoutes(db), ledgerRoutes(db), adminRoutes(db));

  app.use(() => {
    throw new HttpError(404, 'NOT_FOUND', 'No such route');
  });
  app.use(errorHandler(db));
  return app;
}
