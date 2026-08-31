-- Lombardo Order Management.
-- Adds an operational, auditable layer over immutable commerce snapshots.
-- Existing storefront/payment snapshots are never rewritten by admin edits.

alter table public.commerce_orders
  add column if not exists order_source text not null default 'storefront',
  add column if not exists management_customer jsonb,
  add column if not exists management_items jsonb,
  add column if not exists management_delivery_method text,
  add column if not exists management_delivery_address jsonb,
  add column if not exists management_items_subtotal numeric(14, 2),
  add column if not exists management_discount_amount numeric(14, 2),
  add column if not exists management_discount_reason text,
  add column if not exists management_subtotal numeric(14, 2),
  add column if not exists management_delivery_cost numeric(14, 2),
  add column if not exists management_total numeric(14, 2),
  add column if not exists management_notes text,
  add column if not exists management_revision integer not null default 0,
  add column if not exists management_updated_at timestamptz,
  add column if not exists management_updated_by uuid;

do $order_management_constraints$
begin
  alter table public.commerce_orders
    drop constraint if exists commerce_orders_order_source_check;
  alter table public.commerce_orders
    add constraint commerce_orders_order_source_check
    check (order_source in ('storefront', 'admin_manual'));

  alter table public.commerce_orders
    drop constraint if exists commerce_orders_management_revision_check;
  alter table public.commerce_orders
    add constraint commerce_orders_management_revision_check
    check (management_revision >= 0);

  alter table public.commerce_orders
    drop constraint if exists commerce_orders_management_snapshot_check;
  alter table public.commerce_orders
    add constraint commerce_orders_management_snapshot_check check (
      (
        management_items is null
        and management_customer is null
        and management_delivery_method is null
        and management_delivery_address is null
        and management_items_subtotal is null
        and management_discount_amount is null
        and management_subtotal is null
        and management_delivery_cost is null
        and management_total is null
        and management_updated_at is null
        and management_updated_by is null
      )
      or
      (
        jsonb_typeof(management_items) = 'array'
        and jsonb_array_length(management_items) between 1 and 50
        and jsonb_typeof(management_customer) = 'object'
        and management_delivery_method in (
          'PICKUP', 'DELIVERY', 'DELIVERY_ROSARIO', 'DELIVERY_SOUTH'
        )
        and (
          (management_delivery_method = 'PICKUP' and management_delivery_address is null)
          or
          (management_delivery_method <> 'PICKUP' and jsonb_typeof(management_delivery_address) = 'object')
        )
        and management_items_subtotal >= 0
        and management_discount_amount >= 0
        and management_discount_amount <= management_items_subtotal
        and management_subtotal = management_items_subtotal - management_discount_amount
        and management_delivery_cost >= 0
        and management_total = management_subtotal + management_delivery_cost
        and (
          management_discount_amount = 0
          or length(btrim(coalesce(management_discount_reason, ''))) between 3 and 500
        )
        and length(coalesce(management_notes, '')) <= 4000
        and management_updated_at is not null
        and management_updated_by is not null
      )
    );

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.commerce_orders'::regclass
      and conname = 'commerce_orders_management_updated_by_fkey'
  ) then
    alter table public.commerce_orders
      add constraint commerce_orders_management_updated_by_fkey
      foreign key (management_updated_by) references auth.users(id) on delete restrict;
  end if;
end;
$order_management_constraints$;

create table if not exists public.commerce_order_management_events (
  id bigint generated always as identity primary key,
  tenant_id text not null,
  order_id bigint not null references public.commerce_orders(id) on delete restrict,
  action text not null,
  operator_user_id uuid not null references auth.users(id) on delete restrict,
  before_snapshot jsonb,
  after_snapshot jsonb not null,
  reason text,
  created_at timestamptz not null default now(),
  constraint commerce_order_management_events_action_check check (
    action in ('manual_created', 'management_updated')
  ),
  constraint commerce_order_management_events_after_check check (
    jsonb_typeof(after_snapshot) = 'object'
  ),
  constraint commerce_order_management_events_before_check check (
    before_snapshot is null or jsonb_typeof(before_snapshot) = 'object'
  )
);

create index if not exists commerce_orders_management_created_idx
  on public.commerce_orders (tenant_id, order_source, created_at desc);
create index if not exists commerce_order_management_events_order_idx
  on public.commerce_order_management_events (tenant_id, order_id, created_at desc);

