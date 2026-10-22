'use client';

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { formatCustomerReference } from '@/lib/customerReference';
import { toLastInitial } from '@/lib/queueNames';
import styles from './label.module.css';

type LabelData = {
  orderNumber: string;
  customerName: string;
  customerRef: string | null;
  itemCount: number;
};

export default function LabelPrintPage() {
  const [label, setLabel] = useState<LabelData | null>(null);
  const [logoLoaded, setLogoLoaded] = useState(false);
  const [logoFailed, setLogoFailed] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const quantity = Math.floor(Number(params.get('items')));
    const initial = toLastInitial(params.get('initial'));
    const name = params.get('name')?.trim() || 'Customer';
    const ref = params.get('customer_ref')?.replace(/\s/g, '') || '';
    setLabel({
      orderNumber: params.get('order')?.trim() || 'Order',
      customerName: `${name}${initial ? ` ${initial}.` : ''}`,
      customerRef: /^\d{1,8}$/.test(ref) ? ref : null,
      itemCount: Number.isSafeInteger(quantity) && quantity >= 0 ? quantity : 0,
    });
  }, []);

  useEffect(() => {
    if (!label || !logoLoaded) return;
    const timer = window.setTimeout(() => window.print(), 500);
    return () => window.clearTimeout(timer);
  }, [label, logoLoaded]);

  if (!label) return <main className={styles.loading}>Preparing label…</main>;

  return (
    <main className={styles.screen}>
      <section className={styles.label} aria-label="Prime Pulls order label">
        <header className={styles.topRow}>
          {logoFailed ? <strong className={styles.logoFallback}>PRIME<br />PULLS</strong> : <img
            src="/branding/prime-pulls-label-mono.png"
            alt="Prime Pulls logo"
            className={styles.lionLogo}
            onLoad={() => setLogoLoaded(true)}
            onError={() => { setLogoFailed(true); setLogoLoaded(true); }}
          />}
          <div className={styles.referenceBlock}>
            <div className={styles.labelType}>LIVE RIP</div>
            <div className={styles.referenceCaption}>CUSTOMER REF</div>
            <div className={styles.customerReference} data-label-field="customer-ref">{formatCustomerReference(label.customerRef)}</div>
          </div>
        </header>

        <div className={styles.orderBlock}>
          <div className={styles.orderCaption}>ORDER</div>
          <FitText className={styles.orderNumber} text={label.orderNumber} maxPt={29} minPt={12} field="order-number" />
        </div>

        <div className={styles.customerRow}>
          <FitText className={styles.firstName} text={label.customerName} maxPt={22} minPt={10} field="customer-name" />
          <span className={styles.itemCount} data-label-field="items">{label.itemCount.toLocaleString('en-US')} ITEM{label.itemCount === 1 ? '' : 'S'}</span>
        </div>

        <footer className={styles.checks}>
          <CheckItem label="Checked" />
          <CheckItem label="Review" />
          <span className={styles.bagCount}>BAG <span /> / <span /></span>
        </footer>
      </section>
      <div className={styles.controls}>
        <button type="button" onClick={() => window.print()}>Print Label</button>
        <button type="button" onClick={() => window.close()}>Close</button>
      </div>
    </main>
  );
}

/** Keep real order/name text readable without silently cutting identifiers off. */
function FitText({ text, className, maxPt, minPt, field }: {
  text: string; className: string; maxPt: number; minPt: number; field: string;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) return;
    let active = true;
    const fit = () => {
      if (!active) return;
      element.style.whiteSpace = 'nowrap';
      element.style.overflowWrap = 'normal';
      let size = maxPt * 96 / 72;
      const minimum = minPt * 96 / 72;
      element.style.fontSize = `${size}px`;
      while (element.scrollWidth > element.clientWidth && size > minimum) {
        size = Math.max(minimum, size - 1);
        element.style.fontSize = `${size}px`;
      }
      if (element.scrollWidth > element.clientWidth) {
        element.style.whiteSpace = 'normal';
        element.style.overflowWrap = 'anywhere';
      }
    };
    fit();
    const observer = new ResizeObserver(fit);
    if (element.parentElement) observer.observe(element.parentElement);
    document.fonts.ready.then(fit);
    return () => { active = false; observer.disconnect(); };
  }, [text, maxPt, minPt]);
  return <span ref={ref} className={className} data-label-field={field}>{text}</span>;
}

function CheckItem({ label }: { label: string }) {
  return <span className={styles.checkItem}><span className={styles.checkbox} aria-hidden="true" />{label}</span>;
}
