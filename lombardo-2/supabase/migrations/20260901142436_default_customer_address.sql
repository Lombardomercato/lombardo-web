-- Allow each authenticated Lombardo customer to keep one active primary
-- delivery address. Ownership remains enforced by the existing customer
-- account relationship and RLS; no service credential is used by the UI.

with ranked_primary_addresses as (
  select
    id,
    row_number() over (
      partition by tenant_id, account_id
      order by updated_at desc, created_at desc, id
    ) as position
  from public.account_addresses
  where is_primary
    and is_active
)
update public.account_addresses address
set is_primary = false,
    updated_at = now()
from ranked_primary_addresses ranked
where address.id = ranked.id
  and ranked.position > 1;

create unique index if not exists account_addresses_one_active_primary_idx
  on public.account_addresses (tenant_id, account_id)
  where is_primary and is_active;

drop policy if exists account_addresses_own_active_insert
  on public.account_addresses;
create policy account_addresses_own_active_insert
on public.account_addresses
for insert
to authenticated
with check (
  is_primary
  and is_active
  and country = 'AR'
  and exists (
    select 1
    from public.customer_accounts account
    where account.tenant_id = account_addresses.tenant_id
      and account.id = account_addresses.account_id
      and account.status = 'active'
      and account.auth_user_id = (select auth.uid())
  )
);

drop policy if exists account_addresses_own_active_update
  on public.account_addresses;
create policy account_addresses_own_active_update
on public.account_addresses
for update
to authenticated
using (
  is_primary
  and is_active
  and exists (
    select 1
    from public.customer_accounts account
    where account.tenant_id = account_addresses.tenant_id
      and account.id = account_addresses.account_id
      and account.status = 'active'
      and account.auth_user_id = (select auth.uid())
  )
)
with check (
  is_primary
  and is_active
  and country = 'AR'
  and exists (
    select 1
    from public.customer_accounts account
    where account.tenant_id = account_addresses.tenant_id
      and account.id = account_addresses.account_id
      and account.status = 'active'
      and account.auth_user_id = (select auth.uid())
  )
);

revoke insert, update, delete on table public.account_addresses
  from anon, authenticated;

grant insert (
  tenant_id,
  account_id,
  label,
  address_line,
  city,
  province,
  postal_code,
  country,
  is_primary,
  is_active,
  metadata_json,
  updated_at
) on table public.account_addresses to authenticated;

grant update (
  label,
  address_line,
  city,
  province,
  postal_code,
  country,
  is_primary,
  is_active,
  metadata_json,
  updated_at
) on table public.account_addresses to authenticated;

comment on index public.account_addresses_one_active_primary_idx is
  'One active default delivery address per Lombardo customer account.';
