import { expect, FAILED_REQUEST, test } from './support/test';
import { runSqlText } from './support/global-setup';
import { KASIR1, outboxEntry, PASSWORD, RPC, startOnline, supabaseEnv } from './support/offline';

// Product options while offline (DATABASE D.12; AC-10, AC-11): the menu with its option groups is
// saved on the device, a Geprek is sold with choices with no network, survives in the outbox, and
// syncs once with its choices intact. Against the production build (service worker) and the local
// stack. It adds one menu item to store A; reset afterwards with `npx supabase db reset`.

test.beforeEach(({ allowConsoleError }) =>
  allowConsoleError(FAILED_REQUEST, /Could not|Sync pass|Service worker registration failed|Export of|failed unexpectedly/),
);

const STORE_A = '5a000000-0000-4000-8000-000000000001';
const CATEGORY_A = 'ca000000-0000-4000-8000-000000000001';
const NAME = `Geprek Offline ${Date.now().toString(36)}`;

/** One menu item with a required level, a priced optional rice, and a default part of the chicken. */
function stageGeprek() {
  runSqlText(
    `
    with p as (
      insert into public.products (store_id, category_id, name, price) values ('${STORE_A}', '${CATEGORY_A}', '${NAME}', 12000) returning id
    ), g as (
      insert into public.option_groups (store_id, name, allow_multiple, required) values
        ('${STORE_A}', 'Level ${NAME}', false, true),
        ('${STORE_A}', 'Nasi ${NAME}', false, false),
        ('${STORE_A}', 'Bagian ${NAME}', false, true)
      returning id, name
    ), c as (
      insert into public.option_choices (store_id, group_id, name, price_delta, is_default, position)
      select '${STORE_A}', g.id, v.name, v.price, v.is_default, v.position
      from g join (values
        ('Level', 'Level 1', 0, false, 0), ('Level', 'Level 5', 0, false, 1),
        ('Nasi', 'Pakai nasi', 4000, false, 0),
        ('Bagian', 'Dada', 3000, true, 0), ('Bagian', 'Paha', 1000, false, 1)
      ) as v(kind, name, price, is_default, position) on g.name like v.kind || ' %'
      returning id
    )
    insert into public.product_option_groups (product_id, group_id, store_id, position)
    select p.id, g.id, '${STORE_A}', case when g.name like 'Nasi %' then 0 when g.name like 'Level %' then 1 else 2 end
    from p, g;
    `,
    'the offline options fixture',
  );
}

test('an item with choices is sold offline, kept in the outbox, and synced once with its choices', async ({ page, context }) => {
  stageGeprek();
  await startOnline(page, KASIR1.email);
  const card = page.getByRole('main').getByRole('button', { name: new RegExp(`^${NAME}`) });
  await expect(card).toBeVisible();

  // The network goes away; the menu and its choices come from the device copy.
  await context.setOffline(true);
  await page.reload();
  await expect(card).toBeVisible();
  await card.click();
  const sheet = page.getByRole('dialog');
  await expect(sheet.getByRole('button', { name: /^TAMBAH ·/ })).toBeDisabled();
  await sheet.getByRole('button', { name: /^Level 5/ }).click();
  await sheet.getByRole('button', { name: /^Pakai nasi/ }).click();
  // 12.000 + nasi 4.000 + Dada 3.000 (the default)
  await expect(sheet.getByRole('button', { name: /^TAMBAH ·/ })).toContainText('Rp19.000');
  await sheet.getByRole('button', { name: /^TAMBAH ·/ }).click();

  await page.getByRole('link', { name: 'LIHAT PESANAN' }).click();
  await page.getByRole('link', { name: 'LANJUT BAYAR' }).click();
  const main = page.getByRole('main');
  await main.getByRole('group', { name: 'Nominal cepat' }).getByRole('button', { name: 'UANG PAS' }).click();
  await main.getByRole('button', { name: 'BAYAR' }).click();
  await expect(page.getByRole('heading', { name: 'Transaksi Berhasil', level: 1 })).toBeVisible();
  const id = new URL(page.url()).searchParams.get('id')!;

  // Saved on the device with its choices, still pending.
  const saved = await outboxEntry(page, id);
  expect(saved).toMatchObject({ sync_status: 'pending', total: 19000 });
  expect(saved!.items[0]).toMatchObject({
    product_name: NAME,
    unit_price: 19000,
    options: [
      { group: `Nasi ${NAME}`, name: 'Pakai nasi', price: 4000 },
      { group: `Level ${NAME}`, name: 'Level 5', price: 0 },
      { group: `Bagian ${NAME}`, name: 'Dada', price: 3000 },
    ],
  });

  // Riwayat opens offline from the device copy and shows the choices.
  await page.goto(`/riwayat/detail?id=${id}`);
  await expect(page.getByRole('main')).toContainText('Pakai nasi · Level 5 · Dada');

  // Back online: one sync, one sale, choices stored.
  const rpcBodies: string[] = [];
  context.on('request', (request) => {
    if (request.url().includes(RPC)) rpcBodies.push(request.postData() ?? '');
  });
  await context.setOffline(false);
  await expect.poll(async () => (await outboxEntry(page, id))?.sync_status, { timeout: 20_000 }).toBe('synced');
  expect(rpcBodies.filter((body) => body.includes(id))).toHaveLength(1);

  const { url, key } = supabaseEnv();
  const login = await context.request.post(`${url}/auth/v1/token?grant_type=password`, {
    headers: { apikey: key },
    data: { email: KASIR1.email, password: PASSWORD },
  });
  const { access_token } = (await login.json()) as { access_token: string };
  const items = await context.request.get(
    `${url}/rest/v1/transaction_items?transaction_id=eq.${id}&select=product_name,unit_price,options,note`,
    { headers: { apikey: key, authorization: `Bearer ${access_token}` } },
  );
  expect(await items.json()).toEqual([
    {
      product_name: NAME,
      unit_price: 19000,
      options: [
        { group: `Nasi ${NAME}`, name: 'Pakai nasi', price: 4000 },
        { group: `Level ${NAME}`, name: 'Level 5', price: 0 },
        { group: `Bagian ${NAME}`, name: 'Dada', price: 3000 },
      ],
      note: null,
    },
  ]);
});
