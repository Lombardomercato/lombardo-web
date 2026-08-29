-- Keep the source-master attachment workflow strictly server-only. The project
-- has explicit default EXECUTE grants for API roles, so revoke them in addition
-- to PUBLIC before restoring the service-role grant.

revoke all on function public.supplier_attach_product_source_master(
  uuid, text, text, text, integer, text, text, uuid
) from public, anon, authenticated;

grant execute on function public.supplier_attach_product_source_master(
  uuid, text, text, text, integer, text, text, uuid
) to service_role;
