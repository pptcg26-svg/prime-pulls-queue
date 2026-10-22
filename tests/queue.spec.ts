import { test, expect, type APIRequestContext } from '@playwright/test';
import { createHmac } from 'node:crypto';

const fixture = (count: number) => Array.from({ length: count }, (_, index) => ({
  id: `order-${index}`, shopify_order_id: `shopify-${index}`, order_number: `#${1024 + index}`,
  first_name: index === 2 ? 'Alexandertheexceptionallylongfirstname' : ['Brendan', 'Ashley', 'Cory'][index % 3],
  last_initial: index === 1 ? null : 'P', item_count: index === 2 ? 999999 : index + 1,
  status: index === 0 ? 'now_ripping' : 'queued', position: index * 10,
  created_at: '2026-10-21T00:00:00.000Z',
}));
async function seed(request: APIRequestContext, count: number) {
  expect((await request.post('http://127.0.0.1:54329/__seed', { data: fixture(count) })).ok()).toBeTruthy();
}
async function webhook(request: APIRequestContext, order: object) {
  const data = JSON.stringify(order);
  const hmac = createHmac('sha256', 'local-test-signing-secret').update(data).digest('base64');
  return request.post('/api/shopify/orders-paid', { data, headers: { 'content-type': 'application/json', 'x-shopify-hmac-sha256': hmac } });
}

