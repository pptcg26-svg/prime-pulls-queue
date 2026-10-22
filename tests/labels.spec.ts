import { test, expect, type APIRequestContext } from '@playwright/test';
import { createHmac } from 'node:crypto';

const pin = { 'x-admin-pin': 'local-test-pin' };
const customerId = '987654348271635';
async function paid(request: APIRequestContext, id: number, customer: unknown) {
  const data = JSON.stringify({ id, order_number: id, customer, line_items: [{ quantity: 12 }] });
  const hmac = createHmac('sha256', 'local-test-signing-secret').update(data).digest('base64');
  return request.post('/api/shopify/orders-paid', { data, headers: { 'content-type': 'application/json', 'x-shopify-hmac-sha256': hmac } });
}
async function orders(request: APIRequestContext, admin = false) {
  const response = await request.get('/api/queue', { headers: admin ? pin : undefined });
  expect(response.ok()).toBeTruthy();
  return (await response.json()).orders;
}

test.beforeEach(async ({ request }) => {
  expect((await request.post('http://127.0.0.1:54329/__seed', { data: [] })).ok()).toBeTruthy();
});

test('paid orders capture a stable customer suffix only available to authenticated admin', async ({ request }) => {
  for (const id of [1024, 1025]) expect((await paid(request, id, { id: customerId, first_name: 'Brendan', last_name: 'Parker' })).ok()).toBeTruthy();
  const admin = await orders(request, true);
  expect(admin.map((order: any) => order.customer_ref)).toEqual(['48271635', '48271635']);
  expect(JSON.stringify(admin)).not.toContain(customerId);
  const publicOrders = await orders(request);
  const wrongPin = (await (await request.get('/api/queue', { headers: { 'x-admin-pin': 'wrong-pin' } })).json()).orders;
  for (const order of [...publicOrders, ...wrongPin]) {
    expect(order).not.toHaveProperty('customer_ref');
    expect(order).not.toHaveProperty('shopify_customer_id');
  }
  const raw = await (await request.get('http://127.0.0.1:54329/rest/v1/queue_orders?select=shopify_customer_id')).json();
  expect(raw.map((order: any) => order.shopify_customer_id)).toEqual([customerId, customerId]);
  const response = await request.get('/api/queue', { headers: pin });
  expect(response.headers()['cache-control']).toContain('no-store');
  expect(response.headers()['vary']).toContain('x-admin-pin');
});

test('GraphQL string identity avoids rounding, and guests or unsafe IDs have no invented reference', async ({ request }) => {
  const precise = '123456789012345678901234567890';
  const customers = [
    { id: 1234, admin_graphql_api_id: `gid://shopify/Customer/${precise}`, first_name: 'Exact' },
    { id: 9007199254740992, first_name: 'Unsafe' },
    null,
    { id: '00012345', first_name: 'Short' },
  ];
  for (let i = 0; i < customers.length; i++) expect((await paid(request, 2000 + i, customers[i])).ok()).toBeTruthy();
  expect((await orders(request, true)).map((order: any) => order.customer_ref)).toEqual(['34567890', null, null, '12345']);
  const raw = await (await request.get('http://127.0.0.1:54329/rest/v1/queue_orders?select=shopify_customer_id&order=position.asc')).json();
  expect(raw[0].shopify_customer_id).toBe(precise);
});

test('pending migration keeps queue writes/reads working, and verified replay fills only missing identity', async ({ request }) => {
  await request.post('http://127.0.0.1:54329/__schema', { data: { customerColumnAvailable: false } });
  const customer = { id: customerId, first_name: 'Brendan', last_name: 'Parker' };
  expect((await paid(request, 1024, customer)).ok()).toBeTruthy();
  const before = (await orders(request, true))[0];
  expect(before.customer_ref).toBeNull();
  expect((await orders(request))).toHaveLength(1);
  expect((await request.post('/api/queue/update', { headers: pin, data: { id: before.id, action: 'now_ripping' } })).ok()).toBeTruthy();
  await request.post('http://127.0.0.1:54329/__schema', { data: { customerColumnAvailable: true } });
  expect((await paid(request, 1024, customer)).ok()).toBeTruthy();
  const after = await orders(request, true);
  expect(after).toHaveLength(1);
  expect(after[0]).toMatchObject({ id: before.id, customer_ref: '48271635', status: 'now_ripping', position: 0 });
  // A later replay does not replace an already captured customer identity.
  expect((await paid(request, 1024, { ...customer, id: '123456789' })).ok()).toBeTruthy();
  expect((await orders(request, true))[0].customer_ref).toBe('48271635');
});

