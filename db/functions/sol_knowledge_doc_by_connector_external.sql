-- Live definition of sol_knowledge_doc_by_connector_external() (last changed in drizzle/0097_force_rls_remaining_pack.sql).
-- Edit here, then run `npm run db:functions:migrate` to write the migration.

CREATE OR REPLACE FUNCTION sol_knowledge_doc_by_connector_external(
  p_workspace_id uuid,
  p_connector_id uuid,
  p_external_id text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row knowledge_documents%ROWTYPE;
BEGIN
  IF p_workspace_id IS NULL OR p_connector_id IS NULL OR p_external_id IS NULL THEN
    RETURN NULL;
  END IF;
  PERFORM set_config('app.tenant_id', p_workspace_id::text, true);
  SELECT * INTO v_row
  FROM knowledge_documents
  WHERE workspace_id = p_workspace_id
    AND connector_id = p_connector_id
    AND external_id = p_external_id
    AND deleted_at IS NULL
  LIMIT 1;
  IF NOT FOUND THEN RETURN NULL; END IF;
  RETURN to_jsonb(v_row);
END;
$$;
REVOKE ALL ON FUNCTION sol_knowledge_doc_by_connector_external(uuid, uuid, text) FROM PUBLIC;
