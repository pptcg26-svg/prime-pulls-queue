import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { toLastInitial } from '@/lib/queueNames';

export const dynamic = 'force-dynamic';

function timingSafeEqual(a: string, b: string) {
  const aBuf = Buffer.from(a, 'base64');
  const bBuf = Buffer.from(b, 'base64');
  return aBuf.length === bBuf.length && crypto.timingSafeEqual(aBuf, bBuf);
}

function verifyShopifyHmac(rawBody: string, hmacHeader: string | null) {
  const secret = process.env.SHOPIFY_WEBHOOK_SECRET;
  if (!secret || !hmacHeader) return false;
  const digest = crypto.createHmac('sha256', secret).update(rawBody, 'utf8').digest('base64');
  return timingSafeEqual(digest, hmacHeader);
}

export async function POST(req: NextRequest) {
  const rawBody = await req.text();
  const hmacHeader = req.headers.get('x-shopify-hmac-sha256');

  if (!verifyShopifyHmac(rawBody, hmacHeader)) {
    return NextResponse.json({ error: 'Invalid Shopify HMAC' }, { status: 401 });
  }

  const order = JSON.parse(rawBody);
  const shopify_order_id = String(order.id);
  const order_number = order.order_number ? `#${order.order_number}` : String(order.name || `#${shopify_order_id}`);
  // Preserve the existing customer → billing → shipping priority and keep
  // both name parts tied to one person (shipping may name a different recipient).
  const nameSource = [order.customer, order.billing_address, order.shipping_address]
    .find(source => source?.first_name);
  const first_name = String(nameSource?.first_name || 'Guest');
  const last_initial = toLastInitial(nameSource?.last_name);
  const item_count = Array.isArray(order.line_items)
    ? order.line_items.reduce((sum: number, item: any) => sum + Number(item.quantity || 0), 0)
    : 0;

  const { data: maxRows } = await supabaseAdmin
    .from('queue_orders')
    .select('position')
    .order('position', { ascending: false })
    .limit(1);
  const position = ((maxRows?.[0]?.position ?? 0) as number) + 1;

  const { error } = await supabaseAdmin
    .from('queue_orders')
    .upsert({
      shopify_order_id,
      order_number,
      first_name,
      last_initial,
      item_count,
      position,
      status: 'queued'
    }, { onConflict: 'shopify_order_id', ignoreDuplicates: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
