-- Live definition of sol_admin_purge_section() (last changed in drizzle/0086_admin_purge_access_entitlement.sql).
-- Edit here, then run `npm run db:functions:migrate` to write the migration.

CREATE OR REPLACE FUNCTION sol_admin_purge_section(p_section_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_tenant uuid;
BEGIN
  SELECT COALESCE(tenant_id, workspace_id) INTO v_tenant FROM sections WHERE id = p_section_id;
  IF v_tenant IS NULL THEN RAISE EXCEPTION 'Section not found'; END IF;
  PERFORM set_config('app.tenant_id', v_tenant::text, true);
  DELETE FROM sections WHERE id = p_section_id;
END;
$$;
REVOKE ALL ON FUNCTION sol_admin_purge_section(uuid) FROM PUBLIC;
