-- Live definition of sol_upsert_knowledge_connector() (last changed in drizzle/0072_knowledge_job_definers.sql).
-- Edit here, then run `npm run db:functions:migrate` to write the migration.

CREATE OR REPLACE FUNCTION sol_upsert_knowledge_connector(p_payload jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_workspace uuid := (p_payload->>'workspaceId')::uuid;
  v_provider text := p_payload->>'provider';
  v_row knowledge_connectors%ROWTYPE;
BEGIN
  IF v_workspace IS NULL OR v_provider IS NULL THEN
    RAISE EXCEPTION 'workspaceId and provider required';
  END IF;
  PERFORM set_config('app.tenant_id', v_workspace::text, true);

  SELECT * INTO v_row
  FROM knowledge_connectors
  WHERE workspace_id = v_workspace
    AND provider = v_provider
    AND deleted_at IS NULL
  LIMIT 1;

  IF FOUND THEN
    UPDATE knowledge_connectors SET
      display_name = COALESCE(NULLIF(p_payload->>'displayName', ''), display_name),
      config = COALESCE(p_payload->'config', config),
      updated_at = now()
    WHERE id = v_row.id
    RETURNING * INTO v_row;
  ELSE
    INSERT INTO knowledge_connectors (
      workspace_id, tenant_id, provider, display_name, config, status, created_by_user_id
    ) VALUES (
      v_workspace,
      v_workspace,
      v_provider,
      COALESCE(NULLIF(p_payload->>'displayName', ''), v_provider),
      COALESCE(p_payload->'config', '{}'::jsonb),
      'disconnected',
      NULLIF(p_payload->>'createdByUserId', '')::uuid
    )
    RETURNING * INTO v_row;
  END IF;

  RETURN jsonb_build_object(
    'id', v_row.id,
    'workspaceId', v_row.workspace_id,
    'provider', v_row.provider,
    'displayName', v_row.display_name,
    'status', v_row.status,
    'config', v_row.config,
    'lastSyncAt', v_row.last_sync_at,
    'errorMessage', v_row.error_message,
    'createdAt', v_row.created_at,
    'updatedAt', v_row.updated_at
  );
END;
$$;
REVOKE ALL ON FUNCTION sol_upsert_knowledge_connector(jsonb) FROM PUBLIC;
