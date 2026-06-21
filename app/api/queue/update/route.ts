import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabaseAdmin';

export async function POST(req: NextRequest) {
  if (!requireAdmin(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json();
  const { id, action } = body as { id?: string; action?: string };
  if (!id || !action) return NextResponse.json({ error: 'Missing id or action' }, { status: 400 });

  if (action === 'now_ripping') {
    await supabaseAdmin.from('queue_orders').update({ status: 'queued' }).eq('status', 'now_ripping');
    const { error } = await supabaseAdmin.from('queue_orders').update({ status: 'now_ripping', position: 0 }).eq('id', id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  if (['queued', 'complete', 'hidden'].includes(action)) {
    const { error } = await supabaseAdmin.from('queue_orders').update({ status: action }).eq('id', id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  if (action === 'move_up' || action === 'move_down') {
    const delta = action === 'move_up' ? -1 : 1;
    const { data: current, error: readErr } = await supabaseAdmin.from('queue_orders').select('position').eq('id', id).single();
    if (readErr) return NextResponse.json({ error: readErr.message }, { status: 500 });
    const { error } = await supabaseAdmin.from('queue_orders').update({ position: Math.max(0, (current.position ?? 0) + delta) }).eq('id', id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
}
