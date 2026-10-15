import fs from 'node:fs';
import path from 'node:path';

/** Applies database/migrations/*.sql in lexical order, each exactly once, each in its own transaction. */
export async function migrate(db, migrationsDir) {
  await db.exec(`CREATE TABLE IF NOT EXISTS schema_migrations (
    version TEXT PRIMARY KEY,
    applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )`);
  const files = fs.readdirSync(migrationsDir).filter((f) => f.endsWith('.sql')).sort();
  const { rows } = await db.query('SELECT version FROM schema_migrations');
  const applied = new Set(rows.map((r) => r.version));
  const newlyApplied = [];
  for (const file of files) {
    if (applied.has(file)) continue;
    const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf8');
    await db.tx(async (t) => {
      await t.exec(sql);
      await t.query('INSERT INTO schema_migrations (version) VALUES ($1)', [file]);
    });
    newlyApplied.push(file);
  }
  return { applied: newlyApplied, total: files.length };
}
