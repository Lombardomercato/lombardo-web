alter table public.supplier_product_media
  add column if not exists source_image_url text,
  add column if not exists source_filename text,
  add column if not exists fetched_at timestamptz,
  add column if not exists content_sha256 text,
  add column if not exists publication_method text not null default 'human_approved';

alter table public.supplier_product_media
  add constraint supplier_product_media_sha256_check
  check (content_sha256 is null or content_sha256 ~ '^[0-9a-f]{64}$'),
  add constraint supplier_product_media_publication_method_check
  check (publication_method in ('manual', 'human_approved', 'auto_exact_high'));

create index supplier_product_media_content_sha256_idx
  on public.supplier_product_media(content_sha256)
  where content_sha256 is not null;

create table public.supplier_image_jobs (
  id uuid primary key,
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  source text not null,
  status text not null default 'ready',
  token_hash text not null,
  items_total integer not null default 0,
  items_processed integer not null default 0,
  items_published integer not null default 0,
  items_failed integer not null default 0,
  error_summary text,
  metadata jsonb not null default '{}',
  expires_at timestamptz not null,
  started_at timestamptz,
  finished_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint supplier_image_jobs_source_check check (source = 'positano'),
  constraint supplier_image_jobs_status_check check (status in ('ready','running','complete','failed')),
  constraint supplier_image_jobs_token_hash_check check (token_hash ~ '^[0-9a-f]{64}$'),
  constraint supplier_image_jobs_counts_check check (
    items_total >= 0 and items_processed >= 0 and items_published >= 0 and items_failed >= 0
  )
);

alter table public.supplier_image_jobs enable row level security;
alter table public.supplier_image_jobs force row level security;
revoke all on table public.supplier_image_jobs from public, anon, authenticated;
grant select, insert, update on table public.supplier_image_jobs to service_role;

create or replace function public.supplier_record_image_job_batch(
  p_job_id uuid,
  p_processed integer,
  p_published integer,
  p_failed integer,
  p_error_summary text,
  p_complete boolean
)
returns public.supplier_image_jobs
language plpgsql
security invoker
set search_path = ''
as $$
declare v_job public.supplier_image_jobs;
begin
  update public.supplier_image_jobs
  set status = case when p_complete then 'complete' else 'running' end,
      started_at = coalesce(started_at, now()),
      finished_at = case when p_complete then now() else null end,
      items_processed = items_processed + greatest(p_processed, 0),
      items_published = items_published + greatest(p_published, 0),
      items_failed = items_failed + greatest(p_failed, 0),
      error_summary = nullif(left(coalesce(p_error_summary, ''), 2000), ''),
      updated_at = now()
  where id = p_job_id
  returning * into v_job;
  if not found then raise exception using errcode = 'P0002', message = 'IMAGE_JOB_NOT_FOUND'; end if;
  return v_job;
end;
$$;

revoke all on function public.supplier_record_image_job_batch(uuid,integer,integer,integer,text,boolean) from public, anon, authenticated;
grant execute on function public.supplier_record_image_job_batch(uuid,integer,integer,integer,text,boolean) to service_role;

