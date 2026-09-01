-- Lombardo Admin V1. Run against the Runia project that owns commerce_orders.
-- All admin data stays server-only. No browser role receives table or RPC access.

create table if not exists public.lombardo_admin_operators (
  id uuid primary key default gen_random_uuid(),
  tenant_id text not null,
  auth_user_id uuid not null references auth.users(id) on delete cascade,
  display_name text not null,
  role text not null default 'operator',
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint lombardo_admin_operators_name_check check (btrim(display_name) <> ''),
  constraint lombardo_admin_operators_role_check check (role in ('admin', 'operator')),
  constraint lombardo_admin_operators_user_key unique (tenant_id, auth_user_id)
);

create table if not exists public.lombardo_admin_sessions (
  id uuid primary key default gen_random_uuid(),
  tenant_id text not null,
  operator_id uuid not null references public.lombardo_admin_operators(id) on delete cascade,
  token_hash text not null unique,
  expires_at timestamptz not null,
  last_seen_at timestamptz not null default now(),
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  constraint lombardo_admin_sessions_token_hash_check check (
    token_hash ~ '^[a-f0-9]{64}$'
  )
);

alter table public.commerce_orders
  add column if not exists fulfillment_status text,
  add column if not exists fulfillment_updated_at timestamptz,
  add column if not exists fulfillment_updated_by uuid,
  add column if not exists confirmed_at timestamptz,
  add column if not exists preparing_at timestamptz,
  add column if not exists ready_at timestamptz,
  add column if not exists delivered_at timestamptz,
  add column if not exists cancelled_at timestamptz;

-- Defaults apply only to orders created after this migration. Existing orders remain
-- physically unchanged and are interpreted from order_status by the Admin read model.
alter table public.commerce_orders
  alter column fulfillment_status set default 'new',
  alter column fulfillment_updated_at set default now();

do $admin_constraints$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.commerce_orders'::regclass
      and conname = 'commerce_orders_fulfillment_status_check'
  ) then
    alter table public.commerce_orders
      add constraint commerce_orders_fulfillment_status_check check (
        fulfillment_status in (
          'new', 'confirmed', 'preparing', 'ready', 'delivered', 'cancelled'
        )
      );
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.commerce_orders'::regclass
      and conname = 'commerce_orders_fulfillment_updated_by_fkey'
  ) then
    alter table public.commerce_orders
      add constraint commerce_orders_fulfillment_updated_by_fkey
      foreign key (fulfillment_updated_by) references auth.users(id) on delete set null;
  end if;
end;
$admin_constraints$;

create table if not exists public.commerce_order_fulfillment_events (
  id bigint generated always as identity primary key,
  tenant_id text not null,
  order_id bigint not null references public.commerce_orders(id) on delete restrict,
  from_status text not null,
  to_status text not null,
  operator_user_id uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  constraint commerce_order_fulfillment_events_from_check check (
    from_status in ('new', 'confirmed', 'preparing', 'ready', 'delivered', 'cancelled')
  ),
  constraint commerce_order_fulfillment_events_to_check check (
    to_status in ('new', 'confirmed', 'preparing', 'ready', 'delivered', 'cancelled')
  ),
  constraint commerce_order_fulfillment_events_change_check check (
    from_status <> to_status
  )
);

create index if not exists commerce_orders_tenant_fulfillment_created_idx
  on public.commerce_orders (tenant_id, fulfillment_status, created_at desc);
create index if not exists lombardo_admin_sessions_active_idx
  on public.lombardo_admin_sessions (token_hash, expires_at)
  where revoked_at is null;
create index if not exists commerce_order_fulfillment_events_order_idx
  on public.commerce_order_fulfillment_events (tenant_id, order_id, created_at desc);

create or replace function public.lombardo_transition_fulfillment_status(
  p_tenant_id text,
  p_order_id bigint,
  p_expected_status text,
  p_target_status text,
  p_operator_user_id uuid
)
returns table (changed boolean, order_record jsonb)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_order public.commerce_orders%rowtype;
  v_now timestamptz := now();
  v_current_status text;
