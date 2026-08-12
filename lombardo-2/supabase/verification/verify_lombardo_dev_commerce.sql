-- Read-only structural verification for Lombardo order/payment storage in Runia Dev.

do $verify$
declare
  v_function regprocedure;
begin
  if to_regclass('public.commerce_orders') is null then
    raise exception 'missing public.commerce_orders';
  end if;
  if to_regclass('public.commerce_payment_events') is null then
    raise exception 'missing public.commerce_payment_events';
  end if;
  if not exists (
    select 1 from pg_class
    where oid = 'public.commerce_orders'::regclass
      and relrowsecurity and relforcerowsecurity
  ) then
    raise exception 'commerce_orders RLS/FORCE RLS missing';
  end if;
  if not exists (
    select 1 from pg_class
    where oid = 'public.commerce_payment_events'::regclass
      and relrowsecurity and relforcerowsecurity
  ) then
    raise exception 'commerce_payment_events RLS/FORCE RLS missing';
  end if;
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.commerce_orders'::regclass
      and conname = 'commerce_orders_public_id_key' and contype = 'u'
  ) then
    raise exception 'public_id unique constraint missing';
  end if;
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.commerce_orders'::regclass
      and conname = 'commerce_orders_session_key' and contype = 'u'
  ) then
    raise exception 'checkout session idempotency constraint missing';
  end if;
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.commerce_orders'::regclass
      and conname = 'commerce_orders_idempotency_key' and contype = 'u'
  ) then
    raise exception 'order idempotency constraint missing';
  end if;
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.commerce_payment_events'::regclass
      and conname = 'commerce_payment_events_idempotency_key' and contype = 'u'
  ) then
    raise exception 'payment event idempotency constraint missing';
  end if;

  if not exists (
    select 1 from pg_indexes
    where schemaname = 'public'
      and indexname = 'commerce_orders_tenant_status_created_idx'
  ) then
    raise exception 'order status index missing';
  end if;
  if not exists (
    select 1 from pg_indexes
    where schemaname = 'public'
      and indexname = 'commerce_payment_events_order_id_idx'
  ) then
    raise exception 'payment event foreign-key index missing';
  end if;

  if has_table_privilege('anon', 'public.commerce_orders', 'select')
    or has_table_privilege('authenticated', 'public.commerce_orders', 'select') then
    raise exception 'public order access is too broad';
  end if;
  if not has_table_privilege('service_role', 'public.commerce_orders', 'select') then
    raise exception 'service_role order grant missing';
  end if;

  v_function := to_regprocedure(
    'public.lombardo_apply_payment_event(text,text,text,text,text,jsonb,text,text)'
  );
  if v_function is null then
    raise exception 'atomic payment event function missing';
  end if;
  if has_function_privilege('anon', v_function, 'execute')
    or has_function_privilege('authenticated', v_function, 'execute') then
    raise exception 'atomic payment event function is publicly executable';
  end if;
  if not has_function_privilege('service_role', v_function, 'execute') then
    raise exception 'service_role execute grant missing';
  end if;
end;
$verify$;

select
  c.relname as table_name,
  c.relrowsecurity as rls_enabled,
  c.relforcerowsecurity as rls_forced
from pg_class c
where c.oid in (
  'public.commerce_orders'::regclass,
  'public.commerce_payment_events'::regclass
)
order by c.relname;
