/**
 * admin-cashier: the only path for the privileged cashier account operations (PRD §25,
 * SECURITY E.10–E.11, TECHNICAL_SPEC C.5): create, activate/deactivate (with Auth ban), and
 * password reset.
 *
 * This module holds the request logic and has no Deno globals or network code: `index.ts` wires
 * it to the Supabase admin API, and Vitest drives it with an in-memory AdminApi.
 *
 * Every request is authenticated and authorized before its body is even read: the caller's
 * identity comes from the verified access token, and their role and store from their own
 * profile row. Nothing in the body (store_id, role, is_owner, …) is ever trusted for authority.
 */
import { readBodyLimited } from '../_shared/body.ts';
import { corsHeaders, isOriginAllowed } from '../_shared/cors.ts';

export { readBodyLimited };

export type ProfileRecord = {
  id: string;
  storeId: string;
  name: string;
  role: string;
  isActive: boolean;
};

export type CreateUserResult =
  | { ok: true; userId: string }
  | { ok: false; reason: 'email_taken' | 'weak_password' | 'failed' };

/**
 * The privileged operations the handler needs. Implementations return false (or a failed result)
 * when the operation was refused or failed, and throw only when the backend could not be reached.
 */
export interface AdminApi {
  /** The id of the user an access token belongs to, or null when Auth rejects the token. */
  verifyToken(token: string): Promise<string | null>;
  getProfile(userId: string): Promise<ProfileRecord | null>;
  createUser(email: string, password: string): Promise<CreateUserResult>;
  deleteUser(userId: string): Promise<boolean>;
  /** Inserts a profile with role 'cashier' and is_active true; returns false when the insert fails. */
  insertCashierProfile(profile: { id: string; storeId: string; name: string }): Promise<boolean>;
  setProfileActive(userId: string, isActive: boolean): Promise<boolean>;
  /** Bans (true) or unbans (false) the Auth user, so a deactivated cashier cannot refresh a session. */
  setBanned(userId: string, banned: boolean): Promise<boolean>;
  setPassword(userId: string, password: string): Promise<boolean>;
  /**
   * Ends every session of the user (their refresh tokens go too). The database also requires a
   * live session for every request (INFO-3), so an old access token stops working at once.
   */
  revokeSessions(userId: string): Promise<boolean>;
}

export type HandlerDeps = { admin: AdminApi; allowedOrigins: ReadonlySet<string> };

/** Machine-readable error codes. The app maps them to Indonesian messages. */
export type ErrorCode =
  | 'origin_not_allowed'
  | 'method_not_allowed'
  | 'unauthorized'
  | 'forbidden'
  | 'invalid_request'
  | 'email_taken'
  | 'weak_password'
  | 'self_change'
  | 'not_found'
  | 'server_error';

/** Same rule as Supabase Auth (config.toml minimum_password_length); 72 bytes is the bcrypt limit. */
export const PASSWORD_MIN_LENGTH = 8;
export const PASSWORD_MAX_BYTES = 72;

const MAX_BODY_BYTES = 4096;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export type Command =
  | { action: 'create'; name: string; email: string; password: string }
  | { action: 'set_active'; cashierId: string; isActive: boolean }
  | { action: 'reset_password'; cashierId: string; password: string };

export type ParseResult = { ok: true; command: Command } | { ok: false; field: string };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function isValidPassword(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value.length >= PASSWORD_MIN_LENGTH &&
    new TextEncoder().encode(value).length <= PASSWORD_MAX_BYTES &&
    value.trim() !== ''
  );
}

/**
 * Validates the body against the three actions. Only the listed fields are read; anything else
 * in the body (role, store_id, is_owner, …) is ignored, never used.
 */
export function parseCommand(body: unknown): ParseResult {
  if (!isRecord(body)) return { ok: false, field: 'body' };

  switch (body.action) {
    case 'create': {
      const name = typeof body.name === 'string' ? body.name.trim() : '';
      if (name === '') return { ok: false, field: 'name' };
      const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
      if (!EMAIL.test(email)) return { ok: false, field: 'email' };
      if (!isValidPassword(body.password)) return { ok: false, field: 'password' };
      return { ok: true, command: { action: 'create', name, email, password: body.password } };
    }
    case 'set_active': {
      if (typeof body.cashier_id !== 'string' || !UUID.test(body.cashier_id)) return { ok: false, field: 'cashier_id' };
      if (typeof body.is_active !== 'boolean') return { ok: false, field: 'is_active' };
      return { ok: true, command: { action: 'set_active', cashierId: body.cashier_id.toLowerCase(), isActive: body.is_active } };
    }
    case 'reset_password': {
      if (typeof body.cashier_id !== 'string' || !UUID.test(body.cashier_id)) return { ok: false, field: 'cashier_id' };
      if (!isValidPassword(body.password)) return { ok: false, field: 'password' };
      return { ok: true, command: { action: 'reset_password', cashierId: body.cashier_id.toLowerCase(), password: body.password } };
    }
    default:
      return { ok: false, field: 'action' };
  }
}

function bearerToken(header: string | null): string | null {
  const match = /^Bearer\s+(\S+)$/i.exec(header ?? '');
  return match?.[1] ?? null;
}

const STATUS: Record<ErrorCode, number> = {
  origin_not_allowed: 403,
  method_not_allowed: 405,
  unauthorized: 401,
  forbidden: 403,
  invalid_request: 400,
  email_taken: 409,
  weak_password: 400,
  self_change: 403,
  not_found: 404,
  server_error: 500,
};

