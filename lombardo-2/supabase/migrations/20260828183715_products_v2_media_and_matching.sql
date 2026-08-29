-- Productos V2 keeps supplier truth immutable and stores Lombardo editorial
-- content/media in separate, server-only tables.

create table public.supplier_product_editorial (
  supplier_product_id uuid primary key references public.supplier_products(id) on delete cascade,
  name_override text,
  brand_name text,
  category_slug text,
  description text,
  tags text[] not null default '{}',
  internal_notes text,
  editorial_status text not null default 'draft',
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint supplier_product_editorial_status_check check (
    editorial_status in ('draft', 'approved')
  ),
  constraint supplier_product_editorial_category_check check (
    category_slug is null or category_slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'
  ),
  constraint supplier_product_editorial_lengths_check check (
    char_length(coalesce(name_override, '')) <= 240
    and char_length(coalesce(brand_name, '')) <= 120
    and char_length(coalesce(description, '')) <= 4000
    and char_length(coalesce(internal_notes, '')) <= 4000
    and cardinality(tags) <= 30
  )
);

create trigger supplier_product_editorial_updated_at
before update on public.supplier_product_editorial
for each row execute function public.update_updated_at_column();

create table public.supplier_product_media (
  id uuid primary key default gen_random_uuid(),
  supplier_product_id uuid not null references public.supplier_products(id) on delete cascade,
  bucket_id text not null default 'product-media',
  storage_path text not null,
  mime_type text not null,
  byte_size integer not null,
  width integer,
  height integer,
  alt_text text not null,
  position integer not null default 0,
  is_primary boolean not null default false,
  source text not null default 'manual_upload',
  source_url text,
  approval_status text not null default 'approved',
  rights_status text not null default 'owned',
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (bucket_id, storage_path),
  constraint supplier_product_media_mime_check check (
    mime_type in ('image/jpeg', 'image/png', 'image/webp', 'image/avif')
  ),
  constraint supplier_product_media_size_check check (
    byte_size > 0 and byte_size <= 5242880
  ),
  constraint supplier_product_media_dimensions_check check (
    (width is null or width > 0) and (height is null or height > 0)
  ),
  constraint supplier_product_media_position_check check (position >= 0),
  constraint supplier_product_media_source_check check (
    source in ('manual_upload', 'supplier', 'brand_asset', 'external_approved')
  ),
  constraint supplier_product_media_approval_check check (
    approval_status in ('pending', 'approved', 'rejected')
  ),
  constraint supplier_product_media_rights_check check (
    rights_status in ('unknown', 'owned', 'licensed', 'approved', 'restricted')
  ),
  constraint supplier_product_media_external_rights_check check (
    source <> 'external_approved'
    or (
      source_url ~ '^https://'
      and rights_status in ('licensed', 'approved')
      and approval_status = 'approved'
    )
  ),
  constraint supplier_product_media_text_check check (
    btrim(alt_text) <> ''
    and char_length(alt_text) <= 240
    and char_length(coalesce(source_url, '')) <= 2000
  )
);

create unique index supplier_product_media_one_primary_idx
  on public.supplier_product_media(supplier_product_id)
  where is_primary and approval_status = 'approved';
create index supplier_product_media_product_position_idx
  on public.supplier_product_media(supplier_product_id, position, id);
create index supplier_product_media_public_idx
  on public.supplier_product_media(supplier_product_id, approval_status, position)
  where approval_status = 'approved';

create trigger supplier_product_media_updated_at
before update on public.supplier_product_media
for each row execute function public.update_updated_at_column();

