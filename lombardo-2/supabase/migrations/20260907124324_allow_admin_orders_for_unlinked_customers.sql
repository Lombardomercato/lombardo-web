-- Manual admin orders may target active customer accounts that do not have a
-- storefront login yet. Customer-facing sources remain restricted to accounts
-- linked to an Auth user.
create or replace function lombardo_private.prepare_customer_order_pricing()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_tenant_id uuid;
  v_policy text;
  v_discount numeric;
begin
  select tenant.id
  into v_tenant_id
  from public.tenants tenant
  where tenant.slug = new.tenant_id
    and tenant.status = 'active';

  if not found then
    raise exception using
      errcode = '23503',
      message = 'HITO2_ORDER_TENANT_NOT_FOUND';
  end if;

  if new.tenant_record_id is null then
    new.tenant_record_id := v_tenant_id;
  elsif new.tenant_record_id <> v_tenant_id then
    raise exception using
      errcode = '23503',
      message = 'HITO2_ORDER_TENANT_MISMATCH';
  end if;

  if new.customer_account_id is null then
    new.pricing_policy := 'RETAIL';
    new.discount_percent := 0;
    new.base_subtotal := coalesce(new.base_subtotal, new.subtotal);
    new.pricing_discount_amount := coalesce(new.pricing_discount_amount, 0);
    return new;
  end if;

  select account.pricing_policy, account.discount_percent
  into v_policy, v_discount
  from public.customer_accounts account
  where account.tenant_id = v_tenant_id
    and account.id = new.customer_account_id
    and account.status = 'active'
    and (
      new.order_source = 'admin_manual'
      or account.auth_user_id is not null
    );

  if not found then
    raise exception using
      errcode = '23503',
      message = 'HITO2_ORDER_CUSTOMER_NOT_ACTIVE';
  end if;

  new.pricing_policy := v_policy;
  new.discount_percent := v_discount;

  if new.base_subtotal is null then
    if v_discount = 0 then
      new.base_subtotal := new.subtotal;
    else
      raise exception using
        errcode = '23514',
        message = 'HITO2_ORDER_BASE_SUBTOTAL_REQUIRED';
    end if;
  end if;

  if new.pricing_discount_amount is null then
    if v_discount = 0 then
      new.pricing_discount_amount := 0;
    else
      raise exception using
        errcode = '23514',
        message = 'HITO2_ORDER_DISCOUNT_SNAPSHOT_REQUIRED';
    end if;
  end if;

  return new;
end;
$$;
