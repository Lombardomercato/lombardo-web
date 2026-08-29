-- Cover nullable ownership/review foreign keys reported by the database advisor.
create index if not exists external_image_candidates_match_id_idx
  on public.external_image_candidates(external_product_match_id)
  where external_product_match_id is not null;
create index if not exists external_image_candidates_reviewed_by_idx
  on public.external_image_candidates(reviewed_by)
  where reviewed_by is not null;
create index if not exists external_product_matches_reviewed_by_idx
  on public.external_product_matches(reviewed_by)
  where reviewed_by is not null;
create index if not exists supplier_product_editorial_updated_by_idx
  on public.supplier_product_editorial(updated_by)
  where updated_by is not null;
create index if not exists supplier_product_media_created_by_idx
  on public.supplier_product_media(created_by)
  where created_by is not null;
