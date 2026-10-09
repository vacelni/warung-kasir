import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

// INFO-3 (SECURITY E.9–E.10): what a cashier's OLD tokens can still do after the owner resets the
// password, deactivates the account, or deactivates and reactivates it. Real GoTrue, PostgREST, and
// admin-cashier Edge Function on the local stack (`npx supabase start` with the edge runtime;
// restart it after editing the function). Every account it creates is an "itest-life-" cashier and
// is removed in afterAll.
//
// Measured before the fix (GoTrue v2.197.0): after a reset the old access token still passed RLS and
// the RPC until it expired; after deactivate → reactivate the old refresh and access tokens worked
// again. Now each old session ends for good and its access token is refused at once.

const CONTAINER = 'supabase_db_warung-kasir';
const STORE_A = '5a000000-0000-4000-8000-000000000001';
const APP_ORIGIN = 'http://localhost:3100';

function env(): { url: string; key: string } {
  let file = '';
  try {
    file = readFileSync(join(process.cwd(), '.env.local'), 'utf8');
  } catch {
    // Fall back to the process environment.
  }
  const read = (name: string) => new RegExp(`^${name}=(.*)$`, 'm').exec(file)?.[1]?.trim() ?? process.env[name] ?? '';
  return { url: read('NEXT_PUBLIC_SUPABASE_URL'), key: read('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY') };
}
const { url: URL_BASE, key: KEY } = env();

function sql(query: string): string {
  return execFileSync('docker', ['exec', '-i', CONTAINER, 'psql', '-U', 'postgres', '-d', 'postgres', '-At', '-v', 'ON_ERROR_STOP=1'], {
    input: query,
    encoding: 'utf8',
  }).trim();
}

type Tokens = { access: string; refresh: string };

async function passwordLogin(email: string, password: string): Promise<Tokens> {
  const response = await fetch(`${URL_BASE}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  const body = (await response.json()) as { access_token?: string; refresh_token?: string };
  if (!body.access_token || !body.refresh_token) throw new Error(`login failed for ${email}: ${response.status}`);
  return { access: body.access_token, refresh: body.refresh_token };
}

async function adminCashier(ownerToken: string, body: Record<string, unknown>) {
  const response = await fetch(`${URL_BASE}/functions/v1/admin-cashier`, {
    method: 'POST',
    headers: { apikey: KEY, Authorization: `Bearer ${ownerToken}`, Origin: APP_ORIGIN, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return { status: response.status, body: (await response.json().catch(() => ({}))) as Record<string, unknown> };
}

let product: { id: string; name: string; price: number };

/** Everything the old tokens are checked against. */
async function whatTokensCanDo(tokens: Tokens) {
  const refresh = await fetch(`${URL_BASE}/auth/v1/token?grant_type=refresh_token`, {
    method: 'POST',
    headers: { apikey: KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ refresh_token: tokens.refresh }),
  });
  const authUser = await fetch(`${URL_BASE}/auth/v1/user`, { headers: { apikey: KEY, Authorization: `Bearer ${tokens.access}` } });
  const products = await fetch(`${URL_BASE}/rest/v1/products?select=id`, { headers: { apikey: KEY, Authorization: `Bearer ${tokens.access}` } });
  const id = randomUUID();
  const createdAt = new Date();
  const day = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jakarta' }).format(createdAt).replaceAll('-', '');
  const rpc = await fetch(`${URL_BASE}/rest/v1/rpc/create_transaction`, {
    method: 'POST',
    headers: { apikey: KEY, Authorization: `Bearer ${tokens.access}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      p_id: id,
      p_code: `TRX-${day}-${id.replaceAll('-', '').slice(0, 6).toUpperCase()}`,
      p_created_at: createdAt.toISOString(),
      p_total: product.price,
      p_paid_amount: product.price,
      p_change_amount: 0,
      p_items: [{ product_id: product.id, product_name: product.name, unit_price: product.price, quantity: 1, subtotal: product.price }],
    }),
  });
  // A cashier is never allowed to administer; what matters is whether the token passes the auth step.
  const edge = await adminCashier(tokens.access, { action: 'set_active', cashier_id: randomUUID(), is_active: true });
  return {
    refresh: refresh.status,
    authUser: authUser.status,
    productRows: ((await products.json()) as unknown[]).length,
    rpc: rpc.ok ? String(await rpc.json()) : (((await rpc.json()) as { code?: string }).code ?? `HTTP ${rpc.status}`),
    edgeFunction: edge.status,
  };
}

