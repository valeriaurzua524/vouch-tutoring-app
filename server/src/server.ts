import { createApp } from './app.js';
import { config } from './config.js';
import { openDb } from './db/index.js';
import { DEMO_PASSWORD, seedDemo } from './db/seed.js';

const db = await openDb();
if (config.seedDemo) {
  await seedDemo(db);
  console.log(`Demo accounts ready (password: ${DEMO_PASSWORD}). See README for the list.`);
}
const app = createApp(db);

const server = app.listen(config.port, () => {
  console.log(`Vouch API listening on http://localhost:${config.port}/api  (database: ${db.kind})`);
});

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    server.close(() => {
      db.close().finally(() => process.exit(0));
    });
  });
}
