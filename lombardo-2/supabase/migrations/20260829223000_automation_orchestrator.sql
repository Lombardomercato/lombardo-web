-- RUNIA Automation Orchestrator. Server-only execution ledger, atomic leases,
-- daily Home slots and live content slots. VINROS remains owned by its existing
-- scheduler and guardrails; this layer only reads and reports its outcome.

create table public.automation_runs (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  automation_type text not null,
  run_key text not null,
  trigger_source text not null,
  started_at timestamptz not null default now(),
  heartbeat_at timestamptz not null default now(),
  lease_expires_at timestamptz not null default (now() + interval '15 minutes'),
  finished_at timestamptz,
  status text not null default 'running',
  attempt integer not null default 1,
  summary jsonb not null default '{}'::jsonb,
  warnings jsonb not null default '[]'::jsonb,
  errors jsonb not null default '[]'::jsonb,
  alert_status text not null default 'not_required',
  alert_sent_at timestamptz,
  alert_provider_message_id text,
  alert_error_summary text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint automation_runs_type_check check (
    automation_type in ('vinros', 'daily_cava', 'daily_featured', 'live_guides', 'seo_content')
  ),
  constraint automation_runs_trigger_check check (
    trigger_source in ('schedule', 'manual', 'retry')
  ),
  constraint automation_runs_status_check check (
    status in ('running', 'completed', 'warning', 'failed', 'blocked', 'skipped')
  ),
  constraint automation_runs_attempt_check check (attempt > 0),
  constraint automation_runs_run_key_check check (char_length(run_key) between 1 and 160),
  constraint automation_runs_summary_check check (jsonb_typeof(summary) = 'object'),
  constraint automation_runs_warnings_check check (jsonb_typeof(warnings) = 'array'),
  constraint automation_runs_errors_check check (jsonb_typeof(errors) = 'array'),
  constraint automation_runs_tenant_type_key unique (tenant_id, automation_type, run_key)
);

create index automation_runs_dashboard_idx
  on public.automation_runs (tenant_id, automation_type, started_at desc);
create index automation_runs_open_lease_idx
  on public.automation_runs (tenant_id, automation_type, lease_expires_at)
  where status = 'running';
create index automation_runs_created_by_idx
  on public.automation_runs (created_by) where created_by is not null;

create table public.home_feature_pins (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  supplier_product_id uuid not null references public.supplier_products(id) on delete cascade,
  active boolean not null default true,
  position smallint not null default 0,
  pinned_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint home_feature_pins_position_check check (position between 0 and 5),
  constraint home_feature_pins_tenant_product_key unique (tenant_id, supplier_product_id)
);

create index home_feature_pins_active_idx
  on public.home_feature_pins (tenant_id, active, position, created_at);
create index home_feature_pins_product_idx
  on public.home_feature_pins (supplier_product_id);
create index home_feature_pins_pinned_by_idx
  on public.home_feature_pins (pinned_by) where pinned_by is not null;

create table public.home_daily_slots (
  id bigint generated always as identity primary key,
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  selection_date date not null,
  slot_type text not null,
  position smallint not null,
  supplier_product_id uuid references public.supplier_products(id) on delete restrict,
  category_slug text,
  is_pinned boolean not null default false,
  source_run_id uuid not null references public.automation_runs(id) on delete restrict,
  created_at timestamptz not null default now(),
  constraint home_daily_slots_type_check check (
    slot_type in ('featured_product', 'featured_category', 'featured_guide')
  ),
  constraint home_daily_slots_position_check check (position between 0 and 20),
  constraint home_daily_slots_payload_check check (
    (slot_type = 'featured_product' and supplier_product_id is not null and category_slug is null)
    or (slot_type in ('featured_category', 'featured_guide') and supplier_product_id is null and category_slug is not null)
  ),
  constraint home_daily_slots_category_check check (
    category_slug is null or category_slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'
  ),
  constraint home_daily_slots_unique_position unique (
    tenant_id, selection_date, slot_type, position
  )
);

create index home_daily_slots_lookup_idx
  on public.home_daily_slots (tenant_id, selection_date desc, slot_type, position);
create index home_daily_slots_product_idx
  on public.home_daily_slots (supplier_product_id)
  where supplier_product_id is not null;
create index home_daily_slots_run_idx on public.home_daily_slots (source_run_id);