const REVOKED = { refresh: 400, authUser: 403, productRows: 0, rpc: 'WK003', edgeFunction: 401 };

let owner: string;
const tag = Date.now().toString(36);

async function newCashier(name: string): Promise<{ id: string; email: string; password: string }> {
  const email = `itest-life-${name}-${tag}@warungkasir.test`;
  const password = 'awal-12345';
  const made = await adminCashier(owner, { action: 'create', name: `Life ${name}`, email, password });
  expect(made.status, JSON.stringify(made.body)).toBe(201);
  return { id: (made.body.cashier as { id: string }).id, email, password };
}

const sessionsOf = (userId: string) => Number(sql(`select count(*) from auth.sessions where user_id = '${userId}';`));

beforeAll(async () => {
  const host = new URL(URL_BASE).hostname;
  if (host !== '127.0.0.1' && host !== 'localhost') throw new Error(`Refusing to run against ${host}: local stack only.`);
  const [id = '', name = '', price = ''] = sql(
    `select id, name, price from public.products where store_id = '${STORE_A}' and is_active order by name limit 1;`,
  ).split('|');
  product = { id, name, price: Number(price) };
  owner = (await passwordLogin('owner.a@warungkasir.test', 'password123')).access;
});

afterAll(() => {
  sql(`
    delete from public.transaction_items where transaction_id in
      (select t.id from public.transactions t join auth.users u on u.id = t.cashier_id where u.email like 'itest-life-%');
    delete from public.transactions where cashier_id in (select id from auth.users where email like 'itest-life-%');
    delete from public.profiles where id in (select id from auth.users where email like 'itest-life-%');
    delete from auth.users where email like 'itest-life-%';
  `);
});

describe('old tokens after an owner action (INFO-3)', () => {
  it('baseline: an untouched session can do everything a cashier may', async () => {
    const cashier = await newCashier('baseline');
    const tokens = await passwordLogin(cashier.email, cashier.password);
    expect(await whatTokensCanDo(tokens)).toEqual({ refresh: 200, authUser: 200, productRows: expect.any(Number), rpc: 'created', edgeFunction: 403 });
    expect((await whatTokensCanDo(await passwordLogin(cashier.email, cashier.password))).productRows).toBeGreaterThan(0);
  });

  it('password reset: the old session ends; its access token is refused at once everywhere', async () => {
    const cashier = await newCashier('reset');
    const tokens = await passwordLogin(cashier.email, cashier.password);
    expect((await adminCashier(owner, { action: 'reset_password', cashier_id: cashier.id, password: 'baru-12345' })).status).toBe(200);

    expect(sessionsOf(cashier.id)).toBe(0);
    expect(await whatTokensCanDo(tokens)).toEqual(REVOKED);
    // The new password works and opens a fresh, working session.
    expect((await whatTokensCanDo(await passwordLogin(cashier.email, 'baru-12345'))).rpc).toBe('created');
  });

  it('deactivation: sessions end, refresh is refused, data and RPC refused', async () => {
    const cashier = await newCashier('deactivate');
    const tokens = await passwordLogin(cashier.email, cashier.password);
    expect((await adminCashier(owner, { action: 'set_active', cashier_id: cashier.id, is_active: false })).status).toBe(200);

    expect(sessionsOf(cashier.id)).toBe(0);
    // The inactive profile is checked first: a deactivated cashier's sale is WK002, marked failed
    // and kept on the device (SECURITY E.10), not WK003.
    expect(await whatTokensCanDo(tokens)).toEqual({ ...REVOKED, rpc: 'WK002' });
  });

  it('deactivation then reactivation: the old session does NOT come back; a new login works', async () => {
    const cashier = await newCashier('reactivate');
    const tokens = await passwordLogin(cashier.email, cashier.password);
    expect((await adminCashier(owner, { action: 'set_active', cashier_id: cashier.id, is_active: false })).status).toBe(200);
    expect((await adminCashier(owner, { action: 'set_active', cashier_id: cashier.id, is_active: true })).status).toBe(200);

    expect(await whatTokensCanDo(tokens)).toEqual(REVOKED);
    expect((await whatTokensCanDo(await passwordLogin(cashier.email, cashier.password))).rpc).toBe('created');
  });
});
