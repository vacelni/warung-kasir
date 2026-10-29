/**
 * Public demo build only (docs/DEMO.md). NEXT_PUBLIC_DEMO_MODE is inlined at build time, so the
 * production build never shows these buttons. The accounts exist only in the demo Supabase project
 * (supabase/demo/demo.sql), which resets every hour; the passwords are not secrets.
 */
export const DEMO_MODE = process.env.NEXT_PUBLIC_DEMO_MODE === '1';

export const DEMO_ACCOUNTS = [
  { label: 'Coba sebagai Pemilik', email: 'owner@demo.warungkasir.test', password: 'demo12345' },
  { label: 'Coba sebagai Kasir', email: 'kasir@demo.warungkasir.test', password: 'demo12345' },
] as const;
