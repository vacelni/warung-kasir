import type { CsvCell } from '@/lib/csv';
import { getSupabase } from '@/lib/supabase';
import { formatJakartaDate, formatJakartaTime, formatJakartaTimestamp, jakartaDateKey } from '@/lib/time';
import { saleTimeFlag } from '@/lib/saleTimeFlag';
import { parseOptionSnapshots } from '@/features/transactions/api';
import type { OptionSnapshot } from '@/lib/checkout';

/**
 * The CSV exports of Backup / Export (PRD §27, decision C26/C27, TEST_PLAN G.18): store,
 * categories, products, the option groups and choices of the menu (DATABASE D.12), which groups
 * each product shows, transactions, transaction items, and employee profiles.
 *
 * What a user can export is exactly what they can read: RLS is the server-side guarantee
 * (SECURITY E.6). Every query also filters on the signed-in store explicitly. Columns are fixed
 * and listed here; the profile export has no email, password, or token (none of those live in
 * public.profiles, and auth.users is not readable by clients).
 *
 * Timestamps are written in Asia/Jakarta (ISO 8601 with +07:00); money is integer Rupiah.
 */

export type DatasetKey =
  | 'store'
  | 'categories'
  | 'products'
  | 'option_choices'
  | 'product_options'
  | 'transactions'
  | 'transaction_items'
  | 'profiles';

export type ExportTable = { columns: readonly string[]; rows: CsvCell[][] };

export type Dataset = {
  key: DatasetKey;
  /** Button label, as in PRD §27. */
  label: string;
  description: string;
  /** File name part: warungkasir-<slug>-<YYYYMMDD>.csv */
  slug: string;
  load: (storeId: string) => Promise<ExportTable>;
};

type PageResult<T> = { data: T[] | null; error: { message: string } | null };

/**
 * Reads every row in pages. The Data API caps a response at `max_rows` (1000 locally), so a single
 * request would silently cut a long history short. Paging stops only on an empty page, which holds
 * whatever the server's cap is. Each query orders on a unique key, so pages never overlap.
 */
export async function readAllRows<T>(label: string, page: (from: number, to: number) => PromiseLike<PageResult<T>>): Promise<T[]> {
  const PAGE_SIZE = 1000;
  const rows: T[] = [];
  for (;;) {
    const { data, error } = await page(rows.length, rows.length + PAGE_SIZE - 1);
    if (error) throw new Error(`Could not read ${label}: ${error.message}`);
    if (!data || data.length === 0) return rows;
    rows.push(...data);
  }
}

const timestamp = (value: string | null): string | null => (value === null ? null : formatJakartaTimestamp(new Date(value)));

async function loadStore(storeId: string): Promise<ExportTable> {
  const rows = await readAllRows('the store', (from, to) =>
    getSupabase()
      .from('stores')
      .select('id, name, address, phone, receipt_note, created_at, updated_at')
      .eq('id', storeId)
      .order('id')
      .range(from, to),
  );
  return {
    columns: ['id', 'name', 'address', 'phone', 'receipt_note', 'created_at', 'updated_at'],
    rows: rows.map((r) => [r.id, r.name, r.address, r.phone, r.receipt_note, timestamp(r.created_at), timestamp(r.updated_at)]),
  };
}

async function loadCategories(storeId: string): Promise<ExportTable> {
  const rows = await readAllRows('categories', (from, to) =>
    getSupabase()
      .from('categories')
      .select('id, store_id, name, created_at, updated_at')
      .eq('store_id', storeId)
      .order('name')
      .order('id')
      .range(from, to),
  );
  return {
    columns: ['id', 'store_id', 'name', 'created_at', 'updated_at'],
    rows: rows.map((r) => [r.id, r.store_id, r.name, timestamp(r.created_at), timestamp(r.updated_at)]),
  };
}

