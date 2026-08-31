-- Hito 6.1: commercial opportunities are a private, audited presentation layer
-- over human-approved Lombardo selling prices. VINROS supplier_prices remain read-only.

create table public.lombardo_product_opportunities (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  supplier_product_id uuid not null references public.supplier_products(id) on delete restrict,
  selling_price_id uuid not null references public.lombardo_selling_prices(id) on delete restrict,
  reference_price numeric(18, 2) not null,
  reference_source text not null default 'LOMBARDO_EFFECTIVE_PRICE',
  opportunity boolean not null default true,
  opportunity_start timestamptz not null default now(),
  opportunity_review_at timestamptz not null,
  published_by uuid not null references auth.users(id) on delete restrict,
  disabled_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint lombardo_product_opportunities_product_key unique (tenant_id, supplier_product_id),
  constraint lombardo_product_opportunities_reference_check check (reference_price > 0),
  constraint lombardo_product_opportunities_source_check check (reference_source = 'LOMBARDO_EFFECTIVE_PRICE'),
  constraint lombardo_product_opportunities_dates_check check (opportunity_review_at > opportunity_start)
);

create index lombardo_product_opportunities_live_idx
  on public.lombardo_product_opportunities (tenant_id, opportunity, opportunity_start, opportunity_review_at);
create index lombardo_product_opportunities_selling_idx
  on public.lombardo_product_opportunities (selling_price_id);
create index lombardo_product_opportunities_publisher_idx
  on public.lombardo_product_opportunities (published_by);

create table public.lombardo_opportunity_history (
  id bigint generated always as identity primary key,
  opportunity_id uuid not null references public.lombardo_product_opportunities(id) on delete restrict,
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  supplier_product_id uuid not null references public.supplier_products(id) on delete restrict,
  action text not null,
  reference_price numeric(18, 2) not null,
  selling_price numeric(18, 2) not null,
  supplier_cost numeric(18, 2),
  review_at timestamptz not null,
  actor_id uuid references auth.users(id) on delete set null,
  occurred_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb,
  constraint lombardo_opportunity_history_action_check check (
    action in ('PUBLISHED', 'REMOVED', 'REVIEW_SCHEDULED', 'GUARDRAIL_DISABLED')
  ),
  constraint lombardo_opportunity_history_reference_check check (reference_price > 0),
  constraint lombardo_opportunity_history_selling_check check (selling_price > 0),
  constraint lombardo_opportunity_history_cost_check check (supplier_cost is null or supplier_cost > 0),
  constraint lombardo_opportunity_history_metadata_check check (jsonb_typeof(metadata) = 'object')
);

create index lombardo_opportunity_history_product_idx
  on public.lombardo_opportunity_history (tenant_id, supplier_product_id, occurred_at desc);
create index lombardo_opportunity_history_opportunity_idx
  on public.lombardo_opportunity_history (opportunity_id, occurred_at desc);
create index lombardo_opportunity_history_actor_idx
  on public.lombardo_opportunity_history (actor_id) where actor_id is not null;

create trigger lombardo_product_opportunities_set_updated_at
before update on public.lombardo_product_opportunities
for each row execute function lombardo_private.set_updated_at();

