-- Live definition of sol_set_knowledge_document_status() (last changed in drizzle/0072_knowledge_job_definers.sql).
-- Edit here, then run `npm run db:functions:migrate` to write the migration.

CREATE OR REPLACE FUNCTION sol_set_knowledge_document_status(
  p_document_id uuid,
  p_status text,
  p_error text DEFAULT NULL
)
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
  UPDATE knowledge_documents
  SET status = p_status,
      error_message = NULLIF(p_error, ''),
      updated_at = now()
  WHERE id = p_document_id;
END;
$$;
REVOKE ALL ON FUNCTION sol_set_knowledge_document_status(uuid, text, text) FROM PUBLIC;
