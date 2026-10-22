-- Optional Shopify customer identity for admin order labels. No rows are rewritten.
ALTER TABLE public.queue_orders
ADD COLUMN IF NOT EXISTS shopify_customer_id text;