create or replace function lombardo_private.admin_order_items_subtotal(p_items jsonb)
returns numeric
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_item jsonb;
  v_quantity integer;
  v_unit_price numeric(14, 2);
  v_line_total numeric(14, 2);
  v_subtotal numeric(14, 2) := 0;
begin
  if jsonb_typeof(p_items) <> 'array'
    or jsonb_array_length(p_items) not between 1 and 50 then
    raise exception 'ORDER_MANAGEMENT_ITEMS_INVALID' using errcode = '23514';
  end if;

  for v_item in select value from jsonb_array_elements(p_items)
  loop
    if jsonb_typeof(v_item) <> 'object'
      or coalesce(v_item->>'productId', '') !~
        '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
      or length(btrim(coalesce(v_item->>'sku', ''))) not between 1 and 80
      or length(btrim(coalesce(v_item->>'name', ''))) not between 1 and 240 then
      raise exception 'ORDER_MANAGEMENT_ITEM_INVALID' using errcode = '23514';
    end if;

    begin
      v_quantity := (v_item->>'quantity')::integer;
      v_unit_price := round((v_item->>'unitPrice')::numeric, 2);
      v_line_total := round((v_item->>'lineTotal')::numeric, 2);
    exception when others then
      raise exception 'ORDER_MANAGEMENT_ITEM_AMOUNT_INVALID' using errcode = '23514';
    end;

    if v_quantity not between 1 and 999
      or v_unit_price <= 0
      or v_unit_price > 1000000000
      or v_line_total <> round(v_unit_price * v_quantity, 2) then
      raise exception 'ORDER_MANAGEMENT_ITEM_TOTAL_INVALID' using errcode = '23514';
    end if;
    v_subtotal := v_subtotal + v_line_total;
  end loop;

  return round(v_subtotal, 2);
end;
$$;

create or replace function public.lombardo_admin_create_order(
  p_tenant_id text,
  p_order jsonb,
  p_operator_user_id uuid
)
returns table (order_record jsonb)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_order public.commerce_orders%rowtype;
  v_tenant_record_id uuid;
  v_public_id uuid := gen_random_uuid();
  v_items jsonb := p_order->'items';
  v_customer jsonb := p_order->'customer';
  v_delivery_method text := p_order->>'deliveryMethod';
  v_delivery_address jsonb := nullif(p_order->'deliveryAddress', 'null'::jsonb);
  v_items_subtotal numeric(14, 2);
  v_discount numeric(14, 2) := round(coalesce((p_order->>'discountAmount')::numeric, 0), 2);
  v_delivery_cost numeric(14, 2) := round(coalesce((p_order->>'deliveryCost')::numeric, 0), 2);
  v_subtotal numeric(14, 2);
  v_total numeric(14, 2);
  v_payment_status text := coalesce(nullif(p_order->>'paymentStatus', ''), 'pending');
  v_discount_reason text := nullif(btrim(p_order->>'discountReason'), '');
  v_notes text := nullif(btrim(p_order->>'notes'), '');
