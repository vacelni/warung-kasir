import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { parseAllowedOrigins } from '../_shared/cors.ts';
import { handleRequest, parseCommand, readBodyLimited, type AdminApi, type ProfileRecord } from './handler.ts';

// In-memory stand-in for the Supabase admin API. The real one is exercised over HTTP by
// tests/functions/admin-cashier.test.ts against the local stack.

const STORE_A = '5a000000-0000-4000-8000-000000000001';
const STORE_B = '5b000000-0000-4000-8000-000000000001';
const OWNER_A = 'a1000000-0000-4000-8000-000000000001';
const CASHIER_A = 'a2000000-0000-4000-8000-000000000001';
const OWNER_B = 'b1000000-0000-4000-8000-000000000001';
const CASHIER_B = 'b2000000-0000-4000-8000-000000000001';
const APP = 'https://kasir.example.com';
const NEW_PASSWORD = 'rahasia-baru-1';

type FakeUser = { password: string; banned: boolean };

function fakeAdmin() {
  const users = new Map<string, FakeUser>();
  const profiles = new Map<string, ProfileRecord>();
  const calls: string[] = [];
  const fail = { insertProfile: false, ban: false, unban: false, profileUpdate: false, deleteUser: false, revoke: false };
  const revoked: string[] = [];
  let nextId = 1;

  const addAccount = (id: string, storeId: string, role: string, isActive = true) => {
    users.set(id, { password: 'password123', banned: false });
    profiles.set(id, { id, storeId, name: id, role, isActive });
  };
  addAccount(OWNER_A, STORE_A, 'owner');
  addAccount(CASHIER_A, STORE_A, 'cashier');
  addAccount(OWNER_B, STORE_B, 'owner');
  addAccount(CASHIER_B, STORE_B, 'cashier');

  const emails = new Set<string>();

  const admin: AdminApi = {
    async verifyToken(token) {
      calls.push('verifyToken');
      return token.startsWith('token-') && users.has(token.slice(6)) ? token.slice(6) : null;
    },
    async getProfile(userId) {
      calls.push(`getProfile:${userId}`);
      return profiles.get(userId) ?? null;
    },
    async createUser(email, password) {
      calls.push('createUser');
      if (emails.has(email)) return { ok: false, reason: 'email_taken' };
      emails.add(email);
      const id = `c0000000-0000-4000-8000-${String(nextId++).padStart(12, '0')}`;
      users.set(id, { password, banned: false });
      return { ok: true, userId: id };
    },
    async deleteUser(userId) {
      calls.push(`deleteUser:${userId}`);
      if (fail.deleteUser) return false;
      return users.delete(userId);
    },
    async insertCashierProfile({ id, storeId, name }) {
      calls.push('insertCashierProfile');
      if (fail.insertProfile) return false;
      profiles.set(id, { id, storeId, name, role: 'cashier', isActive: true });
      return true;
    },
    async setProfileActive(userId, isActive) {
      calls.push(`setProfileActive:${isActive}`);
      const profile = profiles.get(userId);
      if (fail.profileUpdate || !profile) return false;
      profile.isActive = isActive;
      return true;
    },
    async setBanned(userId, banned) {
      calls.push(`setBanned:${banned}`);
      if ((banned && fail.ban) || (!banned && fail.unban)) return false;
      const user = users.get(userId);
      if (!user) return false;
      user.banned = banned;
      return true;
    },
    async setPassword(userId, password) {
      calls.push('setPassword');
      const user = users.get(userId);
      if (!user) return false;
      user.password = password;
      return true;
    },
    async revokeSessions(userId) {
      calls.push(`revokeSessions:${userId}`);
      if (fail.revoke) return false;
      revoked.push(userId);
      return true;
    },
  };

  return { admin, users, profiles, calls, fail, revoked };
}

let fake: ReturnType<typeof fakeAdmin>;
const allowedOrigins = parseAllowedOrigins(APP);

