-- WhatsApp orders reuse commerce_orders and its immutable price snapshots.
-- The sender phone is considered verified only when it arrives through the
-- authenticated Runia/Meta channel and matches exactly one active account.

alter table public.commerce_orders
  add column if not exists channel_context jsonb,
  add column if not exists invoice_details jsonb,
  add column if not exists customer_notes text;

do $whatsapp_order_constraints$
begin
  alter table public.commerce_orders
    drop constraint if exists commerce_orders_order_source_check;
  alter table public.commerce_orders
    add constraint commerce_orders_order_source_check
    check (order_source in ('storefront', 'admin_manual', 'whatsapp'));

  alter table public.commerce_orders
    drop constraint if exists commerce_orders_channel_context_check;
  alter table public.commerce_orders
    add constraint commerce_orders_channel_context_check check (
      (
        order_source = 'whatsapp'
        and jsonb_typeof(channel_context) = 'object'
        and channel_context->>'channel' = 'whatsapp'
        and length(btrim(coalesce(channel_context->>'conversationSessionId', ''))) between 8 and 160
        and length(coalesce(channel_context->>'contactId', '')) <= 160
      )
      or (order_source <> 'whatsapp' and channel_context is null)
    );

  alter table public.commerce_orders
    drop constraint if exists commerce_orders_invoice_details_check;
  alter table public.commerce_orders
    add constraint commerce_orders_invoice_details_check check (
      invoice_details is null
      or (
        jsonb_typeof(invoice_details) = 'object'
        and invoice_details->>'type' = 'A'
        and length(btrim(coalesce(invoice_details->>'businessName', ''))) between 2 and 160
        and regexp_replace(coalesce(invoice_details->>'cuit', ''), '[^0-9]', '', 'g') ~ '^[0-9]{11}$'
        and length(coalesce(invoice_details->>'taxCondition', '')) <= 120
      )
    );

  alter table public.commerce_orders
    drop constraint if exists commerce_orders_customer_notes_check;
  alter table public.commerce_orders
    add constraint commerce_orders_customer_notes_check
    check (length(coalesce(customer_notes, '')) <= 2000);
end;
$whatsapp_order_constraints$;

create unique index if not exists commerce_orders_whatsapp_session_key
  on public.commerce_orders (tenant_id, (channel_context->>'conversationSessionId'))
  where order_source = 'whatsapp';

create or replace function public.lombardo_resolve_whatsapp_customer(
  p_tenant_slug text,
  p_phone text
)
returns table (
  id uuid,
  tenant_id uuid,
  auth_user_id uuid,
  name text,
  email text,
  account_type text,
  pricing_policy text,
  discount_percent numeric
)
language sql
stable
security definer
set search_path = ''
as $$
  with normalized_input as (
    select regexp_replace(coalesce(p_phone, ''), '[^0-9]', '', 'g') as digits
  ), matches as (
    select
      account.id,
      account.tenant_id,
      account.auth_user_id,
      account.name,
      account.email,
      account.account_type,
      account.pricing_policy,
      account.discount_percent,
      count(*) over () as match_count
    from public.customer_accounts account
    join public.tenants tenant on tenant.id = account.tenant_id
    cross join normalized_input input
    where tenant.slug = p_tenant_slug
      and account.status = 'active'
      and length(input.digits) >= 10
      and (
        right(regexp_replace(coalesce(account.whatsapp_phone, ''), '[^0-9]', '', 'g'), 10) = right(input.digits, 10)
        or right(regexp_replace(coalesce(account.phone, ''), '[^0-9]', '', 'g'), 10) = right(input.digits, 10)
      )
    limit 2
  )
  select id, tenant_id, auth_user_id, name, email, account_type, pricing_policy, discount_percent
  from matches
  where match_count = 1;
$$;

revoke all on function public.lombardo_resolve_whatsapp_customer(text, text)
  from public, anon, authenticated;
grant execute on function public.lombardo_resolve_whatsapp_customer(text, text)
  to service_role;

comment on function public.lombardo_resolve_whatsapp_customer(text, text) is
  'Resolves an active Lombardo customer only for a unique Meta-verified inbound WhatsApp sender.';
comment on column public.commerce_orders.channel_context is
  'Native Runia channel/session/contact attribution. Never contains credentials.';
comment on column public.commerce_orders.invoice_details is
  'Optional Factura A snapshot supplied by the customer.';
