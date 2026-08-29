-- One approved multi-source coverage run. Source masters remain immutable while
-- every published primary receives the approved Lombardo CSS V1 render recipe.

alter table public.supplier_image_jobs
  drop constraint supplier_image_jobs_source_check,
  add constraint supplier_image_jobs_source_check
    check (source in ('positano', 'multi_source'));

alter table public.supplier_product_media
  drop constraint supplier_product_media_publication_method_check,
  add constraint supplier_product_media_publication_method_check
    check (publication_method in (
      'manual', 'human_approved', 'auto_exact_high', 'auto_high', 'auto_medium', 'corrected'
    )),
  add column if not exists external_source text,
  add column if not exists source_candidate_id uuid references public.external_image_candidates(id) on delete set null,
  add column if not exists match_confidence numeric,
  add column if not exists quality_status text not null default 'unreviewed';

alter table public.supplier_product_media
  add constraint supplier_product_media_match_confidence_check
    check (match_confidence is null or (match_confidence >= 0 and match_confidence <= 1)),
  add constraint supplier_product_media_quality_status_check
    check (quality_status in (
      'unreviewed', 'auto_published', 'needs_review', 'correct', 'corrected', 'rejected', 'removed', 'search_requested'
    ));

create index supplier_product_media_quality_status_idx
  on public.supplier_product_media(quality_status, publication_method, created_at desc);
create unique index supplier_product_media_source_candidate_idx
  on public.supplier_product_media(source_candidate_id)
  where source_candidate_id is not null;

alter table public.external_image_candidates
  add column if not exists quality_status text not null default 'unreviewed';

alter table public.external_image_candidates
  add constraint external_image_candidates_quality_status_check
    check (quality_status in (
      'unreviewed', 'auto_published', 'needs_review', 'correct', 'corrected', 'rejected', 'removed', 'search_requested'
    ));

update public.external_image_candidates
set quality_status = case
  when match_review_status = 'rejected' or approval_status = 'rejected' then 'rejected'
  when approval_status = 'approved' and provenance->>'approvalMode' = 'auto_exact_high' then 'auto_published'
  when approval_status = 'approved' then 'correct'
  else 'unreviewed'
end;

create index external_image_candidates_quality_status_idx
  on public.external_image_candidates(quality_status, match_confidence desc, created_at desc);

create or replace function public.supplier_import_mass_image_candidates(p_items jsonb)
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
  v_source text;
  v_needs_review boolean;
