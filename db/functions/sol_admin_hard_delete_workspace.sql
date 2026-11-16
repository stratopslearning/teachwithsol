-- Live definition of sol_admin_hard_delete_workspace() (last changed in drizzle/0085_admin_workspace_delete.sql).
-- Edit here, then run `npm run db:functions:migrate` to write the migration.

CREATE OR REPLACE FUNCTION sol_admin_hard_delete_workspace(p_workspace_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM set_config('app.tenant_id', p_workspace_id::text, true);

  IF NOT EXISTS (SELECT 1 FROM workspaces WHERE id = p_workspace_id) THEN
    RAISE EXCEPTION 'Workspace not found';
  END IF;

  IF EXISTS (
    SELECT 1 FROM workspaces WHERE parent_workspace_id = p_workspace_id
  ) THEN
    RAISE EXCEPTION 'WORKSPACE_HAS_CHILDREN';
  END IF;

  IF EXISTS (
    SELECT 1 FROM courses
    WHERE workspace_id = p_workspace_id AND deleted_at IS NULL
  ) THEN
    RAISE EXCEPTION 'WORKSPACE_HAS_ACTIVE_COURSES';
  END IF;

  DELETE FROM workspaces WHERE id = p_workspace_id;

  RETURN jsonb_build_object(
    'mode', 'hard',
    'workspaceId', p_workspace_id,
    'deletedId', p_workspace_id
  );
END;
$$;
REVOKE ALL ON FUNCTION sol_admin_hard_delete_workspace(uuid) FROM PUBLIC;
