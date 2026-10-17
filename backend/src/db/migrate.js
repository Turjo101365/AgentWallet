import fs from 'node:fs';
import path from 'node:path';

/** Serializes production migrations during rolling deploys and applies the pending set atomically. */
export async function migrate(db, migrationsDir) {
  return db.tx(async (t) => {
    if (db.kind === 'postgres') await t.query('SELECT pg_advisory_xact_lock(11155111, 3)');
    await t.exec(`CREATE TABLE IF NOT EXISTS schema_migrations (
      version TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )`);
    const files = fs.readdirSync(migrationsDir).filter((f) => f.endsWith('.sql')).sort();
    const { rows } = await t.query('SELECT version FROM schema_migrations');
    const applied = new Set(rows.map((r) => r.version));
    const newlyApplied = [];
    for (const file of files) {
      if (applied.has(file)) continue;
      const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf8');
      await t.exec(sql);
      await t.query('INSERT INTO schema_migrations (version) VALUES ($1)', [file]);
      newlyApplied.push(file);
    }
    return { applied: newlyApplied, total: files.length };
  });
}