beforeEach(() => {
  fake = fakeAdmin();
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

function call(body: unknown, init: { as?: string | null; origin?: string | null; method?: string } = {}) {
  const headers = new Headers({ 'Content-Type': 'application/json' });
  const as = init.as === undefined ? OWNER_A : init.as;
  if (as) headers.set('Authorization', `Bearer token-${as}`);
  if (init.origin !== null) headers.set('Origin', init.origin ?? APP);
  const method = init.method ?? 'POST';
  const request = new Request('http://localhost/functions/v1/admin-cashier', {
    method,
    headers,
    body: method === 'POST' ? (typeof body === 'string' ? body : JSON.stringify(body)) : undefined,
  });
  return handleRequest(request, { admin: fake.admin, allowedOrigins });
}

const create = (extra: Record<string, unknown> = {}) => ({
  action: 'create',
  name: 'Fajar',
  email: 'Fajar@Warung.test',
  password: 'password-fajar',
  ...extra,
});

const mutatingCalls = () => fake.calls.filter((c) => !c.startsWith('verifyToken') && !c.startsWith('getProfile'));

describe('parseCommand', () => {
  it('normalizes a create command', () => {
    expect(parseCommand(create({ name: '  Fajar  ' }))).toEqual({
      ok: true,
      command: { action: 'create', name: 'Fajar', email: 'fajar@warung.test', password: 'password-fajar' },
    });
  });

  it.each([
    [{ ...create(), name: '   ' }, 'name'],
    [{ ...create(), email: 'bukan-email' }, 'email'],
    [{ ...create(), password: 'pendek' }, 'password'],
    [{ ...create(), password: '        ' }, 'password'],
    [{ ...create(), password: 'x'.repeat(73) }, 'password'],
    [{ action: 'set_active', cashier_id: 'not-a-uuid', is_active: false }, 'cashier_id'],
    [{ action: 'set_active', cashier_id: CASHIER_A, is_active: 'false' }, 'is_active'],
    [{ action: 'reset_password', cashier_id: CASHIER_A }, 'password'],
    [{ action: 'set_role', cashier_id: CASHIER_A, role: 'owner' }, 'action'],
    [[], 'body'],
  ])('rejects %j (field %s)', (body, field) => {
    expect(parseCommand(body)).toEqual({ ok: false, field });
  });

  it('counts the password limit in bytes (bcrypt), not characters', () => {
    expect(parseCommand({ ...create(), password: 'é'.repeat(36) }).ok).toBe(true);
    expect(parseCommand({ ...create(), password: 'é'.repeat(37) }).ok).toBe(false);
  });
});

describe('CORS and method', () => {
  it('answers a preflight from the app origin with its own origin, never "*"', async () => {
    const response = await call(undefined, { method: 'OPTIONS', as: null });
    expect(response.status).toBe(204);
    expect(response.headers.get('Access-Control-Allow-Origin')).toBe(APP);
    expect(fake.calls).toEqual([]);
  });

  it('rejects another origin before authenticating, with no CORS grant', async () => {
    const response = await call(create(), { origin: 'https://evil.example' });
    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ error: 'origin_not_allowed' });
    expect(response.headers.get('Access-Control-Allow-Origin')).toBeNull();
    expect(fake.calls).toEqual([]);
  });

  it('rejects methods other than POST', async () => {
    expect((await call(undefined, { method: 'GET' })).status).toBe(405);
  });
});

describe('authentication and authorization', () => {
  it('rejects a request without a token, before reading anything', async () => {
    const response = await call(create(), { as: null });
    expect(response.status).toBe(401);
    expect(fake.calls).toEqual([]);
  });

  it('rejects a token Auth does not accept', async () => {
    const response = await call(create(), { as: 'someone-unknown' });
    expect(response.status).toBe(401);
    expect(mutatingCalls()).toEqual([]);
  });

  it.each([
    ['create', create({ email: 'x@warung.test' })],
    ['set_active', { action: 'set_active', cashier_id: CASHIER_A, is_active: false }],
    ['reset_password', { action: 'reset_password', cashier_id: CASHIER_A, password: NEW_PASSWORD }],
  ])('gives a cashier 403 for %s and changes nothing', async (_action, body) => {
    const response = await call(body, { as: CASHIER_A });
    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ error: 'forbidden' });
    expect(mutatingCalls()).toEqual([]);
  });

  it('rejects an inactive owner', async () => {
    fake.profiles.get(OWNER_A)!.isActive = false;
    const response = await call(create());
    expect(response.status).toBe(403);
    expect(mutatingCalls()).toEqual([]);
  });

  it('rejects a signed-in user without a profile', async () => {
    fake.profiles.delete(OWNER_A);
    expect((await call(create())).status).toBe(403);
    expect(mutatingCalls()).toEqual([]);
  });

  it('authorizes before parsing: an unauthorized caller with a broken body still gets 401/403', async () => {
    expect((await call('{not json', { as: null })).status).toBe(401);
    expect((await call('{not json', { as: CASHIER_A })).status).toBe(403);
    expect((await call('{not json')).status).toBe(400);
  });
});

