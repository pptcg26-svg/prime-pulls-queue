'use client';

import { useEffect, useState } from 'react';

type Order = {
  id: string;
  order_number: string;
  first_name: string;
  item_count: number;
  status: string;
};

export default function QueueOverlay() {
  const [orders, setOrders] = useState<Order[]>([]);

  async function load() {
    const res = await fetch('/api/queue', { cache: 'no-store' });
    const json = await res.json();
    setOrders(json.orders || []);
  }

  useEffect(() => {
    load();
    const t = setInterval(load, 2500);
    return () => clearInterval(t);
  }, []);

  const visible = orders.slice(0, 5);

  return (
    <main className="overlay-body">
      <section className="queue-panel">
        <div className="queue-title">
          <span>LIVE QUEUE</span>
          <span className="queue-site">PrimePullsTCG.com</span>
        </div>
        {visible.length === 0 ? (
          <div className="queue-empty">Queue open — order packs live!</div>
        ) : visible.map((order, index) => {
          const label = order.status === 'now_ripping' || index === 0 ? 'NOW' : index === 1 ? 'NEXT' : String(index + 1);
          return (
            <div key={order.id} className={`queue-row ${label === 'NOW' ? 'now' : ''}`}>
              <div className="queue-label">{label}</div>
              <div className="queue-name">{order.order_number} • {order.first_name}</div>
              <div className="queue-items">{order.item_count} item{order.item_count === 1 ? '' : 's'}</div>
            </div>
          );
        })}
        <div className="queue-footer">BUY PACKS ON THE SITE • OPENED LIVE</div>
      </section>
    </main>
  );
}
