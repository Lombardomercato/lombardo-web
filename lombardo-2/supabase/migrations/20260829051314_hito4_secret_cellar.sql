-- HITO 4: La Cava Secreta. Daily immutable challenges, privacy-minimised
-- attempts and Promotion Engine rewards. All tables and RPCs are server-only.

create table public.secret_cellar_settings (
  tenant_id uuid primary key references public.tenants(id) on delete cascade,
  enabled boolean not null default true,
  candidate_count smallint not null default 10,
  clue_count smallint not null default 5,
  reward_percentage numeric(5, 2) not null default 15,
  reward_valid_hours smallint not null default 48,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint secret_cellar_settings_candidate_count_check check (candidate_count between 8 and 12),
  constraint secret_cellar_settings_clue_count_check check (clue_count between 4 and 5),
  constraint secret_cellar_settings_reward_percentage_check check (
    reward_percentage > 0 and reward_percentage < 100
  ),
  constraint secret_cellar_settings_reward_hours_check check (reward_valid_hours between 1 and 168)
);

create table public.secret_cellar_exclusions (
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  product_id uuid not null references public.supplier_products(id) on delete cascade,
  reason text not null default '',
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (tenant_id, product_id),
  constraint secret_cellar_exclusions_reason_check check (char_length(reason) <= 500)
);

create index secret_cellar_settings_updated_by_idx
  on public.secret_cellar_settings (updated_by) where updated_by is not null;
create index secret_cellar_exclusions_product_idx
  on public.secret_cellar_exclusions (product_id);
create index secret_cellar_exclusions_created_by_idx
  on public.secret_cellar_exclusions (created_by) where created_by is not null;

create table public.secret_cellar_challenges (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  challenge_date date not null,
  status text not null,
  secret_product_id uuid not null references public.supplier_products(id) on delete restrict,
  candidates jsonb not null,
  clues jsonb not null,
  reward_percentage numeric(5, 2) not null,
  reward_valid_hours smallint not null,
  generated_by text not null default 'DAILY_ENGINE',
  created_at timestamptz not null default now(),
  constraint secret_cellar_challenges_status_check check (status in ('SCHEDULED', 'ACTIVE')),
  constraint secret_cellar_challenges_candidates_check check (
    jsonb_typeof(candidates) = 'array' and jsonb_array_length(candidates) between 8 and 12
  ),
  constraint secret_cellar_challenges_clues_check check (
    jsonb_typeof(clues) = 'array' and jsonb_array_length(clues) between 4 and 5
  ),
  constraint secret_cellar_challenges_reward_percentage_check check (
    reward_percentage > 0 and reward_percentage < 100
  ),
  constraint secret_cellar_challenges_reward_hours_check check (reward_valid_hours between 1 and 168),
  constraint secret_cellar_challenges_generated_by_check check (
    generated_by in ('DAILY_ENGINE', 'ADMIN_NEXT_REGENERATION')
  ),
  constraint secret_cellar_challenges_tenant_date_key unique (tenant_id, challenge_date),
  constraint secret_cellar_challenges_tenant_id_id_key unique (tenant_id, id)
);

create index secret_cellar_challenges_status_idx
  on public.secret_cellar_challenges (tenant_id, status, challenge_date desc);
create index secret_cellar_challenges_secret_product_idx
  on public.secret_cellar_challenges (secret_product_id);

create table public.secret_cellar_attempts (
  id bigint generated always as identity primary key,
  tenant_id uuid not null,
  challenge_id uuid not null,
  player_key text not null,
  customer_account_id uuid,
  guest_contact_kind text,
  guest_contact_hash text,
  guest_contact_masked text,
  selected_product_id uuid not null references public.supplier_products(id) on delete restrict,
  result text not null,
  promotion_id uuid,
  coupon_code text,
  attempted_at timestamptz not null default now(),
  foreign key (tenant_id, challenge_id)
    references public.secret_cellar_challenges(tenant_id, id) on delete restrict,
  foreign key (tenant_id, customer_account_id)
    references public.customer_accounts(tenant_id, id) on delete restrict,
  foreign key (tenant_id, promotion_id)
    references public.commerce_promotions(tenant_id, id) on delete restrict,
  constraint secret_cellar_attempts_result_check check (result in ('FOUND', 'MISSED')),
  constraint secret_cellar_attempts_player_check check (
    (customer_account_id is not null
      and player_key = 'account:' || customer_account_id::text
      and guest_contact_kind is null and guest_contact_hash is null and guest_contact_masked is null)
    or
    (customer_account_id is null
      and player_key ~ '^guest:[0-9a-f]{64}$'
      and guest_contact_kind in ('EMAIL', 'WHATSAPP')
      and guest_contact_hash ~ '^[0-9a-f]{64}$'
      and player_key = 'guest:' || guest_contact_hash
      and btrim(guest_contact_masked) <> '')
  ),
  constraint secret_cellar_attempts_reward_check check (
    (result = 'MISSED' and promotion_id is null and coupon_code is null)
    or (result = 'FOUND' and promotion_id is not null and coupon_code is not null)
  ),
  constraint secret_cellar_attempts_player_once_key unique (tenant_id, challenge_id, player_key)
);

