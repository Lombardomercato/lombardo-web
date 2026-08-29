alter table public.supplier_product_media
  drop constraint supplier_product_media_external_rights_check;

alter table public.supplier_product_media
  add constraint supplier_product_media_external_rights_check check (
    source <> 'external_approved'
    or (
      approval_status = 'approved'
      and source_url ~ '^https://'
      and rights_status in ('licensed', 'approved')
    )
    or (
      approval_status in ('pending', 'rejected')
      and rights_status in ('unknown', 'restricted')
    )
  );
