-- Explicitly remove Supabase default table grants and make the audit append-only.
revoke all on table public.lombardo_product_opportunities,
  public.lombardo_opportunity_history from public, anon, authenticated, service_role;
grant select, insert, update on table public.lombardo_product_opportunities to service_role;
grant select, insert on table public.lombardo_opportunity_history to service_role;

create or replace function lombardo_private.prevent_opportunity_history_mutation()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  raise exception using errcode = '23514', message = 'OPPORTUNITY_HISTORY_IMMUTABLE';
end;
$$;

create trigger lombardo_opportunity_history_immutable
before update or delete on public.lombardo_opportunity_history
for each row execute function lombardo_private.prevent_opportunity_history_mutation();

revoke all on function lombardo_private.prevent_opportunity_history_mutation()
  from public, anon, authenticated, service_role;
