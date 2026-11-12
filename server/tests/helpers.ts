import { randomBytes } from 'node:crypto';
import pg from 'pg';
import { openDb, type Db } from '../src/db/index.js';

/**
 * A fresh, empty database for one test file.
 *
 * Default: in-memory PGlite, so `npm test` needs nothing installed.
 * With TEST_DATABASE_URL set (CI does this), each file gets its own newly
 * created database on that PostgreSQL server, so the same suites also run
 * against the real thing.
 */
export async function openTestDb(): Promise<Db> {
  const base = process.env.TEST_DATABASE_URL;
  if (!base) return openDb({ memory: true });

  const name = `vouch_test_${randomBytes(6).toString('hex')}`;
  const admin = new pg.Client({ connectionString: base });
  await admin.connect();
  await admin.query(`CREATE DATABASE ${name}`);
  await admin.end();

  const url = new URL(base);
  url.pathname = `/${name}`;
  return openDb({ url: url.toString() });
}