begin
  if not exists (
    select 1 from public.lombardo_admin_operators admin_operator
    where admin_operator.tenant_id = p_tenant_id
      and admin_operator.auth_user_id = p_operator_user_id
      and admin_operator.active
  ) then
    raise exception 'operator not authorized' using errcode = '42501';
  end if;

  select tenant.id into v_tenant_record_id
  from public.tenants tenant
  where tenant.slug = p_tenant_id and tenant.status = 'active';
  if not found then raise exception 'tenant not found' using errcode = 'P0002'; end if;

  v_items_subtotal := lombardo_private.admin_order_items_subtotal(v_items);
  if jsonb_typeof(v_customer) <> 'object'
    or v_delivery_method not in (
      'PICKUP', 'DELIVERY', 'DELIVERY_ROSARIO', 'DELIVERY_SOUTH'
    )
    or (v_delivery_method = 'PICKUP' and v_delivery_address is not null)
    or (v_delivery_method <> 'PICKUP' and jsonb_typeof(v_delivery_address) <> 'object')
    or v_discount < 0 or v_discount > v_items_subtotal
    or v_delivery_cost < 0 or v_delivery_cost > 1000000000
    or (v_discount > 0 and length(coalesce(v_discount_reason, '')) not between 3 and 500)
    or length(coalesce(v_notes, '')) > 4000
    or v_payment_status not in ('pending', 'approved') then
    raise exception 'ORDER_MANAGEMENT_SNAPSHOT_INVALID' using errcode = '23514';
  end if;

  v_subtotal := round(v_items_subtotal - v_discount, 2);
  v_total := round(v_subtotal + v_delivery_cost, 2);

  insert into public.commerce_orders (
    public_id, tenant_id, tenant_record_id, customer_account_id,
    pricing_policy, discount_percent, checkout_session_id, idempotency_key,
    items, customer, delivery_method, delivery_address, delivery_cost_mode,
    base_subtotal, pricing_discount_amount, commercial_subtotal,
    coupon_discount_amount, subtotal, delivery_cost, total, currency,
    order_status, payment_status, payment_method, fulfillment_status,
    order_source, management_customer, management_items,
    management_delivery_method, management_delivery_address,
    management_items_subtotal, management_discount_amount,
    management_discount_reason, management_subtotal,
    management_delivery_cost, management_total, management_notes,
    management_revision, management_updated_at, management_updated_by
  ) values (
    v_public_id, p_tenant_id, v_tenant_record_id, null,
    'RETAIL', 0, 'admin:' || v_public_id::text, 'admin:' || v_public_id::text,
    v_items, v_customer, v_delivery_method, v_delivery_address,
    case when v_delivery_cost = 0 then 'FREE' else 'FLAT_RATE' end,
    v_items_subtotal, v_discount, v_subtotal,
    0, v_subtotal, v_delivery_cost, v_total, 'ARS',
    'confirmed', v_payment_status, 'whatsapp_coordination', 'new',
    'admin_manual', v_customer, v_items,
    v_delivery_method, v_delivery_address,
    v_items_subtotal, v_discount,
    v_discount_reason, v_subtotal,
    v_delivery_cost, v_total, v_notes,
    1, now(), p_operator_user_id
  ) returning * into v_order;

  insert into public.commerce_order_management_events (
    tenant_id, order_id, action, operator_user_id,
    before_snapshot, after_snapshot, reason
  ) values (
    p_tenant_id, v_order.id, 'manual_created', p_operator_user_id,
    null,
    jsonb_build_object(
      'customer', v_customer, 'items', v_items,
      'deliveryMethod', v_delivery_method, 'deliveryAddress', v_delivery_address,
      'itemsSubtotal', v_items_subtotal, 'discountAmount', v_discount,
      'discountReason', v_discount_reason, 'subtotal', v_subtotal,
      'deliveryCost', v_delivery_cost, 'total', v_total, 'notes', v_notes,
      'revision', 1
    ),
    v_discount_reason
  );

  return query select to_jsonb(v_order);
end;
$$;

create or replace function public.lombardo_admin_update_order_management(
  p_tenant_id text,
  p_order_id bigint,
  p_expected_revision integer,
  p_management jsonb,
  p_operator_user_id uuid
)
returns table (order_record jsonb)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_order public.commerce_orders%rowtype;
  v_before jsonb;
  v_after jsonb;
  v_items jsonb := p_management->'items';
  v_customer jsonb := p_management->'customer';
  v_delivery_method text := p_management->>'deliveryMethod';
  v_delivery_address jsonb := nullif(p_management->'deliveryAddress', 'null'::jsonb);
  v_items_subtotal numeric(14, 2);
  v_discount numeric(14, 2) := round(coalesce((p_management->>'discountAmount')::numeric, 0), 2);
  v_delivery_cost numeric(14, 2) := round(coalesce((p_management->>'deliveryCost')::numeric, 0), 2);
  v_subtotal numeric(14, 2);
  v_total numeric(14, 2);
  v_discount_reason text := nullif(btrim(p_management->>'discountReason'), '');
  v_notes text := nullif(btrim(p_management->>'notes'), '');
