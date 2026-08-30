-- RUNIA Competitor Intelligence V1. External prices are decision signals only:
-- this module has no write path to supplier_prices, VINROS or pricing policies.

create table public.competitors (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  slug text not null,
  name text not null,
  base_url text not null,
  active boolean not null default true,
  crawl_delay_ms integer not null default 750,
  max_pages integer not null default 12,
  parser_version text not null default '1',
  config jsonb not null default '{}'::jsonb,
  circuit_state text not null default 'closed',
  circuit_reason text,
  last_successful_run_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint competitors_tenant_slug_key unique (tenant_id, slug),
  constraint competitors_slug_check check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  constraint competitors_name_check check (btrim(name) <> ''),
  constraint competitors_url_check check (base_url ~ '^https://'),
  constraint competitors_delay_check check (crawl_delay_ms between 250 and 10000),
  constraint competitors_pages_check check (max_pages between 1 and 100),
  constraint competitors_config_check check (jsonb_typeof(config) = 'object'),
  constraint competitors_circuit_check check (circuit_state in ('closed', 'open'))
);

create index competitors_active_idx on public.competitors (tenant_id, active, slug);

create table public.competitor_runs (
  id uuid primary key default gen_random_uuid(),
  competitor_id uuid not null references public.competitors(id) on delete cascade,
  run_key text not null,
  trigger_source text not null,
  status text not null default 'running',
  started_at timestamptz not null default now(),
  lease_expires_at timestamptz not null default (now() + interval '15 minutes'),
  finished_at timestamptz,
  pages_fetched integer not null default 0,
  products_seen integer not null default 0,
  products_parsed integer not null default 0,
  products_matched integer not null default 0,
  high_matches integer not null default 0,
  medium_matches integer not null default 0,
  low_matches integer not null default 0,
  no_matches integer not null default 0,
  price_changes integer not null default 0,
  alerts_created integer not null default 0,
  structural_signature text,
  summary jsonb not null default '{}'::jsonb,
  errors jsonb not null default '[]'::jsonb,
  alert_status text not null default 'not_required',
  alert_sent_at timestamptz,
  alert_provider_message_id text,
  alert_error_summary text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint competitor_runs_key unique (competitor_id, run_key),
  constraint competitor_runs_key_check check (char_length(run_key) between 1 and 160),
  constraint competitor_runs_trigger_check check (trigger_source in ('schedule', 'manual', 'pilot', 'retry')),
  constraint competitor_runs_status_check check (
    status in ('running', 'completed', 'warning', 'failed', 'blocked', 'skipped')
  ),
  constraint competitor_runs_counts_check check (
    pages_fetched >= 0 and products_seen >= 0 and products_parsed >= 0 and products_matched >= 0
    and high_matches >= 0 and medium_matches >= 0 and low_matches >= 0 and no_matches >= 0
    and price_changes >= 0 and alerts_created >= 0
  ),
  constraint competitor_runs_summary_check check (jsonb_typeof(summary) = 'object'),
  constraint competitor_runs_errors_check check (jsonb_typeof(errors) = 'array')
);

create index competitor_runs_dashboard_idx
  on public.competitor_runs (competitor_id, started_at desc);
create index competitor_runs_open_idx
  on public.competitor_runs (competitor_id, lease_expires_at)
  where status = 'running';
create index competitor_runs_created_by_idx
  on public.competitor_runs (created_by) where created_by is not null;

create table public.competitor_products (
  id uuid primary key default gen_random_uuid(),
  competitor_id uuid not null references public.competitors(id) on delete cascade,
  external_id text not null,
  external_product_url text not null,
  external_name text not null,
  normalized_name text not null,
  brand text,
  line text,
  varietal text,
  presentation text,
  volume_ml integer,
  ean text,
  external_sku text,
  current_price numeric(18, 2),
  list_price numeric(18, 2),
  promotion_text text,
  available boolean not null default true,
  fetched_at timestamptz not null,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  last_run_id uuid not null references public.competitor_runs(id) on delete restrict,
  raw_data jsonb not null default '{}'::jsonb,
  constraint competitor_products_external_key unique (competitor_id, external_id),
  constraint competitor_products_external_id_check check (btrim(external_id) <> ''),
  constraint competitor_products_url_check check (external_product_url ~ '^https://'),
  constraint competitor_products_name_check check (btrim(external_name) <> '' and btrim(normalized_name) <> ''),
  constraint competitor_products_volume_check check (volume_ml is null or volume_ml > 0),
  constraint competitor_products_price_check check (current_price is null or current_price > 0),
  constraint competitor_products_list_price_check check (list_price is null or list_price > 0),
  constraint competitor_products_raw_check check (jsonb_typeof(raw_data) = 'object')
);

