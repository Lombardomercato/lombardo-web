-- Prepared for the Runia/Supabase TEST project. Do not apply to production.
-- Customer and order data is server-only: RLS is enabled and no public policy exists.

create schema if not exists lombardo_private;
revoke all on schema lombardo_private from public, anon, authenticated;

create table if not exists public.commerce_orders (
  id bigint generated always as identity primary key,
  public_id uuid not null default gen_random_uuid(),
  tenant_id text not null,
  customer jsonb not null,
  items jsonb not null,
  subtotal numeric(14, 2) not null,
  delivery_cost numeric(14, 2) not null,
  total numeric(14, 2) not null,
  currency text not null default 'ARS',
  delivery_method text not null,
  delivery_address jsonb,
  delivery_cost_mode text not null,
  order_status text not null default 'pending_payment',
  payment_status text not null default 'pending',
  checkout_session_id text not null,
  idempotency_key text not null,
  payment_preference_id text,
  payment_checkout_url text,
  payment_provider_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint commerce_orders_public_id_key unique (public_id),
  constraint commerce_orders_session_key unique (tenant_id, checkout_session_id),
  constraint commerce_orders_idempotency_key unique (tenant_id, idempotency_key),
  constraint commerce_orders_amounts_check check (
    subtotal >= 0 and delivery_cost >= 0 and total = subtotal + delivery_cost
  ),
  constraint commerce_orders_currency_check check (currency = 'ARS'),
  constraint commerce_orders_delivery_method_check check (
    delivery_method in ('PICKUP', 'DELIVERY')
  ),
  constraint commerce_orders_delivery_cost_mode_check check (
    delivery_cost_mode in ('FREE', 'FLAT_RATE', 'TO_BE_CONFIRMED')
  ),
  constraint commerce_orders_order_status_check check (
    order_status in ('pending_payment', 'confirmed', 'cancelled')
  ),
  constraint commerce_orders_payment_status_check check (
    payment_status in ('pending', 'approved', 'rejected', 'cancelled', 'refunded')
  ),
  constraint commerce_orders_items_check check (
    jsonb_typeof(items) = 'array' and jsonb_array_length(items) between 1 and 50
  ),
  constraint commerce_orders_customer_check check (jsonb_typeof(customer) = 'object'),
  constraint commerce_orders_delivery_address_check check (
    (delivery_method = 'PICKUP' and delivery_address is null)
    or
    (delivery_method = 'DELIVERY' and jsonb_typeof(delivery_address) = 'object')
  )
);

create index if not exists commerce_orders_tenant_status_created_idx
  on public.commerce_orders (tenant_id, order_status, created_at desc);
create index if not exists commerce_orders_tenant_payment_created_idx
  on public.commerce_orders (tenant_id, payment_status, created_at desc);
create unique index if not exists commerce_orders_provider_payment_key
  on public.commerce_orders (tenant_id, payment_provider_id)
  where payment_provider_id is not null;
create unique index if not exists commerce_orders_preference_key
  on public.commerce_orders (tenant_id, payment_preference_id)
  where payment_preference_id is not null;

create table if not exists public.commerce_payment_events (
  id bigint generated always as identity primary key,
  tenant_id text not null,
  order_id bigint not null references public.commerce_orders(id) on delete restrict,
  provider text not null,
  provider_event_id text not null,
  provider_payment_id text not null,
  provider_status text not null,
  payload jsonb not null,
  processed_at timestamptz,
  created_at timestamptz not null default now(),
  constraint commerce_payment_events_provider_check check (provider = 'mercado_pago'),
  constraint commerce_payment_events_payload_check check (jsonb_typeof(payload) = 'object'),
  constraint commerce_payment_events_idempotency_key unique
    (tenant_id, provider, provider_event_id)
);

create index if not exists commerce_payment_events_order_id_idx
  on public.commerce_payment_events (order_id);
