-- Live definition of sol_reset_knowledge_document_pending() (last changed in drizzle/0072_knowledge_job_definers.sql).
-- Edit here, then run `npm run db:functions:migrate` to write the migration.

CREATE OR REPLACE FUNCTION sol_reset_knowledge_document_pending(
  p_document_id uuid,
  p_current_version_id uuid DEFAULT NULL
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
  UPDATE knowledge_documents SET
    current_version_id = COALESCE(p_current_version_id, current_version_id),
    status = 'PENDING',
    error_message = NULL,
    updated_at = now()
  WHERE id = p_document_id AND deleted_at IS NULL;
END;
$$;
REVOKE ALL ON FUNCTION sol_reset_knowledge_document_pending(uuid, uuid) FROM PUBLIC;
