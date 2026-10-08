import { CartProvider } from '@/features/pos/CartProvider';
import { CatalogProvider } from '@/features/pos/CatalogProvider';

// The cart and menu live above the kasir routes, so the order survives moving between
// the menu and /kasir/pesanan (TECHNICAL_SPEC C.14).
export default function KasirLayout({ children }: { children: React.ReactNode }) {
  return (
    <CatalogProvider>
      <CartProvider>{children}</CartProvider>
    </CatalogProvider>
  );
}
