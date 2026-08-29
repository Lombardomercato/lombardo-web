-- HITO 3: tenant-safe promotion engine, immutable order snapshots and
-- transactional coupon reservations. No promotion is exposed to the browser.

create table if not exists public.commerce_promotions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  code text not null,
  name text not null,
  description text not null default '',
  status text not null default 'INACTIVE',
  discount_type text not null,
  discount_value numeric(14, 2) not null,
  start_at timestamptz,
  end_at timestamptz,
  minimum_order_amount numeric(14, 2) not null default 0,
  max_total_uses integer,
  max_uses_per_customer integer,
  applies_to text not null default 'ALL',
  customer_scope text not null default 'ALL',
  stackable boolean not null default false,
  first_order_only boolean not null default false,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint commerce_promotions_code_check check (
    code = upper(btrim(code)) and code ~ '^[A-Z0-9][A-Z0-9_-]{2,39}$'
  ),
  constraint commerce_promotions_name_check check (btrim(name) <> ''),
  constraint commerce_promotions_status_check check (status in ('ACTIVE', 'INACTIVE')),
  constraint commerce_promotions_discount_type_check check (
    discount_type in ('PERCENTAGE', 'FIXED_AMOUNT')
  ),
  constraint commerce_promotions_discount_value_check check (
    discount_value > 0
    and (discount_type <> 'PERCENTAGE' or discount_value < 100)
  ),
  constraint commerce_promotions_dates_check check (end_at is null or start_at is null or end_at > start_at),
  constraint commerce_promotions_minimum_check check (minimum_order_amount >= 0),
  constraint commerce_promotions_total_limit_check check (max_total_uses is null or max_total_uses > 0),
  constraint commerce_promotions_customer_limit_check check (max_uses_per_customer is null or max_uses_per_customer > 0),
  constraint commerce_promotions_applies_to_check check (applies_to in ('ALL', 'PRODUCTS', 'CATEGORIES')),
  constraint commerce_promotions_customer_scope_check check (
    customer_scope in ('ALL', 'RETAIL', 'WHOLESALE', 'BUSINESS', 'CUSTOM', 'SPECIFIC_CUSTOMERS')
  ),
  constraint commerce_promotions_tenant_id_id_key unique (tenant_id, id)
);

create unique index if not exists commerce_promotions_tenant_code_key
  on public.commerce_promotions (tenant_id, upper(code));
create index if not exists commerce_promotions_admin_idx
  on public.commerce_promotions (tenant_id, status, start_at, end_at, updated_at desc);
create index if not exists commerce_promotions_created_by_idx
  on public.commerce_promotions (created_by) where created_by is not null;

create table if not exists public.commerce_promotion_products (
  tenant_id uuid not null,
  promotion_id uuid not null,
  product_id uuid not null,
  created_at timestamptz not null default now(),
  primary key (tenant_id, promotion_id, product_id),
  foreign key (tenant_id, promotion_id)
    references public.commerce_promotions(tenant_id, id) on delete cascade,
  foreign key (product_id)
    references public.supplier_products(id) on delete cascade
);

create table if not exists public.commerce_promotion_categories (
  tenant_id uuid not null,
  promotion_id uuid not null,
  category_slug text not null,
  created_at timestamptz not null default now(),
  primary key (tenant_id, promotion_id, category_slug),
  foreign key (tenant_id, promotion_id)
    references public.commerce_promotions(tenant_id, id) on delete cascade,
  constraint commerce_promotion_categories_slug_check check (
    category_slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'
  )
);

create index if not exists commerce_promotion_products_product_idx
  on public.commerce_promotion_products (product_id);

create table if not exists public.commerce_promotion_customers (
  tenant_id uuid not null,
  promotion_id uuid not null,
  customer_account_id uuid not null,
  created_at timestamptz not null default now(),
  primary key (tenant_id, promotion_id, customer_account_id),
  foreign key (tenant_id, promotion_id)
    references public.commerce_promotions(tenant_id, id) on delete cascade,
  foreign key (tenant_id, customer_account_id)
    references public.customer_accounts(tenant_id, id) on delete cascade
);

