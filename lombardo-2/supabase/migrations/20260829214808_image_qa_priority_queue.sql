-- Image QA V2 turns the known Phase 2 false positives into an explicit,
-- sortable review priority. It does not publish, match, or alter products.

create or replace function public.supplier_image_volume_ml(p_value text)
returns integer
language plpgsql
immutable
security invoker
set search_path = ''
as $$
declare
  v_match text[];
  v_amount numeric;
  v_unit text;
begin
  v_match := regexp_match(lower(coalesce(p_value, '')), '([0-9]+(?:[.,][0-9]+)?)[[:space:]]*(ml|cc|cl|lt|l|litro|litros)(?:[^a-z]|$)');
  if v_match is null then return null; end if;
  v_amount := replace(v_match[1], ',', '.')::numeric;
  v_unit := v_match[2];
  if v_unit in ('l', 'lt', 'litro', 'litros') then return round(v_amount * 1000); end if;
  if v_unit = 'cl' then return round(v_amount * 10); end if;
  return round(v_amount);
end;
$$;

revoke all on function public.supplier_image_volume_ml(text) from public, anon, authenticated;
grant execute on function public.supplier_image_volume_ml(text) to service_role;

create or replace function public.supplier_image_review_risk_v2(
  p_product_name text,
  p_product_presentation text,
  p_external_name text,
  p_external_presentation text,
  p_source_url text,
  p_confidence numeric,
  p_provenance jsonb
)
returns jsonb
language plpgsql
immutable
security invoker
set search_path = ''
as $$
declare
  v_product text := lower(coalesce(p_product_name, '') || ' ' || coalesce(p_product_presentation, ''));
  v_external text := lower(coalesce(p_external_name, '') || ' ' || coalesce(p_external_presentation, ''));
  v_hard text := lower(coalesce(p_provenance->'hardConflicts', '[]'::jsonb)::text);
  v_matched text := lower(coalesce(p_provenance->'matchedFields', '[]'::jsonb)::text);
  v_product_kind text;
  v_external_kind text;
  v_product_line text;
  v_external_line text;
  v_product_varietal text;
  v_external_varietal text;
  v_name_volume integer := public.supplier_image_volume_ml(p_product_name);
  v_presentation_volume integer := public.supplier_image_volume_ml(p_product_presentation);
  v_product_volume integer := public.supplier_image_volume_ml(v_product);
  v_external_volume integer := public.supplier_image_volume_ml(v_external);
  v_rank integer := 6;
  v_kind text := 'confidence';
  v_reason text := 'Menor confianza; revisión general';
begin
  v_product_kind := substring(v_product from '(gin|ginebra|vodka|whisky|cognac|licor|cerveza|ketchup|mostaza|aderezo|vinagre|chocolate|garrapiñada)');
  v_external_kind := substring(v_external from '(gin|ginebra|vodka|whisky|cognac|licor|cerveza|ketchup|mostaza|aderezo|vinagre|chocolate|garrapiñada)');
  v_product_line := substring(v_product from '(millesime|blanc de blancs|golden black|golden reserve|familia|estirpe|choco a la frutilla|dunkel|hefeweizen|sin azucar|con azucar|gran reserva|single vineyard|reserva|roble|premium|clasico)');
  v_external_line := substring(v_external from '(millesime|blanc de blancs|golden black|golden reserve|familia|estirpe|choco a la frutilla|dunkel|hefeweizen|sin azucar|con azucar|gran reserva|single vineyard|reserva|roble|premium|clasico)');
  v_product_varietal := substring(v_product from '(cabernet sauvignon|cabernet franc|sauvignon blanc|pinot noir|petit verdot|malbec|chardonnay|merlot|syrah|shiraz|bonarda|tempranillo|tannat|torrontes|ancellotta|riesling|viognier|semillon|chenin|moscatel|rose|rosado)');
  v_external_varietal := substring(v_external from '(cabernet sauvignon|cabernet franc|sauvignon blanc|pinot noir|petit verdot|malbec|chardonnay|merlot|syrah|shiraz|bonarda|tempranillo|tannat|torrontes|ancellotta|riesling|viognier|semillon|chenin|moscatel|rose|rosado)');

  if v_hard ~ 'producto diferente|marca diferente'
    or (v_external_kind is not null and v_external_kind is distinct from v_product_kind)
    or lower(coalesce(p_source_url, '')) ~ 'coloriage|abillion|pinterest|wikipedia'
    or coalesce(p_source_url, '') ~ '^https://[^/]+/?([?#].*)?$'
    or v_matched ~ 'nombre (0|[1-5][0-9]|60)%' then
    v_rank := 1; v_kind := 'product'; v_reason := 'Posible producto diferente o fuente genérica';
  elsif v_hard ~ 'marca|línea'
    or (v_product_line is not null and v_product_line is distinct from v_external_line)
    or (v_external_line is not null and v_product_line is distinct from v_external_line) then
    v_rank := 2; v_kind := 'brand_line'; v_reason := 'Posible conflicto de marca o línea';
  elsif v_hard ~ 'varietal'
    or (v_product_varietal is not null and v_product_varietal is distinct from v_external_varietal)
    or (v_external_varietal is not null and v_product_varietal is distinct from v_external_varietal) then
    v_rank := 3; v_kind := 'varietal'; v_reason := 'Posible conflicto de varietal';
  elsif v_hard ~ 'volumen|presentación'
    or (v_name_volume is not null and v_presentation_volume is not null and v_name_volume <> v_presentation_volume)
    or (v_product_volume is not null and (v_external_volume is null or v_product_volume <> v_external_volume)) then
    v_rank := 4; v_kind := 'presentation_volume'; v_reason := 'Revisar presentación o volumen';
  elsif v_hard ~ 'pack|estuche'
    or (v_external ~ '(pack|caja|combo|cx[[:space:]]*[2-9]|x[[:space:]]*(2|3|4|6|8|12|18|24))'
      and v_product !~ '(pack|caja|combo|cx[[:space:]]*[2-9]|x[[:space:]]*(2|3|4|6|8|12|18|24))') then
    v_rank := 5; v_kind := 'pack_unit'; v_reason := 'Revisar pack, estuche o unidad';
  end if;

  return jsonb_build_object(
    'reviewRiskVersion', 2,
    'reviewRiskRank', v_rank,
    'reviewRiskKind', v_kind,
    'reviewRiskReason', v_reason,
    'reviewPriorityScore', ((7 - v_rank) * 1000) + round((1 - greatest(0, least(1, coalesce(p_confidence, 0)))) * 100)
  );
