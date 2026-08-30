-- Keep HITO 5 alerts aligned with the effective Lombardo selling price. The
-- fallback remains VINROS retail when no human-approved override exists.

do $migration$
declare
  v_definition text;
  v_old_fragment text := $fragment$select price.current_price into v_retail_price
      from public.supplier_prices price
      join public.supplier_products product on product.id = price.supplier_product_id
      join public.suppliers supplier on supplier.id = product.supplier_id
      where price.supplier_product_id = v_active_match.runia_product_id
        and price.price_type = 'retail' and supplier.tenant_id = v_competitor.tenant_id;$fragment$;
  v_new_fragment text := $fragment$select coalesce(selling.current_price, price.current_price) into v_retail_price
      from public.supplier_prices price
      join public.supplier_products product on product.id = price.supplier_product_id
      join public.suppliers supplier on supplier.id = product.supplier_id
      left join public.lombardo_selling_prices selling
        on selling.tenant_id = v_competitor.tenant_id
       and selling.supplier_product_id = product.id
       and selling.price_type = 'retail'
       and selling.active is true
      where price.supplier_product_id = v_active_match.runia_product_id
        and price.price_type = 'retail' and supplier.tenant_id = v_competitor.tenant_id;$fragment$;
begin
  select pg_catalog.pg_get_functiondef(
    'public.lombardo_ingest_competitor_snapshot(uuid,text,integer,integer,jsonb)'::regprocedure
  ) into v_definition;
  if pg_catalog.strpos(v_definition, v_old_fragment) = 0 then
    raise exception using errcode = '55000', message = 'COMPETITOR_ALERT_PRICE_FRAGMENT_NOT_FOUND';
  end if;
  execute pg_catalog.replace(v_definition, v_old_fragment, v_new_fragment);
end;
$migration$;

