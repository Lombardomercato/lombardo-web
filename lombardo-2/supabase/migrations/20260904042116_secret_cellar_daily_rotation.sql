-- Cava Secreta daily rotation hardening.
-- Existing challenge rows remain immutable and continue to be the audit trail.

create or replace function lombardo_private.secret_cellar_business_date(
  p_now timestamptz default pg_catalog.now()
)
returns date
language sql
stable
set search_path = ''
as $$
  select (pg_catalog.timezone('America/Argentina/Buenos_Aires', p_now))::date;
$$;

revoke all on function lombardo_private.secret_cellar_business_date(timestamptz)
  from public, anon, authenticated;
grant execute on function lombardo_private.secret_cellar_business_date(timestamptz)
  to service_role;

create or replace function lombardo_private.validate_secret_cellar_daily_rotation()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_today date := lombardo_private.secret_cellar_business_date();
  v_clue jsonb;
begin
  if new.status = 'ACTIVE' and new.challenge_date <> v_today then
    raise exception using errcode = '23514', message = 'SECRET_CELLAR_ACTIVE_DATE_MISMATCH';
  end if;
  if new.status = 'SCHEDULED' and new.challenge_date <= v_today then
    raise exception using errcode = '23514', message = 'SECRET_CELLAR_SCHEDULED_DATE_MISMATCH';
  end if;

  -- Product attribution is mandatory for every challenge created after this fix.
  if new.challenge_date >= date '2026-09-05' then
    for v_clue in select value from jsonb_array_elements(new.clues)
    loop
      if not (v_clue ? 'productId')
        or (v_clue->>'productId')::uuid is distinct from new.secret_product_id then
        raise exception using errcode = '23514', message = 'SECRET_CELLAR_CLUE_PRODUCT_MISMATCH';
      end if;
    end loop;
  end if;

  -- Reject a repeated secret when the candidate snapshot contains an unused one.
  if exists (
    select 1
    from (
      select challenge.secret_product_id
      from public.secret_cellar_challenges challenge
      where challenge.tenant_id = new.tenant_id
        and challenge.challenge_date < new.challenge_date
      order by challenge.challenge_date desc
      limit 30
    ) recent
    where recent.secret_product_id = new.secret_product_id
  ) and exists (
    select 1
    from jsonb_array_elements(new.candidates) candidate
    where not exists (
      select 1
      from (
        select challenge.secret_product_id
        from public.secret_cellar_challenges challenge
        where challenge.tenant_id = new.tenant_id
          and challenge.challenge_date < new.challenge_date
        order by challenge.challenge_date desc
        limit 30
      ) recent
      where recent.secret_product_id = (candidate->>'id')::uuid
    )
  ) then
    raise exception using errcode = '23514', message = 'SECRET_CELLAR_SECRET_REPEATED_WITHIN_30';
  end if;

  return new;
end;
$$;

revoke all on function lombardo_private.validate_secret_cellar_daily_rotation()
  from public, anon, authenticated;
grant execute on function lombardo_private.validate_secret_cellar_daily_rotation()
  to service_role;

drop trigger if exists secret_cellar_daily_rotation_guard
  on public.secret_cellar_challenges;
create trigger secret_cellar_daily_rotation_guard
before insert or update on public.secret_cellar_challenges
for each row execute function lombardo_private.validate_secret_cellar_daily_rotation();

create index if not exists secret_cellar_challenges_history_idx
  on public.secret_cellar_challenges (tenant_id, challenge_date desc)
  include (secret_product_id, generated_by, created_at);

comment on function lombardo_private.secret_cellar_business_date(timestamptz) is
  'Canonical Lombardo business date in America/Argentina/Buenos_Aires.';
comment on trigger secret_cellar_daily_rotation_guard on public.secret_cellar_challenges is
  'Guards Argentina-day status, clue attribution and 30-challenge secret rotation.';
