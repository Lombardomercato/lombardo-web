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
      rights_status = case when p_action = 'correct' then rights_status else 'restricted' end,
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
