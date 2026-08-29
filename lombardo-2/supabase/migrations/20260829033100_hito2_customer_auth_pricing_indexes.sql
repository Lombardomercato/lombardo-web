-- HITO 2 follow-up: cover the tenant-safe composite foreign keys used by
-- customer ownership checks and authenticated order history.

create index if not exists account_contacts_tenant_account_idx
  on public.account_contacts (tenant_id, account_id);

create index if not exists account_addresses_tenant_account_idx
  on public.account_addresses (tenant_id, account_id);

create index if not exists commerce_orders_tenant_record_slug_idx
  on public.commerce_orders (tenant_record_id, tenant_id);
