-- RUNIA Pricing Intelligence V1.
-- Supplier prices remain VINROS-owned inputs. Lombardo selling prices are a
-- separate, human-approved layer and are never written back to supplier_prices.

create table public.lombardo_selling_prices (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  supplier_product_id uuid not null references public.supplier_products(id) on delete restrict,
  price_type text not null default 'retail',
  current_price numeric(18, 2) not null,
  currency text not null default 'ARS',
  version bigint not null default 1,
  active boolean not null default true,
  reason text not null,
  source text not null,
  approved_by uuid not null references auth.users(id) on delete restrict,
  approved_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint lombardo_selling_prices_product_key unique (tenant_id, supplier_product_id, price_type),
  constraint lombardo_selling_prices_type_check check (price_type = 'retail'),
  constraint lombardo_selling_prices_price_check check (current_price > 0),
  constraint lombardo_selling_prices_currency_check check (currency = 'ARS'),
  constraint lombardo_selling_prices_version_check check (version > 0),
  constraint lombardo_selling_prices_reason_check check (reason in ('MANUAL', 'COMPETITOR_REVIEW', 'PROMOTION', 'OTHER')),
  constraint lombardo_selling_prices_source_check check (source in ('ADMIN', 'PRICING_INTELLIGENCE'))
);

create index lombardo_selling_prices_product_idx
  on public.lombardo_selling_prices (supplier_product_id, active, price_type);
create index lombardo_selling_prices_approved_by_idx
  on public.lombardo_selling_prices (approved_by);

create table public.lombardo_selling_price_history (
  id bigint generated always as identity primary key,
  selling_price_id uuid not null references public.lombardo_selling_prices(id) on delete restrict,
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  supplier_product_id uuid not null references public.supplier_products(id) on delete restrict,
  old_price numeric(18, 2) not null,
  new_price numeric(18, 2) not null,
  reason text not null,
  source text not null,
  approved_by uuid not null references auth.users(id) on delete restrict,
  changed_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb,
  constraint lombardo_selling_price_history_old_check check (old_price > 0),
  constraint lombardo_selling_price_history_new_check check (new_price > 0),
  constraint lombardo_selling_price_history_reason_check check (reason in ('MANUAL', 'COMPETITOR_REVIEW', 'PROMOTION', 'OTHER')),
  constraint lombardo_selling_price_history_source_check check (source in ('ADMIN', 'PRICING_INTELLIGENCE')),
  constraint lombardo_selling_price_history_metadata_check check (jsonb_typeof(metadata) = 'object')
);

create index lombardo_selling_price_history_product_idx
  on public.lombardo_selling_price_history (tenant_id, supplier_product_id, changed_at desc);
create index lombardo_selling_price_history_selling_idx
  on public.lombardo_selling_price_history (selling_price_id, changed_at desc);
create index lombardo_selling_price_history_approved_by_idx
  on public.lombardo_selling_price_history (approved_by);

create table public.pricing_intelligence_settings (
  tenant_id uuid primary key references public.tenants(id) on delete cascade,
  very_competitive_max_pct numeric(8, 2) not null default -10,
  competitive_max_pct numeric(8, 2) not null default -3,
  market_max_pct numeric(8, 2) not null default 3,
  expensive_max_pct numeric(8, 2) not null default 10,
  minimum_margin_pct numeric(8, 2) not null default 20,
  target_margin_pct numeric(8, 2) not null default 30,
  competitor_max_age_hours integer not null default 48,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint pricing_intelligence_position_check check (
    very_competitive_max_pct < competitive_max_pct
    and competitive_max_pct < market_max_pct
    and market_max_pct < expensive_max_pct
  ),
  constraint pricing_intelligence_margin_check check (
    minimum_margin_pct between 0 and 95
    and target_margin_pct between minimum_margin_pct and 95
  ),
  constraint pricing_intelligence_age_check check (competitor_max_age_hours between 1 and 720)
);