create table public.automation_content_entries (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  content_type text not null,
  slug text not null,
  title text not null,
  workflow_status text not null default 'OPPORTUNITY',
  editorial_content jsonb not null default '{}'::jsonb,
  live_rules jsonb not null default '{}'::jsonb,
  last_live_refresh_at timestamptz,
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint automation_content_type_check check (content_type in ('GUIDE', 'ARTICLE')),
  constraint automation_content_workflow_check check (
    workflow_status in ('OPPORTUNITY', 'DRAFT', 'QA', 'APPROVED', 'PUBLISHED')
  ),
  constraint automation_content_slug_check check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  constraint automation_content_title_check check (btrim(title) <> ''),
  constraint automation_content_editorial_check check (jsonb_typeof(editorial_content) = 'object'),
  constraint automation_content_rules_check check (jsonb_typeof(live_rules) = 'object'),
  constraint automation_content_tenant_slug_key unique (tenant_id, slug)
);

create index automation_content_workflow_idx
  on public.automation_content_entries (tenant_id, content_type, workflow_status, updated_at desc);

create table public.automation_content_product_slots (
  id bigint generated always as identity primary key,
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  content_entry_id uuid not null references public.automation_content_entries(id) on delete cascade,
  supplier_product_id uuid not null references public.supplier_products(id) on delete restrict,
  position smallint not null,
  price_snapshot numeric(14, 2) not null,
  source_run_id uuid not null references public.automation_runs(id) on delete restrict,
  refreshed_at timestamptz not null default now(),
  constraint automation_content_slots_position_check check (position between 0 and 50),
  constraint automation_content_slots_price_check check (price_snapshot > 0),
  constraint automation_content_slots_position_key unique (tenant_id, content_entry_id, position),
  constraint automation_content_slots_product_key unique (tenant_id, content_entry_id, supplier_product_id)
);

create index automation_content_slots_product_idx
  on public.automation_content_product_slots (supplier_product_id);
create index automation_content_slots_run_idx
  on public.automation_content_product_slots (source_run_id);

create trigger home_feature_pins_set_updated_at
before update on public.home_feature_pins
for each row execute function lombardo_private.set_updated_at();

create trigger automation_content_entries_set_updated_at
before update on public.automation_content_entries
for each row execute function lombardo_private.set_updated_at();

create or replace function lombardo_private.assert_safe_automation_product(
  p_tenant_id uuid,
  p_product_id uuid
)
returns void
language plpgsql
set search_path = ''
as $$
begin
  if not exists (
    select 1
    from public.supplier_products product
    join public.suppliers supplier on supplier.id = product.supplier_id
    join public.supplier_prices price
      on price.supplier_product_id = product.id
     and price.price_type = 'retail'
    where product.id = p_product_id
      and supplier.tenant_id = p_tenant_id
      and product.active is true
      and product.eligibility_status = 'safe'
      and price.current_price > 0
  ) then
    raise exception using errcode = '23514', message = 'AUTOMATION_PRODUCT_NOT_SAFE';
  end if;
end;
$$;

create or replace function lombardo_private.validate_home_automation_product()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  perform lombardo_private.assert_safe_automation_product(new.tenant_id, new.supplier_product_id);
  return new;
end;
$$;

create trigger home_feature_pins_validate_safe
before insert or update of tenant_id, supplier_product_id, active on public.home_feature_pins
for each row when (new.active is true)
execute function lombardo_private.validate_home_automation_product();

create trigger home_daily_slots_validate_safe
before insert or update of tenant_id, supplier_product_id on public.home_daily_slots
for each row when (new.supplier_product_id is not null)
execute function lombardo_private.validate_home_automation_product();

create or replace function lombardo_private.validate_content_automation_product()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if not exists (
    select 1 from public.automation_content_entries entry
    where entry.id = new.content_entry_id and entry.tenant_id = new.tenant_id
  ) then
    raise exception using errcode = '23503', message = 'AUTOMATION_CONTENT_TENANT_MISMATCH';
  end if;
  perform lombardo_private.assert_safe_automation_product(new.tenant_id, new.supplier_product_id);
  return new;
end;
$$;

create trigger automation_content_slots_validate_safe
before insert or update on public.automation_content_product_slots
for each row execute function lombardo_private.validate_content_automation_product();