begin
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) < 1 or jsonb_array_length(p_items) > 25 then
    raise exception using errcode = '22023', message = 'INVALID_MASS_IMAGE_CANDIDATE_BATCH';
  end if;
  for v_item in select value from jsonb_array_elements(p_items) loop
    v_score := (v_item->>'confidence')::numeric;
    v_auto := coalesce((v_item->>'autoPublish')::boolean, false);
    v_needs_review := coalesce((v_item->>'needsReview')::boolean, v_score < 0.9);
    v_source := nullif(btrim(v_item->>'source'), '');
    if v_source is null or not (
      v_source = 'positano'
      or v_source like 'official_%'
      or v_source like 'distributor_%'
      or v_source like 'commercial_%'
    ) then raise exception using errcode = '23514', message = 'INVALID_IMAGE_SOURCE'; end if;
    select * into v_product
    from public.supplier_products
    where id = (v_item->>'productId')::uuid and active = true and eligibility_status = 'safe';
    if not found then raise exception using errcode = '23514', message = 'PRODUCT_NOT_PUBLICATION_ELIGIBLE'; end if;
    if v_score < 0.72 or v_score > 1 then
      raise exception using errcode = '23514', message = 'INVALID_MATCH_CONFIDENCE';
    end if;
    if (v_item->>'sourceUrl') !~ '^https://[^[:space:]]+$'
      or (v_item->>'imageUrl') !~ '^https://[^[:space:]]+$'
      or char_length(v_item->>'sourceUrl') > 2000
      or char_length(v_item->>'imageUrl') > 2000 then
      raise exception using errcode = '23514', message = 'INVALID_IMAGE_SOURCE_URL';
    end if;
    if v_auto and (
      jsonb_array_length(coalesce(v_item->'hardConflicts', '[]'::jsonb)) <> 0
      or jsonb_array_length(coalesce(v_item->'mismatchWarnings', '[]'::jsonb)) <> 0
    ) then raise exception using errcode = '23514', message = 'AUTO_IMPORT_HARD_CONFLICT'; end if;
    if v_needs_review and v_score >= 0.9 then
      raise exception using errcode = '23514', message = 'INVALID_NEEDS_REVIEW_BAND';
    end if;

    insert into public.external_product_matches (
      supplier_product_id, source, source_product_key, source_url, match_confidence, approval_status
    ) values (
      v_product.id, v_source, nullif(v_item->>'sourceProductKey', ''), v_item->>'sourceUrl', v_score,
      case when v_auto then 'approved' else 'pending' end
    )
    on conflict (supplier_product_id, source, source_url) do update
    set match_confidence = excluded.match_confidence,
        source_product_key = excluded.source_product_key,
        approval_status = case when v_auto then 'approved' else public.external_product_matches.approval_status end,
        updated_at = now()
    returning * into v_match;

    insert into public.external_image_candidates (
      external_product_match_id, supplier_product_id, source, source_url, image_url, match_confidence,
      match_review_status, approval_status, rights_status, provenance, quality_status
    ) values (
      v_match.id, v_product.id, v_source, v_item->>'sourceUrl', v_item->>'imageUrl', v_score,
      case when v_auto then 'approved' else 'pending' end,
      'pending', case when v_auto then 'approved' else 'unknown' end,
      jsonb_build_object(
        'externalProductName', v_item->>'externalProductName',
        'matchedFields', coalesce(v_item->'matchedFields', '[]'::jsonb),
        'mismatchWarnings', coalesce(v_item->'mismatchWarnings', '[]'::jsonb),
        'hardConflicts', coalesce(v_item->'hardConflicts', '[]'::jsonb),
        'exact', coalesce((v_item->>'exact')::boolean, false),
        'approvalMode', case when v_auto and v_score >= 0.9 then 'auto_high' when v_auto then 'auto_medium' else 'human_review_required' end,
        'runId', v_item->>'runId',
        'sourceTier', v_item->>'sourceTier',
        'externalPresentation', v_item->>'externalPresentation',
        'visualVariant', v_item->>'visualVariant'
      ),
      case when v_auto and v_needs_review then 'needs_review' when v_auto then 'auto_published' else 'unreviewed' end
    )
    on conflict (supplier_product_id, image_url) do update
    set external_product_match_id = excluded.external_product_match_id,
        source = excluded.source,
        source_url = excluded.source_url,
        match_confidence = excluded.match_confidence,
        provenance = excluded.provenance,
        match_review_status = case when v_auto then 'approved' else public.external_image_candidates.match_review_status end,
        rights_status = case when v_auto then 'approved' else public.external_image_candidates.rights_status end,
        quality_status = case when v_auto and v_needs_review then 'needs_review' when v_auto then 'auto_published' else public.external_image_candidates.quality_status end,
        updated_at = now()
    returning * into v_candidate;
    candidate_id := v_candidate.id;
    auto_publish := v_auto;
    return next;
  end loop;
end;
$$;

