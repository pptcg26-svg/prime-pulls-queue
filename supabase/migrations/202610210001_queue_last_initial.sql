-- Run before deploying Queue V2. Existing rows remain valid with NULL initials.
ALTER TABLE public.queue_orders
ADD COLUMN IF NOT EXISTS last_initial text;
