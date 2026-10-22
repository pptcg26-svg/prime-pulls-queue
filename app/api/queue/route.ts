import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { requireAdmin } from '@/lib/auth';
import { customerReference, isMissingCustomerIdColumn } from '@/lib/customerReference';

export const dynamic = 'force-dynamic';

type QueueRow = {
  id: string; order_number: string; first_name: string; last_initial: string | null;
  item_count: number; status: string; position: number; created_at: string;
  shopify_customer_id?: string | null;
};

function activeOrders(includeCustomerId: boolean) {
  return supabaseAdmin
    .from('queue_orders')
    .select(includeCustomerId
      ? 'id, order_number, first_name, last_initial, item_count, status, position, created_at, shopify_customer_id'
      : 'id, order_number, first_name, last_initial, item_count, status, position, created_at')
    .in('status', ['queued', 'now_ripping'])
    .order('status', { ascending: false })
    .order('position', { ascending: true })
    .order('created_at', { ascending: true })
    .overrideTypes<QueueRow[], { merge: false }>();
}

export async function GET(req: NextRequest) {
  const admin = requireAdmin(req);
  let { data, error } = await activeOrders(admin);
  if (admin && isMissingCustomerIdColumn(error)) {
    ({ data, error } = await activeOrders(false));
  }

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const sorted = [...(data ?? [])].sort((a, b) => {
    if (a.status === 'now_ripping' && b.status !== 'now_ripping') return -1;
    if (a.status !== 'now_ripping' && b.status === 'now_ripping') return 1;
    return (a.position ?? 0) - (b.position ?? 0) || String(a.created_at).localeCompare(String(b.created_at));
  });

  const orders = sorted.map(order => {
    // Never send the full Shopify customer ID through the queue API, even to admin.
    const { shopify_customer_id, ...publicOrder } = order;
    return admin ? { ...publicOrder, customer_ref: customerReference(shopify_customer_id) } : publicOrder;
  });
  return NextResponse.json({ orders }, { headers: { 'Cache-Control': 'private, no-store', Vary: 'x-admin-pin' } });
}