async function loadProducts(storeId: string): Promise<ExportTable> {
  const rows = await readAllRows('products', (from, to) =>
    getSupabase()
      .from('products')
      .select('id, store_id, category_id, name, price, is_active, created_at, updated_at, category:categories!products_category_id_fkey(name)')
      .eq('store_id', storeId)
      .order('name')
      .order('id')
      .range(from, to),
  );
  return {
    columns: ['id', 'store_id', 'category_id', 'category_name', 'name', 'price', 'is_active', 'created_at', 'updated_at'],
    rows: rows.map((r) => [
      r.id,
      r.store_id,
      r.category_id,
      r.category?.name ?? null,
      r.name,
      r.price,
      r.is_active,
      timestamp(r.created_at),
      timestamp(r.updated_at),
    ]),
  };
}

async function loadTransactions(storeId: string): Promise<ExportTable> {
  const rows = await readAllRows('transactions', (from, to) =>
    getSupabase()
      .from('transactions')
      .select(
        'id, store_id, code, cashier_id, status, total, paid_amount, change_amount, created_at, synced_at, cashier:profiles!transactions_cashier_id_fkey(name)',
      )
      .eq('store_id', storeId)
      .order('created_at')
      .order('id')
      .range(from, to),
  );
  return {
    columns: [
      'id',
      'code',
      'store_id',
      'cashier_id',
      'cashier_name',
      'status',
      'total',
      'paid_amount',
      'change_amount',
      'created_at',
      'tanggal_wib',
      'waktu_wib',
      'synced_at',
      // SEC-06: '' (plausible), 'future' (sold > 5 min after the server received it), 'late' (> 24 h).
      'time_flag',
    ],
    rows: rows.map((r) => {
      const soldAt = new Date(r.created_at);
      return [
        r.id,
        r.code,
        r.store_id,
        r.cashier_id,
        r.cashier?.name ?? null,
        r.status,
        r.total,
        r.paid_amount,
        r.change_amount,
        formatJakartaTimestamp(soldAt),
        formatJakartaDate(soldAt),
        formatJakartaTime(soldAt),
        timestamp(r.synced_at),
        saleTimeFlag(r.created_at, r.synced_at) ?? '',
      ];
    }),
  };
}

/** "Level: Level 3; Nasi: Pakai nasi (+4000)": the options of a sold line as one readable cell. */
export function describeOptions(options: readonly OptionSnapshot[]): string {
  return options.map((option) => `${option.group}: ${option.name}${option.price > 0 ? ` (+${option.price})` : ''}`).join('; ');
}

async function loadOptionChoices(storeId: string): Promise<ExportTable> {
  const rows = await readAllRows('option choices', (from, to) =>
    getSupabase()
      .from('option_choices')
      .select(
        'id, store_id, group_id, name, price_delta, is_default, is_active, position, created_at, updated_at, group:option_groups!option_choices_group_fkey(name, allow_multiple, required)',
      )
      .eq('store_id', storeId)
      .order('group_id')
      .order('position')
      .order('id')
      .range(from, to),
  );
  return {
    columns: [
      'id',
      'store_id',
      'group_id',
      'group_name',
      'group_allow_multiple',
      'group_required',
      'name',
      'price_delta',
      'is_default',
      'is_active',
      'position',
      'created_at',
      'updated_at',
    ],
    rows: rows.map((r) => [
      r.id,
      r.store_id,
      r.group_id,
      r.group?.name ?? null,
      r.group?.allow_multiple ?? null,
      r.group?.required ?? null,
      r.name,
      r.price_delta,
      r.is_default,
      r.is_active,
      r.position,
      timestamp(r.created_at),
      timestamp(r.updated_at),
    ]),
  };
}

