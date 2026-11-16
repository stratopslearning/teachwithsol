-- Live definition of sol_supersede_knowledge_chunks() (last changed in drizzle/0072_knowledge_job_definers.sql).
-- Edit here, then run `npm run db:functions:migrate` to write the migration.

CREATE OR REPLACE FUNCTION sol_supersede_knowledge_chunks(p_document_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant uuid;
BEGIN
  SELECT COALESCE(tenant_id, workspace_id) INTO v_tenant
  FROM knowledge_documents WHERE id = p_document_id;
  IF v_tenant IS NOT NULL THEN
    PERFORM set_config('app.tenant_id', v_tenant::text, true);
  END IF;
  UPDATE knowledge_chunks
  SET superseded_at = now()
  WHERE document_id = p_document_id
    AND superseded_at IS NULL
    AND deleted_at IS NULL;
END;
$$;
REVOKE ALL ON FUNCTION sol_supersede_knowledge_chunks(uuid) FROM PUBLIC;