create index if not exists commerce_payment_events_payment_idx
  on public.commerce_payment_events (tenant_id, provider_payment_id, created_at desc);

create or replace function lombardo_private.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists commerce_orders_set_updated_at on public.commerce_orders;
create trigger commerce_orders_set_updated_at
before update on public.commerce_orders
for each row execute function lombardo_private.set_updated_at();

-- The event insert, order transition and processed marker share one transaction.
-- SECURITY INVOKER plus explicit service_role-only EXECUTE keeps the RPC server-only.
create or replace function public.lombardo_apply_payment_event(
  p_tenant_id text,
  p_order_id text,
  p_provider_event_id text,
  p_provider_payment_id text,
  p_provider_status text,
  p_payload jsonb,
  p_payment_status text,
  p_order_status text
)
returns table (duplicate boolean, order_record jsonb)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_order_id bigint;
  v_event_id bigint;
  v_existing_event public.commerce_payment_events%rowtype;
  v_order public.commerce_orders%rowtype;
begin
  begin
    v_order_id := p_order_id::bigint;
  exception when invalid_text_representation or numeric_value_out_of_range then
    raise exception 'invalid order id' using errcode = '22023';
  end;

  select * into v_order
  from public.commerce_orders
  where id = v_order_id and tenant_id = p_tenant_id;

  if not found then
    raise exception 'order not found' using errcode = 'P0002';
  end if;

  insert into public.commerce_payment_events (
    tenant_id,
    order_id,
    provider,
    provider_event_id,
    provider_payment_id,
    provider_status,
    payload
  ) values (
    p_tenant_id,
    v_order_id,
    'mercado_pago',
    p_provider_event_id,
    p_provider_payment_id,
    p_provider_status,
    p_payload
  )
  on conflict (tenant_id, provider, provider_event_id) do nothing
  returning id into v_event_id;

  if v_event_id is null then
    select * into v_existing_event
    from public.commerce_payment_events
    where tenant_id = p_tenant_id
      and provider = 'mercado_pago'
      and provider_event_id = p_provider_event_id;

    if not found
      or v_existing_event.order_id <> v_order_id
      or v_existing_event.provider_payment_id <> p_provider_payment_id then
      raise exception 'payment event mapping mismatch' using errcode = '22023';
    end if;

    select * into v_order
    from public.commerce_orders
    where id = v_order_id and tenant_id = p_tenant_id;

    return query select true, to_jsonb(v_order);
    return;
  end if;

  update public.commerce_orders
  set
    payment_status = p_payment_status,
    order_status = p_order_status,
    payment_provider_id = p_provider_payment_id
  where id = v_order_id and tenant_id = p_tenant_id
  returning * into v_order;

  update public.commerce_payment_events
  set processed_at = now()
  where id = v_event_id;

  return query select false, to_jsonb(v_order);
end;
$$;

alter table public.commerce_orders enable row level security;
alter table public.commerce_orders force row level security;
alter table public.commerce_payment_events enable row level security;
alter table public.commerce_payment_events force row level security;

revoke all on table public.commerce_orders from anon, authenticated;
revoke all on table public.commerce_payment_events from anon, authenticated;
revoke all on function public.lombardo_apply_payment_event(
  text, text, text, text, text, jsonb, text, text
) from public, anon, authenticated;
grant usage on schema public to service_role;
grant select, insert, update on table public.commerce_orders to service_role;
grant select, insert, update on table public.commerce_payment_events to service_role;
grant execute on function public.lombardo_apply_payment_event(
  text, text, text, text, text, jsonb, text, text
) to service_role;
grant usage, select on sequence public.commerce_orders_id_seq to service_role;
grant usage, select on sequence public.commerce_payment_events_id_seq to service_role;

comment on table public.commerce_orders is
  'Server-only Lombardo order snapshots. Never trust browser totals.';
comment on table public.commerce_payment_events is
  'Idempotency and audit trail for verified Mercado Pago webhooks.';
