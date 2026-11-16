-- Live definition of sol_lesson_by_id() (last changed in drizzle/0097_force_rls_remaining_pack.sql).
-- Edit here, then run `npm run db:functions:migrate` to write the migration.

CREATE OR REPLACE FUNCTION sol_lesson_by_id(p_lesson_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant uuid;
  v_row lessons%ROWTYPE;
BEGIN
  IF p_lesson_id IS NULL THEN RETURN NULL; END IF;
  SELECT COALESCE(l.tenant_id, c.tenant_id, c.workspace_id)
  INTO v_tenant
  FROM lessons l
  JOIN courses c ON c.id = l.course_id
  WHERE l.id = p_lesson_id;
  IF v_tenant IS NOT NULL THEN
    PERFORM set_config('app.tenant_id', v_tenant::text, true);
  END IF;
  SELECT * INTO v_row FROM lessons WHERE id = p_lesson_id AND deleted_at IS NULL;
  IF NOT FOUND THEN RETURN NULL; END IF;
  RETURN to_jsonb(v_row);
END;
$$;
REVOKE ALL ON FUNCTION sol_lesson_by_id(uuid) FROM PUBLIC;
