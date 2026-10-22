/** Shopify's store customer record ID, not the order ID or a Shop username. */
export function shopifyCustomerId(customer: { id?: unknown; admin_graphql_api_id?: unknown } | null | undefined): string | null {
  // Prefer the string GraphQL identifier when available, avoiding JSON number rounding.
  const graphql = typeof customer?.admin_graphql_api_id === 'string'
    ? customer.admin_graphql_api_id.match(/^gid:\/\/shopify\/Customer\/(\d+)$/)?.[1]
    : undefined;
  const raw = graphql ?? customer?.id;
  const value = typeof raw === 'string' ? raw.trim()
    : typeof raw === 'number' && Number.isSafeInteger(raw) ? String(raw) : '';
  if (!/^\d+$/.test(value) || /^0+$/.test(value)) return null;
  return value.replace(/^0+(?=\d)/, '');
}

export function customerReference(id: string | null | undefined): string | null {
  return id && /^\d+$/.test(id) ? id.slice(-8) : null;
}

export function formatCustomerReference(ref: string | null | undefined): string {
  if (!ref || !/^\d{1,8}$/.test(ref)) return 'Not available';
  return ref.length === 8 ? `${ref.slice(0, 4)} ${ref.slice(4)}` : ref;
}

/** Only this optional column may be omitted during a migration rollout. */
export function isMissingCustomerIdColumn(error: { code?: string; message?: string } | null): boolean {
  return Boolean(error && ['PGRST204', '42703'].includes(error.code ?? '')
    && error.message?.includes('shopify_customer_id'));
}