create index secret_cellar_attempts_challenge_idx
  on public.secret_cellar_attempts (tenant_id, challenge_id, attempted_at desc);
create index secret_cellar_attempts_account_idx
  on public.secret_cellar_attempts (tenant_id, customer_account_id, attempted_at desc)
  where customer_account_id is not null;
create index secret_cellar_attempts_promotion_idx
  on public.secret_cellar_attempts (tenant_id, promotion_id)
  where promotion_id is not null;
create index secret_cellar_attempts_selected_product_idx
  on public.secret_cellar_attempts (selected_product_id);

create trigger secret_cellar_settings_set_updated_at
before update on public.secret_cellar_settings
for each row execute function lombardo_private.set_updated_at();

create or replace function lombardo_private.validate_secret_cellar_exclusion()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if not exists (
    select 1
    from public.supplier_products product
    join public.suppliers supplier on supplier.id = product.supplier_id
    where product.id = new.product_id and supplier.tenant_id = new.tenant_id
  ) then
    raise exception using errcode = '23503', message = 'SECRET_CELLAR_PRODUCT_TENANT_MISMATCH';
  end if;
  return new;
end;
$$;

create trigger secret_cellar_exclusions_tenant_check
before insert or update on public.secret_cellar_exclusions
for each row execute function lombardo_private.validate_secret_cellar_exclusion();

create or replace function lombardo_private.validate_secret_cellar_challenge()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_today date := (pg_catalog.timezone('America/Argentina/Cordoba', pg_catalog.now()))::date;
  v_candidate_count integer;
  v_valid_count integer;
  v_secret_present boolean;
  v_clue jsonb;
begin
  if new.status = 'ACTIVE' and new.challenge_date <> v_today then
    raise exception using errcode = '23514', message = 'SECRET_CELLAR_ACTIVE_DATE_MISMATCH';
  end if;
  if new.status = 'SCHEDULED' and new.challenge_date <= v_today then
    raise exception using errcode = '23514', message = 'SECRET_CELLAR_SCHEDULED_DATE_MISMATCH';
  end if;

  v_candidate_count := jsonb_array_length(new.candidates);
  select count(distinct candidate->>'id'),
         bool_or((candidate->>'id')::uuid = new.secret_product_id)
    into v_valid_count, v_secret_present
  from jsonb_array_elements(new.candidates) candidate
  where jsonb_typeof(candidate) = 'object'
    and candidate ?& array['id', 'slug', 'name', 'brand', 'categorySlug', 'categoryName', 'presentation', 'price', 'imageUrl'];

  if v_valid_count <> v_candidate_count or not coalesce(v_secret_present, false) then
    raise exception using errcode = '23514', message = 'SECRET_CELLAR_INVALID_CANDIDATE_SNAPSHOT';
  end if;

  select count(*) into v_valid_count
  from jsonb_array_elements(new.candidates) candidate
  join public.supplier_products product on product.id = (candidate->>'id')::uuid
  join public.suppliers supplier on supplier.id = product.supplier_id
  join public.supplier_prices price on price.supplier_product_id = product.id and price.price_type = 'retail'
  where supplier.tenant_id = new.tenant_id
    and product.active is true
    and product.eligibility_status = 'safe'
    and price.current_price > 0
    and abs(price.current_price - (candidate->>'price')::numeric) <= 0.01
    and btrim(candidate->>'name') <> ''
    and btrim(candidate->>'slug') <> ''
    and not exists (
      select 1 from public.secret_cellar_exclusions exclusion
      where exclusion.tenant_id = new.tenant_id and exclusion.product_id = product.id
    );
  if v_valid_count <> v_candidate_count then
    raise exception using errcode = '23514', message = 'SECRET_CELLAR_INELIGIBLE_CANDIDATE';
  end if;

  for v_clue in select value from jsonb_array_elements(new.clues)
  loop
    if jsonb_typeof(v_clue) <> 'object'
      or not (v_clue ?& array['id', 'text', 'source'])
      or btrim(v_clue->>'text') = ''
      or v_clue->>'source' not in ('CATEGORY', 'PRICE', 'PRESENTATION', 'BRAND_INITIAL', 'NAME_INITIAL', 'NAME_TOKEN') then
      raise exception using errcode = '23514', message = 'SECRET_CELLAR_INVALID_CLUE';
    end if;
  end loop;
  return new;
