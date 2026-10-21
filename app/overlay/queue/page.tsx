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
  const [reconnecting, setReconnecting] = useState(false);

  useEffect(() => {
    let active = true;
    let pending = false;
    let controller: AbortController | undefined;
    async function load() {
      if (pending) return;
      pending = true;
      controller = new AbortController();
      const timeout = setTimeout(() => controller?.abort(), 8000);
      try {
        const res = await fetch('/api/queue', { cache: 'no-store', signal: controller.signal });
        if (!res.ok) throw new Error('Queue request failed');
        const json = await res.json();
        if (!Array.isArray(json.orders)) throw new Error('Invalid queue response');
        if (active) {
          setOrders(json.orders);
          setLoaded(true);
          setReconnecting(false);
        }
      } catch {
        // Retain the last successful queue during a temporary network failure.
        if (active) setReconnecting(true);
      } finally {
        clearTimeout(timeout);
        pending = false;
      }
    }
    load();
    const timer = setInterval(load, 2500);
    return () => {
      active = false;
      controller?.abort();
      clearInterval(timer);
    };
  }, []);

  const visible = orders.slice(0, 5);
  const moreCount = orders.length - visible.length;

  return (
    <main className="overlay-body">
      <section className="queue-panel" aria-label="Prime Pulls TCG live queue">
        <header className="queue-title">
          <svg className="queue-crest" viewBox="0 0 56 40" fill="none" aria-hidden="true">
            <path d="M7 29 3 11 16 19 18 7 25 16 28 2 31 16 38 7 40 19 53 11 49 29Z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
            <path d="M8 35H48" stroke="currentColor" strokeWidth="2" />
          </svg>
          <div className="queue-brand">PRIME PULLS<span>QUEUE</span></div>
        </header>
        {!loaded ? (
          <div className="queue-empty" role="status">{reconnecting ? 'QUEUE RECONNECTING' : 'QUEUE CONNECTING'}</div>
        ) : visible.length === 0 ? (
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
        {loaded && reconnecting && <div className="queue-footer" role="status">QUEUE RECONNECTING</div>}
      </section>
    </main>
  );
}
