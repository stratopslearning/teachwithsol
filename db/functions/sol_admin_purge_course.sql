-- Live definition of sol_admin_purge_course() (last changed in drizzle/0086_admin_purge_access_entitlement.sql).
-- Edit here, then run `npm run db:functions:migrate` to write the migration.

CREATE OR REPLACE FUNCTION sol_admin_purge_course(p_course_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_tenant uuid;
BEGIN
  SELECT COALESCE(tenant_id, workspace_id) INTO v_tenant FROM courses WHERE id = p_course_id;
  IF v_tenant IS NULL THEN RAISE EXCEPTION 'Course not found'; END IF;
  PERFORM set_config('app.tenant_id', v_tenant::text, true);
  DELETE FROM courses WHERE id = p_course_id;
END;
$$;
REVOKE ALL ON FUNCTION sol_admin_purge_course(uuid) FROM PUBLIC;