end;
$$;

create trigger secret_cellar_challenges_validate
before insert or update on public.secret_cellar_challenges
for each row execute function lombardo_private.validate_secret_cellar_challenge();

create or replace function lombardo_private.protect_current_secret_cellar_challenge()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.challenge_date <= (pg_catalog.timezone('America/Argentina/Cordoba', pg_catalog.now()))::date then
    raise exception using errcode = '23514', message = 'SECRET_CELLAR_CURRENT_CHALLENGE_IMMUTABLE';
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

create trigger secret_cellar_challenges_protect_current
before update or delete on public.secret_cellar_challenges
for each row execute function lombardo_private.protect_current_secret_cellar_challenge();

create or replace function public.lombardo_submit_secret_cellar_attempt(
  p_tenant_id uuid,
  p_challenge_id uuid,
  p_selected_product_id uuid,
  p_player_key text,
  p_customer_account_id uuid default null,
  p_guest_contact_kind text default null,
  p_guest_contact_hash text default null,
  p_guest_contact_masked text default null
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_challenge public.secret_cellar_challenges%rowtype;
  v_attempt public.secret_cellar_attempts%rowtype;
  v_coupon_code text;
  v_promotion_id uuid;
  v_is_correct boolean;
  v_try smallint;
begin
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_tenant_id::text || ':' || p_challenge_id::text || ':' || p_player_key, 0)
  );

  select * into v_attempt
  from public.secret_cellar_attempts attempt
  where attempt.tenant_id = p_tenant_id
    and attempt.challenge_id = p_challenge_id
    and attempt.player_key = p_player_key;
  if found then
    return jsonb_build_object(
      'status', 'ALREADY_PLAYED',
      'result', v_attempt.result,
      'couponCode', v_attempt.coupon_code
    );
  end if;

  select * into v_challenge
  from public.secret_cellar_challenges challenge
  where challenge.tenant_id = p_tenant_id
    and challenge.id = p_challenge_id
    and challenge.status in ('ACTIVE', 'SCHEDULED')
    and challenge.challenge_date = (pg_catalog.timezone('America/Argentina/Cordoba', pg_catalog.now()))::date
  for share;
  if not found then
    raise exception using errcode = '23514', message = 'SECRET_CELLAR_CHALLENGE_NOT_ACTIVE';
  end if;
  if not exists (
    select 1 from jsonb_array_elements(v_challenge.candidates) candidate
    where (candidate->>'id')::uuid = p_selected_product_id
  ) then
    raise exception using errcode = '23514', message = 'SECRET_CELLAR_SELECTION_NOT_CANDIDATE';
  end if;

  if p_customer_account_id is not null then
    if p_player_key <> 'account:' || p_customer_account_id::text or not exists (
      select 1 from public.customer_accounts account
      where account.tenant_id = p_tenant_id and account.id = p_customer_account_id
        and account.status = 'active' and account.auth_user_id is not null
    ) then
      raise exception using errcode = '23514', message = 'SECRET_CELLAR_PLAYER_IDENTITY_MISMATCH';
    end if;
    p_guest_contact_kind := null;
    p_guest_contact_hash := null;
    p_guest_contact_masked := null;
  elsif p_guest_contact_kind is null
    or p_guest_contact_hash is null
    or p_guest_contact_kind not in ('EMAIL', 'WHATSAPP')
    or p_guest_contact_hash !~ '^[0-9a-f]{64}$'
    or p_player_key <> 'guest:' || p_guest_contact_hash
    or btrim(coalesce(p_guest_contact_masked, '')) = '' then
    raise exception using errcode = '23514', message = 'SECRET_CELLAR_GUEST_IDENTITY_INVALID';
  end if;

  v_is_correct := p_selected_product_id = v_challenge.secret_product_id;
  if v_is_correct then
    for v_try in 1..8 loop
      v_coupon_code := 'CAVA-' || upper(substr(encode(extensions.gen_random_bytes(5), 'hex'), 1, 8));
      begin
        insert into public.commerce_promotions (
          tenant_id, code, name, description, status, discount_type,
          discount_value, start_at, end_at, minimum_order_amount,
          max_total_uses, max_uses_per_customer, applies_to, customer_scope,
          stackable, first_order_only
        ) values (
          p_tenant_id, v_coupon_code, 'Premio La Cava Secreta',
          'Premio único del desafío ' || v_challenge.challenge_date::text,
          'ACTIVE', 'PERCENTAGE', v_challenge.reward_percentage,
          pg_catalog.now(), pg_catalog.now() + pg_catalog.make_interval(hours => v_challenge.reward_valid_hours),
          0, 1, 1, 'ALL', 'RETAIL', false, false
        ) returning id into v_promotion_id;
        exit;
      exception when unique_violation then
        if v_try = 8 then raise; end if;
      end;
    end loop;
  end if;

  insert into public.secret_cellar_attempts (
    tenant_id, challenge_id, player_key, customer_account_id,
    guest_contact_kind, guest_contact_hash, guest_contact_masked,
    selected_product_id, result, promotion_id, coupon_code
  ) values (
    p_tenant_id, p_challenge_id, p_player_key, p_customer_account_id,
    p_guest_contact_kind, p_guest_contact_hash, p_guest_contact_masked,
    p_selected_product_id, case when v_is_correct then 'FOUND' else 'MISSED' end,
    v_promotion_id, v_coupon_code
  ) returning * into v_attempt;

  return jsonb_build_object(
    'status', 'RECORDED',
    'result', v_attempt.result,
    'couponCode', v_attempt.coupon_code,
    'couponExpiresAt', case when v_attempt.promotion_id is null then null
      else pg_catalog.now() + pg_catalog.make_interval(hours => v_challenge.reward_valid_hours) end
  );
