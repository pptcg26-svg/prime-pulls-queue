'use client';

import { useEffect, useState } from 'react';
import styles from './label.module.css';

type LabelData = {
  orderNumber: string;
  firstName: string;
  lastInitial: string;
  itemCount: number;
};

export default function LabelPrintPage() {
  const [label, setLabel] = useState<LabelData | null>(null);
  const [logoLoaded, setLogoLoaded] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const parsedItemCount = Number(params.get('items'));

    setLabel({
      orderNumber: params.get('order')?.trim() || 'Order',
      firstName: params.get('name')?.trim() || 'Customer',
      lastInitial:
        params.get('initial')?.trim().charAt(0).toUpperCase() || '',
      itemCount:
        Number.isFinite(parsedItemCount) && parsedItemCount >= 0
          ? Math.floor(parsedItemCount)
          : 0
    });
  }, []);

  useEffect(() => {
    if (!label || !logoLoaded) return;

    const timer = window.setTimeout(() => {
      window.print();
    }, 500);

    return () => window.clearTimeout(timer);
  }, [label, logoLoaded]);

  if (!label) {
    return (
      <main className={styles.loading}>
        Preparing label…
      </main>
    );
  }

  return (
    <main className={styles.screen}>
      <section
        className={styles.label}
        aria-label="Prime Pulls order label"
      >
        <div className={styles.topRow}>
          <div className={styles.brandBlock}>
            <div className={styles.brand}>
              PRIME PULLS TCG
            </div>

            <div className={styles.labelType}>
              LIVE RIP
            </div>
          </div>

          <img
            src="/branding/prime-pulls-lion-thermal.png"
            alt="Prime Pulls lion logo"
            className={styles.lionLogo}
            onLoad={() => setLogoLoaded(true)}
            onError={event => {
              console.error(
                'Prime Pulls lion failed to load:',
                event.currentTarget.src
              );

              setLogoLoaded(true);
            }}
          />
        </div>

        <div className={styles.orderNumber}>
          {label.orderNumber}
        </div>

        <div className={styles.customerRow}>
          <span className={styles.firstName}>
            {label.firstName}
            {label.lastInitial
              ? ` ${label.lastInitial}.`
              : ''}
          </span>

          <span className={styles.itemCount}>
            {label.itemCount} ITEM
            {label.itemCount === 1 ? '' : 'S'}
          </span>
        </div>

        <div className={styles.checks}>
          <CheckItem label="Checked" />
        </div>
      </section>

      <div className={styles.controls}>
        <button
          type="button"
          onClick={() => window.print()}
        >
          Print Label
        </button>

        <button
          type="button"
          onClick={() => window.close()}
        >
          Close
        </button>
      </div>
    </main>
  );
}

function CheckItem({ label }: { label: string }) {
  return (
    <span className={styles.checkItem}>
      <span
        className={styles.checkbox}
        aria-hidden="true"
      />

      {label}
    </span>
  );
}