for (const count of [0, 1, 2, 5, 6, 17]) {
  test(`${count} orders: dynamic rows, footer, privacy and transparent canvas`, async ({ page, request }, testInfo) => {
    await seed(request, count);
    await page.goto('/overlay/queue');
    await expect(page.locator('.queue-panel')).toBeVisible();
    await expect(page.locator('.queue-row')).toHaveCount(Math.min(count, 5));
    await expect(page.locator('.queue-footer')).toHaveCount(count > 5 ? 1 : 0);
    if (count > 5) await expect(page.locator('.queue-footer')).toHaveText(`+${count - 5} MORE IN QUEUE`);
    if (count === 0) await expect(page.locator('.queue-empty')).toHaveText('QUEUE OPEN');
    if (count > 0) {
      await expect(page.locator('.queue-row.now')).toHaveCount(1);
      await expect(page.locator('.queue-name').first()).toHaveText('Brendan P.');
      await expect(page.locator('.queue-items').first()).toHaveText('1 ITEM');
    }
    if (count > 1) await expect(page.locator('.queue-name').nth(1)).toHaveText('Ashley');
    if (count > 2) {
      await expect(page.locator('.queue-items').nth(2)).toHaveText('999,999 ITEMS');
      const widths = await page.locator('.queue-name').evaluateAll(els => els.map(el => (el as HTMLElement).offsetWidth));
      expect(new Set(widths).size).toBe(1);
    }
    const geometry = await page.evaluate(() => {
      const panel = document.querySelector<HTMLElement>('.queue-panel')!;
      const bounds = panel.getBoundingClientRect();
      const last = document.querySelector('.queue-footer') || document.querySelector('.queue-list') || document.querySelector('.queue-empty');
      const content = last as HTMLElement;
      return { height: panel.offsetHeight, bottomGap: panel.offsetHeight - content.offsetTop - content.offsetHeight,
        bounds: { left: bounds.left, top: bounds.top, right: bounds.right, bottom: bounds.bottom },
        body: getComputedStyle(document.body).backgroundColor, html: getComputedStyle(document.documentElement).backgroundColor,
        overflow: document.documentElement.scrollWidth > innerWidth };
    });
    expect(geometry.body).toBe('rgba(0, 0, 0, 0)');
    expect(geometry.html).toBe('rgba(0, 0, 0, 0)');
    expect(geometry.bottomGap).toBeLessThan(15);
    expect(geometry.height).toBeLessThan(count <= 1 ? 240 : count === 2 ? 310 : 560);
    expect(geometry.overflow).toBe(false);
    expect(geometry.bounds.left).toBeGreaterThanOrEqual(0);
    expect(geometry.bounds.top).toBeGreaterThanOrEqual(0);
    expect(geometry.bounds.right).toBeLessThanOrEqual(390);
    expect(geometry.bounds.bottom).toBeLessThanOrEqual(600);
    await page.screenshot({ path: testInfo.outputPath(`queue-${count}.png`), omitBackground: true });
    await page.setViewportSize({ width: 320, height: 600 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    if (count > 2) {
      expect(await page.locator('.queue-name').nth(2).evaluate(el => el.scrollWidth > el.clientWidth)).toBe(true);
      expect(await page.locator('.queue-items').nth(2).evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true);
      const items = await page.locator('.queue-items').nth(2).boundingBox();
      expect(items!.x + items!.width).toBeLessThanOrEqual(320);
    }
  });
}

test('webhook HMAC, identity priority, private initials, duplicates and ordering', async ({ request }) => {
  await seed(request, 0);
  expect((await request.post('/api/shopify/orders-paid', { data: { id: 1 } })).status()).toBe(401);
  expect((await request.post('/api/shopify/orders-paid', { data: '{}', headers: { 'x-shopify-hmac-sha256': 'bogus' } })).status()).toBe(401);
  expect((await request.post('/api/queue/manual', { data: { order_number: '#1' } })).status()).toBe(401);
  expect((await request.post('/api/queue/update', { data: { id: '1', action: 'complete' } })).status()).toBe(401);
  const payloads = [
    { id: 1, order_number: 2001, customer: { first_name: 'Brendan', last_name: 'Private' }, billing_address: { first_name: 'Other', last_name: 'Other' }, line_items: [{ quantity: 4 }, { quantity: 8 }] },
    { id: 2, order_number: 2002, billing_address: { first_name: 'Ashley', last_name: 'Baker' } },
    { id: 3, order_number: 2003, shipping_address: { first_name: 'Cory', last_name: 'Miller' } },
    { id: 4, order_number: 2004, customer: { first_name: 'Legacy' }, shipping_address: { first_name: 'Recipient', last_name: 'Different' } },
  ];
  for (const order of payloads) expect((await webhook(request, order)).ok()).toBeTruthy();
  expect((await webhook(request, payloads[0])).ok()).toBeTruthy();
  const { orders } = await (await request.get('/api/queue')).json();
  expect(orders).toHaveLength(4);
  expect(orders.map((o: any) => [o.first_name, o.last_initial])).toEqual([['Brendan', 'P'], ['Ashley', 'B'], ['Cory', 'M'], ['Legacy', null]]);
  expect(orders[0].item_count).toBe(12);
  expect(JSON.stringify(orders)).not.toContain('Private');
  expect(orders.map((o: any) => o.position)).toEqual([1, 2, 3, 4]);
});

test('admin controls and webhook changes reach OBS through existing polling', async ({ page, request, context }) => {
  await seed(request, 2);
  const overlay = await context.newPage();
  await overlay.goto('/overlay/queue');
  await expect(overlay.locator('.queue-row')).toHaveCount(2);
  await page.goto('/admin');
  await page.getByPlaceholder('Admin PIN').fill('local-test-pin');
  await page.getByRole('button', { name: 'Enter', exact: true }).click();
  await expect(page.locator('.order-card')).toHaveCount(2);
  const second = page.locator('.order-card').filter({ hasText: '#1025' });
  await second.getByRole('button', { name: 'Now Ripping', exact: true }).click();
  await expect(overlay.locator('.queue-row').first()).toContainText('#1025', { timeout: 7000 });
  await expect(overlay.locator('.queue-row.now')).toContainText('Ashley');
  await second.getByRole('button', { name: 'Queue', exact: true }).click();
  await expect(second.locator('.status')).toHaveText('queued');
  await second.getByRole('button', { name: '↑', exact: true }).click();
  let orders = (await (await request.get('/api/queue')).json()).orders;
  expect(orders.find((o: any) => o.order_number === '#1025').position).toBe(0);
  await second.getByRole('button', { name: '↓', exact: true }).click();
  await expect.poll(async () => (await (await request.get('/api/queue')).json()).orders.find((o: any) => o.order_number === '#1025').position).toBe(1);
  await expect(overlay.locator('.queue-row').first()).toContainText('#1024', { timeout: 7000 });
  await second.getByRole('button', { name: 'Complete', exact: true }).click();
  await expect(overlay.locator('.queue-row')).toHaveCount(1, { timeout: 7000 });
  await page.getByPlaceholder('#1050').fill('#3000');
  await page.getByRole('textbox', { name: 'First name', exact: true }).fill('Manual');
  await page.getByRole('textbox', { name: 'Last initial (optional)' }).fill('x');
  await page.getByRole('button', { name: 'Add', exact: true }).click();
  await expect(overlay.locator('.queue-name').filter({ hasText: 'Manual X.' })).toBeVisible({ timeout: 7000 });
  const manual = page.locator('.order-card').filter({ hasText: '#3000' });
  const popupPromise = page.waitForEvent('popup');
  await manual.getByRole('button', { name: 'Print Label', exact: true }).click();
  const popup = await popupPromise;
  await expect(popup).toHaveURL(/name=Manual\+X\./);
  await popup.close();
  await manual.getByRole('button', { name: 'Hide', exact: true }).click();
  await expect(overlay.locator('.queue-row')).toHaveCount(1, { timeout: 7000 });
  expect((await webhook(request, { id: 999, order_number: 9999, customer: { first_name: 'Webhook', last_name: 'Verified' }, line_items: [{ quantity: 9 }] })).ok()).toBeTruthy();
  await expect(overlay.locator('.queue-name').filter({ hasText: 'Webhook V.' })).toBeVisible({ timeout: 7000 });
  await expect(page.locator('.order-card').filter({ hasText: 'Webhook V.' })).toBeVisible({ timeout: 7000 });
});

test('legacy row without field, first-row emphasis, queue order and failed poll retention', async ({ page, request }) => {
  const rows = fixture(2);
  rows[0].status = 'queued';
  rows[0].position = 10;
  rows[1].position = 0;
  // Simulate old API/row shape as well as SQL NULL.
  await page.route('**/api/queue', route => route.fulfill({ json: { orders: [{ ...rows[1], last_initial: undefined }, rows[0]] } }));
  await page.goto('/overlay/queue');
  await expect(page.locator('.queue-row.now')).toContainText('Ashley');
  await expect(page.locator('.queue-name').first()).toHaveText('Ashley');
  await page.unroute('**/api/queue');
  await page.route('**/api/queue', route => route.fulfill({ status: 503, json: { error: 'temporary outage' } }));
  await page.waitForResponse('**/api/queue');
  await expect(page.locator('.queue-row')).toHaveCount(2);
  await seed(request, 0);
});

test('initial API failure is visible and recovers on the next poll', async ({ page }) => {
  let unavailable = true;
  await page.route('**/api/queue', route => unavailable
    ? route.fulfill({ status: 500, json: { error: 'database unavailable' } })
    : route.fulfill({ json: { orders: fixture(1) } }));
  await page.goto('/overlay/queue');
  await expect(page.locator('.queue-panel')).toBeVisible();
  await expect(page.getByRole('status')).toHaveText('QUEUE RECONNECTING');
  await expect(page.locator('.queue-empty')).not.toHaveText('QUEUE OPEN');
  unavailable = false;
  await expect(page.locator('.queue-row')).toHaveCount(1, { timeout: 7000 });
  await expect(page.getByRole('status')).toHaveCount(0);
});

test('admin reports a queue API failure instead of showing an empty queue', async ({ page }) => {
  await page.route('**/api/queue', route => route.fulfill({ status: 500, json: { error: 'database unavailable' } }));
  await page.goto('/admin');
  await page.getByPlaceholder('Admin PIN').fill('local-test-pin');
  await page.getByRole('button', { name: 'Enter', exact: true }).click();
  await expect(page.locator('p[role="alert"]')).toContainText('Unable to load queue (HTTP 500)');
  await expect(page.getByText('No active queue orders.')).toHaveCount(0);
});

test('a stalled first request times out and polling can recover', async ({ page }) => {
  let calls = 0;
  await page.route('**/api/queue', async route => {
    calls += 1;
    if (calls === 1) {
      // Leave the first request unresolved to exercise the client timeout.
      return;
    }
    await route.fulfill({ json: { orders: fixture(1) } });
  });
  await page.goto('/overlay/queue');
  await expect(page.getByRole('status')).toHaveText('QUEUE CONNECTING');
  await expect(page.getByRole('status')).toHaveText('QUEUE RECONNECTING', { timeout: 9500 });
  await expect(page.locator('.queue-row')).toHaveCount(1, { timeout: 7000 });
  expect(calls).toBeGreaterThan(1);
});


test('left HUD faces inward with an adjustable, bounded perspective angle', async ({ page, request }) => {
  await seed(request, 5);
  for (const [query, angle] of [['', 12], ['?angle=0', 0], ['?angle=99', 18], ['?angle=-4', 0], ['?angle=invalid', 12]] as const) {
    await page.goto(`/overlay/queue${query}`);
    await expect(page.locator('.queue-row')).toHaveCount(5);
    await expect(page.locator('.overlay-body')).toHaveCSS('--queue-tilt', `${angle}deg`);
    const matrix = await page.locator('.queue-panel').evaluate(el => {
      const transform = new DOMMatrixReadOnly(getComputedStyle(el).transform);
      return { normalX: transform.m31, depth: transform.m13 };
    });
    if (angle > 0) {
      // Its face normal points right, toward the center of a stream from the left.
      expect(matrix.normalX).toBeGreaterThan(0);
      expect(matrix.depth).toBeLessThan(0);
    } else {
      expect(matrix.normalX).toBe(0);
      expect(matrix.depth).toBe(0);
    }
  }
});

test('glass fills transmit the stream while frame and text remain opaque', async ({ page, request }) => {
  await seed(request, 2);
  await page.goto('/overlay/queue?angle=0');
  await expect(page.locator('.queue-row')).toHaveCount(2);
  await expect(page.locator('.overlay-body')).toHaveCSS('--queue-tilt', '0deg');
  const samples = await page.evaluate(() => {
    const panel = document.querySelector('.queue-panel')!.getBoundingClientRect();
    const row = document.querySelector('.queue-row')!.getBoundingClientRect();
    const name = document.querySelector('.queue-name')!.getBoundingClientRect();
    return {
      outside: { x: 0, y: innerHeight - 1 },
      glass: { x: panel.left + 28, y: panel.top + 24 },
      row: { x: row.left + 24, y: row.bottom - 8 },
      frame: { x: panel.left + 1, y: panel.top + 50 },
      name: { x: name.left + 8, y: name.top + 6, width: name.width - 16, height: name.height - 12 },
    };
  });
  const png = await page.screenshot({ omitBackground: true });
  const alpha = await page.evaluate(async ({ encoded, points }) => {
    const image = new Image();
    image.src = `data:image/png;base64,${encoded}`;
    await image.decode();
    const canvas = document.createElement('canvas');
    canvas.width = image.width; canvas.height = image.height;
    const context = canvas.getContext('2d')!;
    context.drawImage(image, 0, 0);
    const pixel = (point: { x: number; y: number }) => context.getImageData(Math.floor(point.x), Math.floor(point.y), 1, 1).data[3];
    const name = context.getImageData(Math.floor(points.name.x), Math.floor(points.name.y), Math.floor(points.name.width), Math.floor(points.name.height)).data;
    let nameMax = 0;
    for (let i = 3; i < name.length; i += 4) nameMax = Math.max(nameMax, name[i]);
    return { outside: pixel(points.outside), glass: pixel(points.glass), row: pixel(points.row), frame: pixel(points.frame), nameMax };
  }, { encoded: png.toString('base64'), points: samples });
  expect(alpha.outside).toBe(0);
  expect(alpha.glass).toBeGreaterThan(100);
  expect(alpha.glass).toBeLessThan(220);
  expect(alpha.row).toBeGreaterThan(alpha.glass);
  expect(alpha.row).toBeLessThan(245);
  expect(alpha.frame).toBeGreaterThanOrEqual(250);
  expect(alpha.nameMax).toBeGreaterThanOrEqual(250);
  await page.goto('/admin');
  expect(await page.evaluate(() => getComputedStyle(document.body).backgroundColor)).toBe('rgb(7, 7, 7)');
});
