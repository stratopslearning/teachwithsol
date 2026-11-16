-- Live definition of sol_start_knowledge_sync_run() (last changed in drizzle/0097_force_rls_remaining_pack.sql).
-- Edit here, then run `npm run db:functions:migrate` to write the migration.

CREATE OR REPLACE FUNCTION sol_start_knowledge_sync_run(p_payload jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_connector uuid := (p_payload->>'connectorId')::uuid;
  v_workspace uuid;
  v_tenant uuid;
  v_run knowledge_sync_runs%ROWTYPE;
BEGIN
  IF v_connector IS NULL THEN RAISE EXCEPTION 'connectorId required'; END IF;
  SELECT workspace_id, COALESCE(tenant_id, workspace_id)
  INTO v_workspace, v_tenant
  FROM knowledge_connectors
  WHERE id = v_connector AND deleted_at IS NULL;
  IF v_workspace IS NULL THEN RAISE EXCEPTION 'Connector not found'; END IF;
  PERFORM set_config('app.tenant_id', v_tenant::text, true);

  UPDATE knowledge_connectors
  SET status = 'syncing', error_message = NULL, updated_at = now()
  WHERE id = v_connector;

  INSERT INTO knowledge_sync_runs (
    connector_id, workspace_id, tenant_id, status
  ) VALUES (
    v_connector, v_workspace, v_tenant, 'running'
  )
  RETURNING * INTO v_run;
  RETURN to_jsonb(v_run);
END;
$$;
REVOKE ALL ON FUNCTION sol_start_knowledge_sync_run(jsonb) FROM PUBLIC;