alter table public.commerce_orders
  add column if not exists commercial_subtotal numeric(14, 2),
  add column if not exists promotion_id uuid,
  add column if not exists coupon_code text,
  add column if not exists coupon_discount_type text,
  add column if not exists coupon_discount_value numeric(14, 2),
  add column if not exists coupon_discount_amount numeric(14, 2),
  add column if not exists coupon_stackable boolean;

update public.commerce_orders
set commercial_subtotal = coalesce(commercial_subtotal, subtotal),
    coupon_discount_amount = coalesce(coupon_discount_amount, 0)
where commercial_subtotal is null or coupon_discount_amount is null;

alter table public.commerce_orders
  alter column commercial_subtotal set not null,
  alter column coupon_discount_amount set default 0,
  alter column coupon_discount_amount set not null;

create or replace function lombardo_private.prepare_customer_order_pricing()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_tenant_id uuid;
  v_policy text;
  v_discount numeric;
begin
  select tenant.id into v_tenant_id from public.tenants tenant
  where tenant.slug = new.tenant_id and tenant.status = 'active';
  if not found then raise exception using errcode = '23503', message = 'HITO2_ORDER_TENANT_NOT_FOUND'; end if;
  if new.tenant_record_id is null then new.tenant_record_id := v_tenant_id;
  elsif new.tenant_record_id <> v_tenant_id then raise exception using errcode = '23503', message = 'HITO2_ORDER_TENANT_MISMATCH'; end if;

  if new.customer_account_id is null then
    new.pricing_policy := 'RETAIL';
    new.discount_percent := 0;
    new.base_subtotal := coalesce(new.base_subtotal, new.subtotal);
    new.pricing_discount_amount := coalesce(new.pricing_discount_amount, 0);
  else
    select account.pricing_policy, account.discount_percent into v_policy, v_discount
    from public.customer_accounts account
    where account.tenant_id = v_tenant_id and account.id = new.customer_account_id
      and account.status = 'active' and account.auth_user_id is not null;
    if not found then raise exception using errcode = '23503', message = 'HITO2_ORDER_CUSTOMER_NOT_ACTIVE'; end if;
    new.pricing_policy := v_policy;
    new.discount_percent := v_discount;
    if new.base_subtotal is null then
      if v_discount = 0 then new.base_subtotal := new.subtotal;
      else raise exception using errcode = '23514', message = 'HITO2_ORDER_BASE_SUBTOTAL_REQUIRED'; end if;
    end if;
    if new.pricing_discount_amount is null then
      if v_discount = 0 then new.pricing_discount_amount := 0;
      else raise exception using errcode = '23514', message = 'HITO2_ORDER_DISCOUNT_SNAPSHOT_REQUIRED'; end if;
    end if;
  end if;
  new.commercial_subtotal := coalesce(new.commercial_subtotal, new.subtotal);
  new.coupon_discount_amount := coalesce(new.coupon_discount_amount, 0);
  return new;
end;
$$;

do $constraints$
begin
  if not exists (select 1 from pg_constraint where conrelid = 'public.commerce_orders'::regclass and conname = 'commerce_orders_promotion_fkey') then
    alter table public.commerce_orders add constraint commerce_orders_promotion_fkey
      foreign key (tenant_record_id, promotion_id)
      references public.commerce_promotions(tenant_id, id) on delete restrict;
  end if;
  alter table public.commerce_orders drop constraint if exists commerce_orders_pricing_amounts_check;
  alter table public.commerce_orders drop constraint if exists commerce_orders_promotion_snapshot_check;
  alter table public.commerce_orders add constraint commerce_orders_promotion_snapshot_check check (
    base_subtotal >= 0
    and pricing_discount_amount >= 0
    and commercial_subtotal = base_subtotal - pricing_discount_amount
    and coupon_discount_amount >= 0
    and coupon_discount_amount <= commercial_subtotal
    and subtotal = commercial_subtotal - coupon_discount_amount
    and (
      (promotion_id is null and coupon_code is null and coupon_discount_type is null
        and coupon_discount_value is null and coupon_discount_amount = 0 and coupon_stackable is null)
      or
      (promotion_id is not null and coupon_code is not null
        and coupon_discount_type in ('PERCENTAGE', 'FIXED_AMOUNT')
        and coupon_discount_value > 0 and coupon_discount_amount > 0
        and coupon_stackable is not null)
    )
  );
