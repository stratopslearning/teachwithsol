-- Live definition of sol_get_authoring_policy() (last changed in drizzle/0084_more_rls_write_definers.sql).
-- Edit here, then run `npm run db:functions:migrate` to write the migration.

CREATE OR REPLACE FUNCTION sol_get_authoring_policy(p_workspace_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
DECLARE
  v_row authoring_policies%ROWTYPE;
BEGIN
  PERFORM set_config('app.tenant_id', p_workspace_id::text, true);
  SELECT * INTO v_row
  FROM authoring_policies
  WHERE workspace_id = p_workspace_id
  LIMIT 1;
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;
  RETURN jsonb_build_object(
    'id', v_row.id,
    'workspaceId', v_row.workspace_id,
    'structureNotes', v_row.structure_notes,
    'rubricStyle', v_row.rubric_style,
    'tone', v_row.tone,
    'extraPrompt', v_row.extra_prompt,
    'updatedAt', v_row.updated_at
  );
END;
$$;
REVOKE ALL ON FUNCTION sol_get_authoring_policy(uuid) FROM PUBLIC;