create or replace function public.lombardo_publish_opportunity(
  p_tenant_id uuid,
  p_supplier_product_id uuid,
  p_new_price numeric,
  p_expected_current_price numeric,
  p_expected_version bigint,
  p_expected_supplier_cost numeric,
  p_expected_competitor_product_id uuid,
  p_expected_competitor_price numeric,
  p_expected_competitor_fetched_at timestamptz,
  p_review_at timestamptz,
  p_approved_by uuid
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_result jsonb;
  v_selling public.lombardo_selling_prices%rowtype;
  v_opportunity public.lombardo_product_opportunities%rowtype;
begin
  if p_new_price is null or p_expected_current_price is null
     or p_new_price >= p_expected_current_price then
    raise exception using errcode = '23514', message = 'OPPORTUNITY_PRICE_MUST_BE_LOWER';
  end if;
  if p_review_at is null or p_review_at <= pg_catalog.now()
     or p_review_at > pg_catalog.now() + interval '90 days' then
    raise exception using errcode = '22023', message = 'INVALID_OPPORTUNITY_REVIEW_AT';
  end if;
  perform 1
  from public.supplier_product_public_media media
  where media.supplier_product_id = p_supplier_product_id
  limit 1;
  if not found then
    raise exception using errcode = '23514', message = 'PUBLIC_IMAGE_REQUIRED';
  end if;

  v_result := public.lombardo_set_selling_price(
    p_tenant_id,
    p_supplier_product_id,
    p_new_price,
    'PROMOTION',
    'PRICING_INTELLIGENCE',
    p_approved_by,
    p_expected_current_price,
    p_expected_version,
    p_expected_supplier_cost,
    p_expected_competitor_product_id,
    p_expected_competitor_price,
    p_expected_competitor_fetched_at,
    false
  );

  select selling.* into strict v_selling
  from public.lombardo_selling_prices selling
  where selling.tenant_id = p_tenant_id
    and selling.supplier_product_id = p_supplier_product_id
    and selling.price_type = 'retail'
    and selling.active is true;

  insert into public.lombardo_product_opportunities (
    tenant_id, supplier_product_id, selling_price_id, reference_price,
    reference_source, opportunity, opportunity_start, opportunity_review_at,
    published_by, disabled_reason
  ) values (
    p_tenant_id, p_supplier_product_id, v_selling.id,
    round(p_expected_current_price, 2), 'LOMBARDO_EFFECTIVE_PRICE', true,
    pg_catalog.now(), p_review_at, p_approved_by, null
  )
  on conflict (tenant_id, supplier_product_id) do update set
    selling_price_id = excluded.selling_price_id,
    reference_price = excluded.reference_price,
    reference_source = excluded.reference_source,
    opportunity = true,
    opportunity_start = excluded.opportunity_start,
    opportunity_review_at = excluded.opportunity_review_at,
    published_by = excluded.published_by,
    disabled_reason = null
  returning * into v_opportunity;

  insert into public.lombardo_opportunity_history (
    opportunity_id, tenant_id, supplier_product_id, action, reference_price,
    selling_price, supplier_cost, review_at, actor_id, metadata
  ) values (
    v_opportunity.id, p_tenant_id, p_supplier_product_id, 'PUBLISHED',
    v_opportunity.reference_price, v_selling.current_price,
    p_expected_supplier_cost, p_review_at, p_approved_by,
    jsonb_build_object(
      'sellingPriceVersion', v_selling.version,
      'competitorProductId', p_expected_competitor_product_id,
      'competitorPrice', p_expected_competitor_price,
      'referenceSource', v_opportunity.reference_source
    )
  );
  return v_result || jsonb_build_object(
    'opportunityId', v_opportunity.id,
    'referencePrice', v_opportunity.reference_price,
    'reviewAt', v_opportunity.opportunity_review_at
  );
end;
$$;

create or replace function public.lombardo_remove_opportunity(
  p_tenant_id uuid,
  p_supplier_product_id uuid,
  p_operator_id uuid,
  p_reason text default 'REMOVED_BY_OPERATOR'
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_opportunity public.lombardo_product_opportunities%rowtype;
  v_selling_price numeric;
  v_cost numeric;
begin
  select opportunity.* into v_opportunity
  from public.lombardo_product_opportunities opportunity
  where opportunity.tenant_id = p_tenant_id
    and opportunity.supplier_product_id = p_supplier_product_id
  for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'PUBLISHED_OPPORTUNITY_NOT_FOUND';
  end if;
  select selling.current_price into v_selling_price
  from public.lombardo_selling_prices selling where selling.id = v_opportunity.selling_price_id;
  select price.current_price into v_cost from public.supplier_prices price
  where price.supplier_product_id = p_supplier_product_id and price.price_type = 'cost';
  update public.lombardo_product_opportunities set
    opportunity = false,
    disabled_reason = coalesce(nullif(btrim(p_reason), ''), 'REMOVED_BY_OPERATOR')
  where id = v_opportunity.id;
  insert into public.lombardo_opportunity_history (
    opportunity_id, tenant_id, supplier_product_id, action, reference_price,
    selling_price, supplier_cost, review_at, actor_id, metadata
  ) values (
    v_opportunity.id, p_tenant_id, p_supplier_product_id, 'REMOVED',
    v_opportunity.reference_price, v_selling_price, v_cost,
    v_opportunity.opportunity_review_at, p_operator_id,
    jsonb_build_object('reason', coalesce(nullif(btrim(p_reason), ''), 'REMOVED_BY_OPERATOR'))
  );
end;
$$;

create or replace function public.lombardo_schedule_opportunity_review(
  p_tenant_id uuid,
  p_supplier_product_id uuid,
  p_review_at timestamptz,
  p_operator_id uuid
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_opportunity public.lombardo_product_opportunities%rowtype;
  v_selling_price numeric;
  v_cost numeric;
begin
  if p_review_at <= pg_catalog.now() or p_review_at > pg_catalog.now() + interval '90 days' then
    raise exception using errcode = '22023', message = 'INVALID_OPPORTUNITY_REVIEW_AT';
  end if;
  update public.lombardo_product_opportunities opportunity set opportunity_review_at = p_review_at
  where opportunity.tenant_id = p_tenant_id
    and opportunity.supplier_product_id = p_supplier_product_id
  returning * into v_opportunity;
  if not found then
    raise exception using errcode = 'P0002', message = 'PUBLISHED_OPPORTUNITY_NOT_FOUND';
  end if;
  select selling.current_price into v_selling_price
  from public.lombardo_selling_prices selling where selling.id = v_opportunity.selling_price_id;
  select price.current_price into v_cost from public.supplier_prices price
  where price.supplier_product_id = p_supplier_product_id and price.price_type = 'cost';
  insert into public.lombardo_opportunity_history (
    opportunity_id, tenant_id, supplier_product_id, action, reference_price,
    selling_price, supplier_cost, review_at, actor_id
  ) values (
    v_opportunity.id, p_tenant_id, p_supplier_product_id, 'REVIEW_SCHEDULED',
    v_opportunity.reference_price, v_selling_price, v_cost, p_review_at, p_operator_id
  );
end;
$$;

create or replace function public.lombardo_opportunity_guardrail()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_record record;
  v_effective_price numeric;
  v_cost numeric;
  v_minimum_margin numeric;
  v_reason text;
begin
  for v_record in
    select opportunity.*, supplier.tenant_id as product_tenant_id
    from public.lombardo_product_opportunities opportunity
    join public.supplier_products product on product.id = opportunity.supplier_product_id
    join public.suppliers supplier on supplier.id = product.supplier_id
    where opportunity.opportunity is true
      and (
        (tg_table_name = 'supplier_prices' and opportunity.supplier_product_id = new.supplier_product_id and new.price_type = 'cost')
        or (tg_table_name = 'supplier_products' and opportunity.supplier_product_id = new.id)
        or (tg_table_name = 'lombardo_selling_prices' and opportunity.selling_price_id = new.id)
      )
    for update of opportunity
  loop
    select selling.current_price into v_effective_price
    from public.lombardo_selling_prices selling where selling.id = v_record.selling_price_id;
    select price.current_price into v_cost
    from public.supplier_prices price
    where price.supplier_product_id = v_record.supplier_product_id and price.price_type = 'cost';
    select settings.minimum_margin_pct into v_minimum_margin
    from public.pricing_intelligence_settings settings where settings.tenant_id = v_record.tenant_id;

    v_reason := null;
    if tg_table_name = 'supplier_products' and (new.active is not true or new.eligibility_status <> 'safe') then
      v_reason := 'PRODUCT_NOT_SAFE';
    elsif v_effective_price is null or v_effective_price >= v_record.reference_price then
      v_reason := 'INVALID_PRICE_RELATION';
    elsif v_cost is null or v_effective_price <= v_cost
       or ((v_effective_price - v_cost) / v_effective_price) * 100 < v_minimum_margin then
      v_reason := 'MARGIN_FLOOR';
    end if;

    if v_reason is not null then
      update public.lombardo_product_opportunities set
        opportunity = false, disabled_reason = v_reason
      where id = v_record.id;
      insert into public.lombardo_opportunity_history (
        opportunity_id, tenant_id, supplier_product_id, action, reference_price,
        selling_price, supplier_cost, review_at, metadata
      ) values (
        v_record.id, v_record.tenant_id, v_record.supplier_product_id,
        'GUARDRAIL_DISABLED', v_record.reference_price,
        coalesce(v_effective_price, v_record.reference_price), v_cost,
        v_record.opportunity_review_at, jsonb_build_object('reason', v_reason)
      );
    end if;
  end loop;
  return new;
end;
$$;

create or replace function public.lombardo_published_opportunities(p_tenant_id uuid)
returns table (
  opportunity_id uuid,
  runia_product_id uuid,
  runia_sku text,
  runia_name text,
  eligibility_status text,
  product_active boolean,
  reference_price numeric,
  selling_price numeric,
  selling_price_version bigint,
  supplier_cost numeric,
  supplier_retail numeric,
  opportunity boolean,
  opportunity_start timestamptz,
  opportunity_review_at timestamptz,
  disabled_reason text
)
language sql
stable
security invoker
set search_path = ''
as $$
  select
    published.id,
    product.id,
    product.supplier_sku,
    product.name_raw,
    product.eligibility_status,
    product.active,
    published.reference_price,
    selling.current_price,
    selling.version,
    prices.supplier_cost,
    prices.supplier_retail,
    published.opportunity,
    published.opportunity_start,
    published.opportunity_review_at,
    published.disabled_reason
  from public.lombardo_product_opportunities published
  join public.supplier_products product on product.id = published.supplier_product_id
  join public.suppliers supplier on supplier.id = product.supplier_id and supplier.tenant_id = p_tenant_id
  join public.lombardo_selling_prices selling on selling.id = published.selling_price_id
  left join lateral (
    select
      max(price.current_price) filter (where price.price_type = 'cost') as supplier_cost,
      max(price.current_price) filter (where price.price_type = 'retail') as supplier_retail
    from public.supplier_prices price
    where price.supplier_product_id = product.id
  ) prices on true
  where published.tenant_id = p_tenant_id
  order by published.opportunity desc, published.opportunity_start desc, product.name_raw;
$$;

create trigger lombardo_opportunity_cost_guardrail
after update of current_price on public.supplier_prices
for each row execute function public.lombardo_opportunity_guardrail();
create trigger lombardo_opportunity_eligibility_guardrail
after update of active, eligibility_status on public.supplier_products
for each row execute function public.lombardo_opportunity_guardrail();
create trigger lombardo_opportunity_selling_guardrail
after update of current_price, active on public.lombardo_selling_prices
for each row execute function public.lombardo_opportunity_guardrail();

alter table public.lombardo_product_opportunities enable row level security;
alter table public.lombardo_opportunity_history enable row level security;
alter table public.lombardo_product_opportunities force row level security;
alter table public.lombardo_opportunity_history force row level security;

revoke all on table public.lombardo_product_opportunities,
  public.lombardo_opportunity_history from public, anon, authenticated, service_role;
grant select, insert, update on table public.lombardo_product_opportunities to service_role;
grant select, insert on table public.lombardo_opportunity_history to service_role;
grant usage, select on sequence public.lombardo_opportunity_history_id_seq to service_role;

revoke all on function public.lombardo_publish_opportunity(uuid, uuid, numeric, numeric, bigint, numeric, uuid, numeric, timestamptz, timestamptz, uuid)
  from public, anon, authenticated;
revoke all on function public.lombardo_remove_opportunity(uuid, uuid, uuid, text)
  from public, anon, authenticated;
revoke all on function public.lombardo_schedule_opportunity_review(uuid, uuid, timestamptz, uuid)
  from public, anon, authenticated;
revoke all on function public.lombardo_opportunity_guardrail()
  from public, anon, authenticated;
revoke all on function public.lombardo_published_opportunities(uuid)
  from public, anon, authenticated;
grant execute on function public.lombardo_publish_opportunity(uuid, uuid, numeric, numeric, bigint, numeric, uuid, numeric, timestamptz, timestamptz, uuid)
  to service_role;
grant execute on function public.lombardo_remove_opportunity(uuid, uuid, uuid, text)
  to service_role;
grant execute on function public.lombardo_schedule_opportunity_review(uuid, uuid, timestamptz, uuid)
  to service_role;
grant execute on function public.lombardo_published_opportunities(uuid)
  to service_role;

comment on table public.lombardo_product_opportunities is
  'Private, human-published opportunity presentation state backed by a real Lombardo selling price.';
comment on table public.lombardo_opportunity_history is
  'Immutable audit of opportunity publication, review scheduling and safe deactivation.';
comment on function public.lombardo_publish_opportunity(uuid, uuid, numeric, numeric, bigint, numeric, uuid, numeric, timestamptz, timestamptz, uuid) is
  'Atomic human-only publication: revalidates SAFE, media, cost, competitor, margin and selling-price version.';
