-- Keep the opportunity guardrail safe across the three tables that invoke it.
-- PostgreSQL records only expose columns from the triggering table, so field
-- access must be resolved before entering the shared query.

create or replace function public.lombardo_opportunity_guardrail()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_record record;
  v_product_id uuid;
  v_selling_price_id uuid;
  v_product_active boolean := true;
  v_product_eligibility text := 'safe';
  v_effective_price numeric;
  v_cost numeric;
  v_minimum_margin numeric;
  v_reason text;
begin
  if tg_table_name = 'supplier_prices' then
    if new.price_type <> 'cost' then
      return new;
    end if;
    v_product_id := new.supplier_product_id;
  elsif tg_table_name = 'supplier_products' then
    v_product_id := new.id;
    v_product_active := new.active;
    v_product_eligibility := new.eligibility_status;
  elsif tg_table_name = 'lombardo_selling_prices' then
    v_selling_price_id := new.id;
  else
    return new;
  end if;

  for v_record in
    select opportunity.*
    from public.lombardo_product_opportunities opportunity
    where opportunity.opportunity is true
      and (
        (v_product_id is not null and opportunity.supplier_product_id = v_product_id)
        or (v_selling_price_id is not null and opportunity.selling_price_id = v_selling_price_id)
      )
    for update of opportunity
  loop
    select selling.current_price into v_effective_price
    from public.lombardo_selling_prices selling
    where selling.id = v_record.selling_price_id;

    select price.current_price into v_cost
    from public.supplier_prices price
    where price.supplier_product_id = v_record.supplier_product_id
      and price.price_type = 'cost';

    select settings.minimum_margin_pct into v_minimum_margin
    from public.pricing_intelligence_settings settings
    where settings.tenant_id = v_record.tenant_id;

    v_reason := null;
    if tg_table_name = 'supplier_products'
       and (v_product_active is not true or v_product_eligibility <> 'safe') then
      v_reason := 'PRODUCT_NOT_SAFE';
    elsif v_effective_price is null or v_effective_price >= v_record.reference_price then
      v_reason := 'INVALID_PRICE_RELATION';
    elsif v_cost is null or v_effective_price <= v_cost
       or ((v_effective_price - v_cost) / v_effective_price) * 100 < v_minimum_margin then
      v_reason := 'MARGIN_FLOOR';
    end if;

    if v_reason is not null then
      update public.lombardo_product_opportunities
      set opportunity = false,
          disabled_reason = v_reason
      where id = v_record.id;

      insert into public.lombardo_opportunity_history (
        opportunity_id,
        tenant_id,
        supplier_product_id,
        action,
        reference_price,
        selling_price,
        supplier_cost,
        review_at,
        metadata
      ) values (
        v_record.id,
        v_record.tenant_id,
        v_record.supplier_product_id,
        'GUARDRAIL_DISABLED',
        v_record.reference_price,
        coalesce(v_effective_price, v_record.reference_price),
        v_cost,
        v_record.opportunity_review_at,
        jsonb_build_object('reason', v_reason)
      );
    end if;
  end loop;

  return new;
end;
$$;

revoke all on function public.lombardo_opportunity_guardrail()
  from public, anon, authenticated;

