-- Live definition of sol_list_knowledge_sync_runs() (last changed in drizzle/0097_force_rls_remaining_pack.sql).
-- Edit here, then run `npm run db:functions:migrate` to write the migration.

CREATE OR REPLACE FUNCTION sol_list_knowledge_sync_runs(
  p_connector_id uuid,
  p_limit integer
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant uuid;
BEGIN
  IF p_connector_id IS NULL THEN RETURN '[]'::jsonb; END IF;
  SELECT COALESCE(tenant_id, workspace_id) INTO v_tenant
  FROM knowledge_connectors WHERE id = p_connector_id;
  IF v_tenant IS NOT NULL THEN
    PERFORM set_config('app.tenant_id', v_tenant::text, true);
  END IF;
  RETURN COALESCE(
    (
      SELECT jsonb_agg(to_jsonb(r) ORDER BY r.started_at DESC)
      FROM (
        SELECT *
        FROM knowledge_sync_runs
        WHERE connector_id = p_connector_id
        ORDER BY started_at DESC
        LIMIT GREATEST(COALESCE(p_limit, 10), 1)
      ) r
    ),
    '[]'::jsonb
  );
END;
$$;
REVOKE ALL ON FUNCTION sol_list_knowledge_sync_runs(uuid, integer) FROM PUBLIC;
