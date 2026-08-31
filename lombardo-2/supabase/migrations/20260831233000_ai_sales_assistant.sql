-- Lombardo AI sales assistant telemetry and abuse controls.
-- Conversation text is intentionally not persisted: only bounded operational events.

create table public.lombardo_ai_chat_sessions (
  id uuid primary key,
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  customer_account_id uuid references public.customer_accounts(id) on delete set null,
  pricing_policy text not null,
  started_at timestamptz not null default now(),
  last_activity_at timestamptz not null default now(),
  message_count integer not null default 0,
  tool_call_count integer not null default 0,
  error_count integer not null default 0,
  constraint lombardo_ai_session_policy_check check (
    pricing_policy in ('RETAIL', 'WHOLESALE', 'BUSINESS', 'CUSTOM_DISCOUNT')
  ),
  constraint lombardo_ai_session_counters_check check (
    message_count >= 0 and tool_call_count >= 0 and error_count >= 0
  )
);

create index lombardo_ai_sessions_activity_idx
  on public.lombardo_ai_chat_sessions (tenant_id, last_activity_at desc);
create index lombardo_ai_sessions_customer_idx
  on public.lombardo_ai_chat_sessions (tenant_id, customer_account_id, last_activity_at desc)
  where customer_account_id is not null;

create table public.lombardo_ai_events (
  id bigint generated always as identity primary key,
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  chat_session_id uuid not null references public.lombardo_ai_chat_sessions(id) on delete cascade,
  customer_account_id uuid references public.customer_accounts(id) on delete set null,
  event_name text not null,
  source text not null default 'storefront',
  tool_name text,
  product_id uuid references public.supplier_products(id) on delete set null,
  topic text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint lombardo_ai_event_name_check check (event_name in (
    'chat_open', 'chat_start', 'chat_message', 'tool_call',
    'recommendation_shown', 'recommendation_click', 'chat_add_to_cart',
    'chat_product_view', 'chat_checkout_assist', 'tool_error', 'chat_error'
  )),
  constraint lombardo_ai_event_source_check check (source in ('storefront', 'server', 'admin')),
  constraint lombardo_ai_event_tool_check check (
    tool_name is null or tool_name in (
      'search_products', 'get_product', 'recommend_products',
      'get_effective_price', 'get_opportunities', 'search_guides', 'build_selection'
    )
  ),
  constraint lombardo_ai_event_topic_check check (topic is null or char_length(topic) <= 60),
  constraint lombardo_ai_event_metadata_check check (
    jsonb_typeof(metadata) = 'object' and pg_column_size(metadata) <= 4096
  )
);

create index lombardo_ai_events_session_idx
  on public.lombardo_ai_events (chat_session_id, created_at desc);
create index lombardo_ai_events_dashboard_idx
  on public.lombardo_ai_events (tenant_id, event_name, created_at desc);
create index lombardo_ai_events_product_idx
  on public.lombardo_ai_events (tenant_id, product_id, created_at desc)
  where product_id is not null;
create index lombardo_ai_events_errors_idx
  on public.lombardo_ai_events (tenant_id, created_at desc)
  where event_name in ('tool_error', 'chat_error');

create table lombardo_private.ai_rate_limits (
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  subject_hash text not null,
  bucket_start timestamptz not null,
  request_count integer not null default 1,
  updated_at timestamptz not null default now(),
  primary key (tenant_id, subject_hash, bucket_start),
  constraint ai_rate_limit_hash_check check (subject_hash ~ '^[a-f0-9]{64}$'),
  constraint ai_rate_limit_count_check check (request_count > 0)
);

create index ai_rate_limits_cleanup_idx
  on lombardo_private.ai_rate_limits (bucket_start);

alter table public.lombardo_ai_chat_sessions enable row level security;
alter table public.lombardo_ai_chat_sessions force row level security;
alter table public.lombardo_ai_events enable row level security;
alter table public.lombardo_ai_events force row level security;

revoke all on table public.lombardo_ai_chat_sessions from public, anon, authenticated;
revoke all on table public.lombardo_ai_events from public, anon, authenticated;
revoke all on table lombardo_private.ai_rate_limits from public, anon, authenticated;
grant all on table public.lombardo_ai_chat_sessions to service_role;
grant all on table public.lombardo_ai_events to service_role;
grant usage, select on sequence public.lombardo_ai_events_id_seq to service_role;
grant all on table lombardo_private.ai_rate_limits to service_role;