end;
$$;

alter table public.secret_cellar_settings enable row level security;
alter table public.secret_cellar_settings force row level security;
alter table public.secret_cellar_exclusions enable row level security;
alter table public.secret_cellar_exclusions force row level security;
alter table public.secret_cellar_challenges enable row level security;
alter table public.secret_cellar_challenges force row level security;
alter table public.secret_cellar_attempts enable row level security;
alter table public.secret_cellar_attempts force row level security;

revoke all on table public.secret_cellar_settings, public.secret_cellar_exclusions,
  public.secret_cellar_challenges, public.secret_cellar_attempts from public, anon, authenticated;
grant select, insert, update on table public.secret_cellar_settings to service_role;
grant select, insert, update, delete on table public.secret_cellar_exclusions to service_role;
grant select, insert, update, delete on table public.secret_cellar_challenges to service_role;
grant select, insert, update on table public.secret_cellar_attempts to service_role;
grant usage, select on sequence public.secret_cellar_attempts_id_seq to service_role;

revoke all on function public.lombardo_submit_secret_cellar_attempt(
  uuid, uuid, uuid, text, uuid, text, text, text
) from public, anon, authenticated;
grant execute on function public.lombardo_submit_secret_cellar_attempt(
  uuid, uuid, uuid, text, uuid, text, text, text
) to service_role;

comment on table public.secret_cellar_challenges is
  'Immutable daily Lombardo mystery-bottle challenge; server-only.';
comment on table public.secret_cellar_attempts is
  'One privacy-minimised attempt per player and challenge; server-only.';
comment on function public.lombardo_submit_secret_cellar_attempt(
  uuid, uuid, uuid, text, uuid, text, text, text
) is 'Atomically validates one attempt and issues a standard Promotion Engine coupon on success.';
