-- Allow only the server role to execute the private SAFE guards used by the
-- automation triggers. Browser roles retain no access to the private schema.

revoke all on function lombardo_private.assert_safe_automation_product(uuid, uuid)
  from public, anon, authenticated;
revoke all on function lombardo_private.validate_home_automation_product()
  from public, anon, authenticated;
revoke all on function lombardo_private.validate_content_automation_product()
  from public, anon, authenticated;

grant usage on schema lombardo_private to service_role;
grant execute on function lombardo_private.assert_safe_automation_product(uuid, uuid)
  to service_role;
grant execute on function lombardo_private.validate_home_automation_product()
  to service_role;
grant execute on function lombardo_private.validate_content_automation_product()
  to service_role;
