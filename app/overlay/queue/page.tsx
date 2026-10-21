'use client';

import { useEffect, useState } from 'react';
import { queueDisplayName } from '@/lib/queueNames';

type Order = {
  id: string;
  order_number: string;
  first_name: string;
  last_initial?: string | null;
  item_count: number;
  status: string;
};

export default function QueueOverlay() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let active = true;
    let pending = false;
    const controller = new AbortController();
    async function load() {
      if (pending) return;
      pending = true;
      try {
        const res = await fetch('/api/queue', { cache: 'no-store', signal: controller.signal });
        if (!res.ok) return;
        const json = await res.json();
        if (active && Array.isArray(json.orders)) {
          setOrders(json.orders);
          setLoaded(true);
        }
      } catch {
        // Retain the last successful queue during a temporary network failure.
      } finally {
        pending = false;
      }
    }
    load();
    const timer = setInterval(load, 2500);
    return () => {
      active = false;
      controller.abort();
      clearInterval(timer);
    };
  }, []);

  const visible = orders.slice(0, 5);
  const moreCount = orders.length - visible.length;

  return (
    <main className="overlay-body">
      {loaded && <section className="queue-panel" aria-label="Prime Pulls TCG live queue">
        <header className="queue-title">
          <svg className="queue-crest" viewBox="0 0 56 40" fill="none" aria-hidden="true">
            <path d="M7 29 3 11 16 19 18 7 25 16 28 2 31 16 38 7 40 19 53 11 49 29Z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
            <path d="M8 35H48" stroke="currentColor" strokeWidth="2" />
          </svg>
          <div className="queue-brand">PRIME PULLS<span>QUEUE</span></div>
        </header>
        {visible.length === 0 ? (
          <div className="queue-empty">QUEUE OPEN</div>
        ) : <ol className="queue-list" aria-label="Orders in queue">
          {visible.map((order, index) => {
            // Preserve V1's first-row emphasis when nothing is marked now_ripping.
            const current = order.status === 'now_ripping' || index === 0;
            const name = queueDisplayName(order);
            return (
              <li key={order.id} className={`queue-row${current ? ' now' : ''}`}
                aria-label={current ? `${order.order_number}, ${name}, current order` : undefined}>
                <span className="queue-number" title={order.order_number}>{order.order_number}</span>
                <span className="queue-name" title={name}>{name}</span>
                <span className="queue-items">{order.item_count.toLocaleString('en-US')} <span>{order.item_count === 1 ? 'ITEM' : 'ITEMS'}</span></span>
              </li>
            );
          })}
        </ol>}
        {moreCount > 0 && <footer className="queue-footer">+{moreCount} MORE IN QUEUE</footer>}
      </section>}
    </main>
  );
}
