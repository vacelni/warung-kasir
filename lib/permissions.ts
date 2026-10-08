/**
 * Role-based route access for the UI (PRD §8, SECURITY E.3, UI_SPEC A.7).
 *
 * This is UX only: it decides what to show. Authorization is enforced by RLS,
 * grants, the create_transaction RPC, and the admin-cashier Edge Function.
 */
export const ROLES = ['owner', 'cashier'] as const;

export type Role = (typeof ROLES)[number];

export const ROLE_LABELS: Record<Role, string> = { owner: 'Owner', cashier: 'Cashier' };

export function isRole(value: unknown): value is Role {
  return typeof value === 'string' && (ROLES as readonly string[]).includes(value);
}

/** Routes (and their sub-routes) a cashier may open. Every other app route is owner-only. */
const CASHIER_ROUTES = ['/kasir', '/riwayat', '/lainnya', '/tentang'] as const;

export function canAccessRoute(role: Role, pathname: string): boolean {
  if (role === 'owner') return true;
  return CASHIER_ROUTES.some((route) => pathname === route || pathname.startsWith(`${route}/`));
}
