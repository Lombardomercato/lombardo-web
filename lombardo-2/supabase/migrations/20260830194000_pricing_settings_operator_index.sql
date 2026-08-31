create index pricing_intelligence_settings_updated_by_idx
  on public.pricing_intelligence_settings (updated_by)
  where updated_by is not null;