describe('create', () => {
  it('creates an active cashier in the caller’s store and returns no password', async () => {
    const response = await call(create());
    expect(response.status).toBe(201);
    const body = await response.json();
    expect(body).toEqual({
      cashier: { id: expect.any(String), name: 'Fajar', email: 'fajar@warung.test', is_active: true },
    });
    expect(JSON.stringify(body)).not.toContain('password-fajar');
    expect(fake.profiles.get(body.cashier.id)).toMatchObject({ storeId: STORE_A, role: 'cashier', isActive: true });
  });

  it('ignores role and store_id in the body', async () => {
    const response = await call(create({ role: 'owner', store_id: STORE_B, is_owner: true, is_active: false }));
    const { cashier } = await response.json();
    expect(fake.profiles.get(cashier.id)).toMatchObject({ storeId: STORE_A, role: 'cashier', isActive: true });
  });

  it('reports a taken email as 409', async () => {
    await call(create());
    const response = await call(create({ name: 'Lain' }));
    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({ error: 'email_taken' });
  });

  it('returns 400 with the failing field', async () => {
    const response = await call(create({ password: 'pendek' }));
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: 'invalid_request', field: 'password' });
    expect(mutatingCalls()).toEqual([]);
  });

  it('H13: deletes the new Auth user again when the profile cannot be created', async () => {
    fake.fail.insertProfile = true;
    const before = fake.users.size;
    const response = await call(create());
    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: 'server_error' });
    expect(mutatingCalls()).toEqual(['createUser', 'insertCashierProfile', expect.stringMatching(/^deleteUser:/)]);
    expect(fake.users.size).toBe(before);
  });

  it('H13: still answers with a safe error when the compensation fails too', async () => {
    fake.fail.insertProfile = true;
    fake.fail.deleteUser = true;
    const response = await call(create());
    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: 'server_error' });
  });
});

describe('set_active', () => {
  it('deactivates: profile inactive and Auth user banned', async () => {
    const response = await call({ action: 'set_active', cashier_id: CASHIER_A, is_active: false });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ cashier: { id: CASHIER_A, is_active: false } });
    expect(fake.profiles.get(CASHIER_A)!.isActive).toBe(false);
    expect(fake.users.get(CASHIER_A)!.banned).toBe(true);
    expect(mutatingCalls()).toEqual(['setProfileActive:false', 'setBanned:true', `revokeSessions:${CASHIER_A}`]);
  });

  it('ends the existing sessions, so they cannot return after reactivation (INFO-3)', async () => {
    await call({ action: 'set_active', cashier_id: CASHIER_A, is_active: false });
    await call({ action: 'set_active', cashier_id: CASHIER_A, is_active: true });
    expect(fake.revoked).toEqual([CASHIER_A]); // reactivation does not need to (and cannot) revive anything
  });

  it('fails closed when the sessions cannot be ended: profile inactive and banned, 500 for a retry', async () => {
    fake.fail.revoke = true;
    const response = await call({ action: 'set_active', cashier_id: CASHIER_A, is_active: false });
    expect(response.status).toBe(500);
    expect(fake.profiles.get(CASHIER_A)!.isActive).toBe(false);
    expect(fake.users.get(CASHIER_A)!.banned).toBe(true);
  });

  it('reactivates: ban lifted and profile active', async () => {
    await call({ action: 'set_active', cashier_id: CASHIER_A, is_active: false });
    const response = await call({ action: 'set_active', cashier_id: CASHIER_A, is_active: true });
    expect(response.status).toBe(200);
    expect(fake.profiles.get(CASHIER_A)!.isActive).toBe(true);
    expect(fake.users.get(CASHIER_A)!.banned).toBe(false);
  });

  it('keeps the profile inactive (fail closed) when the ban fails', async () => {
    fake.fail.ban = true;
    const response = await call({ action: 'set_active', cashier_id: CASHIER_A, is_active: false });
    expect(response.status).toBe(500);
    expect(fake.profiles.get(CASHIER_A)!.isActive).toBe(false);
  });

  it('restores the ban when reactivating the profile fails', async () => {
    await call({ action: 'set_active', cashier_id: CASHIER_A, is_active: false });
    fake.fail.profileUpdate = true;
    const response = await call({ action: 'set_active', cashier_id: CASHIER_A, is_active: true });
    expect(response.status).toBe(500);
    expect(fake.users.get(CASHIER_A)!.banned).toBe(true);
    expect(fake.profiles.get(CASHIER_A)!.isActive).toBe(false);
  });

  it('never lets the owner deactivate themselves', async () => {
    const response = await call({ action: 'set_active', cashier_id: OWNER_A, is_active: false });
    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ error: 'self_change' });
    expect(fake.profiles.get(OWNER_A)!.isActive).toBe(true);
    expect(mutatingCalls()).toEqual([]);
  });

  it('cannot reach another store’s cashier or owner (404, nothing changed)', async () => {
    for (const target of [CASHIER_B, OWNER_B]) {
      const response = await call({ action: 'set_active', cashier_id: target, is_active: false });
      expect(response.status).toBe(404);
      expect(fake.profiles.get(target)!.isActive).toBe(true);
    }
    expect(mutatingCalls()).toEqual([]);
  });
});