create index competitor_products_current_idx
  on public.competitor_products (competitor_id, available, fetched_at desc);
create index competitor_products_brand_idx
  on public.competitor_products (competitor_id, brand) where brand is not null;
create index competitor_products_last_run_idx on public.competitor_products (last_run_id);
create index competitor_products_ean_idx on public.competitor_products (ean) where ean is not null;

create table public.competitor_product_matches (
  competitor_product_id uuid primary key references public.competitor_products(id) on delete cascade,
  runia_product_id uuid references public.supplier_products(id) on delete restrict,
  suggested_runia_product_id uuid references public.supplier_products(id) on delete restrict,
  match_confidence numeric(5, 4) not null default 0,
  confidence_band text not null default 'none',
  match_method text not null default 'none',
  matched_fields jsonb not null default '[]'::jsonb,
  conflicts jsonb not null default '[]'::jsonb,
  manual_override boolean not null default false,
  matched_at timestamptz,
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now(),
  constraint competitor_matches_confidence_check check (match_confidence between 0 and 1),
  constraint competitor_matches_band_check check (confidence_band in ('high', 'medium', 'low', 'none')),
  constraint competitor_matches_method_check check (match_method in ('auto', 'manual', 'none', 'rejected')),
  constraint competitor_matches_fields_check check (jsonb_typeof(matched_fields) = 'array'),
  constraint competitor_matches_conflicts_check check (jsonb_typeof(conflicts) = 'array'),
  constraint competitor_matches_active_check check (
    (match_method in ('auto', 'manual') and runia_product_id is not null)
    or (match_method in ('none', 'rejected') and runia_product_id is null)
  ),
  constraint competitor_matches_manual_check check (
    manual_override is false or match_method in ('manual', 'rejected')
  )
);

create index competitor_matches_runia_idx
  on public.competitor_product_matches (runia_product_id) where runia_product_id is not null;
create index competitor_matches_suggested_idx
  on public.competitor_product_matches (suggested_runia_product_id)
  where suggested_runia_product_id is not null;
create index competitor_matches_band_idx
  on public.competitor_product_matches (confidence_band, match_confidence desc);

create table public.competitor_price_history (
  id bigint generated always as identity primary key,
  competitor_product_id uuid not null references public.competitor_products(id) on delete cascade,
  run_id uuid not null references public.competitor_runs(id) on delete restrict,
  current_price numeric(18, 2),
  list_price numeric(18, 2),
  promotion_text text,
  fetched_at timestamptz not null,
  created_at timestamptz not null default now(),
  constraint competitor_price_history_run_key unique (competitor_product_id, run_id),
  constraint competitor_price_history_price_check check (current_price is null or current_price > 0),
  constraint competitor_price_history_list_check check (list_price is null or list_price > 0)
);

create index competitor_price_history_product_idx
  on public.competitor_price_history (competitor_product_id, fetched_at desc);
create index competitor_price_history_run_idx on public.competitor_price_history (run_id);

create table public.competitor_match_history (
  id bigint generated always as identity primary key,
  competitor_product_id uuid not null references public.competitor_products(id) on delete cascade,
  run_id uuid references public.competitor_runs(id) on delete restrict,
  previous_runia_product_id uuid references public.supplier_products(id) on delete restrict,
  runia_product_id uuid references public.supplier_products(id) on delete restrict,
  previous_confidence numeric(5, 4),
  match_confidence numeric(5, 4) not null,
  previous_band text,
  confidence_band text not null,
  match_method text not null,
  reason text not null,
  changed_at timestamptz not null default now(),
  constraint competitor_match_history_confidence_check check (
    match_confidence between 0 and 1 and (previous_confidence is null or previous_confidence between 0 and 1)
  )
);