begin
  if not exists (
    select 1
    from public.lombardo_admin_operators operator
    where operator.tenant_id = p_tenant_id
      and operator.auth_user_id = p_operator_user_id
      and operator.active
  ) then
    raise exception 'operator not authorized' using errcode = '42501';
  end if;

  select * into v_order
  from public.commerce_orders
  where id = p_order_id and tenant_id = p_tenant_id
  for update;

  if not found then
    raise exception 'order not found' using errcode = 'P0002';
  end if;

  v_current_status := coalesce(
    v_order.fulfillment_status,
    case
      when v_order.order_status = 'cancelled' then 'cancelled'
      when v_order.order_status = 'confirmed' then 'confirmed'
      else 'new'
    end
  );

  if v_current_status = p_target_status then
    return query select false, to_jsonb(v_order);
    return;
  end if;

  if v_current_status <> p_expected_status then
    raise exception 'order status changed' using errcode = '40001';
  end if;

  if p_target_status not in (
    'new', 'confirmed', 'preparing', 'ready', 'delivered', 'cancelled'
  ) or v_current_status = 'cancelled' then
    raise exception 'invalid fulfillment transition' using errcode = '22023';
  end if;

  if p_target_status = 'cancelled' and v_order.payment_status = 'approved' then
    raise exception 'approved order requires refund workflow' using errcode = '22023';
  end if;

  update public.commerce_orders
  set
    fulfillment_status = p_target_status,
    fulfillment_updated_at = v_now,
    fulfillment_updated_by = p_operator_user_id,
    confirmed_at = case
      when p_target_status = 'new' then null
      when p_target_status = 'confirmed' then v_now
      else confirmed_at
    end,
    preparing_at = case
      when p_target_status in ('new', 'confirmed') then null
      when p_target_status = 'preparing' then v_now
      else preparing_at
    end,
    ready_at = case
      when p_target_status in ('new', 'confirmed', 'preparing') then null
      when p_target_status = 'ready' then v_now
      else ready_at
    end,
    delivered_at = case
      when p_target_status = 'delivered' then v_now
      else null
    end,
    cancelled_at = case
      when p_target_status = 'cancelled' then v_now
      else null
    end,
    order_status = case
      when p_target_status = 'cancelled' then 'cancelled'
      else order_status
    end
  where id = p_order_id and tenant_id = p_tenant_id
  returning * into v_order;

  insert into public.commerce_order_fulfillment_events (
    tenant_id,
    order_id,
    from_status,
    to_status,
    operator_user_id
  ) values (
    p_tenant_id,
    p_order_id,
    v_current_status,
    p_target_status,
    p_operator_user_id
  );

  return query select true, to_jsonb(v_order);
end;
$$;

alter table public.lombardo_admin_operators enable row level security;
alter table public.lombardo_admin_operators force row level security;
alter table public.lombardo_admin_sessions enable row level security;
alter table public.lombardo_admin_sessions force row level security;
alter table public.commerce_order_fulfillment_events enable row level security;
alter table public.commerce_order_fulfillment_events force row level security;

revoke all on table public.lombardo_admin_operators from public, anon, authenticated;
revoke all on table public.lombardo_admin_sessions from public, anon, authenticated;
revoke all on table public.commerce_order_fulfillment_events from public, anon, authenticated;
revoke all on function public.lombardo_transition_fulfillment_status(
  text, bigint, text, text, uuid
) from public, anon, authenticated;

grant select, insert, update on table public.lombardo_admin_operators to service_role;
grant select, insert, update, delete on table public.lombardo_admin_sessions to service_role;
grant select, insert on table public.commerce_order_fulfillment_events to service_role;
grant execute on function public.lombardo_transition_fulfillment_status(
  text, bigint, text, text, uuid
) to service_role;
grant usage, select on sequence public.commerce_order_fulfillment_events_id_seq
  to service_role;

comment on column public.commerce_orders.fulfillment_status is
  'Operational progress for Lombardo staff. Independent from payment_status.';
comment on table public.lombardo_admin_operators is
  'Authorized Lombardo operators backed by Supabase Auth users.';
comment on table public.lombardo_admin_sessions is
  'Revocable opaque server sessions. Only a SHA-256 token hash is persisted.';
comment on table public.commerce_order_fulfillment_events is
  'Audit trail for validated operational order transitions.';
