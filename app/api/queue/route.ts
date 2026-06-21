import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';

export const dynamic = 'force-dynamic';

export async function GET() {
  const { data, error } = await supabaseAdmin
    .from('queue_orders')
    .select('id, order_number, first_name, item_count, status, position, created_at')
    .in('status', ['queued', 'now_ripping'])
    .order('status', { ascending: false })
    .order('position', { ascending: true })
    .order('created_at', { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const sorted = [...(data ?? [])].sort((a, b) => {
    if (a.status === 'now_ripping' && b.status !== 'now_ripping') return -1;
    if (a.status !== 'now_ripping' && b.status === 'now_ripping') return 1;
    return (a.position ?? 0) - (b.position ?? 0) || String(a.created_at).localeCompare(String(b.created_at));
  });

  return NextResponse.json({ orders: sorted });
}
