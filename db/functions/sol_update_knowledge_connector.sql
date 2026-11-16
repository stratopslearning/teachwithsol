-- Live definition of sol_update_knowledge_connector() (last changed in drizzle/0072_knowledge_job_definers.sql).
-- Edit here, then run `npm run db:functions:migrate` to write the migration.

CREATE OR REPLACE FUNCTION sol_update_knowledge_connector(p_payload jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid := (p_payload->>'connectorId')::uuid;
  v_row knowledge_connectors%ROWTYPE;
BEGIN
  SELECT * INTO v_row FROM knowledge_connectors WHERE id = v_id AND deleted_at IS NULL;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Connector not found';
  END IF;
  PERFORM set_config(
    'app.tenant_id',
    COALESCE(v_row.tenant_id, v_row.workspace_id)::text,
    true
  );

  UPDATE knowledge_connectors SET
    encrypted_tokens = CASE
      WHEN p_payload ? 'encryptedTokens' THEN NULLIF(p_payload->>'encryptedTokens', '')
      ELSE encrypted_tokens
    END,
    scopes = CASE
      WHEN p_payload ? 'scopes' THEN NULLIF(p_payload->>'scopes', '')
      ELSE scopes
    END,
    status = COALESCE(NULLIF(p_payload->>'status', ''), status),
    error_message = CASE
      WHEN p_payload ? 'errorMessage' THEN NULLIF(p_payload->>'errorMessage', '')
      ELSE error_message
    END,
    config = CASE
      WHEN p_payload ? 'config' THEN COALESCE(p_payload->'config', config)
      ELSE config
    END,
    deleted_at = CASE
      WHEN (p_payload->>'deleted')::boolean IS TRUE THEN now()
      ELSE deleted_at
    END,
    updated_at = now()
  WHERE id = v_id
  RETURNING * INTO v_row;

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
REVOKE ALL ON FUNCTION sol_update_knowledge_connector(jsonb) FROM PUBLIC;
