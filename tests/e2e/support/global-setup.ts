import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';

// Playwright global setup: gives the empty-state specs their isolated store (empty-store.sql) and
// takes it away again after the run, so no test account or store stays behind. The SQL runs inside
// the local Supabase database container; it never touches a hosted project.

const DB_CONTAINER = process.env.SUPABASE_DB_CONTAINER ?? 'supabase_db_warung-kasir';

function runSql(file: string) {
  const sql = readFileSync(path.resolve(process.cwd(), 'tests', 'e2e', 'support', file), 'utf8');
  const result = spawnSync(
    'docker',
    ['exec', '-i', DB_CONTAINER, 'psql', '-U', 'postgres', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1', '-q'],
    { input: sql, encoding: 'utf8' },
  );
  if (result.status !== 0) {
    throw new Error(
      `Could not run ${file} in the local database container "${DB_CONTAINER}" (is the local Supabase stack running?):\n` +
        `${result.stderr || result.error?.message || 'no output'}`,
    );
  }
}

export default function globalSetup() {
  runSql('empty-store-remove.sql'); // start from nothing, even after an aborted run
  runSql('empty-store.sql');
  return () => runSql('empty-store-remove.sql');
}
