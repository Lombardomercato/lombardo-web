-- The simplified pilot direction uses one identical 4:5 canvas and inset for
-- every product type. Per-product scaling is intentionally removed.

update public.supplier_product_image_renders
set render_config = render_config - 'scale'
where render_engine = 'lombardo_css_v1'
  and status = 'pilot'
  and render_config ? 'scale';
