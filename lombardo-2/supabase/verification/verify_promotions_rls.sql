\set ON_ERROR_STOP on
-- Run after migration 020 in a disposable/local database. Everything rolls back.

begin;

insert into public.commerce_promotions (
  id, tenant_id, code, name, status, discount_type, discount_value,
  max_total_uses, max_uses_per_customer, applies_to, customer_scope, stackable
)
select
  '93000000-0000-4000-8000-000000000001', tenant.id, 'HITO3-10',
  'HITO 3 fixture', 'ACTIVE', 'PERCENTAGE', 10, 2, 1, 'ALL', 'ALL', false
from public.tenants tenant where tenant.slug = 'lombardo';

do $constraints$
begin
  begin
    insert into public.commerce_promotions (
      tenant_id, code, name, status, discount_type, discount_value
    ) select tenant.id, 'BAD-100', 'Invalid percentage', 'ACTIVE', 'PERCENTAGE', 100
      from public.tenants tenant where tenant.slug = 'lombardo';
    raise exception 'HITO3_TEST_FAILED: invalid percentage was accepted';
  exception when check_violation then null;
  end;

  begin
    insert into public.commerce_promotions (
      tenant_id, code, name, status, discount_type, discount_value, start_at, end_at
    ) select tenant.id, 'BAD-DATE', 'Invalid dates', 'ACTIVE', 'FIXED_AMOUNT', 1000, now(), now() - interval '1 hour'
      from public.tenants tenant where tenant.slug = 'lombardo';
    raise exception 'HITO3_TEST_FAILED: invalid dates were accepted';
  exception when check_violation then null;
  end;
end;
$constraints$;

set local role anon;
do $anon_closed$
begin
  begin
    perform 1 from public.commerce_promotions limit 1;
    raise exception 'HITO3_TEST_FAILED: anon could read promotions';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.lombardo_create_order_with_promotion('{}'::jsonb);
    raise exception 'HITO3_TEST_FAILED: anon could execute order promotion RPC';
  exception when insufficient_privilege then null;
  end;
end;
$anon_closed$;

reset role;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"91000000-0000-4000-8000-000000000001","role":"authenticated"}', true);
select set_config('request.jwt.claim.sub', '91000000-0000-4000-8000-000000000001', true);
do $authenticated_closed$
begin
  begin
    perform 1 from public.commerce_promotions limit 1;
    raise exception 'HITO3_TEST_FAILED: customer could enumerate promotions';
  exception when insufficient_privilege then null;
  end;
  begin
    update public.commerce_promotions set discount_value = 99;
    raise exception 'HITO3_TEST_FAILED: customer could change discounts';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.lombardo_create_order_with_promotion('{}'::jsonb);
    raise exception 'HITO3_TEST_FAILED: customer could execute reservation RPC';
  exception when insufficient_privilege then null;
  end;
end;
$authenticated_closed$;

reset role;
do $server_contract$
declare
  v_function_acl aclitem[];
begin
  select proacl into v_function_acl from pg_proc
  where oid = 'public.lombardo_create_order_with_promotion(jsonb)'::regprocedure;
  if has_function_privilege('anon', 'public.lombardo_create_order_with_promotion(jsonb)', 'EXECUTE')
    or has_function_privilege('authenticated', 'public.lombardo_create_order_with_promotion(jsonb)', 'EXECUTE')
    or not has_function_privilege('service_role', 'public.lombardo_create_order_with_promotion(jsonb)', 'EXECUTE') then
    raise exception 'HITO3_TEST_FAILED: RPC grants are unsafe';
  end if;
  if not exists (
    select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relname = 'commerce_promotion_redemptions'
      and c.relrowsecurity and c.relforcerowsecurity
  ) then raise exception 'HITO3_TEST_FAILED: redemption RLS is not forced'; end if;
end;
$server_contract$;

rollback;
\echo 'Runia HITO 3 promotions/RLS: PASS'