end;
$$;

revoke all on function public.supplier_image_review_risk_v2(text,text,text,text,text,numeric,jsonb) from public, anon, authenticated;
grant execute on function public.supplier_image_review_risk_v2(text,text,text,text,text,numeric,jsonb) to service_role;

update public.external_image_candidates candidate
set provenance = coalesce(candidate.provenance, '{}'::jsonb) || public.supplier_image_review_risk_v2(
      product.name_raw,
      coalesce(product.normalized_presentation, product.presentation_raw),
      candidate.provenance->>'externalProductName',
      candidate.provenance->>'externalPresentation',
      candidate.source_url,
      candidate.match_confidence,
      candidate.provenance
    ),
    updated_at = now()
from public.supplier_products product
where product.id = candidate.supplier_product_id
  and candidate.quality_status in ('needs_review', 'removed')
  and candidate.provenance->>'approvalMode' in ('auto_exact_high', 'auto_high', 'auto_medium');

create or replace function public.supplier_set_image_candidate_review_risks(p_items jsonb)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_item jsonb;
  v_rank integer;
  v_kind text;
  v_reason text;
  v_score integer;
begin
  if jsonb_typeof(p_items) <> 'array'
    or jsonb_array_length(p_items) < 1
    or jsonb_array_length(p_items) > 25 then
    raise exception using errcode = '22023', message = 'INVALID_IMAGE_REVIEW_RISK_BATCH';
  end if;
  for v_item in select value from jsonb_array_elements(p_items) loop
    v_rank := (v_item->>'reviewRiskRank')::integer;
    v_kind := nullif(btrim(v_item->>'reviewRiskKind'), '');
    v_reason := nullif(btrim(v_item->>'reviewRiskReason'), '');
    v_score := (v_item->>'reviewPriorityScore')::integer;
    if v_rank not between 1 and 6
      or v_kind not in ('product','brand_line','varietal','presentation_volume','pack_unit','confidence')
      or v_reason is null or char_length(v_reason) > 160
      or v_score not between 0 and 7000
      or (v_item->>'reviewRiskVersion')::integer <> 2 then
      raise exception using errcode = '22023', message = 'INVALID_IMAGE_REVIEW_RISK';
    end if;
    update public.external_image_candidates
    set provenance = coalesce(provenance, '{}'::jsonb) || jsonb_build_object(
          'reviewRiskVersion', 2,
          'reviewRiskRank', v_rank,
          'reviewRiskKind', v_kind,
          'reviewRiskReason', v_reason,
          'reviewPriorityScore', v_score
        ),
        updated_at = now()
    where id = (v_item->>'candidateId')::uuid
      and provenance->>'runId' = v_item->>'runId';
    if not found then
      raise exception using errcode = 'P0002', message = 'IMAGE_CANDIDATE_NOT_FOUND';
    end if;
  end loop;
end;
$$;

revoke all on function public.supplier_set_image_candidate_review_risks(jsonb) from public, anon, authenticated;
grant execute on function public.supplier_set_image_candidate_review_risks(jsonb) to service_role;
