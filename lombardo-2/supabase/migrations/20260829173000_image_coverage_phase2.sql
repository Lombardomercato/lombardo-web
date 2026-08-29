-- Phase 2 keeps the approved Product Image System V1 and only adds review-risk
-- metadata. It does not alter SAFE eligibility or any supplier-owned fields.

update public.external_image_candidates candidate
set provenance = coalesce(candidate.provenance, '{}'::jsonb) || jsonb_build_object(
  'reviewRiskRank', case
    when concat_ws(' ', product.name_raw, product.normalized_presentation, product.presentation_raw)
           ~* '(\d+[,.]?\d*)\s*(ml|cc|cl|l|lt|litro)'
      and coalesce(candidate.provenance->>'externalPresentation', candidate.provenance->>'externalProductName', '')
           !~* '(\d+[,.]?\d*)\s*(ml|cc|cl|l|lt|litro)'
      then 1
    when concat_ws(' ', product.name_raw, product.normalized_presentation, product.presentation_raw)
           ~* '(malbec|cabernet|chardonnay|pinot|merlot|syrah|bonarda|torront|sauvignon|riesling|viognier|reserva|reserve|roble|maria carmen)'
      and coalesce(candidate.provenance->>'externalProductName', '')
           !~* '(malbec|cabernet|chardonnay|pinot|merlot|syrah|bonarda|torront|sauvignon|riesling|viognier|reserva|reserve|roble|maria carmen)'
      then 2
    when candidate.match_confidence < 0.82 then 3
    else 4
  end,
  'reviewRiskReason', case
    when concat_ws(' ', product.name_raw, product.normalized_presentation, product.presentation_raw)
           ~* '(\d+[,.]?\d*)\s*(ml|cc|cl|l|lt|litro)'
      and coalesce(candidate.provenance->>'externalPresentation', candidate.provenance->>'externalProductName', '')
           !~* '(\d+[,.]?\d*)\s*(ml|cc|cl|l|lt|litro)'
      then 'Revisar presentación/volumen del master'
    when concat_ws(' ', product.name_raw, product.normalized_presentation, product.presentation_raw)
           ~* '(malbec|cabernet|chardonnay|pinot|merlot|syrah|bonarda|torront|sauvignon|riesling|viognier|reserva|reserve|roble|maria carmen)'
      and coalesce(candidate.provenance->>'externalProductName', '')
           !~* '(malbec|cabernet|chardonnay|pinot|merlot|syrah|bonarda|torront|sauvignon|riesling|viognier|reserva|reserve|roble|maria carmen)'
      then 'Revisar varietal/línea del master'
    when candidate.match_confidence < 0.82 then 'MEDIUM de menor confianza'
    else 'Revisión general'
  end
)
from public.supplier_products product
where candidate.supplier_product_id = product.id
  and candidate.quality_status = 'needs_review'
  and candidate.provenance->>'reviewRiskRank' is null;

create or replace function public.supplier_set_image_candidate_review_risks(p_items jsonb)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_item jsonb;
  v_rank integer;
  v_reason text;
begin
  if jsonb_typeof(p_items) <> 'array'
    or jsonb_array_length(p_items) < 1
    or jsonb_array_length(p_items) > 25 then
    raise exception using errcode = '22023', message = 'INVALID_IMAGE_REVIEW_RISK_BATCH';
  end if;
  for v_item in select value from jsonb_array_elements(p_items) loop
    v_rank := (v_item->>'reviewRiskRank')::integer;
    v_reason := nullif(btrim(v_item->>'reviewRiskReason'), '');
    if v_rank not between 1 and 4 or v_reason is null or char_length(v_reason) > 160 then
      raise exception using errcode = '22023', message = 'INVALID_IMAGE_REVIEW_RISK';
    end if;
    if coalesce(v_item->>'runId', '') !~ '^mass-image-coverage-phase2-[0-9]{4}-[0-9]{2}-[0-9]{2}$' then
      raise exception using errcode = '22023', message = 'INVALID_PHASE2_RUN_ID';
    end if;
    update public.external_image_candidates
    set provenance = coalesce(provenance, '{}'::jsonb) || jsonb_build_object(
          'reviewRiskRank', v_rank,
          'reviewRiskReason', v_reason
        ),
        updated_at = now()
    where id = (v_item->>'candidateId')::uuid
      and provenance->>'runId' = v_item->>'runId';
    if not found then
      raise exception using errcode = 'P0002', message = 'PHASE2_IMAGE_CANDIDATE_NOT_FOUND';
    end if;
  end loop;
end;
$$;

revoke all on function public.supplier_set_image_candidate_review_risks(jsonb) from public, anon, authenticated;
grant execute on function public.supplier_set_image_candidate_review_risks(jsonb) to service_role;
