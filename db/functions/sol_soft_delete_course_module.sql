-- Live definition of sol_soft_delete_course_module() (last changed in drizzle/0102_soft_delete_course_module.sql).
-- Edit here, then run `npm run db:functions:migrate` to write the migration.

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
