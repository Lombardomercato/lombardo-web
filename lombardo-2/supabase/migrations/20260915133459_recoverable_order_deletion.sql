-- Recoverable deletion: immutable snapshots, payments and stock stay intact.
-- Only an active tenant admin may move an unpaid, unprocessed order to trash.
alter table public.commerce_orders
  add column if not exists deleted_at timestamptz,
  add column if not exists deleted_by uuid references auth.users(id) on delete restrict,
  add column if not exists deletion_reason text,
  add constraint commerce_orders_deletion_metadata_check check (
    (deleted_at is null and deleted_by is null and deletion_reason is null)
    or (deleted_at is not null and deleted_by is not null and deletion_reason is not null
      and length(btrim(deletion_reason)) between 3 and 500)
  );

create index commerce_orders_active_created_idx
  on public.commerce_orders (tenant_id, created_at desc) where deleted_at is null;
create index commerce_orders_trash_idx
  on public.commerce_orders (tenant_id, deleted_at desc) where deleted_at is not null;

-- Restrictive: does not grant any new browser access or weaken ownership policies.
create policy commerce_orders_hide_deleted on public.commerce_orders
  as restrictive for select to anon, authenticated using (deleted_at is null);

alter table public.commerce_order_management_events
  drop constraint commerce_order_management_events_action_check;
alter table public.commerce_order_management_events
  add constraint commerce_order_management_events_action_check check (
    action in ('manual_created', 'management_updated', 'payment_updated', 'deleted', 'restored')
  );

create or replace function lombardo_private.protect_deleted_order()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  if old.deleted_at is not null and new.deleted_at is not null then
    raise exception 'ORDER_DELETED' using errcode = '55000';
  end if;
  if old.deleted_at is distinct from new.deleted_at then
    if (to_jsonb(new) - array['deleted_at', 'deleted_by', 'deletion_reason', 'updated_at', 'management_revision'])
      is distinct from
      (to_jsonb(old) - array['deleted_at', 'deleted_by', 'deletion_reason', 'updated_at', 'management_revision']) then
      raise exception 'deletion cannot change order snapshots' using errcode = '23514';
    end if;
  end if;
  return new;
end;
$$;
create trigger commerce_orders_protect_deleted
  before update on public.commerce_orders
  for each row execute function lombardo_private.protect_deleted_order();

-- Serialize notification claims with deletion. No queued notification may send
-- after deletion; an already in-flight/unknown delivery prevents deletion.
create or replace function lombardo_private.protect_deleted_order_notification()
returns trigger language plpgsql security invoker set search_path = '' as $$
declare v_deleted_at timestamptz;
begin
  if tg_op = 'INSERT' or new.status = 'sending' then
    select deleted_at into v_deleted_at from public.commerce_orders
      where id = new.order_id and tenant_id = new.tenant_id for update;
    if v_deleted_at is not null then
      raise exception 'ORDER_DELETED' using errcode = '55000';
    end if;
  end if;
  return new;
end;
$$;
create trigger commerce_order_notifications_protect_deleted
  before insert or update of status on public.commerce_order_notifications
  for each row execute function lombardo_private.protect_deleted_order_notification();

create or replace function lombardo_private.protect_deleted_order_proof()
returns trigger language plpgsql security invoker set search_path = '' as $$
declare v_deleted_at timestamptz;
begin
  select deleted_at into v_deleted_at from public.commerce_orders
    where id = new.order_id and tenant_id = new.tenant_id for update;
  if v_deleted_at is not null then raise exception 'ORDER_DELETED' using errcode = '55000'; end if;
  return new;
end;
$$;
create trigger commerce_order_payment_proofs_protect_deleted
  before insert or update on public.commerce_order_payment_proofs
  for each row execute function lombardo_private.protect_deleted_order_proof();

create or replace function public.lombardo_admin_set_order_deleted(
  p_tenant_id text,
  p_order_id bigint,
  p_expected_updated_at timestamptz,
  p_deleted boolean,
  p_reason text,
  p_operator_user_id uuid
)
returns table (changed boolean, order_record jsonb)
language plpgsql security invoker set search_path = '' as $$
declare
  v_order public.commerce_orders%rowtype;
  v_before jsonb;
  v_now timestamptz := clock_timestamp();
  v_reason text := btrim(coalesce(p_reason, ''));
begin
  if not exists (
    select 1 from public.lombardo_admin_operators operator
    where operator.tenant_id = p_tenant_id
      and operator.auth_user_id = p_operator_user_id
      and operator.active and operator.role = 'admin'
  ) then raise exception 'admin not authorized' using errcode = '42501'; end if;
  if p_deleted is null or length(v_reason) not between 3 and 500 then
    raise exception 'deletion reason required' using errcode = '23514';
  end if;
  select * into v_order from public.commerce_orders
    where id = p_order_id and tenant_id = p_tenant_id for update;
  if not found then raise exception 'order not found' using errcode = 'P0002'; end if;
  if p_expected_updated_at is null or v_order.updated_at is distinct from p_expected_updated_at then
    raise exception 'order changed' using errcode = '40001';
  end if;
  if (v_order.deleted_at is not null) = p_deleted then
    return query select false, to_jsonb(v_order); return;
  end if;
  if p_deleted then
    if v_order.payment_status not in ('pending', 'rejected', 'cancelled')
      or coalesce(v_order.fulfillment_status, 'new') not in ('new', 'cancelled')
      or v_order.payment_method = 'mercado_pago'
      or v_order.payment_preference_id is not null or v_order.payment_provider_id is not null then
      raise exception 'ORDER_DELETE_UNSAFE' using errcode = '55000';
    end if;
    if exists (select 1 from public.commerce_order_payment_proofs
      where tenant_id = p_tenant_id and order_id = p_order_id and review_status = 'pending_review') then
      raise exception 'ORDER_PROOF_PENDING' using errcode = '55000';
    end if;
    if exists (select 1 from public.commerce_order_notifications
      where tenant_id = p_tenant_id and order_id = p_order_id and status in ('sending', 'unknown')) then
      raise exception 'ORDER_NOTIFICATION_IN_FLIGHT' using errcode = '55000';
    end if;
  end if;
  v_before := to_jsonb(v_order);
  update public.commerce_orders set
    deleted_at = case when p_deleted then v_now else null end,
    deleted_by = case when p_deleted then p_operator_user_id else null end,
    deletion_reason = case when p_deleted then v_reason else null end,
    management_revision = management_revision + 1,
    updated_at = v_now
    where id = p_order_id and tenant_id = p_tenant_id returning * into v_order;
  insert into public.commerce_order_management_events (
    tenant_id, order_id, action, operator_user_id, before_snapshot, after_snapshot, reason
  ) values (
    p_tenant_id, p_order_id, case when p_deleted then 'deleted' else 'restored' end,
    p_operator_user_id, v_before, to_jsonb(v_order), v_reason
  );
  return query select true, to_jsonb(v_order);
end;
$$;

revoke all on function lombardo_private.protect_deleted_order() from public, anon, authenticated;
revoke all on function lombardo_private.protect_deleted_order_notification() from public, anon, authenticated;
revoke all on function lombardo_private.protect_deleted_order_proof() from public, anon, authenticated;
revoke all on function public.lombardo_admin_set_order_deleted(text, bigint, timestamptz, boolean, text, uuid)
  from public, anon, authenticated;
grant execute on function public.lombardo_admin_set_order_deleted(text, bigint, timestamptz, boolean, text, uuid)
  to service_role;