insert into public.pricing_intelligence_settings (tenant_id)
select tenant.id from public.tenants tenant
where tenant.status = 'active'
on conflict (tenant_id) do nothing;

create table public.product_commercial_profiles (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  supplier_product_id uuid not null references public.supplier_products(id) on delete cascade,
  sensitivity text not null,
  classification_source text not null default 'manual',
  rule_key text,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint product_commercial_profiles_product_key unique (tenant_id, supplier_product_id),
  constraint product_commercial_profiles_sensitivity_check check (
    sensitivity in ('known_comparable', 'long_tail', 'premium', 'gift', 'traffic_driver')
  ),
  constraint product_commercial_profiles_source_check check (classification_source in ('manual', 'rule')),
  constraint product_commercial_profiles_rule_check check (
    (classification_source = 'manual' and rule_key is null)
    or (classification_source = 'rule' and btrim(rule_key) <> '')
  )
);

create index product_commercial_profiles_product_idx
  on public.product_commercial_profiles (supplier_product_id);
create index product_commercial_profiles_sensitivity_idx
  on public.product_commercial_profiles (tenant_id, sensitivity);
create index product_commercial_profiles_updated_by_idx
  on public.product_commercial_profiles (updated_by) where updated_by is not null;

create table public.pricing_opportunity_decisions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  competitor_product_id uuid not null references public.competitor_products(id) on delete cascade,
  supplier_product_id uuid not null references public.supplier_products(id) on delete cascade,
  status text not null default 'pending',
  note text,
  decided_by uuid references auth.users(id) on delete set null,
  decided_at timestamptz,
  current_price_snapshot numeric(18, 2),
  competitor_price_snapshot numeric(18, 2),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint pricing_opportunity_decisions_key unique (tenant_id, competitor_product_id),
  constraint pricing_opportunity_decisions_status_check check (status in ('pending', 'ignored', 'applied')),
  constraint pricing_opportunity_decisions_current_check check (current_price_snapshot is null or current_price_snapshot > 0),
  constraint pricing_opportunity_decisions_competitor_check check (competitor_price_snapshot is null or competitor_price_snapshot > 0)
);

create index pricing_opportunity_decisions_product_idx
  on public.pricing_opportunity_decisions (supplier_product_id, status, updated_at desc);
create index pricing_opportunity_decisions_operator_idx
  on public.pricing_opportunity_decisions (decided_by) where decided_by is not null;

create trigger lombardo_selling_prices_set_updated_at
before update on public.lombardo_selling_prices
for each row execute function lombardo_private.set_updated_at();
create trigger pricing_intelligence_settings_set_updated_at
before update on public.pricing_intelligence_settings
for each row execute function lombardo_private.set_updated_at();
create trigger product_commercial_profiles_set_updated_at
before update on public.product_commercial_profiles
for each row execute function lombardo_private.set_updated_at();
create trigger pricing_opportunity_decisions_set_updated_at
before update on public.pricing_opportunity_decisions
for each row execute function lombardo_private.set_updated_at();