create index competitor_match_history_product_idx
  on public.competitor_match_history (competitor_product_id, changed_at desc);
create index competitor_match_history_run_idx on public.competitor_match_history (run_id);
create index competitor_match_history_previous_idx
  on public.competitor_match_history (previous_runia_product_id)
  where previous_runia_product_id is not null;
create index competitor_match_history_runia_idx
  on public.competitor_match_history (runia_product_id) where runia_product_id is not null;

create table public.competitor_alert_rules (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  competitor_id uuid not null references public.competitors(id) on delete cascade,
  alert_type text not null,
  enabled boolean not null default true,
  threshold_pct numeric(8, 2) not null default 10,
  cooldown_hours integer not null default 72,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint competitor_alert_rules_key unique (tenant_id, competitor_id, alert_type),
  constraint competitor_alert_rules_type_check check (
    alert_type in ('lombardo_more_expensive', 'competitor_price_change', 'match_lost')
  ),
  constraint competitor_alert_rules_threshold_check check (threshold_pct between 0 and 1000),
  constraint competitor_alert_rules_cooldown_check check (cooldown_hours between 1 and 8760)
);

create index competitor_alert_rules_competitor_idx
  on public.competitor_alert_rules (competitor_id, enabled, alert_type);

create table public.competitor_alert_events (
  id uuid primary key default gen_random_uuid(),
  rule_id uuid not null references public.competitor_alert_rules(id) on delete restrict,
  competitor_product_id uuid not null references public.competitor_products(id) on delete cascade,
  run_id uuid not null references public.competitor_runs(id) on delete restrict,
  event_key text not null unique,
  alert_type text not null,
  severity text not null,
  status text not null default 'pending',
  difference_pct numeric(10, 2),
  payload jsonb not null default '{}'::jsonb,
  provider_message_id text,
  error_summary text,
  sent_at timestamptz,
  created_at timestamptz not null default now(),
  constraint competitor_alert_events_type_check check (
    alert_type in ('lombardo_more_expensive', 'competitor_price_change', 'match_lost')
  ),
  constraint competitor_alert_events_severity_check check (severity in ('important', 'critical')),
  constraint competitor_alert_events_status_check check (status in ('pending', 'sent', 'failed', 'suppressed')),
  constraint competitor_alert_events_payload_check check (jsonb_typeof(payload) = 'object')
);

create index competitor_alert_events_pending_idx
  on public.competitor_alert_events (run_id, created_at)
  where status = 'pending';
create index competitor_alert_events_product_idx
  on public.competitor_alert_events (competitor_product_id, alert_type, created_at desc);
create index competitor_alert_events_rule_idx on public.competitor_alert_events (rule_id);

create trigger competitors_set_updated_at
before update on public.competitors
for each row execute function lombardo_private.set_updated_at();
create trigger competitor_matches_set_updated_at
before update on public.competitor_product_matches
for each row execute function lombardo_private.set_updated_at();
create trigger competitor_alert_rules_set_updated_at
before update on public.competitor_alert_rules
for each row execute function lombardo_private.set_updated_at();

