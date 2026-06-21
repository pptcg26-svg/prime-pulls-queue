'use client';

import { useEffect, useState } from 'react';

type Order = {
  id: string;
  order_number: string;
  first_name: string;
  item_count: number;
  status: string;
  position: number;
  created_at: string;
};

export default function AdminPage() {
  const [pin, setPin] = useState('');
  const [savedPin, setSavedPin] = useState('');
  const [orders, setOrders] = useState<Order[]>([]);
  const [manual, setManual] = useState({ order_number: '', first_name: '', item_count: '1' });
  const [error, setError] = useState('');

  useEffect(() => {
    const p = sessionStorage.getItem('primeQueuePin') || '';
    setSavedPin(p);
  }, []);

  async function load() {
    const res = await fetch('/api/queue', { cache: 'no-store' });
    const json = await res.json();
    setOrders(json.orders || []);
  }

  useEffect(() => {
    if (!savedPin) return;
    load();
    const t = setInterval(load, 2500);
    return () => clearInterval(t);
  }, [savedPin]);

  function savePin() {
    sessionStorage.setItem('primeQueuePin', pin);
    setSavedPin(pin);
  }

  async function update(id: string, action: string) {
    setError('');
    const res = await fetch('/api/queue/update', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-admin-pin': savedPin },
      body: JSON.stringify({ id, action })
    });
    if (!res.ok) setError((await res.json()).error || 'Update failed');
    await load();
  }

  async function addManual() {
    setError('');
    const res = await fetch('/api/queue/manual', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-admin-pin': savedPin },
      body: JSON.stringify({ ...manual, item_count: Number(manual.item_count) })
    });
    if (!res.ok) setError((await res.json()).error || 'Manual add failed');
    setManual({ order_number: '', first_name: '', item_count: '1' });
    await load();
  }

  if (!savedPin) {
    return (
      <main className="admin-wrap">
        <div className="login-card">
          <h1 className="admin-title">Prime Pulls Queue Admin</h1>
          <p className="admin-sub">Enter your private admin PIN.</p>
          <div className="row">
            <input type="password" value={pin} onChange={e => setPin(e.target.value)} placeholder="Admin PIN" />
            <button className="primary" onClick={savePin}>Enter</button>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="admin-wrap">
      <div className="admin-header">
        <div>
          <h1 className="admin-title">Prime Pulls Live Queue</h1>
          <p className="admin-sub">Complete hides an order from OBS but keeps it in Supabase.</p>
        </div>
        <button onClick={load}>Refresh</button>
      </div>

      {error && <p style={{ color: '#ff6868', fontWeight: 800 }}>{error}</p>}

      <section className="manual-card" style={{ marginBottom: 16 }}>
        <h2 style={{ marginTop: 0 }}>Manual Add</h2>
        <div className="row">
          <input value={manual.order_number} onChange={e => setManual({ ...manual, order_number: e.target.value })} placeholder="#1050" />
          <input value={manual.first_name} onChange={e => setManual({ ...manual, first_name: e.target.value })} placeholder="First name" />
          <input value={manual.item_count} onChange={e => setManual({ ...manual, item_count: e.target.value })} placeholder="Items" />
          <button className="primary" onClick={addManual}>Add</button>
        </div>
      </section>

      <section className="grid">
        {orders.length === 0 && <div className="order-card">No active queue orders.</div>}
        {orders.map(order => (
          <div key={order.id} className="order-card">
            <div className="order-main">
              <strong>{order.order_number} — {order.first_name}</strong>
              <span className={`status ${order.status}`}>{order.status.replace('_', ' ')}</span>
              <div>{order.item_count} item{order.item_count === 1 ? '' : 's'}</div>
            </div>
            <div className="row">
              <button className="primary" onClick={() => update(order.id, 'now_ripping')}>Now Ripping</button>
              <button onClick={() => update(order.id, 'queued')}>Queue</button>
              <button onClick={() => update(order.id, 'move_up')}>↑</button>
              <button onClick={() => update(order.id, 'move_down')}>↓</button>
              <button onClick={() => update(order.id, 'complete')}>Complete</button>
              <button className="danger" onClick={() => update(order.id, 'hidden')}>Hide</button>
            </div>
          </div>
        ))}
      </section>
    </main>
  );
}