export async function handleRequest(request: Request, deps: HandlerDeps): Promise<Response> {
  const origin = request.headers.get('Origin');
  const cors = corsHeaders(origin, deps.allowedOrigins);

  const json = (status: number, body: unknown) =>
    new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });
  const fail = (error: ErrorCode, extra: Record<string, unknown> = {}) => json(STATUS[error], { error, ...extra });

  if (!isOriginAllowed(origin, deps.allowedOrigins)) return fail('origin_not_allowed');
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
  if (request.method !== 'POST') return fail('method_not_allowed');

  try {
    // 1–2. Verified identity from the access token.
    const token = bearerToken(request.headers.get('Authorization'));
    if (!token) return fail('unauthorized');
    const callerId = await deps.admin.verifyToken(token);
    if (!callerId) return fail('unauthorized');

    // 3–5. Role and store from the caller's own active profile: only an active owner passes.
    const caller = await deps.admin.getProfile(callerId);
    if (!caller || !caller.isActive || caller.role !== 'owner') return fail('forbidden');

    // Only now is the body read.
    const text = await readBodyLimited(request, MAX_BODY_BYTES);
    if (text === null) return fail('invalid_request', { field: 'body' });
    let body: unknown;
    try {
      body = JSON.parse(text);
    } catch {
      return fail('invalid_request', { field: 'body' });
    }
    const parsed = parseCommand(body);
    if (!parsed.ok) return fail('invalid_request', { field: parsed.field });
    const command = parsed.command;

    if (command.action === 'create') return await createCashier(deps.admin, caller, command, json, fail);

    // set_active / reset_password act on an existing cashier of the caller's own store.
    // The owner is never a valid target: they cannot deactivate (or reset) themselves here.
    if (command.cashierId === caller.id) return fail('self_change');
    const target = await deps.admin.getProfile(command.cashierId);
    // Another store's account, an unknown id, and a non-cashier look the same to the caller.
    if (!target || target.storeId !== caller.storeId || target.role !== 'cashier') return fail('not_found');

    if (command.action === 'set_active') return await setActive(deps.admin, target, command.isActive, json, fail);

    if (!(await deps.admin.setPassword(target.id, command.password))) return fail('server_error');
    // Sessions opened with the old password end (GoTrue does it too; this does not rely on it).
    if (!(await deps.admin.revokeSessions(target.id))) return fail('server_error');
    return json(200, { cashier: { id: target.id } });
  } catch (error) {
    // Only the message: never the request body (passwords) or headers (tokens).
    console.error('admin-cashier: unexpected failure:', error instanceof Error ? error.message : 'unknown error');
    return fail('server_error');
  }
}

type Json = (status: number, body: unknown) => Response;
type Fail = (error: ErrorCode, extra?: Record<string, unknown>) => Response;

/**
 * Creates the Auth user, then the cashier profile in the caller's store. When the profile cannot
 * be created the new Auth user is deleted again, so no orphan account is left that could sign in
 * (SECURITY E.11).
 */
async function createCashier(
  admin: AdminApi,
  caller: ProfileRecord,
  command: Extract<Command, { action: 'create' }>,
  json: Json,
  fail: Fail,
): Promise<Response> {
  const created = await admin.createUser(command.email, command.password);
  if (!created.ok) return fail(created.reason === 'failed' ? 'server_error' : created.reason);

  let inserted = false;
  try {
    inserted = await admin.insertCashierProfile({ id: created.userId, storeId: caller.storeId, name: command.name });
  } catch (error) {
    console.error('admin-cashier: profile insert threw:', error instanceof Error ? error.message : 'unknown error');
  }

  if (!inserted) {
    let removed = false;
    try {
      removed = await admin.deleteUser(created.userId);
    } catch (error) {
      console.error('admin-cashier: compensation threw:', error instanceof Error ? error.message : 'unknown error');
    }
    if (!removed) console.error(`admin-cashier: could not remove orphan Auth user ${created.userId}; remove it from the dashboard.`);
    return fail('server_error');
  }

  return json(201, { cashier: { id: created.userId, name: command.name, email: command.email, is_active: true } });
}

/**
 * Deactivate: profile first (RLS denies everything at once), then the Auth ban (no new sessions),
 * then the existing sessions end, so they cannot come back after a later reactivation (INFO-3).
 * If a later step fails the profile stays inactive (fail closed) and a retry finishes the job.
 *
 * Activate: unban first, then the profile. If the profile update fails the ban is restored, so
 * the account is never left half active.
 */
async function setActive(admin: AdminApi, target: ProfileRecord, isActive: boolean, json: Json, fail: Fail): Promise<Response> {
  if (!isActive) {
    if (!(await admin.setProfileActive(target.id, false))) return fail('server_error');
    if (!(await admin.setBanned(target.id, true))) return fail('server_error');
    if (!(await admin.revokeSessions(target.id))) return fail('server_error');
  } else {
    if (!(await admin.setBanned(target.id, false))) return fail('server_error');
    if (!(await admin.setProfileActive(target.id, true))) {
      if (!(await admin.setBanned(target.id, true))) {
        console.error(`admin-cashier: could not restore the ban of ${target.id} after a failed activation.`);
      }
      return fail('server_error');
    }
  }
  return json(200, { cashier: { id: target.id, is_active: isActive } });
}
