-- Preserve the current Admin order-management transition rules after the
-- Runia WhatsApp outbox migration. The latter was authored before manual
-- bidirectional status editing was introduced.

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
