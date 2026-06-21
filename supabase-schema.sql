create table if not exists public.queue_orders (
  id uuid primary key default gen_random_uuid(),
  shopify_order_id text unique,
  order_number text not null,
  first_name text not null default 'Guest',
  item_count integer not null default 0,
  status text not null default 'queued' check (status in ('queued','now_ripping','complete','hidden')),
  position integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists queue_orders_status_position_idx on public.queue_orders(status, position, created_at);

create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists queue_orders_set_updated_at on public.queue_orders;
create trigger queue_orders_set_updated_at
before update on public.queue_orders
for each row execute function public.set_updated_at();
