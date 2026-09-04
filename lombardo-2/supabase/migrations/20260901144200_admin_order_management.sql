-- Manual order status and payment operations for Lombardo Admin.
-- Delivery pricing reuses the existing immutable management snapshot.

alter table public.commerce_orders
  drop constraint if exists commerce_orders_payment_method_check;

alter table public.commerce_orders
  add constraint commerce_orders_payment_method_check check (
    payment_method in (
      'mercado_pago', 'whatsapp_coordination', 'bank_transfer', 'cash'
    )
  ),
  add column if not exists payment_manually_updated_at timestamptz,
  add column if not exists payment_manually_updated_by uuid;

do $admin_order_constraints$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.commerce_orders'::regclass
      and conname = 'commerce_orders_payment_manually_updated_by_fkey'
  ) then
    alter table public.commerce_orders
      add constraint commerce_orders_payment_manually_updated_by_fkey
      foreign key (payment_manually_updated_by) references auth.users(id) on delete set null;
  end if;
end;
$admin_order_constraints$;

alter table public.commerce_order_management_events
  drop constraint if exists commerce_order_management_events_action_check;

alter table public.commerce_order_management_events
  add constraint commerce_order_management_events_action_check check (
    action in ('manual_created', 'management_updated', 'payment_updated')
  );

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
    select 1
    from public.lombardo_admin_operators operator
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

  if p_target_status not in (
    'new', 'confirmed', 'preparing', 'ready', 'delivered', 'cancelled'
  ) or v_current_status = 'cancelled' then
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
    confirmed_at = case
      when p_target_status = 'new' then null
      when p_target_status = 'confirmed' then v_now
      else confirmed_at
    end,
    preparing_at = case
      when p_target_status in ('new', 'confirmed') then null
      when p_target_status = 'preparing' then v_now
      else preparing_at
    end,
    ready_at = case
      when p_target_status in ('new', 'confirmed', 'preparing') then null
      when p_target_status = 'ready' then v_now
      else ready_at
    end,
    delivered_at = case
      when p_target_status = 'delivered' then v_now
      else null
    end,
    cancelled_at = case
      when p_target_status = 'cancelled' then v_now
      else null
    end,
    order_status = case
      when p_target_status = 'cancelled' then 'cancelled'
      else order_status
    end
  where id = p_order_id and tenant_id = p_tenant_id
  returning * into v_order;

  insert into public.commerce_order_fulfillment_events (
    tenant_id,
    order_id,
    from_status,
    to_status,
    operator_user_id
  ) values (
    p_tenant_id,
    p_order_id,
    v_current_status,
    p_target_status,
    p_operator_user_id
  );

  return query select true, to_jsonb(v_order);
end;
$$;

create or replace function public.lombardo_admin_update_payment(
  p_tenant_id text,
  p_order_id bigint,
  p_expected_status text,
  p_expected_method text,
  p_target_status text,
  p_target_method text,
  p_operator_user_id uuid
)
returns table (changed boolean, event_id bigint, order_record jsonb)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_order public.commerce_orders%rowtype;
  v_event_id bigint;
  v_now timestamptz := now();
