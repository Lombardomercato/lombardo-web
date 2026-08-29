create or replace function public.supplier_publish_external_candidate(
  p_candidate_id uuid,
  p_bucket_id text,
  p_storage_path text,
  p_mime_type text,
  p_byte_size integer,
  p_alt_text text,
  p_created_by uuid
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
begin
  select * into v_candidate
  from public.external_image_candidates
  where id = p_candidate_id
  for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'IMAGE_CANDIDATE_NOT_FOUND';
  end if;
  if v_candidate.match_review_status <> 'approved' or v_candidate.approval_status <> 'pending' then
    raise exception using errcode = '23514', message = 'IMAGE_CANDIDATE_NOT_APPROVED_FOR_PUBLICATION';
  end if;

  select * into v_product
  from public.supplier_products
  where id = v_candidate.supplier_product_id
  for update;
  if not found or not v_product.active or v_product.eligibility_status <> 'safe' then
    raise exception using errcode = '23514', message = 'PRODUCT_NOT_PUBLICATION_ELIGIBLE';
  end if;

  update public.supplier_product_media
  set is_primary = false
  where supplier_product_id = v_product.id and is_primary;

  select coalesce(max(position), -1) + 1 into v_position
  from public.supplier_product_media
  where supplier_product_id = v_product.id;

  insert into public.supplier_product_media (
    supplier_product_id,bucket_id,storage_path,mime_type,byte_size,alt_text,
    position,is_primary,source,source_url,approval_status,rights_status,created_by
  ) values (
    v_product.id,p_bucket_id,p_storage_path,p_mime_type,p_byte_size,btrim(p_alt_text),
    v_position,true,'external_approved',v_candidate.source_url,'approved','approved',p_created_by
  ) returning * into v_media;

  update public.external_image_candidates
  set approval_status = 'approved', rights_status = 'approved', reviewed_by = p_created_by,
      reviewed_at = coalesce(reviewed_at, now()), updated_at = now()
  where id = v_candidate.id;

  update public.external_product_matches
  set approval_status = 'approved', reviewed_by = p_created_by,
      reviewed_at = coalesce(reviewed_at, now()), updated_at = now()
  where id = v_candidate.external_product_match_id;

  return to_jsonb(v_media);
end;
$$;

revoke all on function public.supplier_publish_external_candidate(uuid,text,text,text,integer,text,uuid) from public, anon, authenticated;
grant execute on function public.supplier_publish_external_candidate(uuid,text,text,text,integer,text,uuid) to service_role;
