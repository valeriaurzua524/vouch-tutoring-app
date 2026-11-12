import { mkdirSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import pg from 'pg';
import { config } from '../config.js';
import { SCHEMA_SQL } from './schema.js';
import { COURSES } from './catalog.js';

/** Anything that can run a parameterised query: the database or an open transaction. */
export interface Queryable {
  query<T = any>(sql: string, params?: unknown[]): Promise<{ rows: T[] }>;
}

export interface Db extends Queryable {
  kind: 'pg' | 'pglite';
  /** Runs fn inside one transaction; commits on return, rolls back on throw. */
  tx<T>(fn: (q: Queryable) => Promise<T>): Promise<T>;
  /** Runs a multi-statement script with no parameters. */
  exec(sql: string): Promise<void>;
  close(): Promise<void>;
}

function fromPglite(lite: PGlite): Db {
  return {
    kind: 'pglite',
    query: (sql, params) => lite.query(sql, params as any[]) as any,
    tx: (fn) =>
      lite.transaction((t) => fn({ query: (sql, params) => t.query(sql, params as any[]) as any })) as any,
    exec: async (sql) => {
      await lite.exec(sql);
    },
    close: () => lite.close(),
  };
}

function fromPool(pool: pg.Pool): Db {
  return {
    kind: 'pg',
    query: (sql, params) => pool.query(sql, params as any[]) as any,
    tx: async (fn) => {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const out = await fn({ query: (sql, params) => client.query(sql, params as any[]) as any });
        await client.query('COMMIT');
        return out;
      } catch (err) {
        await client.query('ROLLBACK').catch(() => {});
        throw err;
      } finally {
        client.release();
      }
    },
    exec: async (sql) => {
      await pool.query(sql);
    },
    close: () => pool.end(),
  };
}

/** Creates tables and triggers (idempotent) and loads the course catalog. */
export async function migrate(db: Db): Promise<void> {
  await db.exec(SCHEMA_SQL);
  for (const c of COURSES) {
    await db.query(
      `INSERT INTO courses (code, subject, number, title, topics)
       VALUES ($1, $2, $3, $4, $5::jsonb)
       ON CONFLICT (code) DO UPDATE SET title = EXCLUDED.title, topics = EXCLUDED.topics`,
      [c.code, c.subject, c.number, c.title, JSON.stringify(c.topics)],
    );
  }
}

/**
 * Opens the database. With DATABASE_URL it connects to PostgreSQL; without it
 * it runs PGlite (PostgreSQL compiled to WebAssembly) so the project starts
 * with no database install. Both run the same SQL, including the ledger triggers.
 */
export async function openDb(opts: { memory?: boolean; url?: string } = {}): Promise<Db> {
  let db: Db;
  if (opts.url) {
    db = fromPool(new pg.Pool({ connectionString: opts.url }));
  } else if (opts.memory) {
    db = fromPglite(new PGlite());
  } else if (config.databaseUrl) {
    db = fromPool(new pg.Pool({ connectionString: config.databaseUrl }));
  } else {
    mkdirSync(config.pgliteDir, { recursive: true });
    db = fromPglite(new PGlite(config.pgliteDir));
  }
  await migrate(db);
  return db;
}
