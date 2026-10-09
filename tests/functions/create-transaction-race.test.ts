import { execFileSync, spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

// SEC-05: two concurrent create_transaction calls with the same id (DATABASE D.9, TEST_PLAN G.16).
// A real race between two database sessions: session A inserts and keeps its transaction open;
// session B, started meanwhile, passes the "id exists" pre-check (A's row is not committed yet),
// waits on the unique index, and lands in the ON CONFLICT branch when A commits.
//   - B is another cashier → WK001, never 'exists' (the sale is not B's).
//   - B is the same cashier (a retry from a second tab) → 'exists'.
// Runs psql in the local database container only (guarded below); every row it creates is removed.

const CONTAINER = 'supabase_db_warung-kasir';
const STORE_A = '5a000000-0000-4000-8000-000000000001';
const KASIR1_A = 'a2000000-0000-4000-8000-000000000001';
const KASIR2_A = 'a2000000-0000-4000-8000-000000000002';
/** How long session A keeps its transaction open after inserting. */
const HOLD_SECONDS = 2;

function localSupabaseUrl(): string {
  let file = '';
  try {
    file = readFileSync(join(process.cwd(), '.env.local'), 'utf8');
  } catch {
    // Fall back to the process environment.
  }
  return /^NEXT_PUBLIC_SUPABASE_URL=(.*)$/m.exec(file)?.[1]?.trim() ?? process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
}

function sql(query: string): string {
  return execFileSync('docker', ['exec', '-i', CONTAINER, 'psql', '-U', 'postgres', '-d', 'postgres', '-At', '-v', 'ON_ERROR_STOP=1'], {
    input: query,
    encoding: 'utf8',
  }).trim();
}

type Session = { ok: boolean; output: string };

/**
 * One psql session in the background. `done` resolves when it exits; `printed(marker)` resolves
 * as soon as its output contains `marker` (used to start the second session at the right moment).
 */
function session(script: string): { done: Promise<Session>; printed: (marker: string) => Promise<void> } {
  let output = '';
  const waiters: Array<{ marker: string; resolve: () => void }> = [];
  const child = spawn('docker', ['exec', '-i', CONTAINER, 'psql', '-U', 'postgres', '-d', 'postgres', '-At', '-v', 'ON_ERROR_STOP=1']);
  const append = (chunk: Buffer) => {
    output += chunk.toString();
    for (const waiter of waiters.filter((w) => output.includes(w.marker))) waiter.resolve();
  };
  child.stdout.on('data', append);
  child.stderr.on('data', append);
  const done = new Promise<Session>((resolve, reject) => {
    child.on('error', reject);
    child.on('close', (code) => resolve({ ok: code === 0, output: output.trim() }));
  });
  child.stdin.end(script);
  return {
    done,
    // Fails instead of hanging when the session ends without printing the marker.
    printed: (marker) =>
      Promise.race([
        new Promise<void>((resolve) => (output.includes(marker) ? resolve() : waiters.push({ marker, resolve }))),
        done.then((result) => {
          if (!result.output.includes(marker)) throw new Error(`session ended without ${marker}:
${result.output}`);
        }),
      ]),
  };
}

/** Database clock (epoch seconds) printed by a session as `<label>=<value>`. */
function clock(output: string, label: string): number {
  const value = new RegExp(`^${label}=([0-9.]+)$`, 'm').exec(output)?.[1];
  if (value === undefined) throw new Error(`no ${label}= in:
${output}`);
  return Number(value);
}

let product: { id: string; name: string; price: number };

/** Display code for a sale: Asia/Jakarta date of created_at + first 6 hex of the id (D.6). */
function codeFor(id: string, createdAt: Date): string {
  const day = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jakarta', year: 'numeric', month: '2-digit', day: '2-digit' })
    .format(createdAt)
    .replaceAll('-', '');
  return `TRX-${day}-${id.replaceAll('-', '').slice(0, 6).toUpperCase()}`;
}

/**
 * SQL that calls create_transaction as `cashierId` inside its own transaction, then holds it open.
 * Prints the database clock before the call (`calling=`), after it (`called=`), and just before
 * committing (`committing=`).
 */
function callAs(cashierId: string, id: string, holdSeconds: number): string {
  const createdAt = new Date();
  const items = JSON.stringify([
    { product_id: product.id, product_name: product.name, unit_price: product.price, quantity: 1, subtotal: product.price },
  ]);
  return `
begin;
select set_config('request.jwt.claims', '${JSON.stringify({ sub: cashierId, role: 'authenticated', session_id: sessionOf[cashierId] })}', true);
set local role authenticated;
select 'calling=' || extract(epoch from clock_timestamp());
select 'result=' || public.create_transaction(
  '${id}', '${codeFor(id, createdAt)}', '${createdAt.toISOString()}',
  ${product.price}, ${product.price}, 0, '${items}'::jsonb);
select 'called=' || extract(epoch from clock_timestamp());
select pg_sleep(${holdSeconds});
select 'committing=' || extract(epoch from clock_timestamp());
commit;
`;
}

const created: string[] = [];
/** One live auth session per cashier: authorization requires the token's session to exist (INFO-3). */
const sessionOf: Record<string, string> = { [KASIR1_A]: randomUUID(), [KASIR2_A]: randomUUID() };

beforeAll(() => {
  const host = new URL(localSupabaseUrl()).hostname;
  if (host !== '127.0.0.1' && host !== 'localhost') throw new Error(`Refusing to run against ${host}: local stack only.`);
  const [id = '', name = '', price = ''] = sql(
    `select id, name, price from public.products where store_id = '${STORE_A}' and is_active order by name limit 1;`,
  ).split('|');
  product = { id, name, price: Number(price) };
  expect(product.price).toBeGreaterThan(0);
  sql(
    `insert into auth.sessions (id, user_id, created_at, updated_at) values ${Object.entries(sessionOf)
      .map(([user, session]) => `('${session}', '${user}', now(), now())`)
      .join(', ')};`,
  );
});

afterAll(() => {
  sql(`delete from auth.sessions where id in (${Object.values(sessionOf).map((id) => `'${id}'`).join(', ')});`);
  if (created.length === 0) return;
  const ids = created.map((id) => `'${id}'`).join(', ');
  sql(`delete from public.transaction_items where transaction_id in (${ids}); delete from public.transactions where id in (${ids});`);
});

async function race(secondCashier: string) {
  const id = randomUUID();
  created.push(id);
  const first = session(callAs(KASIR1_A, id, HOLD_SECONDS));
  await first.printed('called='); // A has inserted and holds its transaction open
  const second = session(callAs(secondCashier, id, 0));
  const [a, b] = await Promise.all([first.done, second.done]);
  // B really raced: its call started while A's row existed but was not committed, so B's "id
  // exists" pre-check could not see it; B then waited on the unique index until A committed.
  expect(clock(b.output, 'calling')).toBeGreaterThan(clock(a.output, 'called'));
  expect(clock(b.output, 'calling')).toBeLessThan(clock(a.output, 'committing'));
  const rows = sql(`select cashier_id || '|' || (select count(*) from public.transaction_items where transaction_id = '${id}') from public.transactions where id = '${id}';`);
  return { a, b, rows };
}

describe('create_transaction under a real concurrent insert of the same id (SEC-05)', () => {
  it('another cashier racing the same id is rejected with WK001, not told the sale exists', async () => {
    const { a, b, rows } = await race(KASIR2_A);

    expect(a.ok, a.output).toBe(true);
    expect(a.output).toContain('result=created');
    expect(b.ok, b.output).toBe(false);
    expect(b.output).toMatch(/id belongs to another transaction/);
    expect(b.output).not.toContain('result=exists');
    // One sale, A's, unchanged.
    expect(rows).toBe(`${KASIR1_A}|1`);
  });

  it('the same cashier racing their own id (a second tab) gets exists; one sale is stored', async () => {
    const { a, b, rows } = await race(KASIR1_A);

    expect(a.output).toContain('result=created');
    expect(b.ok, b.output).toBe(true);
    expect(clock(b.output, 'called')).toBeGreaterThanOrEqual(clock(a.output, 'committing')); // it waited for A
    expect(b.output).toContain('result=exists');
    expect(rows).toBe(`${KASIR1_A}|1`);
  });
});