create table public.external_product_matches (
  id uuid primary key default gen_random_uuid(),
  supplier_product_id uuid not null references public.supplier_products(id) on delete cascade,
  source text not null,
  source_product_key text,
  source_url text not null,
  match_confidence numeric(5,4) not null,
  approval_status text not null default 'pending',
  reviewed_by uuid references auth.users(id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (supplier_product_id, source, source_url),
  constraint external_product_matches_source_check check (btrim(source) <> ''),
  constraint external_product_matches_url_check check (source_url ~ '^https://'),
  constraint external_product_matches_confidence_check check (
    match_confidence >= 0 and match_confidence <= 1
  ),
  constraint external_product_matches_approval_check check (
    approval_status in ('pending', 'approved', 'rejected')
  )
);

create index external_product_matches_review_queue_idx
  on public.external_product_matches(approval_status, match_confidence desc, created_at)
  where approval_status = 'pending';

create trigger external_product_matches_updated_at
before update on public.external_product_matches
for each row execute function public.update_updated_at_column();

create table public.external_image_candidates (
  id uuid primary key default gen_random_uuid(),
  external_product_match_id uuid references public.external_product_matches(id) on delete cascade,
  supplier_product_id uuid not null references public.supplier_products(id) on delete cascade,
  source text not null,
  source_url text not null,
  image_url text not null,
  match_confidence numeric(5,4) not null,
  approval_status text not null default 'pending',
  rights_status text not null default 'unknown',
  provenance jsonb not null default '{}',
  reviewed_by uuid references auth.users(id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (supplier_product_id, image_url),
  constraint external_image_candidates_source_check check (btrim(source) <> ''),
  constraint external_image_candidates_urls_check check (
    source_url ~ '^https://' and image_url ~ '^https://'
  ),
  constraint external_image_candidates_confidence_check check (
    match_confidence >= 0 and match_confidence <= 1
  ),
  constraint external_image_candidates_approval_check check (
    approval_status in ('pending', 'approved', 'rejected')
  ),
  constraint external_image_candidates_rights_check check (
    rights_status in ('unknown', 'licensed', 'approved', 'restricted')
  ),
  constraint external_image_candidates_publish_check check (
    approval_status <> 'approved' or rights_status in ('licensed', 'approved')
  )
);

create index external_image_candidates_review_queue_idx
  on public.external_image_candidates(approval_status, match_confidence desc, created_at)
  where approval_status = 'pending';
create index external_image_candidates_match_id_idx
  on public.external_image_candidates(external_product_match_id)
  where external_product_match_id is not null;
create index external_image_candidates_reviewed_by_idx
  on public.external_image_candidates(reviewed_by)
  where reviewed_by is not null;
create index external_product_matches_reviewed_by_idx
  on public.external_product_matches(reviewed_by)
  where reviewed_by is not null;
create index supplier_product_editorial_updated_by_idx
  on public.supplier_product_editorial(updated_by)
  where updated_by is not null;
create index supplier_product_media_created_by_idx
  on public.supplier_product_media(created_by)
  where created_by is not null;

create trigger external_image_candidates_updated_at
before update on public.external_image_candidates
for each row execute function public.update_updated_at_column();

create view public.supplier_product_public_media
with (security_invoker = true)
as
select
  media.id,
  media.supplier_product_id,
  media.bucket_id,
  media.storage_path,
  media.alt_text,
  media.width,
  media.height,
  media.position,
  media.is_primary
from public.supplier_product_media media
join public.supplier_products product on product.id = media.supplier_product_id
where product.active = true
  and product.eligibility_status = 'safe'
  and media.approval_status = 'approved'
  and media.rights_status in ('owned', 'licensed', 'approved');

create or replace function public.supplier_attach_product_media(
  p_supplier_product_id uuid,
  p_bucket_id text,
  p_storage_path text,
  p_mime_type text,
  p_byte_size integer,
  p_alt_text text,
  p_source text,
  p_source_url text,
  p_make_primary boolean,
  p_created_by uuid
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_position integer;
  v_make_primary boolean;
  v_media public.supplier_product_media;
begin
  perform 1 from public.supplier_products
  where id = p_supplier_product_id
  for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'SUPPLIER_PRODUCT_NOT_FOUND';
  end if;

  select coalesce(max(position), -1) + 1
  into v_position
  from public.supplier_product_media
  where supplier_product_id = p_supplier_product_id;

  v_make_primary := coalesce(p_make_primary, false) or not exists (
    select 1 from public.supplier_product_media
    where supplier_product_id = p_supplier_product_id
      and is_primary
      and approval_status = 'approved'
  );

  if v_make_primary then
    update public.supplier_product_media
    set is_primary = false
    where supplier_product_id = p_supplier_product_id and is_primary;
  end if;

  insert into public.supplier_product_media (
    supplier_product_id, bucket_id, storage_path, mime_type, byte_size,
    alt_text, position, is_primary, source, source_url, approval_status,
    rights_status, created_by
  ) values (
    p_supplier_product_id, p_bucket_id, p_storage_path, p_mime_type, p_byte_size,
    btrim(p_alt_text), v_position, v_make_primary, p_source,
    nullif(btrim(coalesce(p_source_url, '')), ''), 'approved', 'owned', p_created_by
  ) returning * into v_media;

  return to_jsonb(v_media);
end;
$$;

create or replace function public.supplier_set_primary_media(
  p_supplier_product_id uuid,
  p_media_id uuid
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
  perform 1 from public.supplier_product_media
  where id = p_media_id
    and supplier_product_id = p_supplier_product_id
    and approval_status = 'approved'
  for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'PRODUCT_MEDIA_NOT_FOUND';
  end if;

  update public.supplier_product_media
  set is_primary = false
  where supplier_product_id = p_supplier_product_id and is_primary;

  update public.supplier_product_media set is_primary = true where id = p_media_id;
end;
$$;

create or replace function public.supplier_reorder_product_media(
  p_supplier_product_id uuid,
  p_media_ids uuid[]
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_existing integer;
begin
  if cardinality(p_media_ids) is null or cardinality(p_media_ids) = 0 then
    raise exception using errcode = '22023', message = 'PRODUCT_MEDIA_ORDER_EMPTY';
  end if;
  if cardinality(p_media_ids) <> (
    select count(distinct item.media_id)
    from unnest(p_media_ids) as item(media_id)
  ) then
    raise exception using errcode = '22023', message = 'PRODUCT_MEDIA_ORDER_DUPLICATE';
  end if;

  select count(*) into v_existing
  from public.supplier_product_media
  where supplier_product_id = p_supplier_product_id;
  if v_existing <> cardinality(p_media_ids) or exists (
    select 1 from unnest(p_media_ids) as item(media_id)
    where not exists (
      select 1 from public.supplier_product_media
      where id = item.media_id and supplier_product_id = p_supplier_product_id
    )
  ) then
    raise exception using errcode = '22023', message = 'PRODUCT_MEDIA_ORDER_MISMATCH';
  end if;

  update public.supplier_product_media media
  set position = array_position(p_media_ids, media.id) - 1
  where media.supplier_product_id = p_supplier_product_id;
end;
$$;

create or replace function public.supplier_delete_product_media(
  p_supplier_product_id uuid,
  p_media_id uuid
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_media public.supplier_product_media;
begin
  delete from public.supplier_product_media
  where id = p_media_id and supplier_product_id = p_supplier_product_id
  returning * into v_media;
  if not found then
    raise exception using errcode = 'P0002', message = 'PRODUCT_MEDIA_NOT_FOUND';
  end if;

  if v_media.is_primary then
    update public.supplier_product_media
    set is_primary = true
    where id = (
      select id from public.supplier_product_media
      where supplier_product_id = p_supplier_product_id
        and approval_status = 'approved'
      order by position, id
      limit 1
    );
  end if;
  return jsonb_build_object('bucketId', v_media.bucket_id, 'storagePath', v_media.storage_path);
end;
$$;

alter table public.supplier_product_editorial enable row level security;
alter table public.supplier_product_editorial force row level security;
alter table public.supplier_product_media enable row level security;
alter table public.supplier_product_media force row level security;
alter table public.external_product_matches enable row level security;
alter table public.external_product_matches force row level security;
alter table public.external_image_candidates enable row level security;
alter table public.external_image_candidates force row level security;

revoke all on table public.supplier_product_editorial from public, anon, authenticated;
revoke all on table public.supplier_product_media from public, anon, authenticated;
revoke all on table public.external_product_matches from public, anon, authenticated;
revoke all on table public.external_image_candidates from public, anon, authenticated;
revoke all on table public.supplier_product_public_media from public, anon, authenticated;
grant select, insert, update, delete on table public.supplier_product_editorial to service_role;
grant select, insert, update, delete on table public.supplier_product_media to service_role;
grant select, insert, update, delete on table public.external_product_matches to service_role;
grant select, insert, update, delete on table public.external_image_candidates to service_role;
grant select on table public.supplier_product_public_media to service_role;

revoke all on function public.supplier_attach_product_media(uuid, text, text, text, integer, text, text, text, boolean, uuid) from public, anon, authenticated;
revoke all on function public.supplier_set_primary_media(uuid, uuid) from public, anon, authenticated;
revoke all on function public.supplier_reorder_product_media(uuid, uuid[]) from public, anon, authenticated;
revoke all on function public.supplier_delete_product_media(uuid, uuid) from public, anon, authenticated;
grant execute on function public.supplier_attach_product_media(uuid, text, text, text, integer, text, text, text, boolean, uuid) to service_role;
grant execute on function public.supplier_set_primary_media(uuid, uuid) to service_role;
grant execute on function public.supplier_reorder_product_media(uuid, uuid[]) to service_role;
grant execute on function public.supplier_delete_product_media(uuid, uuid) to service_role;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'product-media',
  'product-media',
  true,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp', 'image/avif']::text[]
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

update public.tenants set feature_images = true where slug = 'lombardo';

create index if not exists supplier_products_catalog_page_idx
  on public.supplier_products(supplier_id, normalized_name, id);
create index if not exists supplier_products_catalog_status_page_idx
  on public.supplier_products(supplier_id, eligibility_status, normalized_name, id);
