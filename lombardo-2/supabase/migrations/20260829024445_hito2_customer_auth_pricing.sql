-- HITO 2 - customer auth, tenant-safe ownership and server-authoritative pricing.
--
-- This migration deliberately reuses customer_accounts and commerce_orders.
-- Lombardo prices continue to come from supplier_prices; price_lists and
-- product_prices are not part of this customer pricing path.

alter table public.customer_accounts
  add column if not exists auth_user_id uuid,
  add column if not exists account_type text not null default 'RETAIL',
  add column if not exists pricing_policy text not null default 'RETAIL',
  add column if not exists last_login_at timestamptz;

-- Preserve the meaning of the legacy account-level discount. Accounts with a
-- positive discount become RETAIL + CUSTOM_DISCOUNT instead of failing the new
-- coherence constraint because the added columns initially default to RETAIL.
update public.customer_accounts
set pricing_policy = 'CUSTOM_DISCOUNT'
where account_type = 'RETAIL'
  and pricing_policy = 'RETAIL'
  and discount_percent > 0
  and discount_percent < 100;

do $customer_constraints$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.customer_accounts'::regclass
      and conname = 'customer_accounts_auth_user_id_fkey'
  ) then
    alter table public.customer_accounts
      add constraint customer_accounts_auth_user_id_fkey
      foreign key (auth_user_id) references auth.users(id) on delete set null;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.customer_accounts'::regclass
      and conname = 'customer_accounts_account_type_check'
  ) then
    alter table public.customer_accounts
      add constraint customer_accounts_account_type_check
      check (account_type in ('RETAIL', 'WHOLESALE', 'BUSINESS'));
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.customer_accounts'::regclass
      and conname = 'customer_accounts_pricing_policy_check'
  ) then
    alter table public.customer_accounts
      add constraint customer_accounts_pricing_policy_check
      check (pricing_policy in (
        'RETAIL', 'WHOLESALE', 'BUSINESS', 'CUSTOM_DISCOUNT'
      ));
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.customer_accounts'::regclass
      and conname = 'customer_accounts_pricing_coherence_check'
  ) then
    alter table public.customer_accounts
      add constraint customer_accounts_pricing_coherence_check
      check (
        (
          account_type = 'RETAIL'
          and pricing_policy = 'RETAIL'
          and discount_percent = 0
        )
        or
        (
          account_type = 'RETAIL'
          and pricing_policy = 'CUSTOM_DISCOUNT'
          and discount_percent > 0
          and discount_percent < 100
        )
        or
        (
          account_type = 'WHOLESALE'
          and pricing_policy = 'WHOLESALE'
          and discount_percent = 0
        )
        or
        (
          account_type = 'BUSINESS'
          and pricing_policy = 'BUSINESS'
          and discount_percent = 0
        )
      );
  end if;
end;
$customer_constraints$;

create unique index if not exists customer_accounts_tenant_auth_user_key
  on public.customer_accounts (tenant_id, auth_user_id)
  where auth_user_id is not null;

create index if not exists customer_accounts_active_auth_owner_idx
  on public.customer_accounts (auth_user_id, tenant_id, id)
  where auth_user_id is not null and status = 'active';

create unique index if not exists customer_accounts_tenant_email_key
  on public.customer_accounts (tenant_id, lower(email))
  where email is not null;

-- commerce_orders retains the public tenant slug for compatibility with the
-- existing order/payment code. tenant_record_id adds the UUID tenant boundary.
create unique index if not exists tenants_id_slug_key
  on public.tenants (id, slug);

alter table public.commerce_orders
  add column if not exists tenant_record_id uuid,
  add column if not exists customer_account_id uuid,
  add column if not exists pricing_policy text,
  add column if not exists discount_percent numeric,
  add column if not exists base_subtotal numeric(14, 2),
  add column if not exists pricing_discount_amount numeric(14, 2);

update public.commerce_orders orders
set tenant_record_id = tenant.id
from public.tenants tenant
where orders.tenant_record_id is null
  and tenant.slug = orders.tenant_id;

do $tenant_backfill$
begin
  if exists (
    select 1 from public.commerce_orders where tenant_record_id is null
  ) then
    raise exception using
      errcode = '23503',
      message = 'HITO2_TENANT_BACKFILL_FAILED';
  end if;
end;
$tenant_backfill$;

update public.commerce_orders
set
  pricing_policy = coalesce(pricing_policy, 'RETAIL'),
  discount_percent = coalesce(discount_percent, 0),
  base_subtotal = coalesce(base_subtotal, subtotal),
  pricing_discount_amount = coalesce(pricing_discount_amount, 0)
where pricing_policy is null
   or discount_percent is null
   or base_subtotal is null
   or pricing_discount_amount is null;