create or replace function public.lombardo_claim_automation_run(
  p_tenant_id uuid,
  p_automation_type text,
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
  v_run public.automation_runs%rowtype;
begin
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_tenant_id::text || ':' || p_automation_type, 0)
  );

  select * into v_run
  from public.automation_runs run
  where run.tenant_id = p_tenant_id
    and run.automation_type = p_automation_type
    and run.status = 'running'
    and run.lease_expires_at > pg_catalog.now()
  order by run.started_at desc
  limit 1
  for update;

  if found then
    return jsonb_build_object('claimed', false, 'reason', 'already_running', 'runId', v_run.id);
  end if;

  update public.automation_runs
     set status = 'failed',
         finished_at = pg_catalog.now(),
         errors = errors || jsonb_build_array('LEASE_EXPIRED')
   where tenant_id = p_tenant_id
     and automation_type = p_automation_type
     and status = 'running'
     and lease_expires_at <= pg_catalog.now();

  select * into v_run
  from public.automation_runs run
  where run.tenant_id = p_tenant_id
    and run.automation_type = p_automation_type
    and run.run_key = p_run_key
  for update;

  if found and v_run.status in ('completed', 'warning', 'skipped') then
    return jsonb_build_object('claimed', false, 'reason', 'already_finished', 'runId', v_run.id);
  end if;

  if found then
    update public.automation_runs
       set trigger_source = p_trigger_source,
           started_at = pg_catalog.now(),
           heartbeat_at = pg_catalog.now(),
           lease_expires_at = pg_catalog.now() + interval '15 minutes',
           finished_at = null,
           status = 'running',
           attempt = attempt + 1,
           summary = '{}'::jsonb,
           warnings = '[]'::jsonb,
           errors = '[]'::jsonb,
           alert_status = 'not_required',
           alert_sent_at = null,
           alert_provider_message_id = null,
           alert_error_summary = null,
           created_by = coalesce(p_created_by, created_by)
     where id = v_run.id
     returning * into v_run;
  else
    insert into public.automation_runs (
      tenant_id, automation_type, run_key, trigger_source, created_by
    ) values (
      p_tenant_id, p_automation_type, p_run_key, p_trigger_source, p_created_by
    ) returning * into v_run;
  end if;

  return jsonb_build_object(
    'claimed', true,
    'runId', v_run.id,
    'attempt', v_run.attempt
  );
end;
$$;

create or replace function public.lombardo_replace_home_daily_slots(
  p_tenant_id uuid,
  p_run_id uuid,
  p_selection_date date,
  p_slots jsonb
)
returns integer
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_slot jsonb;
  v_count integer := 0;
begin
  if jsonb_typeof(p_slots) <> 'array' then
    raise exception using errcode = '22023', message = 'AUTOMATION_HOME_SLOTS_INVALID';
  end if;
  if not exists (
    select 1 from public.automation_runs run
    where run.id = p_run_id and run.tenant_id = p_tenant_id
      and run.automation_type = 'daily_featured' and run.status = 'running'
  ) then
    raise exception using errcode = '23514', message = 'AUTOMATION_HOME_RUN_INVALID';
  end if;

  delete from public.home_daily_slots
  where tenant_id = p_tenant_id and selection_date = p_selection_date;

  for v_slot in select value from jsonb_array_elements(p_slots)
  loop
    insert into public.home_daily_slots (
      tenant_id, selection_date, slot_type, position, supplier_product_id,
      category_slug, is_pinned, source_run_id
    ) values (
      p_tenant_id,
      p_selection_date,
      v_slot->>'slotType',
      (v_slot->>'position')::smallint,
      nullif(v_slot->>'productId', '')::uuid,
      nullif(v_slot->>'categorySlug', ''),
      coalesce((v_slot->>'isPinned')::boolean, false),
      p_run_id
    );
    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$$;

create or replace function public.lombardo_replace_content_product_slots(
  p_tenant_id uuid,
  p_run_id uuid,
  p_content_entry_id uuid,
  p_products jsonb
)
returns integer
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_product jsonb;
  v_count integer := 0;
begin
  if jsonb_typeof(p_products) <> 'array' then
    raise exception using errcode = '22023', message = 'AUTOMATION_CONTENT_PRODUCTS_INVALID';
  end if;
  if not exists (
    select 1 from public.automation_runs run
    where run.id = p_run_id and run.tenant_id = p_tenant_id
      and run.automation_type in ('live_guides', 'seo_content') and run.status = 'running'
  ) then
    raise exception using errcode = '23514', message = 'AUTOMATION_CONTENT_RUN_INVALID';
  end if;

  delete from public.automation_content_product_slots
  where tenant_id = p_tenant_id and content_entry_id = p_content_entry_id;

  for v_product in select value from jsonb_array_elements(p_products)
  loop
    insert into public.automation_content_product_slots (
      tenant_id, content_entry_id, supplier_product_id, position,
      price_snapshot, source_run_id
    ) values (
      p_tenant_id,
      p_content_entry_id,
      (v_product->>'productId')::uuid,
      (v_product->>'position')::smallint,
      (v_product->>'price')::numeric,
      p_run_id
    );
    v_count := v_count + 1;
  end loop;
  update public.automation_content_entries
     set last_live_refresh_at = pg_catalog.now()
   where id = p_content_entry_id and tenant_id = p_tenant_id;
  return v_count;
end;
$$;

alter table public.secret_cellar_challenges
  drop constraint secret_cellar_challenges_generated_by_check;
alter table public.secret_cellar_challenges
  add constraint secret_cellar_challenges_generated_by_check check (
    generated_by in ('DAILY_ENGINE', 'ADMIN_NEXT_REGENERATION', 'DAILY_FALLBACK')
  );

