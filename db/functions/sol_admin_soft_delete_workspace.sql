-- Live definition of sol_admin_soft_delete_workspace() (last changed in drizzle/0085_admin_workspace_delete.sql).
-- Edit here, then run `npm run db:functions:migrate` to write the migration.

CREATE OR REPLACE FUNCTION sol_admin_soft_delete_workspace(p_workspace_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_now timestamptz := now();
  v_course_count integer;
BEGIN
  PERFORM set_config('app.tenant_id', p_workspace_id::text, true);

  IF NOT EXISTS (SELECT 1 FROM workspaces WHERE id = p_workspace_id) THEN
    RAISE EXCEPTION 'Workspace not found';
  END IF;

  UPDATE sections s
  SET deleted_at = v_now, is_active = false
  FROM courses c
  WHERE s.course_id = c.id
    AND c.workspace_id = p_workspace_id
    AND s.deleted_at IS NULL;

  UPDATE courses
  SET deleted_at = v_now, is_active = false
  WHERE workspace_id = p_workspace_id
    AND deleted_at IS NULL;

  GET DIAGNOSTICS v_course_count = ROW_COUNT;

  UPDATE workspace_licenses
  SET status = 'canceled', updated_at = v_now
  WHERE workspace_id = p_workspace_id;

  UPDATE workspaces
  SET status = 'churned', updated_at = v_now
  WHERE id = p_workspace_id;

  RETURN jsonb_build_object(
    'mode', 'soft',
    'workspaceId', p_workspace_id,
    'courseCount', v_course_count
  );
END;
$$;
REVOKE ALL ON FUNCTION sol_admin_soft_delete_workspace(uuid) FROM PUBLIC;