describe('reset_password', () => {
  it('sets the new password and does not echo it', async () => {
    const response = await call({ action: 'reset_password', cashier_id: CASHIER_A, password: NEW_PASSWORD });
    expect(response.status).toBe(200);
    expect(await response.text()).not.toContain(NEW_PASSWORD);
    expect(fake.users.get(CASHIER_A)!.password).toBe(NEW_PASSWORD);
    expect(fake.revoked).toEqual([CASHIER_A]); // sessions opened with the old password end (INFO-3)
  });

  it('cannot reset the owner’s own password or another store’s cashier', async () => {
    expect((await call({ action: 'reset_password', cashier_id: OWNER_A, password: NEW_PASSWORD })).status).toBe(403);
    expect((await call({ action: 'reset_password', cashier_id: CASHIER_B, password: NEW_PASSWORD })).status).toBe(404);
    expect(fake.users.get(CASHIER_B)!.password).toBe('password123');
    expect(mutatingCalls()).toEqual([]);
  });

  it('never logs the password, even when something throws', async () => {
    fake.admin.setPassword = async () => {
      throw new Error('network down');
    };
    const errors = vi.mocked(console.error);
    const response = await call({ action: 'reset_password', cashier_id: CASHIER_A, password: NEW_PASSWORD });
    expect(response.status).toBe(500);
    expect(JSON.stringify(errors.mock.calls)).not.toContain(NEW_PASSWORD);
  });
});

describe('request body limit (INFO-4)', () => {
  const streamOf = (...parts: string[]) =>
    new ReadableStream<Uint8Array>({
      start(controller) {
        for (const part of parts) controller.enqueue(new TextEncoder().encode(part));
        controller.close();
      },
    });
  const request = (body: BodyInit, headers: Record<string, string> = {}) =>
    new Request('http://localhost/', { method: 'POST', body, headers, duplex: 'half' } as RequestInit);

  it('reads a body up to the limit, multi-byte characters counted as bytes', async () => {
    expect(await readBodyLimited(request('x'.repeat(10)), 10)).toBe('x'.repeat(10));
    expect(await readBodyLimited(request('é'.repeat(5)), 10)).toBe('é'.repeat(5));
    expect(await readBodyLimited(request('é'.repeat(6)), 10)).toBeNull();
  });

  it('refuses a declared Content-Length over the limit without reading the body', async () => {
    let pulled = false;
    // highWaterMark 0: the stream is pulled only when someone reads it.
    const body = new ReadableStream<Uint8Array>(
      {
        pull() {
          pulled = true;
        },
      },
      { highWaterMark: 0 },
    );
    expect(await readBodyLimited(request(body, { 'Content-Length': '999999' }), 4096)).toBeNull();
    expect(pulled).toBe(false);
  });

  it('stops reading a body without Content-Length as soon as it passes the limit', async () => {
    expect(await readBodyLimited(request(streamOf('a'.repeat(3000), 'b'.repeat(3000), 'c'.repeat(3000))), 4096)).toBeNull();
    expect(await readBodyLimited(request(streamOf('a'.repeat(2000), 'b'.repeat(2000))), 4096)).toBe('a'.repeat(2000) + 'b'.repeat(2000));
  });

  it('answers an oversized request with invalid_request (body) and changes nothing', async () => {
    const response = await call({ action: 'create', name: 'x'.repeat(5000), email: 'a@b.test', password: 'kasir-baru-123' });
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: 'invalid_request', field: 'body' });
    expect(mutatingCalls()).toEqual([]);
  });
});