end;
$constraints$;

create table if not exists public.commerce_promotion_redemptions (
  id bigint generated always as identity primary key,
  tenant_id uuid not null,
  promotion_id uuid not null,
  order_id bigint not null,
  customer_account_id uuid,
  customer_key text not null,
  status text not null default 'RESERVED',
  reservation_expires_at timestamptz not null,
  reserved_at timestamptz not null default now(),
  consumed_at timestamptz,
  released_at timestamptz,
  coupon_code text not null,
  discount_amount numeric(14, 2) not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (tenant_id, promotion_id)
    references public.commerce_promotions(tenant_id, id) on delete restrict,
  foreign key (tenant_id, customer_account_id)
    references public.customer_accounts(tenant_id, id) on delete restrict,
  foreign key (order_id) references public.commerce_orders(id) on delete restrict,
  constraint commerce_promotion_redemptions_status_check check (status in ('RESERVED', 'CONSUMED', 'RELEASED')),
  constraint commerce_promotion_redemptions_amount_check check (discount_amount > 0),
  constraint commerce_promotion_redemptions_state_check check (
    (status = 'RESERVED' and consumed_at is null and released_at is null)
    or (status = 'CONSUMED' and consumed_at is not null and released_at is null)
    or (status = 'RELEASED' and consumed_at is null and released_at is not null)
  ),
  constraint commerce_promotion_redemptions_order_key unique (tenant_id, order_id)
);

create index if not exists commerce_promotion_redemptions_limits_idx
  on public.commerce_promotion_redemptions (tenant_id, promotion_id, status, reservation_expires_at);
create index if not exists commerce_promotion_redemptions_customer_idx
  on public.commerce_promotion_redemptions (tenant_id, promotion_id, customer_key, status, reservation_expires_at);
create index if not exists commerce_promotion_redemptions_order_idx
  on public.commerce_promotion_redemptions (order_id);
create index if not exists commerce_promotion_redemptions_account_idx
  on public.commerce_promotion_redemptions (tenant_id, customer_account_id)
  where customer_account_id is not null;
create index if not exists commerce_orders_promotion_idx
  on public.commerce_orders (tenant_record_id, promotion_id, created_at desc)
  where promotion_id is not null;

create trigger commerce_promotions_set_updated_at
before update on public.commerce_promotions
for each row execute function lombardo_private.set_updated_at();
create trigger commerce_promotion_redemptions_set_updated_at
before update on public.commerce_promotion_redemptions
for each row execute function lombardo_private.set_updated_at();

create or replace function lombardo_private.check_promotion_product_tenant()
returns trigger language plpgsql set search_path = '' as $$
begin
  if not exists (
    select 1 from public.supplier_products product
    join public.suppliers supplier on supplier.id = product.supplier_id
    where product.id = new.product_id and supplier.tenant_id = new.tenant_id
  ) then raise exception using errcode = '23503', message = 'PROMOTION_PRODUCT_TENANT_MISMATCH'; end if;
  return new;
end;
$$;
create trigger commerce_promotion_products_tenant_check
before insert or update on public.commerce_promotion_products
for each row execute function lombardo_private.check_promotion_product_tenant();

create or replace function lombardo_private.protect_customer_order_pricing()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.tenant_id is distinct from old.tenant_id
    or new.tenant_record_id is distinct from old.tenant_record_id
    or new.customer_account_id is distinct from old.customer_account_id
    or new.pricing_policy is distinct from old.pricing_policy
    or new.discount_percent is distinct from old.discount_percent
    or new.base_subtotal is distinct from old.base_subtotal
    or new.pricing_discount_amount is distinct from old.pricing_discount_amount
    or new.commercial_subtotal is distinct from old.commercial_subtotal
    or new.promotion_id is distinct from old.promotion_id
    or new.coupon_code is distinct from old.coupon_code
    or new.coupon_discount_type is distinct from old.coupon_discount_type
    or new.coupon_discount_value is distinct from old.coupon_discount_value
    or new.coupon_discount_amount is distinct from old.coupon_discount_amount
    or new.coupon_stackable is distinct from old.coupon_stackable
    or new.subtotal is distinct from old.subtotal
    or new.items is distinct from old.items then
    raise exception using errcode = '23514', message = 'HITO3_ORDER_PRICING_SNAPSHOT_IMMUTABLE';
  end if;
  return new;
