-- DEV/SANDBOX ONLY. Apply after lombardo_commerce_orders.sql in Runia Dev.
-- This is an explicit temporary mapping, not the permanent public product model.

create table if not exists public.commerce_lombardo_dev_product_adapter (
  id bigint generated always as identity primary key,
  tenant_slug text not null,
  public_product_id text not null,
  runia_product_id text not null,
  runia_sku text not null,
  display_name text not null,
  eligibility_status text not null,
  lombardo_sale_price numeric(14, 2),
  currency text not null default 'ARS',
  available_now boolean not null default false,
  sandbox_quantity integer not null default 0,
  enabled_for_sandbox boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint commerce_lombardo_dev_adapter_tenant_public_key
    unique (tenant_slug, public_product_id),
  constraint commerce_lombardo_dev_adapter_tenant_runia_key
    unique (tenant_slug, runia_product_id),
  constraint commerce_lombardo_dev_adapter_tenant_check
    check (tenant_slug ~ '^[a-z0-9][a-z0-9-]{1,62}$'),
  constraint commerce_lombardo_dev_adapter_identifiers_check
    check (
      length(trim(public_product_id)) between 2 and 160
      and length(trim(runia_product_id)) between 1 and 200
      and length(trim(runia_sku)) between 1 and 160
      and length(trim(display_name)) between 1 and 240
    ),
  constraint commerce_lombardo_dev_adapter_eligibility_check
    check (
      eligibility_status in ('safe', 'blocked', 'pending_review', 'supplier_only_cost')
    ),
  constraint commerce_lombardo_dev_adapter_price_check
    check (lombardo_sale_price is null or lombardo_sale_price > 0),
  constraint commerce_lombardo_dev_adapter_currency_check check (currency = 'ARS'),
  constraint commerce_lombardo_dev_adapter_quantity_check
    check (sandbox_quantity between 0 and 100),
  constraint commerce_lombardo_dev_adapter_enabled_check
    check (
      not enabled_for_sandbox
      or (
        eligibility_status = 'safe'
        and lombardo_sale_price is not null
        and available_now
        and sandbox_quantity > 0
      )
    )
);

create index if not exists commerce_lombardo_dev_adapter_eligible_idx
  on public.commerce_lombardo_dev_product_adapter (tenant_slug, created_at)
  where eligibility_status = 'safe' and enabled_for_sandbox;

drop trigger if exists commerce_lombardo_dev_adapter_set_updated_at
  on public.commerce_lombardo_dev_product_adapter;
create trigger commerce_lombardo_dev_adapter_set_updated_at
before update on public.commerce_lombardo_dev_product_adapter
for each row execute function lombardo_private.set_updated_at();

alter table public.commerce_lombardo_dev_product_adapter enable row level security;
alter table public.commerce_lombardo_dev_product_adapter force row level security;

revoke all on table public.commerce_lombardo_dev_product_adapter
  from anon, authenticated;
grant usage on schema public to service_role;
grant select on table public.commerce_lombardo_dev_product_adapter to service_role;

comment on table public.commerce_lombardo_dev_product_adapter is
  'DEV-only explicit mapping from reviewed Runia products to Lombardo visual product IDs.';
comment on column public.commerce_lombardo_dev_product_adapter.lombardo_sale_price is
  'Manual Lombardo Sandbox sale price. Never derived from supplier cost or wholesale price.';
comment on column public.commerce_lombardo_dev_product_adapter.available_now is
  'Explicit DEV availability policy; it does not represent supplier or local production stock.';
