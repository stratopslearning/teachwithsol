-- Live definition of sol_finish_knowledge_sync_run() (last changed in drizzle/0097_force_rls_remaining_pack.sql).
-- Edit here, then run `npm run db:functions:migrate` to write the migration.

CREATE OR REPLACE FUNCTION sol_finish_knowledge_sync_run(p_payload jsonb)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_run uuid := (p_payload->>'runId')::uuid;
  v_connector uuid := (p_payload->>'connectorId')::uuid;
  v_tenant uuid;
  v_status text := COALESCE(p_payload->>'status', 'succeeded');
  v_config jsonb;
BEGIN
  IF v_run IS NULL OR v_connector IS NULL THEN
    RAISE EXCEPTION 'runId and connectorId required';
  END IF;
  SELECT COALESCE(tenant_id, workspace_id), config
  INTO v_tenant, v_config
  FROM knowledge_connectors WHERE id = v_connector;
  IF v_tenant IS NOT NULL THEN
    PERFORM set_config('app.tenant_id', v_tenant::text, true);
  END IF;

  UPDATE knowledge_sync_runs SET
    status = v_status,
    finished_at = now(),
    created_count = COALESCE((p_payload->>'createdCount')::int, created_count),
    updated_count = COALESCE((p_payload->>'updatedCount')::int, updated_count),
    skipped_count = COALESCE((p_payload->>'skippedCount')::int, skipped_count),
    error_count = COALESCE((p_payload->>'errorCount')::int, error_count),
    error_message = CASE
      WHEN p_payload ? 'errorMessage' THEN NULLIF(p_payload->>'errorMessage', '')
      ELSE error_message
    END
  WHERE id = v_run;

  IF v_status = 'succeeded' THEN
    UPDATE knowledge_connectors SET
      status = 'connected',
      last_sync_at = now(),
      config = CASE
        WHEN p_payload ? 'config' THEN COALESCE(p_payload->'config', config)
        ELSE config
      END,
      error_message = NULL,
      updated_at = now()
    WHERE id = v_connector;
  ELSE
    UPDATE knowledge_connectors SET
      status = 'error',
      error_message = NULLIF(p_payload->>'errorMessage', ''),
      updated_at = now()
    WHERE id = v_connector;
  END IF;
END;
$$;
REVOKE ALL ON FUNCTION sol_finish_knowledge_sync_run(jsonb) FROM PUBLIC;