revoke all on function public.supplier_import_mass_image_candidates(jsonb) from public, anon, authenticated;
grant execute on function public.supplier_import_mass_image_candidates(jsonb) to service_role;

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
  v_method text;
  v_variant text;
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
  v_method := case v_candidate.provenance->>'approvalMode'
    when 'auto_exact_high' then 'auto_exact_high'
    when 'auto_high' then 'auto_high'
    when 'auto_medium' then 'auto_medium'
    else 'human_approved'
  end;
  if v_method in ('auto_exact_high', 'auto_high', 'auto_medium') and (
    v_candidate.match_confidence < case when v_method = 'auto_medium' then 0.72 else 0.9 end
    or jsonb_array_length(coalesce(v_candidate.provenance->'mismatchWarnings', '[]'::jsonb)) <> 0
    or jsonb_array_length(coalesce(v_candidate.provenance->'hardConflicts', '[]'::jsonb)) <> 0
  ) then raise exception using errcode = '23514', message = 'AUTO_PUBLICATION_GUARDRAIL_FAILED'; end if;
  v_variant := v_candidate.provenance->>'visualVariant';
  if v_variant not in ('wine', 'spirits', 'beer', 'gourmet', 'gifts') then v_variant := 'wine'; end if;

  update public.supplier_product_media
  set is_primary = false
  where supplier_product_id = v_product.id and is_primary;
  select coalesce(max(position), -1) + 1 into v_position
  from public.supplier_product_media where supplier_product_id = v_product.id;
  insert into public.supplier_product_media (
    supplier_product_id, bucket_id, storage_path, mime_type, byte_size, alt_text, position, is_primary,
    source, source_url, source_image_url, source_filename, fetched_at, content_sha256, publication_method,
    approval_status, rights_status, created_by, external_source, source_candidate_id, match_confidence, quality_status
  ) values (
    v_product.id, p_bucket_id, p_storage_path, p_mime_type, p_byte_size, btrim(p_alt_text), v_position, true,
    'external_approved', v_candidate.source_url, p_source_image_url, p_source_filename, p_fetched_at, p_content_sha256, v_method,
    'approved', 'approved', p_created_by, v_candidate.source, v_candidate.id, v_candidate.match_confidence,
    case when v_method = 'auto_medium' then 'needs_review' when v_method in ('auto_exact_high', 'auto_high') then 'auto_published' else 'correct' end
  ) returning * into v_media;

  update public.external_image_candidates
  set approval_status = 'approved', rights_status = 'approved', reviewed_by = coalesce(reviewed_by, p_created_by),
      reviewed_at = coalesce(reviewed_at, now()), updated_at = now()
  where id = v_candidate.id;
  update public.external_product_matches
  set approval_status = 'approved', reviewed_by = coalesce(reviewed_by, p_created_by),
      reviewed_at = coalesce(reviewed_at, now()), updated_at = now()
  where id = v_candidate.external_product_match_id;

  insert into public.supplier_product_image_renders (
    supplier_product_id, source_media_id, visual_variant, render_engine, render_version, status, render_config, created_by
  ) values (
    v_product.id, v_media.id, v_variant, 'lombardo_css_v1', 1, 'approved',
    jsonb_build_object(
      'labelIntegrity', 'preserve-source',
      'outputAspectRatio', '4:5',
      'backgroundTreatment', 'multiply-white'
    ),
    p_created_by
  )
  on conflict (supplier_product_id, render_version) do update
  set source_media_id = excluded.source_media_id,
      visual_variant = excluded.visual_variant,
      status = 'approved',
      render_config = excluded.render_config,
      updated_at = now();
  return to_jsonb(v_media);
end;
$$;

revoke all on function public.supplier_publish_external_candidate_v2(uuid,text,text,text,integer,text,uuid,text,text,text,timestamptz) from public, anon, authenticated;
grant execute on function public.supplier_publish_external_candidate_v2(uuid,text,text,text,integer,text,uuid,text,text,text,timestamptz) to service_role;