begin
  if not exists (
    select 1
    from public.lombardo_admin_operators operator
    where operator.tenant_id = p_tenant_id
      and operator.auth_user_id = p_operator_user_id
      and operator.active
  ) then
    raise exception 'operator not authorized' using errcode = '42501';
  end if;

  if p_target_status not in ('pending', 'approved', 'rejected', 'cancelled', 'refunded')
    or p_target_method not in ('mercado_pago', 'whatsapp_coordination', 'bank_transfer', 'cash') then
    raise exception 'invalid payment update' using errcode = '22023';
  end if;

  select * into v_order
  from public.commerce_orders
  where id = p_order_id and tenant_id = p_tenant_id
  for update;

  if not found then
    raise exception 'order not found' using errcode = 'P0002';
  end if;

  if v_order.payment_status <> p_expected_status
    or v_order.payment_method <> p_expected_method then
    raise exception 'order payment changed' using errcode = '40001';
  end if;

  if v_order.payment_status = p_target_status
    and v_order.payment_method = p_target_method then
    return query select false, null::bigint, to_jsonb(v_order);
    return;
  end if;

  if coalesce(v_order.fulfillment_status, 'new') = 'cancelled'
    and p_target_status = 'approved' then
    raise exception 'cancelled order cannot be approved' using errcode = '22023';
  end if;

  insert into public.commerce_order_management_events (
    tenant_id,
    order_id,
    action,
    operator_user_id,
    before_snapshot,
    after_snapshot,
    reason
  ) values (
    p_tenant_id,
    p_order_id,
    'payment_updated',
    p_operator_user_id,
    jsonb_build_object(
      'status', v_order.payment_status,
      'method', v_order.payment_method
    ),
    jsonb_build_object(
      'status', p_target_status,
      'method', p_target_method
    ),
    'Actualización manual de pago'
  ) returning id into v_event_id;

  update public.commerce_orders
  set
    payment_status = p_target_status,
    payment_method = p_target_method,
    payment_manually_updated_at = v_now,
    payment_manually_updated_by = p_operator_user_id,
    order_status = case
      when p_target_status = 'approved' then 'confirmed'
      when p_target_status = 'refunded' then 'cancelled'
      when p_target_status in ('pending', 'rejected', 'cancelled')
        and coalesce(fulfillment_status, 'new') <> 'cancelled' then 'pending_payment'
      else order_status
    end
  where id = p_order_id and tenant_id = p_tenant_id
  returning * into v_order;

  return query select true, v_event_id, to_jsonb(v_order);
end;
$$;

alter table public.commerce_order_notifications
  add column if not exists event_key text not null default 'initial';

alter table public.commerce_order_notifications
  drop constraint if exists commerce_order_notifications_order_key,
  drop constraint if exists commerce_order_notifications_kind_check;

alter table public.commerce_order_notifications
  add constraint commerce_order_notifications_kind_check check (
    kind in (
      'new_order',
      'customer_order_confirmation',
      'customer_fulfillment_status',
      'customer_payment_status',
      'customer_delivery_update'
    )
  ),
  add constraint commerce_order_notifications_event_key_check check (
    event_key ~ '^[a-z0-9][a-z0-9:_-]{0,119}$'
  ),
  add constraint commerce_order_notifications_order_key unique (
    tenant_id, order_id, kind, channel, event_key
  );

create or replace function public.lombardo_claim_order_notification_v4(
  p_tenant_id text,
  p_order_id bigint,
  p_kind text,
  p_channel text,
  p_event_key text,
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
  if p_kind not in (
    'new_order',
    'customer_order_confirmation',
    'customer_fulfillment_status',
    'customer_payment_status',
    'customer_delivery_update'
  ) then
    raise exception 'unsupported notification kind' using errcode = '22023';
  end if;

  if p_channel not in ('whatsapp_cloud_api', 'email_resend') then
    raise exception 'unsupported notification channel' using errcode = '22023';
  end if;

  if p_kind = 'customer_order_confirmation' and p_channel <> 'email_resend' then
    raise exception 'unsupported customer notification channel' using errcode = '22023';
  end if;

  if p_event_key !~ '^[a-z0-9][a-z0-9:_-]{0,119}$' then
    raise exception 'invalid notification event key' using errcode = '22023';
  end if;

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
    channel,
    event_key
  ) values (
    p_tenant_id,
    p_order_id,
    p_kind,
    p_channel,
    p_event_key
  )
  on conflict (tenant_id, order_id, kind, channel, event_key) do nothing;

  select * into v_notification
  from public.commerce_order_notifications
  where tenant_id = p_tenant_id
    and order_id = p_order_id
    and kind = p_kind
    and channel = p_channel
    and event_key = p_event_key
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

revoke all on function public.lombardo_admin_update_payment(
  text, bigint, text, text, text, text, uuid
) from public, anon, authenticated;
revoke all on function public.lombardo_claim_order_notification_v4(
  text, bigint, text, text, text, boolean
) from public, anon, authenticated;

grant execute on function public.lombardo_admin_update_payment(
  text, bigint, text, text, text, text, uuid
) to service_role;
grant execute on function public.lombardo_claim_order_notification_v4(
  text, bigint, text, text, text, boolean
) to service_role;

comment on column public.commerce_orders.payment_manually_updated_at is
  'Timestamp of the latest audited payment correction made from Lombardo Admin.';
comment on column public.commerce_order_notifications.event_key is
  'Idempotency key for a specific order update, allowing later status changes.';