async function loadProductOptions(storeId: string): Promise<ExportTable> {
  const rows = await readAllRows('product options', (from, to) =>
    getSupabase()
      .from('product_option_groups')
      .select(
        'product_id, group_id, store_id, position, product:products!product_option_groups_product_fkey(name), group:option_groups!product_option_groups_group_fkey(name)',
      )
      .eq('store_id', storeId)
      .order('product_id')
      .order('group_id')
      .range(from, to),
  );
  return {
    columns: ['product_id', 'product_name', 'group_id', 'group_name', 'store_id', 'position'],
    rows: rows.map((r) => [r.product_id, r.product?.name ?? null, r.group_id, r.group?.name ?? null, r.store_id, r.position]),
  };
}

async function loadTransactionItems(storeId: string): Promise<ExportTable> {
  const rows = await readAllRows('transaction items', (from, to) =>
    getSupabase()
      .from('transaction_items')
      .select('id, transaction_id, store_id, product_id, product_name, unit_price, quantity, subtotal, options, note')
      .eq('store_id', storeId)
      .order('transaction_id')
      .order('id')
      .range(from, to),
  );
  return {
    columns: ['id', 'transaction_id', 'store_id', 'product_id', 'product_name', 'options', 'note', 'unit_price', 'quantity', 'subtotal'],
    rows: rows.map((r) => [
      r.id,
      r.transaction_id,
      r.store_id,
      r.product_id,
      r.product_name,
      describeOptions(parseOptionSnapshots(r.options)),
      r.note,
      r.unit_price,
      r.quantity,
      r.subtotal,
    ]),
  };
}

/** Employee profiles: identity, role, and status only. Never an email, password, or token. */
async function loadProfiles(storeId: string): Promise<ExportTable> {
  const rows = await readAllRows('profiles', (from, to) =>
    getSupabase()
      .from('profiles')
      .select('id, store_id, name, role, is_active, created_at, updated_at')
      .eq('store_id', storeId)
      .order('name')
      .order('id')
      .range(from, to),
  );
  return {
    columns: ['id', 'store_id', 'name', 'role', 'is_active', 'created_at', 'updated_at'],
    rows: rows.map((r) => [r.id, r.store_id, r.name, r.role, r.is_active, timestamp(r.created_at), timestamp(r.updated_at)]),
  };
}

export const DATASETS: readonly Dataset[] = [
  { key: 'transactions', label: 'Export Transaksi', description: 'Semua transaksi: kode, kasir, total, dibayar, kembalian, waktu (WIB).', slug: 'transaksi', load: loadTransactions },
  { key: 'transaction_items', label: 'Export Item Transaksi', description: 'Rincian menu setiap transaksi dengan harga saat terjual.', slug: 'item-transaksi', load: loadTransactionItems },
  { key: 'products', label: 'Export Menu', description: 'Semua menu, aktif maupun nonaktif, dengan harga dan kategori.', slug: 'menu', load: loadProducts },
  { key: 'categories', label: 'Export Kategori', description: 'Daftar kategori menu.', slug: 'kategori', load: loadCategories },
  { key: 'option_choices', label: 'Export Pilihan Menu', description: 'Grup pilihan (level, bagian ayam, nasi, dst.) beserta pilihan dan tambahan harganya.', slug: 'pilihan-menu', load: loadOptionChoices },
  { key: 'product_options', label: 'Export Pilihan per Menu', description: 'Grup pilihan mana yang ditanyakan untuk setiap menu.', slug: 'pilihan-per-menu', load: loadProductOptions },
  { key: 'store', label: 'Export Profil Warung', description: 'Nama, alamat, telepon, dan catatan struk.', slug: 'warung', load: loadStore },
  { key: 'profiles', label: 'Export Karyawan', description: 'Nama, peran, dan status akun. Tanpa email atau password.', slug: 'karyawan', load: loadProfiles },
];

/** warungkasir-transaksi-20261008.csv, dated in Asia/Jakarta. */
export function exportFileName(dataset: Pick<Dataset, 'slug'>, now: Date): string {
  return `warungkasir-${dataset.slug}-${jakartaDateKey(now)}.csv`;
}
