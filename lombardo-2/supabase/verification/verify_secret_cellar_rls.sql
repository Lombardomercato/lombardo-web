\set ON_ERROR_STOP on
-- Run after HITO 4 in a disposable/local database. Everything rolls back.

begin;

do $fixture$
declare
  v_tenant uuid;
  v_candidates jsonb;
  v_secret uuid;
  v_other uuid;
begin
  select id into strict v_tenant from public.tenants where slug = 'lombardo';
  select jsonb_agg(jsonb_build_object(
      'id', product.id,
      'slug', 'fixture--' || product.id::text,
      'name', product.name_raw,
      'brand', split_part(product.name_raw, ' ', 1),
      'categorySlug', 'vinos',
      'categoryName', 'Vinos',
      'presentation', coalesce(product.normalized_presentation, product.presentation_raw, 'Unidad'),
      'price', price.current_price,
      'imageUrl', ''
    ) order by product.id),
    min(product.id::text)::uuid, max(product.id::text)::uuid
  into v_candidates, v_secret, v_other
  from (
    select product.*
    from public.supplier_products product
    join public.suppliers supplier on supplier.id = product.supplier_id
    join public.supplier_prices price on price.supplier_product_id = product.id and price.price_type = 'retail'
    where supplier.tenant_id = v_tenant and product.active is true
      and product.eligibility_status = 'safe' and price.current_price > 0
    order by product.id
    limit 10
  ) product
  join public.supplier_prices price on price.supplier_product_id = product.id and price.price_type = 'retail';
  if jsonb_array_length(v_candidates) <> 10 then
    raise exception 'HITO4_TEST_FAILED: not enough SAFE fixture products';
  end if;

  insert into public.secret_cellar_settings (tenant_id) values (v_tenant)
  on conflict (tenant_id) do nothing;
  insert into public.secret_cellar_challenges (
    id, tenant_id, challenge_date, status, secret_product_id, candidates, clues,
    reward_percentage, reward_valid_hours, generated_by
  ) values (
    '94000000-0000-4000-8000-000000000001', v_tenant,
    (timezone('America/Argentina/Cordoba', now()))::date, 'ACTIVE', v_secret, v_candidates,
    '[
      {"id":"category","text":"Estoy en la familia de vinos.","source":"CATEGORY"},
      {"id":"price","text":"Mi precio retail es real.","source":"PRICE"},
      {"id":"presentation","text":"Mi presentación está registrada.","source":"PRESENTATION"},
      {"id":"brand","text":"Mi marca empieza con una letra real.","source":"BRAND_INITIAL"}
    ]'::jsonb,
    15, 48, 'DAILY_ENGINE'
  );

  perform public.lombardo_submit_secret_cellar_attempt(
    v_tenant,
    '94000000-0000-4000-8000-000000000001',
    v_secret,
    'guest:' || repeat('a', 64),
    null, 'EMAIL', repeat('a', 64), 't***@example.com'
  );
  perform public.lombardo_submit_secret_cellar_attempt(
    v_tenant,
    '94000000-0000-4000-8000-000000000001',
    v_secret,
    'guest:' || repeat('a', 64),
    null, 'EMAIL', repeat('a', 64), 't***@example.com'
  );
  perform public.lombardo_submit_secret_cellar_attempt(
    v_tenant,
    '94000000-0000-4000-8000-000000000001',
    v_other,
    'guest:' || repeat('b', 64),
    null, 'WHATSAPP', repeat('b', 64), 'WHATSAPP · ***1234'
  );
end;
$fixture$;

do $engine_contract$
declare
  v_tenant uuid;
begin
  select id into strict v_tenant from public.tenants where slug = 'lombardo';
  if (select count(*) from public.secret_cellar_attempts
      where tenant_id = v_tenant and challenge_id = '94000000-0000-4000-8000-000000000001') <> 2 then
    raise exception 'HITO4_TEST_FAILED: idempotent attempt limit failed';
  end if;
  if not exists (
    select 1 from public.secret_cellar_attempts attempt
    join public.commerce_promotions promotion
      on promotion.tenant_id = attempt.tenant_id and promotion.id = attempt.promotion_id
    where attempt.tenant_id = v_tenant and attempt.result = 'FOUND'
      and attempt.coupon_code ~ '^CAVA-[A-F0-9]{8}$'
      and promotion.status = 'ACTIVE'
      and promotion.discount_type = 'PERCENTAGE' and promotion.discount_value = 15
      and promotion.max_total_uses = 1 and promotion.max_uses_per_customer = 1
      and promotion.customer_scope = 'RETAIL' and promotion.stackable is false
      and promotion.end_at between promotion.start_at + interval '47 hours 59 minutes'
        and promotion.start_at + interval '48 hours 1 minute'
  ) then
    raise exception 'HITO4_TEST_FAILED: Promotion Engine reward contract failed';
  end if;
  if exists (
    select 1 from public.secret_cellar_attempts
    where guest_contact_masked like '%test@example.com%'
       or guest_contact_masked like '%3415551234%'
  ) then
    raise exception 'HITO4_TEST_FAILED: raw guest identity persisted';
  end if;