end;
$$;

create or replace function public.lombardo_create_order_with_promotion(p_order jsonb)
returns table (reused boolean, order_record jsonb)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_promotion public.commerce_promotions%rowtype;
  v_order public.commerce_orders%rowtype;
  v_tenant uuid;
  v_customer_key text;
  v_total_uses integer;
  v_customer_uses integer;
  v_valid_orders integer;
  v_eligible_subtotal numeric(14,2);
  v_snapshot_discount numeric(14,2);
  v_account_policy text := 'RETAIL';
begin
  v_tenant := (p_order->>'tenant_record_id')::uuid;
  select * into v_order from public.commerce_orders
  where tenant_id = p_order->>'tenant_id'
    and (checkout_session_id = p_order->>'checkout_session_id'
      or idempotency_key = p_order->>'idempotency_key')
  limit 1;
  if found then
    return query select true, to_jsonb(v_order);
    return;
  end if;
  select * into v_promotion from public.commerce_promotions
  where tenant_id = v_tenant
    and id = (p_order->>'promotion_id')::uuid
    and code = upper(btrim(p_order->>'coupon_code'))
  for update;
  if not found then raise exception using errcode = 'P0002', message = 'PROMOTION_NOT_FOUND'; end if;
  select * into v_order from public.commerce_orders
  where tenant_id = p_order->>'tenant_id'
    and (checkout_session_id = p_order->>'checkout_session_id'
      or idempotency_key = p_order->>'idempotency_key')
  limit 1;
  if found then
    return query select true, to_jsonb(v_order);
    return;
  end if;
  if v_promotion.status <> 'ACTIVE' then raise exception using errcode = '23514', message = 'PROMOTION_INACTIVE'; end if;
  if v_promotion.start_at is not null and now() < v_promotion.start_at then raise exception using errcode = '23514', message = 'PROMOTION_SCHEDULED'; end if;
  if v_promotion.end_at is not null and now() >= v_promotion.end_at then raise exception using errcode = '23514', message = 'PROMOTION_EXPIRED'; end if;
  if (p_order->>'commercial_subtotal')::numeric < v_promotion.minimum_order_amount then
    raise exception using errcode = '23514', message = 'PROMOTION_MINIMUM';
  end if;
  if nullif(p_order->>'customer_account_id', '') is not null then
    select pricing_policy into v_account_policy from public.customer_accounts
    where tenant_id = v_tenant and id = (p_order->>'customer_account_id')::uuid
      and status = 'active' and auth_user_id is not null;
    if not found then raise exception using errcode = '23503', message = 'HITO2_ORDER_CUSTOMER_NOT_ACTIVE'; end if;
  end if;
  if p_order->>'pricing_policy' <> v_account_policy then
    raise exception using errcode = '23514', message = 'PROMOTION_PRICING_IDENTITY_MISMATCH';
  end if;
  if v_account_policy <> 'RETAIL' and not v_promotion.stackable then
    raise exception using errcode = '23514', message = 'PROMOTION_NOT_STACKABLE';
  end if;

  v_customer_key := case
    when nullif(p_order->>'customer_account_id', '') is not null
      then 'account:' || (p_order->>'customer_account_id')
    else 'email:' || lower(btrim(p_order#>>'{customer,email}'))
  end;

  if v_promotion.customer_scope = 'SPECIFIC_CUSTOMERS' and not exists (
    select 1 from public.commerce_promotion_customers c
    where c.tenant_id = v_tenant and c.promotion_id = v_promotion.id
      and c.customer_account_id = nullif(p_order->>'customer_account_id', '')::uuid
  ) then raise exception using errcode = '23514', message = 'PROMOTION_ACCOUNT_SCOPE'; end if;
  if v_promotion.customer_scope = 'RETAIL' and v_account_policy <> 'RETAIL' then raise exception using errcode = '23514', message = 'PROMOTION_ACCOUNT_SCOPE'; end if;
  if v_promotion.customer_scope = 'WHOLESALE' and v_account_policy <> 'WHOLESALE' then raise exception using errcode = '23514', message = 'PROMOTION_ACCOUNT_SCOPE'; end if;
  if v_promotion.customer_scope = 'BUSINESS' and v_account_policy <> 'BUSINESS' then raise exception using errcode = '23514', message = 'PROMOTION_ACCOUNT_SCOPE'; end if;
  if v_promotion.customer_scope = 'CUSTOM' and v_account_policy <> 'CUSTOM_DISCOUNT' then raise exception using errcode = '23514', message = 'PROMOTION_ACCOUNT_SCOPE'; end if;

  if v_promotion.first_order_only then
    select count(*) into v_valid_orders from public.commerce_orders o
    where o.tenant_record_id = v_tenant
      and o.customer_account_id = nullif(p_order->>'customer_account_id', '')::uuid
      and o.order_status <> 'cancelled' and o.payment_status not in ('rejected', 'cancelled', 'refunded');
    if nullif(p_order->>'customer_account_id', '') is null or v_valid_orders > 0 then
      raise exception using errcode = '23514', message = 'PROMOTION_FIRST_ORDER_ONLY';
    end if;
  end if;

  select count(*) into v_total_uses from public.commerce_promotion_redemptions r
  where r.tenant_id = v_tenant and r.promotion_id = v_promotion.id
    and (r.status = 'CONSUMED' or (r.status = 'RESERVED' and r.reservation_expires_at > now()));
  if v_promotion.max_total_uses is not null and v_total_uses >= v_promotion.max_total_uses then
    raise exception using errcode = '23514', message = 'PROMOTION_EXHAUSTED';
  end if;
  select count(*) into v_customer_uses from public.commerce_promotion_redemptions r
  where r.tenant_id = v_tenant and r.promotion_id = v_promotion.id and r.customer_key = v_customer_key
    and (r.status = 'CONSUMED' or (r.status = 'RESERVED' and r.reservation_expires_at > now()));
  if v_promotion.max_uses_per_customer is not null and v_customer_uses >= v_promotion.max_uses_per_customer then
    raise exception using errcode = '23514', message = 'PROMOTION_ALREADY_USED';
  end if;

  select coalesce(sum((item->>'lineCommercialTotal')::numeric), 0),
         coalesce(sum((item->>'lineCouponDiscount')::numeric), 0)
  into v_eligible_subtotal, v_snapshot_discount
  from jsonb_array_elements(p_order->'items') item
  where v_promotion.applies_to = 'ALL'
     or (v_promotion.applies_to = 'PRODUCTS' and exists (
       select 1 from public.commerce_promotion_products pp
       where pp.tenant_id = v_tenant and pp.promotion_id = v_promotion.id
         and pp.product_id = (item->>'productId')::uuid))
     or (v_promotion.applies_to = 'CATEGORIES' and exists (
       select 1 from public.commerce_promotion_categories pc
       where pc.tenant_id = v_tenant and pc.promotion_id = v_promotion.id
         and pc.category_slug = item->>'categorySlug'));
  if v_eligible_subtotal <= 0 then raise exception using errcode = '23514', message = 'PROMOTION_PRODUCTS_SCOPE'; end if;
  if v_snapshot_discount <> (p_order->>'coupon_discount_amount')::numeric then
    raise exception using errcode = '23514', message = 'PROMOTION_TOTAL_MISMATCH';
  end if;
  if (v_promotion.discount_type = 'PERCENTAGE' and v_snapshot_discount > round(v_eligible_subtotal * v_promotion.discount_value / 100, 2))
     or (v_promotion.discount_type = 'FIXED_AMOUNT' and v_snapshot_discount > least(v_eligible_subtotal, v_promotion.discount_value)) then
    raise exception using errcode = '23514', message = 'PROMOTION_DISCOUNT_MISMATCH';
  end if;

  insert into public.commerce_orders (
    public_id, tenant_id, tenant_record_id, customer_account_id, pricing_policy,
    discount_percent, checkout_session_id, idempotency_key, items, customer,
    delivery_method, delivery_address, delivery_cost_mode, base_subtotal,
    pricing_discount_amount, commercial_subtotal, promotion_id, coupon_code,
    coupon_discount_type, coupon_discount_value, coupon_discount_amount,
    coupon_stackable, subtotal, delivery_cost, total, currency, order_status,
    payment_status, payment_method
  ) values (
    (p_order->>'public_id')::uuid, p_order->>'tenant_id', v_tenant,
    nullif(p_order->>'customer_account_id', '')::uuid, p_order->>'pricing_policy',
    (p_order->>'discount_percent')::numeric, p_order->>'checkout_session_id',
    p_order->>'idempotency_key', p_order->'items', p_order->'customer',
    p_order->>'delivery_method', nullif(p_order->'delivery_address', 'null'::jsonb),
    p_order->>'delivery_cost_mode', (p_order->>'base_subtotal')::numeric,
    (p_order->>'pricing_discount_amount')::numeric, (p_order->>'commercial_subtotal')::numeric,
    v_promotion.id, v_promotion.code, v_promotion.discount_type,
    v_promotion.discount_value, v_snapshot_discount, v_promotion.stackable,
    (p_order->>'subtotal')::numeric, (p_order->>'delivery_cost')::numeric,
    (p_order->>'total')::numeric, p_order->>'currency', p_order->>'order_status',
    p_order->>'payment_status', p_order->>'payment_method'
  ) returning * into v_order;

  insert into public.commerce_promotion_redemptions (
    tenant_id, promotion_id, order_id, customer_account_id, customer_key,
    status, reservation_expires_at, coupon_code, discount_amount
  ) values (
    v_tenant, v_promotion.id, v_order.id,
    nullif(p_order->>'customer_account_id', '')::uuid, v_customer_key,
    'RESERVED', now() + interval '2 hours', v_promotion.code, v_snapshot_discount
  );
  return query select false, to_jsonb(v_order);
end;
$$;

create or replace function lombardo_private.sync_promotion_redemption()
returns trigger language plpgsql set search_path = '' as $$
begin
  if new.promotion_id is null then return new; end if;
  if new.payment_status = 'approved' or new.order_status = 'confirmed' then
    update public.commerce_promotion_redemptions set status = 'CONSUMED', consumed_at = coalesce(consumed_at, now()), released_at = null
    where tenant_id = new.tenant_record_id and order_id = new.id and status <> 'CONSUMED';
  elsif new.order_status = 'cancelled' or new.payment_status in ('rejected', 'cancelled', 'refunded') then
    update public.commerce_promotion_redemptions set status = 'RELEASED', released_at = coalesce(released_at, now()), consumed_at = null
    where tenant_id = new.tenant_record_id and order_id = new.id and status = 'RESERVED';
  end if;
  return new;
end;
$$;
drop trigger if exists commerce_orders_sync_promotion_redemption on public.commerce_orders;
create trigger commerce_orders_sync_promotion_redemption
after update of payment_status, order_status on public.commerce_orders
for each row execute function lombardo_private.sync_promotion_redemption();

alter table public.commerce_promotions enable row level security;
alter table public.commerce_promotions force row level security;
alter table public.commerce_promotion_products enable row level security;
alter table public.commerce_promotion_products force row level security;
alter table public.commerce_promotion_categories enable row level security;
alter table public.commerce_promotion_categories force row level security;
alter table public.commerce_promotion_customers enable row level security;
alter table public.commerce_promotion_customers force row level security;
alter table public.commerce_promotion_redemptions enable row level security;
alter table public.commerce_promotion_redemptions force row level security;

revoke all on table public.commerce_promotions, public.commerce_promotion_products,
  public.commerce_promotion_categories, public.commerce_promotion_customers,
  public.commerce_promotion_redemptions from public, anon, authenticated;
grant select, insert, update on table public.commerce_promotions,
  public.commerce_promotion_redemptions to service_role;
grant select, insert, update, delete on table public.commerce_promotion_products,
  public.commerce_promotion_categories, public.commerce_promotion_customers to service_role;
grant usage, select on sequence public.commerce_promotion_redemptions_id_seq to service_role;
revoke all on function public.lombardo_create_order_with_promotion(jsonb) from public, anon, authenticated;
grant execute on function public.lombardo_create_order_with_promotion(jsonb) to service_role;

comment on table public.commerce_promotions is 'Tenant-scoped reusable coupons and promotions; server-only.';
comment on table public.commerce_promotion_redemptions is 'Atomic reservation and immutable usage audit for promotions.';
comment on column public.commerce_promotion_redemptions.reservation_expires_at is 'Pending reservations stop counting after two hours.';
