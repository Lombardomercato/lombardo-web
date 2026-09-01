-- Read-only verification for the customer-owned default delivery address.

do $verify$
begin
  if not exists (
    select 1
    from pg_indexes
    where schemaname = 'public'
      and tablename = 'account_addresses'
      and indexname = 'account_addresses_one_active_primary_idx'
      and indexdef ilike '%unique%'
      and indexdef ilike '%where (is_primary and is_active)%'
  ) then
    raise exception 'default customer address unique partial index missing';
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'account_addresses'
      and policyname = 'account_addresses_own_active_insert'
      and cmd = 'INSERT'
      and 'authenticated' = any(roles)
  ) or not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'account_addresses'
      and policyname = 'account_addresses_own_active_update'
      and cmd = 'UPDATE'
      and 'authenticated' = any(roles)
  ) then
    raise exception 'customer address ownership write policies missing';
  end if;

  if not has_column_privilege(
    'authenticated', 'public.account_addresses', 'address_line', 'INSERT'
  ) or not has_column_privilege(
    'authenticated', 'public.account_addresses', 'address_line', 'UPDATE'
  ) then
    raise exception 'customer address write grants missing';
  end if;

  if has_column_privilege(
    'authenticated', 'public.account_addresses', 'tenant_id', 'UPDATE'
  ) or has_column_privilege(
    'authenticated', 'public.account_addresses', 'account_id', 'UPDATE'
  ) or has_table_privilege(
    'authenticated', 'public.account_addresses', 'DELETE'
  ) then
    raise exception 'customer address identity/delete privilege is too broad';
  end if;

  if has_table_privilege('anon', 'public.account_addresses', 'SELECT')
    or has_table_privilege('anon', 'public.account_addresses', 'INSERT')
    or has_table_privilege('anon', 'public.account_addresses', 'UPDATE')
    or has_table_privilege('anon', 'public.account_addresses', 'DELETE') then
    raise exception 'anonymous customer address access found';
  end if;
end;
$verify$;
