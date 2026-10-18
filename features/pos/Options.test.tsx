// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Profile } from '@/features/auth/account';
import { ToastProvider } from '@/components/ui/Toast';
import { resetIndexedDb } from '@/lib/test-support/fakeIndexedDb';
import type { Catalog } from './api';
import { CartList } from './CartList';
import { CartProvider } from './CartProvider';
import { CatalogProvider } from './CatalogProvider';
import { ProductPicker } from './ProductPicker';

const mocks = vi.hoisted(() => ({ profile: null as Profile | null, fetchCatalog: vi.fn() }));

vi.mock('@/features/auth/AuthProvider', () => ({ useProfile: () => mocks.profile }));
vi.mock('./api', () => ({ fetchCatalog: mocks.fetchCatalog }));

const cashier: Profile = { id: 'c', storeId: 's', name: 'Andi', role: 'cashier' };

const choice = (id: string, name: string, priceDelta = 0, isDefault = false) => ({ id, name, priceDelta, isDefault });

/** Geprek Rp12.000: Nasi (optional, +4.000), Level (required, free), Bagian ayam (required, Dada +3.000, default Paha), Tambahan (many). */
const CATALOG: Catalog = {
  categories: [{ id: 'makanan', name: 'Makanan' }],
  products: [
    {
      id: 'geprek',
      name: 'Geprek',
      price: 12000,
      categoryId: 'makanan',
      optionGroups: [
        { id: 'g-nasi', name: 'Nasi', allowMultiple: false, required: false, choices: [choice('nasi', 'Pakai nasi', 4000)] },
        {
          id: 'g-level',
          name: 'Level',
          allowMultiple: false,
          required: true,
          choices: [choice('l1', 'Level 1'), choice('l3', 'Level 3'), choice('l5', 'Level 5')],
        },
        {
          id: 'g-bagian',
          name: 'Bagian ayam',
          allowMultiple: false,
          required: true,
          choices: [choice('dada', 'Dada', 3000), choice('paha', 'Paha', 1000, true)],
        },
        {
          id: 'g-extra',
          name: 'Tambahan',
          allowMultiple: true,
          required: false,
          choices: [choice('telur', 'Telur', 3000), choice('tempe', 'Tempe', 2000)],
        },
      ],
    },
    { id: 'teh', name: 'Es Teh', price: 5000, categoryId: 'makanan', optionGroups: [] },
    {
      id: 'bebek',
      name: 'Bebek',
      price: 25000,
      categoryId: 'makanan',
      optionGroups: [{ id: 'g-paha', name: 'Bagian bebek', allowMultiple: false, required: true, choices: [] }],
    },
  ],
  store: null,
};

beforeAll(() => {
  HTMLDialogElement.prototype.showModal = function showModal() {
    this.setAttribute('open', '');
  };
  HTMLDialogElement.prototype.close = function close() {
    this.removeAttribute('open');
  };
});

const fetchSpy = vi.fn();