create or replace function public.lombardo_pricing_opportunities(
  p_tenant_id uuid,
  p_competitor_id uuid
)
returns table (
  competitor_product_id uuid,
  competitor_name text,
  external_name text,
  external_product_url text,
  competitor_price numeric,
  competitor_fetched_at timestamptz,
  competitor_price_changed_at timestamptz,
  runia_product_id uuid,
  runia_sku text,
  runia_name text,
  eligibility_status text,
  category_slug text,
  match_confidence numeric,
  confidence_band text,
  supplier_cost numeric,
  supplier_retail numeric,
  lombardo_selling_price numeric,
  selling_price_source text,
  selling_price_version bigint,
  vinros_changed_at timestamptz,
  commercial_sensitivity text,
  classification_source text,
  decision_status text
)
language sql
security invoker
set search_path = ''
as $$
  select
    external.id,
    competitor.name,
    external.external_name,
    external.external_product_url,
    external.current_price,
    external.fetched_at,
    competitor_change.changed_at,
    product.id,
    product.supplier_sku,
    product.name_raw,
    product.eligibility_status,
    coalesce(editorial.category_slug, 'sin-categoria'),
    match.match_confidence,
    match.confidence_band,
    prices.supplier_cost,
    prices.supplier_retail,
    coalesce(selling.current_price, prices.supplier_retail),
    case when selling.id is null then 'SUPPLIER_RETAIL_FALLBACK' else 'LOMBARDO_SELLING_PRICE' end,
    coalesce(selling.version, 0),
    greatest(
      coalesce(price_change.changed_at, '-infinity'::timestamptz),
      coalesce(prices.cost_synced_at, '-infinity'::timestamptz),
      coalesce(prices.retail_synced_at, '-infinity'::timestamptz)
    ),
    coalesce(
      profile.sensitivity,
      case when editorial.category_slug in ('regalos', 'regalos-y-accesorios') then 'gift' else 'known_comparable' end
    ),
    coalesce(profile.classification_source, 'rule'),
    coalesce(decision.status, 'pending')
  from public.competitor_products external
  join public.competitors competitor
    on competitor.id = external.competitor_id
   and competitor.id = p_competitor_id
   and competitor.tenant_id = p_tenant_id
   and competitor.active is true
  join public.competitor_product_matches match
    on match.competitor_product_id = external.id
   and match.runia_product_id is not null
   and match.match_method in ('auto', 'manual')
  join public.supplier_products product on product.id = match.runia_product_id
  join public.suppliers supplier
    on supplier.id = product.supplier_id
   and supplier.tenant_id = p_tenant_id
  left join public.supplier_product_editorial editorial on editorial.supplier_product_id = product.id
  left join lateral (
    select
      max(price.current_price) filter (where price.price_type = 'cost') as supplier_cost,
      max(price.current_price) filter (where price.price_type = 'retail') as supplier_retail,
      max(price.synced_at) filter (where price.price_type = 'cost') as cost_synced_at,
      max(price.synced_at) filter (where price.price_type = 'retail') as retail_synced_at
    from public.supplier_prices price
    where price.supplier_product_id = product.id
  ) prices on true
  left join public.lombardo_selling_prices selling
    on selling.tenant_id = p_tenant_id
   and selling.supplier_product_id = product.id
   and selling.price_type = 'retail'
   and selling.active is true
  left join public.product_commercial_profiles profile
    on profile.tenant_id = p_tenant_id
   and profile.supplier_product_id = product.id
  left join public.pricing_opportunity_decisions decision
    on decision.tenant_id = p_tenant_id
   and decision.competitor_product_id = external.id
  left join lateral (
    select max(history.changed_at) as changed_at
    from public.supplier_price_history history
    where history.supplier_product_id = product.id
      and history.price_type in ('cost', 'retail')
  ) price_change on true
  left join lateral (
    select max(points.fetched_at) as changed_at
    from (
      select history.fetched_at, history.current_price,
             lag(history.current_price) over (order by history.fetched_at, history.id) as previous_price
      from public.competitor_price_history history
      where history.competitor_product_id = external.id
    ) points
    where points.previous_price is not null
      and points.current_price is distinct from points.previous_price
  ) competitor_change on true
  where external.available is true
    and external.current_price > 0
    and prices.supplier_retail > 0
  order by external.external_name;
$$;

