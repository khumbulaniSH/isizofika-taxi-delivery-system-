import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { pool } from '../src/db.js';

const migrationsDir = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  'migrations',
);

async function ensureMigrationsTable(client) {
  await client.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      filename text PRIMARY KEY,
      applied_at timestamptz NOT NULL DEFAULT now()
    )
  `);
}

async function getAppliedMigrations(client) {
  const result = await client.query('SELECT filename FROM schema_migrations');
  return new Set(result.rows.map((row) => row.filename));
}

async function applyMigration(client, filename) {
  const sql = await readFile(path.join(migrationsDir, filename), 'utf8');
  try {
    await client.query('BEGIN');
    await client.query(sql);
    await client.query('INSERT INTO schema_migrations (filename) VALUES ($1)', [
      filename,
    ]);
    await client.query('COMMIT');
    console.log(`applied   ${filename}`);
  } catch (err) {
    await client.query('ROLLBACK');
    console.error(`failed    ${filename}: ${err.message}`);
    throw err;
  }
}

async function main() {
  const files = (await readdir(migrationsDir))
    .filter((name) => name.endsWith('.sql'))
    .sort();

  const client = await pool.connect();
  try {
    await ensureMigrationsTable(client);
    const applied = await getAppliedMigrations(client);

    for (const filename of files) {
      if (applied.has(filename)) {
        console.log(`skipped   ${filename} (already applied)`);
        continue;
      }
      await applyMigration(client, filename);
    }

    if (files.length === 0) {
      console.log('No migration files found.');
    }
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch(() => {
  process.exit(1);
});
