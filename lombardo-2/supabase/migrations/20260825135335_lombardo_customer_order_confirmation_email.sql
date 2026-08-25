-- Add a separate, idempotent customer order-confirmation notification while
-- preserving the existing operational notification channels and RPCs.

alter table public.commerce_order_notifications
  drop constraint commerce_order_notifications_kind_check;

alter table public.commerce_order_notifications
  add constraint commerce_order_notifications_kind_check check (
    kind in ('new_order', 'customer_order_confirmation')
  );

create or replace function public.lombardo_claim_order_notification_v3(
  p_tenant_id text,
  p_order_id bigint,
  p_kind text,
  p_channel text,
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
  if p_kind not in ('new_order', 'customer_order_confirmation') then
    raise exception 'unsupported notification kind' using errcode = '22023';
  end if;

  if p_channel not in ('whatsapp_cloud_api', 'email_resend') then
    raise exception 'unsupported notification channel' using errcode = '22023';
  end if;

  if p_kind = 'customer_order_confirmation' and p_channel <> 'email_resend' then
    raise exception 'unsupported customer notification channel' using errcode = '22023';
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
    channel
  ) values (
    p_tenant_id,
    p_order_id,
    p_kind,
    p_channel
  )
  on conflict (tenant_id, order_id, kind, channel) do nothing;

  select * into v_notification
  from public.commerce_order_notifications
  where tenant_id = p_tenant_id
    and order_id = p_order_id
    and kind = p_kind
    and channel = p_channel
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

revoke all on function public.lombardo_claim_order_notification_v3(
  text,
  bigint,
  text,
  text,
  boolean
) from public, anon, authenticated;

grant execute on function public.lombardo_claim_order_notification_v3(
  text,
  bigint,
  text,
  text,
  boolean
) to service_role;

comment on function public.lombardo_claim_order_notification_v3(
  text,
  bigint,
  text,
  text,
  boolean
) is 'Claims one idempotent operational or customer notification per order, kind, and channel.';
