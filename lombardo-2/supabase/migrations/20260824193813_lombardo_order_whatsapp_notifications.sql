-- Transactional outbox for the one-time internal new-order WhatsApp alert.
-- Browser roles have no access. Only the server-side service role can use it.

create table if not exists public.commerce_order_notifications (
  id bigint generated always as identity primary key,
  tenant_id text not null,
  order_id bigint not null references public.commerce_orders(id) on delete restrict,
  kind text not null,
  channel text not null,
  status text not null default 'pending',
  attempt_count integer not null default 0,
  provider_message_id text,
  last_error_code text,
  last_error_summary text,
  sent_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint commerce_order_notifications_kind_check check (
    kind = 'new_order'
  ),
  constraint commerce_order_notifications_channel_check check (
    channel = 'whatsapp_cloud_api'
  ),
  constraint commerce_order_notifications_status_check check (
    status in ('pending', 'sending', 'sent', 'failed', 'unknown')
  ),
  constraint commerce_order_notifications_attempt_count_check check (
    attempt_count >= 0
  ),
  constraint commerce_order_notifications_error_summary_check check (
    last_error_summary is null or char_length(last_error_summary) <= 240
  ),
  constraint commerce_order_notifications_order_key unique (
    tenant_id, order_id, kind, channel
  )
);

create index if not exists commerce_order_notifications_status_idx
  on public.commerce_order_notifications (tenant_id, status, created_at desc);

create trigger commerce_order_notifications_set_updated_at
before update on public.commerce_order_notifications
for each row execute function lombardo_private.set_updated_at();

create or replace function public.lombardo_claim_order_notification(
  p_tenant_id text,
  p_order_id bigint,
  p_allow_retry boolean default false
)
returns table (claimed boolean, notification_record jsonb)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_notification public.commerce_order_notifications%rowtype;
begin
  if not exists (
    select 1
    from public.commerce_orders order_record
    where order_record.id = p_order_id
      and order_record.tenant_id = p_tenant_id
  ) then
    raise exception 'order not found' using errcode = 'P0002';
  end if;

  insert into public.commerce_order_notifications (
    tenant_id,
    order_id,
    kind,
    channel
  ) values (
    p_tenant_id,
    p_order_id,
    'new_order',
    'whatsapp_cloud_api'
  )
  on conflict (tenant_id, order_id, kind, channel) do nothing;

  select * into v_notification
  from public.commerce_order_notifications
  where tenant_id = p_tenant_id
    and order_id = p_order_id
    and kind = 'new_order'
    and channel = 'whatsapp_cloud_api'
  for update;

  if v_notification.status = 'pending'
    or (p_allow_retry and v_notification.status = 'failed') then
    update public.commerce_order_notifications
    set
      status = 'sending',
      attempt_count = attempt_count + 1,
      last_error_code = null,
      last_error_summary = null
    where id = v_notification.id
    returning * into v_notification;

    return query select true, to_jsonb(v_notification);
    return;
  end if;

  return query select false, to_jsonb(v_notification);
end;
$$;

alter table public.commerce_order_notifications enable row level security;
alter table public.commerce_order_notifications force row level security;

revoke all on table public.commerce_order_notifications
  from public, anon, authenticated;
revoke all on function public.lombardo_claim_order_notification(text, bigint, boolean)
  from public, anon, authenticated;

grant select, insert, update on table public.commerce_order_notifications
  to service_role;
grant execute on function public.lombardo_claim_order_notification(text, bigint, boolean)
  to service_role;
grant usage, select on sequence public.commerce_order_notifications_id_seq
  to service_role;

comment on table public.commerce_order_notifications is
  'Server-only idempotent delivery ledger for operational order notifications.';
comment on column public.commerce_order_notifications.status is
  'Unknown means the provider outcome was ambiguous and must not be retried automatically.';
