create index competitor_matches_updated_by_idx
  on public.competitor_product_matches (updated_by)
  where updated_by is not null;