end;
$engine_contract$;

do $current_immutable$
begin
  begin
    update public.secret_cellar_challenges set reward_percentage = 20
    where id = '94000000-0000-4000-8000-000000000001';
    raise exception 'HITO4_TEST_FAILED: current challenge was mutable';
  exception when check_violation then null;
  end;
end;
$current_immutable$;

set local role anon;
do $anon_closed$
declare v_table text;
begin
  foreach v_table in array array[
    'secret_cellar_settings', 'secret_cellar_exclusions',
    'secret_cellar_challenges', 'secret_cellar_attempts'
  ] loop
    begin
      execute format('select 1 from public.%I limit 1', v_table);
      raise exception 'HITO4_TEST_FAILED: anon could read %', v_table;
    exception when insufficient_privilege then null;
    end;
  end loop;
  begin
    perform public.lombardo_submit_secret_cellar_attempt(
      gen_random_uuid(), gen_random_uuid(), gen_random_uuid(),
      'guest:' || repeat('c', 64), null, 'EMAIL', repeat('c', 64), 'x***@x.com'
    );
    raise exception 'HITO4_TEST_FAILED: anon could execute attempt RPC';
  exception when insufficient_privilege then null;
  end;
end;
$anon_closed$;

reset role;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"91000000-0000-4000-8000-000000000001","role":"authenticated"}', true);
select set_config('request.jwt.claim.sub', '91000000-0000-4000-8000-000000000001', true);
do $customer_closed$
declare v_table text;
begin
  foreach v_table in array array[
    'secret_cellar_settings', 'secret_cellar_exclusions',
    'secret_cellar_challenges', 'secret_cellar_attempts'
  ] loop
    begin
      execute format('select 1 from public.%I limit 1', v_table);
      raise exception 'HITO4_TEST_FAILED: customer could read %', v_table;
    exception when insufficient_privilege then null;
    end;
    begin
      execute format('delete from public.%I', v_table);
      raise exception 'HITO4_TEST_FAILED: customer could mutate %', v_table;
    exception when insufficient_privilege then null;
    end;
  end loop;
  begin
    perform public.lombardo_submit_secret_cellar_attempt(
      gen_random_uuid(), gen_random_uuid(), gen_random_uuid(),
      'guest:' || repeat('d', 64), null, 'EMAIL', repeat('d', 64), 'x***@x.com'
    );
    raise exception 'HITO4_TEST_FAILED: customer could execute attempt RPC';
  exception when insufficient_privilege then null;
  end;
end;
$customer_closed$;

reset role;
do $server_contract$
declare v_table text;
begin
  foreach v_table in array array[
    'secret_cellar_settings', 'secret_cellar_exclusions',
    'secret_cellar_challenges', 'secret_cellar_attempts'
  ] loop
    if not exists (
      select 1 from pg_class relation join pg_namespace schema on schema.oid = relation.relnamespace
      where schema.nspname = 'public' and relation.relname = v_table
        and relation.relrowsecurity and relation.relforcerowsecurity
    ) then raise exception 'HITO4_TEST_FAILED: RLS/FORCE missing on %', v_table; end if;
    if has_table_privilege('anon', format('public.%I', v_table), 'SELECT')
      or has_table_privilege('authenticated', format('public.%I', v_table), 'SELECT')
      or has_table_privilege('authenticated', format('public.%I', v_table), 'UPDATE') then
      raise exception 'HITO4_TEST_FAILED: unsafe grant on %', v_table;
    end if;
    if not has_table_privilege('service_role', format('public.%I', v_table), 'SELECT') then
      raise exception 'HITO4_TEST_FAILED: service role cannot read %', v_table;
    end if;
  end loop;
  if has_function_privilege(
      'anon', 'public.lombardo_submit_secret_cellar_attempt(uuid,uuid,uuid,text,uuid,text,text,text)', 'EXECUTE')
    or has_function_privilege(
      'authenticated', 'public.lombardo_submit_secret_cellar_attempt(uuid,uuid,uuid,text,uuid,text,text,text)', 'EXECUTE')
    or not has_function_privilege(
      'service_role', 'public.lombardo_submit_secret_cellar_attempt(uuid,uuid,uuid,text,uuid,text,text,text)', 'EXECUTE') then
    raise exception 'HITO4_TEST_FAILED: attempt RPC grants are unsafe';
  end if;
end;
$server_contract$;

rollback;
\echo 'Runia HITO 4 Secret Cellar/RLS: PASS'
