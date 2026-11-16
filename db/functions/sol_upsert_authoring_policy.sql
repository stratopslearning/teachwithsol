-- Live definition of sol_upsert_authoring_policy() (last changed in drizzle/0084_more_rls_write_definers.sql).
-- Edit here, then run `npm run db:functions:migrate` to write the migration.

CREATE OR REPLACE FUNCTION sol_upsert_authoring_policy(p_payload jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_workspace uuid := (p_payload->>'workspaceId')::uuid;
  v_existing authoring_policies%ROWTYPE;
  v_row authoring_policies%ROWTYPE;
BEGIN
  IF v_workspace IS NULL THEN
    RAISE EXCEPTION 'workspaceId required';
  END IF;
  PERFORM set_config('app.tenant_id', v_workspace::text, true);

  SELECT * INTO v_existing
  FROM authoring_policies
  WHERE workspace_id = v_workspace
  LIMIT 1;

  IF FOUND THEN
    UPDATE authoring_policies SET
      structure_notes = CASE WHEN p_payload ? 'structureNotes' THEN NULLIF(p_payload->>'structureNotes', '') ELSE structure_notes END,
      rubric_style = CASE WHEN p_payload ? 'rubricStyle' THEN NULLIF(p_payload->>'rubricStyle', '') ELSE rubric_style END,
      tone = CASE WHEN p_payload ? 'tone' THEN NULLIF(p_payload->>'tone', '') ELSE tone END,
      extra_prompt = CASE WHEN p_payload ? 'extraPrompt' THEN NULLIF(p_payload->>'extraPrompt', '') ELSE extra_prompt END,
      updated_at = now()
    WHERE id = v_existing.id
    RETURNING * INTO v_row;
  ELSE
    INSERT INTO authoring_policies (
      workspace_id, tenant_id, structure_notes, rubric_style, tone, extra_prompt
    ) VALUES (
      v_workspace,
      v_workspace,
      NULLIF(p_payload->>'structureNotes', ''),
      NULLIF(p_payload->>'rubricStyle', ''),
      NULLIF(p_payload->>'tone', ''),
      NULLIF(p_payload->>'extraPrompt', '')
    )
    RETURNING * INTO v_row;
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
REVOKE ALL ON FUNCTION sol_upsert_authoring_policy(jsonb) FROM PUBLIC;
