import type { TransactionSnapshot } from '@/lib/checkout';

/** Nasi Goreng ×2 + Es Teh ×2 = Rp40.000, paid Rp50.000, sold by cashier-1 at 10:32 WIB on 7 Oct 2026. */
export function testSnapshot(overrides: Partial<TransactionSnapshot> = {}): TransactionSnapshot {
  return {
    id: '3f9a2c4e-7b1d-4c2a-9e10-000000000001',
    code: 'TRX-20261007-3F9A2C',
    store_id: 'store-a',
    cashier_id: 'cashier-1',
    created_at: '2026-10-07T03:32:00.000Z',
    items: [
      { product_id: 'nasi', product_name: 'Nasi Goreng', unit_price: 15000, quantity: 2, subtotal: 30000 },
      { product_id: 'teh', product_name: 'Es Teh', unit_price: 5000, quantity: 2, subtotal: 10000 },
    ],
    total: 40000,
    paid_amount: 50000,
    change_amount: 10000,
    ...overrides,
  };
}