alter table public.commerce_orders
  alter column tenant_record_id set not null,
  alter column pricing_policy set default 'RETAIL',
  alter column pricing_policy set not null,
  alter column discount_percent set default 0,
  alter column discount_percent set not null,
  alter column base_subtotal set not null,
  alter column pricing_discount_amount set not null;

do $commerce_constraints$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.commerce_orders'::regclass
      and conname = 'commerce_orders_tenant_record_fkey'
  ) then
    alter table public.commerce_orders
      add constraint commerce_orders_tenant_record_fkey
      foreign key (tenant_record_id, tenant_id)
      references public.tenants(id, slug);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.commerce_orders'::regclass
      and conname = 'commerce_orders_customer_account_fkey'
  ) then
    alter table public.commerce_orders
      add constraint commerce_orders_customer_account_fkey
      foreign key (tenant_record_id, customer_account_id)
      references public.customer_accounts(tenant_id, id)
      on delete restrict;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.commerce_orders'::regclass
      and conname = 'commerce_orders_pricing_policy_check'
  ) then
    alter table public.commerce_orders
      add constraint commerce_orders_pricing_policy_check
      check (pricing_policy in (
        'RETAIL', 'WHOLESALE', 'BUSINESS', 'CUSTOM_DISCOUNT'
      ));
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.commerce_orders'::regclass
      and conname = 'commerce_orders_customer_pricing_check'
  ) then
    alter table public.commerce_orders
      add constraint commerce_orders_customer_pricing_check
      check (
        (
          customer_account_id is null
          and pricing_policy = 'RETAIL'
          and discount_percent = 0
        )
        or
        (
          customer_account_id is not null
          and (
            (
              pricing_policy = 'CUSTOM_DISCOUNT'
              and discount_percent > 0
              and discount_percent < 100
            )
            or
            (
              pricing_policy in ('RETAIL', 'WHOLESALE', 'BUSINESS')
              and discount_percent = 0
            )
          )
        )
      );
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.commerce_orders'::regclass
      and conname = 'commerce_orders_pricing_amounts_check'
  ) then
    alter table public.commerce_orders
      add constraint commerce_orders_pricing_amounts_check
      check (
        base_subtotal >= 0
        and pricing_discount_amount >= 0
        and pricing_discount_amount <= base_subtotal
        and subtotal = base_subtotal - pricing_discount_amount
      );
  end if;
end;
$commerce_constraints$;

create index if not exists commerce_orders_customer_history_idx
  on public.commerce_orders (
    tenant_record_id,
    customer_account_id,
    created_at desc
  )
  where customer_account_id is not null;

-- Keep rolling deployments safe: the pre-HITO2 storefront creates anonymous
-- RETAIL orders and does not yet send tenant_record_id or pricing snapshots.
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
  select tenant.id
  into v_tenant_id
  from public.tenants tenant
  where tenant.slug = new.tenant_id
    and tenant.status = 'active';

  if not found then
    raise exception using
      errcode = '23503',
      message = 'HITO2_ORDER_TENANT_NOT_FOUND';
  end if;

  if new.tenant_record_id is null then
    new.tenant_record_id := v_tenant_id;
  elsif new.tenant_record_id <> v_tenant_id then
    raise exception using
      errcode = '23503',
      message = 'HITO2_ORDER_TENANT_MISMATCH';
  end if;

  if new.customer_account_id is null then
    new.pricing_policy := 'RETAIL';
    new.discount_percent := 0;
    new.base_subtotal := coalesce(new.base_subtotal, new.subtotal);
    new.pricing_discount_amount := coalesce(new.pricing_discount_amount, 0);
    return new;
  end if;

  select account.pricing_policy, account.discount_percent
  into v_policy, v_discount
  from public.customer_accounts account
  where account.tenant_id = v_tenant_id
    and account.id = new.customer_account_id
    and account.status = 'active'
    and account.auth_user_id is not null;

  if not found then
    raise exception using
      errcode = '23503',
      message = 'HITO2_ORDER_CUSTOMER_NOT_ACTIVE';
  end if;

  new.pricing_policy := v_policy;
  new.discount_percent := v_discount;

  if new.base_subtotal is null then
    if v_discount = 0 then
      new.base_subtotal := new.subtotal;
    else
      raise exception using
        errcode = '23514',
        message = 'HITO2_ORDER_BASE_SUBTOTAL_REQUIRED';
    end if;
  end if;

  if new.pricing_discount_amount is null then
    if v_discount = 0 then
      new.pricing_discount_amount := 0;
    else
      raise exception using
        errcode = '23514',
        message = 'HITO2_ORDER_DISCOUNT_SNAPSHOT_REQUIRED';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists commerce_orders_prepare_customer_pricing
  on public.commerce_orders;
