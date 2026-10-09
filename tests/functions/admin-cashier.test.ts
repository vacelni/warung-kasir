import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

// admin-cashier over real HTTP against the local stack (TEST_PLAN G.7, SECURITY E.10–E.11, H13).
// Needs `npx supabase start` (with the edge runtime), the dev seed, and .env.local. Run with
// `npm run test:functions`. Everything this file creates uses "itest-" emails or store C and is
// removed again in afterAll; seed accounts are only read, or checked to be unchanged.
//
// Direct SQL (fixtures, the H13 trigger, and checks on auth.users) goes through psql in the local
// database container, never through the app or a secret key.

const PASSWORD = 'password123';
const STORE_A = '5a000000-0000-4000-8000-000000000001';
const OWNER_A = 'a1000000-0000-4000-8000-000000000001';
const KASIR1_A = 'a2000000-0000-4000-8000-000000000001';
const KASIR1_B = 'b2000000-0000-4000-8000-000000000001';
const STORE_C = '5c000000-0000-4000-9100-000000000001';
const OWNER_C_INACTIVE = 'c1000000-0000-4000-9100-000000000001';
const NO_PROFILE = 'c9000000-0000-4000-9100-000000000001';
const APP_ORIGIN = 'http://localhost:3100';
const H13_NAME = 'H13 Gagal Profil';

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

const { url: SUPABASE_URL, key: PUBLISHABLE_KEY } = env();
const FUNCTION_URL = `${SUPABASE_URL}/functions/v1/admin-cashier`;

/** Runs SQL as postgres in the local database container; returns the unaligned output. */
function sql(query: string): string {
  return execFileSync(
    'docker',
    ['exec', '-i', 'supabase_db_warung-kasir', 'psql', '-U', 'postgres', '-d', 'postgres', '-At', '-v', 'ON_ERROR_STOP=1'],
    { input: query, encoding: 'utf8' },
  ).trim();
}

const tag = Date.now().toString(36);
const email = (name: string) => `itest-${name}-${tag}@warungkasir.test`;

type SignIn = { status: number; token: string | null; errorCode: string | null };

async function signIn(address: string, password = PASSWORD): Promise<SignIn> {
  const response = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: PUBLISHABLE_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: address, password }),
  });
  const body = (await response.json()) as { access_token?: string; error_code?: string };
  return { status: response.status, token: body.access_token ?? null, errorCode: body.error_code ?? null };
}

async function tokenFor(address: string): Promise<string> {
  const result = await signIn(address);
  if (!result.token) throw new Error(`Could not sign in ${address}: ${result.status} ${result.errorCode}`);
  return result.token;
}

type Call = { status: number; body: Record<string, unknown>; text: string };