begin
  if not exists (
    select 1 from public.lombardo_admin_operators admin_operator
    where admin_operator.tenant_id = p_tenant_id
      and admin_operator.auth_user_id = p_operator_user_id
      and admin_operator.active
  ) then
    raise exception 'operator not authorized' using errcode = '42501';
  end if;

  select * into v_order from public.commerce_orders
  where id = p_order_id and tenant_id = p_tenant_id
  for update;
  if not found then raise exception 'order not found' using errcode = 'P0002'; end if;
  if v_order.management_revision <> p_expected_revision then
    raise exception 'order management revision changed' using errcode = '40001';
  end if;

  v_items_subtotal := lombardo_private.admin_order_items_subtotal(v_items);
  if jsonb_typeof(v_customer) <> 'object'
    or v_delivery_method not in (
      'PICKUP', 'DELIVERY', 'DELIVERY_ROSARIO', 'DELIVERY_SOUTH'
    )
    or (v_delivery_method = 'PICKUP' and v_delivery_address is not null)
    or (v_delivery_method <> 'PICKUP' and jsonb_typeof(v_delivery_address) <> 'object')
    or v_discount < 0 or v_discount > v_items_subtotal
    or v_delivery_cost < 0 or v_delivery_cost > 1000000000
    or (v_discount > 0 and length(coalesce(v_discount_reason, '')) not between 3 and 500)
    or length(coalesce(v_notes, '')) > 4000 then
    raise exception 'ORDER_MANAGEMENT_SNAPSHOT_INVALID' using errcode = '23514';
  end if;

  v_subtotal := round(v_items_subtotal - v_discount, 2);
  v_total := round(v_subtotal + v_delivery_cost, 2);
  v_before := jsonb_build_object(
    'customer', coalesce(v_order.management_customer, v_order.customer),
    'items', coalesce(v_order.management_items, v_order.items),
    'deliveryMethod', coalesce(v_order.management_delivery_method, v_order.delivery_method),
    'deliveryAddress', coalesce(v_order.management_delivery_address, v_order.delivery_address),
    'itemsSubtotal', coalesce(v_order.management_items_subtotal, v_order.subtotal),
    'discountAmount', coalesce(v_order.management_discount_amount, 0),
    'discountReason', v_order.management_discount_reason,
    'subtotal', coalesce(v_order.management_subtotal, v_order.subtotal),
    'deliveryCost', coalesce(v_order.management_delivery_cost, v_order.delivery_cost),
    'total', coalesce(v_order.management_total, v_order.total),
    'notes', v_order.management_notes,
    'revision', v_order.management_revision
  );
  v_after := jsonb_build_object(
    'customer', v_customer, 'items', v_items,
    'deliveryMethod', v_delivery_method, 'deliveryAddress', v_delivery_address,
    'itemsSubtotal', v_items_subtotal, 'discountAmount', v_discount,
    'discountReason', v_discount_reason, 'subtotal', v_subtotal,
    'deliveryCost', v_delivery_cost, 'total', v_total, 'notes', v_notes,
    'revision', v_order.management_revision + 1
  );

  update public.commerce_orders set
    management_customer = v_customer,
    management_items = v_items,
    management_delivery_method = v_delivery_method,
    management_delivery_address = v_delivery_address,
    management_items_subtotal = v_items_subtotal,
    management_discount_amount = v_discount,
    management_discount_reason = v_discount_reason,
    management_subtotal = v_subtotal,
    management_delivery_cost = v_delivery_cost,
    management_total = v_total,
    management_notes = v_notes,
    management_revision = management_revision + 1,
    management_updated_at = now(),
    management_updated_by = p_operator_user_id
  where id = p_order_id and tenant_id = p_tenant_id
  returning * into v_order;

  insert into public.commerce_order_management_events (
    tenant_id, order_id, action, operator_user_id,
    before_snapshot, after_snapshot, reason
  ) values (
    p_tenant_id, p_order_id, 'management_updated', p_operator_user_id,
    v_before, v_after, v_discount_reason
  );

  return query select to_jsonb(v_order);
end;
$$;

alter table public.commerce_order_management_events enable row level security;
alter table public.commerce_order_management_events force row level security;

revoke all on table public.commerce_order_management_events
  from public, anon, authenticated;
revoke all on function lombardo_private.admin_order_items_subtotal(jsonb)
  from public, anon, authenticated;
revoke all on function public.lombardo_admin_create_order(text, jsonb, uuid)
  from public, anon, authenticated;
revoke all on function public.lombardo_admin_update_order_management(text, bigint, integer, jsonb, uuid)
  from public, anon, authenticated;

grant select, insert on table public.commerce_order_management_events to service_role;
grant usage, select on sequence public.commerce_order_management_events_id_seq to service_role;
grant execute on function lombardo_private.admin_order_items_subtotal(jsonb) to service_role;
grant execute on function public.lombardo_admin_create_order(text, jsonb, uuid) to service_role;
grant execute on function public.lombardo_admin_update_order_management(text, bigint, integer, jsonb, uuid) to service_role;

comment on column public.commerce_orders.order_source is
  'Origin of the order. Admin-created orders are distinct from storefront checkout orders.';
comment on column public.commerce_orders.management_items is
  'Server-validated operational override. The immutable commerce/payment snapshot stays intact.';
comment on table public.commerce_order_management_events is
  'Append-only audit trail for manual creation and operational order edits.';
