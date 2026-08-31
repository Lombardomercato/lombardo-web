do $verification$
declare
  v_browser_grants integer;
  v_browser_function_grants integer;
begin
  if to_regclass('public.commerce_order_management_events') is null then
    raise exception 'missing commerce_order_management_events';
  end if;
  if not exists (
    select 1 from pg_class
    where oid = 'public.commerce_order_management_events'::regclass
      and relrowsecurity and relforcerowsecurity
  ) then
    raise exception 'order management audit RLS/FORCE RLS missing';
  end if;
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'commerce_orders'
      and column_name = 'management_revision'
  ) then
    raise exception 'order management columns missing';
  end if;

  select count(*) into v_browser_grants
  from information_schema.role_table_grants
  where table_schema = 'public'
    and table_name = 'commerce_order_management_events'
    and grantee in ('anon', 'authenticated', 'PUBLIC');
  if v_browser_grants <> 0 then
    raise exception 'browser table grants found: %', v_browser_grants;
  end if;

  select count(*) into v_browser_function_grants
  from information_schema.routine_privileges
  where specific_schema = 'public'
    and routine_name in (
      'lombardo_admin_create_order',
      'lombardo_admin_update_order_management'
    )
    and grantee in ('anon', 'authenticated', 'PUBLIC');
  if v_browser_function_grants <> 0 then
    raise exception 'browser RPC grants found: %', v_browser_function_grants;
  end if;
end;
$verification$;