create or replace function public.lombardo_clone_latest_secret_cellar_challenge(
  p_tenant_id uuid,
  p_challenge_date date
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_previous public.secret_cellar_challenges%rowtype;
  v_candidates jsonb;
  v_count integer;
  v_new_id uuid;
begin
  select * into v_previous
  from public.secret_cellar_challenges challenge
  where challenge.tenant_id = p_tenant_id
    and challenge.challenge_date < p_challenge_date
  order by challenge.challenge_date desc
  limit 1;
  if not found then return null; end if;

  select jsonb_agg(
           jsonb_set(candidate.value, '{price}', to_jsonb(price.current_price), true)
           order by candidate.ordinality
         ), count(*)
    into v_candidates, v_count
  from jsonb_array_elements(v_previous.candidates) with ordinality candidate(value, ordinality)
  join public.supplier_products product on product.id = (candidate.value->>'id')::uuid
  join public.suppliers supplier on supplier.id = product.supplier_id
  join public.supplier_prices price
    on price.supplier_product_id = product.id and price.price_type = 'retail'
  where supplier.tenant_id = p_tenant_id
    and product.active is true
    and product.eligibility_status = 'safe'
    and price.current_price > 0
    and not exists (
      select 1 from public.secret_cellar_exclusions exclusion
      where exclusion.tenant_id = p_tenant_id and exclusion.product_id = product.id
    );

  if v_count <> jsonb_array_length(v_previous.candidates) then return null; end if;

  insert into public.secret_cellar_challenges (
    tenant_id, challenge_date, status, secret_product_id, candidates, clues,
    reward_percentage, reward_valid_hours, generated_by
  ) values (
    p_tenant_id,
    p_challenge_date,
    case when p_challenge_date = (pg_catalog.timezone('America/Argentina/Cordoba', pg_catalog.now()))::date
      then 'ACTIVE' else 'SCHEDULED' end,
    v_previous.secret_product_id,
    v_candidates,
    v_previous.clues,
    v_previous.reward_percentage,
    v_previous.reward_valid_hours,
    'DAILY_FALLBACK'
  )
  on conflict (tenant_id, challenge_date) do nothing
  returning id into v_new_id;

  if v_new_id is null then
    select id into v_new_id from public.secret_cellar_challenges
    where tenant_id = p_tenant_id and challenge_date = p_challenge_date;
  end if;
  return v_new_id;
end;
$$;

alter table public.automation_runs enable row level security;
alter table public.automation_runs force row level security;
alter table public.home_feature_pins enable row level security;
alter table public.home_feature_pins force row level security;
alter table public.home_daily_slots enable row level security;
alter table public.home_daily_slots force row level security;
alter table public.automation_content_entries enable row level security;
alter table public.automation_content_entries force row level security;
alter table public.automation_content_product_slots enable row level security;
alter table public.automation_content_product_slots force row level security;

revoke all on table public.automation_runs, public.home_feature_pins,
  public.home_daily_slots, public.automation_content_entries,
  public.automation_content_product_slots from public, anon, authenticated;
grant select, insert, update on table public.automation_runs to service_role;
grant select, insert, update, delete on table public.home_feature_pins to service_role;
grant select, insert, update, delete on table public.home_daily_slots to service_role;
grant select, insert, update, delete on table public.automation_content_entries to service_role;
grant select, insert, update, delete on table public.automation_content_product_slots to service_role;
grant usage, select on sequence public.home_daily_slots_id_seq,
  public.automation_content_product_slots_id_seq to service_role;

revoke all on function public.lombardo_claim_automation_run(uuid, text, text, text, uuid)
  from public, anon, authenticated;
grant execute on function public.lombardo_claim_automation_run(uuid, text, text, text, uuid)
  to service_role;
revoke all on function public.lombardo_replace_home_daily_slots(uuid, uuid, date, jsonb)
  from public, anon, authenticated;
grant execute on function public.lombardo_replace_home_daily_slots(uuid, uuid, date, jsonb)
  to service_role;
revoke all on function public.lombardo_replace_content_product_slots(uuid, uuid, uuid, jsonb)
  from public, anon, authenticated;
grant execute on function public.lombardo_replace_content_product_slots(uuid, uuid, uuid, jsonb)
  to service_role;
revoke all on function public.lombardo_clone_latest_secret_cellar_challenge(uuid, date)
  from public, anon, authenticated;
grant execute on function public.lombardo_clone_latest_secret_cellar_challenge(uuid, date)
  to service_role;

comment on table public.automation_runs is
  'Server-only audit trail and durable lease for Lombardo daily automations.';
comment on table public.home_daily_slots is
  'Daily Lombardo Home inputs. Product rows are guarded as SAFE at write time.';
comment on table public.automation_content_entries is
  'Editorial content and SEO workflow; live product data remains separate.';
