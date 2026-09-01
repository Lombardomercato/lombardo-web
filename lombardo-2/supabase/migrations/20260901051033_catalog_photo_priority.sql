-- Keep catalog merchandising fast and deterministic without trusting the browser.
-- The flag is derived exclusively from approved public media and maintained by a
-- database trigger whenever media visibility changes.

alter table public.supplier_products
  add column has_public_media boolean not null default false;

comment on column public.supplier_products.has_public_media is
  'Derived flag: true when at least one approved product image has publishable rights.';

create or replace function public.supplier_refresh_public_media_flag()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_product_id uuid;
begin
  for v_product_id in
    select distinct product_id
    from (
      values
        (case when tg_op <> 'INSERT' then old.supplier_product_id end),
        (case when tg_op <> 'DELETE' then new.supplier_product_id end)
    ) as changed(product_id)
    where product_id is not null
  loop
    update public.supplier_products product
    set has_public_media = exists (
      select 1
      from public.supplier_product_media media
      where media.supplier_product_id = v_product_id
        and media.approval_status = 'approved'
        and media.rights_status in ('owned', 'licensed', 'approved')
    )
    where product.id = v_product_id;
  end loop;

  return null;
end;
$$;

revoke all on function public.supplier_refresh_public_media_flag()
  from public, anon, authenticated;

create trigger supplier_product_media_refresh_public_flag
after insert or delete or update of
  supplier_product_id,
  approval_status,
  rights_status
on public.supplier_product_media
for each row execute function public.supplier_refresh_public_media_flag();

update public.supplier_products product
set has_public_media = exists (
  select 1
  from public.supplier_product_media media
  where media.supplier_product_id = product.id
    and media.approval_status = 'approved'
    and media.rights_status in ('owned', 'licensed', 'approved')
);

create index supplier_products_public_catalog_photo_order_idx
  on public.supplier_products (
    supplier_id,
    has_public_media desc,
    normalized_name,
    id
  )
  where active = true and eligibility_status = 'safe';
