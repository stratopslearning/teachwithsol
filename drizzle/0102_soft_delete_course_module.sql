-- Soft-delete a course module and its items (Canvas-like Delete).

CREATE OR REPLACE FUNCTION sol_soft_delete_course_module(
  p_course_id uuid,
  p_module_id uuid
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant uuid;
BEGIN
  SELECT tenant_id INTO v_tenant
  FROM courses
  WHERE id = p_course_id AND deleted_at IS NULL;
  IF v_tenant IS NULL THEN
    RAISE EXCEPTION 'course_not_found';
  END IF;
  PERFORM set_config('app.tenant_id', v_tenant::text, true);

  UPDATE module_items
  SET deleted_at = now(), updated_at = now()
  WHERE module_id = p_module_id
    AND deleted_at IS NULL;

  UPDATE course_modules
  SET deleted_at = now(), updated_at = now()
  WHERE id = p_module_id
    AND course_id = p_course_id
    AND deleted_at IS NULL;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'module_not_found';
  END IF;

  RETURN p_module_id;
END;
$$;

--> statement-breakpoint
DO $$
DECLARE
  fn text := 'sol_soft_delete_course_module(uuid,uuid)';
BEGIN
  EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC', fn);
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'sol_app') THEN
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO sol_app', fn);
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'neondb_owner')
     AND pg_has_role(current_user, 'neondb_owner', 'member') THEN
    EXECUTE format('ALTER FUNCTION %s OWNER TO neondb_owner', fn);
  END IF;
END $$;