create trigger commerce_orders_prepare_customer_pricing
before insert on public.commerce_orders
for each row execute function lombardo_private.prepare_customer_order_pricing();

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
    or new.subtotal is distinct from old.subtotal
    or new.items is distinct from old.items then
    raise exception using
      errcode = '23514',
      message = 'HITO2_ORDER_PRICING_SNAPSHOT_IMMUTABLE';
  end if;
  return new;
end;
$$;

drop trigger if exists commerce_orders_protect_customer_pricing
  on public.commerce_orders;
create trigger commerce_orders_protect_customer_pricing
before update on public.commerce_orders
for each row execute function lombardo_private.protect_customer_order_pricing();

-- Customer-facing access is read-only and ownership-based. Supplier tables stay
-- closed; catalog pricing is resolved by the server from the verified Auth user.
alter table public.customer_accounts enable row level security;
alter table public.customer_accounts force row level security;
alter table public.account_contacts enable row level security;
alter table public.account_contacts force row level security;
alter table public.account_addresses enable row level security;
alter table public.account_addresses force row level security;
alter table public.commerce_orders enable row level security;
alter table public.commerce_orders force row level security;

drop policy if exists server_only_deny_authenticated
  on public.customer_accounts;
drop policy if exists customer_accounts_own_active_select
  on public.customer_accounts;
create policy customer_accounts_own_active_select
on public.customer_accounts
for select
to authenticated
using (
  status = 'active'
  and auth_user_id = (select auth.uid())
);

drop policy if exists server_only_deny_authenticated
  on public.account_contacts;
drop policy if exists account_contacts_own_active_select
  on public.account_contacts;
create policy account_contacts_own_active_select
on public.account_contacts
for select
to authenticated
using (
  exists (
    select 1
    from public.customer_accounts account
    where account.tenant_id = account_contacts.tenant_id
      and account.id = account_contacts.account_id
      and account.status = 'active'
      and account.auth_user_id = (select auth.uid())
  )
);

drop policy if exists server_only_deny_authenticated
  on public.account_addresses;
drop policy if exists account_addresses_own_active_select
  on public.account_addresses;
create policy account_addresses_own_active_select
on public.account_addresses
for select
to authenticated
using (
  exists (
    select 1
    from public.customer_accounts account
    where account.tenant_id = account_addresses.tenant_id
      and account.id = account_addresses.account_id
      and account.status = 'active'
      and account.auth_user_id = (select auth.uid())
  )
);

drop policy if exists commerce_orders_own_active_select
  on public.commerce_orders;
create policy commerce_orders_own_active_select
on public.commerce_orders
for select
to authenticated
using (
  customer_account_id is not null
  and exists (
    select 1
    from public.customer_accounts account
    where account.tenant_id = commerce_orders.tenant_record_id
      and account.id = commerce_orders.customer_account_id
      and account.status = 'active'
      and account.auth_user_id = (select auth.uid())
  )
);

drop policy if exists commerce_orders_deny_anon
  on public.commerce_orders;
create policy commerce_orders_deny_anon
on public.commerce_orders
for all
to anon
using (false)
with check (false);

revoke all on table public.customer_accounts from anon, authenticated;
revoke all on table public.account_contacts from anon, authenticated;
revoke all on table public.account_addresses from anon, authenticated;
revoke all on table public.commerce_orders from anon, authenticated;

grant select on table public.customer_accounts to authenticated;
grant select on table public.account_contacts to authenticated;
grant select on table public.account_addresses to authenticated;
grant select on table public.commerce_orders to authenticated;

do $enable_feature$
declare
  v_rows integer;
begin
  update public.tenants
  set feature_wholesale_login = true,
      updated_at = now()
  where slug = 'lombardo';

  get diagnostics v_rows = row_count;
  if v_rows <> 1 then
    raise exception using
      errcode = 'P0002',
      message = 'HITO2_LOMBARDO_TENANT_NOT_FOUND';
  end if;
end;
$enable_feature$;

comment on column public.customer_accounts.auth_user_id is
  'Verified Supabase Auth owner for this customer account within its tenant.';
comment on column public.customer_accounts.pricing_policy is
  'Server-authoritative Lombardo policy mapped to supplier_prices.price_type.';
comment on column public.customer_accounts.price_list_id is
  'Legacy Runia field. Lombardo HITO2 pricing does not resolve from price_lists.';
comment on column public.commerce_orders.base_subtotal is
  'Sum of base list prices before a custom percentage discount.';
comment on column public.commerce_orders.pricing_discount_amount is
  'Immutable order-level commercial discount snapshot.';
