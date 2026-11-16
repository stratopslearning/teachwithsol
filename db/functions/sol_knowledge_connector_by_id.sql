-- Live definition of sol_knowledge_connector_by_id() (last changed in drizzle/0097_force_rls_remaining_pack.sql).
-- Edit here, then run `npm run db:functions:migrate` to write the migration.

CREATE OR REPLACE FUNCTION sol_knowledge_connector_by_id(p_connector_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant uuid;
  v_row knowledge_connectors%ROWTYPE;
BEGIN
  IF p_connector_id IS NULL THEN RETURN NULL; END IF;
  SELECT COALESCE(tenant_id, workspace_id) INTO v_tenant
  FROM knowledge_connectors WHERE id = p_connector_id;
  IF v_tenant IS NOT NULL THEN
    PERFORM set_config('app.tenant_id', v_tenant::text, true);
  END IF;
  SELECT * INTO v_row FROM knowledge_connectors WHERE id = p_connector_id;
  IF NOT FOUND THEN RETURN NULL; END IF;
  RETURN to_jsonb(v_row);
END;
$$;
REVOKE ALL ON FUNCTION sol_knowledge_connector_by_id(uuid) FROM PUBLIC;
