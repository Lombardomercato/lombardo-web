-- Idempotent customer WhatsApp alerts for each fulfillment state.
-- The browser has no access. A row is created atomically with each real state
-- transition and delivered asynchronously through a dedicated Runia canvas.

create table if not exists public.commerce_order_status_notifications (
  id bigint generated always as identity primary key,
  tenant_id text not null,
  order_id bigint not null references public.commerce_orders(id) on delete restrict,
  target_status text not null,
  status text not null default 'pending',
  attempt_count integer not null default 0,
  provider_message_id text,
  last_error_code text,
  last_error_summary text,
  sent_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint commerce_order_status_notifications_target_check check (
    target_status in ('new', 'confirmed', 'preparing', 'ready', 'delivered', 'cancelled')
  ),
  constraint commerce_order_status_notifications_status_check check (
    status in ('pending', 'sending', 'sent', 'failed', 'unknown')
  ),
  constraint commerce_order_status_notifications_attempt_count_check check (
    attempt_count >= 0
  ),
  constraint commerce_order_status_notifications_error_summary_check check (
    last_error_summary is null or char_length(last_error_summary) <= 240
  ),
  constraint commerce_order_status_notifications_order_status_key unique (
    tenant_id, order_id, target_status
  )
);

create index if not exists commerce_order_status_notifications_status_idx
  on public.commerce_order_status_notifications (tenant_id, status, created_at desc);
create index if not exists commerce_order_status_notifications_order_idx
  on public.commerce_order_status_notifications (order_id);

create trigger commerce_order_status_notifications_set_updated_at
before update on public.commerce_order_status_notifications
for each row execute function lombardo_private.set_updated_at();

create or replace function public.lombardo_claim_order_status_notification(
  p_tenant_id text,
  p_order_id bigint,
  p_target_status text,
  p_allow_retry boolean default false
)
returns table (claimed boolean, notification_record jsonb)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_notification public.commerce_order_status_notifications%rowtype;
begin
  if p_target_status not in ('new', 'confirmed', 'preparing', 'ready', 'delivered', 'cancelled') then
    raise exception 'unsupported fulfillment status' using errcode = '22023';
  end if;

  if not exists (
    select 1 from public.commerce_orders order_record
    where order_record.id = p_order_id
      and order_record.tenant_id = p_tenant_id
  ) then
    raise exception 'order not found' using errcode = 'P0002';
  end if;

  insert into public.commerce_order_status_notifications (
    tenant_id, order_id, target_status
  ) values (
    p_tenant_id, p_order_id, p_target_status
  ) on conflict (tenant_id, order_id, target_status) do nothing;

  select * into v_notification
  from public.commerce_order_status_notifications
  where tenant_id = p_tenant_id
    and order_id = p_order_id
    and target_status = p_target_status
  for update;

  if v_notification.status = 'pending'
    or (p_allow_retry and v_notification.status = 'failed') then
    update public.commerce_order_status_notifications
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

create or replace function public.lombardo_transition_fulfillment_status(
  p_tenant_id text,
  p_order_id bigint,
  p_expected_status text,
  p_target_status text,
  p_operator_user_id uuid
)
returns table (changed boolean, order_record jsonb)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_order public.commerce_orders%rowtype;
  v_now timestamptz := now();
  v_current_status text;
begin
  if not exists (
    select 1 from public.lombardo_admin_operators operator
    where operator.tenant_id = p_tenant_id
      and operator.auth_user_id = p_operator_user_id
      and operator.active
  ) then
    raise exception 'operator not authorized' using errcode = '42501';
  end if;

  select * into v_order
  from public.commerce_orders
  where id = p_order_id and tenant_id = p_tenant_id
  for update;

  if not found then
    raise exception 'order not found' using errcode = 'P0002';
  end if;

  v_current_status := coalesce(
    v_order.fulfillment_status,
    case
      when v_order.order_status = 'cancelled' then 'cancelled'
      when v_order.order_status = 'confirmed' then 'confirmed'
      else 'new'
    end
  );

  if v_current_status = p_target_status then
    return query select false, to_jsonb(v_order);
    return;
  end if;

  if v_current_status <> p_expected_status then
    raise exception 'order status changed' using errcode = '40001';
  end if;

  if not (
    (p_expected_status = 'new' and p_target_status in ('confirmed', 'cancelled'))
    or (p_expected_status = 'confirmed' and p_target_status in ('preparing', 'cancelled'))
    or (p_expected_status = 'preparing' and p_target_status in ('ready', 'cancelled'))
    or (p_expected_status = 'ready' and p_target_status in ('delivered', 'cancelled'))
  ) then
    raise exception 'invalid fulfillment transition' using errcode = '22023';
  end if;

  if p_target_status = 'cancelled' and v_order.payment_status = 'approved' then
    raise exception 'approved order requires refund workflow' using errcode = '22023';
  end if;

  update public.commerce_orders
  set
    fulfillment_status = p_target_status,
    fulfillment_updated_at = v_now,
    fulfillment_updated_by = p_operator_user_id,
    confirmed_at = case when p_target_status = 'confirmed' then v_now else confirmed_at end,
    preparing_at = case when p_target_status = 'preparing' then v_now else preparing_at end,
    ready_at = case when p_target_status = 'ready' then v_now else ready_at end,
    delivered_at = case when p_target_status = 'delivered' then v_now else delivered_at end,
    cancelled_at = case when p_target_status = 'cancelled' then v_now else cancelled_at end,
    order_status = case when p_target_status = 'cancelled' then 'cancelled' else order_status end
  where id = p_order_id and tenant_id = p_tenant_id
  returning * into v_order;

  insert into public.commerce_order_fulfillment_events (
    tenant_id, order_id, from_status, to_status, operator_user_id
  ) values (
    p_tenant_id, p_order_id, v_current_status, p_target_status, p_operator_user_id
  );

  insert into public.commerce_order_status_notifications (
    tenant_id, order_id, target_status
  ) values (
    p_tenant_id, p_order_id, p_target_status
  ) on conflict (tenant_id, order_id, target_status) do nothing;

  return query select true, to_jsonb(v_order);
end;
$$;

alter table public.commerce_order_status_notifications enable row level security;
alter table public.commerce_order_status_notifications force row level security;

revoke all on table public.commerce_order_status_notifications
  from public, anon, authenticated;
revoke all on function public.lombardo_claim_order_status_notification(text, bigint, text, boolean)
  from public, anon, authenticated;
revoke all on function public.lombardo_transition_fulfillment_status(text, bigint, text, text, uuid)
  from public, anon, authenticated;

grant select, insert, update on table public.commerce_order_status_notifications to service_role;
grant usage, select on sequence public.commerce_order_status_notifications_id_seq to service_role;
grant execute on function public.lombardo_claim_order_status_notification(text, bigint, text, boolean)
  to service_role;
grant execute on function public.lombardo_transition_fulfillment_status(text, bigint, text, text, uuid)
  to service_role;

comment on table public.commerce_order_status_notifications is
  'Server-only outbox: at most one customer WhatsApp alert per order and fulfillment state.';