beforeEach(async () => {
  await resetIndexedDb();
  mocks.profile = cashier;
  mocks.fetchCatalog.mockReset();
  mocks.fetchCatalog.mockResolvedValue(CATALOG);
  fetchSpy.mockReset();
  vi.stubGlobal('fetch', fetchSpy);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

async function renderLoaded() {
  render(
    <ToastProvider>
      <CatalogProvider>
        <CartProvider>
          <ProductPicker />
          <CartList />
        </CartProvider>
      </CatalogProvider>
    </ToastProvider>,
  );
  await screen.findByRole('button', { name: /^Geprek/ });
}

const card = (name: string) => screen.getByRole('button', { name: new RegExp('^' + name) });
const sheet = () => within(screen.getByRole('dialog'));
const addButton = () => sheet().getByRole('button', { name: /^TAMBAH/ }) as HTMLButtonElement;
const choose = (name: string) => fireEvent.click(sheet().getByRole('button', { name: new RegExp('^' + name) }));
const cartLines = () => screen.getAllByRole('listitem').filter((item) => item.querySelector('[aria-label^="Hapus"]'));

describe('products with options on the cashier screen', () => {
  it('opens the choice sheet instead of adding, while a plain product still joins the order at once', async () => {
    await renderLoaded();

    fireEvent.click(card('Es Teh'));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(cartLines()).toHaveLength(1);

    fireEvent.click(card('Geprek'));
    expect(screen.getByRole('dialog')).toBeTruthy();
    expect(cartLines()).toHaveLength(1);
  });

  it('marks a product that has choices on its card', async () => {
    await renderLoaded();
    expect(card('Geprek').textContent).toContain('Ada pilihan');
    expect(card('Es Teh').textContent).not.toContain('Ada pilihan');
  });

  it('keeps Tambah disabled until every required group has a choice, and says which ones', async () => {
    await renderLoaded();
    fireEvent.click(card('Geprek'));

    // Bagian ayam starts on its default (Paha); Level has none.
    expect(addButton().disabled).toBe(true);
    expect(sheet().getByText('Pilih dulu: Level')).toBeTruthy();

    choose('Level 3');
    expect(addButton().disabled).toBe(false);
    expect(sheet().queryByText(/Pilih dulu/)).toBeNull();
  });

  it('starts from the owner’s default and adds the price of each choice as they are tapped', async () => {
    await renderLoaded();
    fireEvent.click(card('Geprek'));
    choose('Level 3');

    // 12.000 + Paha 1.000
    expect(addButton().textContent).toContain('Rp13.000');
    choose('Dada');
    expect(addButton().textContent).toContain('Rp15.000');
    choose('Pakai nasi');
    expect(addButton().textContent).toContain('Rp19.000');
    choose('Telur');
    choose('Tempe');
    expect(addButton().textContent).toContain('Rp24.000');
    choose('Telur');
    expect(addButton().textContent).toContain('Rp21.000');
  });

  it('lets an optional pick-one group be cleared again ("tanpa nasi") but not a required one', async () => {
    await renderLoaded();
    fireEvent.click(card('Geprek'));
    choose('Level 3');
    choose('Pakai nasi');
    expect(sheet().getByRole('button', { name: /^Pakai nasi/ }).getAttribute('aria-pressed')).toBe('true');

    choose('Pakai nasi');
    expect(sheet().getByRole('button', { name: /^Pakai nasi/ }).getAttribute('aria-pressed')).toBe('false');

    choose('Level 3');
    expect(sheet().getByRole('button', { name: /^Level 3/ }).getAttribute('aria-pressed')).toBe('true');
  });

  it('puts the line in the order with its choices and price, and the card badge counts it', async () => {
    await renderLoaded();
    fireEvent.click(card('Geprek'));
    choose('Level 3');
    choose('Dada');
    choose('Pakai nasi');
    fireEvent.click(addButton());

    expect(screen.queryByRole('dialog')).toBeNull();
    const [line] = cartLines();
    expect(line?.textContent).toContain('Geprek');
    expect(line?.textContent).toContain('Pakai nasi · Level 3 · Dada');
    expect(line?.textContent).toContain('Rp19.000');
    expect(card('Geprek').textContent).toContain('1');
  });

  it('adds several units at once with the quantity stepper', async () => {
    await renderLoaded();
    fireEvent.click(card('Geprek'));
    choose('Level 5');
    fireEvent.click(sheet().getByRole('button', { name: 'Tambah Geprek' }));
    fireEvent.click(sheet().getByRole('button', { name: 'Tambah Geprek' }));
    // 12.000 + Paha 1.000 = 13.000 each, three of them.
    expect(addButton().textContent).toContain('Rp39.000');
    fireEvent.click(addButton());

    const [line] = cartLines();
    expect(line?.textContent).toContain('Rp39.000');
    expect(within(line!).getByLabelText('Jumlah 3')).toBeTruthy();
  });

  it('merges identical choices into one line and keeps different choices apart', async () => {
    await renderLoaded();

    for (const level of ['Level 3', 'Level 3', 'Level 5']) {
      fireEvent.click(card('Geprek'));
      choose(level);
      fireEvent.click(addButton());
    }

    const lines = cartLines();
    expect(lines).toHaveLength(2);
    expect(within(lines[0]!).getByLabelText('Jumlah 2')).toBeTruthy();
    expect(within(lines[1]!).getByLabelText('Jumlah 1')).toBeTruthy();
    expect(card('Geprek').textContent).toContain('3');
  });

  it('removes only the line it belongs to', async () => {
    await renderLoaded();
    for (const level of ['Level 3', 'Level 5']) {
      fireEvent.click(card('Geprek'));
      choose(level);
      fireEvent.click(addButton());
    }

    fireEvent.click(screen.getByRole('button', { name: 'Hapus Geprek, Level 5 · Paha' }));

    const lines = cartLines();
    expect(lines).toHaveLength(1);
    expect(lines[0]?.textContent).toContain('Level 3');
  });

  it('keeps the note on the line and treats a different note as a different line', async () => {
    await renderLoaded();
    for (const note of ['sambal dipisah', 'sambal dipisah', '']) {
      fireEvent.click(card('Geprek'));
      choose('Level 3');
      fireEvent.change(sheet().getByLabelText('Catatan (opsional)'), { target: { value: note } });
      fireEvent.click(addButton());
    }

    const lines = cartLines();
    expect(lines).toHaveLength(2);
    expect(lines[0]?.textContent).toContain('Catatan: sambal dipisah');
    expect(within(lines[0]!).getByLabelText('Jumlah 2')).toBeTruthy();
    expect(lines[1]?.textContent).not.toContain('Catatan');
  });

  it('opens fresh each time: nothing from the last order is still selected', async () => {
    await renderLoaded();
    fireEvent.click(card('Geprek'));
    choose('Level 5');
    choose('Pakai nasi');
    fireEvent.click(addButton());

    fireEvent.click(card('Geprek'));
    expect(sheet().getByRole('button', { name: /^Level 5/ }).getAttribute('aria-pressed')).toBe('false');
    expect(sheet().getByRole('button', { name: /^Pakai nasi/ }).getAttribute('aria-pressed')).toBe('false');
    expect(addButton().disabled).toBe(true);
  });

  it('closes without changing the order when cancelled', async () => {
    await renderLoaded();
    fireEvent.click(card('Geprek'));
    choose('Level 3');
    fireEvent.click(sheet().getByRole('button', { name: 'Tutup' }));

    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(screen.getByText('Keranjang masih kosong.')).toBeTruthy();
  });

  it('cannot order a product whose required choices are all sold out, and says why', async () => {
    await renderLoaded();
    fireEvent.click(card('Bebek'));

    expect(sheet().getByText(/Bagian bebek sedang habis/)).toBeTruthy();
    expect(addButton().disabled).toBe(true);
  });

  it('makes no network request for any of it (TECHNICAL_SPEC C.9)', async () => {
    await renderLoaded();
    fireEvent.click(card('Geprek'));
    choose('Level 3');
    choose('Dada');
    fireEvent.click(addButton());
    fireEvent.click(screen.getByRole('button', { name: /^Tambah Geprek, / }));

    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