test('admin prints the approved label with customer reference and automatically opens printing once', async ({ page, request, context }) => {
  expect((await paid(request, 1024, { id: customerId, first_name: 'Brendan', last_name: 'Parker' })).ok()).toBeTruthy();
  await context.addInitScript(() => { Object.assign(window, { printCalls: 0, print: () => { (window as any).printCalls++; } }); });
  await page.goto('/admin');
  await page.getByPlaceholder('Admin PIN').fill('local-test-pin');
  await page.getByRole('button', { name: 'Enter', exact: true }).click();
  await expect(page.getByText('Customer ref: 4827 1635')).toBeVisible();
  const popupPromise = page.waitForEvent('popup');
  await page.getByRole('button', { name: 'Print Label', exact: true }).click();
  const popup = await popupPromise;
  await expect(popup).toHaveURL(/customer_ref=48271635/);
  expect(popup.url()).not.toContain(customerId);
  await expect(popup.locator('[data-label-field="order-number"]')).toHaveText('#1024');
  await expect(popup.locator('[data-label-field="customer-name"]')).toHaveText('Brendan P.');
  await expect(popup.locator('[data-label-field="customer-ref"]')).toHaveText('4827 1635');
  await expect(popup.locator('[data-label-field="items"]')).toHaveText('12 ITEMS');
  await expect(popup.getByText('Review', { exact: true })).toBeVisible();
  await expect(popup.getByText('Checked', { exact: true })).toBeVisible();
  await expect(popup.getByText('BAG /', { exact: true })).toBeVisible();
  expect(await popup.getByRole('img', { name: 'Prime Pulls logo' }).evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth > 0)).toBe(true);
  const sizes = await popup.evaluate(() => ['order-number', 'customer-name', 'customer-ref'].map(field => parseFloat(getComputedStyle(document.querySelector(`[data-label-field="${field}"]`)!).fontSize)));
  expect(sizes[0]).toBeGreaterThan(sizes[1]);
  expect(sizes[1]).toBeGreaterThan(sizes[2]);
  await expect.poll(() => popup.evaluate(() => (window as any).printCalls)).toBe(1);
});

for (const example of [
  { title: 'legacy order', name: 'Brendan P.', order: '#1024', items: '12' },
  { title: 'long name and large item count', name: 'Alexandertheexceptionallylongfirstname P.', order: '#1234567890', items: '999999' },
  { title: 'one item and a short customer reference', name: 'Mo S.', order: '#1040', items: '1', ref: '12345' },
]) {
  test(`80×50 mm print layout fits ${example.title}`, async ({ page }, testInfo) => {
    await page.addInitScript(() => { window.print = () => {}; });
    const params = new URLSearchParams({ name: example.name, order: example.order, items: example.items });
    if (example.ref) params.set('customer_ref', example.ref);
    await page.goto(`/print/label?${params}`);
    const label = page.getByRole('region', { name: 'Prime Pulls order label' });
    await expect(page.locator('[data-label-field="customer-name"]')).toHaveText(example.name);
    await expect(page.locator('[data-label-field="customer-ref"]')).toHaveText(example.ref || 'Not available');
    await page.emulateMedia({ media: 'print' });
    await page.evaluate(() => document.fonts.ready);
    const bounds = await label.boundingBox();
    expect(bounds!.width).toBeCloseTo(80 * 96 / 25.4, 0);
    expect(bounds!.height).toBeCloseTo(50 * 96 / 25.4, 0);
    for (const field of ['order-number', 'customer-name', 'customer-ref', 'items']) {
      await expect.poll(async () => page.locator(`[data-label-field="${field}"]`).evaluate(el => el.scrollWidth <= el.clientWidth + 1)).toBe(true);
      const box = await page.locator(`[data-label-field="${field}"]`).boundingBox();
      expect(box!.x).toBeGreaterThanOrEqual(0);
      expect(box!.x + box!.width).toBeLessThanOrEqual(bounds!.width + 1);
      expect(box!.y + box!.height).toBeLessThanOrEqual(bounds!.height - 10);
    }
    await expect(page.getByRole('button', { name: 'Print Label', exact: true })).not.toBeVisible();
    await label.screenshot({ path: testInfo.outputPath('printed-label.png') });
    const pdf = await page.pdf({ preferCSSPageSize: true, printBackground: true });
    const raw = pdf.toString('latin1');
    expect(raw.match(/\/Type\s*\/Page\b/g)).toHaveLength(1);
    const mediaBox = raw.match(/\/MediaBox\s*\[\s*0\s+0\s+([\d.]+)\s+([\d.]+)/);
    expect(mediaBox).not.toBeNull();
    expect(Math.abs(Number(mediaBox![1]) - 80 * 72 / 25.4)).toBeLessThan(1);
    expect(Math.abs(Number(mediaBox![2]) - 50 * 72 / 25.4)).toBeLessThan(1);
  });
}

test('a missing logo still allows printing with a readable brand fallback', async ({ page }) => {
  await page.addInitScript(() => { Object.assign(window, { printCalls: 0, print: () => { (window as any).printCalls++; } }); });
  await page.route('**/branding/prime-pulls-label-mono.png', route => route.abort());
  await page.goto('/print/label?order=%231024&name=Brendan%20P.&items=12');
  await expect(page.getByText('PRIME', { exact: false })).toBeVisible();
  await expect.poll(() => page.evaluate(() => (window as any).printCalls)).toBe(1);
});
