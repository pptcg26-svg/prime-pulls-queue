// Isolated PostgREST substitute for route/browser tests. Never connects to Supabase.
import http from 'node:http';
import { randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';

let rows = [];
let customerColumnAvailable = true;
const database = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://127.0.0.1:54329');
  let raw = '';
  for await (const chunk of req) raw += chunk;
  const body = raw ? JSON.parse(raw) : null;
  res.setHeader('Content-Type', 'application/json');
  if (url.pathname === '/__seed' && req.method === 'POST') {
    rows = body;
    customerColumnAvailable = true;
    return res.end(JSON.stringify({ ok: true }));
  }
  if (url.pathname === '/__schema' && req.method === 'POST') {
    customerColumnAvailable = body.customerColumnAvailable;
    return res.end(JSON.stringify({ ok: true }));
  }
  if (url.pathname !== '/rest/v1/queue_orders') {
    res.statusCode = 404;
    return res.end('{}');
  }
  if (!customerColumnAvailable && (url.searchParams.get('select')?.includes('shopify_customer_id') || Object.hasOwn(body ?? {}, 'shopify_customer_id'))) {
    res.statusCode = 400;
    return res.end(JSON.stringify({ code: 'PGRST204', message: "Could not find the 'shopify_customer_id' column of 'queue_orders' in the schema cache" }));
  }
  const matches = row => [...url.searchParams].every(([key, value]) => {
    if (value.startsWith('eq.')) return String(row[key]) === value.slice(3);
    if (value.startsWith('in.(')) return value.slice(4, -1).split(',').includes(String(row[key]));
    if (value === 'is.null') return row[key] == null;
    return true;
  });
  if (req.method === 'POST') {
    if (!rows.some(row => row.shopify_order_id === body.shopify_order_id)) {
      rows.push({ id: randomUUID(), created_at: new Date().toISOString(), ...body });
    }
    res.statusCode = 201;
    return res.end('{}');
  }
  if (req.method === 'PATCH') {
    rows.filter(matches).forEach(row => Object.assign(row, body));
    return res.end('{}');
  }
  let selected = rows.filter(matches);
  const order = url.searchParams.get('order');
  if (order) {
    selected.sort((a, b) => {
      for (const part of order.split(',')) {
        const [key, direction] = part.split('.');
        const cmp = a[key] < b[key] ? -1 : a[key] > b[key] ? 1 : 0;
        if (cmp) return direction === 'desc' ? -cmp : cmp;
      }
      return 0;
    });
  }
  if (url.searchParams.has('limit')) selected = selected.slice(0, Number(url.searchParams.get('limit')));
  const select = url.searchParams.get('select');
  if (select) selected = selected.map(row => Object.fromEntries(select.split(',').map(key => [key, row[key]])));
  res.end(JSON.stringify(req.headers.accept?.includes('vnd.pgrst.object') ? selected[0] : selected));
});
await new Promise(resolve => database.listen(54329, '127.0.0.1', resolve));
const app = spawn(process.execPath, ['node_modules/next/dist/bin/next', 'start', '--hostname', '127.0.0.1', '--port', '3200'], {
  stdio: 'inherit',
  env: { ...process.env, SUPABASE_URL: 'http://127.0.0.1:54329', SUPABASE_SERVICE_ROLE_KEY: 'local-test-key',
    SHOPIFY_WEBHOOK_SECRET: 'local-test-signing-secret', ADMIN_PIN: 'local-test-pin', NEXT_TELEMETRY_DISABLED: '1' }
});
function stop() { app.kill('SIGTERM'); database.close(); }
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
app.on('exit', code => { database.close(); process.exitCode = code ?? 0; });
