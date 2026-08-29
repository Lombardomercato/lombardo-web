-- Versioned, server-only render recipes keep immutable source masters separate
-- from the Lombardo presentation layer. A pilot is never public by itself.

create table public.supplier_product_image_renders (
  id uuid primary key default gen_random_uuid(),
  supplier_product_id uuid not null references public.supplier_products(id) on delete cascade,
  source_media_id uuid not null references public.supplier_product_media(id) on delete restrict,
  visual_variant text not null,
  render_engine text not null default 'lombardo_css_v1',
  render_version integer not null default 1,
  status text not null default 'pilot',
  render_config jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (supplier_product_id, render_version),
  constraint supplier_product_image_renders_variant_check check (
    visual_variant in ('wine', 'spirits', 'beer', 'gourmet', 'gifts')
  ),
  constraint supplier_product_image_renders_engine_check check (
    render_engine = 'lombardo_css_v1'
  ),
  constraint supplier_product_image_renders_version_check check (render_version > 0),
  constraint supplier_product_image_renders_status_check check (
    status in ('pilot', 'approved', 'retired')
  ),
  constraint supplier_product_image_renders_config_check check (
    jsonb_typeof(render_config) = 'object'
  )
);

create index supplier_product_image_renders_product_idx
  on public.supplier_product_image_renders(supplier_product_id, status, render_version desc);
create index supplier_product_image_renders_source_media_idx
  on public.supplier_product_image_renders(source_media_id);

create trigger supplier_product_image_renders_updated_at
before update on public.supplier_product_image_renders
for each row execute function public.update_updated_at_column();

alter table public.supplier_product_image_renders enable row level security;
alter table public.supplier_product_image_renders force row level security;
revoke all on table public.supplier_product_image_renders from public, anon, authenticated;
grant select, insert, update, delete on table public.supplier_product_image_renders to service_role;

create or replace function public.supplier_attach_product_source_master(
  p_supplier_product_id uuid,
  p_bucket_id text,
  p_storage_path text,
  p_mime_type text,
  p_byte_size integer,
  p_alt_text text,
  p_source_url text,
  p_created_by uuid
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_media_id uuid;
begin
  if not exists (
    select 1 from public.supplier_products
    where id = p_supplier_product_id and active and eligibility_status = 'safe'
  ) then
    raise exception 'Only active SAFE products can receive source masters';
  end if;

  insert into public.supplier_product_media (
    supplier_product_id, bucket_id, storage_path, mime_type, byte_size,
    alt_text, position, is_primary, source, source_url,
    approval_status, rights_status, created_by
  ) values (
    p_supplier_product_id, p_bucket_id, p_storage_path, p_mime_type, p_byte_size,
    p_alt_text,
    coalesce((select max(position) + 1 from public.supplier_product_media where supplier_product_id = p_supplier_product_id), 0),
    false, 'brand_asset', p_source_url, 'pending', 'approved', p_created_by
  ) returning id into v_media_id;

  return v_media_id;
end;
$$;

revoke all on function public.supplier_attach_product_source_master(uuid, text, text, text, integer, text, text, uuid) from public;
grant execute on function public.supplier_attach_product_source_master(uuid, text, text, text, integer, text, text, uuid) to service_role;
