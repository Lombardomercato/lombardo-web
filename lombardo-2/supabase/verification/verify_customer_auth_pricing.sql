-- Read-only verification for HITO 2 customer Auth, pricing snapshots and RLS.

do $verify$
declare
  v_prepare_function regprocedure;
  v_protect_function regprocedure;
  v_table text;
  v_constraint text;
begin
  foreach v_table in array array[
    'customer_accounts',
    'account_contacts',
    'account_addresses',
    'commerce_orders'
  ] loop
    if to_regclass(format('public.%I', v_table)) is null then
      raise exception 'missing public.%', v_table;
    end if;

    if not exists (
      select 1
      from pg_class
      where oid = to_regclass(format('public.%I', v_table))
        and relrowsecurity
        and relforcerowsecurity
    ) then
      raise exception 'RLS/FORCE RLS missing on public.%', v_table;
    end if;
  end loop;

  if exists (
    select 1
    from (values
      ('auth_user_id', false),
      ('account_type', true),
      ('pricing_policy', true),
      ('last_login_at', false)
    ) expected(column_name, is_required)
    left join information_schema.columns column_info
      on column_info.table_schema = 'public'
     and column_info.table_name = 'customer_accounts'
     and column_info.column_name = expected.column_name
    where column_info.column_name is null
       or (expected.is_required and column_info.is_nullable <> 'NO')
  ) then
    raise exception 'customer account Auth/pricing columns are missing or nullable';
  end if;

  if exists (
    select 1
    from (values
      ('tenant_record_id', true),
      ('customer_account_id', false),
      ('pricing_policy', true),
      ('discount_percent', true),
      ('base_subtotal', true),
      ('pricing_discount_amount', true)
    ) expected(column_name, is_required)
    left join information_schema.columns column_info
      on column_info.table_schema = 'public'
     and column_info.table_name = 'commerce_orders'
     and column_info.column_name = expected.column_name
    where column_info.column_name is null
       or (expected.is_required and column_info.is_nullable <> 'NO')
  ) then
    raise exception 'commerce order ownership/snapshot columns are missing or nullable';
  end if;

  foreach v_constraint in array array[
    'customer_accounts_auth_user_id_fkey',
    'customer_accounts_account_type_check',
    'customer_accounts_pricing_policy_check',
    'customer_accounts_pricing_coherence_check'
  ] loop
    if not exists (
      select 1
      from pg_constraint
      where conrelid = 'public.customer_accounts'::regclass
        and conname = v_constraint
        and convalidated
    ) then
      raise exception 'missing/invalid customer constraint %', v_constraint;
    end if;
  end loop;

  foreach v_constraint in array array[
    'commerce_orders_tenant_record_fkey',
    'commerce_orders_customer_account_fkey',
    'commerce_orders_pricing_policy_check',
    'commerce_orders_customer_pricing_check',
    'commerce_orders_pricing_amounts_check'
  ] loop
    if not exists (
      select 1
      from pg_constraint
      where conrelid = 'public.commerce_orders'::regclass
        and conname = v_constraint
        and convalidated
    ) then
      raise exception 'missing/invalid order constraint %', v_constraint;
    end if;
  end loop;

  if not exists (
    select 1 from pg_indexes
    where schemaname = 'public'
      and indexname = 'customer_accounts_tenant_auth_user_key'
  ) or not exists (
    select 1 from pg_indexes
    where schemaname = 'public'
      and indexname = 'customer_accounts_active_auth_owner_idx'
  ) or not exists (
    select 1 from pg_indexes
    where schemaname = 'public'
      and indexname = 'customer_accounts_tenant_email_key'
  ) or not exists (
    select 1 from pg_indexes
    where schemaname = 'public'
      and indexname = 'commerce_orders_customer_history_idx'
  ) then
    raise exception 'HITO 2 ownership/history index missing';
  end if;

  v_prepare_function := to_regprocedure(
    'lombardo_private.prepare_customer_order_pricing()'
  );
  v_protect_function := to_regprocedure(
    'lombardo_private.protect_customer_order_pricing()'
  );
  if v_prepare_function is null or v_protect_function is null then
    raise exception 'order pricing trigger function missing';
  end if;

  if exists (
    select 1
    from pg_proc
    where oid in (v_prepare_function, v_protect_function)
      and (
        prosecdef
        or not ('search_path=""' = any(coalesce(proconfig, array[]::text[])))
      )
  ) then
    raise exception 'pricing trigger functions must be invoker and use empty search_path';
  end if;

  if not exists (
    select 1 from pg_trigger
    where tgrelid = 'public.commerce_orders'::regclass
      and tgname = 'commerce_orders_prepare_customer_pricing'
      and not tgisinternal
  ) or not exists (
    select 1 from pg_trigger
    where tgrelid = 'public.commerce_orders'::regclass
      and tgname = 'commerce_orders_protect_customer_pricing'
      and not tgisinternal
  ) then
    raise exception 'order pricing trigger missing';
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'customer_accounts'
      and policyname = 'customer_accounts_own_active_select'
      and cmd = 'SELECT'
      and 'authenticated' = any(roles)
  ) or not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'account_contacts'
      and policyname = 'account_contacts_own_active_select'
      and cmd = 'SELECT'
      and 'authenticated' = any(roles)
  ) or not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'account_addresses'
      and policyname = 'account_addresses_own_active_select'
      and cmd = 'SELECT'
      and 'authenticated' = any(roles)
  ) or not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'commerce_orders'
      and policyname = 'commerce_orders_own_active_select'
      and cmd = 'SELECT'
      and 'authenticated' = any(roles)
  ) then
    raise exception 'authenticated ownership SELECT policy missing';
  end if;

  foreach v_table in array array[
    'customer_accounts',
    'account_contacts',
    'account_addresses',
    'commerce_orders'
  ] loop
    if not has_table_privilege(
      'authenticated', format('public.%I', v_table), 'SELECT'
    ) then
      raise exception 'authenticated SELECT grant missing on public.%', v_table;
    end if;

    if has_table_privilege(
      'authenticated', format('public.%I', v_table), 'INSERT'
    ) or has_table_privilege(
      'authenticated', format('public.%I', v_table), 'UPDATE'
    ) or has_table_privilege(
      'authenticated', format('public.%I', v_table), 'DELETE'
    ) then
      raise exception 'authenticated write grant found on public.%', v_table;
    end if;

    if has_table_privilege('anon', format('public.%I', v_table), 'SELECT')
      or has_table_privilege('anon', format('public.%I', v_table), 'INSERT')
      or has_table_privilege('anon', format('public.%I', v_table), 'UPDATE')
      or has_table_privilege('anon', format('public.%I', v_table), 'DELETE') then
      raise exception 'anon grant found on public.%', v_table;
    end if;

    if not has_table_privilege(
      'service_role', format('public.%I', v_table), 'SELECT'
    ) then
      raise exception 'service_role access missing on public.%', v_table;
    end if;
  end loop;

  if not exists (
    select 1 from public.tenants
    where slug = 'lombardo'
      and feature_wholesale_login
  ) then
    raise exception 'Lombardo customer login feature is not enabled';
  end if;

  if exists (
    select 1
    from public.customer_accounts account
    where not (
      (account.account_type = 'RETAIL'
        and account.pricing_policy = 'RETAIL'
        and account.discount_percent = 0)
      or
      (account.account_type = 'RETAIL'
        and account.pricing_policy = 'CUSTOM_DISCOUNT'
        and account.discount_percent > 0
        and account.discount_percent < 100)
      or
      (account.account_type = 'WHOLESALE'
        and account.pricing_policy = 'WHOLESALE'
        and account.discount_percent = 0)
      or
      (account.account_type = 'BUSINESS'
        and account.pricing_policy = 'BUSINESS'
        and account.discount_percent = 0)
    )
  ) then
    raise exception 'incoherent customer pricing policy found';
  end if;

  if exists (
    select 1
    from public.commerce_orders orders
    left join public.tenants tenant
      on tenant.id = orders.tenant_record_id
     and tenant.slug = orders.tenant_id
    where tenant.id is null
  ) then
    raise exception 'order outside its tenant boundary found';
  end if;

  if exists (
    select 1
    from public.commerce_orders orders
    left join public.customer_accounts account
      on account.tenant_id = orders.tenant_record_id
     and account.id = orders.customer_account_id
    where orders.customer_account_id is not null
      and account.id is null
  ) then
    raise exception 'order linked to a customer in another tenant';
  end if;

  if exists (
    select 1
    from public.commerce_orders orders
    where orders.base_subtotal < 0
       or orders.pricing_discount_amount < 0
       or orders.pricing_discount_amount > orders.base_subtotal
       or orders.subtotal <> orders.base_subtotal - orders.pricing_discount_amount
       or (
         orders.customer_account_id is null
         and (orders.pricing_policy <> 'RETAIL' or orders.discount_percent <> 0)
       )
  ) then
    raise exception 'invalid order pricing snapshot found';
  end if;
end;
$verify$;

select
  account_type,
  pricing_policy,
  discount_percent,
  count(*) as customer_count
from public.customer_accounts
group by account_type, pricing_policy, discount_percent
order by account_type, pricing_policy, discount_percent;

select
  pricing_policy,
  count(*) as order_count,
  sum(base_subtotal) as base_subtotal,
  sum(pricing_discount_amount) as pricing_discount_amount,
  sum(subtotal) as final_subtotal
from public.commerce_orders
group by pricing_policy
order by pricing_policy;