create or replace function public.supplier_review_published_image(
  p_candidate_id uuid,
  p_action text,
  p_reviewer uuid
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_candidate public.external_image_candidates;
  v_status text;
begin
  if p_action not in ('correct', 'remove', 'search_other') then
    raise exception using errcode = '22023', message = 'INVALID_IMAGE_REVIEW_ACTION';
  end if;
  select * into v_candidate from public.external_image_candidates where id = p_candidate_id for update;
  if not found or v_candidate.approval_status <> 'approved' then
    raise exception using errcode = 'P0002', message = 'PUBLISHED_IMAGE_NOT_FOUND';
  end if;
  v_status := case p_action when 'correct' then 'correct' when 'remove' then 'removed' else 'search_requested' end;
  update public.external_image_candidates
  set quality_status = v_status,
      match_review_status = case when p_action = 'correct' then match_review_status else 'rejected' end,
      reviewed_by = p_reviewer,
      reviewed_at = now(),
      updated_at = now()
  where id = p_candidate_id;
  update public.supplier_product_media
  set quality_status = v_status,
      is_primary = case when p_action = 'correct' then is_primary else false end,
      approval_status = case when p_action = 'correct' then approval_status else 'rejected' end,
      updated_at = now()
  where source_candidate_id = p_candidate_id;
  if p_action <> 'correct' then
    update public.supplier_product_image_renders
    set status = 'retired', updated_at = now()
    where supplier_product_id = v_candidate.supplier_product_id and status = 'approved';
  end if;
end;
$$;

revoke all on function public.supplier_review_published_image(uuid,text,uuid) from public, anon, authenticated;
grant execute on function public.supplier_review_published_image(uuid,text,uuid) to service_role;

create or replace function public.supplier_mark_product_image_corrected(p_supplier_product_id uuid)
returns void
language sql
security invoker
set search_path = ''
as $$
  update public.external_image_candidates
  set quality_status = 'corrected', updated_at = now()
  where supplier_product_id = p_supplier_product_id
    and approval_status = 'approved'
    and provenance->>'approvalMode' in ('auto_exact_high', 'auto_high', 'auto_medium');
  update public.supplier_product_media
  set quality_status = 'corrected', publication_method = 'corrected', updated_at = now()
  where supplier_product_id = p_supplier_product_id
    and source_candidate_id is not null
    and is_primary = false;
$$;

revoke all on function public.supplier_mark_product_image_corrected(uuid) from public, anon, authenticated;
grant execute on function public.supplier_mark_product_image_corrected(uuid) to service_role;

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
      and media.rights_status in ('owned', 'licensed', 'approved')
  );

revoke all on table public.supplier_products_without_image_match from public, anon, authenticated;
grant select on table public.supplier_products_without_image_match to service_role;

-- Existing primary images also receive V1 without altering their source masters.
insert into public.supplier_product_image_renders (
  supplier_product_id, source_media_id, visual_variant, render_engine, render_version, status, render_config
)
select
  product.id,
  media.id,
  case
    when upper(substring(product.supplier_sku from '^[A-Za-z]+')) in ('ACC', 'BLO', 'BOL') then 'gifts'
    when upper(substring(product.supplier_sku from '^[A-Za-z]+')) = 'CER' then 'beer'
    when upper(substring(product.supplier_sku from '^[A-Za-z]+')) in ('APE','BB','BDS','COS','CRA','KNH','LIC','NWS','PHA','PIND','VV','WI') then 'spirits'
    when upper(substring(product.supplier_sku from '^[A-Za-z]+')) in ('BAD','BIM','BOR','CAF','CHO','COM','DEC','FOL','JCR','LAU','LOM','MAI','MOR','QES','SEG','VALE') then 'gourmet'
    else 'wine'
  end,
  'lombardo_css_v1',
  1,
  'approved',
  jsonb_build_object(
    'labelIntegrity', 'preserve-source',
    'outputAspectRatio', '4:5',
    'backgroundTreatment', 'multiply-white'
  )
from public.supplier_products product
join public.supplier_product_media media
  on media.supplier_product_id = product.id
 and media.is_primary = true
 and media.approval_status = 'approved'
 and media.rights_status in ('owned', 'licensed', 'approved')
where product.active = true and product.eligibility_status = 'safe'
on conflict (supplier_product_id, render_version) do nothing;