create or replace function public.lombardo_ai_consume_rate_limit(
  p_tenant_id uuid,
  p_subject_hash text,
  p_limit integer default 20,
  p_window_seconds integer default 600
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_bucket timestamptz;
  v_count integer;
begin
  if p_subject_hash !~ '^[a-f0-9]{64}$'
     or p_limit < 1 or p_limit > 200
     or p_window_seconds < 60 or p_window_seconds > 86400 then
    raise exception using errcode = '22023', message = 'INVALID_RATE_LIMIT_INPUT';
  end if;
  if not exists (select 1 from public.tenants where id = p_tenant_id and status = 'active') then
    raise exception using errcode = '23503', message = 'TENANT_NOT_ACTIVE';
  end if;

  v_bucket := to_timestamp(
    floor(extract(epoch from pg_catalog.now()) / p_window_seconds) * p_window_seconds
  );

  insert into lombardo_private.ai_rate_limits (
    tenant_id, subject_hash, bucket_start, request_count, updated_at
  ) values (
    p_tenant_id, p_subject_hash, v_bucket, 1, pg_catalog.now()
  )
  on conflict (tenant_id, subject_hash, bucket_start)
  do update set
    request_count = lombardo_private.ai_rate_limits.request_count + 1,
    updated_at = pg_catalog.now()
  returning request_count into v_count;

  delete from lombardo_private.ai_rate_limits
  where bucket_start < pg_catalog.now() - interval '2 days';

  return jsonb_build_object(
    'allowed', v_count <= p_limit,
    'count', v_count,
    'limit', p_limit,
    'resetAt', v_bucket + make_interval(secs => p_window_seconds)
  );
end;
$$;

create or replace function public.lombardo_ai_record_event(
  p_tenant_id uuid,
  p_chat_session_id uuid,
  p_customer_account_id uuid,
  p_pricing_policy text,
  p_event_name text,
  p_source text default 'server',
  p_tool_name text default null,
  p_product_id uuid default null,
  p_topic text default null,
  p_metadata jsonb default '{}'::jsonb
)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_event_id bigint;
begin
  if p_customer_account_id is not null and not exists (
    select 1 from public.customer_accounts account
    where account.id = p_customer_account_id and account.tenant_id = p_tenant_id
  ) then
    raise exception using errcode = '23503', message = 'CUSTOMER_TENANT_MISMATCH';
  end if;

  insert into public.lombardo_ai_chat_sessions (
    id, tenant_id, customer_account_id, pricing_policy,
    message_count, tool_call_count, error_count
  ) values (
    p_chat_session_id, p_tenant_id, p_customer_account_id, p_pricing_policy,
    case when p_event_name = 'chat_message' then 1 else 0 end,
    case when p_event_name = 'tool_call' then 1 else 0 end,
    case when p_event_name in ('tool_error', 'chat_error') then 1 else 0 end
  )
  on conflict (id) do update set
    last_activity_at = pg_catalog.now(),
    customer_account_id = excluded.customer_account_id,
    pricing_policy = excluded.pricing_policy,
    message_count = public.lombardo_ai_chat_sessions.message_count
      + case when p_event_name = 'chat_message' then 1 else 0 end,
    tool_call_count = public.lombardo_ai_chat_sessions.tool_call_count
      + case when p_event_name = 'tool_call' then 1 else 0 end,
    error_count = public.lombardo_ai_chat_sessions.error_count
      + case when p_event_name in ('tool_error', 'chat_error') then 1 else 0 end;

  insert into public.lombardo_ai_events (
    tenant_id, chat_session_id, customer_account_id, event_name,
    source, tool_name, product_id, topic, metadata
  ) values (
    p_tenant_id, p_chat_session_id, p_customer_account_id, p_event_name,
    p_source, p_tool_name, p_product_id, left(p_topic, 60), coalesce(p_metadata, '{}'::jsonb)
  ) returning id into v_event_id;

  return v_event_id;
end;
$$;

revoke all on function public.lombardo_ai_consume_rate_limit(uuid, text, integer, integer)
  from public, anon, authenticated;
revoke all on function public.lombardo_ai_record_event(uuid, uuid, uuid, text, text, text, text, uuid, text, jsonb)
  from public, anon, authenticated;
grant execute on function public.lombardo_ai_consume_rate_limit(uuid, text, integer, integer)
  to service_role;
grant execute on function public.lombardo_ai_record_event(uuid, uuid, uuid, text, text, text, text, uuid, text, jsonb)
  to service_role;