create or replace function public.lombardo_claim_competitor_run(
  p_competitor_id uuid,
  p_run_key text,
  p_trigger_source text,
  p_created_by uuid default null
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_run public.competitor_runs%rowtype;
begin
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_competitor_id::text, 0));
  if not exists (select 1 from public.competitors where id = p_competitor_id and active is true) then
    return jsonb_build_object('claimed', false, 'reason', 'competitor_inactive');
  end if;
  select * into v_run
  from public.competitor_runs run
  where run.competitor_id = p_competitor_id
    and run.status = 'running'
    and run.lease_expires_at > pg_catalog.now()
  order by run.started_at desc
  limit 1 for update;
  if found then
    return jsonb_build_object('claimed', false, 'reason', 'already_running', 'runId', v_run.id);
  end if;
  update public.competitor_runs
     set status = 'failed', finished_at = pg_catalog.now(),
         errors = errors || jsonb_build_array('LEASE_EXPIRED')
   where competitor_id = p_competitor_id and status = 'running'
     and lease_expires_at <= pg_catalog.now();
  select * into v_run
  from public.competitor_runs
  where competitor_id = p_competitor_id and run_key = p_run_key
  for update;
  if found and v_run.status in ('completed', 'warning', 'skipped') then
    return jsonb_build_object('claimed', false, 'reason', 'already_finished', 'runId', v_run.id);
  end if;
  if found then
    update public.competitor_runs
       set trigger_source = p_trigger_source, status = 'running', started_at = pg_catalog.now(),
           lease_expires_at = pg_catalog.now() + interval '15 minutes', finished_at = null,
           pages_fetched = 0, products_seen = 0, products_parsed = 0, products_matched = 0,
           high_matches = 0, medium_matches = 0, low_matches = 0, no_matches = 0,
           price_changes = 0, alerts_created = 0, structural_signature = null,
           summary = '{}'::jsonb, errors = '[]'::jsonb, alert_status = 'not_required',
           alert_sent_at = null, alert_provider_message_id = null, alert_error_summary = null,
           created_by = coalesce(p_created_by, created_by)
     where id = v_run.id returning * into v_run;
  else
    insert into public.competitor_runs (competitor_id, run_key, trigger_source, created_by)
    values (p_competitor_id, p_run_key, p_trigger_source, p_created_by)
    returning * into v_run;
  end if;
  return jsonb_build_object('claimed', true, 'runId', v_run.id);
end;
$$;

