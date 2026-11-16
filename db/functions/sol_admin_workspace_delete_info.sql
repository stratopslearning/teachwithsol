-- Live definition of sol_admin_workspace_delete_info() (last changed in drizzle/0085_admin_workspace_delete.sql).
-- Edit here, then run `npm run db:functions:migrate` to write the migration.

CREATE OR REPLACE FUNCTION sol_admin_workspace_delete_info(p_workspace_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
DECLARE
  v_ws workspaces%ROWTYPE;
  v_children integer;
  v_courses integer;
BEGIN
  -- FORCE RLS applies to sol_migrator (no BYPASSRLS). Pin tenant before read.
  PERFORM set_config('app.tenant_id', p_workspace_id::text, true);

  SELECT * INTO v_ws FROM workspaces WHERE id = p_workspace_id;
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  -- Child rows have different workspace ids; with parent GUC they are invisible
  -- under FORCE RLS. Prefer sol_admin_workspace_directory() from TS for
  -- accurate child_count. Keep a best-effort count here.
  SELECT count(*)::integer INTO v_children
  FROM workspaces
  WHERE parent_workspace_id = p_workspace_id;

  SELECT count(*)::integer INTO v_courses
  FROM courses
  WHERE workspace_id = p_workspace_id
    AND deleted_at IS NULL;

  RETURN jsonb_build_object(
    'id', v_ws.id,
    'slug', v_ws.slug,
    'name', v_ws.name,
    'type', v_ws.type,
    'status', v_ws.status,
    'parentWorkspaceId', v_ws.parent_workspace_id,
    'childCount', v_children,
    'activeCourseCount', v_courses
  );
END;
$$;
REVOKE ALL ON FUNCTION sol_admin_workspace_delete_info(uuid) FROM PUBLIC;