async function callFunction(body: unknown, token: string | null, origin: string | null = APP_ORIGIN): Promise<Call> {
  const headers: Record<string, string> = { apikey: PUBLISHABLE_KEY, 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  if (origin) headers.Origin = origin;
  const response = await fetch(FUNCTION_URL, { method: 'POST', headers, body: JSON.stringify(body) });
  const text = await response.text();
  let parsed: Record<string, unknown> = {};
  try {
    parsed = JSON.parse(text) as Record<string, unknown>;
  } catch {
    // The gateway may answer with a non-JSON body; status is what matters then.
  }
  return { status: response.status, body: parsed, text };
}

const profileOf = (id: string) => sql(`select store_id || '|' || role || '|' || is_active || '|' || name from public.profiles where id = '${id}';`);
const isBanned = (id: string) => sql(`select coalesce(banned_until > now(), false) from auth.users where id = '${id}';`) === 't';
const authUserCount = (address: string) => Number(sql(`select count(*) from auth.users where email = '${address}';`));

function cleanup() {
  sql(`
    drop trigger if exists itest_fail_profile on public.profiles;
    drop function if exists public.itest_fail_profile();
    delete from public.profiles where id in (select id from auth.users where email like 'itest-%@warungkasir.test');
    delete from auth.users where email like 'itest-%@warungkasir.test';
    delete from public.stores where id = '${STORE_C}';
  `);
}

let ownerA: string;
let ownerB: string;
let cashierA: string;

beforeAll(async () => {
  if (!SUPABASE_URL || !PUBLISHABLE_KEY) throw new Error('Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY (.env.local).');
  cleanup();
  // Store C with an inactive owner, and a signed-up user without any profile.
  sql(`
    insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
      raw_app_meta_data, raw_user_meta_data, created_at, updated_at, confirmation_token, recovery_token, email_change, email_change_token_new)
    select '00000000-0000-0000-0000-000000000000', id, 'authenticated', 'authenticated', address,
      extensions.crypt('${PASSWORD}', extensions.gen_salt('bf')), now(),
      '{"provider":"email","providers":["email"]}', '{}', now(), now(), '', '', '', ''
    from (values ('${OWNER_C_INACTIVE}'::uuid, '${email('owner-c')}'), ('${NO_PROFILE}'::uuid, '${email('noprofile')}')) as v(id, address);
    insert into auth.identities (provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
    select u.id::text, u.id, jsonb_build_object('sub', u.id::text, 'email', u.email, 'email_verified', true), 'email', now(), now(), now()
    from auth.users u where u.id in ('${OWNER_C_INACTIVE}', '${NO_PROFILE}');
    insert into public.stores (id, name) values ('${STORE_C}', 'Warung Uji C');
    insert into public.profiles (id, store_id, name, role, is_active) values ('${OWNER_C_INACTIVE}', '${STORE_C}', 'Owner C', 'owner', false);
  `);
  [ownerA, ownerB, cashierA] = await Promise.all([
    tokenFor('owner.a@warungkasir.test'),
    tokenFor('owner.b@warungkasir.test'),
    tokenFor('kasir1.a@warungkasir.test'),
  ]);
});

afterAll(() => {
  cleanup();
});

const createBody = (name: string, address: string, extra: Record<string, unknown> = {}) => ({
  action: 'create',
  name,
  email: address,
  password: 'kasir-baru-123',
  ...extra,
});

describe('who may call it', () => {
  it('rejects an anonymous request and a forged token, creating nothing', async () => {
    const address = email('anon');
    expect((await callFunction(createBody('Anon', address), null)).status).toBe(401);
    expect((await callFunction(createBody('Anon', address), 'not-a-real-token')).status).toBe(401);
    expect(authUserCount(address)).toBe(0);
  });

  it('gives a cashier 403 for every action and changes nothing', async () => {
    const address = email('by-cashier');
    const calls = [
      createBody('Lewat Kasir', address),
      { action: 'set_active', cashier_id: '00000000-0000-4000-8000-000000000000', is_active: false },
      { action: 'set_active', cashier_id: KASIR1_A, is_active: false },
      { action: 'reset_password', cashier_id: KASIR1_A, password: 'diganti-kasir' },
    ];
    for (const body of calls) {
      const result = await callFunction(body, cashierA);
      expect(result.status).toBe(403);
      expect(result.body).toEqual({ error: 'forbidden' });
    }
    expect(authUserCount(address)).toBe(0);
    expect(profileOf(KASIR1_A)).toBe(`${STORE_A}|cashier|true|Andi`);
    expect((await signIn('kasir1.a@warungkasir.test')).status).toBe(200);
  });

  it('rejects an inactive owner and a user without a profile', async () => {
    for (const address of [email('owner-c'), email('noprofile')]) {
      const token = await tokenFor(address);
      const target = email(`via-${address.slice(6, 14)}`);
      const result = await callFunction(createBody('Tidak Boleh', target), token);
      expect(result.status).toBe(403);
      expect(authUserCount(target)).toBe(0);
    }
  });

  it('rejects a request from another origin before doing anything', async () => {
    const address = email('evil-origin');
    const result = await callFunction(createBody('Asing', address), ownerA, 'https://evil.example');
    expect(result.status).toBe(403);
    expect(result.body).toEqual({ error: 'origin_not_allowed' });
    expect(authUserCount(address)).toBe(0);
  });
});

describe('cashier lifecycle (owner)', () => {
  const address = email('fajar');
  const newPassword = `baru-${randomUUID().slice(0, 8)}`;
  let cashierId = '';

  it('creates an active cashier in the owner’s store, ignoring role/store in the body', async () => {
    const result = await callFunction(
      createBody('Fajar', address.toUpperCase(), { role: 'owner', store_id: '5b000000-0000-4000-8000-000000000001', is_active: false }),
      ownerA,
    );
    expect(result.status).toBe(201);
    expect(result.text).not.toContain('kasir-baru-123');
    expect(result.body).toEqual({ cashier: { id: expect.any(String), name: 'Fajar', email: address, is_active: true } });
    cashierId = (result.body.cashier as { id: string }).id;

    expect(profileOf(cashierId)).toBe(`${STORE_A}|cashier|true|Fajar`);
    expect(isBanned(cashierId)).toBe(false);
    // Store A still has exactly one owner.
    expect(sql(`select count(*) from public.profiles where store_id = '${STORE_A}' and role = 'owner';`)).toBe('1');
    expect((await signIn(address, 'kasir-baru-123')).status).toBe(200);
  });

  it('refuses a second account with the same email (409)', async () => {
    const result = await callFunction(createBody('Fajar Lagi', address), ownerA);
    expect(result.status).toBe(409);
    expect(result.body).toEqual({ error: 'email_taken' });
    expect(authUserCount(address)).toBe(1);
  });

  it('validates input (400 with the field)', async () => {
    const short = await callFunction(createBody('Pendek', email('short'), { password: 'pendek' }), ownerA);
    expect(short).toMatchObject({ status: 400, body: { error: 'invalid_request', field: 'password' } });
    const badEmail = await callFunction(createBody('Salah', 'bukan-email'), ownerA);
    expect(badEmail).toMatchObject({ status: 400, body: { error: 'invalid_request', field: 'email' } });
    const roleChange = await callFunction({ action: 'set_role', cashier_id: cashierId, role: 'owner' }, ownerA);
    expect(roleChange).toMatchObject({ status: 400, body: { error: 'invalid_request', field: 'action' } });
    expect(profileOf(cashierId)).toBe(`${STORE_A}|cashier|true|Fajar`);
  });

  it('resets the password: the old one stops working, the new one works', async () => {
    const result = await callFunction({ action: 'reset_password', cashier_id: cashierId, password: newPassword }, ownerA);
    expect(result.status).toBe(200);
    expect(result.text).not.toContain(newPassword);
    expect((await signIn(address, 'kasir-baru-123')).errorCode).toBe('invalid_credentials');
    expect((await signIn(address, newPassword)).status).toBe(200);
  });

  it('deactivates: profile inactive, Auth user banned, login refused', async () => {
    const result = await callFunction({ action: 'set_active', cashier_id: cashierId, is_active: false }, ownerA);
    expect(result).toMatchObject({ status: 200, body: { cashier: { id: cashierId, is_active: false } } });
    expect(profileOf(cashierId)).toBe(`${STORE_A}|cashier|false|Fajar`);
    expect(isBanned(cashierId)).toBe(true);
    const login = await signIn(address, newPassword);
    expect(login.token).toBeNull();
    expect(login.errorCode).toBe('user_banned');
  });

  it('reactivates: profile active, ban lifted, login works again', async () => {
    const result = await callFunction({ action: 'set_active', cashier_id: cashierId, is_active: true }, ownerA);
    expect(result).toMatchObject({ status: 200, body: { cashier: { id: cashierId, is_active: true } } });
    expect(profileOf(cashierId)).toBe(`${STORE_A}|cashier|true|Fajar`);
    expect(isBanned(cashierId)).toBe(false);
    expect((await signIn(address, newPassword)).status).toBe(200);
  });
});

describe('limits of the owner', () => {
  it('cannot deactivate or reset themselves', async () => {
    const deactivate = await callFunction({ action: 'set_active', cashier_id: OWNER_A, is_active: false }, ownerA);
    expect(deactivate).toMatchObject({ status: 403, body: { error: 'self_change' } });
    const reset = await callFunction({ action: 'reset_password', cashier_id: OWNER_A, password: 'diganti-owner' }, ownerA);
    expect(reset.status).toBe(403);
    expect(profileOf(OWNER_A)).toBe(`${STORE_A}|owner|true|Bu Sari`);
    expect(isBanned(OWNER_A)).toBe(false);
    expect((await signIn('owner.a@warungkasir.test')).status).toBe(200);
  });

  it('cannot administer a cashier of another store (404, unchanged)', async () => {
    const deactivate = await callFunction({ action: 'set_active', cashier_id: KASIR1_B, is_active: false }, ownerA);
    expect(deactivate).toMatchObject({ status: 404, body: { error: 'not_found' } });
    const reset = await callFunction({ action: 'reset_password', cashier_id: KASIR1_B, password: 'diganti-lintas' }, ownerA);
    expect(reset.status).toBe(404);
    expect(profileOf(KASIR1_B)).toBe('5b000000-0000-4000-8000-000000000001|cashier|true|Dewi');
    expect(isBanned(KASIR1_B)).toBe(false);
    expect((await signIn('kasir1.b@warungkasir.test')).status).toBe(200);
  });

  it('cannot target store A from store B either', async () => {
    const result = await callFunction({ action: 'set_active', cashier_id: KASIR1_A, is_active: false }, ownerB);
    expect(result.status).toBe(404);
    expect(profileOf(KASIR1_A)).toBe(`${STORE_A}|cashier|true|Andi`);
  });
});

describe('H13: compensation when the profile cannot be created', () => {
  it('deletes the just-created Auth user, so no orphan account remains', async () => {
    const address = email('h13');
    // Make the profile insert fail for this one name only, after Auth has created the user.
    sql(`
      create function public.itest_fail_profile() returns trigger language plpgsql as $$
      begin
        if new.name = '${H13_NAME}' then raise exception 'itest: forced profile failure'; end if;
        return new;
      end;
      $$;
      create trigger itest_fail_profile before insert on public.profiles
        for each row execute function public.itest_fail_profile();
    `);
    try {
      const result = await callFunction(createBody(H13_NAME, address), ownerA);
      expect(result.status).toBe(500);
      // A safe error only: no database or Auth internals.
      expect(result.body).toEqual({ error: 'server_error' });
      expect(result.text).not.toContain('itest');
    } finally {
      sql(`drop trigger if exists itest_fail_profile on public.profiles; drop function if exists public.itest_fail_profile();`);
    }

    // The Auth user really was created (audit log), then removed again.
    const audit = sql(`
      select string_agg(payload->>'action', ',' order by created_at)
      from auth.audit_log_entries
      where payload->'traits'->>'user_email' = '${address}';
    `);
    expect(audit).toContain('user_signedup');
    expect(audit).toContain('user_deleted');
    expect(authUserCount(address)).toBe(0);
    expect(sql(`select count(*) from auth.identities where identity_data->>'email' = '${address}';`)).toBe('0');
    expect((await signIn(address, 'kasir-baru-123')).token).toBeNull();
  });
});

describe('request body limit over real HTTP (INFO-4)', () => {
  it('an owner request with an oversized body is refused and creates nothing', async () => {
    const address = email('oversized');
    const response = await callFunction(createBody('x'.repeat(9000), address), ownerA);
    expect(response.status).toBe(400);
    expect(response.body).toEqual({ error: 'invalid_request', field: 'body' });
    expect(authUserCount(address)).toBe(0);
  });
});