create or replace function public.lombardo_ingest_competitor_snapshot(
  p_run_id uuid,
  p_structural_signature text,
  p_pages_fetched integer,
  p_products_seen integer,
  p_products jsonb
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_run public.competitor_runs%rowtype;
  v_competitor public.competitors%rowtype;
  v_item jsonb;
  v_match jsonb;
  v_product_id uuid;
  v_old_price numeric;
  v_current_price numeric;
  v_old_match public.competitor_product_matches%rowtype;
  v_active_match public.competitor_product_matches%rowtype;
  v_had_match boolean;
  v_runia_id uuid;
  v_suggested_id uuid;
  v_confidence numeric;
  v_band text;
  v_method text;
  v_retail_price numeric;
  v_difference numeric;
  v_rule public.competitor_alert_rules%rowtype;
  v_suppressed boolean;
  v_high integer := 0;
  v_medium integer := 0;
  v_low integer := 0;
  v_none integer := 0;
  v_matched integer := 0;
  v_price_changes integer := 0;
  v_alerts integer := 0;
  v_parsed integer := 0;
begin
  if jsonb_typeof(p_products) <> 'array' then
    raise exception using errcode = '22023', message = 'COMPETITOR_PRODUCTS_MUST_BE_ARRAY';
  end if;
  select * into v_run from public.competitor_runs where id = p_run_id for update;
  if not found or v_run.status <> 'running' then
    raise exception using errcode = '23514', message = 'COMPETITOR_RUN_NOT_RUNNING';
  end if;
  select * into v_competitor from public.competitors where id = v_run.competitor_id and active is true;
  if not found then raise exception using errcode = '23503', message = 'COMPETITOR_NOT_ACTIVE'; end if;

  for v_item in select value from jsonb_array_elements(p_products)
  loop
    v_parsed := v_parsed + 1;
    v_match := coalesce(v_item->'match', '{}'::jsonb);
    v_current_price := nullif(v_item->>'currentPrice', '')::numeric;
    select product.current_price into v_old_price
      from public.competitor_products product
     where product.competitor_id = v_competitor.id
       and product.external_id = v_item->>'externalId'
     for update;

    insert into public.competitor_products (
      competitor_id, external_id, external_product_url, external_name, normalized_name,
      brand, line, varietal, presentation, volume_ml, ean, external_sku,
      current_price, list_price, promotion_text, available, fetched_at, last_seen_at,
      last_run_id, raw_data
    ) values (
      v_competitor.id, v_item->>'externalId', v_item->>'externalProductUrl',
      v_item->>'externalName', v_item->>'normalizedName', nullif(v_item->>'brand', ''),
      nullif(v_item->>'line', ''), nullif(v_item->>'varietal', ''),
      nullif(v_item->>'presentation', ''), nullif(v_item->>'volumeMl', '')::integer,
      nullif(v_item->>'ean', ''), nullif(v_item->>'externalSku', ''),
      v_current_price, nullif(v_item->>'listPrice', '')::numeric,
      nullif(v_item->>'promotionText', ''), coalesce((v_item->>'available')::boolean, true),
      (v_item->>'fetchedAt')::timestamptz, pg_catalog.now(), p_run_id,
      coalesce(v_item->'raw', '{}'::jsonb)
    )
    on conflict (competitor_id, external_id) do update set
      external_product_url = excluded.external_product_url,
      external_name = excluded.external_name,
      normalized_name = excluded.normalized_name,
      brand = excluded.brand,
      line = excluded.line,
      varietal = excluded.varietal,
      presentation = excluded.presentation,
      volume_ml = excluded.volume_ml,
      ean = excluded.ean,
      external_sku = excluded.external_sku,
      current_price = excluded.current_price,
      list_price = excluded.list_price,
      promotion_text = excluded.promotion_text,
      available = excluded.available,
      fetched_at = excluded.fetched_at,
      last_seen_at = pg_catalog.now(),
      last_run_id = p_run_id,
      raw_data = excluded.raw_data
    returning id into v_product_id;

    insert into public.competitor_price_history (
      competitor_product_id, run_id, current_price, list_price, promotion_text, fetched_at
    ) values (
      v_product_id, p_run_id, v_current_price, nullif(v_item->>'listPrice', '')::numeric,
      nullif(v_item->>'promotionText', ''), (v_item->>'fetchedAt')::timestamptz
    ) on conflict (competitor_product_id, run_id) do nothing;

    v_had_match := false;
    select * into v_old_match from public.competitor_product_matches
     where competitor_product_id = v_product_id for update;
    if found then v_had_match := true; end if;

    if v_had_match and v_old_match.manual_override then
      v_active_match := v_old_match;
    else
      v_runia_id := nullif(v_match->>'runiaProductId', '')::uuid;
      v_suggested_id := nullif(v_match->>'suggestedRuniaProductId', '')::uuid;
      v_confidence := coalesce((v_match->>'confidence')::numeric, 0);
      v_band := coalesce(v_match->>'band', 'none');
      v_method := case when v_runia_id is not null then 'auto' else 'none' end;
      if v_runia_id is not null and not exists (
        select 1 from public.supplier_products product
        join public.suppliers supplier on supplier.id = product.supplier_id
        where product.id = v_runia_id and supplier.tenant_id = v_competitor.tenant_id
          and product.active is true and product.eligibility_status = 'safe'
      ) then
        v_runia_id := null; v_band := 'none'; v_method := 'none';
      end if;
      if v_suggested_id is not null and not exists (
        select 1 from public.supplier_products product
        join public.suppliers supplier on supplier.id = product.supplier_id
        where product.id = v_suggested_id and supplier.tenant_id = v_competitor.tenant_id
          and product.active is true and product.eligibility_status = 'safe'
      ) then v_suggested_id := null; end if;

      insert into public.competitor_product_matches (
        competitor_product_id, runia_product_id, suggested_runia_product_id,
        match_confidence, confidence_band, match_method, matched_fields, conflicts,
        manual_override, matched_at
      ) values (
        v_product_id, v_runia_id, v_suggested_id, v_confidence, v_band, v_method,
        coalesce(v_match->'matchedFields', '[]'::jsonb), coalesce(v_match->'conflicts', '[]'::jsonb),
        false, case when v_runia_id is not null then pg_catalog.now() else null end
      )
      on conflict (competitor_product_id) do update set
        runia_product_id = excluded.runia_product_id,
        suggested_runia_product_id = excluded.suggested_runia_product_id,
        match_confidence = excluded.match_confidence,
        confidence_band = excluded.confidence_band,
        match_method = excluded.match_method,
        matched_fields = excluded.matched_fields,
        conflicts = excluded.conflicts,
        manual_override = false,
        matched_at = excluded.matched_at,
        updated_by = null
      returning * into v_active_match;

      if not v_had_match
        or v_old_match.runia_product_id is distinct from v_active_match.runia_product_id
        or v_old_match.confidence_band is distinct from v_active_match.confidence_band then
        insert into public.competitor_match_history (
          competitor_product_id, run_id, previous_runia_product_id, runia_product_id,
          previous_confidence, match_confidence, previous_band, confidence_band,
          match_method, reason
        ) values (
          v_product_id, p_run_id,
          case when v_had_match then v_old_match.runia_product_id else null end,
          v_active_match.runia_product_id,
          case when v_had_match then v_old_match.match_confidence else null end,
          v_active_match.match_confidence,
          case when v_had_match then v_old_match.confidence_band else null end,
          v_active_match.confidence_band, v_active_match.match_method,
          case when v_had_match then 'automatic_rematch' else 'initial_automatic_match' end
        );
      end if;
    end if;

    if v_active_match.confidence_band = 'high' then v_high := v_high + 1;
    elsif v_active_match.confidence_band = 'medium' then v_medium := v_medium + 1;
    elsif v_active_match.confidence_band = 'low' then v_low := v_low + 1;
    else v_none := v_none + 1; end if;
    if v_active_match.runia_product_id is not null then v_matched := v_matched + 1; end if;

    if v_old_price is not null and v_current_price is not null
      and abs(v_old_price - v_current_price) >= 0.01 then
      v_price_changes := v_price_changes + 1;
      select * into v_rule from public.competitor_alert_rules
       where tenant_id = v_competitor.tenant_id and competitor_id = v_competitor.id
         and alert_type = 'competitor_price_change' and enabled is true;
      if found and abs(((v_current_price - v_old_price) / v_old_price) * 100) >= v_rule.threshold_pct then
        select exists (
          select 1 from public.competitor_alert_events event
          where event.rule_id = v_rule.id and event.competitor_product_id = v_product_id
            and event.status in ('pending', 'sent')
            and event.created_at >= pg_catalog.now() - pg_catalog.make_interval(hours => v_rule.cooldown_hours)
        ) into v_suppressed;
        insert into public.competitor_alert_events (
          rule_id, competitor_product_id, run_id, event_key, alert_type, severity,
          status, difference_pct, payload
        ) values (
          v_rule.id, v_product_id, p_run_id, p_run_id::text || ':competitor_price_change:' || v_product_id::text,
          'competitor_price_change', 'important', case when v_suppressed then 'suppressed' else 'pending' end,
          round(((v_current_price - v_old_price) / v_old_price) * 100, 2),
          jsonb_build_object('previousPrice', v_old_price, 'currentPrice', v_current_price,
            'externalName', v_item->>'externalName')
        ) on conflict (event_key) do nothing;
        if not v_suppressed then v_alerts := v_alerts + 1; end if;
      end if;
    end if;

    if v_had_match and v_old_match.runia_product_id is not null
      and v_active_match.runia_product_id is null then
      select * into v_rule from public.competitor_alert_rules
       where tenant_id = v_competitor.tenant_id and competitor_id = v_competitor.id
         and alert_type = 'match_lost' and enabled is true;
      if found then
        select exists (
          select 1 from public.competitor_alert_events event
          where event.rule_id = v_rule.id and event.competitor_product_id = v_product_id
            and event.status in ('pending', 'sent')
            and event.created_at >= pg_catalog.now() - pg_catalog.make_interval(hours => v_rule.cooldown_hours)
        ) into v_suppressed;
        insert into public.competitor_alert_events (
          rule_id, competitor_product_id, run_id, event_key, alert_type, severity, status, payload
        ) values (
          v_rule.id, v_product_id, p_run_id, p_run_id::text || ':match_lost:' || v_product_id::text,
          'match_lost', 'critical', case when v_suppressed then 'suppressed' else 'pending' end,
          jsonb_build_object('externalName', v_item->>'externalName',
            'previousRuniaProductId', v_old_match.runia_product_id)
        ) on conflict (event_key) do nothing;
        if not v_suppressed then v_alerts := v_alerts + 1; end if;
      end if;
    end if;

    if v_active_match.runia_product_id is not null and v_current_price is not null then
      select price.current_price into v_retail_price
      from public.supplier_prices price
      join public.supplier_products product on product.id = price.supplier_product_id
      join public.suppliers supplier on supplier.id = product.supplier_id
      where price.supplier_product_id = v_active_match.runia_product_id
        and price.price_type = 'retail' and supplier.tenant_id = v_competitor.tenant_id;
      if v_retail_price is not null then
        v_difference := ((v_retail_price - v_current_price) / v_current_price) * 100;
        select * into v_rule from public.competitor_alert_rules
         where tenant_id = v_competitor.tenant_id and competitor_id = v_competitor.id
           and alert_type = 'lombardo_more_expensive' and enabled is true;
        if found and v_difference > v_rule.threshold_pct then
          select exists (
            select 1 from public.competitor_alert_events event
            where event.rule_id = v_rule.id and event.competitor_product_id = v_product_id
              and event.status in ('pending', 'sent')
              and event.created_at >= pg_catalog.now() - pg_catalog.make_interval(hours => v_rule.cooldown_hours)
          ) into v_suppressed;
          insert into public.competitor_alert_events (
            rule_id, competitor_product_id, run_id, event_key, alert_type, severity,
            status, difference_pct, payload
          ) values (
            v_rule.id, v_product_id, p_run_id, p_run_id::text || ':lombardo_more_expensive:' || v_product_id::text,
            'lombardo_more_expensive', 'important', case when v_suppressed then 'suppressed' else 'pending' end,
            round(v_difference, 2), jsonb_build_object('externalName', v_item->>'externalName',
              'competitorPrice', v_current_price, 'lombardoRetailPrice', v_retail_price,
              'runiaProductId', v_active_match.runia_product_id)
          ) on conflict (event_key) do nothing;
          if not v_suppressed then v_alerts := v_alerts + 1; end if;
        end if;
      end if;
    end if;
  end loop;

  update public.competitor_products
     set available = false
   where competitor_id = v_competitor.id and last_run_id <> p_run_id and available is true;

  update public.competitor_runs
     set status = 'completed', finished_at = pg_catalog.now(), pages_fetched = p_pages_fetched,
         products_seen = p_products_seen, products_parsed = v_parsed, products_matched = v_matched,
         high_matches = v_high, medium_matches = v_medium, low_matches = v_low, no_matches = v_none,
         price_changes = v_price_changes, alerts_created = v_alerts,
         structural_signature = p_structural_signature,
         alert_status = case when v_alerts > 0 then 'pending' else 'not_required' end,
         summary = jsonb_build_object('matched', v_matched, 'high', v_high, 'medium', v_medium,
           'low', v_low, 'noMatch', v_none, 'priceChanges', v_price_changes,
           'alertsCreated', v_alerts, 'externalSignalsOnly', true)
   where id = p_run_id;
  update public.competitors
     set circuit_state = 'closed', circuit_reason = null, last_successful_run_at = pg_catalog.now()
   where id = v_competitor.id;
  return jsonb_build_object('parsed', v_parsed, 'matched', v_matched, 'high', v_high,
    'medium', v_medium, 'low', v_low, 'noMatch', v_none,
    'priceChanges', v_price_changes, 'alertsCreated', v_alerts);
end;
$$;

create or replace function public.lombardo_set_competitor_manual_match(
  p_tenant_id uuid,
  p_competitor_product_id uuid,
  p_runia_product_id uuid,
  p_rejected boolean,
  p_operator_id uuid
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_previous public.competitor_product_matches%rowtype;
begin
  if not exists (
    select 1 from public.competitor_products product
    join public.competitors competitor on competitor.id = product.competitor_id
    where product.id = p_competitor_product_id and competitor.tenant_id = p_tenant_id
  ) then
    raise exception using errcode = '23503', message = 'COMPETITOR_PRODUCT_NOT_FOUND';
  end if;
  if p_rejected is not true and (
    p_runia_product_id is null or not exists (
      select 1 from public.supplier_products product
      join public.suppliers supplier on supplier.id = product.supplier_id
      join public.supplier_prices price on price.supplier_product_id = product.id and price.price_type = 'retail'
      where product.id = p_runia_product_id and supplier.tenant_id = p_tenant_id
        and product.active is true and product.eligibility_status = 'safe' and price.current_price > 0
    )
  ) then
    raise exception using errcode = '23514', message = 'RUNIA_MATCH_MUST_BE_SAFE_RETAIL';
  end if;
  select * into v_previous from public.competitor_product_matches
   where competitor_product_id = p_competitor_product_id for update;
  insert into public.competitor_product_matches (
    competitor_product_id, runia_product_id, suggested_runia_product_id,
    match_confidence, confidence_band, match_method, matched_fields, conflicts,
    manual_override, matched_at, updated_by
  ) values (
    p_competitor_product_id, case when p_rejected then null else p_runia_product_id end, null,
    case when p_rejected then 0 else 1 end, case when p_rejected then 'none' else 'high' end,
    case when p_rejected then 'rejected' else 'manual' end,
    case when p_rejected then '[]'::jsonb else jsonb_build_array('corrección manual') end,
    '[]'::jsonb, true, case when p_rejected then null else pg_catalog.now() end, p_operator_id
  )
  on conflict (competitor_product_id) do update set
    runia_product_id = excluded.runia_product_id,
    suggested_runia_product_id = null,
    match_confidence = excluded.match_confidence,
    confidence_band = excluded.confidence_band,
    match_method = excluded.match_method,
    matched_fields = excluded.matched_fields,
    conflicts = excluded.conflicts,
    manual_override = true,
    matched_at = excluded.matched_at,
    updated_by = excluded.updated_by;
  insert into public.competitor_match_history (
    competitor_product_id, run_id, previous_runia_product_id, runia_product_id,
    previous_confidence, match_confidence, previous_band, confidence_band,
    match_method, reason
  ) values (
    p_competitor_product_id, null, v_previous.runia_product_id,
    case when p_rejected then null else p_runia_product_id end,
    v_previous.match_confidence, case when p_rejected then 0 else 1 end,
    v_previous.confidence_band, case when p_rejected then 'none' else 'high' end,
    case when p_rejected then 'rejected' else 'manual' end,
    case when p_rejected then 'manual_rejection' else 'manual_correction' end
  );
end;
$$;

alter table public.competitors enable row level security;
alter table public.competitor_runs enable row level security;
alter table public.competitor_products enable row level security;
alter table public.competitor_product_matches enable row level security;
alter table public.competitor_price_history enable row level security;
alter table public.competitor_match_history enable row level security;
alter table public.competitor_alert_rules enable row level security;
alter table public.competitor_alert_events enable row level security;
alter table public.competitors force row level security;
alter table public.competitor_runs force row level security;
alter table public.competitor_products force row level security;
alter table public.competitor_product_matches force row level security;
alter table public.competitor_price_history force row level security;
alter table public.competitor_match_history force row level security;
alter table public.competitor_alert_rules force row level security;
alter table public.competitor_alert_events force row level security;

revoke all on table public.competitors, public.competitor_runs, public.competitor_products,
  public.competitor_product_matches, public.competitor_price_history, public.competitor_match_history,
  public.competitor_alert_rules, public.competitor_alert_events from public, anon, authenticated;
grant select, insert, update, delete on table public.competitors, public.competitor_runs,
  public.competitor_products, public.competitor_product_matches, public.competitor_price_history,
  public.competitor_match_history, public.competitor_alert_rules, public.competitor_alert_events
  to service_role;
grant usage, select on sequence public.competitor_price_history_id_seq,
  public.competitor_match_history_id_seq to service_role;

revoke all on function public.lombardo_claim_competitor_run(uuid, text, text, uuid)
  from public, anon, authenticated;
revoke all on function public.lombardo_ingest_competitor_snapshot(uuid, text, integer, integer, jsonb)
  from public, anon, authenticated;
revoke all on function public.lombardo_set_competitor_manual_match(uuid, uuid, uuid, boolean, uuid)
  from public, anon, authenticated;
grant execute on function public.lombardo_claim_competitor_run(uuid, text, text, uuid) to service_role;
grant execute on function public.lombardo_ingest_competitor_snapshot(uuid, text, integer, integer, jsonb) to service_role;
grant execute on function public.lombardo_set_competitor_manual_match(uuid, uuid, uuid, boolean, uuid)
  to service_role;