create or replace function public.lombardo_set_commercial_sensitivity(
  p_tenant_id uuid,
  p_supplier_product_id uuid,
  p_sensitivity text,
  p_operator_id uuid
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if p_sensitivity not in ('known_comparable', 'long_tail', 'premium', 'gift', 'traffic_driver') then
    raise exception using errcode = '22023', message = 'INVALID_COMMERCIAL_SENSITIVITY';
  end if;
  if not exists (
    select 1 from public.supplier_products product
    join public.suppliers supplier on supplier.id = product.supplier_id
    where product.id = p_supplier_product_id and supplier.tenant_id = p_tenant_id
  ) then
    raise exception using errcode = '23503', message = 'PRODUCT_NOT_FOUND';
  end if;
  insert into public.product_commercial_profiles (
    tenant_id, supplier_product_id, sensitivity, classification_source, rule_key, updated_by
  ) values (
    p_tenant_id, p_supplier_product_id, p_sensitivity, 'manual', null, p_operator_id
  )
  on conflict (tenant_id, supplier_product_id) do update set
    sensitivity = excluded.sensitivity,
    classification_source = 'manual',
    rule_key = null,
    updated_by = excluded.updated_by;
end;
$$;

create or replace function public.lombardo_update_pricing_settings(
  p_tenant_id uuid,
  p_very_competitive_max_pct numeric,
  p_competitive_max_pct numeric,
  p_market_max_pct numeric,
  p_expensive_max_pct numeric,
  p_minimum_margin_pct numeric,
  p_target_margin_pct numeric,
  p_competitor_max_age_hours integer,
  p_operator_id uuid
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
  insert into public.pricing_intelligence_settings (
    tenant_id, very_competitive_max_pct, competitive_max_pct, market_max_pct,
    expensive_max_pct, minimum_margin_pct, target_margin_pct,
    competitor_max_age_hours, updated_by
  ) values (
    p_tenant_id, p_very_competitive_max_pct, p_competitive_max_pct, p_market_max_pct,
    p_expensive_max_pct, p_minimum_margin_pct, p_target_margin_pct,
    p_competitor_max_age_hours, p_operator_id
  )
  on conflict (tenant_id) do update set
    very_competitive_max_pct = excluded.very_competitive_max_pct,
    competitive_max_pct = excluded.competitive_max_pct,
    market_max_pct = excluded.market_max_pct,
    expensive_max_pct = excluded.expensive_max_pct,
    minimum_margin_pct = excluded.minimum_margin_pct,
    target_margin_pct = excluded.target_margin_pct,
    competitor_max_age_hours = excluded.competitor_max_age_hours,
    updated_by = excluded.updated_by;
end;
$$;

create or replace function public.lombardo_ignore_pricing_opportunity(
  p_tenant_id uuid,
  p_competitor_product_id uuid,
  p_operator_id uuid,
  p_note text default null
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_product_id uuid;
  v_current_price numeric;
  v_competitor_price numeric;
begin
  select match.runia_product_id, external.current_price,
         coalesce(selling.current_price, retail.current_price)
    into v_product_id, v_competitor_price, v_current_price
  from public.competitor_products external
  join public.competitors competitor
    on competitor.id = external.competitor_id and competitor.tenant_id = p_tenant_id
  join public.competitor_product_matches match
    on match.competitor_product_id = external.id and match.runia_product_id is not null
  join public.supplier_products product on product.id = match.runia_product_id
  join public.suppliers supplier
    on supplier.id = product.supplier_id and supplier.tenant_id = p_tenant_id
  join public.supplier_prices retail
    on retail.supplier_product_id = product.id and retail.price_type = 'retail'
  left join public.lombardo_selling_prices selling
    on selling.tenant_id = p_tenant_id and selling.supplier_product_id = product.id
   and selling.price_type = 'retail' and selling.active is true
  where external.id = p_competitor_product_id;
  if not found then
    raise exception using errcode = '23503', message = 'PRICING_OPPORTUNITY_NOT_FOUND';
  end if;
  insert into public.pricing_opportunity_decisions (
    tenant_id, competitor_product_id, supplier_product_id, status, note,
    decided_by, decided_at, current_price_snapshot, competitor_price_snapshot
  ) values (
    p_tenant_id, p_competitor_product_id, v_product_id, 'ignored', nullif(btrim(p_note), ''),
    p_operator_id, pg_catalog.now(), v_current_price, v_competitor_price
  )
  on conflict (tenant_id, competitor_product_id) do update set
    supplier_product_id = excluded.supplier_product_id,
    status = 'ignored', note = excluded.note, decided_by = excluded.decided_by,
    decided_at = excluded.decided_at,
    current_price_snapshot = excluded.current_price_snapshot,
    competitor_price_snapshot = excluded.competitor_price_snapshot;
end;
$$;

create or replace function public.lombardo_set_selling_price(
  p_tenant_id uuid,
  p_supplier_product_id uuid,
  p_new_price numeric,
  p_reason text,
  p_source text,
  p_approved_by uuid,
  p_expected_current_price numeric,
  p_expected_version bigint,
  p_expected_supplier_cost numeric,
  p_expected_competitor_product_id uuid,
  p_expected_competitor_price numeric,
  p_expected_competitor_fetched_at timestamptz,
  p_allow_at_or_below_cost boolean default false
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_product public.supplier_products%rowtype;
  v_supplier_cost numeric;
  v_supplier_retail numeric;
  v_current public.lombardo_selling_prices%rowtype;
  v_effective_current numeric;
  v_current_version bigint;
  v_settings public.pricing_intelligence_settings%rowtype;
  v_sensitivity text;
  v_margin_pct numeric;
  v_competitor public.competitor_products%rowtype;
  v_selling_id uuid;
  v_new_version bigint;
begin
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_tenant_id::text || ':' || p_supplier_product_id::text, 0)
  );
  if p_new_price is null or p_new_price <= 0 then
    raise exception using errcode = '22023', message = 'SELLING_PRICE_MUST_BE_POSITIVE';
  end if;
  if p_reason not in ('MANUAL', 'COMPETITOR_REVIEW', 'PROMOTION', 'OTHER') then
    raise exception using errcode = '22023', message = 'INVALID_SELLING_PRICE_REASON';
  end if;
  if p_source not in ('ADMIN', 'PRICING_INTELLIGENCE') then
    raise exception using errcode = '22023', message = 'INVALID_SELLING_PRICE_SOURCE';
  end if;
  select product.* into v_product
  from public.supplier_products product
  join public.suppliers supplier on supplier.id = product.supplier_id
  where product.id = p_supplier_product_id and supplier.tenant_id = p_tenant_id
  for update of product;
  if not found then
    raise exception using errcode = '23503', message = 'PRODUCT_NOT_FOUND';
  end if;
  if v_product.active is not true or v_product.eligibility_status <> 'safe' then
    raise exception using errcode = '23514', message = 'PRODUCT_NOT_SAFE_FOR_SELLING_PRICE';
  end if;
  perform 1 from public.supplier_prices price
  where price.supplier_product_id = p_supplier_product_id
    and price.price_type in ('cost', 'retail')
  for share;
  select
    max(price.current_price) filter (where price.price_type = 'cost'),
    max(price.current_price) filter (where price.price_type = 'retail')
    into v_supplier_cost, v_supplier_retail
  from public.supplier_prices price
  where price.supplier_product_id = p_supplier_product_id;
  if v_supplier_retail is null or v_supplier_retail <= 0 then
    raise exception using errcode = '23514', message = 'SUPPLIER_RETAIL_REQUIRED';
  end if;
  if v_supplier_cost is null or v_supplier_cost <= 0 then
    raise exception using errcode = '23514', message = 'SUPPLIER_COST_REQUIRED';
  end if;
  if v_supplier_cost is distinct from p_expected_supplier_cost then
    raise exception using errcode = '40001', message = 'SUPPLIER_COST_CHANGED_REVIEW_AGAIN';
  end if;
  select * into v_current
  from public.lombardo_selling_prices selling
  where selling.tenant_id = p_tenant_id
    and selling.supplier_product_id = p_supplier_product_id
    and selling.price_type = 'retail'
  for update;
  v_effective_current := coalesce(v_current.current_price, v_supplier_retail);
  v_current_version := coalesce(v_current.version, 0);
  if v_effective_current is distinct from p_expected_current_price
     or v_current_version is distinct from p_expected_version then
    raise exception using errcode = '40001', message = 'SELLING_PRICE_CHANGED_REVIEW_AGAIN';
  end if;
  select * into v_settings
  from public.pricing_intelligence_settings settings
  where settings.tenant_id = p_tenant_id;
  if not found then
    raise exception using errcode = '23514', message = 'PRICING_SETTINGS_REQUIRED';
  end if;
  select profile.sensitivity into v_sensitivity
  from public.product_commercial_profiles profile
  where profile.tenant_id = p_tenant_id
    and profile.supplier_product_id = p_supplier_product_id;
  v_sensitivity := coalesce(v_sensitivity, 'known_comparable');
  if p_expected_competitor_product_id is not null then
    select external.* into v_competitor
    from public.competitor_products external
    join public.competitors competitor
      on competitor.id = external.competitor_id and competitor.tenant_id = p_tenant_id
    join public.competitor_product_matches match
      on match.competitor_product_id = external.id
     and match.runia_product_id = p_supplier_product_id
     and match.match_method in ('auto', 'manual')
    where external.id = p_expected_competitor_product_id
      and external.available is true
    for update of external;
    if not found
       or v_competitor.current_price is distinct from p_expected_competitor_price
       or v_competitor.fetched_at is distinct from p_expected_competitor_fetched_at then
      raise exception using errcode = '40001', message = 'COMPETITOR_PRICE_CHANGED_REVIEW_AGAIN';
    end if;
    if v_competitor.fetched_at < pg_catalog.now()
       - pg_catalog.make_interval(hours => v_settings.competitor_max_age_hours) then
      raise exception using errcode = '23514', message = 'COMPETITOR_PRICE_TOO_OLD';
    end if;
  end if;
  v_margin_pct := ((p_new_price - v_supplier_cost) / p_new_price) * 100;
  if p_new_price <= v_supplier_cost
     and not (v_sensitivity = 'traffic_driver' and p_allow_at_or_below_cost is true) then
    raise exception using errcode = '23514', message = 'PRICE_AT_OR_BELOW_COST_BLOCKED';
  end if;
  if v_margin_pct < v_settings.minimum_margin_pct
     and v_sensitivity <> 'traffic_driver' then
    raise exception using errcode = '23514', message = 'MINIMUM_MARGIN_GUARDRAIL';
  end if;
  if p_new_price = v_effective_current then
    return jsonb_build_object('changed', false, 'price', v_effective_current, 'version', v_current_version);
  end if;
  insert into public.lombardo_selling_prices (
    tenant_id, supplier_product_id, price_type, current_price, currency,
    version, active, reason, source, approved_by, approved_at
  ) values (
    p_tenant_id, p_supplier_product_id, 'retail', round(p_new_price, 2), 'ARS',
    1, true, p_reason, p_source, p_approved_by, pg_catalog.now()
  )
  on conflict (tenant_id, supplier_product_id, price_type) do update set
    current_price = excluded.current_price,
    version = public.lombardo_selling_prices.version + 1,
    active = true,
    reason = excluded.reason,
    source = excluded.source,
    approved_by = excluded.approved_by,
    approved_at = excluded.approved_at
  returning id, version into v_selling_id, v_new_version;
  insert into public.lombardo_selling_price_history (
    selling_price_id, tenant_id, supplier_product_id, old_price, new_price,
    reason, source, approved_by, metadata
  ) values (
    v_selling_id, p_tenant_id, p_supplier_product_id, v_effective_current,
    round(p_new_price, 2), p_reason, p_source, p_approved_by,
    jsonb_build_object(
      'supplierCost', v_supplier_cost,
      'supplierRetail', v_supplier_retail,
      'competitorProductId', p_expected_competitor_product_id,
      'competitorPrice', p_expected_competitor_price,
      'previousVersion', v_current_version,
      'commercialSensitivity', v_sensitivity
    )
  );
  if p_expected_competitor_product_id is not null then
    insert into public.pricing_opportunity_decisions (
      tenant_id, competitor_product_id, supplier_product_id, status, note,
      decided_by, decided_at, current_price_snapshot, competitor_price_snapshot
    ) values (
      p_tenant_id, p_expected_competitor_product_id, p_supplier_product_id,
      'applied', 'Precio aprobado por revisión humana.', p_approved_by,
      pg_catalog.now(), round(p_new_price, 2), p_expected_competitor_price
    )
    on conflict (tenant_id, competitor_product_id) do update set
      supplier_product_id = excluded.supplier_product_id,
      status = 'applied', note = excluded.note, decided_by = excluded.decided_by,
      decided_at = excluded.decided_at,
      current_price_snapshot = excluded.current_price_snapshot,
      competitor_price_snapshot = excluded.competitor_price_snapshot;
  end if;
  return jsonb_build_object('changed', true, 'price', round(p_new_price, 2), 'version', v_new_version);
end;
$$;

alter table public.lombardo_selling_prices enable row level security;
alter table public.lombardo_selling_price_history enable row level security;
alter table public.pricing_intelligence_settings enable row level security;
alter table public.product_commercial_profiles enable row level security;
alter table public.pricing_opportunity_decisions enable row level security;
alter table public.lombardo_selling_prices force row level security;
alter table public.lombardo_selling_price_history force row level security;
alter table public.pricing_intelligence_settings force row level security;
alter table public.product_commercial_profiles force row level security;
alter table public.pricing_opportunity_decisions force row level security;

revoke all on table public.lombardo_selling_prices, public.lombardo_selling_price_history,
  public.pricing_intelligence_settings, public.product_commercial_profiles,
  public.pricing_opportunity_decisions from public, anon, authenticated;
grant select, insert, update on table public.lombardo_selling_prices,
  public.lombardo_selling_price_history, public.pricing_intelligence_settings,
  public.product_commercial_profiles, public.pricing_opportunity_decisions to service_role;
grant usage, select on sequence public.lombardo_selling_price_history_id_seq to service_role;

revoke all on function public.lombardo_pricing_opportunities(uuid, uuid)
  from public, anon, authenticated;
revoke all on function public.lombardo_set_commercial_sensitivity(uuid, uuid, text, uuid)
  from public, anon, authenticated;
revoke all on function public.lombardo_update_pricing_settings(uuid, numeric, numeric, numeric, numeric, numeric, numeric, integer, uuid)
  from public, anon, authenticated;
revoke all on function public.lombardo_ignore_pricing_opportunity(uuid, uuid, uuid, text)
  from public, anon, authenticated;
revoke all on function public.lombardo_set_selling_price(uuid, uuid, numeric, text, text, uuid, numeric, bigint, numeric, uuid, numeric, timestamptz, boolean)
  from public, anon, authenticated;
grant execute on function public.lombardo_pricing_opportunities(uuid, uuid) to service_role;
grant execute on function public.lombardo_set_commercial_sensitivity(uuid, uuid, text, uuid) to service_role;
grant execute on function public.lombardo_update_pricing_settings(uuid, numeric, numeric, numeric, numeric, numeric, numeric, integer, uuid)
  to service_role;
grant execute on function public.lombardo_ignore_pricing_opportunity(uuid, uuid, uuid, text)
  to service_role;
grant execute on function public.lombardo_set_selling_price(uuid, uuid, numeric, text, text, uuid, numeric, bigint, numeric, uuid, numeric, timestamptz, boolean)
  to service_role;

comment on table public.lombardo_selling_prices is
  'Human-approved Lombardo retail selling prices. Never supplier-owned pricing.';
comment on table public.lombardo_selling_price_history is
  'Immutable audit of Lombardo selling price changes and approvals.';
comment on function public.lombardo_set_selling_price(uuid, uuid, numeric, text, text, uuid, numeric, bigint, numeric, uuid, numeric, timestamptz, boolean) is
  'Only guarded V1 write path for Lombardo selling prices; revalidates cost, competitor and optimistic version.';
