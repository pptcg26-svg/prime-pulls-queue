'use client';

import { useEffect, useState, type CSSProperties } from 'react';
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
  const [angle, setAngle] = useState(12);

  useEffect(() => {
    const value = new URLSearchParams(window.location.search).get('angle');
    if (value === null || value.trim() === '') return;
    const requestedAngle = Number(value);
    if (Number.isFinite(requestedAngle)) setAngle(Math.max(0, Math.min(18, requestedAngle)));
  }, []);

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
    <main className="overlay-body" style={{ '--queue-tilt': `${angle}deg` } as CSSProperties}>
      <section className="queue-panel" aria-label="Prime Pulls TCG live queue">
        <header className="queue-title">
          <svg className="queue-crest" viewBox="0 0 128 84" fill="none" aria-hidden="true">
            <defs>
              <linearGradient id="queue-crown-gold" x1="25" y1="6" x2="81" y2="78" gradientUnits="userSpaceOnUse">
                <stop stopColor="#fff6cd" /><stop offset=".28" stopColor="#ffc861" />
                <stop offset=".5" stopColor="#9d681b" /><stop offset=".7" stopColor="#ffe79b" /><stop offset="1" stopColor="#d4af37" />
              </linearGradient>
              <linearGradient id="queue-crown-silver" x1="15" y1="68" x2="117" y2="76" gradientUnits="userSpaceOnUse">
                <stop stopColor="#7e8a9f" /><stop offset=".5" stopColor="#f7f9fc" /><stop offset="1" stopColor="#7e8a9f" />
              </linearGradient>
            </defs>
            <path d="M12 60 5 28 29 43 34 18 51 36 64 3 77 36 94 18 99 43 123 28 116 60Z" fill="url(#queue-crown-gold)" stroke="#fff1bd" strokeWidth="1.5" strokeLinejoin="round" />
            <path d="M64 7V57M35 24 43 57M93 24 85 57" stroke="#714818" strokeWidth="2" />
            <path d="m7 66 21 1 13 7h46l13-7 21-1-6 8-24 2-27 5-27-5-24-2Z" fill="url(#queue-crown-silver)" stroke="#d7deed" />
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
        {moreCount > 0 && <footer className="queue-footer"><span className="queue-more-count">+{moreCount}</span>{' '}<span>MORE IN QUEUE</span></footer>}
        {loaded && reconnecting && <div className="queue-footer" role="status">QUEUE RECONNECTING</div>}
      </section>
    </main>
  );
}
