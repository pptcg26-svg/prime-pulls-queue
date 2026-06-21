import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabaseAdmin';

export async function POST(req: NextRequest) {
  if (!requireAdmin(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const body = await req.json();
  const order_number = String(body.order_number || '').trim();
  const first_name = String(body.first_name || 'Guest').trim();
  const item_count = Number(body.item_count || 0);
  if (!order_number) return NextResponse.json({ error: 'Missing order number' }, { status: 400 });

  const { data: maxRows } = await supabaseAdmin
    .from('queue_orders')
    .select('position')
    .order('position', { ascending: false })
    .limit(1);
  const position = ((maxRows?.[0]?.position ?? 0) as number) + 1;

  const { error } = await supabaseAdmin.from('queue_orders').insert({
    shopify_order_id: `manual-${Date.now()}`,
    order_number,
    first_name,
    item_count,
    position,
    status: 'queued'
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
