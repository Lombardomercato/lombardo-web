-- Owner-directed bulk publication accepts a deterministic low-confidence
-- background extraction when the product still has a valid foreground bound.
-- The source master remains preserved and the actual confidence is audited.

create or replace function public.supplier_publish_owner_directed_normalized_product_render(
  p_job_id uuid,
  p_source_media_id uuid,
  p_storage_path text,
  p_byte_size integer,
  p_content_sha256 text,
  p_background_confidence text,
  p_edge_coverage numeric,
  p_created_by uuid
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_source public.supplier_product_media;
  v_media_id uuid;
  v_variant text;
begin
  if p_storage_path !~ '^[0-9a-f-]{36}/renders/product-image-system-v1/[0-9a-f-]{36}\.webp$'
    or p_byte_size < 20 or p_byte_size > 5242880
    or p_content_sha256 !~ '^[0-9a-f]{64}$'
    or p_background_confidence <> 'low'
    or p_edge_coverage < 0 or p_edge_coverage > 1 then
    raise exception using errcode = '22023', message = 'INVALID_NORMALIZED_RENDER';
  end if;

  select media.* into v_source
  from public.supplier_product_media media
  join public.supplier_products product on product.id = media.supplier_product_id
  join public.suppliers supplier on supplier.id = product.supplier_id
  join public.supplier_image_jobs job on job.id = p_job_id and job.tenant_id = supplier.tenant_id
  where media.id = p_source_media_id
    and media.is_primary
    and media.approval_status = 'approved'
    and media.rights_status in ('owned', 'licensed', 'approved')
    and product.active
    and product.eligibility_status = 'safe'
    and job.status in ('ready', 'running')
    and job.expires_at > now()
    and job.metadata->>'mode' = 'owner_directive_bulk_publish'
    and job.metadata->>'normalization' = 'white_4x5_uniform_80pct'
  for update of media;
  if not found then
    raise exception using errcode = '23514', message = 'SOURCE_MASTER_NOT_PUBLICATION_ELIGIBLE';
  end if;

  select visual_variant into v_variant
  from public.supplier_product_image_renders
  where supplier_product_id = v_source.supplier_product_id
  order by (status = 'approved') desc, render_version desc
  limit 1;
  v_variant := coalesce(v_variant, 'wine');

  update public.supplier_product_media
  set is_primary = false, updated_at = now()
  where supplier_product_id = v_source.supplier_product_id and is_primary;

  insert into public.supplier_product_media (
    supplier_product_id, bucket_id, storage_path, mime_type, byte_size, width, height,
    alt_text, position, is_primary, source, source_url, approval_status, rights_status,
    created_by, source_image_url, source_filename, fetched_at, content_sha256,
    publication_method, external_source, match_confidence, quality_status
  ) values (
    v_source.supplier_product_id, 'product-media', p_storage_path, 'image/webp', p_byte_size,
    1000, 1250, v_source.alt_text, v_source.position, true, v_source.source,
    v_source.source_url, 'approved', v_source.rights_status, p_created_by,
    coalesce(v_source.source_image_url, v_source.source_url), v_source.source_filename,
    v_source.fetched_at, p_content_sha256, v_source.publication_method,
    v_source.external_source, v_source.match_confidence, v_source.quality_status
  ) returning id into v_media_id;

  insert into public.supplier_product_image_renders (
    supplier_product_id, source_media_id, visual_variant, render_engine,
    render_version, status, render_config, created_by
  ) values (
    v_source.supplier_product_id, v_source.id, v_variant, 'lombardo_css_v1', 1, 'approved',
    jsonb_build_object(
      'labelIntegrity', 'preserve-source',
      'outputAspectRatio', '4:5',
      'backgroundTreatment', 'transparent-edge-connected-v1',
      'canvas', jsonb_build_object('width', 1000, 'height', 1250),
      'productOccupancy', 0.8,
      'outputMediaId', v_media_id,
      'outputStoragePath', p_storage_path,
      'backgroundConfidence', p_background_confidence,
      'edgeCoverage', p_edge_coverage,
      'ownerDirective', 'publish_all_pending_2026-09-01'
    ),
    p_created_by
  )
  on conflict (supplier_product_id, render_version) do update
  set source_media_id = excluded.source_media_id,
      visual_variant = excluded.visual_variant,
      status = 'approved',
      render_config = excluded.render_config,
      updated_at = now();

  return v_media_id;
end;
$$;

revoke all on function public.supplier_publish_owner_directed_normalized_product_render(uuid,uuid,text,integer,text,text,numeric,uuid)
  from public, anon, authenticated;
grant execute on function public.supplier_publish_owner_directed_normalized_product_render(uuid,uuid,text,integer,text,text,numeric,uuid)
  to service_role;
