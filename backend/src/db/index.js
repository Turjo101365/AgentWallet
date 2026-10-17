import fs from 'node:fs';
import pg from 'pg';

/**
 * Database adapter with one interface for two engines:
 *  - PostgreSQL via DATABASE_URL (Docker / production-like)
 *  - PGlite (PostgreSQL compiled to WASM) persisted to a local directory, used when no
 *    DATABASE_URL is set. Same SQL, same constraints, restart-safe. 'memory://' is for tests.
 *
 * query(text, params) -> { rows, rowCount }
 * exec(sql)           -> runs a multi-statement script (migrations)
 * tx(fn)              -> runs fn({ query, exec }) inside BEGIN/COMMIT, rolling back on error
 */
export async function openDatabase({ databaseUrl, pgliteDir }) {
  if (databaseUrl) return openPostgres(databaseUrl);
  return openPglite(pgliteDir);
}

function openPostgres(connectionString) {
  const pool = new pg.Pool({ connectionString, max: 5, connectionTimeoutMillis: 10000, idleTimeoutMillis: 30000, query_timeout: 15000 });
  pool.on('error', () => {}); // idle client errors surface on the next query instead
  return {
    kind: 'postgres',
    query: (text, params) => pool.query(text, params),
    exec: (sql) => pool.query(sql),
    async tx(fn) {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const result = await fn({ query: (t, p) => client.query(t, p), exec: (s) => client.query(s) });
        await client.query('COMMIT');
        return result;
      } catch (err) {
        await client.query('ROLLBACK').catch(() => {});
        throw err;
      } finally {
        client.release();
      }
    },
    async ping() {
      await pool.query('SELECT 1');
    },
    close: () => pool.end(),
  };
}

async function openPglite(dir) {
  const { PGlite } = await import('@electric-sql/pglite');
  const inMemory = !dir || dir === 'memory://';
  if (!inMemory) fs.mkdirSync(dir, { recursive: true });
  const db = new PGlite(inMemory ? undefined : dir);
  await db.waitReady;
  const wrap = (r) => ({ rows: r.rows, rowCount: r.affectedRows ?? r.rows.length });
  return {
    kind: inMemory ? 'pglite-memory' : 'pglite',
    query: async (text, params) => wrap(await db.query(text, params)),
    exec: (sql) => db.exec(sql),
    tx: (fn) =>
      db.transaction((t) =>
        fn({ query: async (text, params) => wrap(await t.query(text, params)), exec: (s) => t.exec(s) }),
      ),
    async ping() {
      await db.query('SELECT 1');
    },
    close: () => db.close(),
  };
}
