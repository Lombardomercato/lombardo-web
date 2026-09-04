alter table public.commerce_orders
  add column if not exists delivery_service text not null default 'standard';

alter table public.commerce_orders
  drop constraint if exists commerce_orders_delivery_service_check;

alter table public.commerce_orders
  add constraint commerce_orders_delivery_service_check check (
    delivery_service in ('standard', 'priority')
    and (delivery_service <> 'priority' or delivery_method = 'DELIVERY_ROSARIO')
  );

create table if not exists public.commerce_order_payment_proofs (
  id uuid primary key default gen_random_uuid(),
  tenant_id text not null,
  order_id bigint not null references public.commerce_orders(id) on delete cascade,
  conversation_session_id text not null,
  source_url text not null,
  mime_type text not null,
  review_status text not null default 'pending_review',
  created_at timestamptz not null default now(),
  constraint commerce_order_payment_proofs_session_check
    check (length(btrim(conversation_session_id)) between 8 and 160),
  constraint commerce_order_payment_proofs_url_check
    check (source_url ~ '^https://[^[:space:]]{1,1990}$'),
  constraint commerce_order_payment_proofs_mime_check
    check (mime_type like 'image/%' or mime_type = 'application/pdf'),
  constraint commerce_order_payment_proofs_review_check
    check (review_status in ('pending_review', 'approved', 'rejected')),
  unique (tenant_id, order_id, source_url)
);

create index if not exists commerce_order_payment_proofs_order_idx
  on public.commerce_order_payment_proofs (tenant_id, order_id, created_at desc);

alter table public.commerce_order_payment_proofs enable row level security;
revoke all on public.commerce_order_payment_proofs from public, anon, authenticated;
grant select, insert, update on public.commerce_order_payment_proofs to service_role;

comment on column public.commerce_orders.delivery_service is
  'Servicio logístico: standard (gratis) o priority (Rosario, entrega en el día, ARS 10000).';
comment on table public.commerce_order_payment_proofs is
  'Comprobantes recibidos por Runia. Su recepción nunca aprueba automáticamente el pago.';