create or replace function public.supplier_publish_external_candidate_v2(
  p_candidate_id uuid,
  p_bucket_id text,
  p_storage_path text,
  p_mime_type text,
  p_byte_size integer,
  p_alt_text text,
  p_created_by uuid,
  p_source_image_url text,
  p_source_filename text,
  p_content_sha256 text,
  p_fetched_at timestamptz
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_candidate public.external_image_candidates;
  v_product public.supplier_products;
  v_position integer;
  v_media public.supplier_product_media;
  v_reusable public.supplier_product_media;
  v_method text;
begin
  select * into v_candidate from public.external_image_candidates where id = p_candidate_id for update;
  if not found then raise exception using errcode = 'P0002', message = 'IMAGE_CANDIDATE_NOT_FOUND'; end if;
  if v_candidate.match_review_status <> 'approved' or v_candidate.approval_status <> 'pending' then
    raise exception using errcode = '23514', message = 'IMAGE_CANDIDATE_NOT_APPROVED_FOR_PUBLICATION';
  end if;
  select * into v_product from public.supplier_products where id = v_candidate.supplier_product_id for update;
  if not found or not v_product.active or v_product.eligibility_status <> 'safe' then
    raise exception using errcode = '23514', message = 'PRODUCT_NOT_PUBLICATION_ELIGIBLE';
  end if;
  v_method := case when v_candidate.provenance->>'approvalMode' = 'auto_exact_high' then 'auto_exact_high' else 'human_approved' end;
  if v_method = 'auto_exact_high' and (
    v_candidate.source <> 'positano' or v_candidate.match_confidence < 0.9
    or coalesce((v_candidate.provenance->>'exact')::boolean, false) is not true
    or jsonb_array_length(coalesce(v_candidate.provenance->'mismatchWarnings', '[]'::jsonb)) <> 0
  ) then raise exception using errcode = '23514', message = 'AUTO_PUBLICATION_GUARDRAIL_FAILED'; end if;
  select * into v_reusable
  from public.supplier_product_media
  where content_sha256 = p_content_sha256
  order by created_at asc
  limit 1;
  update public.supplier_product_media set is_primary = false where supplier_product_id = v_product.id and is_primary;
  select coalesce(max(position), -1) + 1 into v_position from public.supplier_product_media where supplier_product_id = v_product.id;
  insert into public.supplier_product_media (
    supplier_product_id,bucket_id,storage_path,mime_type,byte_size,alt_text,position,is_primary,
    source,source_url,source_image_url,source_filename,fetched_at,content_sha256,publication_method,
    approval_status,rights_status,created_by
  ) values (
    v_product.id,coalesce(v_reusable.bucket_id,p_bucket_id),coalesce(v_reusable.storage_path,p_storage_path),
    p_mime_type,p_byte_size,btrim(p_alt_text),v_position,true,
    'external_approved',v_candidate.source_url,p_source_image_url,p_source_filename,p_fetched_at,p_content_sha256,v_method,
    'approved','approved',p_created_by
  ) returning * into v_media;
  update public.external_image_candidates
  set approval_status='approved', rights_status='approved', reviewed_by=coalesce(reviewed_by,p_created_by),
      reviewed_at=coalesce(reviewed_at,now()), updated_at=now()
  where id=v_candidate.id;
  update public.external_product_matches
  set approval_status='approved', reviewed_by=coalesce(reviewed_by,p_created_by),
      reviewed_at=coalesce(reviewed_at,now()), updated_at=now()
  where id=v_candidate.external_product_match_id;
  return to_jsonb(v_media);
end;
$$;

revoke all on function public.supplier_publish_external_candidate_v2(uuid,text,text,text,integer,text,uuid,text,text,text,timestamptz) from public, anon, authenticated;
grant execute on function public.supplier_publish_external_candidate_v2(uuid,text,text,text,integer,text,uuid,text,text,text,timestamptz) to service_role;

create or replace function public.supplier_import_positano_candidates(p_items jsonb)
returns table(candidate_id uuid, auto_publish boolean)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_item jsonb;
  v_product public.supplier_products;
  v_match public.external_product_matches;
  v_candidate public.external_image_candidates;
  v_score numeric;
  v_auto boolean;
begin
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) < 1 or jsonb_array_length(p_items) > 25 then
    raise exception using errcode = '22023', message = 'INVALID_POSITANO_CANDIDATE_BATCH';
  end if;
  for v_item in select value from jsonb_array_elements(p_items) loop
    v_score := (v_item->>'confidence')::numeric;
    v_auto := coalesce((v_item->>'autoPublish')::boolean, false);
    select * into v_product
    from public.supplier_products
    where id = (v_item->>'productId')::uuid
      and active = true
      and eligibility_status = 'safe';
    if not found then raise exception using errcode = '23514', message = 'PRODUCT_NOT_PUBLICATION_ELIGIBLE'; end if;
    if v_score < 0.72 or v_score > 1 then
      raise exception using errcode = '23514', message = 'INVALID_MATCH_CONFIDENCE';
    end if;
    if (v_item->>'sourceUrl') !~ '^https://www[.]positanovinos[.]com[.]ar/'
      or (v_item->>'imageUrl') !~ '^https://acdn-us[.]mitiendanube[.]com/' then
      raise exception using errcode = '23514', message = 'INVALID_POSITANO_SOURCE';
    end if;
    if v_auto and (
      v_score < 0.9
      or coalesce((v_item->>'exact')::boolean, false) is not true
      or jsonb_array_length(coalesce(v_item->'mismatchWarnings','[]'::jsonb)) <> 0
    ) then raise exception using errcode = '23514', message = 'AUTO_IMPORT_GUARDRAIL_FAILED'; end if;

    insert into public.external_product_matches (
      supplier_product_id,source,source_product_key,source_url,match_confidence,approval_status
    ) values (
      v_product.id,'positano',nullif(v_item->>'sourceProductKey',''),v_item->>'sourceUrl',v_score,
      case when v_auto then 'approved' else 'pending' end
    )
    on conflict (supplier_product_id,source,source_url) do update
    set match_confidence=excluded.match_confidence,
        source_product_key=excluded.source_product_key,
        approval_status=case when v_auto then 'approved' else public.external_product_matches.approval_status end,
        updated_at=now()
    returning * into v_match;

    insert into public.external_image_candidates (
      external_product_match_id,supplier_product_id,source,source_url,image_url,match_confidence,
      match_review_status,approval_status,rights_status,provenance
    ) values (
      v_match.id,v_product.id,'positano',v_item->>'sourceUrl',v_item->>'imageUrl',v_score,
      case when v_auto then 'approved' else 'pending' end,
      'pending',case when v_auto then 'approved' else 'unknown' end,
      jsonb_build_object(
        'externalProductName',v_item->>'externalProductName',
        'matchedFields',coalesce(v_item->'matchedFields','[]'::jsonb),
        'mismatchWarnings',coalesce(v_item->'mismatchWarnings','[]'::jsonb),
        'exact',coalesce((v_item->>'exact')::boolean,false),
        'approvalMode',case when v_auto then 'auto_exact_high' else 'human_review_required' end,
        'runId',v_item->>'runId',
        'externalPresentation',v_item->>'externalPresentation'
      )
    )
    on conflict (supplier_product_id,image_url) do update
    set match_confidence=excluded.match_confidence,
        provenance=excluded.provenance,
        match_review_status=case when v_auto then 'approved' else public.external_image_candidates.match_review_status end,
        rights_status=case when v_auto then 'approved' else public.external_image_candidates.rights_status end,
        updated_at=now()
    returning * into v_candidate;
    candidate_id := v_candidate.id;
    auto_publish := v_auto;
    return next;
  end loop;
end;
$$;

revoke all on function public.supplier_import_positano_candidates(jsonb) from public, anon, authenticated;
grant execute on function public.supplier_import_positano_candidates(jsonb) to service_role;

create or replace view public.supplier_products_without_image_match
with (security_invoker = true)
as
select
  product.id,
  product.supplier_id,
  product.supplier_sku,
  product.name_raw,
  coalesce(product.normalized_presentation, product.presentation_raw, 'Unidad') as presentation
from public.supplier_products product
where product.active = true
  and product.eligibility_status = 'safe'
  and not exists (
    select 1 from public.supplier_product_media media
    where media.supplier_product_id = product.id
      and media.is_primary = true
      and media.approval_status = 'approved'
      and media.rights_status in ('owned','licensed','approved')
  )
  and not exists (
    select 1 from public.external_image_candidates candidate
    where candidate.supplier_product_id = product.id
  );

revoke all on table public.supplier_products_without_image_match from public, anon, authenticated;
grant select on table public.supplier_products_without_image_match to service_role;
